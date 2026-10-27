$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$env:DOTNET_ROOT=[IO.Path]::GetFullPath((Join-Path $taskRoot '../BuildRuntime/dotnet'))
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_NOLOGO='1'
$dotnet=Join-Path $env:DOTNET_ROOT 'dotnet.exe'
$output=[IO.Path]::GetFullPath((Join-Path $taskRoot '../LocalPreview'))
# Keep an owner-opened preview running. Build beside it instead of replacing
# its locked executable or closing the user's Companion window.
if(Get-Process -Name DirectStrikeCompanion -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $output 'DirectStrikeCompanion.exe')}){
    $output=[IO.Path]::GetFullPath((Join-Path $taskRoot '../LocalReview'))
    if(Get-Process -Name DirectStrikeCompanion -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $output 'DirectStrikeCompanion.exe')}){$output+='-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')}
}
& $dotnet restore (Join-Path $taskRoot 'DirectStrikeCompanion.csproj') -r win-x64 --locked-mode -p:RestoreDisableParallel=true -m:1
if($LASTEXITCODE -ne 0){throw 'Local restore failed.'}
& $dotnet publish (Join-Path $taskRoot 'DirectStrikeCompanion.csproj') -c Release -r win-x64 --self-contained true --no-restore -o $output -m:1 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=embedded -p:Version=1.1.7-local.54 -p:UseSharedCompilation=false
if($LASTEXITCODE -ne 0){throw 'Local publish failed.'}
$exe=Join-Path $output 'DirectStrikeCompanion.exe'
[pscustomobject]@{Success=$true;Scope='Local unpublished build; installed EXE unchanged';Path=$exe;SHA256=(Get-FileHash $exe -Algorithm SHA256).Hash;Version=(Get-Item $exe).VersionInfo.ProductVersion}|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'native-local-build.json')



