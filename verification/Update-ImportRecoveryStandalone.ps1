$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskExe=[IO.Path]::GetFullPath((Join-Path $taskRoot 'Direct Strike Companion.exe'))
$taskUrlFile=Join-Path $taskRoot 'data/running-url.txt'
$taskOldUrl=(Get-Content -LiteralPath $taskUrlFile -Raw).Trim()
$taskProcesses=@(Get-CimInstance Win32_Process -Filter "Name='Direct Strike Companion.exe'" | Where-Object {$_.ExecutablePath -eq $taskExe})
$taskOldHash=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash
if($taskProcesses.Count -eq 1){
    $taskState=Invoke-RestMethod -Uri ($taskOldUrl+'/api/state') -Headers @{'X-DS-Companion'='1'} -TimeoutSec 8
    if($taskState.busy){throw 'Replay import is still active; update deferred.'}
    $taskOldPid=$taskProcesses[0].ProcessId
    Stop-Process -Id $taskOldPid -Force
    Wait-Process -Id $taskOldPid -ErrorAction SilentlyContinue
} elseif($taskProcesses.Count -eq 0){
    $stopped=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'import-recovery-stopped-app.json') -Raw|ConvertFrom-Json
    if(-not $stopped.StoppedForUpdate -or $stopped.Exe -ne $taskExe -or $stopped.Url -ne $taskOldUrl){throw 'Missing verified stopped-app update record.'}
    $taskOldPid=$stopped.Pid
} else {throw 'Multiple companion processes; update deferred.'}
$taskRelease=Join-Path $taskRoot 'release/DirectStrikeCompanion.exe'
for($taskAttempt=0;$taskAttempt -lt 15;$taskAttempt++){
 try{Copy-Item -LiteralPath $taskRelease -Destination $taskExe -Force;break}
 catch [IO.IOException]{if($taskAttempt -eq 14){throw};Start-Sleep -Milliseconds 300}
}
$taskNewHash=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash
if($taskNewHash -ne (Get-FileHash -LiteralPath $taskRelease -Algorithm SHA256).Hash){throw 'Delivered executable differs from checked release.'}
$taskNewProcess=Start-Process -FilePath $taskExe -ArgumentList @('--no-browser','--no-import') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
$taskNewUrl=$null
for($taskAttempt=0;$taskAttempt -lt 40;$taskAttempt++){
 Start-Sleep -Milliseconds 300
 if($taskNewProcess.HasExited){throw 'Updated companion exited during startup.'}
 $taskCandidate=(Get-Content -LiteralPath $taskUrlFile -Raw).Trim()
 if($taskCandidate -ne $taskOldUrl){$taskNewUrl=$taskCandidate;break}
}
if(-not $taskNewUrl){throw 'New companion URL was not published.'}
$taskRunning=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskNewProcess.Id)"
if($taskRunning.ExecutablePath -ne $taskExe){throw 'Updated process path is not the delivered executable.'}
$taskReport=[pscustomobject]@{Success=$true;OldPid=$taskOldPid;NewPid=$taskNewProcess.Id;OldHash=$taskOldHash;NewHash=$taskNewHash;Url=$taskNewUrl;Arguments=@('--no-browser','--no-import')}
$taskReport|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'import-recovery-deployment.json')
$taskReport|ConvertTo-Json
