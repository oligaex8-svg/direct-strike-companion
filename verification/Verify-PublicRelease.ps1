param([Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version)
$ErrorActionPreference='Stop'
$repo='oligaex8-svg/direct-strike-companion'
$release=Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
if($release.tag_name -ne "v$Version" -or $release.draft -or $release.prerelease){throw 'Expected stable release is not latest.'}
$names=@('DirectStrikeCompanion.exe','DirectStrikeCompanion-win-x64.exe')
$assets=@($release.assets|Where-Object name -in $names)
if($assets.Count -ne 2 -or @($assets.name|Sort-Object -Unique).Count -ne 2){throw 'Canonical or compatibility asset missing.'}
if(@($assets.digest|Sort-Object -Unique).Count -ne 1 -or $assets[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$'){throw 'Release assets have inconsistent or missing hashes.'}
if(@($assets.size|Sort-Object -Unique).Count -ne 1 -or $assets[0].size -gt 512MB){throw 'Release assets have inconsistent or oversized lengths.'}
# Anonymous canonical latest link, exactly as shown to users. No gh/token calls.
$url="https://github.com/$repo/releases/latest/download/DirectStrikeCompanion.exe"
$output=Join-Path $PSScriptRoot "public-$Version.exe"
if(Test-Path $output){throw 'Verification download already exists; inspect it before replacing.'}
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Run-RussianSoundWork.ps1'),[ref]$null,[ref]$null)
$sampler=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Read-TaskBudget'},$true)
Invoke-Expression $sampler.Extent.Text
$samples=[Collections.Generic.List[object]]::new()
function Check-Budget {
    $sample=Read-TaskBudget; $samples.Add($sample)
    if($sample.Cpu -ge 94 -or $sample.PdhCpu -ge 94 -or $sample.Gpu -ge 94 -or $sample.Ram -ge 98){throw 'Resource limit reached during release verification.'}
}
$client=[Net.Http.HttpClient]::new(); $client.Timeout=[TimeSpan]::FromMinutes(5)
$cancel=[Threading.CancellationTokenSource]::new([TimeSpan]::FromMinutes(5))
$response=$null; $inputStream=$null; $file=$null
try {
    Check-Budget
    $response=$client.GetAsync($url,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancel.Token).GetAwaiter().GetResult()
    $null=$response.EnsureSuccessStatusCode()
    $inputStream=$response.Content.ReadAsStreamAsync($cancel.Token).GetAwaiter().GetResult()
    $file=[IO.FileStream]::new($output,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,65536,$true)
    $copy=$inputStream.CopyToAsync($file,$cancel.Token)
    while(!$copy.IsCompleted){Check-Budget; Start-Sleep -Milliseconds 200}
    $null=$copy.GetAwaiter().GetResult(); $file.Dispose(); $file=$null
    $hash=(Get-FileHash $output -Algorithm SHA256).Hash.ToLowerInvariant()
    $info=Get-Item $output
    if("sha256:$hash" -ne $assets[0].digest -or $info.Length -ne $assets[0].size -or $info.VersionInfo.FileVersion -ne "$Version.0" -or $info.VersionInfo.ProductName -ne 'Direct Strike Companion'){throw 'Downloaded executable does not match the release.'}
    $report=[pscustomobject]@{Success=$true;Anonymous=$true;Version=$Version;Download=$url;Assets=$names;Bytes=$info.Length;SHA256=$hash;ProductVersion=$info.VersionInfo.ProductVersion;VerifiedAt=[DateTime]::UtcNow.ToString('o')}
    $report|ConvertTo-Json|Tee-Object -FilePath (Join-Path $PSScriptRoot "public-release-$Version.json")
} finally {
    $cancel.Cancel(); if($file){$file.Dispose()}; if($inputStream){$inputStream.Dispose()}; if($response){$response.Dispose()}; $cancel.Dispose(); $client.Dispose()
    $samples|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot "public-release-$Version-resources.json")
}
