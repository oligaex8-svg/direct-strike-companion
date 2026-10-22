param([string]$Version = (Get-Date -Format 'yyyy-MM-dd'))
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^[a-zA-Z0-9._-]+$') { throw 'Version must be a simple file-name suffix.' }
. (Join-Path $PSScriptRoot 'InstallationPaths.ps1')
$paths = Get-InstallationPaths $PSScriptRoot
$projectRoot = $paths.SourceRoot
$portableRoot = Assert-InstallationChildPath $paths.InstallRoot (Join-Path $projectRoot 'portable')
$guide = Assert-InstallationChildPath $paths.InstallRoot (Join-Path $paths.ShareRoot 'START-HERE-PORTABLE.txt')
$archivePath = Assert-InstallationChildPath $paths.InstallRoot (Join-Path $paths.ShareRoot "DirectStrikeCompanion-$Version-portable.zip")
$temporaryPath = Assert-InstallationChildPath $paths.InstallRoot "$archivePath.partial"
if (Test-Path -LiteralPath $archivePath) { throw 'That package already exists. Choose a new -Version suffix.' }
if (Test-Path -LiteralPath $temporaryPath) { throw 'A partial package already exists; inspect it before retrying.' }
foreach ($required in @('DirectStrikeCompanion.exe', 'DirectStrikeCompanion.dll', 'DirectStrikeCompanion.deps.json', 'DirectStrikeCompanion.runtimeconfig.json', 'coreclr.dll', 'hostfxr.dll', 'hostpolicy.dll', 'LobbyOcr.ps1', 'wwwroot/index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $portableRoot $required) -PathType Leaf)) { throw "Portable publish is missing $required. Run Build.ps1 -Portable first." }
}
if (-not (Test-Path -LiteralPath $guide -PathType Leaf)) { throw 'Portable instructions are missing.' }
# Walk one level at a time so a directory junction is rejected before traversal.
$pendingDirectories = [Collections.Generic.Queue[string]]::new()
$pendingDirectories.Enqueue($portableRoot)
$portableFiles = @(
    while ($pendingDirectories.Count -gt 0) {
        foreach ($item in (Get-ChildItem -LiteralPath $pendingDirectories.Dequeue() -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse-point content is not allowed in the sharing package: $($item.FullName)" }
            if ($item.PSIsContainer) { $pendingDirectories.Enqueue($item.FullName) } else { $item }
        }
    }
)
$files = @($portableFiles | ForEach-Object {
    $relative = $_.FullName.Substring($portableRoot.Length).TrimStart([char[]]'\/').Replace('\', '/')
    if ($relative -notlike 'test-output/*') { [pscustomobject]@{ File = $_; Relative = $relative } }
})
foreach ($file in $files) {
    if ($file.Relative -match '(^|/)(data|\.sdk|obj|bin|verification)(/|$)|(^|/)(library\.json(\.bak)?|running-url\.txt)$|\.SC2Replay$') { throw "Unexpected private or development file: $($file.Relative)" }
    if (($file.File.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse-point files are not allowed in the sharing package.' }
}
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
$ramUse = 100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize)
if ($ramUse -ge 94 -or $cpu.PercentProcessorTime -ge 90) { throw 'Packaging deferred: current CPU or RAM is above the requested resource budget.' }
Add-Type -AssemblyName System.IO.Compression
$null = Assert-InstallationChildPath $paths.InstallRoot $temporaryPath
$stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($file in $files) {
        $entry = $archive.CreateEntry("DirectStrikeCompanion/$($file.Relative)", [IO.Compression.CompressionLevel]::Fastest)
        $inputStream = $file.File.OpenRead()
        $outputStream = $entry.Open()
        try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
    }
    $guideEntry = $archive.CreateEntry('START-HERE.txt', [IO.Compression.CompressionLevel]::Fastest)
    $inputStream = [IO.File]::OpenRead($guide)
    $outputStream = $guideEntry.Open()
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
} finally { $archive.Dispose(); $stream.Dispose() }
$null = Assert-InstallationChildPath $paths.InstallRoot $archivePath
Move-Item -LiteralPath $temporaryPath -Destination $archivePath
[pscustomobject]@{ archive = $archivePath; entries = $files.Count + 1; bytes = (Get-Item -LiteralPath $archivePath).Length; excludesPrivateData = $true } | ConvertTo-Json -Compress
