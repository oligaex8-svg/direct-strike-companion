using System.Text.Json;

namespace DirectStrikeCompanion;

// Fixed, bounded SC1/SC2 recordings, selected independently for each alert.
// A locally assigned per-event WAV still takes precedence.
internal static class Sc2SoundClips
{
    internal sealed record Definition(string Preset, string En, string Ru, string Category, string Sha256, string Language = "en");
    internal static readonly IReadOnlyDictionary<string, Definition> Catalog = LoadCatalog();
    internal static readonly IReadOnlyDictionary<string, (string En, string Ru)> Labels =
        Catalog.ToDictionary(pair => pair.Key, pair => (pair.Value.En, pair.Value.Ru), StringComparer.Ordinal);
    // Decode only the selected recording, not the entire enlarged library.
    private static readonly IReadOnlyDictionary<string, Lazy<short[]>> Samples =
        Labels.Keys.ToDictionary(key => key, key => new Lazy<short[]>(() => CustomNotificationSounds.Decode(Resource(key))), StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, Definition> LoadCatalog()
    {
        using var source = typeof(Sc2SoundClips).Assembly.GetManifestResourceStream("DscSoundCatalog")
            ?? throw new InvalidOperationException("Bundled StarCraft sound catalog is unavailable.");
        using var document = JsonDocument.Parse(source);
        var sounds = document.RootElement.GetProperty("sounds").Deserialize<Definition[]>(new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Bundled StarCraft sound catalog is invalid.");
        return sounds.ToDictionary(sound => sound.Preset, StringComparer.Ordinal);
    }

    internal static bool Contains(string preset) => Labels.ContainsKey(preset);
    internal static byte[] Resource(string preset)
    {
        if (!Contains(preset)) throw new ArgumentException("Choose a bundled StarCraft recording.", nameof(preset));
        using var source = typeof(Sc2SoundClips).Assembly.GetManifestResourceStream("DscSound:" + preset)
            ?? throw new InvalidOperationException("Bundled StarCraft recording is unavailable.");
        using var copy = new MemoryStream();
        source.CopyTo(copy);
        return copy.ToArray();
    }
    internal static byte[] Waveform(string preset, int volume)
    {
        NotificationSounds.Validate(preset, volume);
        return NotificationSounds.Encode(Samples[preset].Value.Select(sample => (short)Math.Round(sample * volume / 100.0)).ToArray());
    }
}
