namespace DirectStrikeCompanion;

// Only bright glyph cores authorize a background-independent proof. Positions
// must match exactly: no translation, dilation or percentage pixel tolerance.
internal static class Sc2TextProof
{
    internal const int MaximumPixels = 100000;

    internal static string CreateMask(byte[] bgra, int width, int height, int stride)
    {
        if (!ValidPixels(bgra, width, height, stride)) return "";
        var mask = new byte[(width * height + 7) / 8];
        int ink = 0;
        for (int y = 0; y < height; y++)
        for (int x = 0; x < width; x++)
        {
            int at = y * stride + x * 4;
            int b = bgra[at], g = bgra[at + 1], r = bgra[at + 2];
            // Cyan lobby text, neutral game white, and gold action labels.
            // Exclude dim translucent backgrounds and antialiasing fringes.
            bool cyan = b >= 180 && g >= 140 && b - r >= 35 && g - r >= 25;
            bool white = Math.Min(r, Math.Min(g, b)) >= 180
                && Math.Max(r, Math.Max(g, b)) - Math.Min(r, Math.Min(g, b)) <= 45;
            bool gold = r >= 180 && g >= 140 && r - b >= 60 && g - b >= 40;
            if (!cyan && !white && !gold) continue;
            int bit = y * width + x;
            mask[bit / 8] |= (byte)(1 << (bit % 8));
            ink++;
        }
        // Empty, isolated noise or a mostly bright surface cannot prove text.
        if (ink < 8 || ink * 2 > width * height) return "";
        return Convert.ToBase64String(mask);
    }

    internal static bool Matches(string expected, byte[] bgra, int width, int height, int stride)
    {
        if (!ValidPixels(bgra, width, height, stride) || string.IsNullOrEmpty(expected)) return false;
        int byteCount = (width * height + 7) / 8;
        if (expected.Length != ((byteCount + 2) / 3) * 4) return false;
        byte[] mask;
        try { mask = Convert.FromBase64String(expected); }
        catch (FormatException) { return false; }
        if (mask.Length != byteCount || Convert.ToBase64String(mask) != expected) return false;
        // Unused high bits must be zero, so dimensions cannot hide extra ink.
        int remaining = width * height % 8;
        if (remaining != 0 && (mask[^1] >> remaining) != 0) return false;
        var current = CreateMask(bgra, width, height, stride);
        return current.Length != 0 && string.Equals(expected, current, StringComparison.Ordinal);
    }

    private static bool ValidPixels(byte[] bgra, int width, int height, int stride) =>
        bgra != null && width > 0 && width <= 2000 && height > 0 && height <= 256
        && (long)width * height <= MaximumPixels && stride >= width * 4
        && (long)(height - 1) * stride + width * 4 <= bgra.Length;
}
