function Get-InstallationPaths([string]$SourceRoot) {
    $source = [IO.Path]::GetFullPath($SourceRoot).TrimEnd([char[]]'\/')
    $parent = Split-Path -Parent $source
    if ((Split-Path -Leaf $source) -eq 'Development' -and (Split-Path -Leaf $parent) -eq 'Support') {
        $install = Split-Path -Parent $parent
        $organized = $true
    } else {
        $install = $source
        $organized = $false
    }
    if (-not (Test-Path -LiteralPath (Join-Path $source 'DirectStrikeCompanion.csproj') -PathType Leaf)) {
        throw "Project source is missing: $source"
    }
    [pscustomobject]@{
        SourceRoot = $source
        InstallRoot = $install
        Organized = $organized
        LauncherRoot = Join-Path $install 'Support\Launcher resources'
        ShareRoot = $(if ($organized) { Join-Path $install 'Support\Older versions\share' } else { Join-Path $install 'share' })
    }
}

# Reject redirected children, including existing ancestors of a not-yet-created file.
# The installation itself may be reached through the historical compatibility junction.
function Assert-InstallationChildPath([string]$InstallRoot, [string]$Path) {
    $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd([char[]]'\/')
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = $root + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the installation: $full"
    }
    $current = $root
    foreach ($part in $full.Substring($prefix.Length).Split([char[]]'\/')) {
        $current = Join-Path $current $part
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Path may not use a redirected child: $current"
            }
        }
    }
    return $full
}

function Assert-InstallationOutputTree([string]$InstallRoot, [string]$Path) {
    $full = Assert-InstallationChildPath $InstallRoot $Path
    if (-not (Test-Path -LiteralPath $full)) { return }
    $pending = [Collections.Generic.Queue[string]]::new()
    $pending.Enqueue($full)
    while ($pending.Count -gt 0) {
        foreach ($item in (Get-ChildItem -LiteralPath $pending.Dequeue() -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Output tree may not contain redirected children: $($item.FullName)"
            }
            if ($item.PSIsContainer) { $pending.Enqueue($item.FullName) }
        }
    }
}

function Add-HiddenAttribute([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    $item.Attributes = $item.Attributes -bor [IO.FileAttributes]::Hidden
}
