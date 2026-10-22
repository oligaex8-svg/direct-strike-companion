param([ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')][string]$Milestone='compact-background-lobby',[switch]$PreserveUserArchives)
$ErrorActionPreference = 'Stop'
$taskSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $taskSource 'InstallationPaths.ps1')
$taskPaths = Get-InstallationPaths $taskSource
$taskRoot = $taskPaths.InstallRoot
$taskExe = Assert-InstallationChildPath $taskRoot (Join-Path $taskRoot 'Direct Strike Companion.exe')
$taskRelease = Assert-InstallationChildPath $taskRoot (Join-Path $taskSource 'release/DirectStrikeCompanion.exe')
$taskBackup = Assert-InstallationChildPath $taskRoot (Join-Path $taskRoot ('Support/Older versions/Direct Strike Companion-before-' + $Milestone + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.exe'))
$taskLibrary = Assert-InstallationChildPath $taskRoot (Join-Path $taskRoot 'data/library.json')
if (-not (Test-Path -LiteralPath $taskExe -PathType Leaf) -or -not (Test-Path -LiteralPath $taskRelease -PathType Leaf) -or (Test-Path -LiteralPath $taskBackup)) { throw 'Expected release/installation paths are unavailable.' }
$taskTests = Get-Content -LiteralPath (Join-Path $PSScriptRoot ('self-tests-' + $Milestone + '.json')) -Raw | ConvertFrom-Json
if (-not $taskTests.success) { throw 'Self-tests must pass before installation.' }
$taskLibraryBefore = (Get-FileHash -LiteralPath $taskLibrary).Hash
$taskArchiveBefore = @(Get-ChildItem -LiteralPath $taskPaths.ShareRoot -Filter '*.zip' -File | ForEach-Object { [pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash} })
$taskRunning = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase) -and $_.Name -like '*Direct*Strike*Companion*' } | Select-Object -ExpandProperty ProcessId)
# Moving this one verified file keeps a running image and unsaved dashboard open.
# If Windows refuses the rename, leave the installed app untouched; never stop it.
Move-Item -LiteralPath $taskExe -Destination $taskBackup
try {
    Copy-Item -LiteralPath $taskRelease -Destination $taskExe
    if ((Get-FileHash -LiteralPath $taskExe).Hash -ne (Get-FileHash -LiteralPath $taskRelease).Hash) { throw 'Installed EXE does not match the verified release.' }
} catch {
    if (Test-Path -LiteralPath $taskExe) { Remove-Item -LiteralPath $taskExe }
    Move-Item -LiteralPath $taskBackup -Destination $taskExe
    throw
}
& (Join-Path $taskSource 'Update-Launcher.ps1')
& (Join-Path $PSScriptRoot 'Check-LauncherLayout.ps1') -PreserveUserArchives:$PreserveUserArchives | Out-Null
$taskReport = [pscustomobject]@{
    At=[DateTime]::UtcNow.ToString('o')
    InstalledExe=$taskExe
    InstalledHash=(Get-FileHash -LiteralPath $taskExe).Hash
    ReleaseHash=(Get-FileHash -LiteralPath $taskRelease).Hash
    PreviousExe=$taskBackup
    RunningProcessesPreserved=@($taskRunning | Where-Object { -not (Get-Process -Id $_ -ErrorAction SilentlyContinue) }).Count -eq 0
    RestartRequired=$taskRunning.Count -gt 0
    LibraryHashUnchanged=(Get-FileHash -LiteralPath $taskLibrary).Hash -eq $taskLibraryBefore
    ArchivesUnchanged=@($taskArchiveBefore | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -eq 0
    ArchiveCountUnchanged=(Get-ChildItem -LiteralPath $taskPaths.ShareRoot -Filter '*.zip' -File).Count -eq $taskArchiveBefore.Count
}
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot ($Milestone + '-installation.json'))
if (-not ($taskReport.RunningProcessesPreserved -and $taskReport.ArchivesUnchanged -and $taskReport.ArchiveCountUnchanged)) { throw 'Sound release verification failed.' }
$taskReport | ConvertTo-Json
