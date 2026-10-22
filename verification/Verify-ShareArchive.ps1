$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskVersion='2026-10-07-hover-teams'
$taskArchive=Join-Path $taskRoot "share/DirectStrikeCompanion-$taskVersion-portable.zip"
$taskPortable=[IO.Path]::GetFullPath((Join-Path $taskRoot 'portable'))+[IO.Path]::DirectorySeparatorChar
$taskExtracted=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot "package-validation/$taskVersion"))
$taskValidationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'package-validation'))+[IO.Path]::DirectorySeparatorChar
if(-not $taskExtracted.StartsWith($taskValidationRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Extraction target is outside the validation directory.'}
if(Test-Path -LiteralPath $taskExtracted){throw 'Extraction target already exists; do not overwrite it.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-ArchiveFileHash([string]$taskPath){
    $taskHasher=[Security.Cryptography.SHA256]::Create();$taskInput=[IO.File]::OpenRead($taskPath)
    try{[BitConverter]::ToString($taskHasher.ComputeHash($taskInput)).Replace('-','')}finally{$taskInput.Dispose();$taskHasher.Dispose()}
}
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskChecked=0
$taskExpected=@(Get-ChildItem -LiteralPath $taskPortable -File -Recurse | Where-Object {-not $_.FullName.Substring($taskPortable.Length).Replace([IO.Path]::DirectorySeparatorChar,[char]'/').StartsWith('test-output/')}).Count+1
$taskNames=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
try {
    foreach($taskEntry in $taskZip.Entries){
        if(-not $taskNames.Add($taskEntry.FullName)){throw 'Duplicate archive entry.'}
        if($taskEntry.FullName -match '(^|/)(data|\.sdk|obj|bin|verification|test-output)(/|$)|(^|/)(library\.json(\.bak)?|running-url\.txt)$|\.SC2Replay$'){throw 'Private/development entry in archive.'}
        if($taskEntry.FullName -eq 'START-HERE.txt'){$taskTarget=Join-Path $taskRoot 'share/START-HERE-PORTABLE.txt'}
        else {
            if(-not $taskEntry.FullName.StartsWith('DirectStrikeCompanion/')){throw 'Unexpected archive root.'}
            $taskRelative=$taskEntry.FullName.Substring('DirectStrikeCompanion/'.Length)
            $taskTarget=[IO.Path]::GetFullPath((Join-Path $taskPortable $taskRelative))
            if(-not $taskTarget.StartsWith($taskPortable,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe archive path.'}
        }
        $taskSha=[Security.Cryptography.SHA256]::Create();$taskStream=$taskEntry.Open()
        try{$taskHash=[BitConverter]::ToString($taskSha.ComputeHash($taskStream)).Replace('-','')}finally{$taskStream.Dispose();$taskSha.Dispose()}
        if($taskHash -ne (Read-ArchiveFileHash $taskTarget)){throw "Archive hash mismatch: $($taskEntry.FullName)"}
        $taskChecked++
    }
    if($taskChecked -ne $taskExpected){throw 'Archive entry count does not match the published files.'}
    foreach($taskFile in @('picks-hover.js','picks-view.js','lobby.js','lobby.css','ru-ui.js','index.html')){
        if(-not $taskZip.GetEntry("DirectStrikeCompanion/wwwroot/$taskFile")){throw "Missing UI asset: $taskFile"}
        if((Read-ArchiveFileHash (Join-Path $taskPortable "wwwroot/$taskFile")) -ne (Read-ArchiveFileHash (Join-Path $taskRoot "wwwroot/$taskFile"))){throw "Published UI asset is stale: $taskFile"}
    }
    if($taskZip.GetEntry('DirectStrikeCompanion/DirectStrikeCompanion.csproj')){throw 'Development project file should not ship.'}
} finally { $taskZip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($taskArchive,$taskExtracted)
$taskResult=[ordered]@{Created=[DateTime]::UtcNow.ToString('o');Archive=$taskArchive;EntriesChecked=$taskChecked;PrivateEntries=0;AllMatch=$true;CurrentUiAssets=$true;Extracted=$taskExtracted;Bytes=(Get-Item -LiteralPath $taskArchive).Length;SHA256=(Read-ArchiveFileHash $taskArchive)}
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'share-archive.json')
$taskResult | ConvertTo-Json -Compress
