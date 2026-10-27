$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskOut=Join-Path $taskRoot 'assets/themes/native53';$taskTextures=Join-Path $taskOut 'textures';New-Item -ItemType Directory -Path $taskTextures -Force|Out-Null
$taskRequests=Get-Content (Join-Path $taskOut 'texture-requests.json') -Raw|ConvertFrom-Json
$taskPrevious=@{};if(Test-Path (Join-Path $taskOut 'texture-sources.json')){foreach($taskRecord in (Get-Content (Join-Path $taskOut 'texture-sources.json') -Raw|ConvertFrom-Json)){$taskPrevious[$taskRecord.reference]=$taskRecord}}
[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'russian-sound-work/CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None;[CASCLib.CASCConfig]::ValidateData=$true;$taskStorage=$null
try{
 $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null);$taskStorage.Root.LoadListFile($null,$null);$null=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::enUS,$false,$false)
 $taskAll=@([CASCLib.CASCFile]::Files.Values|ForEach-Object {$_.FullName}|Where-Object {$_ -match '(?i)sc2assets/Assets/Textures/[^/]+\.dds$'});$taskRecords=@();$taskMissing=@()
 foreach($taskRequest in $taskRequests){$taskOld=$taskPrevious[$taskRequest.source];if($taskOld -and (Test-Path (Join-Path $taskOut $taskOld.png)) -and ((Get-FileHash (Join-Path $taskOut $taskOld.png)).Hash.ToLowerInvariant() -eq $taskOld.pngSHA256)){$taskRecords+=$taskOld;continue};$taskLeaf=[IO.Path]::GetFileName($taskRequest.source).ToLowerInvariant();$taskName=$taskAll|Where-Object {[IO.Path]::GetFileName($_).ToLowerInvariant() -eq $taskLeaf}|Sort-Object @{Expression={if($_ -match '^campaigns/void'){0}elseif($_ -match '^campaigns/swarm'){1}elseif($_ -match '^campaigns/liberty'){2}elseif($_ -match '^mods/liberty'){3}else{4}}}, @{Expression={$_}}|Select-Object -First 1;if(!$taskName){$taskMissing+=@{reference=$taskRequest.source;devices=$taskRequest.devices};continue}
  $taskIn=$null;$taskUnavailable=@();foreach($taskCandidate in @($taskName)+@($taskAll|Where-Object {[IO.Path]::GetFileName($_).ToLowerInvariant() -eq $taskLeaf -and $_ -ne $taskName})){try{$taskIn=$taskStorage.OpenFile($taskCandidate);$taskName=$taskCandidate;break}catch{$taskUnavailable+=$taskCandidate}}
  if(!$taskIn){$taskMissing+=@{reference=$taskRequest.source;devices=$taskRequest.devices;unavailableArchiveEntries=$taskUnavailable};continue}
  try{$taskDest=Join-Path $taskOut $taskLeaf;$taskFile=[IO.File]::Create($taskDest);try{$taskIn.CopyTo($taskFile)}finally{$taskFile.Dispose()}}finally{$taskIn.Dispose()}
  $taskPng=Join-Path $taskOut $taskRequest.png; & ffmpeg -hide_banner -loglevel error -y -threads 1 -i $taskDest -frames:v 1 -threads 1 $taskPng;if($LASTEXITCODE -ne 0){throw ('DDS conversion failed '+$taskLeaf)}
  $taskRecords+=@{reference=$taskRequest.source;archivePath=$taskName;file=$taskLeaf;sha256=(Get-FileHash $taskDest).Hash.ToLowerInvariant();png=$taskRequest.png;pngSHA256=(Get-FileHash $taskPng).Hash.ToLowerInvariant()}
 }
 $taskRecords|ConvertTo-Json|Set-Content (Join-Path $taskOut 'texture-sources.json');ConvertTo-Json -InputObject @($taskMissing)|Set-Content (Join-Path $taskOut 'missing-textures.json');[pscustomobject]@{Success=($taskMissing.Count -eq 0);Extracted=$taskRecords.Count;Missing=$taskMissing}|ConvertTo-Json -Depth 4 -Compress
}finally{if($taskStorage){$taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage);foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()};$taskMaps.Clear()}}

