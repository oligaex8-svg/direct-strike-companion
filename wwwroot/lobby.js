'use strict';

let liveTeammateIds=new Set(),liveTeammateRosterKey='',liveTeammateBaseline=null,liveLobbyTeamChoices=new Map(),liveLobbyTeamRosterKey='';
let liveGameSoundSaving=false,liveGameSoundDraft=null,liveGameSoundError='',liveGameSoundConfirmed=null,liveGameSoundRevision=0;
const liveSiteProfileChoices=new Map();
const notificationSoundStyles=starcraftSoundLibrary.sounds.map(sound=>[sound.preset,sound.en]);
const notificationSoundEvents=[['accept','Accept needed'],['loading','Loading starts'],['loaded','Game loaded'],['marked','Marked player']];
const soundPlayIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 10 7-10 7Z" stroke-linejoin="round"/></svg>';
let liveCustomSounds={},liveCustomSoundBusy='',liveCustomSoundError='',liveCustomSoundLoaded=false,liveCustomSoundCheckedAt=0,liveCustomSoundReading=false,liveCustomSoundRevision=0;
let notificationSoundRefreshPending=false,notificationSoundRefreshQueued=false,notificationSoundPointerActive=false,notificationSoundPointerRevision=0;

function notificationSoundStyleOptions(selected,eventDefault=false){
 selected=eventDefault&&!selected?'':normalizeNotificationSoundPreset(selected);
 const groups=starcraftSoundLibrary.categories.map(category=>{
  const sounds=starcraftSoundLibrary.sounds.filter(sound=>sound.category===category.key);
  return sounds.length?`<optgroup label="${esc(category.en)}">${sounds.map(sound=>`<option value="${esc(sound.preset)}"${sound.preset===selected?' selected':''}>${esc(sound.en)}</option>`).join('')}</optgroup>`:'';
 }).join('');
 return (eventDefault?`<option value=""${!selected?' selected':''}>Use default sound</option>`:'')+groups;
}
function normalizeNotificationSoundPreset(preset){return notificationSoundStyles.some(([key])=>key===preset)?preset:'sc2-nuclear';}
function normalizeNotificationSoundStyles(styles){
 const result={};
 for(const [cue] of notificationSoundEvents)if(styles&&notificationSoundStyles.some(([key])=>key===styles[cue]))result[cue]=styles[cue];
 return result;
}

function normalizeCustomSoundInfo(server){
 const clips={};
 for(const [cue] of notificationSoundEvents){
  const item=server?.[cue];
  if(item&&typeof item.name==='string'&&item.name.length<=120&&Number.isFinite(item.seconds)&&item.seconds>0&&item.seconds<=5)clips[cue]={name:item.name,seconds:item.seconds};
 }
 return clips;
}

function renderCustomSoundControls(context='live'){
 const disabled=liveCustomSoundBusy?' disabled':'',styleDisabled=liveGameSoundSaving?' disabled':'',styles=liveGameSoundOptions().styles,status=liveCustomSoundError||liveGameSoundError||(liveGameSoundSaving?'Saving…':!liveCustomSoundLoaded?'Loading sound clips…':liveCustomSoundBusy?'Saving sound clip…':'');
 return `<details class="custom-sound-details" data-lobby-details-id="custom-sounds:${context}" open><summary>Sounds for each alert</summary><p class="live-controls-hint">Choose a game recording for each alert, or use the default sound.</p><p class="live-controls-hint">Custom WAV clips take priority. Remove a clip to use the selected game sound.</p><p class="live-controls-hint">WAV · up to 5 seconds / 2 MB · stored only on this PC</p><div class="custom-sound-list">${notificationSoundEvents.map(([cue,label])=>{
  const clip=liveCustomSounds[cue];
  return `<div class="custom-sound-row"><div class="custom-sound-name"><b>${label}</b><small>${clip?`<span data-i18n-skip title="${esc(clip.name)}">${esc(clip.name)}</span> · ${clip.seconds.toFixed(1)}s`:'<span>Built-in sound</span>'}</small></div><div class="custom-sound-actions"><label class="custom-sound-style"><span>Game sound</span><select data-sound-style="${cue}" data-sound-context="${context}" aria-label="Game sound: ${label}"${styleDisabled}>${notificationSoundStyleOptions(styles[cue],true)}</select></label><button type="button" class="live-sound-preview" data-sound-preview="${cue}" data-sound-context="${context}" title="Preview ${label.toLowerCase()} sound" aria-label="Preview ${label.toLowerCase()} sound"${disabled}>${soundPlayIcon}</button>${clip?`<button type="button" class="button ghost custom-sound-import" data-sound-preview="${cue}" data-sound-context="${context}" data-sound-built-in="true" aria-label="Built-in preview: ${label}"${disabled}>Built-in preview</button>`:''}<button type="button" class="button ghost custom-sound-import" data-sound-import="${cue}" data-sound-context="${context}" aria-label="Choose clip: ${label}"${disabled}>${clip?'Replace clip':'Choose clip'}</button>${clip?`<button type="button" class="live-sound-reset" data-sound-remove="${cue}" data-sound-context="${context}" aria-label="Use built-in: ${label}" title="Use built-in: ${label}"${disabled}>×</button>`:''}</div><input type="file" accept=".wav,audio/wav,audio/x-wav" data-sound-file="${cue}" data-sound-context="${context}" aria-label="WAV clip: ${label}" hidden></div>`;
 }).join('')}</div><p class="custom-sound-status${liveCustomSoundError||liveGameSoundError?' live-controls-error':''}" role="status">${esc(status)}</p>${liveCustomSoundError?'<button type="button" class="button ghost" data-sounds-retry>Retry sound clips</button>':''}</details>`;
}

function notificationSoundFocus(root){
 const active=document.activeElement;
 if(!active||!root.contains?.(active))return null;
 const details=active.closest('.custom-sound-details');
 if(active.matches('summary')&&details)return {summary:true,attribute:'data-lobby-details-id',value:details.dataset.lobbyDetailsId};
 const attribute=['data-sound-style','data-sound-import','data-sound-remove','data-sound-preview','data-sounds-retry'].find(key=>active.hasAttribute(key));
 return attribute?{attribute,value:active.getAttribute(attribute),context:active.dataset.soundContext||details?.dataset.lobbyDetailsId?.split(':')[1]||'live',builtIn:active.dataset.soundBuiltIn||'',scope:details?.dataset.lobbyDetailsId||''}:null;
}

function restoreNotificationSoundFocus(root,focus){
 if(!focus)return;
 if(focus.summary){[...root.querySelectorAll(`[${focus.attribute}]`)].find(node=>node.getAttribute(focus.attribute)===focus.value)?.querySelector('summary')?.focus({preventScroll:true});return;}
 const inScope=node=>(node.closest('.custom-sound-details')?.dataset.lobbyDetailsId||'')===focus.scope;
 let target=[...root.querySelectorAll(`[${focus.attribute}]`)].find(node=>inScope(node)&&node.getAttribute(focus.attribute)===focus.value&&(node.dataset.soundContext||'live')===focus.context&&(node.dataset.soundBuiltIn||'')===focus.builtIn);
 if(!target&&focus.attribute==='data-sound-remove')target=[...root.querySelectorAll('[data-sound-import]')].find(node=>inScope(node)&&node.dataset.soundImport===focus.value&&node.dataset.soundContext===focus.context);
 target?.focus({preventScroll:true});
}

function notificationSoundInteractionActive(root){
 const active=document.activeElement;
 return !liveGameSoundSaving&&!liveCustomSoundBusy&&!!root&&(notificationSoundPointerActive||!!root.contains?.(active)&&!!active?.matches?.('select,input[type="range"],input[type="file"]'));
}

function updateCustomSoundControls(){
 const host=document.getElementById?.('settings-custom-sounds');
 if(host){const html=renderCustomSoundControls('settings');if(host.dataset.soundSignature!==html){
  if(notificationSoundInteractionActive(host))notificationSoundRefreshPending=true;
  else{const open=host.querySelector('.custom-sound-details')?.open,focus=notificationSoundFocus(host);host.innerHTML=html;host.dataset.soundSignature=html;if(open!==undefined)host.querySelector('.custom-sound-details').open=open;restoreNotificationSoundFocus(host,focus);}
 }}
 renderLibrary();
}

function queueNotificationSoundRefresh(){
 if(!notificationSoundRefreshPending||notificationSoundRefreshQueued||notificationSoundPointerActive)return;
 notificationSoundRefreshQueued=true;
 Promise.resolve().then(()=>{
  notificationSoundRefreshQueued=false;
  if(notificationSoundPointerActive||!notificationSoundRefreshPending)return;
  notificationSoundRefreshPending=false;updateCustomSoundControls();
 });
}

// A mouse-down can blur a select before the destination button receives its
// click. Let that activation finish before replacing any deferred panel.
document.addEventListener('pointerdown',()=>{notificationSoundPointerActive=true;notificationSoundPointerRevision++;},true);
document.addEventListener('pointerup',()=>{const revision=notificationSoundPointerRevision;setTimeout(()=>{if(revision!==notificationSoundPointerRevision)return;notificationSoundPointerActive=false;queueNotificationSoundRefresh();},0);},true);
document.addEventListener('pointercancel',()=>{notificationSoundPointerActive=false;queueNotificationSoundRefresh();},true);
document.addEventListener('focusout',event=>{
 if(!event.target?.isConnected||!event.target.matches?.('select,input[type="range"],input[type="file"]')||!event.target.closest('.live-controls,#settings-custom-sounds,.sounds-page'))return;
 queueNotificationSoundRefresh();
});

async function requestCustomNotificationSounds(force=false){
 if(liveCustomSoundReading||liveCustomSoundBusy||(!force&&Date.now()-liveCustomSoundCheckedAt<30000))return;
 liveCustomSoundReading=true;liveCustomSoundCheckedAt=Date.now();const revision=liveCustomSoundRevision;
 try{const result=await api('sounds/custom');if(revision===liveCustomSoundRevision){liveCustomSounds=normalizeCustomSoundInfo(result);liveCustomSoundLoaded=true;liveCustomSoundError='';updateCustomSoundControls();}}
 catch(error){if(revision===liveCustomSoundRevision){liveCustomSoundError=error.message;updateCustomSoundControls();}}
 finally{liveCustomSoundReading=false;}
}

async function customSoundRequest(cue,method,file){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/sounds/custom/'+cue+(file?'?name='+encodeURIComponent(file.name):''),{method,signal:controller.signal,headers:{'X-DS-Companion':'1',...(file?{'Content-Type':'audio/wav'}:{})},body:file?await file.arrayBuffer():undefined});
  const result=await response.json();if(!response.ok)throw new Error(result?.error||'Could not save sound clip.');return result;
 }catch(error){if(error.name==='AbortError')throw new Error('Sound clip request timed out. Please retry.');throw error;}
 finally{clearTimeout(timer);}
}

async function saveCustomNotificationSound(cue,file){
 if(!notificationSoundEvents.some(([key])=>key===cue)||liveCustomSoundBusy)return;
 if(file&&(!/\.wav$/i.test(file.name)||file.size>2097152||file.size<44)){liveCustomSoundError='Choose a WAV file up to 2 MB.';updateCustomSoundControls();return;}
 const returnFocus=notificationSoundFocus(document);
 liveCustomSoundBusy=cue;liveCustomSoundError='';liveCustomSoundRevision++;updateCustomSoundControls();
 try{liveCustomSounds=normalizeCustomSoundInfo(await customSoundRequest(cue,file?'POST':'DELETE',file));liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();toast(file?'Sound clip saved.':'Built-in sound restored.');}
 catch(error){liveCustomSoundError=error.message;}
 finally{liveCustomSoundBusy='';liveCustomSoundRevision++;updateCustomSoundControls();const active=document.activeElement;if(!active||active===document.body||!active.isConnected)restoreNotificationSoundFocus(document,returnFocus);}
}

function liveGameSoundOptions(){
 const settings=state?.library?.settings||{};
 return liveGameSoundDraft||liveGameSoundConfirmed||{loading:!!settings.pingOnGameLoading,loaded:!!settings.pingOnGameLoaded,accept:!!settings.pingOnMatchAccept,autoAcceptMatch:!!settings.autoAcceptMatch,autoPickCommander:settings.autoPickCommander||'',sound:settings.sound!==false,preset:normalizeNotificationSoundPreset(settings.notificationSoundPreset),volume:Number.isInteger(settings.notificationSoundVolume)?settings.notificationSoundVolume:55,styles:normalizeNotificationSoundStyles(settings.notificationSoundStyles)};
}

function applyLiveGamePreferences(options){
 Object.assign(state.library.settings,{pingOnGameLoading:options.loading,pingOnGameLoaded:options.loaded,pingOnMatchAccept:options.accept,autoAcceptMatch:options.autoAcceptMatch,autoPickCommander:options.autoPickCommander,sound:options.sound,notificationSoundPreset:options.preset,notificationSoundVolume:options.volume});
 if(options.styles!=null)state.library.settings.notificationSoundStyles=normalizeNotificationSoundStyles(options.styles);
}

function mergeLiveGamePreferences(server,requestRevision){
 // A poll started before a successful save cannot undo its acknowledgement.
 // The small server projection is fresh even while replay snapshots throttle.
 if(liveGameSoundConfirmed&&requestRevision<liveGameSoundRevision){applyLiveGamePreferences(liveGameSoundConfirmed);return;}
 if(server&&['loading','loaded','accept','autoAcceptMatch','sound'].every(key=>typeof server[key]==='boolean')&&typeof server.autoPickCommander==='string'&&typeof server.preset==='string'&&[...notificationSoundStyles.map(([key])=>key),'soft','clear','classic','terran','protoss','zerg','orbital','warp','ready'].includes(server.preset)&&Number.isInteger(server.volume)&&server.volume>=0&&server.volume<=100){
  applyLiveGamePreferences(server);liveGameSoundConfirmed=null;
 }else if(liveGameSoundConfirmed)applyLiveGamePreferences(liveGameSoundConfirmed);
}

function renderLiveGameSounds(){
 const options=liveGameSoundOptions(),disabled=liveGameSoundSaving?' disabled':'',language=typeof interfaceLanguage==='string'?interfaceLanguage:state?.library?.settings?.language||'en';
 const signature=esc(JSON.stringify([options.autoAcceptMatch,options.autoPickCommander,liveGameSoundSaving,liveGameSoundError,language]));
 return `<details class="live-control-details" data-lobby-details-id="game-controls"><summary><span>Game controls</span><small><span>Auto-accept</span>: <span>${options.autoAcceptMatch?'On':'Off'}</span> · <span>Commander</span>: <span>${options.autoPickCommander?esc(typeof commanderName==='function'?commanderName(options.autoPickCommander):options.autoPickCommander):'Off'}</span></small></summary><div class="live-controls live-shortcuts-only" data-controls-signature="${signature}">
  <section class="live-game-actions" aria-label="Game shortcuts"><h4>Game shortcuts</h4><label class="live-setting-toggle"><input type="checkbox" data-live-preference="autoAcceptMatch"${options.autoAcceptMatch?' checked':''}${disabled}><span>Auto-accept matches and invites</span></label><label class="live-commander-select"><span>Preferred commander</span><select data-live-preference="autoPickCommander"${disabled}>${automationCommanderOptions(options.autoPickCommander)}</select></label><p class="live-controls-hint">Invite acceptance never switches windows or moves the cursor.</p><button type="button" class="button ghost live-sounds-link" data-view="sounds">Open sound settings</button></section>
  <p class="live-controls-save${liveGameSoundError?' live-controls-error':''}" role="status">${liveGameSoundError?esc(liveGameSoundError):liveGameSoundSaving?'Saving…':'Saved automatically · runs while the tray app is open'}</p></div></details>`;
}

async function saveLiveGameSound(kind,enabled){
 if(!['loading','loaded','accept','autoAcceptMatch','autoPickCommander','sound','preset','volume','styles'].includes(kind)||liveGameSoundSaving||!state?.library?.settings)return;
 const options={...liveGameSoundOptions(),[kind]:enabled};
 const restoreFocus=document.activeElement?.dataset?.livePreference===kind;
 const actionFocus=kind==='styles'?notificationSoundFocus(document):null;
 liveGameSoundDraft=options;liveGameSoundError='';liveGameSoundSaving=true;updateCustomSoundControls();
 try{
  await api('lobby/preferences',options);
  liveGameSoundConfirmed={...options};liveGameSoundRevision++;applyLiveGamePreferences(options);
  await refresh();
 }catch(error){liveGameSoundError=error.message;toast(error.message);}
 finally{
  const active=document.activeElement;
  liveGameSoundDraft=null;liveGameSoundSaving=false;updateCustomSoundControls();
  if(restoreFocus&&(!active||active===document.body||!active.isConnected))document.querySelector(`[data-live-preference="${kind}"]`)?.focus({preventScroll:true});
  if(actionFocus&&(!active||active===document.body||!active.isConnected))restoreNotificationSoundFocus(document,actionFocus);
 }
}

document.addEventListener('change',event=>{
 const styleCue=event.target?.dataset?.soundStyle;
 if(styleCue){if(!notificationSoundEvents.some(([cue])=>cue===styleCue)||event.target.value&&normalizeNotificationSoundPreset(event.target.value)!==event.target.value)return;const styles={...liveGameSoundOptions().styles};if(event.target.value)styles[styleCue]=event.target.value;else delete styles[styleCue];void saveLiveGameSound('styles',styles);return;}
 const fileCue=event.target?.dataset?.soundFile;
 if(fileCue){const file=event.target.files?.[0];event.target.value='';if(file)void saveCustomNotificationSound(fileCue,file);return;}
 const kind=event.target?.dataset?.livePreference;
 if(kind)void saveLiveGameSound(kind,event.target.type==='checkbox'?event.target.checked:kind==='volume'?Number(event.target.value):event.target.value);
});
document.addEventListener('input',event=>{
 if(event.target?.dataset?.livePreference==='volume'){
  const output=event.target.closest('.live-controls,.sounds-page')?.querySelector('[data-live-volume-value]');
  if(output)output.textContent=event.target.value+'%';
 }
});
document.addEventListener('click',async event=>{
 const importButton=event.target.closest?.('[data-sound-import]');
 if(importButton&&!importButton.disabled){importButton.closest('.custom-sound-row')?.querySelector('[data-sound-file]')?.click();return;}
 const removeButton=event.target.closest?.('[data-sound-remove]');
 if(removeButton&&!removeButton.disabled){await saveCustomNotificationSound(removeButton.dataset.soundRemove,null);return;}
 if(event.target.closest?.('[data-sounds-retry]')){void requestCustomNotificationSounds(true);return;}
 const button=event.target.closest?.('[data-sound-preview]');
 if(!button||button.disabled)return;
 const options={...liveGameSoundOptions()};
 if(button.dataset.soundContext==='settings'){options.preset=document.getElementById('sound-preset').value;options.volume=Number(document.getElementById('sound-volume').value);}
 const returnFocus=document.activeElement===button;
 button.disabled=true;
 const cue=button.dataset.soundPreview;
 const request={cue,preset:button.dataset.soundGlobal==='true'?normalizeNotificationSoundPreset(options.preset):options.styles?.[cue]||normalizeNotificationSoundPreset(options.preset),volume:options.volume};
 if(button.dataset.soundBuiltIn==='true')request.builtIn=true;
 try{await api('sounds/preview',request);}
 catch(error){toast(error.message);}
 finally{button.disabled=false;const active=document.activeElement;if(returnFocus&&button.isConnected&&(!active||active===document.body||!active.isConnected))button.focus({preventScroll:true});}
});

document.addEventListener('click',()=>{notificationSoundPointerActive=false;queueNotificationSoundRefresh();});

function lobbyTeammateComparison(player,baseline){
 const together=player?.together;
 if(!together||!baseline)return null;
 const valid=s=>[s.wins,s.losses].every(n=>Number.isInteger(n)&&n>=0)&&s.wins+s.losses>0;
 if(!valid(together)||!valid(baseline))return null;
 const games=together.wins+together.losses,winRate=100*together.wins/games,usualWinRate=100*baseline.wins/(baseline.wins+baseline.losses);
 return winRate<usualWinRate?{games,wins:together.wins,losses:together.losses,winRate,usualWinRate,limited:games<5}:null;
}

function syncLiveTeammates(lobby){
 const entries=lobby.rosterEntries||[];
 const teamKey=JSON.stringify([lobby.source,lobby.phase,lobby.region||null,lobby.rosterUpdatedAt,entries.map(entry=>[entry.name,entry.team||0])]);
 if(teamKey!==liveLobbyTeamRosterKey){liveLobbyTeamChoices.clear();liveSiteProfileChoices.clear();liveLobbyTeamRosterKey=teamKey;}
 const key=JSON.stringify([lobby.source,lobby.phase,lobby.rosterUpdatedAt,[...(state.library.settings.selfIds||[])].sort(),entries.map(entry=>[entry.name,entry.team||0,(entry.candidates||[]).map(candidate=>[candidate.id,!!candidate.nameOnly]).sort()])]);
 if(key!==liveTeammateRosterKey){liveTeammateIds.clear();liveTeammateRosterKey=key;}
 liveTeammateBaseline=typeof stats==='function'&&typeof visibleMatches==='function'?stats(visibleMatches(),null,state.library.settings.selfIds):null;
}

function canConfirmLobbyTeammate(candidate,ambiguity){
 const occurrences=(state?.lobby?.rosterEntries||[]).filter(entry=>entry.candidates?.some(item=>item.id===candidate.id)).length;
 return occurrences===1&&!ambiguity&&!candidate.nameOnly&&!String(candidate.id).startsWith('name:')&&!!findPlayer(candidate.id)&&!(state.library.settings.selfIds||[]).includes(candidate.id);
}

function lobbyTeammateCount(entries){
 const ids=new Set();
 for(const entry of entries){
  const candidates=entry.candidates||[],candidate=candidates[0];
  if(candidates.length===1&&canConfirmLobbyTeammate(candidate,false)&&liveTeammateIds.has(candidate.id)&&lobbyTeammateComparison(findPlayer(candidate.id),liveTeammateBaseline))ids.add(candidate.id);
 }
 return ids.size;
}

function renderLobbyTeammate(candidate,ambiguity){
 if(!canConfirmLobbyTeammate(candidate,ambiguity))return '';
 const checked=liveTeammateIds.has(candidate.id),comparison=lobbyTeammateComparison(findPlayer(candidate.id),liveTeammateBaseline);
 return `<div class="live-teammate"><label><input type="checkbox" data-lobby-teammate="${esc(candidate.id)}"${checked?' checked':''}> <span>On my team</span></label>${comparison?`<span class="live-teammate-risk${checked?' live-teammate-risk-active':''}" title="${esc(`${rate(comparison.winRate)} together · ${rate(comparison.usualWinRate)} usual · ${num(comparison.wins)}W / ${num(comparison.losses)}L · ${num(comparison.games)} decided games`)}"><span>${checked?'Potential teammate risk':'Below your usual win rate'}</span>${comparison.limited?' · <span>Limited sample</span>':''}</span>`:''}</div>`;
}

function renderLobbyTeammateEvidence(candidate,ambiguity){
 if(!canConfirmLobbyTeammate(candidate,ambiguity))return '';
 const comparison=lobbyTeammateComparison(findPlayer(candidate.id),liveTeammateBaseline);
 return comparison?`<p class="live-guidance"><span>Your win rate together</span>: <b>${rate(comparison.winRate)}</b> · <span>Your usual win rate</span>: <b>${rate(comparison.usualWinRate)}</b><br>${num(comparison.wins)}W / ${num(comparison.losses)}L · ${num(comparison.games)} decided games${comparison.limited?' · <span>Limited sample</span>':''}<br><span>Applies if this player is on your team.</span></p>`:'';
}

document.addEventListener('change',event=>{
 const siteName=event.target?.dataset?.lobbySite;
 if(siteName!==undefined){
  const profiles=siteLookup(siteNameKey(siteName))?.profiles||[];
  const value=event.target.value;
  if(!value||profiles.some(profile=>siteIdentityKey(profile)===value)){
   if(value){liveSiteProfileChoices.set(siteName,value);void requestSiteProfile(profiles.find(profile=>siteIdentityKey(profile)===value));}else liveSiteProfileChoices.delete(siteName);
   renderLibrary();
  }
  return;
 }
 const row=event.target?.dataset?.lobbyTeam;
 if(row!==undefined){
  const index=Number(row),value=Number(event.target.value),entries=state?.lobby?.rosterEntries||[];
  if(!setLiveLobbyTeam(entries,index,value)){toast('Team already has three players.');renderLibrary();return;}
  renderLibrary();return;
 }
 const id=event.target?.dataset?.lobbyTeammate;
 if(!id)return;
 const candidate=(state?.lobby?.rosterEntries||[]).filter(entry=>entry.candidates?.length===1).flatMap(entry=>entry.candidates).find(candidate=>candidate.id===id);
 if(!candidate||!canConfirmLobbyTeammate(candidate,false))return;
 if(event.target.checked)liveTeammateIds.add(id);else liveTeammateIds.delete(id);
 renderLibrary();
});

function updateLiveLobby(content){
 if(!content.querySelector('#live-lobby-form')){content.innerHTML=renderLiveLobby();return;}
 const openIds=new Set([...content.querySelectorAll('[data-lobby-details-id][open]')].map(detail=>detail.dataset.lobbyDetailsId));
 const monitoringOpen=content.querySelector('.live-monitor-details')?.open,active=document.activeElement;
 const teammateFocus=content.contains(active)?active.dataset?.lobbyTeammate:null;
 const teamFocus=content.contains(active)?active.dataset?.lobbyTeam:undefined;
 const soundFocus=content.contains(active)?active.dataset?.livePreference:null;
 const soundActionFocus=notificationSoundFocus(content);
 const siteFocus=content.contains(active)?active.dataset?.lobbySite:undefined;
 const quickFocus=content.contains(active)&&active.dataset?.quickPlayerList?{id:active.dataset.quickPlayerId,list:active.dataset.quickPlayerList,entry:active.closest('[data-lobby-entry]')?.dataset.lobbyEntry}:null;
 const detail=content.contains(active)?active.closest('[data-lobby-details-id], .live-monitor-details'):null;
 const focus=detail?{id:detail.dataset.lobbyDetailsId,monitor:detail.classList.contains('live-monitor-details'),summary:active.matches('summary'),action:['data-player','data-counter-pick','data-rating','data-view'].find(attribute=>active.hasAttribute(attribute)),value:null,region:active.dataset?.region}:null;
 if(focus?.action)focus.value=active.getAttribute(focus.action);
 const template=document.createElement('template');template.innerHTML=renderLiveLobby();
 // Native dropdowns close if any ancestor is detached, even when the same
 // select is reinserted and refocused. Leave the whole controls branch live.
 const overview=content.querySelector('.live-overview'),nextOverview=template.content.querySelector('.live-overview');
 const controls=overview.querySelector('.live-controls'),nextControls=nextOverview.querySelector('.live-controls');
 const sameControls=controls&&nextControls&&controls.dataset.controlsSignature===nextControls.dataset.controlsSignature;
 const deferControls=!sameControls&&notificationSoundInteractionActive(controls);
 if(sameControls||deferControls){
  if(deferControls)notificationSoundRefreshPending=true;
  const retained=controls.closest('.live-control-details'),replacement=nextControls.closest('.live-control-details');
  for(const node of [...overview.childNodes])if(node!==retained)node.remove();
  let beforeControls=true;
  for(const node of [...nextOverview.childNodes]){
   if(node===replacement){beforeControls=false;continue;}
   if(beforeControls)overview.insertBefore(node,retained);else overview.appendChild(node);
  }
 }else overview.replaceWith(nextOverview);
 for(const selector of ['.live-roster-heading','.live-rating-forecast','.live-roster-grid','.live-footer'])content.querySelector(selector).replaceWith(template.content.querySelector(selector));
 if(monitoringOpen)content.querySelector('.live-monitor-details').open=true;
 content.querySelectorAll('[data-lobby-details-id]').forEach(detail=>detail.open=openIds.has(detail.dataset.lobbyDetailsId));
 if(focus){
  const detail=focus.monitor?content.querySelector('.live-monitor-details'):[...content.querySelectorAll('[data-lobby-details-id]')].find(detail=>detail.dataset.lobbyDetailsId===focus.id);
  const target=focus.summary?detail?.querySelector('summary'):focus.action?[...detail?.querySelectorAll(`[${focus.action}]`)||[]].find(node=>node.getAttribute(focus.action)===focus.value&&(!focus.region||node.dataset.region===focus.region)):null;
  target?.focus({preventScroll:true});
 }
 if(teammateFocus)[...content.querySelectorAll('[data-lobby-teammate]')].find(input=>input.dataset.lobbyTeammate===teammateFocus)?.focus({preventScroll:true});
 if(teamFocus!==undefined)[...content.querySelectorAll('[data-lobby-team]')].find(input=>input.dataset.lobbyTeam===teamFocus)?.focus({preventScroll:true});
 if(soundFocus)content.querySelector(`[data-live-preference="${soundFocus}"]`)?.focus({preventScroll:true});
 restoreNotificationSoundFocus(content,soundActionFocus);
 if(siteFocus!==undefined)[...content.querySelectorAll('[data-lobby-site]')].find(input=>input.dataset.lobbySite===siteFocus)?.focus({preventScroll:true});
 if(quickFocus)[...content.querySelectorAll('[data-quick-player-list]')].find(button=>button.dataset.quickPlayerId===quickFocus.id&&button.dataset.quickPlayerList===quickFocus.list&&button.closest('[data-lobby-entry]')?.dataset.lobbyEntry===quickFocus.entry)?.focus({preventScroll:true});
}

function liveLobbyTeam(entry,index){
 const value=liveLobbyTeamChoices.has(index)?liveLobbyTeamChoices.get(index):entry.team;
 return value===1||value===2?value:0;
}

function setLiveLobbyTeam(entries,index,team){
 if(!Number.isInteger(index)||!entries[index]||![0,1,2].includes(team))return false;
 if(team&&entries.filter((entry,row)=>row!==index&&liveLobbyTeam(entry,row)===team).length>=3)return false;
 liveLobbyTeamChoices.set(index,team);return true;
}

function renderLiveLobbyRoster(entries){
 const groups=[[],[],[]];
 entries.forEach((entry,index)=>groups[liveLobbyTeam(entry,index)].push(liveLobbyCard(entry,index)));
 const empty='<article class="live-slot live-slot-empty" aria-label="No name detected"><h3>No name detected</h3><span>Waiting for an observation</span></article>';
 const provisional=entries.length>0&&!groups[1].length&&!groups[2].length;
 if(provisional){
  // This is display order only. Do not assign team evidence or teammate selections.
  groups[1]=groups[0].slice(0,3);groups[2]=groups[0].slice(3,6);groups[0]=groups[0].slice(6);
 }
 return [1,2].map(team=>{
  const count=groups[team].length,waiting=Array(Math.max(0,3-count)).fill(empty).join('');
  return `<section class="live-team-group live-team-${team}${provisional?' live-team-provisional':''}" aria-label="Team ${team}"><header class="live-team-head"><h3>Team ${team}</h3><span>${provisional?'<span>Unconfirmed</span> · ':''}${count} / 3</span></header>${groups[team].join('')}${waiting}</section>`;
 }).join('')+(groups[0].length?`<section class="live-team-group live-team-unknown" aria-label="Team unconfirmed"><header class="live-team-head"><h3>Team unconfirmed</h3></header>${groups[0].join('')}</section>`:'');
}

function renderLobbyTeamChoice(entry,index){
 const team=liveLobbyTeam(entry,index);
 return `<label class="live-team-control"><span>Team</span><select data-lobby-team="${index}" aria-label="Team for ${esc(entry.name)}"><option value="0"${team===0?' selected':''}>Unconfirmed</option><option value="1"${team===1?' selected':''}>Team 1</option><option value="2"${team===2?' selected':''}>Team 2</option></select><small>${liveLobbyTeamChoices.has(index)?'Manual team selection':entry.team?'Visible lobby panel · verify in SC2':'Choose from the visible lobby'}</small></label>`;
}

function renderLobbyDetectionStatus(lobby,entries){
 const status=lobby.ocrStatus||'Starting SC2 screen reader…';
 const blocked=/covered|foreground|unobscured|timed out|budget|capture unavailable|capture border|screen reader (?:startup|frame|unavailable)|check failed|changed during.*capture/i.test(status);
 if(entries.length&&!blocked)return '';
 // The overview is replaced on polls. Keep this in the reading order without
 // a live region, which would announce the same status after every replacement.
 return `<p class="live-detection-status${blocked?' live-controls-error':''}">${esc(status)}</p>`;
}

function renderLiveLobby() {
  void requestCustomNotificationSounds();
  const lobby = state?.lobby || {};
  const entries = Array.isArray(lobby.rosterEntries) ? lobby.rosterEntries : [];
  syncLiveTeammates(lobby);
  const teammateCount=lobbyTeammateCount(entries);
  const sourceNames = {client:'SC2 client', screen:'Visible screen · OCR', manual:'Manual name check', none:'No roster source'};
  const phaseNames = {waiting:'Waiting for SC2', pregame:'Pregame · names unconfirmed', match:'Match loaded', replay:'Replay · detection suppressed', finished:'Match complete', disconnected:'Client unavailable', off:'Match watch off', manual:'Manual observation'};
  const source = sourceNames[lobby.source] || 'No roster source';
  const retained=lobby.source==='screen'&&!!lobby.held;
  const phase = retained?'Last detected lobby':phaseNames[lobby.phase] || 'Waiting for a current observation';
  const observed = lobby.observedAt && Number.isFinite(Date.parse(lobby.observedAt)) ? `${date(lobby.observedAt)} · ${time(lobby.observedAt)}` : 'Not observed yet';
  const age = lobby.observedAt && Number.isFinite(Date.parse(lobby.observedAt)) ? Math.max(0, Math.floor((Date.now()-Date.parse(lobby.observedAt))/1000)) : null;
  const freshness = age === null ? '' : age < 5 ? ' · just now' : age < 60 ? ` · ${age}s ago` : ` · ${Math.floor(age/60)}m ago`;
  const marked = entries.filter(entry => entry.marked || entry.candidates?.some(c => c.marked)).length;
  const guidance = lobby.source === 'client'
    ? 'These names come from the loaded match. SC2 does not expose a pregame roster, player identities, teams, or selected commanders here.'
    : lobby.source === 'screen'
      ? 'OCR reads visible lobby rows and their Horde/Alliance panels, including unknown names. Confirm names and team groups in SC2; player identities and current commanders remain unknown. Last detected names stay visible until a fresh roster, a loaded match or a manual clear.'
      : lobby.source === 'manual'
        ? 'Names you supplied for this check. Confirm they still belong to the current lobby. Names do not establish player identity or team.'
        : 'Monitoring starts automatically on this tab. Keep the SC2 lobby visible and unobscured for a pregame check; the client also supplies names after a match loads.';
  const emptyCopy = lobby.phase === 'replay' ? 'Replay names and new alerts are suppressed.'
    : lobby.phase === 'finished' ? 'The completed match roster has been cleared. Waiting for a fresh observation.'
    : lobby.phase === 'disconnected' ? 'The local SC2 client is unavailable. A manual name check is still available below.'
    : lobby.phase === 'off' ? 'Starting automatic match and screen monitoring…'
    : 'Waiting for visible lobby names. Empty rows do not indicate open lobby slots.';
  const grouped=entries.some((entry,index)=>liveLobbyTeam(entry,index)>0);
  const draft = typeof lobbyDraft === 'string' ? lobbyDraft : '';
  return `<div class="live-lobby">
    <div class="live-roster-heading">
      <div class="live-status-line"><h3>${esc(phase)}</h3><span>${num(entries.length)} ${entries.length===1?'name':'names'} detected${lobby.partial?' · partial roster':''}${esc(retained?' · '+observed:freshness)}</span>${marked?`<span class="live-alert-count">${num(marked)} ${marked===1?'name matches a mark':'names match marks'}</span>`:''}</div>
      <span>${grouped?'Team groups · verify in SC2':entries.length?'Teams unconfirmed · choose a team in Details':'Waiting for lobby teams'}</span>
    </div>
    ${typeof renderLiveLobbyForecast==='function'?renderLiveLobbyForecast(entries):'<section class="live-rating-forecast" hidden></section>'}
    <div class="live-roster-grid">${renderLiveLobbyRoster(entries)}</div>
    <details class="live-overview" data-lobby-details-id="lobby-tools"><summary>Lobby tools</summary>
      <div class="live-tools-heading"><span class="live-source ${lobby.source==='screen'||lobby.source==='manual'?'live-source-partial':''}">${esc(source)}</span>${entries.length?`<span class="live-team-summary"><span>Below-usual teammates</span>: ${num(teammateCount)}</span>`:''}</div>
      ${!lobby.automation?.acceptNeeded&&typeof renderSc2AutomationBadge==='function'?renderSc2AutomationBadge(lobby):''}${renderLobbyDetectionStatus(lobby,entries)}${renderLiveGameSounds()}
      <details class="live-monitor-details"><summary>Detection details</summary><p class="live-guidance">${esc(guidance)}</p><p class="live-detection">${entries.length?'Observed':'Last checked'} ${esc(observed)}</p><p class="live-detection">${esc(lobby.detectionStatus || 'No current names detected')}</p><p class="live-detection">Automatic monitoring · ${esc(lobby.ocrStatus||'Starting SC2 screen reader…')}${automaticDataError?' · '+esc(automaticDataError):''}</p>${lobby.automation?`<p class="live-detection">${esc(lobby.automation.status||'')}${lobby.automation.commanderStatus?'<br>'+esc(lobby.automation.commanderStatus):''}</p>`:''}${!entries.length?`<p class="live-empty-copy">${esc(emptyCopy)}</p>`:''}${grouped?'<p class="live-guidance">Team groups follow the screen panels or your selection. Use “On my team” for teammate stats after confirming the player.</p>':entries.length?'<p class="live-guidance">Unconfirmed groups use display order only. Confirm teams from the SC2 lobby.</p>':''}${marked?'<p class="live-guidance">Confirm the identity and team before acting on a warning.</p>':''}</details>
    </details>
    <details class="live-manual-details"><summary>Check a lobby by name</summary><form id="live-lobby-form" class="live-manual">
      <div><h3>Check a lobby by name</h3><p>Paste one name per line, up to 12. Unknown names remain visible; marks and replay profiles match by name only.</p></div>
      <label for="live-lobby-names">Lobby names</label>
      <textarea id="live-lobby-names" name="names" rows="4" maxlength="2048" spellcheck="false" aria-describedby="live-manual-help" placeholder="One player name per line">${esc(draft)}</textarea>
      <div class="live-manual-actions"><p id="live-manual-help">Manual names expire after five minutes or a fresh roster observation.</p><button class="button" type="submit">Check these names</button></div>
    </form></details>
    <div class="live-footer"><span>3v3 Commanders · replay and cached site history.</span><button class="button ghost" type="button" data-view="marks">Review player lists</button></div>
  </div>`;
}

function lobbyPlayerDisplayName(id,observedName){
 // A current observation wins over historical replay/site clan membership.
 // Keep any tag actually present in that observation, without adding one.
 if(typeof observedName==='string'&&observedName.trim())return typeof playerNameParts==='function'?playerNameParts(observedName).display:observedName.trim();
 return displayPlayerName(id,observedName);
}

function liveLobbyQuickListButtons(id,name,nameOnly=false){
 return replayQuickListButtons({id,name},{lobby:true,nameOnly});
}

function liveLobbyCard(entry, index) {
  const all = Array.isArray(entry.candidates) ? entry.candidates : [];
  const region=typeof liveLobbyRegionContext==='function'?liveLobbyRegionContext().region:state?.lobby?.region;
  const candidates=region?all.filter(c=>c.nameOnly||!dsstatsNativeRegion(c.id)||dsstatsNativeRegion(c.id)===region):all;
  const marked = !!entry.marked || candidates.some(c => c.marked);
  const displayed=groupedLobbyCandidates(candidates);
  const ambiguity = displayed.length > 1;
  const includesSelf=candidates.some(candidate=>(state.library.settings.selfIds||[]).includes(candidate.id));
  const candidateRow=item=>item.ownGroup?liveLobbyOwnCandidate(item.ownGroup,entry.name,candidates,includesSelf):liveLobbyCandidate(item.candidate,ambiguity,entry.name,includesSelf);
  const body=ambiguity?liveLobbyUnknownRow(entry.name,marked,includesSelf):displayed.length?candidateRow(displayed[0]):liveLobbyUnknownRow(entry.name,marked);
  return `<article class="live-slot ${marked?'live-slot-marked':''}" data-lobby-entry="${esc(entry.name)}">${body.replace(/<summary>(Details|Review possible profiles)<\/summary>/,summary=>summary+renderLobbyTeamChoice(entry,index))}</article>`;
}

function livePlayerResults(ids) {
  let games=0,wins=0,losses=0,unknown=0;
  const seen=new Set();
  if(typeof siteHistoryRows==='function'){
    const rows=siteHistoryRows(ids);
    for(const row of rows){games++;const outcome=playerOutcome(row.match,row.player);if(outcome===true)wins++;else if(outcome===false)losses++;else unknown++;}
    return {games,wins,losses,unknown,winRate:wins+losses?100*wins/(wins+losses):null};
  }
  for(const id of new Set(ids)) {
    for(const row of combatRowsByPlayer.get(id)||[]) {
      const key=row.match.hash||row.match;
      if(seen.has(key))continue;
      seen.add(key);games++;
      const outcome=playerOutcome(row.match,row.player);
      if(outcome===true)wins++;
      else if(outcome===false)losses++;
      else unknown++;
    }
  }
  return {games,wins,losses,unknown,winRate:wins+losses?100*wins/(wins+losses):null};
}

function liveReplayWinRate(ids, label='Player win rate') {
  const results=livePlayerResults(ids);
  return `<div class="live-player-results"><span>${esc(label)}</span><strong>${rate(results.winRate)}</strong><small>${num(results.wins)}W / ${num(results.losses)}L · ${num(results.games)} games${results.unknown?' · '+num(results.unknown)+' undecided':''}</small><small>${typeof siteHistoryRows==='function'?esc(siteHistorySource(siteHistoryRows(ids))):'Imported 3v3 Commanders replays'}</small></div>`;
}

// Pool only caller-supplied linked own IDs. Opponent rows always use one identity.
function liveLobbyReplayRows(ids){
 if(typeof siteHistoryRows==='function')return siteHistoryRows(ids);
 const seen=new Set(),rows=[];
 for(const id of new Set(ids))for(const row of combatRowsByPlayer.get(id)||[]){
  const key=pickMatchKey(row.match);
  if(seen.has(key))continue;
  seen.add(key);rows.push(row);
 }
 const timestamp=row=>{const value=Date.parse(row.match.time);return Number.isFinite(value)?value:-Infinity;};
 return rows.sort((a,b)=>{const first=timestamp(a),second=timestamp(b);return first===second?0:first>second?-1:1;});
}

function buildLiveLobbyHistory(ids){
 const rows=liveLobbyReplayRows(ids),history=buildPickHistory(rows),counts=new Map(),recentOrder=new Map();
 for(const row of rows){
  const commander=row.player.commander||'Unknown';
  counts.set(commander,(counts.get(commander)||0)+1);
  if(!recentOrder.has(commander))recentOrder.set(commander,recentOrder.size);
 }
 // Use the incumbent all-library count for a stable player, never a name group.
 const profile=ids.length===1&&!rows.some(row=>row.source==='site')&&typeof commanderProfiles!=='undefined'?commanderProfiles.get(ids[0]):null;
 const favourites=[...(profile?.counts||counts)]
  .filter(([commander,games])=>commanderPortraits.has(commander)&&Number.isInteger(games)&&games>0)
  .sort((a,b)=>b[1]-a[1]||(recentOrder.get(a[0])??Infinity)-(recentOrder.get(b[0])??Infinity)||a[0].localeCompare(b[0]))
  .slice(0,3).map(([commander,games])=>{
   const recent=history.items.find(item=>item.commander===commander);
   return {commander,games,recentGames:recent?.games||0,pickEstimate:history.total&&history.known?recent?.probability||0:null};
  });
 return {rows,recent:rows.slice(0,3),history,favourites};
}

function liveLobbyHistoryCells(summary,previewId=null,siteProfile=null){
 const recent=summary?.recent||[],favourites=summary?.favourites||[],history=summary?.history;
 const empty=label=>`<span class="live-history-empty" title="${esc(label)}">—</span>`;
 const recentIcons=recent.map(row=>{
  const outcome=playerOutcome(row.match,row.player),result=outcome===true?'Win':outcome===false?'Loss':'Undecided';
  const timestamp=Number.isFinite(Date.parse(row.match.time))?`${date(row.match.time)} · ${time(row.match.time)}`:'Date unavailable';
  const label=`${timestamp} · ${commanderName(row.player.commander)} · ${result} · ${row.source==='site'?'ds-rating.com':'Replay'}`;
  const id=row.player.id||previewId,key=row.match.hash;
  return `<button class="live-recent-game live-recent-${outcome===true?'win':outcome===false?'loss':'unknown'} pick-preview-toggle" type="button"${id&&typeof key==='string'&&key?` data-lobby-pick-toggle="${esc(id)}" data-lobby-pick-kind="game" data-lobby-pick-game="${esc(key)}" aria-controls="lobby-pick-preview" aria-expanded="false"`:' disabled'} aria-label="${esc(label)}">${commanderPortrait(row.player.commander,'medium')}<strong aria-hidden="true">${outcome===true?'W':outcome===false?'L':'?'}</strong></button>`;
 }).join('');
 let favouriteIcons=favourites.map(item=>{
  const label=`${commanderName(item.commander)} · ${num(item.games)} games · ${rate(item.pickEstimate)} · ${num(item.recentGames)} / ${num(history.total)} games · ${num(history.unknown)} unknown picks · ${typeof siteHistorySource==='function'?siteHistorySource(summary.rows):'Imported replays'} · Historical pick frequency; current commander unknown. This is not a win probability.`;
  const content=`${commanderPortrait(item.commander,'medium')}<strong aria-hidden="true">${rate(item.pickEstimate)}</strong>`;
  return `<button class="live-favourite pick-preview-toggle" type="button"${previewId?` data-lobby-pick-toggle="${esc(previewId)}" data-lobby-pick-kind="commander" data-lobby-pick-commander="${esc(item.commander)}" aria-controls="lobby-pick-preview" aria-expanded="false"`:' disabled'} aria-label="${esc(label)}">${content}</button>`;
 }).join('');
 if(!favouriteIcons&&siteProfile){
  favouriteIcons=(siteProfile.commanderStats||[]).filter(item=>Number.isInteger(item.games)&&item.games>0).sort((a,b)=>b.games-a.games).slice(0,3).map(item=>{
   const slug=String(item.commander||'').toLowerCase().replace(/[^a-z]/g,''),commander=typeof commanderPortraits!=='undefined'?[...commanderPortraits].find(([name,file])=>file===slug||name.toLowerCase()===slug||file==='horner'&&slug==='hanhorner')?.[0]:null;
   if(!commander)return '';
   const label=`${commanderName(commander)} · ${num(item.games)} games · ds-rating.com`;
   return `<span class="live-favourite" title="${esc(label)}">${commanderPortrait(commander,'medium')}<strong>${num(item.games)}</strong></span>`;
  }).join('');
 }
 return `<div class="live-recent-games"><span class="live-history-label">Recent games</span><div class="live-hero-strip">${recentIcons||empty('No replay or site history')}</div></div><div class="live-favourites"><span class="live-history-label">Most played${favourites.length?' · <span>Pick estimate</span>':''}</span><div class="live-hero-strip">${favouriteIcons||empty('No known commander pick history.')}</div></div>`;
}

function liveLobbyAdditionalRating(id,name,region,detail=false){
 const native=typeof ownRegionalProfile==='function'?ownRegionalProfile(id,region)?.id||id:id;
 if(typeof dsstatsLookup==='function'&&dsstatsLookup(native,name,region)?.profiles?.length)return additionalSiteRating(native,name,region,detail);
 return additionalSiteRating('',name,region,detail);
}
function liveLobbyRatingDetails(id,player,own=false,observedName=''){
 const name=observedName||player?.name||'';
 if(!own){
  const region=state?.lobby?.region||(/^2-S2-/.test(id)?'EU':/^1-S2-/.test(id)?'Americas':null);
  const selected=player?.ratings?.[region==='EU'?'eu':'americas'];
  const {lookup,profiles}=siteRatingLookup(id,name,region,selected);
  if(selected?.value==null&&(profiles.length>1||profiles.length===1&&(profiles[0].rating==null||!siteLookup(id))))return `<div class="live-row-ratings">${siteAccountRatingList(profiles,lookup)}${liveLobbyAdditionalRating(id,name,region,true)}</div>`;
 }
 return `<div class="live-row-ratings">${['EU','Americas'].map(region=>{
  const linked=own?ownRegionalRating(id,region):player?regionRating(player,region):null;
  const target=typeof ratingTargetId==='function'?ratingTargetId(id,region):id,{lookup,profiles}=siteRatingLookup(target,name,region,linked);
  if(!siteHasRating(linked)&&profiles.length)return siteAccountRatingList(profiles,lookup)+liveLobbyAdditionalRating(target,name,region,true);
  const status=linked?linked.value===null||linked.value===undefined?siteMissingRatingStatus(lookup):linked.checked&&Number.isFinite(Date.parse(linked.checked))?`Cached ${date(linked.checked)} · ${time(linked.checked)}`:'Cached regional profile':siteRatingStatus(id,region);
  return `<span title="${esc(status)}"><span>${region==='EU'?'EU':'AM'}</span> <strong>${linked&&!siteHasRating(linked)?'Loading…':num(linked?.value)}</strong>${siteProfileSupplement(profiles)}</span>${liveLobbyAdditionalRating(target,name,region,true)}`;
 }).join('')}</div>`;
}

// Keep the scan row small; account evidence and alternatives stay in Details.
function liveLobbyRatingProfile(profiles,linked,observedName=''){
 if(siteHasRating(linked))return profiles.find(profile=>String(profile.profileId)===String(linked.profileId))||(!linked.profileId&&profiles.length===1?profiles[0]:null);
 const choice=liveSiteProfileChoices.get(observedName);
 if(choice&&typeof siteIdentityKey==='function'){const selected=profiles.find(profile=>siteIdentityKey(profile)===choice);if(selected)return selected;}
 return sitePreferredProfiles(profiles)[0]||null;
}
function liveLobbyRatingSummary(source,region,rating,profile,lookup,url){
 const value=typeof rating?.value==='number'&&Number.isFinite(rating.value)?rating.value:null;
 const status=lookup?.status||'',profileMissing=source==='ds-rating.com'&&profile?siteProfileMissingRating(profile,lookup).value:null;
 const missing=/unavailable|^Error:/i.test(status)||profileMissing==='Unavailable'?'Unavailable':/not found/i.test(status)?'No match':/unrated/i.test(status)||source==='dsstats'&&profile?'Unrated':profileMissing==='No site rating'?'No site rating':'Loading…';
 const estimated=rating?.kind==='estimated',label=source==='ds-rating.com'?(rating?.kind==='site'?'Site DSR':'DSR'):'dsstats';
 const games=source==='dsstats'?profile?.games:profile?.discoveredGames??profile?.searchGames;
 const wins=source==='dsstats'&&profile?.games>0?100*profile.wins/profile.games:profile?.winRate??profile?.searchWinRate;
 const stats=[Number.isInteger(games)&&games>=0?`${num(games)} <span>games</span>`:'',typeof wins==='number'&&Number.isFinite(wins)&&wins>=0&&wins<=100?`${Number(wins.toFixed(1))}% <span>wins</span>`:''].filter(Boolean).join(' · ');
 const title=[source,region,rating?.kind==='site'?'General site DSR · ds-rating.com':'3v3 Commanders',estimated?'Estimated':'',/unavailable|^Error:/i.test(status)&&value!==null?'Cached':'',value===null?missing:''].filter(Boolean).join(' · ');
 const number=`<strong${value===null?' class="live-rating-pending"':''}>${value===null?`<span>${esc(missing)}</span>`:(estimated?'~':'')+num(value)}</strong>`;
 return `<span class="live-rating-summary${source==='dsstats'?' dsstats-rating':''}" data-rating-source="${source==='ds-rating.com'?'dsr':'dsstats'}" title="${esc(title)}"><span class="live-rating-label" data-i18n-skip>${esc(label)} · ${region==='Americas'?'AM':esc(region)}</span>${url?`<a class="live-rating-value" href="${esc(url)}" target="_blank" rel="noreferrer" aria-label="${esc(title)}">${number}</a>`:`<span class="live-rating-value">${number}</span>`}${stats?`<span class="live-rating-stats">${stats}</span>`:''}</span>`;
}
function liveLobbyRatings(id,player,own=false,observedName=''){
 const name=observedName||player?.name||'',current=(typeof liveLobbyRegionContext==='function'?liveLobbyRegionContext().region:null)||state?.lobby?.region||(/^2-S2-/.test(id)?'EU':/^1-S2-/.test(id)?'Americas':null);
 const regions=current?[current]:['EU','Americas'];
 return `<div class="live-row-ratings live-rating-columns">${regions.map(region=>{
  const linked=own?ownRegionalRating(id,region):player?regionRating(player,region):null;
  const target=own&&typeof ownRegionalProfile==='function'?ownRegionalProfile(id,region)?.id||id:id;
  const {lookup,profiles}=siteRatingLookup(target,name,region,linked),profile=liveLobbyRatingProfile(profiles,linked,name);
  const rating=siteHasRating(linked)?{value:linked.value,kind:'published'}:siteProfileRating(profile);
  const profileId=siteHasRating(linked)?linked.profileId||profile?.profileId:profile?.profileId;
  const dsr=liveLobbyRatingSummary('ds-rating.com',region,rating,profile,lookup,profileId?'https://ds-rating.com/player/'+profileId+(rating?.kind==='published'?'/ratings':''):null);
  let other=typeof dsstatsLookup==='function'?dsstatsLookup(target,name,region):null;
  if(!other?.profiles?.length&&typeof dsstatsLookup==='function')other=dsstatsLookup('',name,region);
  const activity=p=>Number.isFinite(Date.parse(p.lastPlayed))?Date.parse(p.lastPlayed):-Infinity;
  const selected=[...(other?.profiles||[])].filter(p=>p.region===region).sort((a,b)=>activity(b)-activity(a)||b.games-a.games||String(a.nativeId).localeCompare(String(b.nativeId)))[0];
  const native=/^([12])-S2-(\d+)-(\d+)$/.exec(selected?.nativeId||'');
  const url=native?'https://dsstats.pax77.org/ratings?Rt=2&Player='+native[3]+'x'+native[1]+'x'+native[2]:null;
  const dsstats=liveLobbyRatingSummary('dsstats',region,selected?{value:selected.rating}:null,selected,other,url);
  return dsr+dsstats;
 }).join('')}</div>`;
}

function liveLobbyUnknownRow(name,marked=false,suppressQuickLists=false){
 const region=typeof liveLobbyRegionContext==='function'?liveLobbyRegionContext().region:state?.lobby?.region,lookup=siteLookupForName(name,region),profiles=lookup?.profiles||[],ambiguous=/ambig/i.test(lookup?.status||'');
 const regional=sitePreferredProfiles(region?profiles.filter(profile=>profile.region===region):profiles);
 // A presentation priority supplies one account's stats, without linking a
 // native replay identity or merging histories from other matching accounts.
 const selected=regional.find(profile=>siteIdentityKey(profile)===liveSiteProfileChoices.get(name))||(region?regional[0]:!ambiguous&&regional.length===1?regional[0]:null)||null;
 const id=selected?siteIdentityKey(selected):null,history=id?buildLiveLobbyHistory([id]):null;
 const profileStatus=regional.length>1&&region&&!liveSiteProfileChoices.has(name)?'Most recently active account':selected?siteProfileRatingStatus(selected,lookup):regional.length?'Matching site accounts':siteMissingRatingStatus(lookup);
 const ratings=(regional.length?siteAccountRatingList(regional,lookup):`<span class="live-name-status">${esc(siteMissingRatingStatus(lookup))}</span>`)+additionalSiteRating('',name,region,true);
 return `<div class="live-profile live-profile-unconfirmed"${id?` data-lobby-pick="${esc(id)}"`:''}><div class="live-row"><header class="live-slot-head">${id?`<button class="player-name live-profile-link pick-preview-toggle" type="button" data-lobby-pick-toggle="${esc(id)}" data-lobby-pick-kind="player" aria-controls="lobby-pick-preview" aria-expanded="false" data-i18n-skip>${esc(lobbyPlayerDisplayName(id,name))}</button>`:`<h3 data-i18n-skip>${esc(name)}</h3>`}${suppressQuickLists?'':liveLobbyQuickListButtons(null,name,true)}</header>${liveLobbyRatings('',null,false,name)}${liveLobbyHistoryCells(history,id,selected)}</div><details class="live-profile-details" data-lobby-details-id="${esc('unknown:'+name)}"><summary>Details</summary>${typeof nicknameLinkButton==='function'?nicknameLinkButton(name):''}<p class="live-guidance">${esc(profileStatus)}</p><div class="live-rating-evidence">${ratings}</div>${marked?'<span class="live-mark-label">Alert enabled</span>':''}${selected?`<p class="live-guidance"><span>Site profile</span>: <span data-i18n-skip>${esc(selected.name)}</span> · ${esc(selected.region)} · #${esc(selected.profileId)}</p>${liveReplayWinRate([id])}<p class="live-guidance">${esc(state?.library?.siteHistories?.[selected.profileId]?.status||'Site history pending')}</p>`:''}${ambiguous?`<p class="live-guidance">${esc(lookup.status.replace(/; rating pending|; rating unavailable/g,''))}</p>`:''}</details></div>`;
}

function liveLobbyOwnCandidate(group,observedName,candidates,suppressQuickLists=false){
 const ids=group.profiles.map(profile=>profile.id),region=typeof liveLobbyRegionContext==='function'?liveLobbyRegionContext().region:state?.lobby?.region;
 const regional=region?group.profiles.filter(profile=>profile.region===region):[];
 const matched=candidates.find(candidate=>ids.includes(candidate.id)),id=regional.length===1?regional[0].id:matched?.id||ids[0];
 const history=buildLiveLobbyHistory(ids);
 return `<section class="live-profile live-profile-own" aria-label="Your linked regional accounts"><div class="live-row"><header class="live-slot-head"><div class="live-profile-name"><button class="player-name live-profile-link" type="button" data-player="${esc(id)}" title="Linked local accounts · verify name">${esc(lobbyPlayerDisplayName(id,observedName))}</button></div>${suppressQuickLists||ids.some(profileId=>(state.library.settings.selfIds||[]).includes(profileId))?'':liveLobbyQuickListButtons(id,observedName)}</header>${liveLobbyRatings(id,null,true,observedName)}${liveLobbyHistoryCells(history)}</div><details class="live-profile-details" data-lobby-details-id="${esc('own:'+group.key)}"><summary>Details</summary><div class="live-rating-evidence">${liveLobbyRatingDetails(id,null,true,observedName)}</div>${ownLobbyCandidate(group)}</details></section>`;
}

function liveLobbyCandidate(candidate, ambiguity, observedName, suppressQuickLists=false) {
  const player = findPlayer(candidate.id);
  const nameOnly = candidate.nameOnly || String(candidate.id).startsWith('name:');
  const marked = !!candidate.marked;
  if(nameOnly)return liveLobbyUnknownRow(observedName||candidate.name,marked,suppressQuickLists);
  const known = !!player && !nameOnly;
  const canPreview = known && !(state.library.settings.selfIds||[]).includes(candidate.id);
  const sample = s => `${num(s?.games ?? 0)} games${s?.unknown?' · '+num(s.unknown)+' undecided':''}`;
  const history=known?buildLiveLobbyHistory([candidate.id]):null;
  const siteRegion=state?.lobby?.region||(/^2-S2-/.test(candidate.id)?'EU':'Americas');
  const linked=player?.ratings?.[siteRegion==='EU'?'eu':'americas'];
  const siteProfile=liveLobbyRatingProfile(siteRatingLookup(candidate.id,observedName||player?.name||candidate.name||'',siteRegion,linked).profiles,linked);
  return `<section class="live-profile"${canPreview?` data-lobby-pick="${esc(candidate.id)}"`:''} aria-label="Possible profile ${esc(candidate.name || candidate.id)}">
    <div class="live-row"><header class="live-slot-head"><div class="live-profile-name"><button class="player-name live-profile-link" type="button" data-player="${esc(candidate.id)}"${canPreview?` data-lobby-pick-toggle="${esc(candidate.id)}" data-lobby-pick-kind="player" aria-controls="lobby-pick-preview" aria-expanded="false"`:''}>${esc(lobbyPlayerDisplayName(candidate.id,observedName||player?.name||candidate.name||'Review profile'))}</button>${typeof lobbyNicknameAccount==='function'?lobbyNicknameAccount(candidate.id,observedName):''}</div>${suppressQuickLists?'':liveLobbyQuickListButtons(candidate.id,observedName||player?.name||candidate.name,nameOnly||ambiguity)}</header>${liveLobbyRatings(candidate.id,known?player:null,false,observedName||candidate.name)}${liveLobbyHistoryCells(history,canPreview?candidate.id:null,siteProfile)}</div>
    <details class="live-profile-details" data-lobby-details-id="${esc('profile:'+candidate.id+':'+(observedName||''))}"><summary>Details</summary>
    <div class="live-rating-evidence">${liveLobbyRatingDetails(candidate.id,known?player:null,false,observedName||candidate.name)}</div>
    <div class="live-row-actions">${listBadge(player?.mark||(candidate.list?{list:candidate.list}:null))}${marked?'<span class="live-mark-label" title="Alert enabled">Alert enabled</span>':''}${renderLobbyTeammate(candidate,ambiguity)}${canPreview?`<button class="profile-text-action pick-preview-toggle" type="button" data-lobby-pick-toggle="${esc(candidate.id)}" data-lobby-pick-kind="player" aria-controls="lobby-pick-preview" aria-expanded="false">Pick preview</button>`:''}</div>
    <div class="live-profile-head"><span>${nameOnly?'Name-only entry':ambiguity?'Possible replay profile':'Replay profile with this name'}</span></div>
    <span class="mono live-profile-id">${esc(candidate.id)}</span>
    ${known&&typeof siteProfileFor==='function'&&siteProfileFor(candidate.id)?`<p class="live-guidance"><span>Site name match</span> · <span data-i18n-skip>${esc(siteProfileFor(candidate.id).name)}</span> · #${esc(siteProfileFor(candidate.id).profileId)} · <span>replays and site history; overlapping games counted once</span></p>`:''}
    ${player?.mark?.note?`<p class="live-mark-note">${esc(player.mark.note)}</p>`:''}
    ${known?`${liveReplayWinRate([candidate.id])}${renderLobbyTeammateEvidence(candidate,ambiguity)}<p class="live-guidance">Most played in your replays · current commander unknown</p>
      <div class="live-results"><div><span>Your win rate against</span><strong>${rate(player.against?.winRate)}</strong><small>${esc(sample(player.against))}</small></div><div><span>Your win rate together</span><strong>${rate(player.together?.winRate)}</strong><small>${esc(sample(player.together))}</small></div></div>
      <details class="live-pick-details" data-pick-history-id="${esc(candidate.id)}" data-lobby-details-id="${esc('picks:'+candidate.id+':'+(observedName||''))}"><summary>Pick history &amp; advisor</summary>${renderLikelyPicks(candidate.id,true)}</details>`:`<p class="live-name-only">${nameOnly?'This entry has no stable replay identity. Confirm the player before linking a replay profile.':'This replay identity has no statistics in the current library.'}</p>${siteLobbyUnknown(candidate.name||player?.name||'')}`}
    </details>
  </section>`;
}
