Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
If LCase(files.GetFileName(root)) = "development" Then
    support = files.GetParentFolderName(root)
    If LCase(files.GetFileName(support)) = "support" Then root = files.GetParentFolderName(support)
End If
app = root & "\Direct Strike Companion.exe"
If Not files.FileExists(app) Then
    shell.Popup "Direct Strike Companion.exe is missing from the installation folder.", 0, "Direct Strike Companion", 16
    WScript.Quit 1
End If
shell.CurrentDirectory = root
shell.Run Chr(34) & app & Chr(34), 0, False
