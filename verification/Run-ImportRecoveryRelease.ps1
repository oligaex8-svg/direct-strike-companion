param([ValidateSet('Restore','Build','Compile','Package','Tests','Probe','Performance','ReaderPerformance','ReaderTemp','ReaderPackage','DsstatsTests','DsstatsLive','DsstatsBrowser','LobbyRatingTests','LobbyRatingLive','LobbyRatingBrowser','CompactLobbyTests','CompactLobbyBrowser','PlayersFirstLobbyBrowser','ReplayLayoutTests','ReplayLayoutBrowser','ImpactTests','ImpactBrowser','ImpactProbe','CompiledReaderPreview','ReaderPreview','ReaderLive','SixPlayerFixture','ProofLifetime','LobbyFixtures','CurrentInvite','LatestInvites','InvitePreview','NotificationAudio','NicknameDiagnostics','NicknameTests','NicknamePreview','CoveredLobbyTests','CoveredLobbyPreview','UiBrowser','DetailsBrowser','LobbyQuickLists','SoundMenuBrowser','LiveWindowCapture','NativeRuntimeProbe','WindowCaptureProbe','CurrentLobbyFixture','SiteProfileProbe','SiteProfileBrowser','PlayerRatingBrowser')][string]$Stage='Build',[switch]$CpuOnly)
$ErrorActionPreference='Stop'
if($CpuOnly -and $Stage -notin @('Build','Compile','Package')){throw 'CPU-only exception is restricted to this faction release build.'}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (Test-Path -LiteralPath (Join-Path $taskRoot 'Support/Development/DirectStrikeCompanion.csproj')) {
    $taskRoot=Join-Path $taskRoot 'Support/Development'
}
$samples=[Collections.Generic.List[object]]::new()
function Read-TaskBudget {
    $taskOs=Get-CimInstance Win32_OperatingSystem
    $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    if($null -eq $taskCpu){throw 'CPU reading unavailable; job deferred.'}
    $taskGpu=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
    if($taskGpu.Count -eq 0){throw 'GPU reading unavailable; job deferred.'}
    # Counters are per process and engine. Sum each physical engine across
    # processes, then use the busiest engine, as Task Manager does.
    $taskGpuEngines=@($taskGpu | Group-Object { $_.Name -replace '^pid_\d+_','' } | ForEach-Object {($_.Group | Measure-Object UtilizationPercentage -Sum).Sum})
    [pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Ram=[Math]::Round(100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize),2);Cpu=[double]$taskCpu.PercentProcessorTime;Gpu=[double](($taskGpuEngines|Measure-Object -Maximum).Maximum)}
}
function Stop-TaskTree([int]$taskPid) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$taskPid" | ForEach-Object { Stop-TaskTree $_.ProcessId }
    Stop-Process -Id $taskPid -Force -ErrorAction SilentlyContinue
}
function Invoke-TaskJob([string]$taskName,[string]$taskFile,[string[]]$taskArguments) {
    # Source-script diagnostics use the same compiled helper as the build;
    # deployed and exported scripts already have their sibling DLL.
    $taskSourceReader=Join-Path $taskRoot 'LobbyOcr.ps1'
    if(@($taskArguments | Where-Object {$_.Trim('"') -eq $taskSourceReader}).Count -and $taskArguments -notcontains '-CaptureHelperPath'){
        $taskHelper=Join-Path $taskRoot 'obj/Release/net10.0-windows10.0.22621.0/ocr-runtime/DscCaptureHelper.dll'
        if(-not (Test-Path -LiteralPath $taskHelper)){throw 'Build the compiled capture helper before source reader diagnostics.'}
        $taskArguments+=@('-CaptureHelperPath',('"'+$taskHelper+'"'))
    }
    $sample=Read-TaskBudget;$samples.Add($sample)
    if($sample.Ram -ge 98 -or $sample.Cpu -ge 94 -or (!$CpuOnly -and $sample.Gpu -ge 94)){throw 'Resource budget reached; release job deferred.'}
    $job=Start-Process -FilePath $taskFile -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot "$taskName-output.txt") -RedirectStandardError (Join-Path $PSScriptRoot "$taskName-error.txt")
    try {
        $null=$job.Handle
        $job.PriorityClass='BelowNormal';$job.ProcessorAffinity=[IntPtr]1
        while(-not $job.HasExited){
            Start-Sleep -Milliseconds 650
            $sample=Read-TaskBudget;$samples.Add($sample)
            if($sample.Ram -ge 98 -or $sample.Cpu -ge 94 -or (!$CpuOnly -and $sample.Gpu -ge 94)){Stop-TaskTree $job.Id;throw "Stopped task job $taskName after CPU/GPU/RAM budget was reached."}
        }
        $job.WaitForExit()
        if($job.ExitCode -ne 0){
            Get-Content -LiteralPath (Join-Path $PSScriptRoot "$taskName-output.txt") -Tail 18
            Get-Content -LiteralPath (Join-Path $PSScriptRoot "$taskName-error.txt") -Tail 8
            throw "$taskName failed ($($job.ExitCode))."
        }
        [pscustomobject]@{Job=$taskName;Exit=$job.ExitCode}
    } finally { $job.Dispose() }
}
try {
    if($Stage -eq 'NicknameDiagnostics') {
        Invoke-TaskJob 'nickname-ocr-diagnostics' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-NicknameOcr.ps1','-Explore')
    } elseif($Stage -eq 'NicknameTests') {
        $taskBundled=Join-Path $taskRoot 'release/test-output/bundled-LobbyOcr.ps1'
        Invoke-TaskJob 'nickname-ocr-crops' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-NicknameOcr.ps1','-ScriptPath',('"'+$taskBundled+'"'))
        Invoke-TaskJob 'nickname-full-lobby' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$taskBundled+'"'),'-ImagePath',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/full-lobby.png')+'"'),'-Diagnostics')
        Invoke-TaskJob 'nickname-roster-assertions' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-NicknameRoster.ps1')
    } elseif($Stage -eq 'NicknamePreview') {
        Invoke-TaskJob 'nickname-ocr-preview' (Get-Command node).Source @('verification/Preview-NicknameOcr.cjs')
    } elseif($Stage -eq 'CoveredLobbyTests') {
        $taskBundled=Join-Path $taskRoot 'release/test-output/bundled-LobbyOcr.ps1'
        Invoke-TaskJob 'covered-lobby-geometry' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-CoveredLobbyRows.ps1','-ScriptPath',('"'+$taskBundled+'"'))
        Invoke-TaskJob 'covered-lobby-fixture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$taskBundled+'"'),'-ImagePath',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/covered-lobby.png')+'"'),'-Diagnostics')
        Invoke-TaskJob 'covered-lobby-result' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-CoveredLobbyResult.ps1')
        Invoke-TaskJob 'covered-lobby-status' (Get-Command node).Source @('verification/Test-LobbyDetectionStatus.cjs')
    } elseif($Stage -eq 'CoveredLobbyPreview') {
        Invoke-TaskJob 'covered-lobby-preview' (Get-Command node).Source @('verification/Preview-CoveredLobby.cjs')
    } elseif($Stage -eq 'NotificationAudio') {
        Invoke-TaskJob 'native-notification-audio' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-notification-audio','sc1-roll-out','50')
    } elseif($Stage -eq 'InvitePreview') {
        Invoke-TaskJob 'invite-detection-preview' (Get-Command node).Source @('verification/Preview-InviteDetection.cjs')
    } elseif($Stage -eq 'LatestInvites') {
        Invoke-TaskJob 'sc2-latest-party-fixture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'LobbyOcr.ps1')+'"'),'-ImagePath','"C:/Users/Admin/AppData/Local/Temp/codex-clipboard-e148f36a-1c3e-47d4-93ac-563bfb96aeab.png"','-Diagnostics')
        Invoke-TaskJob 'sc2-latest-game-fixture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'LobbyOcr.ps1')+'"'),'-ImagePath','"C:/Users/Admin/AppData/Local/Temp/codex-clipboard-81f520ec-78fe-4b92-9d97-cc78da742c8c.png"','-Diagnostics')
    } elseif($Stage -eq 'CurrentInvite') {
        Invoke-TaskJob 'sc2-repeat-invite-fixture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'LobbyOcr.ps1')+'"'),'-ImagePath','"C:/Users/Admin/AppData/Local/Temp/codex-clipboard-c1f8e413-d659-4117-9800-c9cb1f261ed5.png"','-Diagnostics')
    } elseif($Stage -eq 'LiveWindowCapture') {
        Invoke-TaskJob 'live-window-capture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-BackgroundLobby.ps1')
    } elseif($Stage -eq 'NativeRuntimeProbe') {
        Invoke-TaskJob 'native-runtime-probe' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-BackgroundLobby.ps1','-ScriptPath',('"'+(Join-Path $taskRoot '../../data/tools/LobbyOcr.ps1')+'"'),'-PowerShellPath','"C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"')
    } elseif($Stage -eq 'ReaderPerformance') {
        Invoke-TaskJob 'lobby-reader-performance' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-lobby-reader',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/six-player-lobby.png')+'"'))
    } elseif($Stage -eq 'ReaderLive') {
        Invoke-TaskJob 'lobby-reader-live' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-lobby-reader-live')
    } elseif($Stage -eq 'ReaderTemp') {
        Invoke-TaskJob 'lobby-reader-unusable-temp' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-lobby-reader',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/six-player-lobby.png')+'"'),'--unusable-temp')
    } elseif($Stage -eq 'ImpactTests') {
        Invoke-TaskJob 'detailed-impact-source-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--impact-only')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/impact-tests.json') -Destination (Join-Path $PSScriptRoot 'self-tests-detailed-impact.json') -Force
        Invoke-TaskJob 'detailed-impact-model' (Get-Command node).Source @('verification/Test-ImpactDetails.cjs')
        Invoke-TaskJob 'replay-impact-model' (Get-Command node).Source @('verification/Test-ReplayImpact.cjs')
    } elseif($Stage -eq 'ImpactBrowser') {
        Invoke-TaskJob 'detailed-impact-browser' (Get-Command node).Source @('verification/Test-ImpactBrowser.cjs')
    } elseif($Stage -eq 'ImpactProbe') {
        $taskReplay=(Get-ChildItem -LiteralPath 'C:/Users/Admin/OneDrive/Documents/StarCraft II/Accounts/416014729/2-S2-1-7408040/Replays/Multiplayer' -Filter '*.SC2Replay' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
        if(-not $taskReplay){throw 'No existing replay available for impact probe.'}
        Invoke-TaskJob 'detailed-impact-real-replay' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-impact',('"'+$taskReplay+'"'))
    } elseif($Stage -eq 'ReplayLayoutTests') {
        Invoke-TaskJob 'organized-replay-source-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--dsstats-only')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/dsstats-tests.json') -Destination (Join-Path $PSScriptRoot 'self-tests-organized-replays.json') -Force
        Invoke-TaskJob 'organized-replay-regressions' (Get-Command node).Source @('verification/Test-ListsReplays.cjs')
        Invoke-TaskJob 'organized-replay-grouped-ratings' (Get-Command node).Source @('verification/Test-GroupedRatings.cjs')
        Invoke-TaskJob 'replay-impact-model' (Get-Command node).Source @('verification/Test-ReplayImpact.cjs')
        Invoke-TaskJob 'dsstats-change-model' (Get-Command node).Source @('verification/Test-DsstatsChanges.cjs')
        Invoke-TaskJob 'dsr-projection-model' (Get-Command node).Source @('verification/Test-DsrProjections.cjs')
        Invoke-TaskJob 'live-lobby-forecast-model' (Get-Command node).Source @('verification/Test-LobbyForecast.cjs')
    } elseif($Stage -eq 'ReplayLayoutBrowser') {
        Invoke-TaskJob 'organized-replay-browser' (Get-Command node).Source @('verification/Test-OrganizedReplays.cjs')
    } elseif($Stage -eq 'CompactLobbyTests') {
        Invoke-TaskJob 'compact-lobby-source-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--dsstats-only')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/dsstats-tests.json') -Destination (Join-Path $PSScriptRoot 'self-tests-compact-lobby-layout.json') -Force
    } elseif($Stage -eq 'CompactLobbyBrowser') {
        Invoke-TaskJob 'compact-lobby-browser' (Get-Command node).Source @('verification/Test-CompactLobbyRatings.cjs')
    } elseif($Stage -eq 'PlayersFirstLobbyBrowser') {
        Invoke-TaskJob 'players-first-lobby-browser' (Get-Command node).Source @('verification/Test-PlayersFirstLobby.cjs')
    } elseif($Stage -eq 'LobbyRatingTests') {
        Invoke-TaskJob 'automatic-lobby-rating-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--lobby-ratings-only')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/lobby-rating-tests.json') -Destination (Join-Path $PSScriptRoot 'self-tests-auto-lobby-ratings.json') -Force
    } elseif($Stage -eq 'LobbyRatingLive') {
        Invoke-TaskJob 'automatic-lobby-rating-live' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-lobby-ratings')
    } elseif($Stage -eq 'LobbyRatingBrowser') {
        Invoke-TaskJob 'automatic-lobby-rating-browser' (Get-Command node).Source @('verification/Test-AutomaticLobbyRatings.cjs')
    } elseif($Stage -eq 'DsstatsTests') {
        Invoke-TaskJob 'dsstats-source-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--dsstats-only')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/dsstats-tests.json') -Destination (Join-Path $PSScriptRoot 'self-tests-dsstats-source.json') -Force
    } elseif($Stage -eq 'DsstatsLive') {
        Invoke-TaskJob 'dsstats-live-probe' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-dsstats')
    } elseif($Stage -eq 'DsstatsBrowser') {
        Invoke-TaskJob 'dsstats-browser' (Get-Command node).Source @('verification/Test-DsstatsUi.cjs')
    } elseif($Stage -eq 'ReaderPackage') {
        Invoke-TaskJob 'compiled-reader-package-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test','--reader-package-only')
    } elseif($Stage -eq 'SixPlayerFixture') {
        Invoke-TaskJob 'six-player-lobby-fixture' 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'LobbyOcr.ps1')+'"'),'-ImagePath',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/six-player-lobby.png')+'"'),'-Diagnostics','-CaptureHelperPath',('"'+(Join-Path $taskRoot 'release/test-output/DscCaptureHelper.dll')+'"'))
    } elseif($Stage -eq 'ProofLifetime') {
        Invoke-TaskJob 'reader-proof-lifetime' 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','verification/Test-ReaderProofLifetime.ps1','-ScriptPath',('"'+(Join-Path $taskRoot 'release/test-output/bundled-LobbyOcr.ps1')+'"'))
    } elseif($Stage -eq 'ReaderPreview') {
        Invoke-TaskJob 'lobby-reader-preview' (Get-Command node).Source @('verification/Preview-LobbyReader.cjs')
    } elseif($Stage -eq 'CompiledReaderPreview') {
        Invoke-TaskJob 'compiled-reader-preview' (Get-Command node).Source @('verification/Preview-CompiledReader.cjs')
    } elseif($Stage -eq 'WindowCaptureProbe') {
        Invoke-TaskJob 'window-capture-probe' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','verification/Test-WindowCapturePath.ps1')
    } elseif($Stage -eq 'CurrentLobbyFixture') {
        Invoke-TaskJob 'current-lobby-fixture' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File','LobbyOcr.ps1','-ImagePath',('"'+(Join-Path $PSScriptRoot 'fixtures/nicknames/covered-lobby.png')+'"'),'-Diagnostics')
    } elseif($Stage -eq 'PlayerRatingBrowser') {
        Invoke-TaskJob 'player-rating-browser' (Get-Command node).Source @('verification/Test-PlayerRatingBrowser.cjs')
    } elseif($Stage -eq 'SiteProfileBrowser') {
        Invoke-TaskJob 'site-profile-priority-browser' (Get-Command node).Source @('verification/Test-SiteProfilePriorityBrowser.cjs')
    } elseif($Stage -eq 'SoundMenuBrowser') {
        Invoke-TaskJob 'sound-menu-continuity-browser' (Get-Command node).Source @('verification/Test-SoundMenuContinuityBrowser.cjs')
    } elseif($Stage -eq 'LobbyQuickLists') {
        Invoke-TaskJob 'lobby-quick-lists-browser' (Get-Command node).Source @('verification/Test-LobbyQuickLists.cjs')
    } elseif($Stage -eq 'DetailsBrowser') {
        Invoke-TaskJob 'lobby-details-browser' (Get-Command node).Source @('verification/Test-LobbyDetailsBrowser.cjs')
    } elseif($Stage -eq 'UiBrowser') {
        Invoke-TaskJob 'compact-sound-browser' (Get-Command node).Source @('verification/Test-CompactSoundBrowser.cjs')
    } elseif($Stage -eq 'LobbyFixtures'){
        $taskFixtures=@{
            'sc2-party-toast-fixture'='C:/Users/Admin/AppData/Local/Temp/codex-clipboard-02662c2f-e816-49dd-a418-d71a56f51be0.png';
            'sc2-current-invite-fixture'='C:/Users/Admin/AppData/Local/Temp/codex-clipboard-45ad5338-c2cc-4d4d-99fb-6cafee510fe1.png';
            'sc2-invite-fixture'='C:/Users/Admin/AppData/Local/Temp/codex-clipboard-15d16c96-053a-4892-aaee-09b2e34520c4.png';
            'sc2-lobby-fixture'='C:/Users/Admin/AppData/Local/Temp/codex-clipboard-1814ccdd-cf3b-477b-a8e2-781f4d0f1107.png'
        }
        foreach($taskFixture in $taskFixtures.GetEnumerator()){
            Invoke-TaskJob $taskFixture.Key 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'LobbyOcr.ps1')+'"'),'-ImagePath',('"'+$taskFixture.Value+'"'),'-Diagnostics')
        }
    } elseif($Stage -eq 'Restore'){
        Invoke-TaskJob 'desktop-host-restore' (Join-Path $taskRoot '.sdk/dotnet.exe') @('restore',('"'+(Join-Path $taskRoot 'DirectStrikeCompanion.csproj')+'"'),'-r','win-x64','--force-evaluate','--disable-parallel')
    } elseif($Stage -eq 'Build'){
        # Do not retain MSBuild while Roslyn runs on a memory-constrained PC.
        # The installed SDK supplies the exact references/resources/generators.
        Invoke-TaskJob 'import-recovery-build-prepare' (Join-Path $taskRoot '.sdk/dotnet.exe') @('msbuild',('"'+(Join-Path $taskRoot 'DirectStrikeCompanion.csproj')+'"'),'/t:PrepareResources;Compile','/p:NonExistentFile=verification/__response_generation__','/p:Configuration=Release','/p:RuntimeIdentifier=win-x64','/p:SelfContained=true','/p:PublishSingleFile=true','/p:DebugType=embedded','/p:EnableNETAnalyzers=false','/p:UseSharedCompilation=false','/p:SkipCompilerExecution=true','/p:ProvideCommandLineArgs=true',('/p:CustomAfterMicrosoftCommonTargets="'+(Join-Path $PSScriptRoot 'CompilerCommands.targets')+'"'),'-m:1')
        Invoke-TaskJob 'import-recovery-build-compile' (Join-Path $taskRoot '.sdk/dotnet.exe') @('exec',('"'+(Join-Path $taskRoot '.sdk/sdk/10.0.401/Roslyn/bincore/csc.dll')+'"'),'/noconfig','/parallel-',('@"'+(Join-Path $PSScriptRoot 'import-recovery-compiler.rsp')+'"'))
        Invoke-TaskJob 'import-recovery-build-package' (Join-Path $taskRoot '.sdk/dotnet.exe') @('publish',('"'+(Join-Path $taskRoot 'DirectStrikeCompanion.csproj')+'"'),'-c','Release','-r','win-x64','--self-contained','true','--no-restore','--disable-build-servers','/p:SkipCompilerExecution=true','/p:EnableNETAnalyzers=false','-m:1','/p:UseSharedCompilation=false','-o',('"'+(Join-Path $taskRoot 'release')+'"'),'/p:PublishSingleFile=true','/p:IncludeNativeLibrariesForSelfExtract=true','/p:DebugType=embedded')
    } elseif($Stage -eq 'Compile') {
        Invoke-TaskJob 'import-recovery-build-compile' (Join-Path $taskRoot '.sdk/dotnet.exe') @('exec',('"'+(Join-Path $taskRoot '.sdk/sdk/10.0.401/Roslyn/bincore/csc.dll')+'"'),'/noconfig','/parallel-',('@"'+(Join-Path $PSScriptRoot 'import-recovery-compiler.rsp')+'"'))
    } elseif($Stage -eq 'Package') {
        Invoke-TaskJob 'import-recovery-build-package' (Join-Path $taskRoot '.sdk/dotnet.exe') @('publish',('"'+(Join-Path $taskRoot 'DirectStrikeCompanion.csproj')+'"'),'-c','Release','-r','win-x64','--self-contained','true','--no-restore','--disable-build-servers','/p:SkipCompilerExecution=true','/p:EnableNETAnalyzers=false','-m:1','/p:UseSharedCompilation=false','-o',('"'+(Join-Path $taskRoot 'release')+'"'),'/p:PublishSingleFile=true','/p:IncludeNativeLibrariesForSelfExtract=true','/p:DebugType=embedded')
    } elseif($Stage -eq 'Tests') {
        Invoke-TaskJob 'import-recovery-standalone-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/results.json') -Destination (Join-Path $PSScriptRoot 'self-tests-import-recovery-standalone.json') -Force
    } elseif($Stage -eq 'SiteProfileProbe') {
        Invoke-TaskJob 'site-profile-priority-live' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-site-profiles')
    } elseif($Stage -eq 'Probe') {
        Invoke-TaskJob 'import-recovery-replay-probe' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-worker','"C:\Users\Admin\OneDrive\Documents\StarCraft II\Accounts\416014729\2-S2-1-7408040\Replays\Multiplayer\Direct Strike (104).SC2Replay"')
    } else {
        Invoke-TaskJob 'summary-performance-probe' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--probe-summary')
    }
} finally {
    [pscustomobject]@{Stage=$Stage;CpuOnly=$CpuOnly.IsPresent;Samples=$samples;PeakRam=($samples|Measure-Object Ram -Maximum).Maximum;PeakCpu=($samples|Measure-Object Cpu -Maximum).Maximum;PeakGpu=($samples|Measure-Object Gpu -Maximum).Maximum} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "import-recovery-budget-$Stage.json")
}
