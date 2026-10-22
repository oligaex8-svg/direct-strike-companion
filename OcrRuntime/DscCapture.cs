using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
public static class DscCapture {
 private static MemoryStream proofStream;
 private static Bitmap proofImage;
 public static string RegionHash(byte[] png, int left, int top, int width, int height) {
  if (proofImage == null) { proofStream = new MemoryStream(png); proofImage = new Bitmap(proofStream); }
  using (var crop = proofImage.Clone(new Rectangle(left, top, width, height), PixelFormat.Format32bppArgb)) {
   var data = crop.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
   try {
    var pixels = new byte[data.Stride * height];
    Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
    for (int i = 3; i < pixels.Length; i += 4) pixels[i] = 255;
    using (var hash = System.Security.Cryptography.SHA256.Create()) { return BitConverter.ToString(hash.ComputeHash(pixels)).Replace("-", ""); }
   } finally { crop.UnlockBits(data); }
  }
 }
 public static string RegionGlyphMask(byte[] png, int left, int top, int width, int height) {
  if (width <= 0 || width > 2000 || height <= 0 || height > 256 || (long)width * height > 100000) return "";
  if (proofImage == null) { proofStream = new MemoryStream(png); proofImage = new Bitmap(proofStream); }
  using (var crop = proofImage.Clone(new Rectangle(left, top, width, height), PixelFormat.Format32bppArgb)) {
   var data = crop.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
   try {
    if (data.Stride < width * 4) return "";
    var pixels = new byte[data.Stride * height];
    Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
    return CreateMask(pixels, width, height, data.Stride);
   } finally { crop.UnlockBits(data); }
  }
 }
 // Keep the bright-core thresholds and packing identical to Sc2TextProof.
 public static string CreateMask(byte[] bgra, int width, int height, int stride) {
  if (bgra == null || width <= 0 || width > 2000 || height <= 0 || height > 256
      || (long)width * height > 100000 || stride < width * 4
      || (long)(height - 1) * stride + width * 4 > bgra.Length) return "";
  var mask = new byte[(width * height + 7) / 8];
  int ink = 0;
  for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
   int at = y * stride + x * 4;
   int b = bgra[at], g = bgra[at + 1], r = bgra[at + 2];
   bool cyan = b >= 180 && g >= 140 && b - r >= 35 && g - r >= 25;
   bool white = Math.Min(r, Math.Min(g, b)) >= 180
       && Math.Max(r, Math.Max(g, b)) - Math.Min(r, Math.Min(g, b)) <= 45;
   bool gold = r >= 180 && g >= 140 && r - b >= 60 && g - b >= 40;
   if (!cyan && !white && !gold) continue;
   int bit = y * width + x;
   mask[bit / 8] |= (byte)(1 << (bit % 8));
   ink++;
  }
  if (ink < 8 || ink * 2 > width * height) return "";
  return Convert.ToBase64String(mask);
 }
 public static void ReleaseProof() {
  var image = proofImage; var stream = proofStream;
  proofImage = null; proofStream = null;
  try { if (image != null) image.Dispose(); } finally { if (stream != null) stream.Dispose(); }
 }
 public static bool AcceptGold(byte[] png, int left, int top, int width, int height) {
  if (proofImage == null) { proofStream = new MemoryStream(png); proofImage = new Bitmap(proofStream); }
  int gold = 0;
  for (int y = top; y < top + height; y++) for (int x = left; x < left + width; x++) {
   var color = proofImage.GetPixel(x, y);
   if (color.R > 130 && color.G > 95 && color.R - color.B > 45 && color.G - color.B > 30) gold++;
  }
  return gold >= Math.Max(8, width * height / 200);
 }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
 [DllImport("user32.dll")] private static extern bool GetWindowPlacement(IntPtr h, ref Placement p);
 [StructLayout(LayoutKind.Sequential)] private struct Placement { public int Length, Flags, Show; public Point Min, Max; public Rect Normal; }
 public static bool CaptureBounds(IntPtr h, out Rect r) {
  if (!IsIconic(h)) return GetWindowRect(h, out r);
  var p = new Placement(); p.Length = Marshal.SizeOf(p);
  var ok = GetWindowPlacement(h, ref p); r = p.Normal; return ok;
 }
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint command);
 [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr h, uint attribute, out int value, int size);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 // CopyFromScreen reads desktop pixels. Reject overlapping windows above SC2
 // rather than accidentally reading a dashboard or another application's text.
 public static bool Unobscured(IntPtr h, Rect r) {
  var above = GetWindow(h, 3); // GW_HWNDPREV, toward the top of the Z order.
  for (int i = 0; above != IntPtr.Zero; i++, above = GetWindow(above, 3)) {
   if (i >= 512) return false;
   if (!IsWindowVisible(above) || IsIconic(above)) continue;
   int cloaked;
   if (DwmGetWindowAttribute(above, 14, out cloaked, 4) == 0 && cloaked != 0) continue;
   Rect other;
   if (!GetWindowRect(above, out other)) return false;
   if (other.Left < r.Right && other.Right > r.Left && other.Top < r.Bottom && other.Bottom > r.Top) return false;
  }
  return true;
 }
 // Enlarge one name line and isolate the lobby's cyan text. This keeps portraits,
 // clan tags and the chat outside the recognizer's input.
 public static byte[] NameImage(byte[] png, int left, int top, int width, int height, int hostSuffixCharacters) {
  using (var input = new MemoryStream(png))
  using (var source = new Bitmap(input))
  using (var crop = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
   using (var graphics = Graphics.FromImage(crop)) {
    graphics.DrawImage(source, new Rectangle(0, 0, width, height), new Rectangle(left, top, width, height), GraphicsUnit.Pixel);
   }
   var data = crop.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
   try {
    var pixels = new byte[data.Stride * height];
    Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
    for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
     int at = y * data.Stride + x * 4;
     byte b = pixels[at], g = pixels[at + 1], r = pixels[at + 2];
     // Preserve antialiasing: a hard threshold merges m/rn and loses i/l strokes.
     byte value = (byte)(255 - Math.Min(255, Math.Max(0, Math.Max(b, g) - r) * 2));
     pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
     pixels[at + 3] = 255;
    }
    // The English host label can hide an attached Russian word from its OCR
    // engine. Locate the curved opening parenthesis only after the layout has
    // read the exact label. Counting six ink runs is unsafe: runs are not glyphs.
    if (hostSuffixCharacters > 0) {
     int cut = OpeningParenthesis(pixels, width, height, data.Stride);
     if (cut > 0) {
      for (int y = 0; y < height; y++) for (int x = cut; x < width; x++) {
       int at = y * data.Stride + x * 4;
       pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
      }
     }
    }
    Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
   } finally { crop.UnlockBits(data); }
   // A wide empty name column makes Windows OCR miss otherwise readable text.
   // Retain a small white margin around the actual cyan ink, including spaces.
   int inkLeft = width, inkRight = -1, inkTop = height, inkBottom = -1;
   for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
    if (crop.GetPixel(x, y).R >= 160) continue;
    inkLeft = Math.Min(inkLeft, x); inkRight = Math.Max(inkRight, x);
    inkTop = Math.Min(inkTop, y); inkBottom = Math.Max(inkBottom, y);
   }
   if (inkRight < inkLeft) { inkLeft = 0; inkRight = width - 1; inkTop = 0; inkBottom = height - 1; }
   int textWidth = inkRight - inkLeft + 1, textHeight = inkBottom - inkTop + 1;
   int zoomWidth = Math.Min((textWidth + 12) * 2, 2500);
   int zoomHeight = Math.Max(1, (int)((double)(textHeight + 12) * zoomWidth / (textWidth + 12)));
   using (var enlarged = new Bitmap(zoomWidth, zoomHeight))
   using (var output = new MemoryStream()) {
    using (var graphics = Graphics.FromImage(enlarged)) {
     graphics.Clear(Color.White);
     graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
     double zoom = (double)zoomWidth / (textWidth + 12);
     graphics.DrawImage(crop, new RectangleF((float)(6 * zoom), (float)(6 * zoom), (float)(textWidth * zoom), (float)(textHeight * zoom)),
        new Rectangle(inkLeft, inkTop, textWidth, textHeight), GraphicsUnit.Pixel);
    }
    enlarged.Save(output, ImageFormat.Png);
    return output.ToArray();
   }
  }
 }
 private static int OpeningParenthesis(byte[] pixels, int width, int height, int stride) {
  int lineTop = height, lineBottom = -1;
  for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) if (pixels[y * stride + x * 4] < 160) {
   lineTop = Math.Min(lineTop, y); lineBottom = Math.Max(lineBottom, y);
  }
  int result = -1;
  for (int x = 0; x < width; x++) {
   bool ink = false;
   for (int y = 0; y < height && !ink; y++) ink = pixels[y * stride + x * 4] < 160;
   if (!ink) continue;
   int start = x, top = height, bottom = -1;
   while (x < width) {
    bool occupied = false;
    for (int y = 0; y < height; y++) if (pixels[y * stride + x * 4] < 160) {
     occupied = true; top = Math.Min(top, y); bottom = Math.Max(bottom, y);
    }
    if (!occupied) break;
    x++;
   }
   int glyphWidth = x - start, glyphHeight = bottom - top + 1;
   // A lowercase t also has curved ends, but is shorter than the parentheses.
   if (glyphWidth < 2 || glyphHeight < 8 || glyphHeight < glyphWidth * 2
       || glyphHeight < (lineBottom - lineTop + 1) * .9) continue;
   int upper = width, middle = width, lower = width;
   for (int y = top; y <= bottom; y++) for (int at = start; at < x; at++) {
    if (pixels[y * stride + at * 4] >= 160) continue;
    if (y < top + Math.Max(2, glyphHeight / 6)) upper = Math.Min(upper, at);
    else if (y > bottom - Math.Max(2, glyphHeight / 6)) lower = Math.Min(lower, at);
    else middle = Math.Min(middle, at);
   }
   if (middle < upper && middle < lower) result = start;
  }
  return result;
 }
}
