' 双击启动 Miku 桌宠（不显示命令行窗口）
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & sh.CurrentDirectory & "\node_modules\electron\dist\electron.exe"" .", 0, False
