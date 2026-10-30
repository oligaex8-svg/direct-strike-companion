$ErrorActionPreference='Stop'
$before=Get-Content (Join-Path $PSScriptRoot 'package-size-baseline.json') -Raw|ConvertFrom-Json
$after=Get-Content (Join-Path $PSScriptRoot 'native-local-build.json') -Raw|ConvertFrom-Json
$samples=[Collections.Generic.List[object]]::new()
$fixture=Join-Path $PSScriptRoot ('package-startup-'+[guid]::NewGuid().ToString('N')+'.SC2Replay')
[IO.File]::WriteAllBytes($fixture,[byte[]]@(0))
$request=@{Path=$fixture;Hash='package-startup';MetadataOnly=$false}|ConvertTo-Json -Compress
# A fixture worker uses the same native bundle/CLR startup, without the owner
# app mutex, game processes, library access, browser or desktop interaction.
try { foreach($iteration in 1..3){
 foreach($variant in @(@{Name='before';Path=$before.Path},@{Name='after';Path=$after.Path})){
  $info=[Diagnostics.ProcessStartInfo]::new($variant.Path)
  $info.ArgumentList.Add('--replay-worker-fixture');$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::new();$process.StartInfo=$info
  $timer=[Diagnostics.Stopwatch]::StartNew()
  try{
   $null=$process.Start();$process.PriorityClass='BelowNormal';$process.ProcessorAffinity=[IntPtr]1
   $process.StandardInput.WriteLine($request)
   $process.StandardInput.Flush()
   $line=$process.StandardOutput.ReadLineAsync()
   if(!$line.Wait(30000)){throw 'Fixture worker startup exceeded 30 seconds'}
   $timer.Stop();$result=$line.Result|ConvertFrom-Json
   if($result.error -or $result.clans.hash -ne 'package-startup'){throw ('Fixture worker failed its response contract: '+$line.Result)}
   $samples.Add([pscustomobject]@{Variant=$variant.Name;Iteration=$iteration;Milliseconds=$timer.Elapsed.TotalMilliseconds})
   $process.StandardInput.Close()
   if(!$process.WaitForExit(5000) -or $process.ExitCode -ne 0){throw 'Fixture worker failed to exit cleanly'}
  }finally{if($process.Id -and !$process.HasExited){$process.Kill($true);$process.WaitForExit()};$process.Dispose()}
 }
} } finally { Remove-Item -LiteralPath $fixture -ErrorAction SilentlyContinue }
$afterBytes=(Get-Item -LiteralPath $after.Path).Length
[pscustomobject]@{Success=$true;Scope='Local serial one-core process-to-fixture-response timing; not full UI launch or a cold-machine benchmark';BeforeBytes=$before.Bytes;AfterBytes=$afterBytes;SavedBytes=$before.Bytes-$afterBytes;ReductionPercent=100*(1-$afterBytes/$before.Bytes);BeforeSHA256=$before.SHA256;AfterSHA256=$after.SHA256;Samples=$samples}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $PSScriptRoot 'package-size-result.json')
