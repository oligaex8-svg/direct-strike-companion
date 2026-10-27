$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskOut=Join-Path $taskRoot 'assets/themes/campaign48';$taskIndex=Get-Content (Join-Path $taskOut 'campaign-index.json') -Raw|ConvertFrom-Json
$taskStems=@('SM_HyperionBridgeStage1_00')
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true;$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false);$taskRecords=@()
 foreach($taskStem in $taskStems){$taskName=$taskIndex|Where-Object {[IO.Path]::GetFileNameWithoutExtension($_) -eq $taskStem}|Select-Object -First 1;if(!$taskName){throw ('Missing indexed native equipment '+$taskStem)};$taskDest=Join-Path $taskOut ($taskStem+'.m3');$taskIn=$taskStorage.OpenFile($taskName);try{$taskFile=[IO.File]::Create($taskDest);try{$taskIn.CopyTo($taskFile)}finally{$taskFile.Dispose()}}finally{$taskIn.Dispose()};$taskRecords+=@{archivePath=$taskName;file=$taskStem+'.m3';sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant()}}
 $taskRecords|ConvertTo-Json|Set-Content (Join-Path $taskOut 'equipment51-stage-source.json')
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}
