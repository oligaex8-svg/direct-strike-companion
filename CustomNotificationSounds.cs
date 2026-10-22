using System.Buffers.Binary;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

// Metadata and local filenames belong to this service, never the writable
// Settings payload. The public projection contains only the user's display name
// and duration. Uploaded bytes are never serialized into the replay library.
internal sealed class CustomNotificationSounds
{
    internal const int MaximumBytes = 2 * 1024 * 1024, MaximumSeconds = 5;
    private readonly object gate = new();
    private readonly string directory;
    private readonly Dictionary<string, Clip> clips = [];
    private sealed record Clip(StoredSound Assignment, short[] Samples);
    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    private sealed record StoredSound(string File, string Name, double Seconds);

    internal CustomNotificationSounds(string dataDirectory)
    {
        directory = Path.Combine(Path.GetFullPath(dataDirectory), "notification-sounds");
        CheckStorage();
        Directory.CreateDirectory(directory);
        string manifest = Child("assignments.json");
        if (!File.Exists(manifest)) return;
        try
        {
            if (new FileInfo(manifest).Length > 4096) return;
            var saved = JsonSerializer.Deserialize<Dictionary<string, StoredSound>>(File.ReadAllBytes(manifest), Store.Json);
            if (saved == null || saved.Count > 4) return;
            foreach (var (cue, assignment) in saved)
            {
                try
                {
                    ValidateCue(cue);
                    if (assignment == null || !Regex.IsMatch(assignment.File ?? "", "^" + cue + "-[a-f0-9]{32}\\.wav$")) continue;
                    ValidateName(assignment.Name);
                    if (!double.IsFinite(assignment.Seconds) || assignment.Seconds <= 0 || assignment.Seconds > MaximumSeconds) continue;
                    string file = Child(assignment.File);
                    if (!File.Exists(file) || new FileInfo(file).Length > MaximumBytes) continue;
                    var samples = Decode(File.ReadAllBytes(file), normalize: false);
                    double seconds = (double)samples.Length / NotificationSounds.SampleRate;
                    if (Math.Abs(seconds - assignment.Seconds) > 1.0 / NotificationSounds.SampleRate) continue;
                    clips.Add(cue, new(assignment, samples));
                }
                catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException) { }
            }
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException) { }
    }

    internal static GameSound ValidateCue(string? cue) => cue switch
    {
        "accept" => GameSound.Accept, "loading" => GameSound.Loading,
        "loaded" => GameSound.Loaded, "marked" => GameSound.Marked,
        _ => throw new ArgumentException("Choose accept, loading, loaded or marked.")
    };
    private static string CueName(GameSound cue) => cue switch
    {
        GameSound.Accept => "accept", GameSound.Loading => "loading",
        GameSound.Loaded => "loaded", GameSound.Marked => "marked",
        _ => throw new ArgumentOutOfRangeException(nameof(cue))
    };

    internal static void ValidateName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 120 || name != name.Trim()
            || !name.EndsWith(".wav", StringComparison.OrdinalIgnoreCase)
            || name.Any(c => char.IsControl(c) || "<>:\"/\\|?*".Contains(c))
            || name.StartsWith('.') || name.EndsWith('.') || name.Contains("..", StringComparison.Ordinal)
            || Regex.IsMatch(name, "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)", RegexOptions.IgnoreCase))
            throw new ArgumentException("Choose a plain WAV filename of up to 120 characters.");
    }

    internal Dictionary<string, CustomSoundMetadata> Snapshot()
    {
        lock (gate)
        {
            CheckStorage();
            return clips.Where(pair => File.Exists(Child(pair.Value.Assignment.File)))
                .ToDictionary(pair => pair.Key, pair => new CustomSoundMetadata(pair.Value.Assignment.Name, pair.Value.Assignment.Seconds));
        }
    }

    internal Dictionary<string, CustomSoundMetadata> Assign(string cue, string name, byte[] wav)
    {
        ValidateCue(cue); ValidateName(name);
        var samples = Decode(wav); // Invalid imports cannot touch a former assignment.
        lock (gate)
        {
            CheckStorage();
            string filename = cue + "-" + Guid.NewGuid().ToString("N") + ".wav";
            string path = Child(filename), temp = Child(filename + ".tmp");
            var replacement = new Clip(new(filename, name, (double)samples.Length / NotificationSounds.SampleRate), samples);
            var next = new Dictionary<string, Clip>(clips) { [cue] = replacement };
            try
            {
                WriteDurable(temp, NotificationSounds.Encode(samples));
                File.Move(temp, path);
                SaveManifest(next); // Commit manifest first; memory only changes after success.
            }
            catch
            {
                TryDelete(temp); TryDelete(path);
                throw;
            }
            clips[cue] = replacement;
            CleanupUnused();
            return Snapshot();
        }
    }

    internal Dictionary<string, CustomSoundMetadata> Remove(string cue)
    {
        ValidateCue(cue);
        lock (gate)
        {
            CheckStorage();
            if (!clips.ContainsKey(cue)) return Snapshot();
            var next = new Dictionary<string, Clip>(clips); next.Remove(cue);
            SaveManifest(next);
            clips.Remove(cue);
            CleanupUnused();
            return Snapshot();
        }
    }

    internal short[]? Samples(GameSound cue)
    {
        lock (gate)
        {
            try
            {
                CheckStorage();
                if (!clips.TryGetValue(CueName(cue), out var clip) || !File.Exists(Child(clip.Assignment.File))) return null;
                return clip.Samples;
            }
            catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException) { return null; }
        }
    }

    internal byte[]? Waveform(GameSound cue, int volume)
    {
        if (volume is < 0 or > 100) throw new ArgumentException("Sound volume must be from 0 to 100.");
        var samples = Samples(cue);
        return samples == null ? null : NotificationSounds.Encode(samples.Select(s => (short)Math.Round(s * volume / 100.0)).ToArray());
    }
    internal int LoadedSamples { get { lock (gate) return clips.Values.Sum(c => c.Samples.Length); } }

    private void SaveManifest(Dictionary<string, Clip> next)
    {
        string path = Child("assignments.json"), temp = Child("assignments.json.tmp");
        try
        {
            WriteDurable(temp, JsonSerializer.SerializeToUtf8Bytes(next.ToDictionary(p => p.Key, p => p.Value.Assignment), Store.Json), overwrite: true);
            File.Move(temp, path, true);
        }
        finally { TryDelete(temp); }
    }
    private static void WriteDurable(string path, byte[] bytes, bool overwrite = false)
    {
        using var stream = new FileStream(path, overwrite ? FileMode.Create : FileMode.CreateNew, FileAccess.Write, FileShare.None);
        stream.Write(bytes); stream.Flush(true);
    }
    private void CheckStorage()
    {
        RejectRedirect(directory);
        if (Directory.Exists(directory))
            foreach (string child in Directory.EnumerateFileSystemEntries(directory)) RejectRedirect(child);
    }
    private static void RejectRedirect(string path)
    {
        // GetAttributes also detects dangling links, unlike File.Exists.
        try
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new ArgumentException("Custom sound storage cannot contain redirected files or folders.");
        }
        catch (FileNotFoundException) { }
        catch (DirectoryNotFoundException) { }
    }
    private string Child(string filename)
    {
        if (Path.GetFileName(filename) != filename || filename.Contains('/') || filename.Contains('\\')) throw new ArgumentException("Invalid local sound filename.");
        string path = Path.Combine(directory, filename);
        RejectRedirect(directory); RejectRedirect(path);
        return path;
    }
    private void TryDelete(string path)
    {
        try { RejectRedirect(directory); RejectRedirect(path); File.Delete(path); }
        catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException) { }
    }
    private void CleanupUnused()
    {
        // Only generated direct-child files are eligible; unrelated user files survive.
        try
        {
            foreach (string path in Directory.EnumerateFiles(directory))
                if (Regex.IsMatch(Path.GetFileName(path), "^(accept|loading|loaded|marked)-[a-f0-9]{32}\\.wav(?:\\.tmp)?$")
                    && !clips.Values.Any(c => c.Assignment.File == Path.GetFileName(path))) TryDelete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    internal static async Task<byte[]> ReadUpload(HttpRequest request)
    {
        if (!string.Equals(request.ContentType?.Split(';')[0].Trim(), "audio/wav", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Upload a WAV with Content-Type audio/wav.");
        if (request.ContentLength > MaximumBytes) throw new ArgumentException("WAV clips must be at most 2 MiB.");
        using var result = new MemoryStream();
        var buffer = new byte[16384];
        while (true)
        {
            int read = await request.Body.ReadAsync(buffer.AsMemory(0, Math.Min(buffer.Length, MaximumBytes + 1 - (int)result.Length)), request.HttpContext.RequestAborted);
            if (read == 0) return result.ToArray();
            result.Write(buffer, 0, read);
            if (result.Length > MaximumBytes) throw new ArgumentException("WAV clips must be at most 2 MiB.");
        }
    }

    internal static short[] Decode(byte[] bytes, bool normalize = true)
    {
        static ArgumentException Invalid() => new("Use a complete PCM WAV: 8/16-bit mono/stereo, 8–96 kHz, up to 5 seconds and 2 MiB.");
        if (bytes.Length is < 44 or > MaximumBytes) throw Invalid();
        var data = bytes.AsSpan();
        uint U32(int at) => BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(at, 4));
        ushort U16(int at) => BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(at, 2));
        if (!data[..4].SequenceEqual("RIFF"u8) || !data.Slice(8, 4).SequenceEqual("WAVE"u8) || U32(4) != bytes.Length - 8) throw Invalid();
        int format = -1, audio = -1, length = 0;
        for (int at = 12; at < bytes.Length;)
        {
            if (bytes.Length - at < 8) throw Invalid();
            uint size = U32(at + 4);
            long end = (long)at + 8 + size, padded = end + (size & 1);
            if (padded > bytes.Length) throw Invalid();
            if (data.Slice(at, 4).SequenceEqual("fmt "u8))
            {
                if (format >= 0 || (size != 16 && size != 18) || (size == 18 && U16(at + 24) != 0)) throw Invalid();
                format = at + 8;
            }
            if (data.Slice(at, 4).SequenceEqual("data"u8))
            {
                if (audio >= 0 || size > int.MaxValue) throw Invalid();
                audio = at + 8; length = (int)size;
            }
            at = (int)padded;
        }
        if (format < 0 || audio < 0 || U16(format) != 1) throw Invalid();
        int channels = U16(format + 2), bits = U16(format + 14);
        uint rate = U32(format + 4);
        int block = channels * (bits / 8);
        if (channels is not (1 or 2) || bits is not (8 or 16) || rate is < 8000 or > 96000
            || U16(format + 12) != block || U32(format + 8) != rate * block || length == 0 || length % block != 0) throw Invalid();
        int frames = length / block;
        if (frames > (long)rate * MaximumSeconds) throw Invalid();
        if (!normalize)
        {
            if (channels != 1 || bits != 16 || rate != NotificationSounds.SampleRate) throw Invalid();
            var restored = new short[frames];
            for (int i = 0; i < frames; i++) restored[i] = BinaryPrimitives.ReadInt16LittleEndian(data.Slice(audio + i * 2, 2));
            if (restored[0] != 0 || restored[^1] != 0 || restored.Any(s => Math.Abs((int)s) > 26214)) throw Invalid();
            return restored;
        }
        var mono = new double[frames];
        double peak = 0;
        for (int frame = 0; frame < frames; frame++)
        {
            double value = 0;
            for (int channel = 0; channel < channels; channel++)
            {
                int at = audio + frame * block + channel * bits / 8;
                value += bits == 8 ? (bytes[at] - 128) / 128.0 : BinaryPrimitives.ReadInt16LittleEndian(data.Slice(at, 2)) / 32768.0;
            }
            mono[frame] = value / channels; peak = Math.Max(peak, Math.Abs(mono[frame]));
        }
        int count = Math.Max(1, (int)Math.Round((double)frames * NotificationSounds.SampleRate / rate));
        var samples = new short[count];
        double headroom = peak > .8 ? .8 / peak : 1;
        int fade = Math.Min(count / 2, NotificationSounds.SampleRate / 100);
        for (int i = 0; i < count; i++)
        {
            double position = (double)i * rate / NotificationSounds.SampleRate;
            int left = Math.Min((int)position, frames - 1), right = Math.Min(left + 1, frames - 1);
            double sample = mono[left] + (mono[right] - mono[left]) * (position - left);
            double envelope = fade == 0 ? 0 : Math.Min(1, Math.Min((double)i / fade, (double)(count - 1 - i) / fade));
            samples[i] = (short)Math.Round(sample * headroom * envelope * short.MaxValue);
        }
        return samples;
    }
}
