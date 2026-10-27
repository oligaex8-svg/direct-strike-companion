$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOut=Join-Path $taskRoot 'assets/themes/native45';New-Item -ItemType Directory -Path $taskOut -Force|Out-Null
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskLeaves=@('sensortower_diffuse.dds','sensortower_normal.dds','sensortower_emissive.dds','glow_red1.dds','sensortower_splat.dds','techlab_diffuse.dds','techlab_normal.dds','techlab_emissive.dds','warpline4.dds','blinkalpha2_inverted.dds','blinkalphaadd2.dds','shockwave_blackring1.dds')
 $taskNames=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {($_ -match '(?i)^mods/(core|liberty).sc2mod/base.sc2assets/Assets/Textures/' -and $taskLeaves -contains [IO.Path]::GetFileName($_).ToLowerInvariant()) -or $_ -eq 'mods/core.sc2mod/base.sc2assets/Assets/UI/Feedback/PylonRadius/PylonRadius.m3' -or $_ -eq 'mods/liberty.sc2mod/base.sc2assets/Assets/Buildings/Protoss/PylonWarpIn/PylonWarpIn.m3'}|Sort-Object -Unique)
 $taskRecords=@();foreach($taskName in $taskNames){$taskInput=$taskStorage.OpenFile($taskName);try{$taskDest=Join-Path $taskOut ([IO.Path]::GetFileName($taskName));$taskOutput=[IO.File]::Create($taskDest);try{$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose()};$taskRecords+=@{path=$taskName;file=[IO.Path]::GetFileName($taskName);sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant()}}finally{$taskInput.Dispose()}}
 $taskRecords|ConvertTo-Json|Set-Content (Join-Path $taskOut 'texture-sources.json');$taskNames|ConvertTo-Json -Compress
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}
