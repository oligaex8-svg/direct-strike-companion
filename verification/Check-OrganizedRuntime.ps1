$ErrorActionPreference = 'Stop'
$taskSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $taskSource 'InstallationPaths.ps1')
$taskPaths = Get-InstallationPaths $taskSource
$taskRoot = $taskPaths.InstallRoot
$taskExe = Join-Path $taskRoot 'Direct Strike Companion.exe'
$taskLibrary = Join-Path $taskRoot 'data/library.json'
$taskUrlFile = Join-Path $taskRoot 'data/running-url.txt'
$taskHeaders = @{'X-DS-Companion'='1'}
function Get-TaskJsonHash($Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 100 -Compress))
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
}
function Assert-TaskBudget {
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    if (100*(1-$os.FreePhysicalMemory/$os.TotalVisibleMemorySize) -ge 94 -or $cpu.PercentProcessorTime -ge 90) {
        throw 'Runtime check deferred by current CPU/RAM budget.'
    }
}
Assert-TaskBudget
if (@(Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq $taskExe).Count) {
    throw 'App already running; leave it open and defer cold-start check.'
}
$taskBefore = Get-Content -LiteralPath $taskLibrary -Raw | ConvertFrom-Json -Depth 100
$taskMatchesHash = Get-TaskJsonHash $taskBefore.matches
$taskMarksHash = Get-TaskJsonHash $taskBefore.marks
$taskSettingKeys = @($taskBefore.settings.PSObject.Properties.Name | Sort-Object)
$taskSettings = [ordered]@{}
foreach ($key in $taskSettingKeys) { $taskSettings[$key] = $taskBefore.settings.$key }
$taskSettingsHash = Get-TaskJsonHash $taskSettings
$taskMain = Start-Process -FilePath $taskExe -ArgumentList '--no-browser','--no-import' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
$taskUrl = $null
for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $taskUrl = [IO.File]::ReadAllText($taskUrlFile).Trim()
        if ($taskUrl -notmatch '^http://127\.0\.0\.1:\d+/?$') { throw 'Invalid server URL.' }
        $taskState = Invoke-RestMethod -Uri ($taskUrl.TrimEnd('/')+'/api/state') -Headers $taskHeaders -TimeoutSec 4
        if ($null -ne $taskState.lobbyPreferences) { break }
    } catch { $taskState=$null }
}
if ($null -eq $taskState) { throw 'Organized application server did not start.' }
Assert-TaskBudget
$null = Invoke-RestMethod -Method Post -Uri ($taskUrl+'/api/desktop/open') -Headers $taskHeaders -TimeoutSec 10
for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    $taskStatus = Invoke-RestMethod -Uri ($taskUrl+'/api/desktop/status') -Headers $taskHeaders -TimeoutSec 4
    if ($taskStatus.ready -or $taskStatus.error) { break }
}
$taskOld = Join-Path $taskRoot '00 - PLAY DIRECT STRIKE/START - Direct Strike Companion.exe'
$taskSecond = Start-Process -FilePath $taskOld -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
if (-not $taskSecond.WaitForExit(8000)) { throw 'Compatibility launcher did not finish.' }
$taskReopened = Invoke-RestMethod -Uri ($taskUrl+'/api/desktop/status') -Headers $taskHeaders -TimeoutSec 4
$taskAfter = Get-Content -LiteralPath $taskLibrary -Raw | ConvertFrom-Json -Depth 100
$taskRestoredSettings = [ordered]@{}
foreach ($key in $taskSettingKeys) { $taskRestoredSettings[$key] = $taskAfter.settings.$key }
$taskReport = [pscustomobject]@{
    At=[DateTime]::UtcNow.ToString('o')
    ProcessId=$taskMain.Id
    Url=$taskUrl
    StoredGames=$taskAfter.matches.Count
    MatchesPreserved=(Get-TaskJsonHash $taskAfter.matches) -eq $taskMatchesHash
    MarksPreserved=(Get-TaskJsonHash $taskAfter.marks) -eq $taskMarksHash
    ExistingSettingsPreserved=(Get-TaskJsonHash $taskRestoredSettings) -eq $taskSettingsHash
    DevelopmentDataCreated=Test-Path -LiteralPath (Join-Path $taskSource 'data/library.json')
    Status=$taskReopened
    CompatibilityReopenedSameWindow=$taskStatus.windowHandle -eq $taskReopened.windowHandle
    CompatibilityExitCode=$taskSecond.ExitCode
}
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'folder-layout-runtime.json')
if (-not ($taskReport.MatchesPreserved -and $taskReport.MarksPreserved -and $taskReport.ExistingSettingsPreserved -and
    -not $taskReport.DevelopmentDataCreated -and $taskReopened.ready -and $taskReopened.visible -and $taskReopened.hasIcon -and
    $taskReopened.windowHandle -gt 0 -and $taskReport.CompatibilityReopenedSameWindow -and $taskSecond.ExitCode -eq 0)) {
    throw 'Organized runtime check failed; inspect folder-layout-runtime.json.'
}
$taskReport | ConvertTo-Json -Depth 5
