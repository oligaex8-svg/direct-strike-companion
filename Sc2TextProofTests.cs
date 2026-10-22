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
        var stable = Sc2TextProof.CreateStableMask(original, width, height, stride);
        assert(stable.StartsWith("g2:48:14:", StringComparison.Ordinal)
            && Sc2TextProof.Matches(stable, Frame(95, a), width, height, stride), "stable proof binds dimensions and ignores dark background changes");
        var pulse = (byte[])original.Clone();
        // Keep plenty of core ink while individual pixels cross each color's threshold.
        int[] pulseAt = [3 * stride + 4 * 4, 3 * stride + 14 * 4, 3 * stride + 24 * 4];
        (pulse[pulseAt[0]], pulse[pulseAt[0] + 1], pulse[pulseAt[0] + 2]) = (175, 135, 65);
        (pulse[pulseAt[1]], pulse[pulseAt[1] + 1], pulse[pulseAt[1] + 2]) = (175, 175, 175);
        (pulse[pulseAt[2]], pulse[pulseAt[2] + 1], pulse[pulseAt[2] + 2]) = (65, 135, 175);
        var pulseProof = Sc2TextProof.CreateStableMask(pulse, width, height, stride);
        assert(!Sc2TextProof.Matches(expected, pulse, width, height, stride)
            && Sc2TextProof.Matches(stable, pulse, width, height, stride)
            && Sc2TextProof.Matches(pulseProof, original, width, height, stride),
            "same-position intensity fluctuations across cyan, white and gold core thresholds pass in both directions while legacy stays exact");
        foreach (var changed in new[] { blank, onePixel, Frame(15, b), Frame(15, a, shift: 1), Frame(15, a, missing: true), Frame(15, a, added: true) })
            assert(!Sc2TextProof.Matches(stable, changed, width, height, stride), "stable proof rejects blank, removed core, replaced, shifted, missing and added text");
        var recolored = (byte[])original.Clone();
        recolored[first] = recolored[first + 1] = recolored[first + 2] = 225;
        assert(!Sc2TextProof.Matches(stable, recolored, width, height, stride), "support must retain the same glyph color");
        const string prefix = "g2:48:14:";
        int planeBytes = (width * height + 7) / 8;
        var stableBytes = Convert.FromBase64String(stable[prefix.Length..]);
        var unsupported = (byte[])stableBytes.Clone();
        unsupported[planeBytes + 3 * width / 8] = 0;
        var emptyCore = (byte[])stableBytes.Clone();
        for (int color = 0; color < 3; color++) Array.Clear(emptyCore, color * 2 * planeBytes, planeBytes);
        foreach (var malformed in new[] { "g3" + stable[2..], stable + "\n", stable[..^4], stable.Replace("48:14", "048:14"),
            stable.Replace("48:14", "24:28"), prefix + Convert.ToBase64String(unsupported), prefix + Convert.ToBase64String(emptyCore) })
            assert(!Sc2TextProof.Matches(malformed, original, width, height, stride), "stable malformed, noncanonical, wrong-dimension and unsupported-core proofs fail closed");
        var oddStable = Sc2TextProof.CreateStableMask(odd, 17, 1, 68);
        var oddStableBytes = Convert.FromBase64String(oddStable["g2:17:1:".Length..]);
        oddStableBytes[^1] |= 128;
        assert(!Sc2TextProof.Matches("g2:17:1:" + Convert.ToBase64String(oddStableBytes), odd, 17, 1, 68), "stable unused support bits fail closed");
        assert(Sc2TextProof.CreateStableMask(blank, width, height, stride) == ""
            && Sc2TextProof.CreateStableMask(sparse, 16, 1, 64) == ""
            && Sc2TextProof.CreateStableMask(new byte[7], width, height, stride) == ""
            && Sc2TextProof.CreateStableMask(null!, width, height, stride) == "", "stable blank, bright surface and missing pixels fail closed");
        foreach (var size in new[] { (0, 14, stride), (48, 0, stride), (2001, 1, 8004), (1, 257, 4), (1000, 101, 4000), (48, 14, 191), (48, 14, -stride), (int.MaxValue, int.MaxValue, int.MaxValue) })
            assert(Sc2TextProof.CreateStableMask(original, size.Item1, size.Item2, size.Item3) == ""
                && !Sc2TextProof.Matches(stable, original, size.Item1, size.Item2, size.Item3), "stable invalid geometry fails closed");
        // Invoke only pure byte-array methods; no drawing, capture or window APIs.
        using (var resource = typeof(Sc2TextProof).Assembly.GetManifestResourceStream("DscTool:DscCaptureHelper.dll"))
        {
            assert(resource is not null, "compiled legacy helper is available for proof parity");
            using var bytes = new MemoryStream();
            resource!.CopyTo(bytes);
            var helper = System.Reflection.Assembly.Load(bytes.ToArray()).GetType("DscCapture")!;
            foreach (var frame in new[] { original, pulse, blank, onePixel, padded, Frame(95, a) })
            foreach (var method in new[] { "CreateMask", "CreateStableMask" })
            {
                var actual = (string)helper.GetMethod(method)!.Invoke(null, [frame, width, height, stride])!;
                var wanted = method == "CreateMask" ? Sc2TextProof.CreateMask(frame, width, height, stride)
                    : Sc2TextProof.CreateStableMask(frame, width, height, stride);
                assert(actual == wanted, "compiled legacy helper and main app emit identical " + method + " proofs");
            }
        }
        var dimSurface = new byte[stride * height];
        Array.Fill(dimSurface, (byte)145);
        assert(Sc2TextProof.CreateStableMask(dimSurface, width, height, stride) == ""
            && !Sc2TextProof.Matches(stable, dimSurface, width, height, stride), "dark surfaces cannot act as glyph support");
        var sparseStable = new byte[16 * 4];
        for (int i = 0; i < 7; i++) sparseStable[i * 4] = sparseStable[i * 4 + 1] = sparseStable[i * 4 + 2] = 225;
        assert(Sc2TextProof.CreateStableMask(sparseStable, 16, 1, 64) == "", "stable proofs require at least eight bright core pixels");
        var maximum = new byte[500 * 200 * 4];
        for (int i = 0; i < 8; i++) maximum[i * 4] = maximum[i * 4 + 1] = maximum[i * 4 + 2] = 225;
        var maximumMask = Sc2TextProof.CreateMask(maximum, 500, 200, 2000);
        assert(Convert.FromBase64String(maximumMask).Length == 12500
            && Sc2TextProof.Matches(maximumMask, maximum, 500, 200, 2000), "maximum allowed region uses at most 12500 packed bytes");
    }
}
