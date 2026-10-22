$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOcr=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'nickname-full-lobby-output.txt') -Raw | ConvertFrom-Json
$taskCrop=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'nickname-ocr-readings.json') -Raw | ConvertFrom-Json
$taskEmbedded=Get-Content -LiteralPath (Join-Path $taskRoot 'release/test-output/embedded-ocr.json') -Raw | ConvertFrom-Json
$taskHasher=[Security.Cryptography.SHA256]::Create()
try{$taskSourceHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes((Join-Path $taskRoot 'LobbyOcr.ps1')))).Replace('-','')}finally{$taskHasher.Dispose()}
if(-not $taskCrop.Success -or $taskCrop.ScriptSha256 -ne $taskSourceHash -or $taskEmbedded.sha256 -ne $taskSourceHash){throw 'Tested/bundled/source OCR scripts differ'}
if(($taskOcr.rosterNames -join '|') -cne 'Ваня Кузьмич|TKnight|Dagasman'){throw 'Full lobby names differ'}
if(($taskOcr.rosterTeams -join '|') -ne '1|1|1' -or $taskOcr.region -ne 'Americas' -or $taskOcr.capture.live){throw 'Fixture team/region/live guards differ'}
$taskReport=[pscustomobject]@{
 At=[DateTime]::UtcNow.ToString('o');Success=$true;ScriptSha256=$taskSourceHash
 Source='Bundled EXE screen reader, actual full SC2 lobby screenshot'
 Names=$taskOcr.rosterNames;Teams=$taskOcr.rosterTeams;Region=$taskOcr.region
 CropCases=@($taskCrop.Cases | Where-Object {$_.Variant -eq 'Production'}).Count
 SelectionCases=$taskCrop.SelectionCases.Count
}
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'nickname-regression.json') -Encoding UTF8
$taskReport | ConvertTo-Json -Depth 5 -Compress
