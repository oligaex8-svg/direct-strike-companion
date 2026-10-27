using System.Drawing;
using System.Globalization;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal readonly record struct DashboardCaptionPalette(Color Background, Color Text)
{
    private static readonly DashboardCaptionPalette Default = new(Color.FromArgb(34, 50, 71), Color.FromArgb(226, 234, 244));
    private static readonly IReadOnlyDictionary<string, DashboardCaptionPalette> Palettes = Load();

    internal static DashboardCaptionPalette ForStyle(string? style) =>
        Palettes.GetValueOrDefault(GraphicalStyles.NormalizeStored(style), Default);

    private static IReadOnlyDictionary<string, DashboardCaptionPalette> Load()
    {
        var result = new Dictionary<string, DashboardCaptionPalette>(StringComparer.Ordinal) { ["default"] = Default };
        var assembly = typeof(DashboardCaptionPalette).Assembly;
        var resource = assembly.GetManifestResourceNames().FirstOrDefault(name =>
            name.Replace('\\', '/') == "DscAsset:wwwroot/native-console-catalog.json");
        if (resource is not null)
        {
            using var stream = assembly.GetManifestResourceStream(resource)!;
            using var catalog = JsonDocument.Parse(stream);
            foreach (var item in catalog.RootElement.EnumerateArray())
            {
                var id = item.GetProperty("id").GetString();
                if (id is null || !GraphicalStyles.IsSupported(id) ||
                    !item.TryGetProperty("surface", out var surface) || !item.TryGetProperty("accent", out var accent)) continue;
                if (TryColor(surface.GetString(), out var background) && TryColor(accent.GetString(), out var text))
                    result[id] = Create(background, text);
            }
        }
        // The classic source entries carry no palette; match their existing generator defaults.
        result["classic-terran"] = Create(Color.FromArgb(0x16, 0x1d, 0x23), Color.FromArgb(0x8b, 0xd4, 0xae));
        result["classic-protoss"] = Create(Color.FromArgb(0x15, 0x1e, 0x23), Color.FromArgb(0x80, 0xce, 0xef));
        result["classic-zerg"] = Create(Color.FromArgb(0x1d, 0x18, 0x15), Color.FromArgb(0xe5, 0xad, 0x67));
        return result;
    }

    private static DashboardCaptionPalette Create(Color surface, Color accent) => new(
        Color.FromArgb((int)Math.Round(surface.R * .82 + accent.R * .18, MidpointRounding.AwayFromZero), (int)Math.Round(surface.G * .82 + accent.G * .18, MidpointRounding.AwayFromZero), (int)Math.Round(surface.B * .82 + accent.B * .18, MidpointRounding.AwayFromZero)), accent);

    private static bool TryColor(string? value, out Color color)
    {
        color = default;
        if (value is not { Length: 7 } || value[0] != '#' ||
            !int.TryParse(value.AsSpan(1), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var rgb)) return false;
        color = Color.FromArgb((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
        return true;
    }
}
