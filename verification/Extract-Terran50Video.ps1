$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskOut=Join-Path $taskRoot 'assets/themes/campaign48'
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true;$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskName=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)/Video_ArmoryScreen\.ogv$'})|Select-Object -First 1
 if(!$taskName){throw 'Native Armory screen video absent from installed archive index.'}
 $taskIn=$taskStorage.OpenFile($taskName);$taskDest=Join-Path $taskOut 'Video_ArmoryScreen.ogv';try{$taskFile=[IO.File]::Create($taskDest);try{$taskIn.CopyTo($taskFile)}finally{$taskFile.Dispose()}}finally{$taskIn.Dispose()}
 @{archivePath=$taskName;sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant();source='Native campaign console material video, unchanged'}|ConvertTo-Json|Set-Content (Join-Path $taskOut 'armory-video-source.json')
 & ffmpeg -hide_banner -loglevel error -y -threads 1 -i $taskDest -frames:v 1 -threads 1 (Join-Path $taskOut 'textures/video_armoryscreen.png');if($LASTEXITCODE -ne 0){throw 'Native video poster conversion failed'}
 & ffprobe -v error -show_entries format=duration:stream=width,height,avg_frame_rate -of json $taskDest
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}
