param([Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskStatus=git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'This source folder must be a Git repository.' }
if (@($taskStatus).Count -ne 0) { throw 'Commit your source changes before publishing a release.' }
$taskRepoText=gh repo view --json nameWithOwner,isPrivate
if ($LASTEXITCODE -ne 0) { throw 'Sign in with gh auth login before publishing.' }
$taskRepo=$taskRepoText | ConvertFrom-Json
if (!$taskRepo.isPrivate) { throw 'Expected a private GitHub repository.' }
$taskProject=[xml](Get-Content -LiteralPath DirectStrikeCompanion.csproj -Raw)
if ($taskProject.Project.PropertyGroup.UpdateRepository -ne $taskRepo.nameWithOwner) { throw 'The repository does not match the configured update channel.' }
if ([version]$Version -lt [version]$taskProject.Project.PropertyGroup.Version) { throw 'Release versions cannot go backwards.' }
$taskTag='v'+$Version
git show-ref --verify --quiet ('refs/tags/'+$taskTag)
if ($LASTEXITCODE -eq 0) { throw 'This version tag already exists. Publish a new version.' }
if ($taskProject.Project.PropertyGroup.Version -ne $Version) {
    $taskText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'DirectStrikeCompanion.csproj'))
    $taskText=[regex]::Replace($taskText,'<Version>[^<]+</Version>',('<Version>'+$Version+'</Version>'))
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'DirectStrikeCompanion.csproj'),$taskText)
    git add -- DirectStrikeCompanion.csproj
    git commit -m ('Release '+$taskTag)
    if ($LASTEXITCODE -ne 0) { throw 'Could not commit the release version.' }
}
git push origin HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not push source; no release tag was published.' }
git tag -a $taskTag -m ('Direct Strike Companion '+$taskTag)
if ($LASTEXITCODE -ne 0) { throw 'Could not create the release tag.' }
git push origin $taskTag
if ($LASTEXITCODE -ne 0) { throw 'Could not push the release tag. The local tag remains for review.' }
Write-Output ('GitHub Actions will test and publish '+$taskTag+' to '+$taskRepo.nameWithOwner+'.')
