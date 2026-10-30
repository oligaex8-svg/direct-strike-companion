$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskWork=Join-Path $PSScriptRoot 'unit-icon-work'
$taskDds=Join-Path $taskWork 'dds';New-Item -ItemType Directory -Path $taskDds -Force|Out-Null
$taskRequests=Get-Content (Join-Path $taskWork 'unit-icon-requests.json') -Raw|ConvertFrom-Json
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None
[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null;$taskMissing=@()
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null)
 $taskStorage.Root.LoadListFile($null,$null)
 $null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 foreach($taskRequest in $taskRequests){
  $taskInput=$null
  try{$taskInput=$taskStorage.OpenFile($taskRequest.archivePath)}catch{$taskMissing+=$taskRequest.archivePath;continue}
  try{$taskOutput=[IO.File]::Create((Join-Path $taskDds ($taskRequest.file+'.dds')));try{$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose()}}finally{$taskInput.Dispose()}
 }
 ConvertTo-Json -InputObject @($taskMissing)|Set-Content (Join-Path $taskWork 'missing-textures.json')
 & 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' (Join-Path $PSScriptRoot 'Build-UnitIconCatalog.py') --pack
 if($LASTEXITCODE -ne 0){throw 'Unit icon conversion failed.'}
}finally{
 if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}
}
