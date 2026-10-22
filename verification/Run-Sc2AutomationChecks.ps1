$ErrorActionPreference='Stop'
# A focused source harness uses the installed SDK; production remains on net10.
# All input is injected through FixtureInput. Native capture is a throwing stub.
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskHarness=Join-Path $PSScriptRoot 'automation-harness'
$null=New-Item -ItemType Directory -Path $taskHarness -Force
@'
{"sdk":{"version":"9.0.316","rollForward":"latestPatch"}}
'@ | Set-Content -LiteralPath (Join-Path $taskHarness 'global.json')
@'
<Project Sdk="Microsoft.NET.Sdk">
<PropertyGroup><TargetFramework>net9.0-windows</TargetFramework><OutputType>Exe</OutputType><UseWindowsForms>true</UseWindowsForms><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup>
<ItemGroup>
<Compile Include="../../Sc2Automation.cs"/><Compile Include="../../Sc2AutomationTests.cs"/>
<Compile Include="../../Sc2TextProof.cs"/><Compile Include="../../Sc2TextProofTests.cs"/>
<Compile Include="../../Sc2ClientUi.cs"/><Compile Include="../../GameSounds.cs"/><Compile Include="Harness.cs"/>
<EmbeddedResource Include="DscCaptureHelper.dll" LogicalName="DscTool:DscCaptureHelper.dll"/>
<EmbeddedResource Include="../fixtures/sc2-commander-dropdown.json" LogicalName="DscTest:sc2-commander-dropdown"/>
</ItemGroup></Project>
'@ | Set-Content -LiteralPath (Join-Path $taskHarness 'Harness.csproj')
@'
using System.Text.Json;
namespace DirectStrikeCompanion;
public sealed class Settings { public bool AutoAcceptMatch {get;set;} public string AutoPickCommander {get;set;}=""; }
public static class Store { public static JsonSerializerOptions Json=new(JsonSerializerDefaults.Web); }
internal static class Sc2WindowCapture { internal static byte[] CaptureForInput(IntPtr handle)=>throw new InvalidOperationException("Native capture disabled in fixture harness"); }
internal static class Harness {
 static int Main() {
  var checks=new List<string>();
  try { void Check(bool passed,string name) {if(!passed)throw new InvalidOperationException(name);checks.Add(name);}
   Sc2AutomationTests.Run(Check);Sc2TextProofTests.Run(Check);
   File.WriteAllText("../automation-source-checks.json",JsonSerializer.Serialize(new{success=true,checks},Store.Json));
   Console.WriteLine("Passed "+checks.Count+" source checks; no native input.");return 0;
  } catch(Exception error) {File.WriteAllText("../automation-source-checks.json",JsonSerializer.Serialize(new{success=false,error=error.ToString(),checks},Store.Json));Console.Error.WriteLine(error);return 1;}
 }
}
'@ | Set-Content -LiteralPath (Join-Path $taskHarness 'Harness.cs')
$taskCompiler=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $taskCompiler /nologo /target:library /optimize+ /debug- /platform:anycpu ('/reference:'+(Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/System.Drawing.dll')) ('/out:'+(Join-Path $taskHarness 'DscCaptureHelper.dll')) (Join-Path $taskRoot 'OcrRuntime/DscCapture.cs')
if($LASTEXITCODE -ne 0){throw 'Capture helper compilation failed'}
Push-Location -LiteralPath $taskHarness
try {
 & dotnet build Harness.csproj --disable-build-servers -m:1 /p:UseSharedCompilation=false
 if($LASTEXITCODE -ne 0){throw 'Automation harness compilation failed'}
 & dotnet bin/Debug/net9.0-windows/Harness.dll
 if($LASTEXITCODE -ne 0){throw 'Automation source checks failed'}
} finally {Pop-Location}
