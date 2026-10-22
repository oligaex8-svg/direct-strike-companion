$ErrorActionPreference = 'Stop'
$taskSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $taskSource 'InstallationPaths.ps1')
$taskPaths = Get-InstallationPaths $taskSource
$taskRoot = $taskPaths.InstallRoot
$taskExe = Assert-InstallationChildPath $taskRoot (Join-Path $taskRoot 'Direct Strike Companion.exe')
$taskRelease = Assert-InstallationChildPath $taskRoot (Join-Path $taskSource 'release/DirectStrikeCompanion.exe')
$taskLibrary = Assert-InstallationChildPath $taskRoot (Join-Path $taskRoot 'data/library.json')
$taskProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)
})
if ($taskProcesses.Count -gt 0) { throw 'An installation process is running; leave it open and defer file replacement.' }
$taskLibraryHash = (Get-FileHash -LiteralPath $taskLibrary).Hash
$taskArchives = @(Get-ChildItem -LiteralPath $taskPaths.ShareRoot -File -Filter '*.zip' | ForEach-Object {
    [pscustomobject]@{Name=$_.Name;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}
})
Copy-Item -LiteralPath $taskRelease -Destination $taskExe -Force
& (Join-Path $taskSource 'Update-Launcher.ps1')
& (Join-Path $PSScriptRoot 'Check-LauncherLayout.ps1') | Out-Null
$taskReport = [pscustomobject]@{
    At=[DateTime]::UtcNow.ToString('o')
    InstalledExe=$taskExe
    InstalledHash=(Get-FileHash -LiteralPath $taskExe).Hash
    ReleaseHash=(Get-FileHash -LiteralPath $taskRelease).Hash
    DataUnchanged=(Get-FileHash -LiteralPath $taskLibrary).Hash -eq $taskLibraryHash
    ArchivesUnchanged=@($taskArchives | Where-Object {
        (Get-FileHash -LiteralPath (Join-Path $taskPaths.ShareRoot $_.Name)).Hash -ne $_.Hash
    }).Count -eq 0
    ArchiveCount=(Get-ChildItem -LiteralPath $taskPaths.ShareRoot -File -Filter '*.zip').Count
    AppStarted=$false
}
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'folder-layout-installation.json')
if (-not ($taskReport.InstalledHash -eq $taskReport.ReleaseHash -and $taskReport.DataUnchanged -and $taskReport.ArchivesUnchanged -and
    $taskReport.ArchiveCount -eq $taskArchives.Count)) { throw 'Organized installation verification failed.' }
$taskReport | ConvertTo-Json
