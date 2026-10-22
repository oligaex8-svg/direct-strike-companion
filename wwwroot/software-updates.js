'use strict';
let softwareUpdateUiBusy=false,softwareUpdateUiError='',softwareUpdateLastStatus=null;
const updateText=value=>typeof translateInterfaceText==='function'?translateInterfaceText(value):value;
const softwareUpdateNotices=new Set();
try{for(const key of JSON.parse(sessionStorage.getItem('dsc-update-notices')||'[]'))if(typeof key==='string')softwareUpdateNotices.add(key);}catch{}
function rememberSoftwareUpdate(status){
 if(!status?.availableVersion)return;
 softwareUpdateNotices.add(status.repository+'|'+status.availableVersion);
 try{sessionStorage.setItem('dsc-update-notices',JSON.stringify([...softwareUpdateNotices].slice(-20)));}catch{}
}
function maybePromptSoftwareUpdate(){
 const status=softwareUpdateLastStatus,prompt=document.getElementById('update-prompt-dialog');
 if(!status||status.state!=='available'||!status.availableVersion||!prompt||softwareUpdateUiBusy
  ||document.visibilityState!=='visible'||['match','loading','replay'].includes(state?.lobby?.phase)
  ||document.querySelector('dialog[open]')||softwareUpdateNotices.has(status.repository+'|'+status.availableVersion))return;
 document.getElementById('update-prompt-version').textContent=updateText('Available version')+': '+status.availableVersion;
 rememberSoftwareUpdate(status);prompt.showModal();
}
function renderSoftwareUpdateStatus(value){
 if(value)softwareUpdateLastStatus=value;
 const status=softwareUpdateLastStatus,dialog=document.getElementById('updates-dialog');if(!status||!dialog)return;
 document.getElementById('updates-version').textContent=updateText('Installed version')+': '+status.currentVersion+(status.availableVersion?' · '+updateText('Available version')+': '+status.availableVersion:'');
 document.getElementById('updates-repository').textContent=status.repository||'';
 const message=document.getElementById('updates-status');message.textContent=updateText(softwareUpdateUiError||status.message);message.classList.toggle('update-error',!!softwareUpdateUiError||status.state==='error');
 const busy=softwareUpdateUiBusy||['checking','downloading','restarting'].includes(status.state);
 document.getElementById('sidebar-updates').disabled=busy;
 document.getElementById('update-prompt-now').disabled=busy||status.state!=='available';
 const prompt=document.getElementById('update-prompt-dialog');
 if(prompt.open&&status.state==='available'){
  document.getElementById('update-prompt-version').textContent=updateText('Available version')+': '+status.availableVersion;
  rememberSoftwareUpdate(status);
 }else if(prompt.open&&!busy)prompt.close();
 const badge=document.getElementById('update-available');badge.hidden=!status.availableVersion;badge.textContent=' · '+updateText('New version');
 document.getElementById('updates-check').disabled=busy||!status.repository;
 document.getElementById('updates-install').hidden=!status.availableVersion;
 document.getElementById('updates-install').disabled=busy||status.state!=='available';
 for(const button of document.querySelectorAll('#updates-connect button'))button.disabled=busy;
 document.getElementById('updates-token').disabled=busy;
 document.getElementById('updates-disconnect').hidden=!status.connected;
 document.getElementById('updates-access').hidden=!status.repository;
 if(dialog.open)rememberSoftwareUpdate(status);
 maybePromptSoftwareUpdate();
}
async function softwareUpdateAction(action){
 if(softwareUpdateUiBusy)return;
 softwareUpdateUiBusy=true;softwareUpdateUiError='';renderSoftwareUpdateStatus();
 try{const value=await action();if(value?.currentVersion)renderSoftwareUpdateStatus(value);}
 catch(error){softwareUpdateUiError=error.message;}
 finally{softwareUpdateUiBusy=false;renderSoftwareUpdateStatus();}
}
function openSoftwareUpdates(){
 document.getElementById('updates-dialog').showModal();
 void softwareUpdateAction(async()=>{const status=await api('software-updates/status');document.getElementById('updates-access').open=false;return status.repository?api('software-updates/check',{}):status;});
}
document.getElementById('updates-open').addEventListener('click',openSoftwareUpdates);
document.getElementById('sidebar-updates').addEventListener('click',openSoftwareUpdates);
document.getElementById('updates-check').addEventListener('click',()=>void softwareUpdateAction(()=>api('software-updates/check',{})));
document.getElementById('updates-connect').addEventListener('submit',event=>{
 event.preventDefault();const input=document.getElementById('updates-token'),token=input.value;input.value='';
 void softwareUpdateAction(()=>api('software-updates/access',{token}));
});
document.getElementById('updates-disconnect').addEventListener('click',()=>void softwareUpdateAction(async()=>{
 const response=await fetch('/api/software-updates/access',{method:'DELETE',headers:{'X-DS-Companion':'1'}});
 if(!response.ok)throw new Error('Could not disconnect GitHub.');return response.json();
}));
async function installSoftwareUpdate(){
 const version=softwareUpdateLastStatus?.availableVersion;
 if(!version)throw new Error('Check for a newer release before installing.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5*60*1000);
 try{
  const response=await fetch('/api/software-updates/install',{method:'POST',signal:controller.signal,headers:{'X-DS-Companion':'1','Content-Type':'application/json'},body:JSON.stringify({version})});
  if(!response.ok){const value=await response.json();throw new Error(value.error||'Update could not be installed.');}
  renderSoftwareUpdateStatus({...softwareUpdateLastStatus,state:'restarting',message:'Restarting to install the verified update…'});
 }finally{clearTimeout(timer);}
}
document.getElementById('updates-install').addEventListener('click',()=>void softwareUpdateAction(installSoftwareUpdate));
document.getElementById('update-prompt-later').addEventListener('click',()=>document.getElementById('update-prompt-dialog').close());
document.getElementById('update-prompt-now').addEventListener('click',()=>{
 document.getElementById('update-prompt-dialog').close();document.getElementById('updates-dialog').showModal();
 void softwareUpdateAction(installSoftwareUpdate);
});
document.addEventListener('visibilitychange',maybePromptSoftwareUpdate);
document.addEventListener('close',()=>queueMicrotask(maybePromptSoftwareUpdate),true);
document.getElementById('updates-dialog').addEventListener('close',()=>{document.getElementById('updates-token').value='';});
