$ErrorActionPreference='Stop'
$taskInstall=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$taskExe=Join-Path $taskInstall 'Direct Strike Companion.exe'
$taskRunning=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskInstall+'\',[StringComparison]::OrdinalIgnoreCase) -and $_.Name -like '*Companion*'})
if($taskRunning.Count){throw 'A Companion instance is already running; its unsaved work must be preserved.'}
$taskCpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
$taskOs=Get-CimInstance Win32_OperatingSystem
$taskEngines=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
if($null -eq $taskCpu -or !$taskEngines.Count){throw 'Resource telemetry unavailable; startup deferred.'}
$taskGpu=($taskEngines | Group-Object {$_.Name -replace '^pid_\d+_',''} | ForEach-Object {($_.Group|Measure-Object UtilizationPercentage -Sum).Sum}|Measure-Object -Maximum).Maximum
$taskRam=100*(1-$taskOs.FreePhysicalMemory/$taskOs.TotalVisibleMemorySize)
if($taskCpu.PercentProcessorTime -ge 94 -or $taskGpu -ge 94 -or $taskRam -ge 98){throw 'Resource ceiling reached; automatic enrichment startup deferred.'}
$taskProcess=Start-Process -FilePath $taskExe -ArgumentList '--no-browser' -WindowStyle Hidden -PassThru -WorkingDirectory $taskInstall
[pscustomobject]@{StartedAt=[DateTime]::UtcNow.ToString('o');ProcessId=$taskProcess.Id;NoDashboardForegrounded=$true;Cpu=$taskCpu.PercentProcessorTime;Gpu=$taskGpu;Ram=[Math]::Round($taskRam,2)}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'impact-upgrade-start.json')
Get-Content -LiteralPath (Join-Path $PSScriptRoot 'impact-upgrade-start.json')
