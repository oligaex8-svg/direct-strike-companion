'use strict';
const nicknameText=value=>typeof translateInterfaceText==='function'?translateInterfaceText(value):value;
function nicknameRegion(id){return /^2-S2-\d+-\d+$/.test(id)?'EU':/^1-S2-\d+-\d+$/.test(id)?'Americas':null;}
function playerNicknameEditor(player){
 if(!nicknameRegion(player.id))return '';
 const names=state.library.playerNicknames?.[player.id]||[];
 return `<details class="player-nickname-editor"><summary><span>Battle.net nicknames</span></summary><form data-nickname-editor="${esc(player.id)}"><label class="field-label" for="player-nicknames">One nickname per line</label><textarea id="player-nicknames" rows="2" maxlength="519" spellcheck="false">${esc(names.join('\n'))}</textarea><p class="muted">Saved nicknames resolve to this replay account in the lobby. Clear the field to remove the links.</p><button type="submit" class="button ghost">Save nicknames</button><span class="nickname-save-status" role="status"></span></form></details>`;
}
function nicknameLinkButton(name){return typeof name==='string'&&name.trim().length>0&&name.length<=64?`<button type="button" class="button ghost nickname-link-action" data-link-nickname="${esc(name)}">Link nickname to account</button>`:'';}
function lobbyNicknameAccount(id,observedName){
 const aliases=state?.library?.playerNicknames?.[id]||[],name=typeof observedName==='string'?observedName:'';
 if(!aliases.some(alias=>siteName(alias).toLowerCase()===siteName(name).toLowerCase()))return '';
 const player=findPlayer(id);if(!player?.name||siteName(player.name).toLowerCase()===siteName(name).toLowerCase())return '';
 return `<span class="live-nickname-account" data-i18n-skip>${esc(player.name)} · ${esc(nicknameRegion(id))}</span>`;
}
document.body.insertAdjacentHTML('beforeend',`<dialog id="nickname-link-dialog" aria-labelledby="nickname-link-title"><div class="dialog-head"><h2 id="nickname-link-title">Link nickname</h2><button type="button" class="close" data-close="nickname-link-dialog" aria-label="Close">×</button></div><div class="dialog-body"><form id="nickname-link-form"><label class="field-label" for="nickname-link-name">Battle.net nickname</label><input type="text" id="nickname-link-name" maxlength="64" required spellcheck="false"><label class="field-label" for="nickname-account-search">Find replay account</label><input type="search" id="nickname-account-search" placeholder="Search a friend or account name" autocomplete="off"><label class="field-label" for="nickname-link-account">SC2 account</label><select id="nickname-link-account" required></select><p class="muted">Friends appear first. This link is saved on this PC and reused automatically.</p><div class="dialog-actions"><button type="button" class="button ghost" data-close="nickname-link-dialog">Cancel</button><button type="submit" class="button">Save link</button></div><p id="nickname-link-status" role="status" class="muted"></p></form></div></dialog>`);
function renderNicknameAccounts(){
 const region=state?.lobby?.region,query=document.getElementById('nickname-account-search').value.trim().toLowerCase(),select=document.getElementById('nickname-link-account'),previous=select.value;
 const friends=new Set((state.library.marks||[]).filter(mark=>mark.list==='friends').map(mark=>mark.id));
 const players=(state.library.players||[]).filter(player=>nicknameRegion(player.id)&&(!region||nicknameRegion(player.id)===region)&&!state.library.settings.selfIds.includes(player.id))
  .filter(player=>!query||[player.name,player.id,...(player.aliases||[])].some(value=>String(value||'').toLowerCase().includes(query)))
  .sort((a,b)=>Number(friends.has(b.id))-Number(friends.has(a.id))||(b.encounters||0)-(a.encounters||0)||String(a.name).localeCompare(String(b.name))).slice(0,30);
 select.innerHTML=`<option value="">${esc(nicknameText('Choose replay account'))}</option>`+players.map(player=>`<option value="${esc(player.id)}" data-i18n-skip>${esc(player.name)} · ${nicknameRegion(player.id)} · ${esc(player.id.split('-').at(-1))}${friends.has(player.id)?' · '+esc(nicknameText('Friends')):''}</option>`).join('');
 if(players.some(player=>player.id===previous))select.value=previous;
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-link-nickname]');if(!button)return;
 document.getElementById('nickname-link-name').value=button.dataset.linkNickname;
 document.getElementById('nickname-account-search').value='';document.getElementById('nickname-link-status').textContent='';
 renderNicknameAccounts();document.getElementById('nickname-link-account').value='';document.getElementById('nickname-link-dialog').showModal();
});
document.getElementById('nickname-account-search').addEventListener('input',renderNicknameAccounts);
document.addEventListener('submit',async event=>{
 const editor=event.target.matches('[data-nickname-editor]'),link=event.target.id==='nickname-link-form';if(!editor&&!link)return;
 event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"]'),status=editor?form.querySelector('[role="status"]'):document.getElementById('nickname-link-status');
 const id=editor?form.dataset.nicknameEditor:document.getElementById('nickname-link-account').value;
 const names=(editor?form.querySelector('textarea').value:document.getElementById('nickname-link-name').value).split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
 if(names.length>8){status.textContent=nicknameText('An account can have up to eight nicknames.');return;}
 button.disabled=true;status.textContent='';
 try{await api('player-nicknames',{id,nicknames:names,append:link});await refresh();
  if(link)document.getElementById('nickname-link-dialog').close();else status.textContent=nicknameText('Nicknames saved.');
  toast(nicknameText('Nickname links saved.'));
 }catch(error){status.textContent=nicknameText(error.message);}finally{button.disabled=false;}
});
