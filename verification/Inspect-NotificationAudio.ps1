param([switch]$UnmuteCompanion,[switch]$TestPlayback)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CompanionAudioInspection {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Devices {
  int EnumAudioEndpoints(int flow,uint state,out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out Device device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Device {
  [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object value);
  int OpenPropertyStore(uint mode,out IntPtr properties);
  int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
 }
 [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Manager {
  int GetAudioSessionControl(IntPtr guid,uint flags,out IntPtr control);
  int GetSimpleAudioVolume(IntPtr guid,uint flags,out IntPtr volume);
  int GetSessionEnumerator(out Sessions sessions);
 }
 [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Sessions {
  int GetCount(out int count);int GetSession(int index,out Control control);
 }
 [ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Control {
  int GetState(out int state);int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);
  int SetDisplayName(string name,IntPtr context);int GetIconPath(out IntPtr path);int SetIconPath(string path,IntPtr context);
  int GetGroupingParam(out Guid group);int SetGroupingParam(ref Guid group,IntPtr context);
  int RegisterAudioSessionNotification(IntPtr notification);int UnregisterAudioSessionNotification(IntPtr notification);
  int GetSessionIdentifier(out IntPtr id);int GetSessionInstanceIdentifier(out IntPtr id);int GetProcessId(out uint pid);
 }
 [ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Volume {
  int SetMasterVolume(float level,ref Guid context);int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
 }
 [ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface EndpointVolume {
  int RegisterControlChangeNotify(IntPtr value);int UnregisterControlChangeNotify(IntPtr value);int GetChannelCount(out uint count);
  int SetMasterVolumeLevel(float value,IntPtr context);int SetMasterVolumeLevelScalar(float value,IntPtr context);
  int GetMasterVolumeLevel(out float value);int GetMasterVolumeLevelScalar(out float value);
  int SetChannelVolumeLevel(uint channel,float value,IntPtr context);int SetChannelVolumeLevelScalar(uint channel,float value,IntPtr context);
  int GetChannelVolumeLevel(uint channel,out float value);int GetChannelVolumeLevelScalar(uint channel,out float value);
  int SetMute(bool value,IntPtr context);int GetMute([MarshalAs(UnmanagedType.Bool)]out bool value);
 }
 [ComImport,Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Meter {int GetPeakValue(out float peak);}
 public sealed class Session {public uint Pid;public int State;public float Volume;public bool Muted;public bool Repaired;public float Peak;}
 public sealed class Endpoint {public int Role;public string Id;public float Volume;public bool Muted;public List<Session> Sessions=new List<Session>();}
 public static List<Endpoint> Read(uint[] companionPids,bool repair) {
  var results=new List<Endpoint>();var ids=new HashSet<string>();var enumerator=(Devices)new Enumerator();
  try {for(int role=0;role<3;role++) {
   Device device;if(enumerator.GetDefaultAudioEndpoint(0,role,out device)!=0)continue;
   try {string id;device.GetId(out id);if(!ids.Add(id))continue;var endpoint=new Endpoint{Role=role,Id=id};
    object raw;var iid=typeof(EndpointVolume).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out raw));
    try {var volume=(EndpointVolume)raw;volume.GetMasterVolumeLevelScalar(out endpoint.Volume);volume.GetMute(out endpoint.Muted);}finally{Marshal.ReleaseComObject(raw);}
    iid=typeof(Manager).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out raw));
    try {Sessions sessions;((Manager)raw).GetSessionEnumerator(out sessions);
     try {int count;sessions.GetCount(out count);for(int n=0;n<count;n++){Control control;sessions.GetSession(n,out control);
      try {var session=new Session();control.GetProcessId(out session.Pid);control.GetState(out session.State);var volume=(Volume)control;
       volume.GetMasterVolume(out session.Volume);volume.GetMute(out session.Muted);
       try{((Meter)control).GetPeakValue(out session.Peak);}catch(InvalidCastException){session.Peak=-1;}
       if(repair&&Array.IndexOf(companionPids,session.Pid)>=0&&(session.Muted||session.Volume==0)){
        var context=Guid.Empty;if(session.Muted)volume.SetMute(false,ref context);if(session.Volume==0)volume.SetMasterVolume(1,ref context);session.Repaired=true;
       }endpoint.Sessions.Add(session);
      }finally{Marshal.ReleaseComObject(control);}
     }}finally{Marshal.ReleaseComObject(sessions);}
    }finally{Marshal.ReleaseComObject(raw);}results.Add(endpoint);
   }finally{Marshal.ReleaseComObject(device);}
  }}finally{Marshal.ReleaseComObject(enumerator);}return results;
 }
}
'@
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$taskUrl=(Get-Content -LiteralPath (Join-Path $taskRoot 'data/running-url.txt') -Raw).Trim()
$taskPort=([uri]$taskUrl).Port
$taskCompanionIds=@(Get-NetTCPConnection -LocalPort $taskPort -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
$taskBefore=[CompanionAudioInspection]::Read([uint[]]$taskCompanionIds,$false)
if($UnmuteCompanion){$null=[CompanionAudioInspection]::Read([uint[]]$taskCompanionIds,$true)}
$taskAfter=if($UnmuteCompanion){[CompanionAudioInspection]::Read([uint[]]$taskCompanionIds,$false)}else{$null}
$taskPeak=$null
if($TestPlayback){
 $null=Invoke-RestMethod -Uri ($taskUrl.TrimEnd('/')+'/api/sounds/preview') -Method Post -Headers @{'X-DS-Companion'='1'} -ContentType 'application/json' -Body '{"cue":"accept","preset":"sc2-ru-pylons","volume":50,"builtIn":true}' -TimeoutSec 5
 $taskPeak=0.0
 for($taskSample=0;$taskSample -lt 40;$taskSample++){
  Start-Sleep -Milliseconds 50
  foreach($taskEndpoint in [CompanionAudioInspection]::Read([uint[]]$taskCompanionIds,$false)){
   foreach($taskSession in $taskEndpoint.Sessions){if($taskSession.Pid -in $taskCompanionIds){$taskPeak=[Math]::Max($taskPeak,$taskSession.Peak)}}
  }
 }
}
$taskReport=[pscustomobject]@{At=[DateTime]::UtcNow.ToString('o');CompanionPids=$taskCompanionIds;Before=$taskBefore;After=$taskAfter;RepairRequested=[bool]$UnmuteCompanion;PlaybackTest=[bool]$TestPlayback;CompanionPeak=$taskPeak}
$taskReport | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $PSScriptRoot 'notification-audio-mixer.json')
$taskReport | ConvertTo-Json -Depth 6
