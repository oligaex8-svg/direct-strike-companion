using System.Media;
using System.Text;
using System.Text.Json.Serialization;

namespace DirectStrikeCompanion;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LobbyPreferencesRequest(
    [property: JsonRequired] bool Loading,
    [property: JsonRequired] bool Loaded,
    [property: JsonRequired] bool Accept,
    [property: JsonRequired] bool AutoAcceptMatch,
    [property: JsonRequired] string AutoPickCommander,
    [property: JsonRequired] bool Sound,
    [property: JsonRequired] string Preset,
    [property: JsonRequired, JsonNumberHandling(JsonNumberHandling.Strict)] int Volume,
    Dictionary<string, string>? Styles = null)
{
    public static LobbyPreferencesRequest FromSettings(Settings settings) => new(
        settings.PingOnGameLoading, settings.PingOnGameLoaded, settings.PingOnMatchAccept,
        settings.AutoAcceptMatch, settings.AutoPickCommander, settings.Sound,
        settings.NotificationSoundPreset, settings.NotificationSoundVolume,
        new(settings.NotificationSoundStyles ?? new(), StringComparer.Ordinal));

    internal void Validate()
    {
        Sc2Automation.ValidateSettings(new() { AutoPickCommander = AutoPickCommander });
        NotificationSounds.Validate(Preset, Volume);
        NotificationSounds.ValidateStyles(Styles);
    }

    internal LobbyPreferencesRequest Apply(Store store)
    {
        Validate(); // Reject the whole patch before touching any stored field.
        lock (store.Gate)
        {
            var settings = store.Data.Settings;
            var previous = FromSettings(settings);
            WriteTo(settings);
            try { store.Save(); }
            catch { previous.WriteTo(settings); throw; }
            return FromSettings(settings);
        }
    }

    private void WriteTo(Settings settings)
    {
        settings.PingOnGameLoading = Loading;
        settings.PingOnGameLoaded = Loaded;
        settings.PingOnMatchAccept = Accept;
        settings.AutoAcceptMatch = AutoAcceptMatch;
        settings.AutoPickCommander = AutoPickCommander;
        settings.Sound = Sound;
        settings.NotificationSoundPreset = Preset;
        settings.NotificationSoundVolume = Volume;
        if (Styles is not null) settings.NotificationSoundStyles = new(Styles, StringComparer.Ordinal);
    }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SoundPreviewRequest(
    [property: JsonRequired] string Cue,
    [property: JsonRequired] string Preset,
    [property: JsonRequired, JsonNumberHandling(JsonNumberHandling.Strict)] int Volume,
    bool BuiltIn = false)
{
    internal GameSound Validate()
    {
        NotificationSounds.Validate(Preset, Volume);
        return CustomNotificationSounds.ValidateCue(Cue);
    }
}

// Bundled SC2 voice clips and original PCM chimes need no external audio runtime.
// One serial worker owns each player/stream until PlaySync completes. Both the
// waiting queue and waveform cache are bounded, including repeated previews.
internal sealed record NotificationPlaybackSnapshot(string Status, string? Cue, string? Preset, DateTime? At, int Queued);
internal sealed class NotificationSounds : IDisposable
{
    internal const int SampleRate = 22050, CacheLimit = 16, QueueLimit = 4;
    private readonly object gate = new();
    private readonly NotificationSoundQueue waiting = new();
    private readonly Dictionary<(GameSound Cue, string Preset, int Volume), byte[]> cache = new();
    private readonly Queue<(GameSound Cue, string Preset, int Volume)> cacheOrder = new();
    private readonly CustomNotificationSounds? custom;
    private SoundPlayer? current;
    private bool running, disposed;
    private string playbackStatus = "No notification sound requested";
    private string? playbackCue, playbackPreset;
    private DateTime? playbackAt;
    internal NotificationPlaybackSnapshot Snapshot() { lock (gate) return new(playbackStatus, playbackCue, playbackPreset, playbackAt, waiting.Count); }

    internal NotificationSounds(CustomNotificationSounds? custom = null) => this.custom = custom;
    // Retain legacy keys for stored settings and older clients; visible menus
    // and event selection use only the catalog's actual game recordings.
    internal static readonly string[] Presets = ["soft", "clear", "classic", "terran", "protoss", "zerg", "orbital", "warp", "ready", .. Sc2SoundClips.Labels.Keys];

    internal static void Validate(string preset, int volume)
    {
        if (!Presets.Contains(preset, StringComparer.Ordinal)) throw new ArgumentException("Choose a supported notification sound style.");
        if (volume is < 0 or > 100) throw new ArgumentException("Sound volume must be from 0 to 100.");
    }

    internal static void ValidateStyles(IReadOnlyDictionary<string, string>? styles)
    {
        if (styles is null) return;
        if (styles.Count > 4) throw new ArgumentException("Choose sounds for the four notification events.");
        foreach (var (cue, preset) in styles)
        {
            CustomNotificationSounds.ValidateCue(cue);
            if (!Sc2SoundClips.Contains(preset)) throw new ArgumentException("Choose a StarCraft game recording for each alert.");
        }
    }

    // General settings forms can outlive a newer save on the Sounds page.
    // Call under Store.Gate so their replacement keeps the current audio state.
    internal static void PreservePreferences(Settings current, Settings replacement)
    {
        replacement.PingOnGameLoading = current.PingOnGameLoading;
        replacement.PingOnGameLoaded = current.PingOnGameLoaded;
        replacement.PingOnMatchAccept = current.PingOnMatchAccept;
        replacement.Sound = current.Sound;
        replacement.NotificationSoundPreset = current.NotificationSoundPreset;
        replacement.NotificationSoundVolume = current.NotificationSoundVolume;
        replacement.NotificationSoundStyles = new(current.NotificationSoundStyles ?? new(), StringComparer.Ordinal);
    }

    internal static string SelectedPreset(Settings settings, GameSound cue)
    {
        var key = cue switch { GameSound.Accept => "accept", GameSound.Loading => "loading", GameSound.Loaded => "loaded", GameSound.Marked => "marked", _ => throw new ArgumentOutOfRangeException(nameof(cue)) };
        if (settings.NotificationSoundStyles?.TryGetValue(key, out var selected) == true && Sc2SoundClips.Contains(selected)) return selected;
        return Sc2SoundClips.Contains(settings.NotificationSoundPreset) ? settings.NotificationSoundPreset : "sc2-nuclear";
    }

    internal void Play(GameSound cue, string preset, int volume, bool preview = false, bool builtIn = false)
    {
        Validate(preset, volume);
        if (volume == 0) return;
        lock (gate)
        {
            if (disposed || !waiting.Enqueue(new(cue, preset, volume, preview, builtIn))) return;
            playbackStatus = "Queued"; playbackCue = cue.ToString(); playbackPreset = preset; playbackAt = DateTime.UtcNow;
            if (running) return;
            running = true;
            _ = Task.Run(Drain);
        }
    }

    private void Drain()
    {
        while (true)
        {
            SoundPlayer? player = null;
            QueuedNotificationSound next;
            lock (gate)
            {
                if (disposed || waiting.Count == 0) { running = false; return; }
                next = waiting.Dequeue();
            }
            try
            {
                var wav = ResolveWaveform(next);
                lock (gate)
                {
                    if (disposed) { running = false; return; }
                    current = player = new SoundPlayer(new MemoryStream(wav, false));
                    playbackStatus = "Playing"; playbackCue = next.Cue.ToString(); playbackPreset = next.Preset; playbackAt = DateTime.UtcNow;
                }
                player.PlaySync();
                lock (gate) { playbackStatus = "Playback completed"; playbackCue = next.Cue.ToString(); playbackPreset = next.Preset; playbackAt = DateTime.UtcNow; }
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or System.ComponentModel.Win32Exception or ArgumentException)
            { lock (gate) { playbackStatus = "Playback failed: " + ex.Message; playbackCue = next.Cue.ToString(); playbackPreset = next.Preset; playbackAt = DateTime.UtcNow; } }
            finally
            {
                lock (gate)
                {
                    player?.Stream?.Dispose();
                    player?.Dispose();
                    current = null;
                }
            }
        }
    }

    // Pure resolution also lets tests cover the exact preview/event playback path.
    internal byte[] ResolveWaveform(QueuedNotificationSound next)
    {
        Validate(next.Preset, next.Volume);
        lock (gate)
        {
            if (!next.BuiltIn && custom?.Waveform(next.Cue, next.Volume) is { } clip) return clip;
            var key = (next.Cue, next.Preset, next.Volume);
            if (!cache.TryGetValue(key, out var wav))
            {
                wav = Generate(key.Cue, key.Preset, key.Volume);
                if (cache.Count >= CacheLimit) cache.Remove(cacheOrder.Dequeue());
                cache.Add(key, wav); cacheOrder.Enqueue(key);
            }
            return wav;
        }
    }
    internal int CachedWaveforms { get { lock (gate) return cache.Count; } }

    internal static byte[] Generate(GameSound cue, string preset, int volume)
    {
        Validate(preset, volume);
        if (Sc2SoundClips.Contains(preset)) return Sc2SoundClips.Waveform(preset, volume);
        if (preset is not ("soft" or "clear" or "classic")) return GenerateInspired(cue, preset, volume);
        double[] notes = cue switch
        {
            GameSound.Accept => [523.25, 659.25, 783.99],
            GameSound.Loading => [392, 523.25],
            GameSound.Loaded => [659.25, 783.99, 1046.5],
            GameSound.Marked => [587.33, 440],
            _ => throw new ArgumentOutOfRangeException(nameof(cue))
        };
        double shift = preset == "soft" ? .75 : preset == "clear" ? 1.15 : 1;
        double step = preset == "classic" ? .12 : .105;
        const double noteLength = .31;
        int count = (int)Math.Ceiling(((notes.Length - 1) * step + noteLength) * SampleRate);
        var samples = new double[count];
        for (int note = 0; note < notes.Length; note++)
        {
            int offset = (int)(note * step * SampleRate);
            int length = (int)(noteLength * SampleRate);
            for (int i = 0; i < length && offset + i < count; i++)
            {
                double t = (double)i / SampleRate;
                double envelope = Math.Min(1, t / .018) * Math.Min(1, (noteLength - t) / .055) * Math.Exp(-t * 9);
                double phase = 2 * Math.PI * notes[note] * shift * t;
                double harmonic = preset == "soft" ? .08 : preset == "clear" ? .22 : .13;
                samples[offset + i] += .22 * volume / 100.0 * envelope * (Math.Sin(phase) + harmonic * Math.Sin(phase * 2));
            }
        }
        return Encode(samples.Select(sample => (short)Math.Round(Math.Clamp(sample, -1, 1) * short.MaxValue)).ToArray());
    }

    // Six original timbres: filtered comms, glassy harmonics, organic pulses,
    // alternating telemetry, swept arrival and a firm two-harmonic fanfare.
    // These are synthesized here; no game recordings or melodies are used.
    private static byte[] GenerateInspired(GameSound cue, string preset, int volume)
    {
        double[] notes = cue switch
        {
            GameSound.Accept => [520, 710, 920], GameSound.Loading => [340, 520],
            GameSound.Loaded => [710, 920, 1190], GameSound.Marked => [610, 390],
            _ => throw new ArgumentOutOfRangeException(nameof(cue))
        };
        const double duration = .30, step = .11;
        var samples = new short[(int)Math.Ceiling((duration + (notes.Length - 1) * step) * SampleRate)];
        var mixed = new double[samples.Length];
        for (int note = 0; note < notes.Length; note++)
        {
            int offset = (int)(note * step * SampleRate), length = (int)(duration * SampleRate);
            for (int i = 0; i < length && offset + i < mixed.Length; i++)
            {
                double t = (double)i / SampleRate, p = 2 * Math.PI * notes[note] * t;
                double envelope = Math.Min(1, t / .020) * Math.Min(1, (duration - t) / .06) * Math.Exp(-t * 11);
                double tone = preset switch
                {
                    "terran" => (Math.Sin(p * .82) + .24 * Math.Sin(p * 2.46)) * (.75 + .25 * Math.Cos(t * 2 * Math.PI * 24)),
                    "protoss" => Math.Sin(p * 1.35) + .30 * Math.Sin(p * 3.0375) + .10 * Math.Sin(p * 5.13),
                    "zerg" => Math.Sin(p * .52 + 2.2 * Math.Sin(p * .13)) * (.65 + .35 * Math.Cos(t * 2 * Math.PI * 13)),
                    "orbital" => Math.Sin(p * (note % 2 == 0 ? 1.65 : 1.1)) + .18 * Math.Sin(p * 3.3),
                    "warp" => Math.Sin(p * .9 + 2 * Math.PI * 700 * t * t) + .24 * Math.Sin(p * 1.8 + 2 * Math.PI * 350 * t * t),
                    "ready" => Math.Sin(p * .95) + .32 * Math.Sin(p * 1.9) + .14 * Math.Sin(p * 2.85),
                    _ => throw new ArgumentException("Choose a supported notification sound style.")
                };
                mixed[offset + i] += .19 * volume / 100.0 * envelope * tone;
            }
        }
        for (int i = 0; i < samples.Length; i++) samples[i] = (short)Math.Round(Math.Clamp(mixed[i], -.8, .8) * short.MaxValue);
        return Encode(samples);
    }

    internal static byte[] Encode(short[] samples)
    {
        int count = samples.Length;
        using var stream = new MemoryStream(44 + count * 2);
        using var writer = new BinaryWriter(stream, Encoding.ASCII, true);
        writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + count * 2);
        writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
        writer.Write((short)1); writer.Write((short)1); writer.Write(SampleRate); writer.Write(SampleRate * 2);
        writer.Write((short)2); writer.Write((short)16); writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(count * 2);
        foreach (var sample in samples) writer.Write(sample);
        return stream.ToArray();
    }

    public void Dispose()
    {
        lock (gate)
        {
            disposed = true;
            waiting.Clear();
            cache.Clear(); cacheOrder.Clear();
            current?.Stop();
        }
    }
}

internal sealed record QueuedNotificationSound(GameSound Cue, string Preset, int Volume, bool Preview = false, bool BuiltIn = false)
{
    internal int Priority => Preview ? 0 : Cue == GameSound.Accept ? 3 : Cue == GameSound.Marked ? 1 : 2;
}

// Pure queue policy: previews coalesce to the latest choice, while genuine
// accept events evict lower-priority sounds and play before them. No playback
// is needed to verify admission, ordering or the fixed memory bound.
internal sealed class NotificationSoundQueue
{
    private readonly List<QueuedNotificationSound> pending = [];
    internal int Count => pending.Count;
    internal bool Enqueue(QueuedNotificationSound sound)
    {
        if (sound.Preview) pending.RemoveAll(p => p.Preview);
        if (pending.Count >= NotificationSounds.QueueLimit)
        {
            if (pending[^1].Priority >= sound.Priority) return false;
            pending.RemoveAt(pending.Count - 1);
        }
        int before = pending.FindIndex(p => p.Priority < sound.Priority);
        pending.Insert(before < 0 ? pending.Count : before, sound);
        return true;
    }
    internal QueuedNotificationSound Dequeue()
    {
        var first = pending[0];
        pending.RemoveAt(0);
        return first;
    }
    internal void Clear() => pending.Clear();
}
