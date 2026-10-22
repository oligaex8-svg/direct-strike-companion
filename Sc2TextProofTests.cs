namespace DirectStrikeCompanion;

internal static class Sc2TextProofTests
{
    internal static void Run(Action<bool, string> assert)
    {
        const int width = 48, height = 14, stride = width * 4 + 8;
        // Rasterized letters, with real BGRA colors from cyan/gold/white UI text.
        string[] a = ["01110", "11011", "11011", "11111", "11011", "11011", "11011"];
        string[] b = ["11110", "11011", "11011", "11110", "11011", "11011", "11110"];
        byte[] Frame(byte background, string[] glyph, int shift = 0, bool missing = false, bool added = false)
        {
            var pixels = new byte[stride * height];
            for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int at = y * stride + x * 4;
                pixels[at] = (byte)(background + x % 11);
                pixels[at + 1] = (byte)(background + y % 13);
                pixels[at + 2] = background;
                pixels[at + 3] = 255;
            }
            for (int letter = 0; letter < (added ? 4 : 3); letter++)
            {
                if (missing && letter == 1) continue;
                for (int y = 0; y < glyph.Length; y++)
                for (int x = 0; x < glyph[y].Length; x++)
                {
                    if (glyph[y][x] != '1') continue;
                    int at = (y + 3) * stride + (x + 3 + letter * 10 + shift) * 4;
                    // Cyan, white and gold respectively (BGRA order).
                    (pixels[at], pixels[at + 1], pixels[at + 2]) = (letter % 3) switch
                    {
                        0 => ((byte)250, (byte)195, (byte)95),
                        1 => ((byte)225, (byte)225, (byte)225),
                        _ => ((byte)105, (byte)220, (byte)250)
                    };
                }
            }
            return pixels;
        }
        var original = Frame(15, a);
        var expected = Sc2TextProof.CreateMask(original, width, height, stride);
        assert(expected.Length != 0 && Sc2TextProof.Matches(expected, original, width, height, stride),
            "bright cyan, white and gold text creates a nonblank self-matching spatial proof");
        assert(Sc2TextProof.Matches(expected, Frame(95, a), width, height, stride),
            "same bright text over changed patterned dark background matches");
        assert(!Sc2TextProof.Matches(expected, Frame(15, b), width, height, stride),
            "replaced text over the identical background fails");
        assert(!Sc2TextProof.Matches(expected, Frame(15, a, shift: 1), width, height, stride),
            "text shifted by even one pixel fails");
        assert(!Sc2TextProof.Matches(expected, Frame(15, a, missing: true), width, height, stride)
            && !Sc2TextProof.Matches(expected, Frame(15, a, added: true), width, height, stride),
            "missing and added text fail");
        var onePixel = (byte[])original.Clone();
        // Remove one bright core, preventing a percent tolerance from hiding a character change.
        int first = 3 * stride + 4 * 4;
        onePixel[first] = onePixel[first + 1] = onePixel[first + 2] = 15;
        assert(!Sc2TextProof.Matches(expected, onePixel, width, height, stride), "a changed bright glyph core fails without blanket tolerance");
        var padded = (byte[])original.Clone();
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++) padded[y * stride + x * 4 + 3] = 0;
            for (int i = width * 4; i < stride; i++) padded[y * stride + i] = 255;
        }
        assert(Sc2TextProof.Matches(expected, padded, width, height, stride), "alpha and row padding do not participate in glyph proofs");
        var blank = new byte[stride * height];
        assert(Sc2TextProof.CreateMask(blank, width, height, stride) == ""
            && !Sc2TextProof.Matches(Convert.ToBase64String(new byte[(width * height + 7) / 8]), blank, width, height, stride),
            "blank capture and a blank encoded mask fail closed");
        foreach (var malformed in new[] { "", "!" + expected[1..], expected[..^4], expected + "AAAA", " " + expected, expected + "\n" })
            assert(!Sc2TextProof.Matches(malformed, original, width, height, stride), "empty, malformed, noncanonical and wrong-length masks fail closed");
        var odd = new byte[17 * 4];
        for (int i = 0; i < 8; i++) odd[i * 4] = odd[i * 4 + 1] = odd[i * 4 + 2] = 225;
        var oddMask = Sc2TextProof.CreateMask(odd, 17, 1, 68);
        assert(oddMask.Length > 0 && Sc2TextProof.Matches(oddMask, odd, 17, 1, 68), "partial final mask byte supports a valid region");
        var badTail = Convert.FromBase64String(oddMask);
        badTail[^1] |= 128;
        assert(!Sc2TextProof.Matches(Convert.ToBase64String(badTail), odd, 17, 1, 68), "unused packed bits cannot hide additional pixels");
        foreach (var size in new[] { (0, 14, stride), (48, 0, stride), (2001, 1, 8004), (1, 257, 4), (1000, 101, 4000), (48, 14, 191), (48, 14, -stride), (int.MaxValue, int.MaxValue, int.MaxValue) })
            assert(Sc2TextProof.CreateMask(original, size.Item1, size.Item2, size.Item3) == ""
                && !Sc2TextProof.Matches(expected, original, size.Item1, size.Item2, size.Item3), "invalid dimensions, strides and overflowing geometry fail closed");
        assert(Sc2TextProof.CreateMask(new byte[7], width, height, stride) == ""
            && !Sc2TextProof.Matches(expected, new byte[7], width, height, stride), "truncated BGRA input fails closed");
        assert(Sc2TextProof.CreateMask(null!, width, height, stride) == ""
            && !Sc2TextProof.Matches(null!, original, width, height, stride)
            && !Sc2TextProof.Matches(expected, null!, width, height, stride), "missing proof or pixels fail closed");
        var sparse = new byte[16 * 4];
        for (int i = 0; i < 7; i++) sparse[i * 4] = sparse[i * 4 + 1] = sparse[i * 4 + 2] = 225;
        assert(Sc2TextProof.CreateMask(sparse, 16, 1, 64) == "", "isolated bright noise cannot authorize a glyph proof");
        Array.Fill(sparse, (byte)225);
        assert(Sc2TextProof.CreateMask(sparse, 16, 1, 64) == "", "a mostly bright surface cannot authorize a text proof");
        var maximum = new byte[500 * 200 * 4];
        for (int i = 0; i < 8; i++) maximum[i * 4] = maximum[i * 4 + 1] = maximum[i * 4 + 2] = 225;
        var maximumMask = Sc2TextProof.CreateMask(maximum, 500, 200, 2000);
        assert(Convert.FromBase64String(maximumMask).Length == 12500
            && Sc2TextProof.Matches(maximumMask, maximum, 500, 200, 2000), "maximum allowed region uses at most 12500 packed bytes");
    }
}
