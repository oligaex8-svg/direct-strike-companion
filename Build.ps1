param([switch]$SingleFile, [switch]$Portable)
$ErrorActionPreference = 'Stop'
if ($SingleFile -and $Portable) { throw 'Choose either -SingleFile or -Portable.' }
. (Join-Path $PSScriptRoot 'InstallationPaths.ps1')
$paths = Get-InstallationPaths $PSScriptRoot
$projectRoot = $paths.SourceRoot
$publishRoot = Join-Path $projectRoot $(if ($SingleFile) { 'release' } elseif ($Portable) { 'portable' } else { 'dist' })
foreach ($output in @($publishRoot, (Join-Path $projectRoot 'bin'), (Join-Path $projectRoot 'obj'))) {
    Assert-InstallationOutputTree $paths.InstallRoot $output
}
$installedExe = Assert-InstallationChildPath $paths.InstallRoot (Join-Path $paths.InstallRoot 'Direct Strike Companion.exe')
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
$ramUse = 100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize)
if ($ramUse -ge 98 -or $cpu.PercentProcessorTime -ge 90) { throw 'Build deferred: current CPU or RAM is above the requested resource budget.' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$sdk = Join-Path $projectRoot '.sdk\dotnet.exe'
if (-not (Test-Path -LiteralPath $sdk)) { $sdk = 'dotnet' }
$publishArgs = @('publish', (Join-Path $projectRoot 'DirectStrikeCompanion.csproj'), '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '--disable-build-servers', '-m:1', '/p:UseSharedCompilation=false', '-o', $publishRoot)
if ($SingleFile) { $publishArgs += @('/p:PublishSingleFile=true', '/p:IncludeNativeLibrariesForSelfExtract=true', '/p:DebugType=embedded') }
elseif ($Portable) { $publishArgs += @('/p:PublishSingleFile=false', '/p:IncludeNativeLibrariesForSelfExtract=false', '/p:DebugType=embedded') }
& $sdk @publishArgs
if ($LASTEXITCODE -ne 0) { throw 'Publish failed.' }
if ($SingleFile) {
    $null = Assert-InstallationChildPath $paths.InstallRoot $installedExe
    Copy-Item -LiteralPath (Join-Path $publishRoot 'DirectStrikeCompanion.exe') -Destination $installedExe -Force
    & (Join-Path $projectRoot 'Update-Launcher.ps1')
}
