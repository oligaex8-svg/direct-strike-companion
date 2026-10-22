$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $taskRoot 'InstallationPaths.ps1')
$taskPaths=Get-InstallationPaths $taskRoot
$taskRuntime=Assert-InstallationChildPath $taskPaths.InstallRoot (Join-Path $taskPaths.InstallRoot 'data/tools')
$taskScript=Assert-InstallationChildPath $taskPaths.InstallRoot (Join-Path $taskRuntime 'LobbyOcr.ps1')
$taskHelper=Assert-InstallationChildPath $taskPaths.InstallRoot (Join-Path $taskRuntime 'DscCaptureHelper.dll')
$taskOutput=Join-Path $taskRoot 'release/test-output'
$taskTests=Get-Content (Join-Path $taskOutput 'reader-package-tests.json') -Raw | ConvertFrom-Json
$taskEmbedded=Get-Content (Join-Path $taskOutput 'embedded-ocr.json') -Raw | ConvertFrom-Json
$taskTemp=Get-Content (Join-Path $taskOutput 'lobby-reader-unusable-temp.json') -Raw | ConvertFrom-Json
if(-not $taskTests.success -or -not $taskTemp.success -or -not $taskTemp.unusableTemp -or -not $taskEmbedded.helperSha256){throw 'Current compiled-helper acceptance checks have not passed'}
function Read-TaskHash([string]$Path){
 $taskHash=[Security.Cryptography.SHA256]::Create()
 try{[BitConverter]::ToString($taskHash.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-','')}finally{$taskHash.Dispose()}
}
$taskNewScript=Join-Path $taskOutput 'bundled-LobbyOcr.ps1'
$taskNewHelper=Join-Path $taskOutput 'DscCaptureHelper.dll'
if((Read-TaskHash $taskNewScript) -ne $taskEmbedded.sha256 -or (Read-TaskHash $taskNewHelper) -ne $taskEmbedded.helperSha256 -or $taskTemp.scriptHash -ne $taskEmbedded.sha256){throw 'Validated script/helper bytes differ'}
$taskActive=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -match 'Direct.*Strike.*Companion|^SC2(_x64)?\.exe$'} | Select-Object ProcessId,Name)
$taskStamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$taskBackup=Join-Path $PSScriptRoot ('runtime-reader-before-'+$taskStamp+'.ps1')
Copy-Item -LiteralPath $taskScript -Destination $taskBackup
if(Test-Path -LiteralPath $taskHelper){Copy-Item -LiteralPath $taskHelper -Destination (Join-Path $PSScriptRoot ('runtime-helper-before-'+$taskStamp+'.dll'))}
# Load-bytes avoids a DLL lock. Publishing the helper before an atomic script
# replacement lets the existing failed worker recover on its next normal read.
foreach($taskPair in @(@($taskNewHelper,$taskHelper),@($taskNewScript,$taskScript))){
 $taskStage=$taskPair[1]+'.repair-'+[Guid]::NewGuid().ToString('N')
 [IO.File]::WriteAllBytes($taskStage,[IO.File]::ReadAllBytes($taskPair[0]))
 [IO.File]::Move($taskStage,$taskPair[1],$true)
}
$taskReport=[pscustomobject]@{
 At=[DateTime]::UtcNow.ToString('o');Script=$taskScript;ScriptHash=(Read-TaskHash $taskScript)
 Helper=$taskHelper;HelperHash=(Read-TaskHash $taskHelper);PreviousScript=$taskBackup
 ProcessesPreserved=@($taskActive | Where-Object {-not (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)}).Count -eq 0
 RestartedProcesses=$false;AcceptanceAssertions=$taskTests.checks.Count
}
$taskReport | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'compiled-reader-runtime-repair.json') -Encoding UTF8
$taskReport | ConvertTo-Json
