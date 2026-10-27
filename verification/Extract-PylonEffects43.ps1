$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOut=Join-Path $taskRoot 'assets/themes/protoss42/native'
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None
[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null)
 $taskStorage.Root.LoadListFile($null,$null)
 $null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskNames=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)^mods/(core|liberty|swarm|void|libertymulti|swarmmulti|voidmulti)\.sc2mod/base\.sc2data/gamedata/(actor|model|turret|unit)data\.xml$' -or $_ -match '(?i)/assets/textures/(glow_blue2|envirotest2)\.dds$'}|Sort-Object -Unique)
 $taskRecords=@()
 foreach($taskName in $taskNames){
  $taskInput=$null
  try{
   $taskInput=$taskStorage.OpenFile($taskName);if(!$taskInput){continue}
   if($taskName -match '\.xml$'){
    $taskReader=[IO.StreamReader]::new($taskInput);$taskText=$taskReader.ReadToEnd();$taskXml=[xml]$taskText
    $taskMatches=@($taskXml.Catalog.ChildNodes|Where-Object {$_.OuterXml -match '(?i)pylon'})
    $taskBase=($taskName -replace '[^a-zA-Z0-9.]','_')
    $taskMatches|ForEach-Object {$_.OuterXml}|Set-Content -LiteralPath (Join-Path $taskOut ($taskBase+'.pylon.xml'))
    $taskRecords+=@{gamePath=$taskName;matchingElements=$taskMatches.Count;file=$taskBase+'.pylon.xml'}
   }else{
    $taskDest=Join-Path $taskOut ([IO.Path]::GetFileName($taskName));$taskOutput=[IO.File]::Create($taskDest);try{$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose()}
    $taskRecords+=@{gamePath=$taskName;file=[IO.Path]::GetFileName($taskName);sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant()}
   }
  }finally{if($taskInput){$taskInput.Dispose()}}
 }
 $taskRecords|ConvertTo-Json -Depth 5|Set-Content (Join-Path $taskOut 'effects-sources43.json')
 $taskRecords|ConvertTo-Json -Depth 5 -Compress
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}
