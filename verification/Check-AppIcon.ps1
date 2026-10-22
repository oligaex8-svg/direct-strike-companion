$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.Drawing
$taskBytes = [IO.File]::ReadAllBytes((Join-Path $taskRoot 'assets/companion.ico'))
if ([BitConverter]::ToUInt16($taskBytes, 0) -ne 0 -or [BitConverter]::ToUInt16($taskBytes, 2) -ne 1 -or [BitConverter]::ToUInt16($taskBytes, 4) -ne 8) { throw 'Invalid multi-size icon header.' }
$taskSizes = @(16, 20, 24, 32, 48, 64, 128, 256)
$taskFrames = @()
$taskPreview = [Drawing.Bitmap]::new(360, 108)
$taskGraphics = [Drawing.Graphics]::FromImage($taskPreview)
$taskFont = [Drawing.Font]::new('Segoe UI', 10, [Drawing.GraphicsUnit]::Pixel)
try {
    $taskGraphics.Clear([Drawing.ColorTranslator]::FromHtml('#0b111b'))
    for ($taskIndex = 0; $taskIndex -lt $taskSizes.Count; $taskIndex++) {
        $taskEntry = 6 + 16 * $taskIndex
        $taskLength = [BitConverter]::ToUInt32($taskBytes, ($taskEntry + 8))
        $taskOffset = [BitConverter]::ToUInt32($taskBytes, ($taskEntry + 12))
        if ($taskOffset + $taskLength -gt $taskBytes.Length) { throw 'ICO frame exceeds container.' }
        $taskStream = [IO.MemoryStream]::new($taskBytes, $taskOffset, $taskLength)
        $taskFrame = [Drawing.Bitmap]::new($taskStream)
        try {
            $taskSize = $taskSizes[$taskIndex]
            if ($taskFrame.Width -ne $taskSize -or $taskFrame.Height -ne $taskSize -or $taskFrame.GetPixel(0, 0).A -ne 0 -or $taskFrame.GetPixel(($taskSize / 2), ($taskSize / 2)).A -lt 200) { throw 'Incorrect frame size or transparency.' }
            $taskFrames += [pscustomobject]@{Size=$taskSize;Bytes=$taskLength;TransparentCorner=$true;OpaqueCenter=$true}
            if ($taskSize -in @(16, 32, 48, 64)) {
                $taskColumn = (@(16, 32, 48, 64)).IndexOf($taskSize)
                $taskGraphics.DrawImageUnscaled($taskFrame, ($taskColumn * 90 + 12), (78 - $taskSize))
                $taskGraphics.DrawString(($taskSize.ToString() + ' px'), $taskFont, [Drawing.Brushes]::White, ($taskColumn * 90 + 12), 86)
            }
        } finally { $taskFrame.Dispose(); $taskStream.Dispose() }
    }
    $taskPreview.Save((Join-Path $PSScriptRoot 'icon-size-preview.png'), [Drawing.Imaging.ImageFormat]::Png)
} finally { $taskFont.Dispose(); $taskGraphics.Dispose(); $taskPreview.Dispose() }
$taskWebHash = (Get-FileHash -LiteralPath (Join-Path $taskRoot 'wwwroot/companion.png')).Hash
$taskPngHash = (Get-FileHash -LiteralPath (Join-Path $taskRoot 'assets/companion.png')).Hash
if ($taskWebHash -ne $taskPngHash) { throw 'Dashboard icon differs from packaged artwork.' }
[pscustomobject]@{Success=$true;Frames=$taskFrames;PngHash=$taskPngHash;WebAssetMatches=$true} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'icon-assets-checks.json')
'PASS: eight icon sizes retain alpha; dashboard PNG matches; small-size preview saved.'
