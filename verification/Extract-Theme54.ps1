param([ValidateSet('Index','Extract','Identity')][string]$Mode='Index')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskOut=Join-Path $taskRoot 'assets/themes/native54';New-Item -ItemType Directory -Path $taskOut -Force|Out-Null
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true;$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 if($Mode -eq 'Identity'){
  $taskCandidates=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)/GameData/[^/]*(Skin|Model)[^/]*\.xml$' -and $_ -match '(?i)^mods/'})
  $taskEvidence=@();foreach($taskName in $taskCandidates){try{$taskStream=$taskStorage.OpenFile($taskName);$taskReader=[IO.StreamReader]::new($taskStream);try{$taskText=$taskReader.ReadToEnd()}finally{$taskReader.Dispose()};if($taskText -match '(?i)Tyrador|Cerberus|Silver|_RCZ'){ $taskDest='identity-'+($taskName -replace '[^a-zA-Z0-9._-]','_');[IO.File]::WriteAllText((Join-Path $taskOut $taskDest),$taskText);$taskEvidence+=@{source=$taskName;file=$taskDest}}}catch{}}
  $taskEvidence|ConvertTo-Json|Set-Content (Join-Path $taskOut 'identity-sources.json');[pscustomobject]@{candidates=$taskCandidates.Count;evidence=$taskEvidence.Count}|ConvertTo-Json -Compress;return
 }
 if($Mode -eq 'Index'){
  $taskNames=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)\.m3$'}|Sort-Object -Unique)
  $taskNames|ConvertTo-Json|Set-Content (Join-Path $taskOut 'model-index.json');[pscustomobject]@{Success=$true;Indexed=$taskNames.Count;Models=@($taskNames|Where-Object {$_ -match '\.m3$'}).Count}|ConvertTo-Json -Compress
 }else{
  $taskSelected=Get-Content (Join-Path $taskOut 'extract-requests.json') -Raw|ConvertFrom-Json;$taskRecords=@()
  foreach($taskName in $taskSelected){$taskIn=$taskStorage.OpenFile($taskName);try{$taskDest=Join-Path $taskOut ([IO.Path]::GetFileName($taskName));$taskFile=[IO.File]::Create($taskDest);try{$taskIn.CopyTo($taskFile)}finally{$taskFile.Dispose()};$taskRecords+=@{path=$taskName;file=[IO.Path]::GetFileName($taskName);sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant()}}finally{$taskIn.Dispose()}}
  $taskRecords|ConvertTo-Json|Set-Content (Join-Path $taskOut 'sources.json');[pscustomobject]@{Success=$true;Extracted=$taskRecords.Count}|ConvertTo-Json -Compress
 }
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}



