$ErrorActionPreference='Stop'
$taskSource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(Test-Path -LiteralPath (Join-Path $taskSource 'Support/Development/DirectStrikeCompanion.csproj')){$taskSource=Join-Path $taskSource 'Support/Development'}
. (Join-Path $taskSource 'InstallationPaths.ps1')
$taskPaths=Get-InstallationPaths $taskSource
$taskRoot=$taskPaths.InstallRoot
$taskExe=Join-Path $taskRoot 'Direct Strike Companion.exe'
$taskRelease=Join-Path $taskSource 'release/DirectStrikeCompanion.exe'
$taskUrlFile=Join-Path $taskRoot 'data/running-url.txt'
$taskHeaders=@{'X-DS-Companion'='1'}
function Read-TaskState {
    $taskUrl=[IO.File]::ReadAllText($taskUrlFile).Trim()
    if($taskUrl -notmatch '^http://127\.0\.0\.1:\d+/?$'){throw 'Invalid local dashboard URL.'}
    Invoke-RestMethod -Uri ($taskUrl.TrimEnd('/')+'/api/state') -Headers $taskHeaders -TimeoutSec 8
}
function Hash-TaskJson($value) {
    $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $value -Depth 100 -Compress))
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
}
$taskBefore=Read-TaskState
if($taskBefore.busy){throw 'Replay import is active; defer this restart.'}
$taskProcesses=@(Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq $taskExe)
if($taskProcesses.Count -ne 1){throw 'Expected exactly one running installed companion.'}
$taskKeys=@($taskBefore.library.settings.PSObject.Properties.Name | Sort-Object)
$taskOldSettings=[ordered]@{}
foreach($key in $taskKeys){$taskOldSettings[$key]=$taskBefore.library.settings.$key}
$taskBaseline=[pscustomobject]@{Matches=$taskBefore.library.matches.Count;MatchHash=Hash-TaskJson $taskBefore.library.matches;MarksHash=Hash-TaskJson $taskBefore.library.marks;SettingsHash=Hash-TaskJson $taskOldSettings;OldExeHash=(Get-FileHash -LiteralPath $taskExe).Hash;ZipHash=(Get-FileHash -LiteralPath (Join-Path $taskPaths.ShareRoot 'DirectStrikeCompanion-2026-10-07-hover-teams-portable.zip')).Hash}
$taskBaseline | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'native-notifications-baseline.json')
Stop-Process -Id $taskProcesses[0].ProcessId
Start-Sleep -Milliseconds 500
Copy-Item -LiteralPath $taskRelease -Destination $taskExe -Force
$taskProcess=Start-Process -FilePath $taskExe -ArgumentList '--no-browser','--no-import' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
$taskAfter=$null
for($attempt=0;$attempt -lt 12;$attempt++){
    Start-Sleep -Milliseconds 500
    try{$taskAfter=Read-TaskState;if($null -ne $taskAfter.lobbyPreferences){break}}catch{}
}
if($null -eq $taskAfter.lobbyPreferences){throw 'New live preferences API did not start.'}
$taskRestoredSettings=[ordered]@{}
foreach($key in $taskKeys){$taskRestoredSettings[$key]=$taskAfter.library.settings.$key}
$taskReport=[pscustomobject]@{ProcessId=$taskProcess.Id;Url=[IO.File]::ReadAllText($taskUrlFile).Trim();Matches=$taskAfter.library.matches.Count;MatchesPreserved=(Hash-TaskJson $taskAfter.library.matches) -eq $taskBaseline.MatchHash;MarksPreserved=(Hash-TaskJson $taskAfter.library.marks) -eq $taskBaseline.MarksHash;ExistingSettingsPreserved=(Hash-TaskJson $taskRestoredSettings) -eq $taskBaseline.SettingsHash;ZipUnchanged=(Get-FileHash -LiteralPath (Join-Path $taskPaths.ShareRoot 'DirectStrikeCompanion-2026-10-07-hover-teams-portable.zip')).Hash -eq $taskBaseline.ZipHash;ExeHash=(Get-FileHash -LiteralPath $taskExe).Hash;ReleaseHash=(Get-FileHash -LiteralPath $taskRelease).Hash;Preferences=$taskAfter.lobbyPreferences}
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'native-notifications-deployment.json')
if(-not($taskReport.MatchesPreserved -and $taskReport.MarksPreserved -and $taskReport.ExistingSettingsPreserved -and $taskReport.ZipUnchanged -and $taskReport.ExeHash -eq $taskReport.ReleaseHash)){throw 'Deployment invariant failed.'}
$taskReport | ConvertTo-Json -Depth 5
