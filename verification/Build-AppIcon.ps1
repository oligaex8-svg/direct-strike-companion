param([string]$SourceImage = (Join-Path $PSScriptRoot '../assets/companion-source.png'))
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskAssets = Join-Path $taskRoot 'assets'
$null = New-Item -ItemType Directory -Path $taskAssets -Force
Add-Type -AssemblyName System.Drawing
# Artwork is generated separately. This script only resizes and packages the
# checked-in RGBA source, preserving transparent corners in every ICO frame.
$taskSource = [Drawing.Image]::FromFile([IO.Path]::GetFullPath($SourceImage))
$taskSizes = @(16, 20, 24, 32, 48, 64, 128, 256)
$taskFrames = [Collections.Generic.List[byte[]]]::new()
try {
    if ($taskSource.Width -ne $taskSource.Height -or $taskSource.Width -lt 256) {
        throw 'Application artwork must be square and at least 256 pixels wide.'
    }
    foreach ($taskSize in $taskSizes) {
        $taskBitmap = [Drawing.Bitmap]::new($taskSize, $taskSize, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
        $taskAttributes = [Drawing.Imaging.ImageAttributes]::new()
        $taskStream = [IO.MemoryStream]::new()
        try {
            $taskGraphics.Clear([Drawing.Color]::Transparent)
            $taskGraphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
            $taskGraphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
            $taskGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $taskGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $taskAttributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $taskGraphics.DrawImage($taskSource, [Drawing.Rectangle]::new(0, 0, $taskSize, $taskSize), 0, 0, $taskSource.Width, $taskSource.Height, [Drawing.GraphicsUnit]::Pixel, $taskAttributes)
            $taskBitmap.Save($taskStream, [Drawing.Imaging.ImageFormat]::Png)
            $taskFrames.Add($taskStream.ToArray())
            if ($taskSize -eq 256) {
                $taskBitmap.Save((Join-Path $taskAssets 'companion.png'), [Drawing.Imaging.ImageFormat]::Png)
                $taskBitmap.Save((Join-Path $taskRoot 'wwwroot/companion.png'), [Drawing.Imaging.ImageFormat]::Png)
            }
        } finally {
            $taskStream.Dispose(); $taskAttributes.Dispose(); $taskGraphics.Dispose(); $taskBitmap.Dispose()
        }
    }
} finally { $taskSource.Dispose() }
$taskOutput = [IO.File]::Create((Join-Path $taskAssets 'companion.ico'))
$taskWriter = [IO.BinaryWriter]::new($taskOutput)
try {
    $taskWriter.Write([uint16]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]$taskSizes.Count)
    $taskOffset = 6 + 16 * $taskSizes.Count
    for ($taskIndex = 0; $taskIndex -lt $taskSizes.Count; $taskIndex++) {
        $taskDimension = if ($taskSizes[$taskIndex] -eq 256) { 0 } else { $taskSizes[$taskIndex] }
        $taskWriter.Write([byte]$taskDimension); $taskWriter.Write([byte]$taskDimension)
        $taskWriter.Write([byte]0); $taskWriter.Write([byte]0)
        $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]32)
        $taskWriter.Write([uint32]$taskFrames[$taskIndex].Length); $taskWriter.Write([uint32]$taskOffset)
        $taskOffset += $taskFrames[$taskIndex].Length
    }
    foreach ($taskFrame in $taskFrames) { $taskWriter.Write($taskFrame) }
} finally { $taskWriter.Dispose() }
Get-Item -LiteralPath (Join-Path $taskAssets 'companion.ico'), (Join-Path $taskAssets 'companion.png') | Select-Object Name, Length
