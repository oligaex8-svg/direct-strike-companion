param([switch]$UseCachedIndex)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOut=Join-Path $PSScriptRoot 'unit-icon-work'
New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None
[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null
try {
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null)
 $taskStorage.Root.LoadListFile($null,$null)
 $null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskNames=if($UseCachedIndex){@(Get-Content (Join-Path $taskOut 'data-paths.txt'))+@(Get-Content (Join-Path $taskOut 'texture-paths.txt'))}else{@([CASCLib.CASCFile]::Files.Values | ForEach-Object {$_.FullName})}
 $taskNames | Where-Object {$_ -match '(?i)\.sc2data/gamedata/(actor|unit|button)data.xml$'} | Set-Content (Join-Path $taskOut 'catalog-paths.txt')
 $taskNames | Where-Object {$_ -match '(?i)\.sc2data/(gamedata/[^/]+\.xml|gamedata.xml)$'} | Set-Content (Join-Path $taskOut 'data-paths.txt')
 $taskSelected=@($taskNames | Where-Object {$_ -match '(?i)^(mods/(core|liberty|libertymulti|swarm|swarmmulti|void|voidmulti|novastoryassets|starcoop/starcoop|starcoop/commanders/(arcturusmengsk|egonstetmann))\.sc2mod|campaigns/(liberty|swarm|void)\.sc2campaign)/[^/]+\.sc2data/gamedata/(actor|unit|button)data.xml$'} | Sort-Object)
 $taskRecords=@()
 foreach($taskName in $taskSelected){
  $taskInput=$taskStorage.OpenFile($taskName)
  try {
   $taskLeaf=$taskName.Replace('/','__');$taskFile=[IO.File]::Create((Join-Path $taskOut $taskLeaf))
   try{$taskInput.CopyTo($taskFile)}finally{$taskFile.Dispose()}
   $taskRecords+=@{archivePath=$taskName;file=$taskLeaf}
  } finally {$taskInput.Dispose()}
 }
 ConvertTo-Json -InputObject @($taskRecords) | Set-Content (Join-Path $taskOut 'catalog-sources.json')
 $taskNames | Where-Object {$_ -match '(?i)\.sc2assets/assets/textures/[^/]+\.dds$'} | Set-Content (Join-Path $taskOut 'texture-paths.txt')
 [pscustomobject]@{Extracted=$taskRecords.Count;Paths=$taskSelected}|ConvertTo-Json -Compress
}finally{
 if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}
}
