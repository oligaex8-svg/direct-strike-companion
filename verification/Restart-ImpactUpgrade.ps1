$ErrorActionPreference='Stop'
$taskInstall=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$taskStarted=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'impact-upgrade-start.json') -Raw | ConvertFrom-Json
$taskOldId=[int]$taskStarted.ProcessId
$taskOld=Get-CimInstance Win32_Process -Filter "ProcessId=$taskOldId"
if(!$taskOld -or !$taskOld.ExecutablePath -or !$taskOld.ExecutablePath.StartsWith($taskInstall+'\',[StringComparison]::OrdinalIgnoreCase) -or $taskOld.CommandLine -notmatch '--no-browser'){
    throw 'The task-owned background upgrade host could not be verified; no process was stopped.'
}
$taskExpected=([DateTime]$taskStarted.StartedAt).ToUniversalTime()
if([Math]::Abs(($taskOld.CreationDate.ToUniversalTime()-$taskExpected).TotalSeconds) -gt 10){throw 'Upgrade host process identity changed; no process was stopped.'}
$taskUrl=[Uri]((Get-Content -LiteralPath (Join-Path $taskInstall 'data/running-url.txt') -Raw).Trim())
if($taskUrl.Scheme -ne 'http' -or $taskUrl.Host -ne '127.0.0.1'){throw 'Unexpected local companion address.'}
$taskHeaders=@{'X-DS-Companion'='1'}
$taskDesktop=Invoke-RestMethod -Uri ($taskUrl.AbsoluteUri.TrimEnd('/')+'/api/desktop/status') -Headers $taskHeaders
if($null -ne $taskDesktop){throw 'A dashboard is open; its work must be preserved.'}
$taskProgress=Get-Content -LiteralPath (Join-Path $taskInstall 'data/import-state.json') -Raw | ConvertFrom-Json
if($taskProgress.busy -or !$taskProgress.paused){throw 'Pause and drain the task-owned import before restarting it.'}
# This host was created by Start-ImpactUpgrade, never opened a dashboard, and
# has no decode work in flight. Completed imports are individually journaled.
Stop-Process -Id $taskOldId
Wait-Process -Id $taskOldId -Timeout 10 -ErrorAction SilentlyContinue
if(Get-Process -Id $taskOldId -ErrorAction SilentlyContinue){throw 'Task-owned host has not exited.'}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'impact-upgrade-start.json') -Destination (Join-Path $PSScriptRoot 'impact-upgrade-first-start.json') -Force
& (Join-Path $PSScriptRoot 'Start-ImpactUpgrade.ps1')
[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');StoppedTaskHost=$taskOldId;DashboardWasOpen=$false;ImportWasPaused=$true;CompletedRecordsPreservedByJournal=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'impact-upgrade-restart.json')
