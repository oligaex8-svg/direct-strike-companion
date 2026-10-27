$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot=[IO.Path]::GetFullPath((Join-Path $taskRoot '../BuildRuntime'))
$sdkRoot=Join-Path $runtimeRoot 'dotnet'
if(Test-Path (Join-Path $sdkRoot 'sdk/10.0.402')){Write-Output 'Local SDK 10.0.402 already prepared.';exit 0}
$metadata=Invoke-RestMethod 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json'
$sdk=@($metadata.releases|ForEach-Object {$_.sdks}|Where-Object version -eq '10.0.402')|Select-Object -First 1
$asset=@($sdk.files|Where-Object {$_.rid -eq 'win-x64' -and $_.url.EndsWith('.zip')})
if($asset.Count -ne 1 -or $asset[0].url -notlike 'https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.402/*'){throw 'Official SDK metadata did not identify the expected archive.'}
New-Item -ItemType Directory -Force -Path $runtimeRoot,$sdkRoot|Out-Null
$archive=Join-Path $runtimeRoot 'dotnet-sdk-10.0.402-win-x64.zip'
if(!(Test-Path $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash.ToLowerInvariant() -ne $asset[0].hash){Invoke-WebRequest $asset[0].url -OutFile $archive}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash.ToLowerInvariant() -ne $asset[0].hash){throw 'SDK archive hash mismatch.'}
Expand-Archive -LiteralPath $archive -DestinationPath $sdkRoot -Force
& (Join-Path $sdkRoot 'dotnet.exe') --version
if($LASTEXITCODE -ne 0){throw 'Local SDK failed.'}
