$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskWork=Join-Path $PSScriptRoot 'russian-sound-work'
$taskCatalog=Get-Content (Join-Path $taskRoot 'assets/audio/catalog.json') -Raw|ConvertFrom-Json
$taskOriginal=@($taskCatalog.sounds|Where-Object {$_.language -ne 'ru'})
$taskMetadata=@((Get-Content (Join-Path $PSScriptRoot 'sc2-audio-assets.json') -Raw|ConvertFrom-Json))+@((Get-Content (Join-Path $PSScriptRoot 'expanded-sound-assets.json') -Raw|ConvertFrom-Json))
$taskExtracts=@(Get-Content (Join-Path $taskWork 'local-russian-audio.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
$taskSounds=[Collections.Generic.List[object]]::new()
foreach($taskSound in $taskOriginal){$taskSounds.Add($taskSound)}
$taskNew=[Collections.Generic.List[object]]::new()
$taskExcluded=[Collections.Generic.List[object]]::new()
$taskHasher=[Security.Cryptography.SHA256]::Create()
function Get-TaskHash([string]$taskFile){
    $taskStream=[IO.File]::OpenRead($taskFile)
    try{[BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','')}finally{$taskStream.Dispose()}
}
try {
    foreach($taskOriginalSound in $taskOriginal){
        if((Get-TaskHash (Join-Path $taskRoot ('assets/audio/'+$taskOriginalSound.preset+'.wav'))) -ne $taskOriginalSound.sha256){throw 'An existing recording changed.'}
        $taskAsset=$taskMetadata|Where-Object {$_.Preset -eq $taskOriginalSound.preset}|Select-Object -First 1
        if(!$taskAsset -or $taskOriginalSound.preset -notlike 'sc2-*'){continue}
        $taskExtract=$taskExtracts|Where-Object {[IO.Path]::GetFileNameWithoutExtension($_.SourceFile) -eq ('local-ru-'+$taskAsset.GameAsset)}|Select-Object -First 1
        if(!$taskExtract){continue}
        $taskInput=Join-Path $taskWork $taskExtract.SourceFile
        $taskPreset='sc2-ru-'+$taskOriginalSound.preset.Substring(4)
        $taskOutput=Join-Path $taskRoot ('assets/audio/'+$taskPreset+'.wav')
        $taskResume=Join-Path $taskWork ($taskPreset+'.json')
        $taskSourceHash=Get-TaskHash $taskInput
        $taskCached=$null
        if((Test-Path $taskResume) -and (Test-Path $taskOutput)){
            $taskCached=Get-Content $taskResume -Raw|ConvertFrom-Json
            if($taskCached.SourceSHA256 -ne $taskSourceHash -or $taskCached.WaveSHA256 -ne (Get-TaskHash $taskOutput)){$taskCached=$null}
        }
        # Only a checkpoint matching both source and output hashes is reusable.
        # A newer timestamp or a valid WAV header cannot establish provenance.
        if(!$taskCached){
            $taskInputInfo=& ffprobe -v error -show_entries format=duration -of json $taskInput|ConvertFrom-Json
            $taskSeconds=[double]$taskInputInfo.format.duration
            if($taskSeconds -le 0 -or $taskSeconds -gt 5){$taskExcluded.Add([pscustomobject]@{GamePath=$taskExtract.GamePath;Seconds=$taskSeconds;Reason='Complete line exceeds five-second notification limit'});continue}
            & ffmpeg -y -hide_banner -nostdin -loglevel error -threads 1 -filter_threads 1 -i $taskInput -af 'loudnorm=I=-20:TP=-4:LRA=7,afade=t=in:d=0.01' -ac 1 -ar 22050 -c:a pcm_s16le $taskOutput
            if($LASTEXITCODE -ne 0){throw ('Audio conversion failed: '+$taskPreset)}
        }
        $taskOutputInfo=if($taskCached){[pscustomobject]@{format=[pscustomobject]@{duration=$taskCached.Seconds};streams=@([pscustomobject]@{sample_rate=$taskCached.SampleRate;channels=$taskCached.Channels;codec_name=$taskCached.Codec})}}else{& ffprobe -v error -show_entries format=duration:stream=sample_rate,channels,codec_name -of json $taskOutput|ConvertFrom-Json}
        if([double]$taskOutputInfo.format.duration -gt 5 -or $taskOutputInfo.streams[0].codec_name -ne 'pcm_s16le' -or $taskOutputInfo.streams[0].channels -ne 1){throw 'Unsupported converted audio format'}
        $taskHash=Get-TaskHash $taskOutput
        $taskSounds.Add([pscustomobject]@{preset=$taskPreset;en=$taskOriginalSound.en.Replace('SC2 ·','SC2 RU ·');ru=$taskOriginalSound.ru.Replace('SC2 ·','SC2 RU ·');category=$taskOriginalSound.category.Replace('sc2-','sc2-ru-');sha256=$taskHash;language='ru'})
        $taskRecord=[pscustomobject]@{Preset=$taskPreset;Language='ru';GameAsset=$taskAsset.GameAsset;GamePath=$taskExtract.GamePath;SourceSHA256=$taskSourceHash;WaveSHA256=$taskHash;Seconds=[double]$taskOutputInfo.format.duration;Bytes=(Get-Item $taskOutput).Length;SampleRate=22050;Channels=1;Codec='pcm_s16le'}
        $taskRecord|ConvertTo-Json|Set-Content $taskResume
        $taskNew.Add($taskRecord)
    }
    if($taskNew.Count -lt 12){throw 'Too few verified Russian recordings were prepared.'}
    $taskCategories=@($taskCatalog.categories|Where-Object {$_.key -notlike 'sc2-ru-*'})
    foreach($taskCategory in @($taskCategories|Where-Object {$_.key -like 'sc2-*'})){
        $taskKey=$taskCategory.key.Replace('sc2-','sc2-ru-')
        if(@($taskSounds|Where-Object {$_.category -eq $taskKey}).Count){$taskCategories+= [pscustomobject]@{key=$taskKey;en=('Russian · '+$taskCategory.en);ru=('Русские · '+$taskCategory.ru)}}
    }
    $taskJson=[pscustomobject]@{categories=$taskCategories;sounds=$taskSounds.ToArray()}|ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $taskRoot 'assets/audio/catalog.json'),$taskJson,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $taskRoot 'wwwroot/sound-library.js'),("'use strict';`n// Generated from assets/audio/catalog.json by the StarCraft audio builders.`nconst starcraftSoundLibrary="+$taskJson+';'),[Text.UTF8Encoding]::new($false))
    [pscustomobject]@{RetrievedAt=[DateTime]::UtcNow.ToString('o');GameBuild='5.0.17.98310';Source='Locally installed StarCraft II ruRU.SC2Assets';ExtractorPackage='CascLib 1.0.23 (WoW-Tools/CascLib)';ExtractorPackageSHA256=(Get-TaskHash (Join-Path $taskWork 'casclib.nupkg'));Clips=$taskNew.ToArray();Excluded=$taskExcluded.ToArray()}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $PSScriptRoot 'russian-sound-assets.json')
    [pscustomobject]@{OriginalSounds=$taskOriginal.Count;RussianSounds=$taskNew.Count;TotalSounds=$taskSounds.Count;Categories=$taskCategories.Count;ExcludedLongLines=$taskExcluded.Count}|ConvertTo-Json
}finally{$taskHasher.Dispose()}
