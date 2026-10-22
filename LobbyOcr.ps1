param([string]$ImagePath, [switch]$Diagnostics, [string]$CaptureExecutable, [switch]$Worker, [string]$CaptureHelperPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$helperPath=if ([string]::IsNullOrWhiteSpace($CaptureHelperPath)) {Join-Path $PSScriptRoot 'DscCaptureHelper.dll'} else {[System.IO.Path]::GetFullPath($CaptureHelperPath)}
if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
 throw "The bundled screen capture helper is missing: $helperPath. Restart Direct Strike Companion to restore its reader files, or reinstall the complete portable package."
}
try {
 $null=[System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($helperPath))
} catch {
 throw "The bundled screen capture helper could not be loaded: $helperPath. Restart Direct Strike Companion or reinstall the complete portable package. $($_.Exception.Message)"
}
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
function Join-DscNameLines([string[]]$Lines) {
 (($Lines | Where-Object {$_.Trim() -notmatch '^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+$'}) -join ' ').Trim()
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
   # Ignore complete bracketed tag lines in a name crop; never infer a tag
   # from a bare word, which may be part of a player's spaced nickname.
   @{language=$item.language;text=(Join-DscNameLines @($nameResult.Lines | ForEach-Object {$_.Text}))}
  }
 } finally {
  if ($nameImage) {$nameImage.Dispose()}
  $nameStream.Dispose()
 }
}
function Get-DscLobbyPanels($Reading, [int]$Width, [int]$Height) {
 $map=@($Reading.lines | Where-Object {$_.words.Count -gt 0 -and $_.text -match '^Direct\s+Strike\b' -and $_.text -notmatch '(?i)Companion' -and $_.words[0].x -lt $Width*.5 -and $_.words[0].y -lt $Height*.2})
 $mode=@($Reading.lines | Where-Object {$_.text -match '^(?:3\s*V\s*3\s+(Commanders|Commarndeps|Командиры)|8\s*V\s*3\s+Commanders)(?:\s+[V▼∨])?$'})
 $first=@($Reading.lines | Where-Object {$_.words.Count -gt 0 -and $_.text -match '^(Horde|Hopde|Орда)$' -and $_.words[0].x -lt $Width*.5})
 $second=@($Reading.lines | Where-Object {$_.words.Count -gt 0 -and $_.text -match '^(Alliance|Альянс)$' -and $_.words[0].x -lt $Width*.5})
 if ($Width -le 0 -or $Height -le 0 -or $map.Count -eq 0 -or $first.Count -ne 1 -or $second.Count -ne 1) {return $null}
 $start=$first[0].words[0];$end=$second[0].words[0];$gap=$end.y-$start.y
 if ($gap -lt $Height*.15 -or $gap -gt $Height*.5 -or [Math]::Abs($start.x-$end.x) -gt $Width*.05) {return $null}
 # A covered mode field does not hide the names in the two team panels. This
 # is name-only evidence: mode eligibility and automatic input use their own
 # independent proof checks and must not be inferred from these panel labels.
 return @{start=$start;end=$end;gap=$gap;modeVerified=($mode.Count -gt 0)}
}
function Get-DscLobbyRegion([object[]]$Readings, [int]$Width, [int]$Height) {
 $regions=@(foreach ($reading in $Readings) {
  if (-not (Get-DscLobbyPanels $reading $Width $Height)) {continue}
  # Only the settings field beside Game Server supplies region evidence. The
  # observed Russian engine reads that English label as Game Sewer•.
  $labels=@($reading.lines | Where-Object {$_.words.Count -gt 0 -and $_.text -match '^(Game (Server|Sewer)[•]?|Игровой сервер|Сервер игры)$' -and $_.words[0].x -gt $Width*.5})
  foreach ($label in $labels) {
   $anchor=$label.words[0];$right=($label.words | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
   foreach ($line in $reading.lines) {
    if ($line.words.Count -eq 0) {continue}
    $word=$line.words[0]
    if ($word.x -le $right -or $word.x -gt $Width*.82 -or [Math]::Abs($word.y-$anchor.y) -gt [Math]::Max($word.height,$anchor.height)*1.5) {continue}
    $value=$line.text.Trim()
    if ($value -match '^(Central |Western |Eastern )?Europe(?:\s*[\[(].*)?(?:\s+[V▼∨])?$') {'EU'}
    elseif ($value -match '^(?:(Eastern|Central|Western) United States|United States|Brazil|Australia)(?:\s*[\[(].*)?(?:\s+[V▼∨])?$') {'Americas'}
   }
  }
 })
 $regions=@($regions | Select-Object -Unique)
 if ($regions.Count -eq 1) {return $regions[0]}
 return $null
}
function Get-DscLobbyRows($Reading, $Panels, [int]$Width) {
 $start=$Panels.start;$gap=$Panels.gap
 $minX=$start.x+$Width*.03;$maxX=$start.x+$Width*.35
 $nameAnchorRight=$start.x+$Width*.08
 $team=0
 foreach($panel in @($Panels.start,$Panels.end)){
  $team++
  $rows=@(foreach($line in $Reading.lines){
   $words=@($line.words | Where-Object {$_.x -ge $minX -and $_.x+$_.width -le $maxX -and $_.y -gt $panel.y+$gap*.12 -and $_.y -lt $panel.y+$gap*.86} | Sort-Object {$_.x})
   if($words.Count -eq 0 -or $words[0].x -gt $nameAnchorRight){continue}
   # Whole-frame OCR can merge a player's line with a distant overlay label.
   $nameWords=@($words[0]);$previous=$words[0]
   foreach($word in @($words | Select-Object -Skip 1)){
    if($word.x-($previous.x+$previous.width) -gt [Math]::Max($word.height,$previous.height)*4){break}
    $nameWords+=$word;$previous=$word
   }
   $raw=($nameWords | ForEach-Object {$_.text}) -join ' '
   if($raw -match '^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+$' -or $raw -match '^(Open|Closed|Empty|Computer|A[.]?I[.]?|Открыто|Закрыто|Компьютер)(\s|$)' -or $raw -match '^(Select|Выбрать)$'){continue}
   @{text=$raw;words=$nameWords;y=$nameWords[0].y;team=$team}
  })
  $rows | Sort-Object {$_.y} | Select-Object -First 3
 }
}
function Get-DscCombinedLobbyRows($Primary, [object[]]$Readings, $Panels, [int]$Width, [int]$Height) {
 $rows=@(Get-DscLobbyRows $Primary $Panels $Width)
 foreach($reading in $Readings){
  if($reading.language -eq $Primary.language){continue}
  $alternate=Get-DscLobbyPanels $reading $Width $Height
  if(-not $alternate){continue}
  # Another recognizer can locate a short name skipped by the primary engine.
  # Require the same two validated panels, then refine those exact pixels in
  # the primary language; another engine's alphabet is only a locator here.
  $samePanels=$true
  foreach($key in @('start','end')){
   $tolerance=[Math]::Max($Panels[$key].height,$alternate[$key].height)
   if([Math]::Abs($Panels[$key].x-$alternate[$key].x) -gt $tolerance -or
      [Math]::Abs($Panels[$key].y-$alternate[$key].y) -gt $tolerance){$samePanels=$false;break}
  }
  if(-not $samePanels){continue}
  foreach($row in @(Get-DscLobbyRows $reading $alternate $Width)){
   if(@($rows | Where-Object {$_.team -eq $row.team}).Count -ge 3){continue}
   $overlap=@($rows | Where-Object {$_.team -eq $row.team -and
      [Math]::Abs($_.y-$row.y) -le [Math]::Max($_.words[0].height,$row.words[0].height)*1.5})
   if($overlap.Count){continue}
   $row.supplemental=$true
   $rows+=$row
  }
 }
 $rows | Sort-Object {$_.team},{$_.y}
}
function Remove-HostLabel([string]$value) {
 $value=($value -replace '\s*\((?:Host|Хозяин|Создатель)\)\s*$','').Trim()
 ($value -replace '^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+','').Trim()
}
function Select-DscNameReading([string]$Raw, [object[]]$Readings) {
 $original=Remove-HostLabel $Raw
 $english=@($Readings | Where-Object {$_.language -like 'en*' -and $_.text} | Select-Object -First 1)
 $russian=@($Readings | Where-Object {$_.language -like 'ru*' -and $_.text} | Select-Object -First 1)
 $name=if($english.Count){Remove-HostLabel $english[0].text}else{$original}
 $originalCyrillic=$original -match '[\p{IsCyrillic}]'
 $latinAgreement=-not $originalCyrillic -and ($name -replace '\s','') -ieq ($original -replace '\s','')
 if($russian.Count){
  $candidate=Remove-HostLabel $russian[0].text
  $specific='[БГДЁЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯбгдёжзийлпфцчшщъыьэюя]'
  $distinctive=[regex]::Matches($candidate,$specific).Count
  $letterCount=[regex]::Matches($candidate,'\p{L}').Count
  # Spaced Cyrillic names often become mixed-case Latin transliterations in
  # the English engine. Preserve an ordinary Latin reading, but use the full
  # Russian phrase when its case and glyph evidence explain that artifact.
  $phraseEvidence=$candidate -cmatch '^[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)+$' -and
      $name -cmatch '[A-Z]{3,}' -and $name -cmatch '[a-z]' -and $distinctive -ge 2
  # A lone misread Cyrillic letter in an otherwise Latin name is insufficient.
  # Also reject a language engine that dropped most of the observed line.
  $coverage=($candidate -replace '\s','').Length -ge ($name -replace '\s','').Length*.65
  if(( -not $latinAgreement -or $phraseEvidence) -and $coverage -and
     ($originalCyrillic -or $phraseEvidence -or ($distinctive -ge 2 -and $distinctive -ge $letterCount*.3))){$name=$candidate}
 }
 if($originalCyrillic -and $name -notmatch '[\p{IsCyrillic}]'){return $original}
 # Recognition may repair glyphs and case, but must not silently discard a
 # surname. Whitespace-only repairs remain in LobbyService's exact alias rule.
 $originalCompact=$original -replace '\s','';$nameCompact=$name -replace '\s',''
 $originalWords=@($original -split '\s+' | Where-Object {$_})
 $nameWords=@($name -split '\s+' | Where-Object {$_})
 if($nameCompact.Length -lt $originalCompact.Length*.65 -or
    ($nameWords.Count -lt $originalWords.Count -and $nameCompact -ine $originalCompact)){return $original}
 return $name
}
function Initialize-DscEngines {
 $available=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
 $languages=@($available | Where-Object {$_.LanguageTag -like 'en*'} | Select-Object -First 1)
 $languages+=@($available | Where-Object {$_.LanguageTag -like 'ru*'} | Select-Object -First 1)
 if ($languages.Count -eq 0) { throw 'Install an English or Russian OCR language pack in Windows Settings.' }
 @(foreach ($language in $languages) {
  $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  if ($engine) { @{language=$language.LanguageTag;engine=$engine} }
 })
}
function Read-DscFrame([string]$ImagePath, [switch]$Diagnostics, [string]$CaptureExecutable) {
[DscCapture]::ReleaseProof()
$stream=$null
$capture=@{live=$false}
try {
 if (-not $ImagePath) {
  $null=[DscCapture]::SetProcessDPIAware()
  $windows=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^SC2(_x64)?$' -and $_.MainWindowHandle -ne [IntPtr]::Zero})
  if ($windows.Count -eq 0) { @{status='SC2 window unavailable - start SC2 and open the lobby';text=''} | ConvertTo-Json -Compress; return }
  $foreground=[DscCapture]::GetForegroundWindow()
  $selected=@($windows | Where-Object {$_.MainWindowHandle -eq $foreground})
  if ($selected.Count -eq 0) { $selected=@($windows | Where-Object { [DscCapture]::IsWindowVisible($_.MainWindowHandle)}) }
  if ($selected.Count -eq 0) { @{status='SC2 window minimized or hidden - restore it to read the lobby';text=''} | ConvertTo-Json -Compress; return }
  if ($selected.Count -ne 1) { @{status='Multiple SC2 windows - put the intended lobby in the foreground';text=''} | ConvertTo-Json -Compress; return }
  $handle=$selected[0].MainWindowHandle
  $rect=New-Object DscCapture+Rect
  if (-not [DscCapture]::CaptureBounds($handle,[ref]$rect)) { throw 'SC2 window bounds unavailable' }
  $width=$rect.Right-$rect.Left
  $height=$rect.Bottom-$rect.Top
  if ($width -lt 100 -or $height -lt 100 -or $width -gt 8000 -or $height -gt 8000) { throw 'SC2 window size unavailable' }
  $unobscured=(-not [DscCapture]::IsIconic($handle) -and [DscCapture]::Unobscured($handle,$rect))
  if (-not $unobscured -and $CaptureExecutable -and (Test-Path -LiteralPath $CaptureExecutable -PathType Leaf)) {
   $windowCaptureAt=[DateTime]::UtcNow.ToString('o')
   $windowImage=& $CaptureExecutable --capture-sc2-window $handle.ToInt64() | ConvertFrom-Json
   if (-not $windowImage.success) { @{status=('SC2 background capture unavailable - '+$windowImage.error);text=''} | ConvertTo-Json -Compress; return }
   if ($windowImage.borderless -ne $true) { @{status='SC2 background capture unavailable - Windows did not enable reading without a capture border; the last lobby is retained.';text=''} | ConvertTo-Json -Compress; return }
   $windowAfter=New-Object DscCapture+Rect
   [uint32]$windowPid=0
   $null=[DscCapture]::GetWindowThreadProcessId($handle,[ref]$windowPid)
   if ($windowPid -ne $selected[0].Id -or -not [DscCapture]::CaptureBounds($handle,[ref]$windowAfter) -or $windowAfter.Left -ne $rect.Left -or $windowAfter.Top -ne $rect.Top -or $windowAfter.Right -ne $rect.Right -or $windowAfter.Bottom -ne $rect.Bottom) {
    @{status='SC2 window changed during background capture - retaining the last lobby';text=''} | ConvertTo-Json -Compress; return
   }
   $imageBytes=[Convert]::FromBase64String($windowImage.imageBase64)
   $capture=@{live=$true;capturedAt=$windowCaptureAt;windowHandle=$handle.ToInt64();processId=$selected[0].Id;processName=$selected[0].ProcessName;foreground=$false;unobscured=$false;method='window';borderless=$true;bounds=@{left=$rect.Left;top=$rect.Top;right=$rect.Right;bottom=$rect.Bottom}}
  } else {
  if (-not $unobscured) { @{status='SC2 window capture unavailable - restore the game to read the lobby';text=''} | ConvertTo-Json -Compress; return }
  $bitmap=New-Object System.Drawing.Bitmap($width,$height)
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $capturedAt=[DateTime]::UtcNow.ToString('o')
  try { $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size) } finally {$graphics.Dispose()}
  $after=New-Object DscCapture+Rect
  if ([DscCapture]::IsIconic($handle) -or -not [DscCapture]::GetWindowRect($handle,[ref]$after) -or $after.Left -ne $rect.Left -or $after.Top -ne $rect.Top -or $after.Right -ne $rect.Right -or $after.Bottom -ne $rect.Bottom -or -not [DscCapture]::Unobscured($handle,$after)) {
   $bitmap.Dispose()
   @{status='SC2 window changed or became covered during capture - waiting for a readable lobby';text=''} | ConvertTo-Json -Compress; return
  }
  $memory=New-Object System.IO.MemoryStream
  try {$bitmap.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png)} finally {$bitmap.Dispose()}
  try {$imageBytes=$memory.ToArray()} finally {$memory.Dispose()}
  $capture=@{live=$true;capturedAt=$capturedAt;windowHandle=$handle.ToInt64();processId=$selected[0].Id;processName=$selected[0].ProcessName;foreground=($foreground -eq $handle -and [DscCapture]::GetForegroundWindow() -eq $handle);unobscured=$true;bounds=@{left=$rect.Left;top=$rect.Top;right=$rect.Right;bottom=$rect.Bottom}}
  }
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
  $engines=$script:DscOcrEngines
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
  $output=@{status='SC2 screen reader active - waiting for Direct Strike lobby rows';text=$text;rosterNames=@();rosterTeams=@()}
  $capture.width=[int]$image.PixelWidth
  $capture.height=[int]$image.PixelHeight
  $output.capture=$capture
  # Geometry is needed for safe opt-in actions. ImagePath fixtures are explicitly
  # non-live, and bounded lines/words cannot become an input source by themselves.
  $output.screenReadings=@(foreach ($reading in $readings) {
   @{language=$reading.language;lines=@(foreach ($line in @($reading.lines | Select-Object -First 160)) {
    $entry=@{text=$line.text;words=@($line.words | Select-Object -First 24)}
    # Context and own-name pixels also authorize input; capture each bounded
    # line rather than silently omitting a new heading or local player name.
    if ($line.words.Count -gt 0) {
     $proofLeft=[Math]::Max(0,[int][Math]::Floor((($line.words | ForEach-Object {$_.x} | Measure-Object -Minimum).Minimum)/$scale)-2)
     $proofTop=[Math]::Max(0,[int][Math]::Floor((($line.words | ForEach-Object {$_.y} | Measure-Object -Minimum).Minimum)/$scale)-2)
     $proofRight=[Math]::Min([int]$decoder.PixelWidth,[int][Math]::Ceiling((($line.words | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum)/$scale)+2)
     $proofBottom=[Math]::Min([int]$decoder.PixelHeight,[int][Math]::Ceiling((($line.words | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum)/$scale)+2)
     $proofWidth=$proofRight-$proofLeft;$proofHeight=$proofBottom-$proofTop
     if ($proofWidth -gt 0 -and $proofHeight -gt 0 -and $proofWidth*$proofHeight -le 100000 -and $proofWidth -le 2000 -and $proofHeight -le 256) {
      if ($capture.live) {
       $entry.proof=@{left=$proofLeft;top=$proofTop;width=$proofWidth;height=$proofHeight;hash=[DscCapture]::RegionHash($imageBytes,$proofLeft,$proofTop,$proofWidth,$proofHeight)}
       $glyphMask=[DscCapture]::RegionGlyphMask($imageBytes,$proofLeft,$proofTop,$proofWidth,$proofHeight)
       if ($glyphMask) { $entry.proof.glyphMask=$glyphMask }
      }
      if ($line.text.Trim() -match '^(?i)(Accept|Принять)$') { $entry.acceptGold=[DscCapture]::AcceptGold($imageBytes,$proofLeft,$proofTop,$proofWidth,$proofHeight) }
     }
    }
    $entry
   })}
  })
  if ([string]::IsNullOrWhiteSpace($text)) { $output.status='SC2 capture has no readable text - waiting for visible lobby text' }
  $rowDiagnostics=@()
  foreach ($reading in $readings) {
   # Require the map and two roster panels together. Reading arbitrary
   # screen text or a joined-lobby chat message must never create a player row.
   # The supplied 3v3 lobby reads as 8V3 Commanders in English and
   # 3V3 Commarndeps in Russian. Keep this repair within the guarded layout.
   $panels=Get-DscLobbyPanels $reading $image.PixelWidth $image.PixelHeight
   if (-not $panels) {continue}
   $playerRows=@(foreach ($row in @(Get-DscCombinedLobbyRows $reading $readings $panels $image.PixelWidth $image.PixelHeight)) {
     $wordLeft=($row.words | ForEach-Object {$_.x} | Measure-Object -Minimum).Minimum
     $left=[Math]::Max(0,[int](($wordLeft-5)/$scale))
     $top=[Math]::Max(0,[int](($row.y-6)/$scale))
     $bottom=($row.words | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
     $wordRight=($row.words | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
     $cropWidth=[Math]::Min([int](($wordRight+6)/$scale)-$left,[int]$decoder.PixelWidth-$left)
     $cropHeight=[Math]::Min([int](($bottom-$row.y+12)/$scale),[int]$decoder.PixelHeight-$top)
     $hostSuffix=if ($row.text -match '\(Host\)$') {6} else {0}
     $lineBytes=[DscCapture]::NameImage($imageBytes,$left,$top,$cropWidth,$cropHeight,$hostSuffix)
     $lineReadings=@(Read-NameLine $lineBytes $engines)
     $selectionRaw=$row.text
     if($row.supplemental){
      $primaryCrop=@($lineReadings | Where-Object {$_.language -eq $reading.language -and $_.text})
      if($primaryCrop.Count){$selectionRaw=$primaryCrop[0].text}
     }
     $name=Select-DscNameReading $selectionRaw $lineReadings
     $rowDiagnostics+=@{raw=$row.text;readings=$lineReadings;selected=$name}
     if ($name -and $name.Length -le 64 -and $name -notmatch '[\p{Cc}\p{Cf}]') {@{name=$name;team=$row.team}}
   })
   $output.rosterNames=@($playerRows | Select-Object -First 6 | ForEach-Object {$_.name})
   $output.rosterTeams=@($playerRows | Select-Object -First 6 | ForEach-Object {$_.team})
   $output.modeVerified=$panels.modeVerified
   if ($output.rosterNames.Count -gt 0) {$output.status='SC2 screen reader active - player rows detected; verify names and identity'}
   break
  }
  if ($output.rosterNames.Count -gt 0) {$output.region=Get-DscLobbyRegion $readings $image.PixelWidth $image.PixelHeight}
  if ($Diagnostics) { $output.width=$transform.ScaledWidth;$output.height=$transform.ScaledHeight;$output.readings=$readings;$output.rows=$rowDiagnostics;$output.runtime=@{version=$PSVersionTable.PSVersion.ToString()} }
  $output | ConvertTo-Json -Depth 8 -Compress
 } finally {$image.Dispose()}
} catch {
 @{status=('SC2 screen reader unavailable - ' + $_.Exception.Message);text='';fatal=$true} | ConvertTo-Json -Compress
} finally {
 [DscCapture]::ReleaseProof()
 if ($stream) {$stream.Dispose()}
}
}
try {
 $script:DscOcrEngines=@(Initialize-DscEngines)
 if($script:DscOcrEngines.Count -eq 0){throw 'Windows did not create an English or Russian OCR recognizer'}
 if($Worker){
  [Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
  [Console]::WriteLine((@{ready=$true;protocol=1} | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  while($null -ne ($requestLine=[Console]::In.ReadLine())){
   if($requestLine.Length -gt 16384){throw 'Reader request exceeds the protocol limit'}
   $request=$requestLine | ConvertFrom-Json
   $requestId=[string]$request.requestId
   if(-not $requestId -or $requestId.Length -gt 64){throw 'Reader request has no valid identifier'}
   $frameClock=[Diagnostics.Stopwatch]::StartNew()
   $frameJson=Read-DscFrame -ImagePath ([string]$request.imagePath) -Diagnostics:([bool]$request.diagnostics) -CaptureExecutable $CaptureExecutable
   $frame=$frameJson | ConvertFrom-Json
   if($frame.fatal){throw $frame.status}
   [Console]::WriteLine((@{requestId=$requestId;result=$frame;readerElapsedMs=[Math]::Round($frameClock.Elapsed.TotalMilliseconds,2)} | ConvertTo-Json -Depth 10 -Compress))
   [Console]::Out.Flush()
  }
 } else {
  Read-DscFrame -ImagePath $ImagePath -Diagnostics:$Diagnostics -CaptureExecutable $CaptureExecutable
 }
} catch {
 if($Worker){[Console]::Error.WriteLine(('SC2 reader worker failed: '+$_.Exception.Message));exit 1}
 @{status=('SC2 screen reader unavailable - '+$_.Exception.Message);text=''} | ConvertTo-Json -Compress
}
