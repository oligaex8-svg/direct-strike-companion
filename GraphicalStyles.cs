namespace DirectStrikeCompanion;

internal static class GraphicalStyles
{
    internal static bool IsSupported(string? style) => style is "default" or "protoss" or "zerg" or "terran";

    // Old libraries have no appearance field; unknown saved values must not
    // prevent the companion from opening its existing library.
    internal static string NormalizeStored(string? style) => IsSupported(style) ? style! : "default";

    internal static void PreservePreference(Settings current, Settings replacement)
        => replacement.GraphicalStyle = NormalizeStored(current.GraphicalStyle);
}

public sealed record GraphicalStyleRequest(string? Style)
{
    public object Apply(Store store) => new { style = store.SetGraphicalStyle(Style) };
}

public sealed partial class Store
{
    public string SetGraphicalStyle(string? style)
    {
        if (!GraphicalStyles.IsSupported(style)) throw new ArgumentException("Choose default, protoss, zerg or terran.");
        lock (Gate)
        {
            var previous = Data.Settings.GraphicalStyle;
            Data.Settings.GraphicalStyle = style!;
            try { Save(); }
            catch
            {
                Data.Settings.GraphicalStyle = previous;
                throw;
            }
        }
        SignalLiveChange();
        return style!;
    }
}
