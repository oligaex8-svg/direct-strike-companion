$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public sealed class InactiveCaptionPreview : Form {
 protected override bool ShowWithoutActivation { get { return true; } }
 protected override CreateParams CreateParams { get { var p=base.CreateParams;p.ExStyle|=0x08000000;return p; } }
 [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int n);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int hgt,uint flags);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSource=[IO.File]::ReadAllText((Join-Path $taskRoot 'DashboardWindow.cs'))
$taskMatch=[regex]::Match($taskSource,'DashboardCaptionBackground = Color.FromArgb\((\d+), (\d+), (\d+)\)')
if(!$taskMatch.Success){throw 'Caption color unavailable.'}
$taskColor=[Drawing.Color]::FromArgb([int]$taskMatch.Groups[1].Value,[int]$taskMatch.Groups[2].Value,[int]$taskMatch.Groups[3].Value)
$taskForeground=[InactiveCaptionPreview]::GetForegroundWindow()
$taskForm=[InactiveCaptionPreview]::new()
$taskImage=[Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'profile-polish-1440-en.png'))
$taskBitmap=$null
try {
 $taskForm.Text='Direct Strike Companion';$taskForm.ShowInTaskbar=$false
 $taskForm.StartPosition='Manual';$taskForm.Location=[Drawing.Point]::new(([Windows.Forms.SystemInformation]::VirtualScreen.Right+100),0)
 $taskForm.ClientSize=[Drawing.Size]::new(1280,978)
 $taskForm.BackColor=[Drawing.Color]::FromArgb(11,17,27)
 $taskForm.BackgroundImage=$taskImage;$taskForm.BackgroundImageLayout='Stretch'
 $taskIcon=[Drawing.Icon]::ExtractAssociatedIcon((Join-Path $taskRoot 'release/DirectStrikeCompanion.exe'))
 $taskForm.Icon=$taskIcon
 $taskHandle=$taskForm.Handle;$taskDark=1;$taskCaption=[Drawing.ColorTranslator]::ToWin32($taskColor);$taskText=[Drawing.ColorTranslator]::ToWin32([Drawing.Color]::FromArgb(226,234,244))
 foreach($taskAttribute in @(20,35,36)){
  $taskValue=switch($taskAttribute){20{$taskDark};35{$taskCaption};36{$taskText}}
  if([InactiveCaptionPreview]::DwmSetWindowAttribute($taskHandle,$taskAttribute,[ref]$taskValue,4) -lt 0){throw 'Windows rejected the caption preview.'}
 }
 $taskForm.Show()
 $null=[InactiveCaptionPreview]::SetWindowPos($taskHandle,[IntPtr]1,$taskForm.Left,$taskForm.Top,$taskForm.Width,$taskForm.Height,0x0010)
 [Windows.Forms.Application]::DoEvents()
 $taskBitmap=[Drawing.Bitmap]::new($taskForm.Width,$taskForm.Height)
 $taskGraphics=[Drawing.Graphics]::FromImage($taskBitmap)
 try {$taskDc=$taskGraphics.GetHdc();try {if(![InactiveCaptionPreview]::PrintWindow($taskHandle,$taskDc,2)){throw 'Native preview capture failed.'}}finally{$taskGraphics.ReleaseHdc($taskDc)}}finally{$taskGraphics.Dispose()}
 $taskOutput=Join-Path $PSScriptRoot 'titlebar-contrast-native-preview.png'
 $taskBitmap.Save($taskOutput,[Drawing.Imaging.ImageFormat]::Png)
 if([InactiveCaptionPreview]::GetForegroundWindow() -ne $taskForeground){throw 'Preview changed foreground focus.'}
 [pscustomobject]@{Success=$true;Screenshot=$taskOutput;CaptionColor=$taskColor.Name;FocusPreserved=$true;Scope='Native Windows frame with a static production-profile sample preview'}|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'titlebar-contrast-native-preview.json')
}finally{if($taskBitmap){$taskBitmap.Dispose()};$taskForm.Dispose();$taskImage.Dispose();if($taskIcon){$taskIcon.Dispose()}}
