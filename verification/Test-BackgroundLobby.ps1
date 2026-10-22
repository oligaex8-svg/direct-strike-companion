param([string]$ScriptPath,[string]$PowerShellPath='powershell.exe')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $ScriptPath){$ScriptPath=Join-Path $taskRoot 'LobbyOcr.ps1'}
$taskStart=[Diagnostics.ProcessStartInfo]::new($PowerShellPath)
$taskStart.UseShellExecute=$false;$taskStart.CreateNoWindow=$true
$taskStart.RedirectStandardOutput=$true;$taskStart.RedirectStandardError=$true
$taskStart.WorkingDirectory=$taskRoot
$taskStart.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$ScriptPath+'" -CaptureExecutable "'+(Join-Path $taskRoot 'release/DirectStrikeCompanion.exe')+'"'
$taskHelper=Join-Path (Split-Path -Parent $ScriptPath) 'DscCaptureHelper.dll'
if(-not (Test-Path -LiteralPath $taskHelper)){$taskHelper=Join-Path $taskRoot 'obj/Release/net10.0-windows10.0.22621.0/ocr-runtime/DscCaptureHelper.dll'}
if(-not (Test-Path -LiteralPath $taskHelper)){throw 'Build the compiled capture helper before native reader diagnostics'}
$taskStart.Arguments+=' -CaptureHelperPath "'+$taskHelper+'"'
$taskProcess=[Diagnostics.Process]::new();$taskProcess.StartInfo=$taskStart
function Stop-OwnedChild([int]$taskId){
 Get-CimInstance Win32_Process -Filter "ParentProcessId=$taskId" | ForEach-Object { Stop-OwnedChild $_.ProcessId }
 Stop-Process -Id $taskId -Force -ErrorAction SilentlyContinue
}
$taskClock=[Diagnostics.Stopwatch]::StartNew()
try {
 $null=$taskProcess.Start();$null=$taskProcess.Handle
 $taskProcess.PriorityClass='BelowNormal';$taskProcess.ProcessorAffinity=[IntPtr]1
 $taskOut=$taskProcess.StandardOutput.ReadToEndAsync();$taskError=$taskProcess.StandardError.ReadToEndAsync()
 if(-not $taskProcess.WaitForExit(8000)){Stop-OwnedChild $taskProcess.Id;throw 'Window capture/OCR reached the contained eight-second deadline'}
 $taskOutput=$taskOut.GetAwaiter().GetResult()
 $taskErrors=$taskError.GetAwaiter().GetResult()
 if($taskProcess.ExitCode -ne 0){
  $taskFailure=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Seconds=$taskClock.Elapsed.TotalSeconds;ExitCode=$taskProcess.ExitCode;PowerShell=$PowerShellPath;Script=$ScriptPath;Error=$taskErrors.Substring(0,[Math]::Min(3000,$taskErrors.Length))}
  $taskFailure | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'native-reader-failure.json') -Encoding UTF8
  throw ('Window capture failed: '+$taskFailure.Error)
 }
 $taskJson=$taskOutput | ConvertFrom-Json
 # Record only bounded recognition metadata, never pixels or the complete OCR text.
 $taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');Seconds=$taskClock.Elapsed.TotalSeconds;Status=$taskJson.status;Method=$taskJson.capture.method;Borderless=$taskJson.capture.borderless;Foreground=$taskJson.capture.foreground;Unobscured=$taskJson.capture.unobscured;Names=@($taskJson.rosterNames);Teams=@($taskJson.rosterTeams);Width=$taskJson.capture.width;Height=$taskJson.capture.height}
 $taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'live-window-capture.json')
 $taskReport | ConvertTo-Json
} finally {$taskProcess.Dispose()}
