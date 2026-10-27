using System.Drawing;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class DashboardCaptionPaletteTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var fallback = DashboardCaptionPalette.ForStyle("default");
        assert(DashboardCaptionPalette.ForStyle(null) == fallback && DashboardCaptionPalette.ForStyle("unknown") == fallback &&
            DashboardCaptionPalette.ForStyle("#ffffff") == fallback, "unknown caption styles cannot supply arbitrary native colours");
        assert(fallback.Background == Color.FromArgb(34, 50, 71), "Default retains the established native caption colour");
        var assembly = typeof(DashboardCaptionPaletteTests).Assembly;
        var resource = assembly.GetManifestResourceNames().Single(name =>
            name.Replace('\\', '/') == "DscAsset:wwwroot/native-console-catalog.json");
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var catalog = JsonDocument.Parse(stream);
        foreach (var item in catalog.RootElement.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString()!;
            var palette = DashboardCaptionPalette.ForStyle(id);
            assert(palette != fallback && palette.Background.GetBrightness() < .3f && palette.Text.GetBrightness() > .5f,
                "native caption has a dark themed surface and readable light title: " + id);
            if (!item.TryGetProperty("accent", out var accent)) continue;
            var surface = ColorTranslator.FromHtml(item.GetProperty("surface").GetString()!);
            assert(palette.Background.GetBrightness() > surface.GetBrightness() &&
                palette.Background.GetBrightness() < palette.Text.GetBrightness(),
                "native drag caption is lighter than the app surface and retains a distinct light title: " + id);
            assert(palette.Text.ToArgb() == ColorTranslator.FromHtml(accent.GetString()!).ToArgb(),
                "native caption uses the canonical catalog accent: " + id);
        }
        assert(DashboardCaptionPalette.ForStyle("classic-terran").Text == Color.FromArgb(0x8b, 0xd4, 0xae) &&
            DashboardCaptionPalette.ForStyle("classic-protoss").Text == Color.FromArgb(0x80, 0xce, 0xef) &&
            DashboardCaptionPalette.ForStyle("classic-zerg").Text == Color.FromArgb(0xe5, 0xad, 0x67),
            "classic caption palettes match the established native-console generator defaults");
        assert(DashboardCaptionPalette.ForStyle("nerazim").Background == Color.FromArgb(59, 52, 70),
            "caption material blends 18 percent of the theme accent into its surface");
    }
}
