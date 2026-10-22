param([switch]$PreserveUserArchives)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (Test-Path -LiteralPath (Join-Path $sourceRoot 'Support/Development/DirectStrikeCompanion.csproj')) {
    $sourceRoot = Join-Path $sourceRoot 'Support/Development'
}
. (Join-Path $sourceRoot 'InstallationPaths.ps1')
$paths = Get-InstallationPaths $sourceRoot
$root = $paths.InstallRoot
$launchFolder = $paths.LauncherRoot
$exe = Join-Path $root 'Direct Strike Companion.exe'
$legacyExe = Join-Path $launchFolder 'START - Direct Strike Companion.exe'
$icon = Join-Path $launchFolder 'app.ico'
$preview = Join-Path $launchFolder 'App preview.png'
$reportPath = Assert-InstallationChildPath $root (Join-Path $sourceRoot 'verification/launcher-layout-checks.json')
$visible = @(Get-ChildItem -LiteralPath $root -Force | Where-Object {
    -not ($_.Attributes -band [IO.FileAttributes]::Hidden) -and -not ($_.Attributes -band [IO.FileAttributes]::System)
} | Select-Object -ExpandProperty Name | Sort-Object)
$expected = @('Direct Strike Companion.exe', 'START HERE.txt', 'Support') | Sort-Object
$retainedArchives = @($visible | Where-Object { $PreserveUserArchives -and [IO.Path]::GetExtension($_) -in @('.rar','.zip','.7z') -and (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf) })
$applicationItems = @($visible | Where-Object { $_ -notin $retainedArchives })
function Test-Hidden([string]$Path) {
    [bool]((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::Hidden)
}
function Test-EqualHash([string]$First, [string]$Second) {
    (Get-FileHash -LiteralPath $First).Hash -eq (Get-FileHash -LiteralPath $Second).Hash
}
function Get-IniCheck([string]$Path, [string]$IconReference) {
    $item = Get-Item -LiteralPath $Path -Force
    $bytes = [IO.File]::ReadAllBytes($Path)
    [pscustomobject]@{
        Hash = (Get-FileHash -LiteralPath $Path).Hash
        HiddenSystemUnicode = [bool]($item.Attributes -band [IO.FileAttributes]::Hidden) -and
            [bool]($item.Attributes -band [IO.FileAttributes]::System) -and $bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254
        IconConfigured = [IO.File]::ReadAllText($Path).Contains("IconResource=$IconReference,0")
    }
}
$shell = New-Object -ComObject WScript.Shell
$shortcuts = foreach ($name in @('00 - START Direct Strike Companion.lnk', 'Direct Strike Companion.lnk')) {
    $shortcutPath = Join-Path $root $name
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw "Shortcut is missing: $shortcutPath" }
    $link = $shell.CreateShortcut($shortcutPath)
    [pscustomobject]@{
        Name = $name
        Target = $link.TargetPath
        WorkingDirectory = $link.WorkingDirectory
        Icon = $link.IconLocation
        Correct = $link.TargetPath -eq $exe -and $link.WorkingDirectory -eq $root -and
            $link.IconLocation -eq ($exe + ',0') -and $link.Arguments -eq '' -and (Test-Hidden $shortcutPath)
    }
}
$compatibilityPath = Join-Path $root '00 - PLAY DIRECT STRIKE'
$compatibility = Get-Item -LiteralPath $compatibilityPath -Force
$target = @($compatibility.Target)
$expectedTarget = [IO.Path]::GetFullPath($launchFolder).TrimEnd('\')
$compatibilityCorrect = [bool]($compatibility.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
    (Test-Hidden $compatibilityPath) -and $target.Count -eq 1 -and
    [IO.Path]::GetFullPath($target[0]).TrimEnd('\') -eq $expectedTarget
$instructions = [IO.File]::ReadAllText((Join-Path $root 'START HERE.txt'))
$russianLabel = [string][char]0x0420 + [char]0x0443 + [char]0x0441 + [char]0x0441 + [char]0x043A + [char]0x0438 + [char]0x0439
$retainedSource = @('DirectStrikeCompanion.csproj', 'Program.cs', 'README.md', 'InstallationPaths.ps1', 'Build.ps1', 'Package-Portable.ps1', 'Update-Launcher.ps1', 'Start.vbs', '.sdk', 'assets', 'wwwroot', 'bin', 'obj', 'verification')
$missingSource = @($retainedSource | Where-Object { -not (Test-Path -LiteralPath (Join-Path $sourceRoot $_)) })
$missingOlder = @('dist', 'portable', 'share' | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root ("Support\Older versions\" + $_))) })
$rootIni = Get-IniCheck (Join-Path $root 'desktop.ini') 'Support\Launcher resources\app.ico'
$legacyIni = Get-IniCheck (Join-Path $launchFolder 'desktop.ini') 'app.ico'
$report = [pscustomobject]@{
    At = [DateTime]::UtcNow.ToString('o')
    InstallRoot = $root
    SourceRoot = $sourceRoot
    VisibleRootItems = $visible
    ExactlyThreeVisibleRootItems = $visible.Count -eq 3 -and @(Compare-Object $expected $visible).Count -eq 0
    ApplicationLayoutAccepted = $applicationItems.Count -eq 3 -and @(Compare-Object $expected $applicationItems).Count -eq 0
    UserArchivesRetained = $retainedArchives
    OrganizedSourceLayout = $paths.Organized
    MissingSource = $missingSource
    MissingOlderVersions = $missingOlder
    SourceAndDataRetained = $missingSource.Count -eq 0 -and (Test-Path -LiteralPath (Join-Path $root 'data/library.json'))
    DataHidden = Test-Hidden (Join-Path $root 'data')
    RuntimeWebRootHidden = Test-Hidden (Join-Path $root 'wwwroot')
    CompatibilityTarget = $target
    CompatibilityJunctionCorrect = $compatibilityCorrect
    LauncherHash = (Get-FileHash -LiteralPath $legacyExe).Hash
    ExeMatchesInstalled = Test-EqualHash $legacyExe $exe
    CompatibilityExeMatchesInstalled = Test-EqualHash (Join-Path $compatibilityPath 'START - Direct Strike Companion.exe') $exe
    IconMatchesArtwork = Test-EqualHash $icon (Join-Path $sourceRoot 'assets/companion.ico')
    LauncherIconHidden = Test-Hidden $icon
    PreviewMatchesArtwork = Test-EqualHash $preview (Join-Path $sourceRoot 'assets/companion.png')
    RootVbsMatchesSource = Test-EqualHash (Join-Path $root 'Start.vbs') (Join-Path $sourceRoot 'Start.vbs')
    RootVbsHidden = Test-Hidden (Join-Path $root 'Start.vbs')
    Shortcuts = @($shortcuts)
    RootFolderCustomizable = [bool]((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReadOnly)
    LegacyFolderCustomizable = [bool]((Get-Item -LiteralPath $launchFolder -Force).Attributes -band [IO.FileAttributes]::ReadOnly)
    RootIni = $rootIni
    LegacyIni = $legacyIni
    EnglishWindowInstructions = $instructions.Contains('Closing the app window') -and $instructions.Contains('Direct Strike Companion.exe')
    RussianWindowInstructions = $instructions.Contains($russianLabel)
    RuntimeRestarted = $false
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
if (-not ($report.ApplicationLayoutAccepted -and $report.OrganizedSourceLayout -and $report.SourceAndDataRetained -and
    $report.DataHidden -and $report.RuntimeWebRootHidden -and $report.CompatibilityJunctionCorrect -and $report.ExeMatchesInstalled -and
    $report.CompatibilityExeMatchesInstalled -and $report.IconMatchesArtwork -and $report.LauncherIconHidden -and $report.PreviewMatchesArtwork -and
    $report.RootVbsMatchesSource -and $report.RootVbsHidden -and $report.RootFolderCustomizable -and
    $report.LegacyFolderCustomizable -and $rootIni.HiddenSystemUnicode -and $rootIni.IconConfigured -and
    $legacyIni.HiddenSystemUnicode -and $legacyIni.IconConfigured -and $report.EnglishWindowInstructions -and
    $report.RussianWindowInstructions -and $missingOlder.Count -eq 0 -and @($shortcuts | Where-Object { -not $_.Correct }).Count -eq 0)) {
    throw 'Launcher layout verification failed; inspect launcher-layout-checks.json.'
}
$report | ConvertTo-Json -Depth 5

