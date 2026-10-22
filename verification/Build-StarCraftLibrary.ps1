$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
$taskFfmpeg=(Get-Command ffmpeg).Source
$taskProbe=(Get-Command ffprobe).Source
$taskWork=Join-Path $PSScriptRoot 'sound-library-work'
$null=New-Item -ItemType Directory -Path $taskWork -Force
$taskCategories=@(
 @{key='sc1-alerts';en='StarCraft I · Alerts';ru='StarCraft I · Уведомления'}
 @{key='sc1-terran-units';en='StarCraft I · Terran voices';ru='StarCraft I · Голоса терранов'}
 @{key='sc1-protoss-units';en='StarCraft I · Protoss voices';ru='StarCraft I · Голоса протоссов'}
 @{key='sc2-terran-alerts';en='StarCraft II · Terran alerts';ru='StarCraft II · Уведомления терранов'}
 @{key='sc2-protoss-alerts';en='StarCraft II · Protoss alerts';ru='StarCraft II · Уведомления протоссов'}
 @{key='sc2-zerg-alerts';en='StarCraft II · Zerg alerts';ru='StarCraft II · Уведомления зергов'}
 @{key='sc2-terran-units';en='StarCraft II · Terran units';ru='StarCraft II · Юниты терранов'}
 @{key='sc2-protoss-units';en='StarCraft II · Protoss units';ru='StarCraft II · Юниты протоссов'}
)
$taskManifest=(Get-Content verification/sc1-audio-assets.json -Raw | ConvertFrom-Json)+(Get-Content verification/sc2-audio-assets.json -Raw | ConvertFrom-Json)
$taskOld=@(
 @('sc1-nuclear','Nuclear launch','Ядерный запуск','sc1-alerts'),
 @('sc1-research','Research complete','Исследование завершено','sc1-alerts'),
 @('sc1-upgrade','Upgrade complete','Улучшение завершено','sc1-alerts'),
 @('sc1-pylons','Additional pylons','Дополнительные пилоны','sc1-alerts'),
 @('sc1-warp','Awaiting instructions','Ожидаю указаний','sc1-protoss-units'),
 @('sc1-evolution','Evolution complete','Эволюция завершена','sc1-alerts'),
 @('sc2-nuclear','Nuclear launch','Ядерный запуск','sc2-terran-alerts'),
 @('sc2-research','Research complete','Исследование завершено','sc2-terran-alerts'),
 @('sc2-upgrade','Upgrade complete','Улучшение завершено','sc2-terran-alerts'),
 @('sc2-pylons','Additional pylons','Дополнительные пилоны','sc2-protoss-alerts'),
 @('sc2-warp','Warp-in complete','Варп завершён','sc2-protoss-alerts'),
 @('sc2-evolution','Evolution complete','Эволюция завершена','sc2-zerg-alerts')
)
$taskSounds=[Collections.Generic.List[object]]::new()
foreach($item in $taskOld){
 $asset=$taskManifest | Where-Object {$_.Preset -eq $item[0]}
 $output=Join-Path $taskRoot ('assets/audio/'+$item[0]+'.wav')
 if((Get-FileHash -LiteralPath $output).Hash -ne $asset.WaveSHA256){throw ('Existing recording hash changed: '+$item[0])}
 $prefix=$item[0].Substring(0,3).ToUpperInvariant()
 $taskSounds.Add([pscustomobject]@{preset=$item[0];en=($prefix+' · '+$item[1]);ru=($prefix+' · '+$item[2]);category=$item[3];sha256=$asset.WaveSHA256})
}
$taskNew=[Collections.Generic.List[object]]::new()
function Add-Sc1([string]$key,[string]$file,[string]$en,[string]$ru,[string]$race){
 $taskNew.Add([pscustomobject]@{preset=('sc1-'+$key);url=('https://raw.githubusercontent.com/pmaoui/starcraft-soundboard/main/sounds/'+$file+'.mp3');en=('SC1 · '+$en);ru=('SC1 · '+$ru);category=('sc1-'+$race+'-units');asset=$file})
}
Add-Sc1 'affirmative' 'Terran/affirmative_sir' 'Affirmative, sir' 'Так точно' 'terran'
Add-Sc1 'ready' 'Terran/anytime_youre_ready' 'Anytime you are ready' 'В любой момент' 'terran'
Add-Sc1 'right-away' 'Terran/right_away_sir' 'Right away, sir' 'Немедленно, сэр' 'terran'
Add-Sc1 'roll-out' 'Terran/ready_to_roll_out' 'Ready to roll out' 'Готов к выезду' 'terran'
Add-Sc1 'reporting' 'Terran/reporting_for_duties_affirmative' 'Reporting for duty' 'Готов к службе' 'terran'
Add-Sc1 'scv-ready' 'Terran/its_cb_good_to_go_sir' 'SCV ready' 'КСМ готов' 'terran'
Add-Sc1 'orders' 'Terran/orders_cabin' 'Orders, captain' 'Приказы, капитан' 'terran'
Add-Sc1 'acknowledgement' 'Terran/should_work' 'Acknowledgement' 'Подтверждение' 'terran'
Add-Sc1 'help' 'Protoss/how_may_i_help_you' 'How may I help you?' 'Чем могу помочь?' 'protoss'
Add-Sc1 'vengeance' 'Protoss/for_vengeance' 'For vengeance' 'Во имя мести' 'protoss'
Add-Sc1 'fear-no-enemy' 'Protoss/i_fear_no_enemy' 'I fear no enemy' 'Мне не страшен враг' 'protoss'
Add-Sc1 'confirmed' 'Protoss/confirmed_initiated' 'Confirmed / initiated' 'Подтверждено / начато' 'protoss'
function Add-Sc2Alert([string]$race,[string]$asset,[string]$en,[string]$ru){
 $raceRu=@{Terran='Терраны';Protoss='Протоссы';Zerg='Зерги'}[$race]
 $key='sc2-'+$race.ToLowerInvariant()+'-'+([regex]::Replace($asset,'([a-z])([A-Z])','$1-$2')).ToLowerInvariant()
 $taskNew.Add([pscustomobject]@{preset=$key;url=('https://s3.amazonaws.com/nuclearlaunchdetected/mp3/Alert_'+$race+$asset+'.mp3');en=('SC2 · '+$race+' — '+$en);ru=('SC2 · '+$raceRu+' — '+$ru);category=('sc2-'+$race.ToLowerInvariant()+'-alerts');asset=('Alert_'+$race+$asset)})
}
foreach($race in @('Terran','Protoss','Zerg')){
 Add-Sc2Alert $race 'BaseUnderAttack' 'Base under attack' 'База атакована'
 Add-Sc2Alert $race 'ForcesUnderAttack' 'Forces under attack' 'Войска атакованы'
 Add-Sc2Alert $race 'NeedMoreGas' 'More vespene gas' 'Нужен веспен'
 Add-Sc2Alert $race 'NeedMoreMinerals' 'More minerals' 'Нужны минералы'
 Add-Sc2Alert $race 'NotEnoughEnergy' 'Not enough energy' 'Недостаточно энергии'
 Add-Sc2Alert $race 'GamePaused' 'Game paused' 'Игра приостановлена'
 Add-Sc2Alert $race 'GameResumed' 'Game resumed' 'Игра продолжена'
 Add-Sc2Alert $race 'MineralsDepleted' 'Minerals depleted' 'Минералы исчерпаны'
}
Add-Sc2Alert 'Terran' 'AddOnComplete' 'Add-on complete' 'Модуль готов'
Add-Sc2Alert 'Terran' 'NukeReady' 'Nuclear missile ready' 'Ядерная ракета готова'
Add-Sc2Alert 'Terran' 'NeedMoreFood' 'More supply depots' 'Нужны склады'
Add-Sc2Alert 'Terran' 'SalvageComplete' 'Salvage complete' 'Переработка завершена'
Add-Sc2Alert 'Protoss' 'ResearchComplete' 'Research complete' 'Исследование завершено'
Add-Sc2Alert 'Protoss' 'UpgradeComplete' 'Upgrade complete' 'Улучшение завершено'
Add-Sc2Alert 'Protoss' 'CalldownLaunch' 'Nuclear launch' 'Ядерный запуск'
Add-Sc2Alert 'Zerg' 'NewQueen' 'New queen' 'Новая королева'
Add-Sc2Alert 'Zerg' 'MutationComplete' 'Mutation complete' 'Мутация завершена'
Add-Sc2Alert 'Zerg' 'NeedMoreFood' 'More overlords' 'Нужны надзиратели'
$taskUnits=@(
 @('Marine','Marine','Морпех','terran'),@('Marauder','Marauder','Мародёр','terran'),@('Ghost','Ghost','Призрак','terran'),@('SCV','SCV','КСМ','terran'),
 @('SiegeTank','Siege tank','Осадный танк','terran'),@('Thor','Thor','Тор','terran'),@('Battlecruiser','Battlecruiser','Линейный крейсер','terran'),@('Medivac','Medivac','Медэвак','terran'),
 @('Zealot','Zealot','Зилот','protoss'),@('Stalker','Stalker','Сталкер','protoss'),@('HighTemplar','High templar','Высший тамплиер','protoss'),
 @('DarkTemplar','Dark templar','Тёмный тамплиер','protoss'),@('Archon','Archon','Архонт','protoss'),@('Carrier','Carrier','Авианосец','protoss'),@('Immortal','Immortal','Бессмертный','protoss')
)
foreach($unit in $taskUnits){foreach($line in @(@('Ready00','Ready','Готов'),@('What00','Orders','Приказы'),@('Attack00','Attack','Атака'))){
 $taskNew.Add([pscustomobject]@{preset=('sc2-'+$unit[0].ToLowerInvariant()+'-'+$line[0].Substring(0,$line[0].Length-2).ToLowerInvariant());url=('https://s3.amazonaws.com/nuclearlaunchdetected/mp3/'+$unit[0]+'_'+$line[0]+'.mp3');en=('SC2 · '+$unit[1]+' — '+$line[1]);ru=('SC2 · '+$unit[2]+' — '+$line[2]);category=('sc2-'+$unit[3]+'-units');asset=($unit[0]+'_'+$line[0])})
}}
$taskSc2Inventory=Get-Content verification/sc2-sound-catalog-source.json -Raw | ConvertFrom-Json
$taskSc1Inventory=Get-Content verification/sc1-sound-catalog-source.json -Raw | ConvertFrom-Json
$taskNewManifest=[Collections.Generic.List[object]]::new()
$taskSkipped=[Collections.Generic.List[object]]::new()
$taskCount=0
foreach($clip in $taskNew){
 if($clip.preset.StartsWith('sc2-') -and $clip.asset -notin $taskSc2Inventory){throw ('Missing catalog asset: '+$clip.asset)}
 if($clip.preset.StartsWith('sc1-') -and ('sounds/'+$clip.asset+'.mp3') -notin $taskSc1Inventory){throw ('Missing SC1 asset: '+$clip.asset)}
 $taskOs=Get-CimInstance Win32_OperatingSystem
 $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
 if(100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize) -ge 94 -or $taskCpu.PercentProcessorTime -ge 90){throw 'Sound library work deferred by resource budget; completed clips can resume.'}
 $inputFile=Join-Path $taskWork ($clip.preset+'.mp3')
 $outputFile=Join-Path $taskRoot ('assets/audio/'+$clip.preset+'.wav')
 $recordFile=Join-Path $taskWork ($clip.preset+'.json')
 if(-not(Test-Path -LiteralPath $inputFile)){Invoke-WebRequest -Uri $clip.url -OutFile $inputFile -UseBasicParsing -TimeoutSec 20}
 if((Get-Item -LiteralPath $inputFile).Length -gt 2MB){throw 'Source audio exceeds the bounded clip limit.'}
 $sourceHash=(Get-FileHash -LiteralPath $inputFile).Hash
 $sourceInfo=& $taskProbe -v error -show_entries format=duration -of json $inputFile | ConvertFrom-Json
 $seconds=[double]$sourceInfo.format.duration
 if($seconds -le 0 -or $seconds -gt 5){$taskSkipped.Add([pscustomobject]@{Preset=$clip.preset;Seconds=$seconds;Reason='Keep complete short lines; no mid-sentence trimming.'});continue}
 $record=$null
 if((Test-Path -LiteralPath $recordFile) -and (Test-Path -LiteralPath $outputFile)){
  $record=Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
  if($record.SourceSHA256 -ne $sourceHash -or $record.WaveSHA256 -ne (Get-FileHash -LiteralPath $outputFile).Hash){$record=$null}
 }
 if($null -eq $record){
  $job=Start-Process -FilePath $taskFfmpeg -ArgumentList @('-y','-hide_banner','-nostdin','-loglevel','error','-threads','1','-i',('"'+$inputFile+'"'),'-af','loudnorm=I=-20:TP=-4:LRA=7,afade=t=in:d=0.01','-ac','1','-ar','22050','-c:a','pcm_s16le',('"'+$outputFile+'"')) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $taskWork ($clip.preset+'-error.txt'))
  try {
   $null=$job.Handle;$job.PriorityClass='BelowNormal';$job.ProcessorAffinity=[IntPtr]1
   while(-not $job.HasExited){
    Start-Sleep -Milliseconds 200
    $taskMemory=Get-CimInstance Win32_OperatingSystem
    $taskLoad=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    if(100*(1-$taskMemory.FreePhysicalMemory/$taskMemory.TotalVisibleMemorySize) -ge 94 -or $taskLoad.PercentProcessorTime -ge 90){Stop-Process -Id $job.Id -Force;throw 'Audio conversion stopped at resource limit; completed clips can resume.'}
   }
   $job.WaitForExit();if($job.ExitCode -ne 0){throw ('Audio conversion failed: '+$clip.preset)}
  } finally {$job.Dispose()}
  $outputInfo=& $taskProbe -v error -show_entries format=duration:stream=sample_rate,channels,codec_name -of json $outputFile | ConvertFrom-Json
  $record=[pscustomobject]@{Preset=$clip.preset;GameAsset=$clip.asset;Url=$clip.url;SourceSHA256=$sourceHash;WaveSHA256=(Get-FileHash -LiteralPath $outputFile).Hash;Seconds=[double]$outputInfo.format.duration;Bytes=(Get-Item -LiteralPath $outputFile).Length;SampleRate=22050;Channels=1;Codec='pcm_s16le'}
  if($record.Seconds -gt 5 -or $outputInfo.streams[0].codec_name -ne 'pcm_s16le'){throw 'Converted sound is outside the supported format.'}
  $record | ConvertTo-Json | Set-Content -LiteralPath $recordFile
 }
 $taskNewManifest.Add($record)
 $taskSounds.Add([pscustomobject]@{preset=$clip.preset;en=$clip.en;ru=$clip.ru;category=$clip.category;sha256=$record.WaveSHA256})
 $taskCount++
 if($taskCount%10 -eq 0){Write-Output ('Prepared '+$taskCount+' additional game recordings.')}
}
if($taskSounds.Count -lt 75){throw 'Too few bounded recordings for the expanded sound library.'}
$taskExistingCatalog=Get-Content (Join-Path $taskRoot 'assets/audio/catalog.json') -Raw|ConvertFrom-Json
# The independent Russian builder supplements this English catalog. Preserve
# verified localized clips when the original library is regenerated.
foreach($taskLocalized in @($taskExistingCatalog.sounds|Where-Object {$_.language -eq 'ru'})){
 if($taskLocalized.preset -notlike 'sc2-ru-*' -or (Get-FileHash -LiteralPath (Join-Path $taskRoot ('assets/audio/'+$taskLocalized.preset+'.wav'))).Hash -ne $taskLocalized.sha256){throw 'Localized audio catalog verification failed.'}
 $taskSounds.Add($taskLocalized)
}
foreach($taskCategory in @($taskExistingCatalog.categories|Where-Object {$_.key -like 'sc2-ru-*'})){
 if(@($taskSounds|Where-Object {$_.category -eq $taskCategory.key}).Count){$taskCategories+=$taskCategory}
}
$taskCatalog=[pscustomobject]@{categories=$taskCategories;sounds=$taskSounds.ToArray()}
$taskJson=$taskCatalog | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $taskRoot 'assets/audio/catalog.json'),$taskJson,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $taskRoot 'wwwroot/sound-library.js'),('''use strict'';'+[Environment]::NewLine+'// Generated from assets/audio/catalog.json by verification/Build-StarCraftLibrary.ps1.'+[Environment]::NewLine+'const starcraftSoundLibrary='+$taskJson+';'),[Text.UTF8Encoding]::new($false))
$taskNewManifest.ToArray() | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath verification/expanded-sound-assets.json -Encoding UTF8
$taskSkipped.ToArray() | ConvertTo-Json | Set-Content -LiteralPath verification/expanded-sound-exclusions.json -Encoding UTF8
[pscustomobject]@{Sounds=$taskSounds.Count;NewSounds=$taskNewManifest.Count;Categories=$taskCategories.Count;SkippedLongLines=$taskSkipped.Count} | ConvertTo-Json
