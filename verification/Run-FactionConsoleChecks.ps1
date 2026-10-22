# One foreground verification run. Completed cases are retained across transient
# resource interruptions; this installs no service or scheduled/recurring task.
param([int]$WaitMinutes=20,[switch]$CpuOnly)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
$taskDeadline=[DateTime]::UtcNow.AddMinutes($WaitMinutes)
$taskHashBytes=[Collections.Generic.List[byte]]::new()
foreach($taskName in @('themes.css','console-layout.css','compact-ui.js','profile-view.js','replays.css','sidebar.css','app.js','index.html','factions.css')){
 if($taskHashBytes.Count){$taskHashBytes.Add(10)}
 $taskHashBytes.AddRange([IO.File]::ReadAllBytes((Join-Path $taskRoot ('wwwroot/'+$taskName))))
}
$taskHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($taskHashBytes.ToArray())).ToLowerInvariant()
$taskReports=[Collections.Generic.List[object]]::new()
foreach($taskViewport in @('1000-en','375-ru')){
 foreach($taskRace in @('protoss','zerg','terran','default')){
  $taskCase=$taskRace+'-'+$taskViewport
  $taskReportPath=Join-Path $PSScriptRoot ('faction-console-'+$taskCase+'.json')
  while($true){
   if(Test-Path -LiteralPath $taskReportPath){
    $taskReport=Get-Content -LiteralPath $taskReportPath -Raw|ConvertFrom-Json
    if($taskReport.success -and $taskReport.themeSourceHash -eq $taskHash){$taskReports.Add($taskReport);Write-Output ('Passed: '+$taskCase);break}
   }
   if([DateTime]::UtcNow -ge $taskDeadline){throw ('Resource headroom deadline reached before '+$taskCase)}
   try{& (Join-Path $PSScriptRoot 'Run-RussianSoundWork.ps1') -Stage FactionConsolesBrowser -FactionCase $taskCase -CpuOnly:$CpuOnly}
   catch{
    if($_.Exception.Message -notmatch 'Resource limit reached|resource limit/deadline'){throw}
    Start-Sleep -Seconds 30
   }
  }
 }
}
$taskResult=[pscustomobject]@{success=$true;themeSourceHash=$taskHash;scope='All nine production categories, each viewport/theme completed under the resource guard; isolated sample data';cases=@($taskReports|ForEach-Object {$_.cases[0]});checkedAt=[DateTime]::UtcNow.ToString('o')}
$taskResult|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'faction-consoles-browser.json')
Write-Output 'All eight faction console cases passed.'
