'use strict';

const graphicalStyleLabels=Object.freeze({default:'Default',...Object.fromEntries(nativeConsoleCatalog.map(x=>[x.id,x.label]))});
const graphicalStyleIds=Object.keys(graphicalStyleLabels);
const graphicalStyleStorageKey='ds-companion:graphical-style';
let graphicalStyleRevision=0,graphicalStyleBusy=false,graphicalStyle='default',graphicalStyleRefreshNeeded=false,graphicalStyleFailedChoice=null;
const canonicalGraphicalStyle=value=>graphicalStyleIds.includes(value)?value:'default';
function applyGraphicalStyle(value){
 graphicalStyle=canonicalGraphicalStyle(value);
 document.documentElement.dataset.graphicalStyle=graphicalStyle;
 if(nativeConsoleCatalog.some(x=>x.id===graphicalStyle))document.documentElement.dataset.nativeConsole=graphicalStyle;
 else delete document.documentElement.dataset.nativeConsole;
 try{localStorage.setItem(graphicalStyleStorageKey,graphicalStyle);}catch{/* Server settings remain authoritative without browser storage. */}
 document.querySelectorAll('[name="graphical-style"]').forEach(input=>{input.checked=input.value===graphicalStyle;input.disabled=graphicalStyleBusy;});
}
function mergeGraphicalStyleSettings(settings,requestRevision=graphicalStyleRevision){
 if(!settings)return;
 if(graphicalStyleBusy||requestRevision!==graphicalStyleRevision)settings.graphicalStyle=graphicalStyle;
 else{
  applyGraphicalStyle(settings.graphicalStyle);graphicalStyleRefreshNeeded=false;
  if(graphicalStyleFailedChoice===graphicalStyle){document.getElementById('appearance-status').textContent='';graphicalStyleFailedChoice=null;}
 }
}
async function saveGraphicalStyle(value){
 if(graphicalStyleBusy||!graphicalStyleIds.includes(value)||value===graphicalStyle)return;
 const previous=graphicalStyle;graphicalStyleBusy=true;graphicalStyleRevision++;graphicalStyleFailedChoice=null;applyGraphicalStyle(value);
 const status=document.getElementById('appearance-status');status.textContent='';
 try{
  const result=await api('appearance',{style:value});
  if(result?.style!==value)throw new Error('The appearance could not be saved.');
  if(state?.library?.settings)state.library.settings.graphicalStyle=value;
 }catch(error){
  graphicalStyleFailedChoice=value;
  applyGraphicalStyle(previous);if(state?.library?.settings)state.library.settings.graphicalStyle=previous;
  status.textContent=typeof translateInterfaceText==='function'?translateInterfaceText('The appearance could not be saved.'): 'The appearance could not be saved.';
 }finally{
  graphicalStyleBusy=false;graphicalStyleRevision++;applyGraphicalStyle(graphicalStyle);
  // A racing snapshot or a committed write with a lost response must not pin
  // optimistic appearance to the server's newest library version.
  graphicalStyleRefreshNeeded=true;void refresh();
 }
}
(()=>{
 try{graphicalStyle=canonicalGraphicalStyle(localStorage.getItem(graphicalStyleStorageKey));}catch{}
 const language=document.getElementById('settings-language');
 if(language){
  const picker=document.createElement('fieldset');picker.className='appearance-picker';
  const effects=`<div class="appearance-effects-preview"><div class="appearance-effects-heading"><span>Live theme effects</span><button type="button" class="button ghost" data-ui-motion-preview>Preview theme effects</button></div><div class="appearance-effects-stage" data-theme-vfx-preview aria-hidden="true"></div><small>Effects pause outside the active window and follow system motion settings</small></div>`;
  picker.innerHTML=`<legend><span>Graphical style</span> <small>Saved automatically</small></legend>${effects}<div class="appearance-options">${graphicalStyleIds.map(id=>`<label class="appearance-choice" data-style-preview="${id}"><input type="radio" name="graphical-style" value="${id}"><span class="appearance-thumbnail" aria-hidden="true"><img src="/themes/previews/${id}.webp" alt="" width="600" height="336" decoding="async"></span><span>${graphicalStyleLabels[id]}</span></label>`).join('')}</div><p id="appearance-status" role="status" aria-live="polite"></p>`;
  language.after(picker);
  picker.addEventListener('change',event=>{if(event.target.name==='graphical-style')void saveGraphicalStyle(event.target.value);});
 }
 applyGraphicalStyle(graphicalStyle);
 if(typeof state!=='undefined'&&state?.library?.settings)mergeGraphicalStyleSettings(state.library.settings);
})();
