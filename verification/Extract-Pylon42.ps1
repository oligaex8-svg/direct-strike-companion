$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOut=Join-Path $taskRoot 'assets/themes/protoss42/native'
New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None
[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null)
 $taskStorage.Root.LoadListFile($null,$null)
 $null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskNames=@([CASCLib.CASCFile]::Files.Values|Where-Object {$_.FullName -match '(?i)pylon' -and $_.FullName -match '\.(m3|m3a|dds)$'}|ForEach-Object {$_.FullName}|Sort-Object -Unique)
 $taskNames|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskOut 'archive-index.json')
 $taskSelected=@($taskNames|Where-Object {$_ -match '(?i)([\\/]pylon[\\/]|[\\/]pylon\.(m3|m3a)$|[\\/]pylon[^\\/]*\.dds$)'})
 $taskRecords=@()
 foreach($taskName in $taskSelected){
  $taskInput=$null
  try{
   $taskInput=$taskStorage.OpenFile($taskName)
   if(!$taskInput -or $taskInput.Length -le 0 -or $taskInput.Length -gt 12MB){continue}
   $taskLeaf=[IO.Path]::GetFileName($taskName)
   $taskDest=Join-Path $taskOut $taskLeaf
   if(!(Test-Path -LiteralPath $taskDest)){$taskOutput=[IO.File]::Create($taskDest);try{$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose()}}
   $taskRecords+=[pscustomobject]@{gamePath=$taskName;file=$taskLeaf;bytes=(Get-Item -LiteralPath $taskDest).Length;sha256=(Get-FileHash -LiteralPath $taskDest -Algorithm SHA256).Hash.ToLowerInvariant()}
  }finally{if($taskInput){$taskInput.Dispose()}}
 }
 [pscustomobject]@{source='Installed StarCraft II archive, read only';indexed=$taskNames.Count;files=$taskRecords}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $taskOut 'sources.json')
 $taskRecords|Select-Object file,bytes|ConvertTo-Json -Compress
}finally{
 if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}
}
