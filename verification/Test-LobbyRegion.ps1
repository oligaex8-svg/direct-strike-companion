$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'LobbyOcr.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) {throw ($errors | Out-String)}
$names=@('Get-DscLobbyPanels','Get-DscLobbyRegion','Remove-HostLabel','Join-DscNameLines')
foreach ($function in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)) {
 if ($function.Name -in $names) {Invoke-Expression $function.Extent.Text}
}
$checks=[Collections.Generic.List[string]]::new()
function Check([bool]$Passed,[string]$Name) {if (-not $Passed) {throw $Name};$checks.Add($Name)}
$fixture=Get-Content (Join-Path $PSScriptRoot 'sc2-lobby-fixture-output.txt') -Raw | ConvertFrom-Json
function Clone-Fixture {return ($fixture | ConvertTo-Json -Depth 14 | ConvertFrom-Json)}
Check ((Get-DscLobbyRegion $fixture.screenReadings $fixture.capture.width $fixture.capture.height) -eq 'Americas') 'Current full lobby resolves Americas using the exact Russian-engine server reading'
Check ($null -eq (Get-DscLobbyRegion @($fixture.screenReadings[0]) $fixture.capture.width $fixture.capture.height)) 'Unrecognized English United typo cannot independently guess a region'
$conflict=Clone-Fixture
($conflict.screenReadings[0].lines | Where-Object {$_.text -eq 'Eastern I-Jnited States'}).text='Central Europe'
Check ($null -eq (Get-DscLobbyRegion $conflict.screenReadings $conflict.capture.width $conflict.capture.height)) 'Conflicting recognized EU and Americas readings leave region unavailable'
$invalid=Clone-Fixture
foreach ($reading in $invalid.screenReadings) {foreach ($line in $reading.lines) {if ($line.text -match '^(8|3)V3') {$line.text='3V3 Standard'}}}
Check ($null -eq (Get-DscLobbyRegion $invalid.screenReadings $invalid.capture.width $invalid.capture.height)) 'A server label outside the Direct Strike 3v3 Commanders guard cannot select a region'
$chat=Clone-Fixture
foreach ($reading in $chat.screenReadings) {foreach ($line in $reading.lines) {if ($line.text -eq 'Eastern United States') {foreach ($word in $line.words) {$word.y=1329}}}}
Check ($null -eq (Get-DscLobbyRegion $chat.screenReadings $chat.capture.width $chat.capture.height)) 'A recognizable server name in chat geometry cannot supply region evidence'
$old=Get-Content (Join-Path $PSScriptRoot 'lobby-ocr-rows.json') -Raw | ConvertFrom-Json
Check ((Get-DscLobbyRegion $old.readings $old.width $old.height) -eq 'EU') 'Earlier Central Europe lobby resolves EU without repairing unrecognized Cyrillic server glyphs'
Check ((Remove-HostLabel '<Expend> [Clan] Ваня Кузьмич (Host)') -eq 'Ваня Кузьмич') 'Only paired clan prefixes and the host suffix are removed from a spaced nickname'
Check ((Remove-HostLabel 'Expend Ваня Кузьмич') -eq 'Expend Ваня Кузьмич' -and (Remove-HostLabel '<Broken Ваня Кузьмич') -eq '<Broken Ваня Кузьмич') 'Bare words and unpaired brackets remain nickname evidence without tag guesses'
Check ((Join-DscNameLines @('Ваня Кузьмич','<Expend>','[Clan]')) -eq 'Ваня Кузьмич' -and (Join-DscNameLines @('Expend','Ваня Кузьмич')) -eq 'Expend Ваня Кузьмич') 'Name crops omit complete bracketed tag lines while preserving bare words and spaced names'
$bounded=@{capture=$fixture.capture;screenReadings=$fixture.screenReadings;rosterNames=$fixture.rosterNames;rosterTeams=$fixture.rosterTeams;region=(Get-DscLobbyRegion $fixture.screenReadings $fixture.capture.width $fixture.capture.height)}
$bounded | ConvertTo-Json -Depth 14 | Set-Content (Join-Path $PSScriptRoot 'fixtures/sc2-lobby-region.json')
$result=@{checked=[DateTime]::UtcNow.ToString('o');passed=$checks.Count;checks=$checks;region=$bounded.region;fixture='fixtures/sc2-lobby-region.json'}
$result | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $PSScriptRoot 'lobby-region-tests.json')
$result | ConvertTo-Json -Depth 5 -Compress
