param([string]$ScriptPath)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $ScriptPath){$ScriptPath=Join-Path $taskRoot 'LobbyOcr.ps1'}
$taskErrors=$null;$taskTokens=$null
$taskAst=[Management.Automation.Language.Parser]::ParseFile($ScriptPath,[ref]$taskTokens,[ref]$taskErrors)
if($taskErrors.Count){throw 'OCR script has parse errors'}
foreach($taskFunction in $taskAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
 if($taskFunction.Name -in @('Get-DscLobbyPanels','Get-DscLobbyRows','Get-DscCombinedLobbyRows')){Invoke-Expression $taskFunction.Extent.Text}
}
function Word([string]$Text,[int]$X,[int]$Y,[int]$Width=70){@{text=$Text;x=$X;y=$Y;width=$Width;height=16}}
function Line([object[]]$Words){@{text=($Words | ForEach-Object {$_.text}) -join ' ';words=$Words}}
$taskLines=@(
 (Line @((Word 'Direct Strike' 90 70 180))),
 (Line @((Word 'Horde' 100 160))),
 (Line @((Word 'Alliance' 100 460))),
 (Line @((Word 'Alpha' 185 210),(Word 'DashboardDecoy' 650 210))),
 (Line @((Word '<tag>' 185 245))),
 (Line @((Word 'SidebarOnly' 630 260))),
 (Line @((Word 'Ваня' 185 285 50),(Word 'Кузьмич' 245 285 90))),
 (Line @((Word 'TKnight' 185 365))),
 (Line @((Word 'FourthIgnored' 185 380))),
 (Line @((Word 'DarthVader' 185 510))),
 (Line @((Word 'Keltus' 185 585))),
 (Line @((Word 'Fëanor' 185 660))),
 (Line @((Word 'Empty' 185 700))),
 (Line @((Word 'ChatDecoy' 185 950)))
)
$taskChecks=[Collections.Generic.List[string]]::new()
function Check([bool]$Passed,[string]$Name){if(-not $Passed){throw $Name};$taskChecks.Add($Name)}
$taskReading=@{lines=$taskLines}
$taskPanels=Get-DscLobbyPanels $taskReading 2000 1100
Check ($null -ne $taskPanels -and -not $taskPanels.modeVerified) 'Covered mode allows name-only panels without claiming mode'
$taskRows=@(Get-DscLobbyRows $taskReading $taskPanels 2000)
Check (($taskRows | ForEach-Object {$_.text}) -join '|' -ceq 'Alpha|Ваня Кузьмич|TKnight|DarthVader|Keltus|Fëanor') 'Six names retain spaces and exclude sidebar, clan tags, empties, chat and fourth rows'
Check (($taskRows | ForEach-Object {$_.team}) -join '|' -eq '1|1|1|2|2|2') 'Panel team numbers stay aligned'
$taskMode=@{lines=$taskLines+@((Line @((Word '3V3 Commanders' 1400 260 160))))}
Check ((Get-DscLobbyPanels $taskMode 2000 1100).modeVerified) 'Visible explicit mode evidence stays separate'
$taskNegatives=@(
 @{Name='Missing map';Lines=@($taskLines | Where-Object {$_.text -ne 'Direct Strike'})},
 @{Name='Companion title is not map evidence';Lines=@($taskLines | Where-Object {$_.text -ne 'Direct Strike'})+@((Line @((Word 'Direct Strike Companion' 90 70 210))))},
 @{Name='Missing Alliance';Lines=@($taskLines | Where-Object {$_.text -ne 'Alliance'})},
 @{Name='Duplicate Horde';Lines=$taskLines+@((Line @((Word 'Horde' 100 175))))},
 @{Name='Misaligned headers';Lines=@($taskLines | Where-Object {$_.text -ne 'Alliance'})+@((Line @((Word 'Alliance' 250 460))))},
 @{Name='Panel gap too small';Lines=@($taskLines | Where-Object {$_.text -ne 'Alliance'})+@((Line @((Word 'Alliance' 100 260))))},
 @{Name='Panel gap too large';Lines=@($taskLines | Where-Object {$_.text -ne 'Alliance'})+@((Line @((Word 'Alliance' 100 900))))},
 @{Name='Chat map heading is not lobby';Lines=@($taskLines | Where-Object {$_.text -ne 'Direct Strike'})+@((Line @((Word 'Direct Strike' 90 800 180))))}
)
foreach($taskCase in $taskNegatives){Check ($null -eq (Get-DscLobbyPanels @{lines=$taskCase.Lines} 2000 1100)) $taskCase.Name}
$taskPrimary=@{language='en-GB';lines=@($taskLines | Where-Object {$_.text -ne 'Keltus'})}
$taskSecondary=@{language='ru';lines=$taskLines}
$taskMerged=@(Get-DscCombinedLobbyRows $taskPrimary @($taskPrimary,$taskSecondary) $taskPanels 2000 1100)
Check (($taskMerged | ForEach-Object {$_.text}) -join '|' -ceq 'Alpha|Ваня Кузьмич|TKnight|DarthVader|Keltus|Fëanor') 'Secondary recognizer fills a missing bounded row without duplicating others'
Check (@($taskMerged | Where-Object {$_.supplemental}).Count -eq 1) 'Only a missing row uses primary-language crop refinement'
$taskDifferent=@{language='ru';lines=@($taskLines | Where-Object {$_.text -ne 'Horde' -and $_.text -ne 'Alliance'})+@((Line @((Word 'Horde' 130 160))),(Line @((Word 'Alliance' 130 460))))}
Check (@(Get-DscCombinedLobbyRows $taskPrimary @($taskPrimary,$taskDifferent) $taskPanels 2000 1100).Count -eq 5) 'Different panel geometry cannot supplement names'
$taskIncomplete=@{language='ru';lines=@($taskLines | Where-Object {$_.text -ne 'Direct Strike'})}
Check (@(Get-DscCombinedLobbyRows $taskPrimary @($taskPrimary,$taskIncomplete) $taskPanels 2000 1100).Count -eq 5) 'Secondary recognizer needs complete map and panel evidence'
$taskHasher=[Security.Cryptography.SHA256]::Create()
try{$taskHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes($ScriptPath))).Replace('-','')}finally{$taskHasher.Dispose()}
$taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Success=$true;ScriptSha256=$taskHash;Checks=$taskChecks}
$taskReport | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'covered-lobby-geometry.json') -Encoding UTF8
$taskReport | ConvertTo-Json -Depth 4 -Compress
