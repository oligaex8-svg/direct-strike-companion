using System.Drawing;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal sealed record DashboardPlacement(double Width, double Height, bool Maximized);

// Independent of the replay library: dimensions are device-independent pixels.
internal static class DashboardPlacementPreferences
{
    internal static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DirectStrikeCompanion", "window-placement.json");

    internal static DashboardPlacement? Read(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            if (stream.Length > 4096) return null;
            var placement = JsonSerializer.Deserialize<DashboardPlacement>(stream, new JsonSerializerOptions { MaxDepth = 8 });
            return IsValid(placement) ? placement : null;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or ArgumentException)
        { return null; }
    }

    internal static bool Write(string path, DashboardPlacement placement)
    {
        if (!IsValid(placement)) return false;
        string? temporary = null;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(placement));
            File.Move(temporary, path, overwrite: true);
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        { return false; /* Window preferences must never prevent opening or closing the app. */ }
        finally
        {
            if (temporary is not null)
                try { File.Delete(temporary); }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
        }
    }

    private static bool IsValid(DashboardPlacement? placement) => placement is not null &&
        double.IsFinite(placement.Width) && double.IsFinite(placement.Height) &&
        placement.Width is > 0 and <= 100000 && placement.Height is > 0 and <= 100000;

    internal static Size RestoreSize(DashboardPlacement placement, int dpi, Size minimum, Size workingArea)
    {
        var scale = Math.Clamp(dpi, 48, 960) / 96d;
        var maxWidth = Math.Max(1, workingArea.Width);
        var maxHeight = Math.Max(1, workingArea.Height);
        var width = IsValid(placement) ? placement.Width * scale : minimum.Width;
        var height = IsValid(placement) ? placement.Height * scale : minimum.Height;
        return new Size((int)Math.Clamp(Math.Round(width), Math.Min(minimum.Width, maxWidth), maxWidth),
            (int)Math.Clamp(Math.Round(height), Math.Min(minimum.Height, maxHeight), maxHeight));
    }

    internal static DashboardPlacement Capture(Size normalSize, int dpi, FormWindowState state, DashboardPlacement? previous)
    {
        if (state == FormWindowState.Minimized && previous is not null) return previous;
        var scale = Math.Clamp(dpi, 48, 960) / 96d;
        return new(normalSize.Width / scale, normalSize.Height / scale, state == FormWindowState.Maximized);
    }
}
