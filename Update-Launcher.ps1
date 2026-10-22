$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'InstallationPaths.ps1')
$paths = Get-InstallationPaths $PSScriptRoot
$installRoot = $paths.InstallRoot
$sourceExe = Join-Path $installRoot 'Direct Strike Companion.exe'
$sourceIcon = Join-Path $paths.SourceRoot 'assets\companion.ico'
$sourcePreview = Join-Path $paths.SourceRoot 'assets\companion.png'
foreach ($source in @($sourceExe, $sourceIcon, $sourcePreview, (Join-Path $paths.SourceRoot 'Start.vbs'))) {
    $null = Assert-InstallationChildPath $installRoot $source
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required launcher source is missing: $source" }
}
$launchFolder = Assert-InstallationChildPath $installRoot $paths.LauncherRoot
$launchExe = Assert-InstallationChildPath $installRoot (Join-Path $launchFolder 'START - Direct Strike Companion.exe')
$icon = Assert-InstallationChildPath $installRoot (Join-Path $launchFolder 'app.ico')
$preview = Assert-InstallationChildPath $installRoot (Join-Path $launchFolder 'App preview.png')
$instructions = Assert-InstallationChildPath $installRoot (Join-Path $launchFolder 'START HERE.txt')
$rootInstructions = Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'START HERE.txt')
$desktopIni = Assert-InstallationChildPath $installRoot (Join-Path $launchFolder 'desktop.ini')
$rootIni = Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'desktop.ini')
$rootVbs = Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'Start.vbs')
$shortcutPaths = @(
    (Assert-InstallationChildPath $installRoot (Join-Path $installRoot '00 - START Direct Strike Companion.lnk')),
    (Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'Direct Strike Companion.lnk'))
)
$dataPath = Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'data')
$webHostPath = Assert-InstallationChildPath $installRoot (Join-Path $installRoot 'wwwroot')
New-Item -ItemType Directory -Path $webHostPath -Force | Out-Null
Add-HiddenAttribute $webHostPath
New-Item -ItemType Directory -Path $launchFolder -Force | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination $launchExe -Force
Copy-Item -LiteralPath $sourceIcon -Destination $icon -Force
Copy-Item -LiteralPath $sourcePreview -Destination $preview -Force
@'
DIRECT STRIKE COMPANION

English
Double-click Direct Strike Companion.exe in the main folder to open the dashboard.
Closing the app window (x) fully exits the app.
To keep watching, choose Hide dashboard - keep watching from the tray menu.
Double-click the tray icon to reopen it; tray Exit fully stops the app.
Support contains development files, older versions and compatibility launcher resources.

Русский
Дважды нажмите Direct Strike Companion.exe в главной папке, чтобы открыть приложение.
Закрытие окна (x) полностью завершает приложение.
Для фонового наблюдения выберите «Скрыть панель · продолжить наблюдение» в меню трея.
Дважды нажмите значок в трее, чтобы открыть окно снова.
Чтобы закрыть приложение, нажмите значок правой кнопкой и выберите Выход / Exit.
В папке Support находятся исходники, старые версии и файлы совместимости.
'@ | Set-Content -LiteralPath $rootInstructions -Encoding UTF8
@'
DIRECT STRIKE COMPANION

English
Double-click START - Direct Strike Companion.exe to open the dashboard.
Closing the app window (x) fully exits the app.
To keep watching, choose Hide dashboard - keep watching from the tray menu.
Double-click the tray icon to reopen it; tray Exit fully stops the app.

Русский
Дважды нажмите START - Direct Strike Companion.exe, чтобы открыть приложение.
Закрытие окна (x) полностью завершает приложение.
Для фонового наблюдения выберите «Скрыть панель · продолжить наблюдение» в меню трея.
Дважды нажмите значок в трее, чтобы открыть окно снова.
Чтобы закрыть приложение, нажмите значок правой кнопкой и выберите Выход / Exit.
'@ | Set-Content -LiteralPath $instructions -Encoding UTF8

function Set-FolderIcon([string]$Folder, [string]$Ini, [string]$IconReference) {
    $oldAttributes = [IO.FileAttributes]::Normal
    if (Test-Path -LiteralPath $Ini) {
        $iniItem = Get-Item -LiteralPath $Ini -Force
        $oldAttributes = $iniItem.Attributes
        $iniItem.Attributes = $oldAttributes -band (-bnot [IO.FileAttributes]::ReadOnly)
    }
    "[.ShellClassInfo]`r`nIconResource=$IconReference,0`r`nInfoTip=Direct Strike Companion`r`n" |
        Set-Content -LiteralPath $Ini -Encoding Unicode -Force
    (Get-Item -LiteralPath $Ini -Force).Attributes = $oldAttributes -bor [IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System
    $folderItem = Get-Item -LiteralPath $Folder -Force
    $folderItem.Attributes = $folderItem.Attributes -bor [IO.FileAttributes]::ReadOnly
}
Set-FolderIcon $launchFolder $desktopIni 'app.ico'
Set-FolderIcon $installRoot $rootIni 'Support\Launcher resources\app.ico'
Add-HiddenAttribute $icon
$shell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in $shortcutPaths) {
    $shortcutAttributes = [IO.FileAttributes]::Archive
    if (Test-Path -LiteralPath $shortcutPath) { $shortcutAttributes = (Get-Item -LiteralPath $shortcutPath -Force).Attributes }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $sourceExe
    $shortcut.Arguments = ''
    $shortcut.WorkingDirectory = $installRoot
    $shortcut.IconLocation = "$sourceExe,0"
    $shortcut.Description = 'Open Direct Strike Companion; use the system tray to reopen or exit.'
    $shortcut.WindowStyle = 1
    $shortcut.Save()
    (Get-Item -LiteralPath $shortcutPath -Force).Attributes = $shortcutAttributes -bor [IO.FileAttributes]::Hidden
}
$vbsAttributes = [IO.FileAttributes]::Archive
if (Test-Path -LiteralPath $rootVbs) { $vbsAttributes = (Get-Item -LiteralPath $rootVbs -Force).Attributes }
if ($rootVbs -ne (Join-Path $paths.SourceRoot 'Start.vbs')) {
    Copy-Item -LiteralPath (Join-Path $paths.SourceRoot 'Start.vbs') -Destination $rootVbs -Force
}
(Get-Item -LiteralPath $rootVbs -Force).Attributes = $vbsAttributes -bor [IO.FileAttributes]::Hidden
if (Test-Path -LiteralPath $dataPath) { Add-HiddenAttribute $dataPath }
Write-Output "Launcher refreshed: $sourceExe"

