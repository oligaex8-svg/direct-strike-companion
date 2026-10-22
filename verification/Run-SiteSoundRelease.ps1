param([ValidateSet('Build','Tests','Package','Archive','Defender')][string]$Stage='Build')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$samples=[Collections.Generic.List[object]]::new()
function Read-TaskBudget {
    $taskOs=Get-CimInstance Win32_OperatingSystem
    $taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    if($null -eq $taskCpu){throw 'CPU reading unavailable; job deferred.'}
    [pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Ram=[Math]::Round(100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize),2);Cpu=[double]$taskCpu.PercentProcessorTime}
}
function Stop-TaskTree([int]$taskPid) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$taskPid" | ForEach-Object { Stop-TaskTree $_.ProcessId }
    Stop-Process -Id $taskPid -Force -ErrorAction SilentlyContinue
}
function Invoke-TaskJob([string]$taskName,[string]$taskFile,[string[]]$taskArguments) {
    $sample=Read-TaskBudget;$samples.Add($sample)
    if($sample.Ram -ge 94 -or $sample.Cpu -ge 90){throw 'Resource budget reached; release job deferred.'}
    $job=Start-Process -FilePath $taskFile -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot "$taskName-output.txt") -RedirectStandardError (Join-Path $PSScriptRoot "$taskName-error.txt")
    try {
        $null=$job.Handle
        $job.PriorityClass='BelowNormal';$job.ProcessorAffinity=[IntPtr]1
        while(-not $job.HasExited){
            Start-Sleep -Milliseconds 650
            $sample=Read-TaskBudget;$samples.Add($sample)
            if($sample.Ram -ge 94 -or $sample.Cpu -ge 90){Stop-TaskTree $job.Id;throw "Stopped task job $taskName after resource budget was reached."}
        }
        $job.WaitForExit()
        if($job.ExitCode -ne 0){Get-Content -LiteralPath (Join-Path $PSScriptRoot "$taskName-output.txt") -Tail 18;Get-Content -LiteralPath (Join-Path $PSScriptRoot "$taskName-error.txt") -Tail 8;throw "$taskName failed ($($job.ExitCode))."}
        [pscustomobject]@{Job=$taskName;Exit=$job.ExitCode}
    } finally { $job.Dispose() }
}
try {
    if($Stage -eq 'Build'){
        Invoke-TaskJob 'site-sounds-standalone-build' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'Build.ps1')+'"'),'-SingleFile')
        Invoke-TaskJob 'site-sounds-portable-build' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'Build.ps1')+'"'),'-Portable')
    }
    if($Stage -eq 'Tests'){
        Invoke-TaskJob 'site-sounds-standalone-tests' (Join-Path $taskRoot 'release/DirectStrikeCompanion.exe') @('--self-test')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'release/test-output/results.json') -Destination (Join-Path $PSScriptRoot 'self-tests-site-sounds-standalone.json') -Force
        Invoke-TaskJob 'site-sounds-portable-tests' (Join-Path $taskRoot 'portable/DirectStrikeCompanion.exe') @('--self-test')
        Copy-Item -LiteralPath (Join-Path $taskRoot 'portable/test-output/results.json') -Destination (Join-Path $PSScriptRoot 'self-tests-site-sounds-portable.json') -Force
    }
    if($Stage -eq 'Package'){
        Invoke-TaskJob 'site-sounds-package' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $taskRoot 'Package-Portable.ps1')+'"'),'-Version','2026-10-07-site-sounds')
    }
    if($Stage -eq 'Archive'){
        Invoke-TaskJob 'site-sounds-archive' 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'Verify-SiteSoundsArchive.ps1')+'"'))
    }
    if($Stage -eq 'Defender'){
        $taskDefender=Join-Path $env:ProgramFiles 'Windows Defender/MpCmdRun.exe'
        Invoke-TaskJob 'site-sounds-exe-scan' $taskDefender @('-Scan','-ScanType','3','-File',('"'+(Join-Path $taskRoot 'Direct Strike Companion.exe')+'"'),'-DisableRemediation')
        Invoke-TaskJob 'site-sounds-zip-scan' $taskDefender @('-Scan','-ScanType','3','-File',('"'+(Join-Path $taskRoot 'share/DirectStrikeCompanion-2026-10-07-site-sounds-portable.zip')+'"'),'-DisableRemediation')
    }
} finally {
    [pscustomobject]@{Stage=$Stage;Samples=$samples;PeakRam=($samples|Measure-Object Ram -Maximum).Maximum;PeakCpu=($samples|Measure-Object Cpu -Maximum).Maximum} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "site-sounds-budget-$Stage.json")
}
