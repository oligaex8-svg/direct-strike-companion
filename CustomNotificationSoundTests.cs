using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace DirectStrikeCompanion;

internal static class CustomNotificationSoundTests
{
    internal static void Run(Action<bool, string> assert)
    {
        Decoder(assert);
        Uploads(assert);
        StorageAndPlayback(assert);
        RedirectedStorage(assert);
    }

    private static short[] Samples(byte[] wav) => Enumerable.Range(0, (wav.Length - 44) / 2).Select(i => BitConverter.ToInt16(wav, 44 + i * 2)).ToArray();
    private static byte[] Fixture(int rate = 22050, int bits = 16, int channels = 1, double seconds = .10)
    {
        int count = (int)(rate * seconds), block = channels * bits / 8, length = count * block;
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.ASCII, true);
        writer.Write("RIFF"u8); writer.Write(36 + length); writer.Write("WAVEfmt "u8); writer.Write(16);
        writer.Write((short)1); writer.Write((short)channels); writer.Write(rate); writer.Write(rate * block);
        writer.Write((short)block); writer.Write((short)bits); writer.Write("data"u8); writer.Write(length);
        for (int i = 0; i < count; i++)
            for (int channel = 0; channel < channels; channel++)
                // Intentional abrupt full-scale edges exercise imported headroom/fades.
                if (bits == 8) writer.Write((byte)255);
                else writer.Write((short)(channel == 0 ? short.MaxValue : short.MaxValue / 2));
        if ((length & 1) != 0) { writer.Write((byte)0); stream.Position = 4; writer.Write((int)stream.Length - 8); }
        return stream.ToArray();
    }

    private static void Decoder(Action<bool, string> assert)
    {
        foreach (int rate in new[] { 8000, 11025, 22050, 44100, 48000, 96000 })
            foreach (int channels in new[] { 1, 2 })
                foreach (int bits in new[] { 8, 16 })
                {
                    var samples = CustomNotificationSounds.Decode(Fixture(rate, bits, channels));
                    assert(Math.Abs(samples.Length - NotificationSounds.SampleRate * .10) <= 1
                        && samples[0] == 0 && samples[^1] == 0 && samples.Max(s => Math.Abs((int)s)) is > 20000 and <= 26214,
                        $"WAV {rate} Hz {bits}-bit {channels}-channel normalizes to bounded mono PCM with edge fades and headroom");
                }
        var stereo = Fixture();
        var malformed = new List<byte[]> { Array.Empty<byte>(), stereo[..43], stereo[..^1], new byte[CustomNotificationSounds.MaximumBytes + 1], Fixture(seconds: 5.01), Fixture(rate: 1000), Fixture(bits: 24), Fixture(channels: 3) };
        void Change(int offset, byte value) { var item = (byte[])stereo.Clone(); item[offset] = value; malformed.Add(item); }
        Change(0, (byte)'X'); Change(8, (byte)'X'); Change(4, 0); Change(20, 3); Change(32, 9); Change(28, 0); Change(40, 255);
        foreach (var bytes in malformed)
        {
            bool rejected = false;
            try { CustomNotificationSounds.Decode(bytes); } catch (ArgumentException) { rejected = true; }
            assert(rejected, "malformed truncated unsupported oversized or long WAV is rejected");
        }
        var exact = CustomNotificationSounds.Decode(Fixture(seconds: 5));
        assert(exact.Length == 5 * NotificationSounds.SampleRate, "exactly five seconds is accepted within the fixed sample bound");
        var eight = Fixture(rate: 8000, bits: 8, seconds: .100125);
        assert(CustomNotificationSounds.Decode(eight).Length > 0, "odd-sized 8-bit PCM data with required RIFF padding is accepted");
    }

    private static void Uploads(Action<bool, string> assert)
    {
        var wav = Fixture();
        var context = new DefaultHttpContext();
        context.Request.ContentType = "audio/wav";
        context.Request.Body = new MemoryStream(wav);
        assert(CustomNotificationSounds.ReadUpload(context.Request).GetAwaiter().GetResult().SequenceEqual(wav), "raw WAV upload preserves validated source bytes before decoding");
        foreach (var (type, declared, bytes) in new[]
        {
            ("application/json", (long?)wav.Length, wav),
            ("audio/wav", (long?)(CustomNotificationSounds.MaximumBytes + 1), wav),
            ("audio/wav", (long?)null, new byte[CustomNotificationSounds.MaximumBytes + 1])
        })
        {
            context = new DefaultHttpContext(); context.Request.ContentType = type; context.Request.ContentLength = declared;
            context.Request.Body = new MemoryStream(bytes);
            bool rejected = false;
            try { CustomNotificationSounds.ReadUpload(context.Request).GetAwaiter().GetResult(); } catch (ArgumentException) { rejected = true; }
            assert(rejected, "wrong content type and both declared/chunked oversized uploads are bounded and rejected");
        }
        var legacy = JsonSerializer.Deserialize<SoundPreviewRequest>("{\"cue\":\"marked\",\"preset\":\"ready\",\"volume\":55}", Store.Json)!;
        var style = JsonSerializer.Deserialize<SoundPreviewRequest>("{\"cue\":\"marked\",\"preset\":\"ready\",\"volume\":55,\"builtIn\":true}", Store.Json)!;
        assert(!legacy.BuiltIn && style.BuiltIn && legacy.Validate() == GameSound.Marked && style.Validate() == GameSound.Marked, "legacy previews use the assigned cue and optional builtIn strictly enables style previews");
        foreach (string value in new[] { "null", "\"true\"", "1" })
        {
            bool rejected = false;
            try { JsonSerializer.Deserialize<SoundPreviewRequest>("{\"cue\":\"marked\",\"preset\":\"ready\",\"volume\":55,\"builtIn\":" + value + "}", Store.Json); } catch (JsonException) { rejected = true; }
            assert(rejected, "preview builtIn rejects non-boolean values: " + value);
        }
        var queue = new NotificationSoundQueue();
        for (int i = 0; i < 100; i++) queue.Enqueue(new(GameSound.Loaded, "ready", 55, Preview: true, BuiltIn: i == 99));
        assert(queue.Count == 1 && queue.Dequeue().BuiltIn, "preview coalescing preserves latest custom/style selection with fixed memory");
    }

    private static void StorageAndPlayback(Action<bool, string> assert)
    {
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeCustomSoundTests", Guid.NewGuid().ToString("N"));
        var store = new Store(path);
        string directory = Path.Combine(path, "notification-sounds");
        try
        {
            var sounds = new CustomNotificationSounds(path);
            assert(sounds.Snapshot().Count == 0, "new custom sound storage starts with built-in fallback for every cue");
            var original = sounds.Assign("accept", "My cue.wav", Fixture());
            var json = JsonSerializer.SerializeToNode(original, Store.Json)!;
            assert(original.Count == 1 && original["accept"].Name == "My cue.wav" && original["accept"].Seconds == .10
                && json["accept"]!.AsObject().Select(p => p.Key).Order().SequenceEqual(new[] { "name", "seconds" }),
                "custom API map exposes only assigned cue name and seconds without paths or audio");
            var before = sounds.Waveform(GameSound.Accept, 100)!;
            var half = Samples(sounds.Waveform(GameSound.Accept, 50)!);
            assert(Samples(before).Zip(half, (full, part) => Math.Abs(full / 2.0 - part)).All(delta => delta <= 1)
                && Samples(sounds.Waveform(GameSound.Accept, 0)!).All(s => s == 0), "custom playback applies current volume exactly and zero is silent");
            using var player = new NotificationSounds(sounds);
            assert(player.ResolveWaveform(new(GameSound.Accept, "terran", 100)).SequenceEqual(before)
                && player.ResolveWaveform(new(GameSound.Accept, "terran", 100, Preview: true)).SequenceEqual(before)
                && player.ResolveWaveform(new(GameSound.Accept, "terran", 100, Preview: true, BuiltIn: true)).SequenceEqual(NotificationSounds.Generate(GameSound.Accept, "terran", 100)),
                "events and legacy previews use the assigned clip while a style preview bypasses it");
            var restored = new CustomNotificationSounds(path);
            assert(restored.Waveform(GameSound.Accept, 100)!.SequenceEqual(before) && restored.Snapshot()["accept"] == original["accept"], "custom name duration and exact normalized samples survive restart without repeated fades");
            foreach (string name in new[] { "../sound.wav", "C:\\sound.wav", "sound/clip.wav", "CON.wav", "bad\n.wav", "bad.mp3", "", new string('a', 121) + ".wav" })
            {
                bool rejected = false;
                try { sounds.Assign("accept", name, Fixture()); } catch (ArgumentException) { rejected = true; }
                assert(rejected && sounds.Waveform(GameSound.Accept, 100)!.SequenceEqual(before), "unsafe or unsupported filename preserves former custom cue: " + name);
            }
            foreach (string cue in new[] { "../accept", "ACCEPT", "unknown" })
            {
                bool rejected = false;
                try { sounds.Assign(cue, "safe.wav", Fixture()); } catch (ArgumentException) { rejected = true; }
                assert(rejected && sounds.Snapshot().Count == 1, "invalid cue cannot write custom storage: " + cue);
            }
            bool invalidAudio = false;
            try { sounds.Assign("accept", "valid.wav", Fixture()[..^1]); } catch (ArgumentException) { invalidAudio = true; }
            assert(invalidAudio && sounds.Waveform(GameSound.Accept, 100)!.SequenceEqual(before), "invalid audio cannot replace the current clip");
            string manifest = Path.Combine(directory, "assignments.json");
            string durableBefore = File.ReadAllText(manifest);
            using (var blocked = new FileStream(manifest + ".tmp", FileMode.Create, FileAccess.ReadWrite, FileShare.None))
            {
                bool replaceFailed = false, removeFailed = false;
                try { sounds.Assign("accept", "replacement.wav", Fixture(seconds: .2)); } catch (IOException) { replaceFailed = true; }
                try { sounds.Remove("accept"); } catch (IOException) { removeFailed = true; }
                assert(replaceFailed && removeFailed && File.ReadAllText(manifest) == durableBefore && sounds.Waveform(GameSound.Accept, 100)!.SequenceEqual(before),
                    "manifest save failures preserve former clip metadata and durable assignment for replacement and removal");
            }
            sounds.Assign("accept", "Replacement.wav", Fixture(rate: 48000, bits: 8, channels: 2, seconds: .2));
            assert(sounds.Snapshot()["accept"].Name == "Replacement.wav" && sounds.Snapshot()["accept"].Seconds == .2 && Directory.GetFiles(directory, "*.wav").Length == 1,
                "successful atomic replacement updates metadata and removes the former stored clip");
            foreach (string cue in new[] { "loading", "loaded", "marked" }) sounds.Assign(cue, cue + ".wav", Fixture(seconds: 5));
            assert(sounds.Snapshot().Count == 4 && Directory.GetFiles(directory, "*.wav").Length == 4 && sounds.LoadedSamples <= 4 * 5 * NotificationSounds.SampleRate,
                "one custom assignment per event bounds active clips and PCM memory");
            for (int volume = 0; volume <= 100; volume++) player.ResolveWaveform(new(GameSound.Marked, "warp", volume, Preview: true, BuiltIn: true));
            assert(player.CachedWaveforms == NotificationSounds.CacheLimit, "style waveform cache stays bounded across custom clips and repeated previews");
            string libraryBefore = JsonSerializer.Serialize(store.Data, Store.Json);
            new LobbyPreferencesRequest(false, true, true, false, "", true, "ready", 40).Apply(store);
            assert(new CustomNotificationSounds(path).Snapshot().Count == 4 && !File.ReadAllText(Path.Combine(path, "library.json")).Contains("Replacement.wav", StringComparison.Ordinal)
                && !libraryBefore.Contains("base64", StringComparison.Ordinal), "settings persistence leaves custom service assignments intact and never embeds private audio in the library");
            assert(UiText.SoundDescription("en", "warp", 70, true, "cue.wav") == "Custom WAV: cue.wav · volume 70%"
                && UiText.SoundDescription("en", "warp", 0, true, "cue.wav") == "Silent · volume 0%"
                && UiText.SoundDescription("en", "warp", 70, false, "cue.wav") == "Sound is off", "native custom description retains sound-enabled and silent-volume semantics");
            sounds.Remove("marked");
            assert(sounds.Snapshot().Count == 3 && player.ResolveWaveform(new(GameSound.Marked, "warp", 100)).SequenceEqual(NotificationSounds.Generate(GameSound.Marked, "warp", 100))
                && new CustomNotificationSounds(path).Snapshot().Count == 3, "removal persists and immediately resumes built-in event playback");
            foreach (string file in Directory.GetFiles(directory, "accept-*.wav")) File.Delete(file);
            assert(!sounds.Snapshot().ContainsKey("accept") && sounds.Waveform(GameSound.Accept, 100) == null
                && !new CustomNotificationSounds(path).Snapshot().ContainsKey("accept"), "missing custom clip falls back live and after restart without exposing a stale assignment");
            var hostile = JsonNode.Parse(File.ReadAllText(manifest))!;
            hostile["loaded"]!["file"] = "../outside.wav";
            File.WriteAllText(manifest, hostile.ToJsonString(Store.Json));
            assert(!new CustomNotificationSounds(path).Snapshot().ContainsKey("loaded"), "pathlike persisted metadata is rejected before file access");
        }
        finally { Directory.Delete(path, true); }
    }

    private static void RedirectedStorage(Action<bool, string> assert)
    {
        // Windows directory junctions need no symlink privilege. Exercise actual
        // reparse attributes rather than simulating the validator's implementation.
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeCustomRedirectTests", Guid.NewGuid().ToString("N"));
        string target = Path.Combine(path, "target"), data = Path.Combine(path, "data");
        Directory.CreateDirectory(target); Directory.CreateDirectory(data);
        string rootLink = Path.Combine(data, "notification-sounds");
        void Junction(string link)
        {
            var start = new ProcessStartInfo("cmd.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string argument in new[] { "/c", "mklink", "/J", link, target }) start.ArgumentList.Add(argument);
            using var process = Process.Start(start)!;
            process.WaitForExit();
            assert(process.ExitCode == 0, "redirected storage fixture creates a Windows junction");
        }
        try
        {
            Junction(rootLink);
            bool rootRejected = false;
            try { _ = new CustomNotificationSounds(data); } catch (ArgumentException) { rootRejected = true; }
            assert(rootRejected && Directory.GetFileSystemEntries(target).Length == 0, "redirected custom storage root is rejected without writing through it");
            Directory.Delete(rootLink);
            var sounds = new CustomNotificationSounds(data);
            var original = sounds.Assign("marked", "Safe.wav", Fixture());
            string childLink = Path.Combine(rootLink, "redirect");
            Junction(childLink);
            bool childRejected = false;
            try { sounds.Assign("marked", "New.wav", Fixture(seconds: .2)); } catch (ArgumentException) { childRejected = true; }
            assert(childRejected && sounds.Waveform(GameSound.Marked, 100) == null && Directory.GetFileSystemEntries(target).Length == 0,
                "redirected custom child blocks imports and causes safe built-in playback fallback");
            Directory.Delete(childLink);
            assert(sounds.Snapshot()["marked"] == original["marked"], "rejecting a redirected child preserves the prior durable assignment");
        }
        finally
        {
            if (Directory.Exists(rootLink) && (File.GetAttributes(rootLink) & FileAttributes.ReparsePoint) != 0) Directory.Delete(rootLink);
            string childLink = Path.Combine(rootLink, "redirect");
            if (Directory.Exists(childLink)) Directory.Delete(childLink);
            Directory.Delete(path, true);
        }
    }
}
