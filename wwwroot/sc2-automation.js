'use strict';
function automationCommanderOptions(selected=''){
 return [['','Off'],['Random','Random'],...[...commanderPortraits.keys()].map(name=>[name,commanderName(name)])].map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
}
function renderSc2AutomationBadge(lobby){
 const automation=lobby?.automation;
 if(!automation)return '';
 if(!automation.acceptNeeded){
  if(lobby.phase==='match'||lobby.phase==='replay'||lobby.phase==='loading')return '';
  const settings=state?.library?.settings||{};
  const messages=[settings.autoAcceptMatch?automation.status:'',settings.autoPickCommander?automation.commanderStatus:''].filter(text=>/no action|not foreground|capture too old|input paused|already attempted|context changed|pixels changed/i.test(text||''));
  const lastAt=Date.parse(automation.lastAcceptObservedAt),age=Date.now()-lastAt;
  if(settings.autoAcceptMatch&&Number.isFinite(lastAt)&&age>=0&&age<180000&&/no action|not foreground|capture too old|input paused|no click sent|delivery incomplete|context changed|pixels changed/i.test(automation.lastAcceptStatus||''))messages.unshift(automation.lastAcceptStatus);
  return messages.length?`<p class="live-guidance live-controls-error" role="status">${messages.map(esc).join(' · ')}</p>`:'';
 }
 const invite=automation.acceptKind==='party-invite'||automation.acceptKind==='game-invite';
 return `<div class="live-accept-needed" role="alert"><strong>${invite?'Accept invite in SC2':'Accept match in SC2'}</strong><span>${esc(automation.status||'The match confirmation is waiting for you.')}</span></div>`;
}
function updateSc2AcceptAlert(){
 const host=document.getElementById('accept-alert');if(!host)return;
 const lobby=state?.lobby,html=lobby?.automation?.acceptNeeded?renderSc2AutomationBadge(lobby):'';
 if(host.dataset.alertMarkup!==html){host.innerHTML=html;host.dataset.alertMarkup=html;}
 host.hidden=!html;
}
