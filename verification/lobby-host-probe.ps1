param([string]$ImagePath, [switch]$Diagnostics)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
public static class DscCapture {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
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
 public static byte[] NameImage(byte[] png, int left, int top, int width, int height) {
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
     byte value = (b > 90 && g > 70 && b - r > 20) ? (byte)0 : (byte)255;
     pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
     pixels[at + 3] = 255;
    }
    Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
   } finally { crop.UnlockBits(data); }
   using (var enlarged = new Bitmap(width * 2, height * 2))
   using (var output = new MemoryStream()) {
    using (var graphics = Graphics.FromImage(enlarged)) {
     graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
     graphics.DrawImage(crop, 0, 0, enlarged.Width, enlarged.Height);
    }
    enlarged.Save(output, ImageFormat.Png);
    return output.ToArray();
   }
  }
 }
}
'@
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.DataWriter,Windows.Storage.Streams,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await-Dsc($operation,$type) {
 $task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation))
 $task.Wait()
 $task.Result
}
function Read-NameLine($bytes, $engines) {
 $nameStream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
 $nameImage=$null
 try {
  $nameWriter=New-Object Windows.Storage.Streams.DataWriter($nameStream)
  try {
   $nameWriter.WriteBytes($bytes)
   $null=Await-Dsc ($nameWriter.StoreAsync()) ([uint32])
   $null=$nameWriter.DetachStream()
  } finally {$nameWriter.Dispose()}
  $nameStream.Seek(0)
  $nameDecoder=Await-Dsc ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($nameStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $nameImage=Await-Dsc ($nameDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  foreach ($item in $engines) {
   $nameResult=Await-Dsc ($item.engine.RecognizeAsync($nameImage)) ([Windows.Media.Ocr.OcrResult])
   @{language=$item.language;text=(($nameResult.Lines | ForEach-Object {$_.Text}) -join ' ').Trim()}
  }
 } finally {
  if ($nameImage) {$nameImage.Dispose()}
  $nameStream.Dispose()
 }
}
function Remove-HostLabel([string]$value) {
 ($value -replace '\s*\((?:Host|Хозяин|Создатель)\)\s*$','').Trim()
}
$stream=$null
try {
 if (-not $ImagePath) {
  $null=[DscCapture]::SetProcessDPIAware()
  $windows=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^SC2(_x64)?$' -and $_.MainWindowHandle -ne [IntPtr]::Zero})
  if ($windows.Count -eq 0) { @{status='SC2 window unavailable - start SC2 and open the lobby';text=''} | ConvertTo-Json -Compress; exit 0 }
  $foreground=[DscCapture]::GetForegroundWindow()
  $selected=@($windows | Where-Object {$_.MainWindowHandle -eq $foreground})
  if ($selected.Count -eq 0) { $selected=@($windows | Where-Object { -not [DscCapture]::IsIconic($_.MainWindowHandle) -and [DscCapture]::IsWindowVisible($_.MainWindowHandle)}) }
  if ($selected.Count -eq 0) { @{status='SC2 window minimized or hidden - restore it to read the lobby';text=''} | ConvertTo-Json -Compress; exit 0 }
  if ($selected.Count -ne 1) { @{status='Multiple SC2 windows - put the intended lobby in the foreground';text=''} | ConvertTo-Json -Compress; exit 0 }
  $handle=$selected[0].MainWindowHandle
  $rect=New-Object DscCapture+Rect
  if (-not [DscCapture]::GetWindowRect($handle,[ref]$rect)) { throw 'SC2 window bounds unavailable' }
  $width=$rect.Right-$rect.Left
  $height=$rect.Bottom-$rect.Top
  if ($width -lt 100 -or $height -lt 100 -or $width -gt 8000 -or $height -gt 8000) { throw 'SC2 window size unavailable' }
  if (-not [DscCapture]::Unobscured($handle,$rect)) { @{status='SC2 window covered - keep the lobby visible beside the dashboard or put SC2 in front';text=''} | ConvertTo-Json -Compress; exit 0 }
  $bitmap=New-Object System.Drawing.Bitmap($width,$height)
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size) } finally {$graphics.Dispose()}
  $after=New-Object DscCapture+Rect
  if ([DscCapture]::IsIconic($handle) -or -not [DscCapture]::GetWindowRect($handle,[ref]$after) -or $after.Left -ne $rect.Left -or $after.Top -ne $rect.Top -or $after.Right -ne $rect.Right -or $after.Bottom -ne $rect.Bottom -or -not [DscCapture]::Unobscured($handle,$after)) {
   $bitmap.Dispose()
   @{status='SC2 window changed or became covered during capture - waiting for a readable lobby';text=''} | ConvertTo-Json -Compress; exit 0
  }
  $memory=New-Object System.IO.MemoryStream
  try {$bitmap.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png)} finally {$bitmap.Dispose()}
  try {$imageBytes=$memory.ToArray()} finally {$memory.Dispose()}
 } else {
  $imageBytes=[System.IO.File]::ReadAllBytes($ImagePath)
 }
 $stream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
 $writer=New-Object Windows.Storage.Streams.DataWriter($stream)
 try {
  $writer.WriteBytes($imageBytes)
  $null=Await-Dsc ($writer.StoreAsync()) ([uint32])
  $null=$writer.DetachStream()
 } finally {$writer.Dispose()}
 $stream.Seek(0)
 $decoder=Await-Dsc ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $scale=[Math]::Min(1,[Windows.Media.Ocr.OcrEngine]::MaxImageDimension/[Math]::Max($decoder.PixelWidth,$decoder.PixelHeight))
 $transform=New-Object Windows.Graphics.Imaging.BitmapTransform
 $transform.ScaledWidth=[uint32]($decoder.PixelWidth*$scale)
 $transform.ScaledHeight=[uint32]($decoder.PixelHeight*$scale)
 $image=Await-Dsc ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,$transform,[Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
 try {
  $available=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
  $languages=@($available | Where-Object {$_.LanguageTag -like 'en*'} | Select-Object -First 1)
  $languages+=@($available | Where-Object {$_.LanguageTag -like 'ru*'} | Select-Object -First 1)
  if ($languages.Count -eq 0) { throw 'Install an English or Russian OCR language pack in Windows Settings.' }
  $engines=@(foreach ($language in $languages) {
   $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
   if (-not $engine) { continue }
   @{language=$language.LanguageTag;engine=$engine}
  })
  $readings=@(foreach ($item in $engines) {
   $result=Await-Dsc ($item.engine.RecognizeAsync($image)) ([Windows.Media.Ocr.OcrResult])
   $lines=@(foreach ($line in $result.Lines) {
    $words=@(foreach ($word in $line.Words) {
     @{text=$word.Text;x=$word.BoundingRect.X;y=$word.BoundingRect.Y;width=$word.BoundingRect.Width;height=$word.BoundingRect.Height}
    })
    @{text=$line.Text;words=$words}
   })
   @{language=$item.language;text=($result.Lines | ForEach-Object {$_.Text}) -join "`n";lines=$lines}
  })
  $text=if ($readings.Count -gt 0) {$readings[0].text} else {''}
  $output=@{status='SC2 screen reader active - waiting for Direct Strike lobby rows';text=$text;rosterNames=@()}
  if ([string]::IsNullOrWhiteSpace($text)) { $output.status='SC2 capture has no readable text - waiting for visible lobby text' }
  $rowDiagnostics=@()
  foreach ($reading in $readings) {
   # Require the map, mode and two roster panels together. Reading arbitrary
   # screen text or a joined-lobby chat message must never create a player row.
   $map=@($reading.lines | Where-Object {$_.text -match '^Direct\s+Strike\b' -and $_.words[0].x -lt $image.PixelWidth*.5 -and $_.words[0].y -lt $image.PixelHeight*.2})
   $mode=@($reading.lines | Where-Object {$_.text -match '3\s*V\s*3\s+Commanders'})
   $first=@($reading.lines | Where-Object {$_.text -match '^(Horde|Орда)$' -and $_.words[0].x -lt $image.PixelWidth*.5})
   $second=@($reading.lines | Where-Object {$_.text -match '^(Alliance|Альянс)$' -and $_.words[0].x -lt $image.PixelWidth*.5})
   if ($map.Count -eq 0 -or $mode.Count -eq 0 -or $first.Count -ne 1 -or $second.Count -ne 1) {continue}
   $start=$first[0].words[0];$end=$second[0].words[0];$gap=$end.y-$start.y
   if ($gap -lt $image.PixelHeight*.15 -or $gap -gt $image.PixelHeight*.5 -or [Math]::Abs($start.x-$end.x) -gt $image.PixelWidth*.05) {continue}
   $minX=$start.x+$image.PixelWidth*.03;$maxX=$start.x+$image.PixelWidth*.35
   $names=@(foreach ($panel in @($start,$end)) {
    $rows=@(foreach ($line in $reading.lines) {
     $words=@($line.words | Where-Object {$_.x -ge $minX -and $_.x+$_.width -le $maxX -and $_.y -gt $panel.y+$gap*.12 -and $_.y -lt $panel.y+$gap*.86} | Sort-Object {$_.x})
     if ($words.Count -eq 0) {continue}
     $raw=($words | ForEach-Object {$_.text}) -join ' '
     if ($raw -match '^[<\[]' -or $raw -match '^(Open|Closed|Empty|Computer|A[.]?I[.]?|Открыто|Закрыто|Компьютер)(\s|$)' -or $raw -match '^(Select|Выбрать)$') {continue}
     @{text=$raw;words=$words;y=$words[0].y}
    })
    $rows=@($rows | Sort-Object {$_.y} | Select-Object -First 3)
    foreach ($row in $rows) {
     $left=[Math]::Max(0,[int](($minX-5)/$scale))
     $top=[Math]::Max(0,[int](($row.y-6)/$scale))
     $bottom=($row.words | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
     $cropWidth=[Math]::Min([int](($maxX-$minX+10)/$scale),[int]$decoder.PixelWidth-$left)
     $cropHeight=[Math]::Min([int](($bottom-$row.y+12)/$scale),[int]$decoder.PixelHeight-$top)
     if ($row.text -match '\(Host\)$') {$cropWidth=155}; $lineBytes=[DscCapture]::NameImage($imageBytes,$left,$top,$cropWidth,$cropHeight)
     $lineReadings=@(Read-NameLine $lineBytes $engines)
     $english=@($lineReadings | Where-Object {$_.language -like 'en*'})
     $russian=@($lineReadings | Where-Object {$_.language -like 'ru*'})
     $name=Remove-HostLabel $row.text
     if ($english.Count -gt 0 -and $english[0].text) {$name=Remove-HostLabel $english[0].text}
     # Cyrillic-specific glyphs distinguish Russian names from homographs such
     # as Latin "akay", which the Russian engine can otherwise transliterate.
     if ($russian.Count -gt 0 -and $russian[0].text -match '[БГДЁЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯбгдёжзийлпфцчшщъыьэюя]') {$name=Remove-HostLabel $russian[0].text}
     $rowDiagnostics+=@{raw=$row.text;readings=$lineReadings;selected=$name}
     if ($name -and $name.Length -le 64 -and $name -notmatch '[\p{Cc}\p{Cf}]') {$name}
    }
   })
   $output.rosterNames=@($names | Select-Object -First 6)
   if ($output.rosterNames.Count -gt 0) {$output.status='SC2 screen reader active - player rows detected; verify names and identity'}
   break
  }
  if ($Diagnostics) { $output.width=$transform.ScaledWidth;$output.height=$transform.ScaledHeight;$output.readings=$readings;$output.rows=$rowDiagnostics }
  $output | ConvertTo-Json -Depth 8 -Compress
 } finally {$image.Dispose()}
} catch {
 @{status=('SC2 screen reader unavailable - ' + $_.Exception.Message);text=''} | ConvertTo-Json -Compress
} finally {
 if ($stream) {$stream.Dispose()}
}
