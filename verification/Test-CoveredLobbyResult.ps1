$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskResult=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'covered-lobby-fixture-output.txt') -Raw | ConvertFrom-Json
$taskGeometry=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'covered-lobby-geometry.json') -Raw | ConvertFrom-Json
$taskEmbedded=Get-Content -LiteralPath (Join-Path $taskRoot 'release/test-output/embedded-ocr.json') -Raw | ConvertFrom-Json
$taskHasher=[Security.Cryptography.SHA256]::Create()
try{$taskHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes((Join-Path $taskRoot 'LobbyOcr.ps1')))).Replace('-','')}finally{$taskHasher.Dispose()}
if(-not $taskGeometry.Success -or $taskGeometry.ScriptSha256 -ne $taskHash -or $taskEmbedded.sha256 -ne $taskHash){throw 'Tested geometry/bundled/source scripts differ'}
if(($taskResult.rosterNames -join '|') -cne 'Ваня Кузьмич|Константин Юсупов|TKnight|DarthVader'){throw 'Covered screenshot names differ'}
if(($taskResult.rosterTeams -join '|') -ne '1|1|1|2' -or $taskResult.modeVerified -ne $false -or $taskResult.capture.live -or $taskResult.region){throw 'Covered fixture must retain panel teams and leave mode/region unconfirmed'}
$taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Success=$true;ScriptSha256=$taskHash;Source='Bundled screen reader on supplied covered-lobby screenshot';Names=$taskResult.rosterNames;Teams=$taskResult.rosterTeams;ModeVerified=$taskResult.modeVerified;GeometryChecks=$taskGeometry.Checks.Count}
$taskReport | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'covered-lobby-regression.json') -Encoding UTF8
$taskReport | ConvertTo-Json -Compress
