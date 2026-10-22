$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskGame=@(Get-Process | Where-Object {$_.ProcessName -match '^SC2(_x64)?$' -and $_.MainWindowHandle -ne [IntPtr]::Zero})
if($taskGame.Count -ne 1){throw 'One SC2 game window is required'}
$taskStart=[Diagnostics.ProcessStartInfo]::new((Join-Path $taskRoot 'release/DirectStrikeCompanion.exe'))
$taskStart.UseShellExecute=$false;$taskStart.CreateNoWindow=$true
$taskStart.RedirectStandardOutput=$true;$taskStart.RedirectStandardError=$true
$taskStart.Arguments='--capture-sc2-window '+$taskGame[0].MainWindowHandle.ToInt64()
$taskProcess=[Diagnostics.Process]::new();$taskProcess.StartInfo=$taskStart
$taskClock=[Diagnostics.Stopwatch]::StartNew()
try {
 $null=$taskProcess.Start();$null=$taskProcess.Handle
 $taskProcess.PriorityClass='BelowNormal';$taskProcess.ProcessorAffinity=[IntPtr]1
 $taskOut=$taskProcess.StandardOutput.ReadToEndAsync();$taskError=$taskProcess.StandardError.ReadToEndAsync()
 if(-not $taskProcess.WaitForExit(8000)){$taskProcess.Kill();throw 'Window capture exceeded the eight-second limit'}
 $taskResult=$taskOut.GetAwaiter().GetResult() | ConvertFrom-Json
 if($taskProcess.ExitCode -ne 0){throw 'Window capture worker exited unsuccessfully'}
 $taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Seconds=$taskClock.Elapsed.TotalSeconds;Success=$taskResult.success;Borderless=$taskResult.borderless;Error=$taskResult.error}
 if($taskResult.success){[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'window-capture-probe.png'),[Convert]::FromBase64String($taskResult.imageBase64))}
 $taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'window-capture-probe.json') -Encoding UTF8
 $taskReport | ConvertTo-Json -Compress
} finally {$taskProcess.Dispose()}
