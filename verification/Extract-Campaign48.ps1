param([ValidateSet('Index','Extract','Probe')][string]$Mode='Index')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskOut=Join-Path $taskRoot 'assets/themes/campaign48';New-Item -ItemType Directory -Path $taskOut -Force|Out-Null
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true;$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 if($Mode -eq 'Probe'){@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)sm_hb.*screen'})|ConvertTo-Json|Set-Content (Join-Path $taskOut 'missing-texture-candidates.json');return}
 if($Mode -eq 'Index'){
  $taskNames=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)base.sc2assets/Assets/' -and (($_ -match '(?i)\.m3$' -and $_ -match '(?i)(StoryModeSets|StoryModeProps|Hyperion|SpearOfAdun|Adun|Leviathan)') -or ($_ -match '(?i)\.dds$' -and [IO.Path]::GetFileName($_) -match '(?i)(hyperion|adun|leviathan|starmap|armory|SMX2.*(bridge|console|solar|war)|SM_.*(bridge|console|armory|lab))'))}|Sort-Object -Unique)
  $taskNames|ConvertTo-Json|Set-Content (Join-Path $taskOut 'campaign-index.json');[pscustomobject]@{Success=$true;Indexed=$taskNames.Count;Models=@($taskNames|Where-Object {$_ -match '\.m3$'}).Count}|ConvertTo-Json -Compress
 }else{
  $taskSelected=Get-Content (Join-Path $taskOut 'extract-requests.json') -Raw|ConvertFrom-Json;$taskRecords=@()
  foreach($taskName in $taskSelected){$taskIn=$taskStorage.OpenFile($taskName);try{$taskDest=Join-Path $taskOut ([IO.Path]::GetFileName($taskName));$taskFile=[IO.File]::Create($taskDest);try{$taskIn.CopyTo($taskFile)}finally{$taskFile.Dispose()};$taskRecords+=@{path=$taskName;file=[IO.Path]::GetFileName($taskName);sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant()}}finally{$taskIn.Dispose()}}
  $taskRecords|ConvertTo-Json|Set-Content (Join-Path $taskOut 'sources.json');[pscustomobject]@{Success=$true;Extracted=$taskRecords.Count}|ConvertTo-Json -Compress
 }
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}
