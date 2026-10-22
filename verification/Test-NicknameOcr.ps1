param([switch]$Explore,[string]$ScriptPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $ScriptPath){$ScriptPath=Join-Path $taskRoot 'LobbyOcr.ps1'}
$taskSource=[IO.File]::ReadAllText($ScriptPath)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$taskHelperPath=Join-Path (Split-Path -Parent $ScriptPath) 'DscCaptureHelper.dll'
if(-not (Test-Path -LiteralPath $taskHelperPath) -and [IO.Path]::GetFullPath($ScriptPath) -eq (Join-Path $taskRoot 'LobbyOcr.ps1')){$taskHelperPath=Join-Path $taskRoot 'obj/Release/net10.0-windows10.0.22621.0/ocr-runtime/DscCaptureHelper.dll'}
if(-not (Test-Path -LiteralPath $taskHelperPath -PathType Leaf)){throw 'Build and export the compiled capture helper before running nickname checks'}
$null=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($taskHelperPath))
$taskInitStart=$taskSource.IndexOf('$null=[Windows.Storage.StorageFile')
$taskInitEnd=$taskSource.IndexOf('function Await-Dsc')
Invoke-Expression $taskSource.Substring($taskInitStart,$taskInitEnd-$taskInitStart)
$taskParseErrors=$null;$taskTokens=$null
$taskAst=[Management.Automation.Language.Parser]::ParseInput($taskSource,[ref]$taskTokens,[ref]$taskParseErrors)
if($taskParseErrors.Count){throw 'Production OCR script has parse errors'}
foreach($taskFunction in $taskAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
 if($taskFunction.Name -in @('Await-Dsc','Join-DscNameLines','Read-NameLine','Remove-HostLabel','Select-DscNameReading')){Invoke-Expression $taskFunction.Extent.Text}
}
$taskLanguages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object {$_.LanguageTag -match '^(en|ru)'})
$taskEngines=@(foreach($taskLanguage in $taskLanguages){@{language=$taskLanguage.LanguageTag;engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($taskLanguage)}})
if(-not $taskEngines){throw 'English/Russian OCR recognizers unavailable'}
if($Explore){Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class DscNameProbe {
 public static byte[] Crop(byte[] source, int left, int top, int width, int height, int zoom, bool gray) {
  using(var input=new MemoryStream(source)) using(var bitmap=new Bitmap(input))
  using(var crop=bitmap.Clone(new Rectangle(left,top,width,height),PixelFormat.Format32bppArgb)) {
   if(gray) for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
    var c=crop.GetPixel(x,y);int value=255-Math.Min(255,Math.Max(0,Math.Max(c.B,c.G)-c.R)*2);
    crop.SetPixel(x,y,Color.FromArgb(value,value,value));
   }
   using(var result=new Bitmap(width*zoom,height*zoom)) using(var g=Graphics.FromImage(result)) using(var output=new MemoryStream()) {
    g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    g.DrawImage(crop,new Rectangle(0,0,result.Width,result.Height));result.Save(output,ImageFormat.Png);return output.ToArray();
   }
  }
 }
}
'@
}
$taskImage=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'fixtures/nicknames/combined-lobby.png'))
$taskCases=@(
 @{Name='Ваня Кузьмич';Left=215;Top=136;Width=172;Height=27;Raw='Ваня';Host=$true},
 @{Name='TKnight';Left=215;Top=206;Width=94;Height=27;Raw='Tknight'},
 @{Name='miggy';Left=215;Top=301;Width=90;Height=29;Raw='rnggy'},
 @{Name='BOOMBACLAT';Left=215;Top=466;Width=147;Height=31;Raw='BOOMBACILT'},
 @{Name='jejo';Left=213;Top=689;Width=41;Height=26;Raw='jejo';Image='six-player-lobby.png'}
)
$taskClock=[Diagnostics.Stopwatch]::StartNew()
$taskResults=@(foreach($taskCase in $taskCases){
 $taskCaseImage=if($taskCase.Image){[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('fixtures/nicknames/'+$taskCase.Image)))}else{$taskImage}
 $taskVariants=@{Production=[DscCapture]::NameImage($taskCaseImage,$taskCase.Left,$taskCase.Top,$taskCase.Width,$taskCase.Height,$(if($taskCase.Host){6}else{0}))}
 if($Explore){
  $taskVariants['Natural2']=[DscNameProbe]::Crop($taskCaseImage,$taskCase.Left,$taskCase.Top,$taskCase.Width,$taskCase.Height,2,$false)
  $taskVariants['Natural3']=[DscNameProbe]::Crop($taskCaseImage,$taskCase.Left,$taskCase.Top,$taskCase.Width,$taskCase.Height,3,$false)
  $taskVariants['Gray2']=[DscNameProbe]::Crop($taskCaseImage,$taskCase.Left,$taskCase.Top,$taskCase.Width,$taskCase.Height,2,$true)
  $taskVariants['Gray3']=[DscNameProbe]::Crop($taskCaseImage,$taskCase.Left,$taskCase.Top,$taskCase.Width,$taskCase.Height,3,$true)
 }
 foreach($taskVariant in $taskVariants.GetEnumerator()){
  $taskReadings=@(Read-NameLine $taskVariant.Value $taskEngines)
  $taskSelected=if(Get-Command Select-DscNameReading -ErrorAction SilentlyContinue){Select-DscNameReading $taskCase.Raw $taskReadings}else{$null}
  [pscustomobject]@{Expected=$taskCase.Name;Variant=$taskVariant.Key;Raw=$taskCase.Raw;Crop=@{Left=$taskCase.Left;Top=$taskCase.Top;Width=$taskCase.Width;Height=$taskCase.Height};Readings=$taskReadings;Selected=$taskSelected;Passed=$taskSelected -ceq $taskCase.Name}
 }
})
$taskSelectionCases=@(
 @{Raw='BOOMBACLAT';Expected='BOOMBACLAT';En='BOOMBACLAT';Ru='ВООМВАСIЛТ'},
 @{Raw='T Knight';Expected='TKnight';En='TKnight';Ru='Tknight'},
 @{Raw='akay';Expected='akay';En='akay';Ru='акай'},
 @{Raw='John Smith';Expected='John Smith';En='John';Ru=''},
 @{Raw='Mary Anne Sue';Expected='Mary Anne Sue';En='Mary Anne';Ru=''},
 @{Raw='Ваня Кузьмич';Expected='Ваня Кузьмич';En='BaHR KY3bMhH';Ru='Ваня'},
 @{Raw='Mila';Expected='Mila';En='Mila';Ru='Мила'},
 @{Raw='Данил';Expected='Данил';En='AAHUJI';Ru='Данил'},
 @{Raw='A B';Expected='AB';En='AB';Ru=''},
 @{Raw='ab(guest)';Expected='ab(guest)';En='ab(guest)';Ru=''},
 @{Raw='<tag> Nick';Expected='Nick';En='Nick';Ru=''},
 @{Raw='Nick';Expected='Nick';En='';Ru=''},
 @{Raw='KOHCTaHThH fOcynoB';Expected='Константин Юсупов';En='KOHCTaHTVIH IOcynoB';Ru='Константин Юсупов'},
 @{Raw='Mila Smith';Expected='Mila Smith';En='Mila Smith';Ru='Мила Смит'}
)
$taskSelectionResults=@(foreach($taskCase in $taskSelectionCases){
 $taskSelected=Select-DscNameReading $taskCase.Raw @(@{language='en-GB';text=$taskCase.En},@{language='ru';text=$taskCase.Ru})
 [pscustomobject]@{Raw=$taskCase.Raw;Expected=$taskCase.Expected;Selected=$taskSelected;Passed=$taskSelected -ceq $taskCase.Expected}
})
$taskPassed=@($taskResults | Where-Object {$_.Variant -eq 'Production' -and -not $_.Passed}).Count -eq 0 -and @($taskSelectionResults | Where-Object {-not $_.Passed}).Count -eq 0
$taskHasher=[Security.Cryptography.SHA256]::Create()
try{$taskScriptHash=[BitConverter]::ToString($taskHasher.ComputeHash([IO.File]::ReadAllBytes($ScriptPath))).Replace('-','')}finally{$taskHasher.Dispose()}
$taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');ScriptSha256=$taskScriptHash;Source='Actual supplied screenshot name crops; host crop has an explicitly known host label';Explore=[bool]$Explore;Success=$taskPassed;Seconds=$taskClock.Elapsed.TotalSeconds;Cases=$taskResults;SelectionCases=$taskSelectionResults}
$taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'nickname-ocr-readings.json') -Encoding UTF8
$taskReport | ConvertTo-Json -Depth 8 -Compress
if(-not $taskPassed){throw 'Nickname OCR regression failed'}
