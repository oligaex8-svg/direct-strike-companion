$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath('D:/300 Development Folder/Tools/DirectStrikeCompanion').TrimEnd('\')
$taskDevelopment = Join-Path $taskRoot 'Support/Development'
$taskOlder = Join-Path $taskRoot 'Support/Older versions'
$taskLegacy = Join-Path $taskRoot 'Support/Launcher resources'

function Assert-TaskPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Migration path escaped this installation: $full"
    }
    $current = $taskRoot
    foreach ($part in $full.Substring($taskRoot.Length + 1).Split('\')) {
        $current = Join-Path $current $part
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Migration path is redirected: $current"
            }
        }
    }
    return $full
}

if (Test-Path -LiteralPath $taskDevelopment) { throw 'Layout already migrated; use Check-LauncherLayout.ps1.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'DirectStrikeCompanion.csproj'))) { throw 'Expected source installation is missing.' }
$taskProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)
})
if ($taskProcesses.Count -gt 0) { throw 'An installation process started; defer migration without closing it.' }

$taskPlan = [Collections.Generic.List[object]]::new()
foreach ($name in @('.sdk', 'assets', 'bin', 'obj', 'release', 'test-output', 'verification', 'wwwroot')) {
    $taskPlan.Add([pscustomobject]@{Source=(Join-Path $taskRoot $name); Destination=(Join-Path $taskDevelopment $name)})
}
foreach ($name in @('dist', 'portable', 'share')) {
    $taskPlan.Add([pscustomobject]@{Source=(Join-Path $taskRoot $name); Destination=(Join-Path $taskOlder $name)})
}
$taskPlan.Add([pscustomobject]@{Source=(Join-Path $taskRoot '00 - PLAY DIRECT STRIKE'); Destination=$taskLegacy})
foreach ($file in Get-ChildItem -LiteralPath $taskRoot -Force -File) {
    if ($file.Extension -in @('.cs', '.ps1', '.csproj') -or $file.Name -in @('.gitignore', 'global.json', 'packages.lock.json', 'README.md')) {
        $taskPlan.Add([pscustomobject]@{Source=$file.FullName; Destination=(Join-Path $taskDevelopment $file.Name)})
    }
}
foreach ($entry in $taskPlan) {
    $entry.Source = Assert-TaskPath $entry.Source
    $entry.Destination = Assert-TaskPath $entry.Destination
    if (-not (Test-Path -LiteralPath $entry.Source)) { throw "Migration source missing: $($entry.Source)" }
    if (Test-Path -LiteralPath $entry.Destination) { throw "Migration destination already exists: $($entry.Destination)" }
}
$taskBaseline = [pscustomobject]@{
    At=[DateTime]::UtcNow.ToString('o')
    RunningProcesses=$taskProcesses.Count
    LibraryHash=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'data/library.json')).Hash
    ExeHash=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'Direct Strike Companion.exe')).Hash
    Archives=@(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'share') -File -Filter '*.zip' | ForEach-Object {
        [pscustomobject]@{Name=$_.Name;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}
    })
    SourceFiles=@($taskPlan | Where-Object { Test-Path -LiteralPath $_.Source -PathType Leaf } | ForEach-Object {
        [pscustomobject]@{Name=(Split-Path $_.Source -Leaf);Hash=(Get-FileHash -LiteralPath $_.Source).Hash}
    })
    Moves=@($taskPlan)
}
New-Item -ItemType Directory -Path $taskDevelopment,$taskOlder -Force | Out-Null
$taskBaseline | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskDevelopment 'layout-migration-baseline.json')
foreach ($entry in $taskPlan) {
    # Validated absolute paths on the same volume; no shell composition or deletion.
    Move-Item -LiteralPath $entry.Source -Destination $entry.Destination
}
Copy-Item -LiteralPath (Join-Path $taskRoot 'Start.vbs') -Destination (Join-Path $taskDevelopment 'Start.vbs')

# Preserve previously supplied launcher, artwork, evidence and ZIP links.
$taskAliases = @(
    [pscustomobject]@{Name='00 - PLAY DIRECT STRIKE';Target=$taskLegacy},
    [pscustomobject]@{Name='assets';Target=(Join-Path $taskDevelopment 'assets')},
    [pscustomobject]@{Name='verification';Target=(Join-Path $taskDevelopment 'verification')},
    [pscustomobject]@{Name='share';Target=(Join-Path $taskOlder 'share')}
)
foreach ($alias in $taskAliases) {
    $aliasPath = Join-Path $taskRoot $alias.Name
    # Both link and target were checked as contained paths before any move.
    if (-not ([IO.Path]::GetFullPath($alias.Target)).StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Compatibility target escaped this installation.'
    }
    New-Item -ItemType Junction -Path $aliasPath -Target $alias.Target | Out-Null
    $item = Get-Item -LiteralPath $aliasPath -Force
    $item.Attributes = $item.Attributes -bor [IO.FileAttributes]::Hidden
}
$taskReport = [pscustomobject]@{
    At=[DateTime]::UtcNow.ToString('o')
    Development=$taskDevelopment
    OlderVersions=$taskOlder
    Moves=$taskPlan.Count
    SourceFilesPreserved=@($taskBaseline.SourceFiles | Where-Object {
        (Get-FileHash -LiteralPath (Join-Path $taskDevelopment $_.Name)).Hash -ne $_.Hash
    }).Count -eq 0
    LibraryUnchanged=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'data/library.json')).Hash -eq $taskBaseline.LibraryHash
    ExeUnchanged=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'Direct Strike Companion.exe')).Hash -eq $taskBaseline.ExeHash
    ArchivesUnchanged=@($taskBaseline.Archives | Where-Object {
        (Get-FileHash -LiteralPath (Join-Path $taskOlder ('share/' + $_.Name))).Hash -ne $_.Hash
    }).Count -eq 0
    CompatibilityLinks=$taskAliases
}
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskDevelopment 'verification/layout-migration.json')
if (-not ($taskReport.SourceFilesPreserved -and $taskReport.LibraryUnchanged -and $taskReport.ExeUnchanged -and $taskReport.ArchivesUnchanged)) {
    throw 'Migration verification failed; preserve layout-migration-baseline.json for recovery.'
}
$taskReport | ConvertTo-Json -Depth 5
