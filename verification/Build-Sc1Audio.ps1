$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
$taskFfmpeg=(Get-Command ffmpeg).Source
$taskProbe=(Get-Command ffprobe).Source
$taskSources=@{
 'advisor-pair'='Protoss/nuclear_launch_detected_upgrade_complete.mp3'
 'research'='Protoss/research_complete.mp3'
 'pylons'='Protoss/you_require_more_vest_being_gas_you_must_construct.mp3'
 'instructions'='Protoss/awaiting_instructions.mp3'
 'evolution'='Zerg/evolution_complete.mp3'
}
$taskClips=@(
 @{Key='sc1-nuclear';Source='advisor-pair';Start=0;Length=2.05}
 @{Key='sc1-upgrade';Source='advisor-pair';Start=2.138;Length=3.0}
 @{Key='sc1-research';Source='research';Start=0;Length=1.254}
 @{Key='sc1-pylons';Source='pylons';Start=2.4;Length=4.4}
 @{Key='sc1-warp';Source='instructions';Start=0;Length=1.516}
 @{Key='sc1-evolution';Source='evolution';Start=0;Length=1.751}
)
$taskManifest=@()
foreach($taskClip in $taskClips){
 $taskOs=Get-CimInstance Win32_OperatingSystem
 $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
 if(100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize) -ge 94 -or $taskCpu.PercentProcessorTime -ge 90){throw 'Audio conversion deferred by resource budget'}
 $taskInput='verification/sc1-audio-source/'+$taskClip.Source+'.mp3'
 $taskOutput='assets/audio/'+$taskClip.Key+'.wav'
 $taskLength=$taskClip.Length.ToString([Globalization.CultureInfo]::InvariantCulture)
 $taskStart=$taskClip.Start.ToString([Globalization.CultureInfo]::InvariantCulture)
 $taskProcess=Start-Process -FilePath $taskFfmpeg -ArgumentList @('-y','-hide_banner','-nostdin','-loglevel','error','-threads','1','-ss',$taskStart,'-t',$taskLength,'-i',$taskInput,'-af','loudnorm=I=-20:TP=-4:LRA=7,afade=t=in:d=0.01','-ac','1','-ar','22050','-c:a','pcm_s16le',$taskOutput) -WindowStyle Hidden -PassThru -RedirectStandardError ('verification/sc1-'+$taskClip.Key+'-conversion-error.txt')
 try {
  $null=$taskProcess.Handle
  $taskProcess.PriorityClass='BelowNormal';$taskProcess.ProcessorAffinity=[IntPtr]1
  while(-not $taskProcess.HasExited){
   Start-Sleep -Milliseconds 200
   $taskMemory=Get-CimInstance Win32_OperatingSystem
   $taskLoad=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
   if(100*(1-$taskMemory.FreePhysicalMemory/$taskMemory.TotalVisibleMemorySize) -ge 94 -or $taskLoad.PercentProcessorTime -ge 90){Stop-Process -Id $taskProcess.Id -Force;throw 'Audio conversion stopped at resource limit'}
  }
  $taskProcess.WaitForExit();if($taskProcess.ExitCode -ne 0){throw 'Audio conversion failed'}
 } finally {$taskProcess.Dispose()}
 $taskInfo=& $taskProbe -v error -show_entries format=duration:stream=sample_rate,channels,codec_name -of json $taskOutput | ConvertFrom-Json
 $taskManifest += [pscustomobject]@{Preset=$taskClip.Key;Url=('https://raw.githubusercontent.com/pmaoui/starcraft-soundboard/main/sounds/'+$taskSources[$taskClip.Source]);SourceSHA256=(Get-FileHash -LiteralPath $taskInput).Hash;WaveSHA256=(Get-FileHash -LiteralPath $taskOutput).Hash;Start=$taskClip.Start;Seconds=[double]$taskInfo.format.duration;Bytes=(Get-Item -LiteralPath $taskOutput).Length;SampleRate=22050;Channels=1;Codec='pcm_s16le'}
}
$taskManifest | ConvertTo-Json | Set-Content -LiteralPath 'verification/sc1-audio-assets.json'
$taskManifest | Select-Object Preset,Seconds,Bytes | ConvertTo-Json -Compress
