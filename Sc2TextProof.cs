namespace DirectStrikeCompanion;

// Bright glyph cores authorize a background-independent proof. Version 2 allows
// intensity changes only at exact same-color support positions in both frames.
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

    // Version 2 stores three color planes, each core followed by its support.
    // Support lowers intensity only; it never grows or translates glyph geometry.
    internal static string CreateStableMask(byte[] bgra, int width, int height, int stride)
    {
        if (bgra == null || width <= 0 || width > 2000 || height <= 0 || height > 256
            || (long)width * height > 100000 || stride < width * 4
            || (long)(height - 1) * stride + width * 4 > bgra.Length) return "";
        int count = (width * height + 7) / 8;
        var masks = new byte[count * 6];
        int ink = 0, supportInk = 0;
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
        {
            int at = y * stride + x * 4;
            int b = bgra[at], g = bgra[at + 1], r = bgra[at + 2];
            int color = -1;
            bool core = false;
            if (b >= 150 && g >= 120 && b - r >= 35 && g - r >= 25)
            { color = 0; core = b >= 180 && g >= 140; }
            else if (Math.Min(r, Math.Min(g, b)) >= 150
                && Math.Max(r, Math.Max(g, b)) - Math.Min(r, Math.Min(g, b)) <= 45)
            { color = 1; core = Math.Min(r, Math.Min(g, b)) >= 180; }
            else if (r >= 150 && g >= 120 && r - b >= 60 && g - b >= 40)
            { color = 2; core = r >= 180 && g >= 140; }
            if (color < 0) continue;
            int bit = y * width + x;
            byte flag = (byte)(1 << (bit % 8));
            masks[(color * 2 + 1) * count + bit / 8] |= flag;
            supportInk++;
            if (core) { masks[color * 2 * count + bit / 8] |= flag; ink++; }
        }
        if (ink < 8 || supportInk * 2 > width * height) return "";
        return "g2:" + width.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":"
            + height.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":" + Convert.ToBase64String(masks);
    }

    internal static bool Matches(string expected, byte[] bgra, int width, int height, int stride)
    {
        if (!ValidPixels(bgra, width, height, stride) || string.IsNullOrEmpty(expected)) return false;
        if (expected.StartsWith("g2:", StringComparison.Ordinal))
            return MatchesStable(expected, bgra, width, height, stride);
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

    private static bool MatchesStable(string expected, byte[] bgra, int width, int height, int stride)
    {
        var current = CreateStableMask(bgra, width, height, stride);
        if (current.Length == 0) return false;
        int prefixLength = current.LastIndexOf(':') + 1;
        if (expected.Length != current.Length || !expected.StartsWith(current[..prefixLength], StringComparison.Ordinal)) return false;
        byte[] masks;
        try { masks = Convert.FromBase64String(expected[prefixLength..]); }
        catch (FormatException) { return false; }
        int count = (width * height + 7) / 8;
        if (masks.Length != count * 6 || Convert.ToBase64String(masks) != expected[prefixLength..]) return false;
        var live = Convert.FromBase64String(current[prefixLength..]);
        int ink = 0, supportInk = 0;
        int remaining = width * height % 8;
        for (int plane = 0; plane < 6; plane++)
            if (remaining != 0 && (masks[(plane + 1) * count - 1] >> remaining) != 0) return false;
        for (int i = 0; i < count; i++)
        {
            int occupied = 0;
            for (int color = 0; color < 3; color++)
            {
                int core = masks[color * 2 * count + i], support = masks[(color * 2 + 1) * count + i];
                // Canonical proofs cannot assign one pixel to multiple colors.
                if ((occupied & support) != 0 || (core & ~support) != 0) return false;
                occupied |= support;
                if ((core & ~live[(color * 2 + 1) * count + i]) != 0
                    || (live[color * 2 * count + i] & ~support) != 0) return false;
                for (int bit = 0; bit < 8; bit++)
                { ink += (core >> bit) & 1; supportInk += (support >> bit) & 1; }
            }
        }
        return ink >= 8 && supportInk * 2 <= width * height;
    }

    private static bool ValidPixels(byte[] bgra, int width, int height, int stride) =>
        bgra != null && width > 0 && width <= 2000 && height > 0 && height <= 256
        && (long)width * height <= MaximumPixels && stride >= width * 4
        && (long)(height - 1) * stride + width * 4 <= bgra.Length;
}
