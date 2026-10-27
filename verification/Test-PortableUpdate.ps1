param([switch]$OriginalRelease, [switch]$BuildApp,
    [string]$SourceExecutable,
    [ValidatePattern('^[^\\/:*?"<>|]+\.exe$')][string]$TargetName='DirectStrikeCompanion.exe',
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$ExpectedVersion='1.1.8',
    [ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedSHA256='2BD0B9348C179EEE9EBE63977113A7D40BDF4DF29E8ED48490183B8E6ECCA8CA')
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$BuildApp -and (Get-CimInstance Win32_Process | Where-Object {$_.Name -like 'DirectStrikeCompanion*.exe' -or $_.Name -eq 'Direct Strike Companion.exe'})) {
    throw 'A Companion is already running. Defer this test; do not close the user-owned application.'
}
# DSC_DATA_DIR isolates the replay library. The released app still uses its
# per-user updater cache/optional credentials and global application mutex.
$run = Join-Path $PSScriptRoot ('portable-update-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $run
# Reuse the project's resource sampler without executing its jobs.
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Run-RussianSoundWork.ps1'), [ref]$null, [ref]$null)
$sampler = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Read-TaskBudget'}, $true)
Invoke-Expression $sampler.Extent.Text
$samples = [Collections.Generic.List[object]]::new()
$ownedParents = [Collections.Generic.List[int]]::new()
function Check-Budget {
    $sample = Read-TaskBudget; $samples.Add($sample)
    if ($sample.Cpu -ge 94 -or $sample.PdhCpu -ge 94 -or $sample.Gpu -ge 94 -or $sample.Ram -ge 98) { throw 'Resource limit reached; stop task-owned update test.' }
}
function Run-Checked([string]$file, [string[]]$arguments) {
    Check-Budget
    $start = [Diagnostics.ProcessStartInfo]::new($file)
    $start.UseShellExecute = $false; $start.CreateNoWindow = $true; $start.WorkingDirectory = $run
    foreach ($argument in $arguments) { $start.ArgumentList.Add($argument) }
    $start.Environment['DSC_UPDATE_TEST_ROOT'] = $run
    $start.Environment['DSC_DATA_DIR'] = Join-Path $run 'data'
    $process = [Diagnostics.Process]::Start($start)
    $ownedParents.Add($process.Id)
    try {
        $process.PriorityClass = 'BelowNormal'; $process.ProcessorAffinity = [IntPtr]1
        $deadline = [DateTime]::UtcNow.AddMinutes(5)
        while (!$process.HasExited) {
            Check-Budget
            if ([DateTime]::UtcNow -gt $deadline) { throw 'Update test timeout.' }
            Start-Sleep -Milliseconds 300
        }
        if ($process.ExitCode -ne 0) { throw "Task process failed: $file (exit $($process.ExitCode))" }
    } finally { if (!$process.HasExited) { $process.Kill($true); $process.WaitForExit() }; $process.Dispose() }
}
$target = Join-Path $run 'app/DirectStrikeCompanion-win-x64 (1).exe'
$null = New-Item -ItemType Directory -Path (Join-Path $run 'data/empty-replays') -Force
$library = Join-Path $run 'data/library.json'
@{settings=@{language='ru';graphicalStyle='fenix';replayFolders=@((Join-Path $run 'data/empty-replays'));liveWatch=$false;screenWatch=$false;sound=$false;autoDetectSelf=$false};marks=@{'test-friend'=@{id='test-friend';name='Update test';note='Keep this saved friend';updated='2026-10-27T00:00:00Z';list='friends'}}} | ConvertTo-Json -Depth 8 | Set-Content $library
Set-Content (Join-Path $run 'data/preservation.txt') 'saved data remains intact'
try {
    if ($BuildApp) {
        $output=[IO.Path]::GetFullPath((Join-Path $project '../UpdaterFix-1.1.8'))
        $outputExe=Join-Path $output 'DirectStrikeCompanion.exe'
        if(Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq $outputExe){throw 'Local updater fix is running; leave it unchanged.'}
        $dotnet=[IO.Path]::GetFullPath((Join-Path $project '../BuildRuntime/dotnet/dotnet.exe'))
        Run-Checked $dotnet @('publish',(Join-Path $project 'DirectStrikeCompanion.csproj'),'-c','Release','-r','win-x64','--self-contained','true','-o',$output,'--no-restore','-m:1','-p:PublishSingleFile=true','-p:IncludeNativeLibrariesForSelfExtract=true','-p:DebugType=embedded','-p:Version=1.1.8-local.updater.1','-p:UseSharedCompilation=false')
        Run-Checked $outputExe @('--self-test','--updates-only')
        [pscustomobject]@{Success=$true;Path=$outputExe;Version=(Get-Item $outputExe).VersionInfo.ProductVersion;SHA256=(Get-FileHash $outputExe -Algorithm SHA256).Hash;Scope='Local unpublished updater fix'}|ConvertTo-Json|Tee-Object -FilePath (Join-Path $PSScriptRoot 'portable-update-build.json')
        return
    } elseif ($OriginalRelease) {
        # Exercise the existing public 1.1.7 after its filename-only workaround.
        $null = New-Item -ItemType Directory -Path (Join-Path $run 'app')
        $target = Join-Path (Join-Path $run 'app') $TargetName
        $source = if($SourceExecutable){[IO.Path]::GetFullPath($SourceExecutable)}else{Join-Path $PSScriptRoot 'public-1.1.7.exe'}
        Copy-Item -LiteralPath $source -Destination $target
        $sourceVersion=[version](Get-Item $source).VersionInfo.FileVersion
        $sourceVersion="{0}.{1}.{2}" -f $sourceVersion.Major,$sourceVersion.Minor,$sourceVersion.Build
        Check-Budget
        $start = [Diagnostics.ProcessStartInfo]::new($target)
        $start.UseShellExecute=$false; $start.CreateNoWindow=$true
        $start.Environment['DSC_DATA_DIR']=Join-Path $run 'data'
        $start.ArgumentList.Add('--no-import'); $start.ArgumentList.Add('--no-browser')
        $old = [Diagnostics.Process]::Start($start)
        $ownedParents.Add($old.Id)
        $deadline=[DateTime]::UtcNow.AddSeconds(30)
        while (!(Test-Path (Join-Path $run 'data/running-url.txt'))) { Check-Budget; if([DateTime]::UtcNow -gt $deadline){throw 'Old app did not start.'} }
        $url=(Get-Content (Join-Path $run 'data/running-url.txt') -Raw).Trim()
        $headers=@{'X-DS-Companion'='1'}
        $status=Invoke-RestMethod "$url/api/software-updates/check" -Method Post -Headers $headers
        if($status.currentVersion -ne $sourceVersion -or $status.availableVersion -ne $ExpectedVersion){throw 'Unexpected public upgrade offer.'}
        # Keep resource monitoring active while the real API downloads/restarts.
        $client=[Net.Http.HttpClient]::new(); $client.Timeout=[TimeSpan]::FromMinutes(5)
        $client.DefaultRequestHeaders.Add('X-DS-Companion','1')
        $pending=$client.PostAsync("$url/api/software-updates/install",[Net.Http.StringContent]::new((@{version=$ExpectedVersion}|ConvertTo-Json -Compress),[Text.Encoding]::UTF8,'application/json'))
        while(!$pending.IsCompleted){Check-Budget; Start-Sleep -Milliseconds 300}
        # The app may close the HTTP connection as shutdown begins; executable
        # identity and restarted API below are the decisive acceptance checks.
        try { $response=$pending.GetAwaiter().GetResult(); $response.Dispose() } catch {}
        $client.Dispose()
    } else {
        $escaped=[Security.SecurityElement]::Escape($project)
        @"
<Project Sdk="Microsoft.NET.Sdk">
<PropertyGroup><TargetFramework>net10.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms><OutputType>WinExe</OutputType><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><EnableDefaultCompileItems>false</EnableDefaultCompileItems><AssemblyName>DirectStrikeCompanion-win-x64 (1)</AssemblyName><Product>Direct Strike Companion</Product><Version>1.1.7</Version></PropertyGroup>
<ItemGroup><Compile Include="$escaped/ReleaseUpdater.cs"/><Compile Include="$escaped/ReleaseUpdaterTests.cs"/><Compile Include="$escaped/verification/PortableUpdateHarness.cs"/><AssemblyMetadata Include="UpdateRepository" Value="oligaex8-svg/direct-strike-companion"/></ItemGroup>
</Project>
"@ | Set-Content (Join-Path $run 'Harness.csproj')
        Run-Checked ([IO.Path]::GetFullPath((Join-Path $project '../BuildRuntime/dotnet/dotnet.exe'))) @('publish',(Join-Path $run 'Harness.csproj'),'-c','Release','-r','win-x64','--self-contained','true','-o',(Join-Path $run 'app'),'-m:1','-p:PublishSingleFile=true','-p:IncludeNativeLibrariesForSelfExtract=true','-p:UseSharedCompilation=false')
        Run-Checked $target @('--tests')
        $null=New-Item -ItemType Junction -Path (Join-Path $run 'linked-app') -Target (Join-Path $run 'app')
        Run-Checked $target @('--reject-linked-target',(Join-Path $run 'linked-app/DirectStrikeCompanion-win-x64 (1).exe'))
        Run-Checked $target @()
    }
    $deadline=[DateTime]::UtcNow.AddSeconds(80); $status=$null
    do {
        Check-Budget
        if ((Test-Path $target) -and (Get-Item $target).VersionInfo.FileVersion -eq "$ExpectedVersion.0" -and (Test-Path (Join-Path $run 'data/running-url.txt'))) {
            $url=(Get-Content (Join-Path $run 'data/running-url.txt') -Raw).Trim()
            try { $status=Invoke-RestMethod "$url/api/software-updates/status" -Headers @{'X-DS-Companion'='1'} -TimeoutSec 2 } catch {}
        }
        if ([DateTime]::UtcNow -gt $deadline) { throw "Updated app failed to restart as $ExpectedVersion." }
    } until ($status.currentVersion -eq $ExpectedVersion)
    $saved=Get-Content $library -Raw | ConvertFrom-Json
    if($saved.settings.language -ne 'ru' -or $saved.marks.'test-friend'.note -ne 'Keep this saved friend' -or (Get-Content (Join-Path $run 'data/preservation.txt') -Raw).Trim() -ne 'saved data remains intact'){throw 'Saved fixture data changed.'}
    $hash=(Get-FileHash $target -Algorithm SHA256).Hash
    if($hash -ne $ExpectedSHA256){throw 'Installed hash differs from verified release.'}
    $report=[pscustomobject]@{Success=$true;OriginalRelease=$OriginalRelease.IsPresent;SourceVersion=$sourceVersion;ExecutableName=[IO.Path]::GetFileName($target);InstalledVersion=$status.currentVersion;SHA256=$hash;RestartedApi=$url;SavedSettingsAndFriendPreserved=$true;Run=$run;VerifiedAt=[DateTime]::UtcNow.ToString('o')}
    $report|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot ('portable-update-result'+$(if($SourceExecutable){'-'+$ExpectedVersion}elseif($OriginalRelease){'-original'})+'.json'))
    $report|ConvertTo-Json
} finally {
    # Stop only this run's copies, never a user-owned Companion or game.
    Get-CimInstance Win32_Process -Filter "Name='updater.exe'" | Where-Object {$ownedParents.Contains([int]$_.ParentProcessId)} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
    Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($run+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
    $samples|ConvertTo-Json|Set-Content (Join-Path $run 'resource-samples.json')
}
