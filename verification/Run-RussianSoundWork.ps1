param([ValidateSet('PackageStartup','PackagedThemes','PackageRegression','UnitCoverage','PostgameControl','MapHandlesProbe','SummonProbe','ZagaraAttributionProbe','AttributionProbe','DamageProbe','UnitIcons','UnitIconMore','UnitIconCatalog','PostgameZagara','PostgameDamage','PostgameApp','PostgameBrowser','PostgameZagaraReplay','PostgameReplay','PostgameBuild','PostgameTests','Extract','Audio','Tests','Browser','Playback','SectionModels','SectionBrowser','SectionTests','AcceptTests','AcceptBrowser','UpdateTests','UpdateBrowser','AcceptFallbackBrowser','RatingEstimatesTests','RatingEstimatesBrowser','LobbyForecastBrowser','AutoUpdateBrowser','ProfilePolishTests','ProfilePolishBrowser','NicknameLinksTests','NicknameLinksBrowser','CompactUiBrowser','AllCategoryBrowser','ProfileReplayBrowser','GraphicalStylesBrowser','GraphicalStylesPreview','FactionConsolesBrowser','FactionConsolesPreview','ConsoleCompositionPreview','MenuConsolePreview','SidebarPreview','HudPreview','AutomationChecks','NativeConsolesBrowser','NativeConsolesNarrow','LocalSdk','LocalPreviewBuild','LocalReleaseTests','LocalPreviewTests','LocalNicknameTests','RasterHud','HudJoinsBrowser','NativeConsolesAssets','NativeDialogsBrowser','NativeFrameReview','NativeFrameSheet','NativeChangedReview','NativeChromeReview','FrameTrimAssets','FrameTrimReview','FrameTrimFenixConfirm','GameFrameAssets','ThemeDetailsAssets','SectionReview','NativeSkinAssets','SharedSkinReview','InteriorReviewGallery','EncounterReview','ToolMotionReview','ThemeVfxReview','ThemeVfxAssets','ThemeArtAssets','ThemeArtGallery','ThemeLoopPilot','ThemeLoopAssets','ThemeLoopReview','ThemeLoopCapture','ThemeContinuity','ThemeSceneReview','ThemeEquipmentAssets','ThemeEquipmentReview','ThemeEquipmentCapture','ThemeEquipmentBrowser','ThemeEquipmentImport','ThemeEquipmentFinalize','NativeMotion36Assets','NativeMotion36Review','NativeMotion36Previews','NativeMotion36Finalize','NativeScene37Assets','NativeScene37Review','NativeScene37Previews','ThemeWell37Assets','NativeScene37Final','ShellBacking38Assets','ShellBacking38Review','Material38Assets','Material38Review','Material38Previews','Hover39Browser','Focal39Pilot','Focal39Assets','Focal39Review','Focal39Previews','Focal39Capture','Focal39Lifecycle','Ui39Feedback','Rejected40Browser','Surfaces41Assets','Surfaces41Review','Surfaces41Capture','Surfaces41Previews','Surfaces41Lifecycle','Pylon42Extract','Pylon42Pilot','Pylon42Render','Pylon42Pack','Pylon42Browser','Pylon43Effects','Protoss44Review','Native45Extract','Native45Render','Stability46Tests','Native46Textures','Native46Extract','Stability46Review','Native46Render','Native46Pack','Native46Review','Protoss47Assets','Protoss47Review','Protoss47Detail','Campaign48Index','Campaign48Extract','Campaign48Textures','Campaign48Probe','Campaign48Pilot','Campaign48Render','Campaign48Pack','Campaign48Browser','Campaign48Inspect','Hyperion49Assets','Hyperion49Browser','Hyperion49Forced','Character54Textures','Character54Pilot','Character54Render','Character54Pack','Character54Browser','Character54Previews','Theme54Identity','Theme54Inspect','Theme54Index','Theme54Extract','Theme53Index','Theme53Extract','Theme53Inspect','Theme53Textures','Theme53Pilot','Rollback53Browser','Console52Assets','Console52Browser','Equipment51Inspect','Equipment51Export','Equipment51Pilot','Equipment51Render','Equipment51Pack','Equipment51Browser','Equipment51Confirm','Equipment51ZergPreview','Terran50Video','Terran50Sample','Terran50Export','Terran50Pilot','Terran50Render','Terran50Pack','Terran50Browser','Native45Sensor','Native45Reactor','Native45Placement','Native45Pack','Native45Browser','Native45SensorPilot','Native45ReactorPilot','Native45Sensor','Native45Reactor','Pylon45Event','Native45Placement','Native46Extract','Stability46Review','Native46Pilot','Native46Render','Native46Pack','Native46Review','Native46Textures','Stability46Tests')][string]$Stage,[ValidatePattern('^[a-z][a-z-]*-(1000-en|375-ru)$')][string]$FactionCase,[switch]$CpuOnly,[ValidateSet('hyperion-station','protoss-core-architecture','protoss-core-work','protoss-corelock','adun-core','leviathan-tentacle','leviathan-nest')][string]$CampaignDevice='hyperion-station',[ValidateSet('nerazim','alarak','ihanrii','nova','mira','machined','tyrador','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg')][string]$CharacterDevice='nerazim')
$ErrorActionPreference='Stop'
if($CpuOnly -and $Stage -notin @('FactionConsolesBrowser','FactionConsolesPreview','GraphicalStylesBrowser','ProfilePolishTests','CompactUiBrowser','ConsoleCompositionPreview','MenuConsolePreview','SidebarPreview')){throw 'CPU-only exception is restricted to this faction UI verification.'}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSamples=[Collections.Generic.List[object]]::new()
function Read-TaskBudget {
    $taskPdhCpu=(Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples[0].CookedValue
    $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    $taskOs=Get-CimInstance Win32_OperatingSystem
    $taskEngines=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
    if(!$taskCpu -or !$taskEngines.Count){throw 'Resource telemetry unavailable; sound work deferred.'}
    $taskGpu=($taskEngines|Group-Object {$_.Name -replace '^pid_\d+_',''}|ForEach-Object {($_.Group|Measure-Object UtilizationPercentage -Sum).Sum}|Measure-Object -Maximum).Maximum
    [pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Cpu=[double]$taskCpu.PercentProcessorTime;PdhCpu=[double]$taskPdhCpu;Gpu=[double]$taskGpu;Ram=100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize)}
}
function Stop-TaskTree([int]$taskId){
    $taskOwned=Get-Process -Id $taskId -ErrorAction SilentlyContinue
    if($taskOwned){try{if(!$taskOwned.HasExited){$taskOwned.Kill($true);$null=$taskOwned.WaitForExit(5000)}}finally{$taskOwned.Dispose()}}
}
$taskHost=(Get-Process -Id $PID).Path
$taskNode=(Get-Command node).Source
$taskJobs=switch($Stage){
    UnitIcons {@{name='unit-icons';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-UnitIcons.ps1')}}
    UnitIconMore {@{name='unit-icon-more';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-UnitIconCatalog.ps1','-UseCachedIndex')}}
    UnitIconCatalog {@{name='unit-icon-catalog';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-UnitIconCatalog.ps1')}}
    PackageStartup {@{name='package-startup';file=$taskHost;arguments=@('-NoProfile','-File','verification/Measure-PackageStartup.ps1')}}
    PackagedThemes {@{name='packaged-themes';file=$taskNode;arguments=@('verification/Test-PackagedThemes.cjs')}}
    PackageRegression {
        $package=(Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path
        @{name='package-impact';file=$package;arguments=@('--self-test','--impact-only')}
        @{name='package-updates';file=$package;arguments=@('--self-test','--updates-only')}
        @{name='package-dashboard';file=$package;arguments=@('--self-test','--dashboard-only')}
    }
    UnitCoverage {@{name='unit-coverage';file=$taskNode;arguments=@('verification/Audit-UnitCoverage.cjs')}}
    PostgameControl {@{name='postgame-control';file=$taskNode;arguments=@('verification/Test-PostgameApp.cjs','--control')}}
    PostgameZagara {@{name='postgame-zagara';file=$taskNode;arguments=@('verification/Test-PostgameApp.cjs','--zagara')}}
    PostgameDamage {@{name='postgame-damage';file=$taskNode;arguments=@('verification/Test-PostgameApp.cjs','--damage')}}
    PostgameApp {@{name='postgame-app';file=$taskNode;arguments=@('verification/Test-PostgameApp.cjs')}}
    PostgameBrowser {@{name='postgame-browser';file=$taskNode;arguments=@('verification/Test-ImpactBrowser.cjs','--source-only')}}
    PostgameBuild {@{name='postgame-build';file=$taskHost;arguments=@('-NoProfile','-File','verification/Build-LocalPreview.ps1','-Version','1.1.9-local.stats.9')}}
    SummonProbe {@{name='summon-probe';file=$taskHost;arguments=@('-NoProfile','-File','verification/Run-AttributionProbe.ps1','-Zagara','-Summons')}}
    MapHandlesProbe {@{name='map-handles-probe';file=$taskHost;arguments=@('-NoProfile','-File','verification/Run-AttributionProbe.ps1','-Zagara','-MapHandles')}}
    ZagaraAttributionProbe {@{name='zagara-attribution-probe';file=$taskHost;arguments=@('-NoProfile','-File','verification/Run-AttributionProbe.ps1','-Zagara')}}
    AttributionProbe {@{name='attribution-probe';file=$taskHost;arguments=@('-NoProfile','-File','verification/Run-AttributionProbe.ps1')}}
    PostgameZagaraReplay {$taskReplay=(Get-Content (Join-Path $PSScriptRoot 'impact-zagara-replay.json') -Raw|ConvertFrom-Json).match.path;@{name='postgame-zagara-replay';file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--probe-impact',('"'+$taskReplay+'"'))}}
    PostgameReplay {$taskReplay=(Get-Content (Join-Path $PSScriptRoot 'impact-real-replay.json') -Raw|ConvertFrom-Json).match.path;@{name='postgame-replay';file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--probe-impact',('"'+$taskReplay+'"'))}}
    DamageProbe {$taskReplay=(Get-Content (Join-Path $PSScriptRoot 'impact-real-replay.json') -Raw|ConvertFrom-Json).match.path;@{name='damage-probe';file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--probe-replay',('"'+$taskReplay+'"'))}}
    PostgameTests {@{name='postgame-tests';file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--self-test','--impact-only')}}
    Pylon45Event {@{name='pylon45-event';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Pylon42.py','--','--pilot','--event')}}
    Native45SensorPilot {@{name='native45-sensor-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran45.py','--','--device','sensor','--pilot')}}
    Native45Sensor {@{name='native45-sensor';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran45.py','--','--device','sensor')}}
    Native45ReactorPilot {@{name='native45-reactor-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran45.py','--','--device','reactor','--pilot')}}
    Native45Reactor {@{name='native45-reactor';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran45.py','--','--device','reactor')}}
    Stability46Tests {@{name='stability46-tests';file=$taskNode;arguments=@('verification/Test-Stability46.cjs')}}
    Stability46Review {@{name='stability46-review';file=$taskNode;arguments=@('verification/Inspect-Stability46.cjs')}}
    Protoss47Assets {@{name='protoss47-assets';file=$taskNode;arguments=@('verification/Build-Protoss47.cjs')}}
    Campaign48Pilot {@{name=('campaign48-pilot-'+$CampaignDevice);file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Campaign48.py','--','--device',$CampaignDevice,'--pilot','--angle','both')}}
    Campaign48Render {$taskFrames=switch($CampaignDevice){'hyperion-station'{450};'adun-core'{160};'leviathan-nest'{276};default{128}};@{name=('campaign48-render-'+$CampaignDevice);file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Campaign48Frozen.py','--','--device',$CampaignDevice,'--frames',$taskFrames,'--supersample','2')}}
    Theme53Inspect {@{name='theme53-inspect';file='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';arguments=@('verification/Inspect-Theme53.py')}}
    Theme54Inspect {@{name='theme54-inspect';file='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';arguments=@('verification/Inspect-Theme54.py')}}
    Character54Textures {@{name='character54-textures';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Character54Textures.ps1')}}
    Character54Pilot {@{name=('character54-pilot-'+$CharacterDevice);file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Character54.py','--','--device',$CharacterDevice,'--pilot','--angle','both','--frames','48')}}
    Character54Render {$taskNative=Get-Content (Join-Path $taskRoot ('assets/themes/native54/'+$CharacterDevice+'-data.json')) -Raw|ConvertFrom-Json;$taskFrames=[Math]::Min(400,[Math]::Max(64,[Math]::Ceiling(($taskNative.sequence.end-$taskNative.sequence.start)*.016)));@{name=('character54-render-'+$CharacterDevice);file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Character54.py','--','--device',$CharacterDevice,'--frames',([string]$taskFrames),'--angle','a')}}
    Character54Pack {@{name='character54-pack';file=$taskNode;arguments=@('verification/Pack-Character54.cjs')}}
    Character54Browser {@{name='character54-browser';file=$taskNode;arguments=@('verification/Test-Character54.cjs')}}
    Character54Previews {@{name='character54-previews';file=$taskNode;arguments=@('verification/Refresh-Character54Previews.cjs')}}
    Theme54Identity {@{name='theme54-identity';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme54.ps1','-Mode','Identity')}}
    Theme54Index {@{name='theme54-index';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme54.ps1','-Mode','Index')}}
    Theme54Extract {@{name='theme54-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme54.ps1','-Mode','Extract')}}
    Theme53Index {@{name='theme53-index';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme53.ps1','-Mode','Index')}}
    Theme53Extract {@{name='theme53-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme53.ps1','-Mode','Extract')}}
    Theme53Textures {@{name='theme53-textures';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Theme53Textures.ps1')}}
    Theme53Pilot {@{name='theme53-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-NativeConsole53.py','--','--device','abathur-console','--pilot','--angle','both')}}
    Rollback53Browser {@{name='rollback53-browser';file=$taskNode;arguments=@('verification/Test-Rollback53.cjs')}}
    Console52Assets {@{name='console52-assets';file=$taskNode;arguments=@('verification/Build-Console52.cjs')}}
    Console52Browser {@{name='console52-browser';file=$taskNode;arguments=@('verification/Test-Console52.cjs')}}
    Equipment51Pack {@{name='equipment51-pack';file=$taskNode;arguments=@('verification/Build-Equipment51.cjs')}}
    Equipment51ZergPreview {@{name='equipment51-zerg-preview';file=$taskNode;arguments=@('verification/Confirm-Equipment51.cjs','--zerg-preview')}}
    Equipment51Confirm {@{name='equipment51-confirm';file=$taskNode;arguments=@('verification/Confirm-Equipment51.cjs')}}
    Equipment51Browser {@{name='equipment51-browser';file=$taskNode;arguments=@('verification/Test-Equipment51.cjs')}}
    Equipment51Inspect {@{name='equipment51-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Equipment51.ps1')};@{name='equipment51-inspect';file='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';arguments=@('verification/Export-Campaign48.py','--inspect-model','SM_HyperionBridgeStage1_00')}}
    Terran50Video {@{name='terran50-video';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Terran50Video.ps1')}}
    Terran50Sample {@{name='terran50-sample';file=$taskNode;arguments=@('verification/Sample-Terran50.cjs')}}
    Terran50Export {@{name='terran50-export';file='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';arguments=@('verification/Export-Terran50.py','--device','hyperion-armory')}}
    Terran50Pilot {@{name='terran50-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran50.py','--','--device','hyperion-armory','--pilot','--angle','both')}}
    Terran50Render {@{name='terran50-render';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Terran50.py','--','--device','hyperion-armory','--frames','293','--supersample','2')}}
    Terran50Pack {@{name='terran50-pack';file=$taskNode;arguments=@('verification/Pack-Terran50.cjs')}}
    Terran50Browser {@{name='terran50-browser';file=$taskNode;arguments=@('verification/Test-Terran50.cjs')}}
    Hyperion49Assets {@{name='hyperion49-assets';file=$taskNode;arguments=@('verification/Build-Hyperion49.cjs')}}
    Hyperion49Browser {@{name='hyperion49-browser';file=$taskNode;arguments=@('verification/Test-Hyperion49.cjs')}}
    Hyperion49Forced {@{name='hyperion49-forced';file=$taskNode;arguments=@('verification/Test-Hyperion49.cjs','--forced-only')}}
    Campaign48Inspect {@{name='campaign48-inspect';file=$taskNode;arguments=@('verification/Inspect-Campaign48.cjs')}}
    Campaign48Browser {@{name='campaign48-browser';file=$taskNode;arguments=@('verification/Test-Campaign48.cjs')}}
    Campaign48Pack {@{name='campaign48-pack';file=$taskNode;arguments=@('verification/Pack-Campaign48.cjs')}}
    Campaign48Probe {@{name='campaign48-probe';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Campaign48.ps1','-Mode','Probe')}}
    Campaign48Textures {@{name='campaign48-textures';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Campaign48Textures.ps1')}}
    Campaign48Index {@{name='campaign48-index';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Campaign48.ps1','-Mode','Index')}}
    Campaign48Extract {@{name='campaign48-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Campaign48.ps1','-Mode','Extract')}}
    Protoss47Detail {@{name='protoss47-detail';file=$taskNode;arguments=@('verification/Inspect-Protoss47Visibility.cjs')}}
    Protoss47Review {@{name='protoss47-review';file=$taskNode;arguments=@('verification/Test-Protoss47.cjs')}}
    Native46Review {@{name='native46-review';file=$taskNode;arguments=@('verification/Test-Native46.cjs')}}
    Native46Pack {@{name='native46-pack';file=$taskNode;arguments=@('verification/Pack-Zerg46.cjs')}}
    Native46Pilot {@{name='native46-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Zerg46.py','--','--device','egg','--pilot')}}
    Native46Render {@{name='native46-render';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Zerg46.py','--','--device','egg')}}
    Native46Textures {@{name='native46-textures';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Native46Textures.ps1')}}
    Native46Extract {@{name='native46-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Native46.ps1')}}
    Native45Placement {@{name='native45-placement';file=$taskNode;arguments=@('verification/Test-NativeTech45Placement.cjs')}}
    Native45Browser {@{name='native45-browser';file=$taskNode;arguments=@('verification/Test-NativeTech45.cjs')}}
    Native45Pack {@{name='native45-pack';file=$taskNode;arguments=@('verification/Pack-Terran45.cjs')}}
    Native45Extract {@{name='native45-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-NativeTech45.ps1')}}
    Protoss44Review {@{name='protoss44-review';file=$taskNode;arguments=@('verification/Test-Protoss44.cjs')}}
    Pylon43Effects {@{name='pylon43-effects';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-PylonEffects43.ps1')}}
    Pylon42Extract {@{name='pylon42-extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-Pylon42.ps1')}}
    Pylon42Pilot {@{name='pylon42-pilot';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Pylon42.py','--','--pilot')}}
    Pylon42Render {@{name='pylon42-render';file='C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe';arguments=@('--background','--factory-startup','--threads','1','--python-exit-code','1','--python','verification/Render-Pylon42.py')}}
    Pylon42Pack {@{name='pylon42-pack';file=$taskNode;arguments=@('verification/Pack-Pylon42.cjs')}}
    Pylon42Browser {@{name='pylon42-browser';file=$taskNode;arguments=@('verification/Test-Pylon42.cjs')}}
    Surfaces41Lifecycle {@{name='surfaces41-lifecycle';file=$taskNode;arguments=@('verification/Test-SurfaceLifecycle41.cjs')}}
    Surfaces41Assets {@{name='surfaces41-assets';file=$taskNode;arguments=@('verification/Build-ThemeSurfaces41.cjs')}}
    Surfaces41Review {@{name='surfaces41-review';file=$taskNode;arguments=@('verification/Test-ThemeSurfaces41.cjs')}}
    Surfaces41Capture {@{name='surfaces41-capture';file=$taskNode;arguments=@('verification/Capture-ThemeSurfaces41.cjs')}}
    Surfaces41Previews {@{name='surfaces41-previews';file=$taskNode;arguments=@('verification/Refresh-SurfacePreviews41.cjs')}}
    Rejected40Browser {@{name='rejected40-browser';file=$taskNode;arguments=@('verification/Test-RemoveRejected40.cjs')}}
    Ui39Feedback {@{name='ui39-feedback';file=$taskNode;arguments=@('verification/Test-UiMotion.cjs','--data-only')}}
    Focal39Lifecycle {
      @{name='focal39-lifecycle';file=$taskNode;arguments=@('verification/Test-FocalLifecycle39.cjs')}
      @{name='ui39-feedback';file=$taskNode;arguments=@('verification/Test-UiMotion.cjs','--data-only')}
    }
    Focal39Capture {@{name='focal39-capture';file=$taskNode;arguments=@('verification/Capture-FocalScenes39.cjs')}}
    Focal39Pilot {@{name='focal39-pilot';file=$taskNode;arguments=@('verification/Build-FocalScenes39.cjs','--ids=nova,mecha,zerg,protoss')}}
    Focal39Assets {@{name='focal39-assets';file=$taskNode;arguments=@('verification/Build-FocalScenes39.cjs')}}
    Focal39Review {@{name='focal39-review';file=$taskNode;arguments=@('verification/Test-FocalScenes39.cjs')}}
    Focal39Previews {@{name='focal39-previews';file=$taskNode;arguments=@('verification/Refresh-FocalPreviews39.cjs')}}
    Hover39Browser {@{name='hover39-browser';file=$taskNode;arguments=@('verification/Test-HoverStability39.cjs')}}
    Material38Previews {@{name='material38-previews';file=$taskNode;arguments=@('verification/Refresh-MaterialPreviews38.cjs')}}
    Material38Review {@{name='material38-review';file=$taskNode;arguments=@('verification/Test-MaterialMotion38.cjs')}}
    Material38Assets {@{name='material38-assets';file=$taskNode;arguments=@('verification/Build-MaterialMotion38.cjs')}}
    ShellBacking38Review {@{name='shell-backing38-review';file=$taskNode;arguments=@('verification/Test-ShellBacking38.cjs')}}
    ShellBacking38Assets {@{name='shell-backing38-assets';file=$taskNode;arguments=@('verification/Build-ShellBacking38.cjs')}}
    NativeScene37Final {@{name='native-scene37-final';file=$taskNode;arguments=@('verification/Finalize-NativeScene37.cjs')}}
    ThemeWell37Assets {@{name='theme-well37-assets';file=$taskNode;arguments=@('verification/Build-ThemeWell37.cjs')}}
    NativeScene37Assets {@{name='native-scene37-assets';file=$taskNode;arguments=@('verification/Build-NativeScene37.cjs')}}
    NativeScene37Review {@{name='native-scene37-review';file=$taskNode;arguments=@('verification/Test-NativeScene37.cjs')}}
    NativeScene37Previews {@{name='native-scene37-previews';file=$taskNode;arguments=@('verification/Refresh-NativePreviews37.cjs')}}
    NativeMotion36Finalize {@{name='native-motion36-finalize';file=$taskNode;arguments=@('verification/Complete-NativeMotion36.cjs')}}
    NativeMotion36Previews {@{name='native-motion36-previews';file=$taskNode;arguments=@('verification/Refresh-NativePreviews36.cjs')}}
    NativeMotion36Assets {@{name='native-motion36-assets';file=$taskNode;arguments=@('verification/Build-NativeFrameLight36.cjs')}}
    NativeMotion36Review {@{name='native-motion36-review';file=$taskNode;arguments=@('verification/Test-NativeMotion36.cjs')}}
    ThemeEquipmentImport {
      foreach($taskEquipmentId in @('default','fenix','protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg')){@{name=('equipment-import-'+$taskEquipmentId);file=$taskNode;arguments=@('verification/Import-EquipmentRaster35.cjs',('--ids='+$taskEquipmentId))}}
      @{name='equipment-import-catalog';file=$taskNode;arguments=@('verification/Import-EquipmentRaster35.cjs','--finalize')}
    }
    ThemeEquipmentAssets {
      foreach($taskEquipmentId in @('default','fenix','protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg')){@{name=('equipment-'+$taskEquipmentId);file=$taskNode;arguments=@('verification/Build-ThemeEquipment.cjs',('--ids='+$taskEquipmentId))}}
      @{name='equipment-catalog';file=$taskNode;arguments=@('verification/Build-ThemeEquipment.cjs','--finalize')}
    }
    ThemeEquipmentBrowser {@{name='equipment-browser';file=$taskNode;arguments=@('verification/Test-ThemeEquipment.cjs')}}
    ThemeEquipmentReview {
      @{name='equipment-assets';file=$taskNode;arguments=@('verification/Test-ThemeEquipmentAssets.cjs')}
      @{name='equipment-browser';file=$taskNode;arguments=@('verification/Test-ThemeEquipment.cjs')}
    }
    ThemeEquipmentFinalize {@{name='equipment-finalize';file=$taskNode;arguments=@('verification/Complete-ThemeEquipmentCapture.cjs')}}
    ThemeEquipmentCapture {@{name='equipment-capture';file=$taskNode;arguments=@('verification/Capture-ThemeEquipment.cjs')}}
    ThemeLoopPilot {
      foreach($taskLoopId in @('fenix','nova','zerg','abathur','cerberus','arcade')){@{name=('theme-loop-'+$taskLoopId);file=$taskNode;arguments=@('verification/Build-ThemeLoops.cjs',('--ids='+$taskLoopId))}}
    }
    ThemeLoopAssets {
      foreach($taskLoopId in @('default','fenix','protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg')){@{name=('theme-loop-'+$taskLoopId);file=$taskNode;arguments=@('verification/Build-ThemeLoops.cjs',('--ids='+$taskLoopId))}}
      @{name='theme-loop-catalog';file=$taskNode;arguments=@('verification/Build-ThemeLoops.cjs','--finalize')}
    }
    ThemeContinuity {@{name='theme-continuity';file=$taskNode;arguments=@('verification/Test-ThemeContinuity.cjs')}}
    ThemeSceneReview {@{name='theme-scene-identity';file=$taskNode;arguments=@('verification/Test-ThemeSceneIdentity.cjs')}}
    ThemeLoopReview {@{name='theme-loop-review';file=$taskNode;arguments=@('verification/Test-ThemeLoops.cjs')}}
    ThemeLoopCapture {@{name='theme-loop-capture';file=$taskNode;arguments=@('verification/Capture-ThemeLoops.cjs')}}
    ThemeVfxAssets {@{name='theme-vfx-assets';file=$taskNode;arguments=@('verification/Build-ThemeVfx.cjs')}}
    ThemeArtAssets {
      @{name='theme-art-assets';file=$taskNode;arguments=@('verification/Build-ThemeArt32.cjs')}
      @{name='theme-art-checks';file=$taskNode;arguments=@('verification/Test-ThemeIdentityAssets.cjs')}
    }
    ThemeArtGallery {@{name='theme-art-gallery';file=$taskNode;arguments=@('verification/Build-ThemeArtGallery32.cjs')}}
    ThemeVfxReview {@{name='theme-vfx-browser';file=$taskNode;arguments=@('verification/Test-ThemeVfx.cjs')}}
    ToolMotionReview {
      @{name='ui-motion-browser';file=$taskNode;arguments=@('verification/Test-UiMotion.cjs')}
      @{name='tool-motion-browser';file=$taskNode;arguments=@('verification/Test-ToolMotion.cjs')}
    }
    EncounterReview {
      @{name='encounter-site-model';file=$taskNode;arguments=@('verification/Test-EncounterSites.cjs')}
      @{name='encounter-replay-model';file=$taskNode;arguments=@('verification/Test-PlayerData.cjs')}
      @{name='encounter-directory-model';file=$taskNode;arguments=@('verification/Test-PlayerDirectory.cjs')}
      @{name='encounter-browser';file=$taskNode;arguments=@('verification/Test-EncounterBrowser.cjs')}
      @{name='ui-motion-browser';file=$taskNode;arguments=@('verification/Test-UiMotion.cjs')}
    }
    InteriorReviewGallery {@{name='interior-review-gallery';file=$taskNode;arguments=@('verification/Build-InteriorReviewGallery.cjs')}}
    NativeSkinAssets {@{name='native-skin-assets';file=$taskNode;arguments=@('verification/Build-NativeSkinFrames.cjs')}}
    SharedSkinReview {@{name='shared-skin-review';file=$taskNode;arguments=@('verification/Test-SharedSkinLayout.cjs')}}
    NativeConsolesAssets {@{name='native-consoles-assets';file=$taskNode;arguments=@('verification/Build-NativeConsoles.cjs')}}
    NativeDialogsBrowser {@{name='native-dialogs-browser';file=$taskNode;arguments=@('verification/Test-NativeDialogs.cjs')}}
    NativeFrameReview {@{name='native-frame-review';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only','--frame-review')}}
    FrameTrimAssets {
      @{name='frame-trim-fenix';file=$taskNode;arguments=@('verification/Build-PurifierDetails.cjs')}
      @{name='frame-trim-native';file=$taskNode;arguments=@('verification/Build-NativeConsoles.cjs')}
    }
    FrameTrimFenixConfirm {
      @{name='frame-trim-fenix';file=$taskNode;arguments=@('verification/Build-PurifierDetails.cjs')}
      @{name='frame-trim-fenix-confirm';file=$taskNode;arguments=@('verification/Test-FrameTrim.cjs','--only=fenix')}
    }
    GameFrameAssets {@{name='game-frame-assets';file=$taskNode;arguments=@('verification/Build-GameFrames.cjs')}}
    ThemeDetailsAssets {
      @{name='theme-detail-assets';file=$taskNode;arguments=@('verification/Build-ThemeDetails.cjs')}
    }
    SectionReview {@{name='section-review';file=$taskNode;arguments=@('verification/Test-FrameTrim.cjs','--section-review')}}
    FrameTrimReview {@{name='frame-trim-review';file=$taskNode;arguments=@('verification/Test-FrameTrim.cjs')}}
    NativeChromeReview {
      @{name='native-chrome-assets';file=$taskNode;arguments=@('verification/Test-NativeFrameAssets.cjs')}
      @{name='native-chrome-desktop';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only','--frame-review')}
      @{name='native-chrome-narrow';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only','--frame-review','--narrow')}
    }
    NativeFrameSheet {@{name='native-frame-sheet';file=$taskNode;arguments=@('verification/Build-NativeFrameReview.cjs')}}
    NativeChangedReview {
      foreach($taskSkin in @('terran','nova','classic-zerg')){@{name=('native-changed-'+$taskSkin);file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only','--frame-review',('--only='+$taskSkin))}}
      @{name='native-changed-classic-zerg-narrow';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only','--frame-review','--only=classic-zerg','--narrow')}
    }
    HudJoinsBrowser {@{name='hud-joins-browser';file=$taskNode;arguments=@('verification/Test-HudJoins.cjs')}}
    NativeConsolesNarrow {@{name='native-consoles-narrow';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--narrow','--assertions-only')}}
    NativeConsolesBrowser {@{name='native-consoles-browser';file=$taskNode;arguments=@('verification/Test-NativeConsoles.cjs','--assertions-only')}}
    LocalSdk {@{name='local-sdk';file=$taskHost;arguments=@('-NoProfile','-File','verification/Prepare-LocalSdk.ps1')}}
    LocalPreviewBuild {@{name='local-preview-build';file=$taskHost;arguments=@('-NoProfile','-File','verification/Build-LocalPreview.ps1')}}
    LocalReleaseTests { foreach($suite in @('updates-only','accept-alerts-only','nicknames-only','dashboard-only')){@{name=('local-release-'+$suite);file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--self-test',('--'+$suite))}} }
    LocalPreviewTests {@{name='local-preview-tests';file=((Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path);arguments=@('--self-test','--dashboard-only')}}
    LocalNicknameTests {
        $taskPreviewExe=(Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json).Path
        @{name='local-nickname-tests';file=$taskPreviewExe;arguments=@('--self-test','--nicknames-only')}
        @{name='local-reader-tests';file=$taskPreviewExe;arguments=@('--self-test','--reader-package-only')}
    }
    RasterHud {@{name='raster-hud';file=$taskNode;arguments=@('verification/Rasterize-HudAssets.cjs')}}
    AutomationChecks {@{name='automation-checks';file=$taskHost;arguments=@('-NoProfile','-File','verification/Run-Sc2AutomationChecks.ps1')}}
    FactionConsolesBrowser {$taskCaseArguments=@('verification/Test-AllCategoryLayout.cjs','--themes');if($FactionCase){$taskCaseArguments+=('--case='+$FactionCase)};@{name='faction-consoles-browser';file=$taskNode;arguments=$taskCaseArguments}}
    Extract {@{name='extract';file=$taskHost;arguments=@('-NoProfile','-File','verification/Extract-RussianSc2Audio.ps1')}}
    Audio {@{name='normalize';file=$taskHost;arguments=@('-NoProfile','-File','verification/Build-RussianSoundLibrary.ps1')}}
    Tests {@{name='source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--sounds-only')};@{name='model-tests';file=$taskNode;arguments=@('verification/Test-LobbySounds.cjs')}}
    Browser {@{name='browser';file=$taskNode;arguments=@('verification/Test-RussianSoundBrowser.cjs')}}
    Playback {@{name='native-playback';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--probe-notification-audio','sc2-ru-research','40')}}
    SectionModels {@{name='section-controller-tests';file=$taskNode;arguments=@('verification/Test-LobbySounds.cjs')};@{name='section-model-tests';file=$taskNode;arguments=@('verification/Test-SoundsPage.cjs')}}
    SectionBrowser {@{name='section-browser';file=$taskNode;arguments=@('verification/Test-SoundsSectionBrowser.cjs')}}
    SectionTests {@{name='section-source-tests';file=(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe');arguments=@('--self-test','--sounds-only')}}
    LobbyForecastBrowser {@{name='lobby-forecast-browser';file=$taskNode;arguments=@('verification/Test-LobbyForecastBrowser.cjs')}}
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
            # The full frame matrix now covers192 category states plus dialogs.
            # Keep the per-job resource guard and one-core affinity unchanged.
            $taskMinutes=if($Stage -in @('Character54Textures','Character54Render','Character54Pack','Character54Browser','Character54Previews','FrameTrimReview','SectionReview','SharedSkinReview','ThemeLoopCapture','ThemeEquipmentReview','ThemeEquipmentCapture','ThemeEquipmentBrowser','ThemeLoopReview','ThemeEquipmentFinalize','NativeMotion36Review','NativeScene37Review','Material38Assets','Material38Review','Focal39Assets','Focal39Review','Focal39Capture','Surfaces41Review','Surfaces41Capture','Native45Extract','Native45Render','Native45Pack','Native45Browser','Protoss44Review','Pylon43Effects','Pylon42Extract','Pylon42Render','Pylon42Browser','Campaign48Render','Campaign48Pack','Campaign48Browser','Campaign48Inspect','Hyperion49Assets','Hyperion49Browser','Hyperion49Forced','Terran50Render','Terran50Browser','Equipment51Pack','Equipment51Browser','Equipment51Confirm')){8}else{3}
            $taskDeadline=[DateTime]::UtcNow.AddMinutes($taskMinutes)
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






