using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class Sc2ClientUi
{
    private static readonly HashSet<string> Menus = new(["ScreenHome", "ScreenLobby", "ScreenBattleLobby", "ScreenScore"], StringComparer.Ordinal);
    private static readonly HashSet<string> Shells = new(["ScreenBackgroundSC2", "ScreenNavigationSC2", "ScreenForegroundSC2"], StringComparer.Ordinal);

    internal static HashSet<string>? ReadScreens(JsonElement ui)
    {
        if (ui.ValueKind != JsonValueKind.Object || !ui.TryGetProperty("activeScreens", out var screens) || screens.ValueKind != JsonValueKind.Array
            || screens.EnumerateArray().Any(s => s.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(s.GetString()))) return null;
        return screens.EnumerateArray().Select(s => CanonicalName(s.GetString()!.Trim())).ToHashSet(StringComparer.Ordinal);
    }

    private static string CanonicalName(string value)
    {
        // The client returns e.g. ScreenBattleLobby/ScreenBattleLobby.
        // Only unwrap this exact repeated form; unknown paths stay unknown.
        var split = value.Split('/');
        return split.Length == 2 && split[0] == split[1] ? split[0] : value;
    }

    internal static bool IsMenu(HashSet<string>? screens) => screens is { Count: > 0 }
        && screens.Any(Menus.Contains) && screens.All(s => Menus.Contains(s) || Shells.Contains(s));
    internal static bool HasLobby(HashSet<string>? screens) => screens != null && (screens.Contains("ScreenLobby") || screens.Contains("ScreenBattleLobby"));
    internal static bool MenuChanged(HashSet<string>? previous, HashSet<string>? current) => IsMenu(previous) && IsMenu(current)
        && !previous!.Where(Menus.Contains).ToHashSet(StringComparer.Ordinal).SetEquals(current!.Where(Menus.Contains));
}
