$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskArchive=Join-Path $taskRoot 'share/DirectStrikeCompanion-2026-10-07-site-sounds-portable.zip'
$taskPortable=[IO.Path]::GetFullPath((Join-Path $taskRoot 'portable'))+[IO.Path]::DirectorySeparatorChar
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskChecked=0
try {
    foreach($taskEntry in $taskZip.Entries){
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
        if($taskHash -ne (Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash){throw "Archive hash mismatch: $($taskEntry.FullName)"}
        $taskChecked++
    }
    if(-not $taskZip.GetEntry('DirectStrikeCompanion/wwwroot/site-history.js')){throw 'Online history asset missing.'}
} finally { $taskZip.Dispose() }
$taskResult=[ordered]@{Created=[DateTime]::UtcNow.ToString('o');EntriesChecked=$taskChecked;PrivateEntries=0;AllMatch=$true;Bytes=(Get-Item -LiteralPath $taskArchive).Length;SHA256=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash}
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'site-sounds-archive.json')
$taskResult | ConvertTo-Json -Compress
