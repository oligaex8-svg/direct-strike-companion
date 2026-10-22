param([ValidateSet('Extract','Audio','Tests','Browser','Playback','SectionModels','SectionBrowser','SectionTests','AcceptTests','AcceptBrowser','UpdateTests','UpdateBrowser','AcceptFallbackBrowser','RatingEstimatesTests','RatingEstimatesBrowser','AutoUpdateBrowser','ProfilePolishTests','ProfilePolishBrowser','NicknameLinksTests','NicknameLinksBrowser','CompactUiBrowser','AllCategoryBrowser','ProfileReplayBrowser','GraphicalStylesBrowser','GraphicalStylesPreview','FactionConsolesBrowser','FactionConsolesPreview','ConsoleCompositionPreview','MenuConsolePreview','SidebarPreview','HudPreview')][string]$Stage,[ValidatePattern('^(default|protoss|zerg|terran|fenix|classic-terran|classic-protoss|classic-zerg)-(1000-en|375-ru)$')][string]$FactionCase,[switch]$CpuOnly)
$ErrorActionPreference='Stop'
if($CpuOnly -and $Stage -notin @('FactionConsolesBrowser','FactionConsolesPreview','GraphicalStylesBrowser','ProfilePolishTests','CompactUiBrowser','ConsoleCompositionPreview','MenuConsolePreview','SidebarPreview')){throw 'CPU-only exception is restricted to this faction UI verification.'}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSamples=[Collections.Generic.List[object]]::new()
function Read-TaskBudget {
    $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    $taskOs=Get-CimInstance Win32_OperatingSystem
    $taskEngines=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
    if(!$taskCpu -or !$taskEngines.Count){throw 'Resource telemetry unavailable; sound work deferred.'}
    $taskGpu=($taskEngines|Group-Object {$_.Name -replace '^pid_\d+_',''}|ForEach-Object {($_.Group|Measure-Object UtilizationPercentage -Sum).Sum}|Measure-Object -Maximum).Maximum
    [pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Cpu=[double]$taskCpu.PercentProcessorTime;Gpu=[double]$taskGpu;Ram=100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize)}
}
function Stop-TaskTree([int]$taskId){
    $taskOwned=Get-Process -Id $taskId -ErrorAction SilentlyContinue
    if($taskOwned){try{if(!$taskOwned.HasExited){$taskOwned.Kill($true);$null=$taskOwned.WaitForExit(5000)}}finally{$taskOwned.Dispose()}}
}
$taskHost=(Get-Process -Id $PID).Path
$taskNode=(Get-Command node).Source
$taskJobs=switch($Stage){
    FactionConsolesBrowser {$taskCaseArguments=@('verification/Test-AllCategoryLayout.cjs','--themes');if($FactionCase){$taskCaseArguments+=('--case='+$FactionCase)};@{name='faction-consoles-browser';file=$taskNode;arguments=$taskCaseArguments}}
    Extract {@{name='extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-RussianSc2Audio.ps1')}}
    Audio {@{name='normalize';file=$taskHost;arguments=@('-NoProfile','-File','verification/Build-RussianSoundLibrary.ps1')}}
    Tests {@{name='source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--sounds-only')};@{name='model-tests';file=$taskNode;arguments=@('verification/Test-LobbySounds.cjs')}}
    Browser {@{name='browser';file=$taskNode;arguments=@('verification/Test-RussianSoundBrowser.cjs')}}
    Playback {@{name='native-playback';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--probe-notification-audio','sc2-ru-research','40')}}
    SectionModels {@{name='section-controller-tests';file=$taskNode;arguments=@('verification/Test-LobbySounds.cjs')};@{name='section-model-tests';file=$taskNode;arguments=@('verification/Test-SoundsPage.cjs')}}
    SectionBrowser {@{name='section-browser';file=$taskNode;arguments=@('verification/Test-SoundsSectionBrowser.cjs')}}
    SectionTests {@{name='section-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--sounds-only')}}
    RatingEstimatesBrowser {@{name='rating-estimate-browser';file=$taskNode;arguments=@('verification/Test-RatingEstimatesBrowser.cjs')}}
    RatingEstimatesTests {@{name='rating-estimate-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--rating-estimates-only')};@{name='dsr-projection-model';file=$taskNode;arguments=@('verification/Test-DsrProjections.cjs')};@{name='lobby-forecast-model';file=$taskNode;arguments=@('verification/Test-LobbyForecast.cjs')};@{name='dsstats-change-model';file=$taskNode;arguments=@('verification/Test-DsstatsChanges.cjs')}}
    AcceptTests {@{name='accept-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--accept-alerts-only')};@{name='accept-model-tests';file=$taskNode;arguments=@('verification/Test-Sc2AutomationUi.cjs')}}
    AcceptBrowser {@{name='accept-browser';file=$taskNode;arguments=@('verification/Test-AcceptAlertBrowser.cjs')}}
    ProfilePolishTests {@{name='profile-polish-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--dashboard-only')};@{name='profile-polish-model-tests';file=$taskNode;arguments=@('verification/Test-ProfileView.cjs')}}
    ProfilePolishBrowser {@{name='profile-polish-browser';file=$taskNode;arguments=@('verification/Test-ProfilePolishBrowser.cjs')}}
    CompactUiBrowser {@{name='compact-ui-browser';file=$taskNode;arguments=@('verification/Test-CompactUiBrowser.cjs')}}
    AllCategoryBrowser {@{name='all-category-browser';file=$taskNode;arguments=@('verification/Test-AllCategoryLayout.cjs','--assertions-only')}}
    ProfileReplayBrowser {@{name='profile-replay-browser';file=$taskNode;arguments=@('verification/Test-AllCategoryLayout.cjs','--profile-replay')}}
    GraphicalStylesBrowser {@{name='graphical-styles-browser';file=$taskNode;arguments=@('verification/Test-AllCategoryLayout.cjs','--themes','--assertions-only')}}
    ConsoleCompositionPreview {@{name='console-composition-preview';file=$taskNode;arguments=@('verification/Build-GraphicalStylePreview.cjs','--composition')}}
    MenuConsolePreview {@{name='menu-console-preview';file=$taskNode;arguments=@('verification/Build-GraphicalStylePreview.cjs','--menu')}}
    HudPreview {@{name='native-hud-preview';file=$taskNode;arguments=@('verification/Build-GraphicalStylePreview.cjs','--hud')}}
    SidebarPreview {@{name='sidebar-preview';file=$taskNode;arguments=@('verification/Build-SidebarPreview.cjs')}}
    FactionConsolesPreview {@{name='faction-consoles-preview';file=$taskNode;arguments=@('verification/Build-GraphicalStylePreview.cjs','--faction-consoles')}}
    GraphicalStylesPreview {@{name='graphical-styles-preview';file=$taskNode;arguments=@('verification/Build-GraphicalStylePreview.cjs')}}
    NicknameLinksTests {@{name='nickname-links-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--nicknames-only')};@{name='nickname-links-profile-regressions';file=$taskNode;arguments=@('verification/Test-ProfileView.cjs')}}
    NicknameLinksBrowser {@{name='nickname-links-browser';file=$taskNode;arguments=@('verification/Test-NicknameLinksBrowser.cjs')}}
    UpdateTests {@{name='update-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--updates-only')}}
    AcceptFallbackBrowser {@{name='accept-fallback-browser';file=$taskNode;arguments=@('verification/Test-AcceptFallbackBrowser.cjs')}}
    AutoUpdateBrowser {@{name='auto-update-browser';file=$taskNode;arguments=@('verification/Test-AutoSoftwareUpdatesBrowser.cjs')}}
    UpdateBrowser {@{name='update-browser';file=$taskNode;arguments=@('verification/Test-SoftwareUpdatesBrowser.cjs')}}
}
try {
    foreach($taskJob in $taskJobs){
        $taskSample=Read-TaskBudget;$taskSamples.Add($taskSample)
        if($taskSample.Cpu -ge 94 -or (!$CpuOnly -and $taskSample.Gpu -ge 94) -or $taskSample.Ram -ge 98){throw 'Resource limit reached; sound work deferred.'}
        $taskProcess=Start-Process -FilePath $taskJob.file -ArgumentList $taskJob.arguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot ('russian-sound-'+$taskJob.name+'-output.txt')) -RedirectStandardError (Join-Path $PSScriptRoot ('russian-sound-'+$taskJob.name+'-error.txt'))
        try {
            $null=$taskProcess.Handle;$taskProcess.PriorityClass='BelowNormal';$taskProcess.ProcessorAffinity=[IntPtr]1
            $taskDeadline=[DateTime]::UtcNow.AddMinutes(3)
            while(!$taskProcess.HasExited){
                Start-Sleep -Milliseconds 650
                $taskSample=Read-TaskBudget;$taskSamples.Add($taskSample)
                if($taskSample.Cpu -ge 94 -or (!$CpuOnly -and $taskSample.Gpu -ge 94) -or $taskSample.Ram -ge 98 -or [DateTime]::UtcNow -ge $taskDeadline){Stop-TaskTree $taskProcess.Id;throw 'Stopped task-owned sound work at resource limit/deadline.'}
            }
            $taskProcess.WaitForExit()
            if($taskProcess.ExitCode -ne 0){Get-Content (Join-Path $PSScriptRoot ('russian-sound-'+$taskJob.name+'-error.txt')) -Tail 10;throw ('Sound work failed: '+$taskJob.name)}
            [pscustomobject]@{Job=$taskJob.name;Exit=$taskProcess.ExitCode}
        }finally{try{if(!$taskProcess.HasExited){Stop-TaskTree $taskProcess.Id}}finally{$taskProcess.Dispose()}}
    }
}finally{[pscustomobject]@{Stage=$Stage;FactionCase=$FactionCase;CpuOnly=$CpuOnly.IsPresent;Samples=$taskSamples}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $PSScriptRoot ('russian-sound-budget-'+$Stage+'.json'))}
