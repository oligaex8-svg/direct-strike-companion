$ErrorActionPreference='Stop'
$taskWork=Join-Path $PSScriptRoot 'russian-sound-work'
Set-Location -LiteralPath $taskWork
[Reflection.Assembly]::LoadFrom((Join-Path $taskWork 'CascLib.Managed.dll'))|Out-Null
[CASCLib.CASCConfig]::LoadFlags=[CASCLib.LoadFlags]::None
[CASCLib.CASCConfig]::ValidateData=$true
$taskStorage=$null
try {
    $taskStorage=[CASCLib.CASCHandler]::OpenLocalStorage('C:/Program Files (x86)/StarCraft II','s2',$null)
    $taskStorage.Root.LoadListFile($null,$null)
    $taskRoot=$taskStorage.Root.SetFlags([CASCLib.LocaleFlags]::ruRU,$false,$false)
    $taskNames=@([CASCLib.CASCFile]::Files.Values|Where-Object {$_.FullName -match '(?i)mods[\\/]liberty.sc2mod[\\/]ruru.sc2assets[\\/].*(Alert_|(Marine|SCV|Zealot|Stalker)_(Ready00|What00)).*\.(ogg|wav)$'}|ForEach-Object {$_.FullName}|Sort-Object|Select-Object -First 100)
    $taskNames|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskWork 'local-russian-audio-names.json')
    [pscustomobject]@{RootType=$taskStorage.Root.GetType().Name;RootCount=$taskStorage.Root.Count;RussianNames=$taskNames.Count;Names=@($taskNames|Select-Object -First 12)}|ConvertTo-Json
    foreach($taskName in $taskNames){
        $taskLeaf=[IO.Path]::GetFileName($taskName)
        if($taskLeaf -notmatch '^[A-Za-z0-9_]+\.(ogg|wav)$'){continue}
        $taskOut=Join-Path $taskWork ('local-ru-'+$taskLeaf)
        if(Test-Path -LiteralPath $taskOut){continue}
        $taskInput=$null
        try {
            $taskInput=$taskStorage.OpenFile($taskName)
            if(!$taskInput -or $taskInput.Length -gt 2MB -or $taskInput.Length -le 0){continue}
            $taskOutput=[IO.File]::Create($taskOut)
            try {$taskInput.CopyTo($taskOutput)}finally{$taskOutput.Dispose()}
            [pscustomobject]@{GamePath=$taskName;SourceFile=[IO.Path]::GetFileName($taskOut)}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $taskWork 'local-russian-audio.jsonl')
        } catch {Write-Warning ($taskLeaf+': '+$_.Exception.Message)}
        finally{if($taskInput){$taskInput.Dispose()}}
    }
} finally {
    # The old package's Clear assumes optional install/tree objects were loaded.
    # Release its read-only maps directly; the contained helper then exits.
    if($taskStorage){
        $taskMaps=[CASCLib.CASCHandlerBase].GetField('DataStreams',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($taskStorage)
        foreach($taskMap in $taskMaps.Values){$taskMap.Dispose()}
        $taskMaps.Clear()
    }
}
