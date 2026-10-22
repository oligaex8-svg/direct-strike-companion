param([string]$ScriptPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $ScriptPath){$ScriptPath=Join-Path $taskRoot 'LobbyOcr.ps1'}
$ScriptPath=[IO.Path]::GetFullPath($ScriptPath)
$taskChecks=[Collections.Generic.List[object]]::new()
$taskClock=[Diagnostics.Stopwatch]::StartNew()
$taskScriptHash=$null
$taskFailure=$null
$taskFirst=$null
$taskSecond=$null
$taskAfterFailure=$null
$taskFailedFrameError=$null

function Assert-ProofLifetime([bool]$Passed,[string]$Name){
 $taskChecks.Add([pscustomobject]@{Name=$Name;Passed=$Passed})
 if(-not $Passed){throw $Name}
}

function New-ProofFixture([bool]$Second){
 $taskBitmap=[Drawing.Bitmap]::new(32,16,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
 $taskOutput=[IO.MemoryStream]::new()
 try{
  $taskCyan=[Drawing.Color]::FromArgb(255,30,210,240)
  $taskGlyphLeft=if($Second){9}else{2}
  $taskGlyphTop=if($Second){7}else{2}
  for($taskY=0;$taskY -lt 4;$taskY++){
   for($taskX=0;$taskX -lt 3;$taskX++){
    $taskBitmap.SetPixel($taskGlyphLeft+$taskX,$taskGlyphTop+$taskY,$taskCyan)
   }
  }
  $taskButtonColor=if($Second){[Drawing.Color]::FromArgb(255,30,70,120)}else{[Drawing.Color]::FromArgb(255,210,160,20)}
  $taskButtonLeft=if($Second){25}else{20}
  $taskButtonTop=if($Second){9}else{3}
  for($taskY=0;$taskY -lt 4;$taskY++){
   for($taskX=0;$taskX -lt 3;$taskX++){
    $taskBitmap.SetPixel($taskButtonLeft+$taskX,$taskButtonTop+$taskY,$taskButtonColor)
   }
  }
  $taskBitmap.Save($taskOutput,[Drawing.Imaging.ImageFormat]::Png)
  return ,($taskOutput.ToArray())
 }finally{$taskOutput.Dispose();$taskBitmap.Dispose()}
}

function Read-ProofFixture([byte[]]$Png){
 [pscustomobject]@{
  Hash=[DscCapture]::RegionHash($Png,0,0,16,16)
  GlyphMask=[DscCapture]::RegionGlyphMask($Png,0,0,16,16)
  AcceptGold=[DscCapture]::AcceptGold($Png,16,0,16,16)
 }
}

try{
 $taskSource=[IO.File]::ReadAllText($ScriptPath)
 $taskHasher=[Security.Cryptography.SHA256]::Create()
 try{$taskScriptHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes($ScriptPath))).Replace('-','')}finally{$taskHasher.Dispose()}
 Add-Type -AssemblyName System.Drawing
 # Exercise the delivered legacy assembly without compiling test substitutes.
 $taskHelperPath=Join-Path (Split-Path -Parent $ScriptPath) 'DscCaptureHelper.dll'
 if(-not (Test-Path -LiteralPath $taskHelperPath) -and [IO.Path]::GetFullPath($ScriptPath) -eq (Join-Path $taskRoot 'LobbyOcr.ps1')){$taskHelperPath=Join-Path $taskRoot 'obj/Release/net10.0-windows10.0.22621.0/ocr-runtime/DscCaptureHelper.dll'}
 if(-not (Test-Path -LiteralPath $taskHelperPath -PathType Leaf)){throw 'Bundled capture helper not found'}
 $null=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($taskHelperPath))
 $taskFlags=[Reflection.BindingFlags]'NonPublic,Static'
 $taskImageField=[DscCapture].GetField('proofImage',$taskFlags)
 $taskStreamField=[DscCapture].GetField('proofStream',$taskFlags)
 if(-not $taskImageField -or -not $taskStreamField){throw 'Production proof cache fields not found'}

 [DscCapture]::ReleaseProof()
 $taskFirstPng=New-ProofFixture $false
 $taskSecondPng=New-ProofFixture $true
 $taskFirst=Read-ProofFixture $taskFirstPng
 Assert-ProofLifetime (-not [string]::IsNullOrEmpty($taskFirst.Hash) -and -not [string]::IsNullOrEmpty($taskFirst.GlyphMask)) 'First frame produces a hash and a nonempty twelve-pixel cyan glyph mask'
 Assert-ProofLifetime $taskFirst.AcceptGold 'First frame detects its twelve gold button pixels'
 $taskFirstStream=$taskStreamField.GetValue($null)
 [DscCapture]::ReleaseProof()
 [DscCapture]::ReleaseProof()
 Assert-ProofLifetime ($null -eq $taskImageField.GetValue($null) -and $null -eq $taskStreamField.GetValue($null) -and -not $taskFirstStream.CanRead) 'Repeated release clears both cache references and disposes the first proof stream'

 $taskSecond=Read-ProofFixture $taskSecondPng
 Assert-ProofLifetime (-not [string]::IsNullOrEmpty($taskSecond.Hash) -and $taskSecond.Hash -cne $taskFirst.Hash) 'Second frame uses its fresh image hash after release'
 Assert-ProofLifetime (-not [string]::IsNullOrEmpty($taskSecond.GlyphMask) -and $taskSecond.GlyphMask -cne $taskFirst.GlyphMask) 'Second frame uses its differently positioned cyan glyph mask after release'
 Assert-ProofLifetime (-not $taskSecond.AcceptGold) 'Second frame does not retain the first frame gold button proof'
 [DscCapture]::ReleaseProof()

 $taskFailedFrameCaught=$false
 $taskFailedFrameStream=$null
 try{
  $null=[DscCapture]::RegionHash($taskFirstPng,0,0,16,16)
  $taskFailedFrameStream=$taskStreamField.GetValue($null)
  # Simulate a later invalid crop in a frame which already populated proofImage.
  $null=[DscCapture]::RegionHash($taskFirstPng,31,15,16,16)
 }catch{
  $taskFailedFrameCaught=$true
  $taskFailedFrameError=$_.Exception.Message
 }finally{
  [DscCapture]::ReleaseProof()
  [DscCapture]::ReleaseProof()
 }
 Assert-ProofLifetime $taskFailedFrameCaught 'Simulated invalid crop fails after initializing the proof cache'
 Assert-ProofLifetime ($null -eq $taskImageField.GetValue($null) -and $null -eq $taskStreamField.GetValue($null) -and $null -ne $taskFailedFrameStream -and -not $taskFailedFrameStream.CanRead) 'Failed-frame release clears both cache references and disposes its proof stream'
 $taskAfterFailure=Read-ProofFixture $taskSecondPng
 Assert-ProofLifetime ($taskAfterFailure.Hash -ceq $taskSecond.Hash -and $taskAfterFailure.GlyphMask -ceq $taskSecond.GlyphMask -and -not $taskAfterFailure.AcceptGold) 'Frame after failure reads the second image proofs without stale first-frame evidence'
}catch{
 $taskFailure=$_.Exception.Message
}finally{
 if('DscCapture' -as [type]){[DscCapture]::ReleaseProof()}
}

$taskReport=[pscustomobject]@{
 At=[DateTime]::UtcNow.ToString('o')
 Success=$null -eq $taskFailure
 ScriptPath=$ScriptPath
 ScriptSha256=$taskScriptHash
 Source='Production DscCapture proof helpers on two synthetic in-memory PNG frames; no OCR, capture or game input'
 Seconds=$taskClock.Elapsed.TotalSeconds
 Checks=@($taskChecks.ToArray())
 First=$taskFirst
 Second=$taskSecond
 AfterFailedFrame=$taskAfterFailure
 SimulatedFailure=$taskFailedFrameError
 Error=$taskFailure
}
$taskReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'reader-proof-lifetime.json') -Encoding UTF8
$taskReport | ConvertTo-Json -Depth 6 -Compress
if($taskFailure){throw $taskFailure}
