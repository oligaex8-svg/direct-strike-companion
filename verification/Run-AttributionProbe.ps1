param([switch]$Zagara,[switch]$Summons,[switch]$MapHandles)
$ErrorActionPreference='Stop'
$taskDotnet=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../BuildRuntime/dotnet/dotnet.exe'))
$taskRunArgs=@('run','--project','verification/AttributionProbe/AttributionProbe.csproj','-p:UseSharedCompilation=false','--disable-build-servers')
$taskRunArgs+=@('--');if($Zagara){$taskRunArgs+='--zagara'};if($Summons){$taskRunArgs+='--summons'}
if($MapHandles){$taskRunArgs+='--map-handles'}
& $taskDotnet @taskRunArgs
if($LASTEXITCODE -ne 0){throw 'Attribution probe failed.'}
