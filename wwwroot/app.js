'use strict';
let state, view='players', markedOnly=false, detailId=null, ratingId=null, ratingRegion='EU', ratingDisplayedQuery='', ratingRequest=0, query='', mode='Commanders', toastTimer, commanderProfiles=new Map(), playerIndex=new Map(), playerRows=[], lobbyDraft='';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rate=n=>n===null||n===undefined?'—':`${Math.round(n)}%`;
const num=n=>n===null||n===undefined?'—':Number(n).toLocaleString(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{maximumFractionDigits:0});
const date=s=>new Date(s).toLocaleDateString(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{day:'numeric',month:'short',year:'numeric'});
const time=s=>new Date(s).toLocaleTimeString(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{hour:'2-digit',minute:'2-digit'});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
async function api(path,data){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),path.startsWith('state')?8000:30000);try{const response=await fetch('/api/'+path,{signal:controller.signal,method:data===undefined?'GET':'POST',headers:{'X-DS-Companion':'1',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const text=await response.text();let result;try{result=text?JSON.parse(text):null;}catch{throw new Error('Unexpected response from the companion.');}if(!response.ok)throw new Error(result?.error||'Request failed.');return result;}catch(error){if(error.name==='AbortError')throw new Error('Companion request timed out. Saved replays are retained.');throw error;}finally{clearTimeout(timer);}}
function renderImportProgress(disconnected=false){
 const panel=$('import-progress'),button=$('import'),p=state?.importProgress;window.DSEquipmentActivity?.update({busy:!!state?.busy||!!p?.busy,paused:!!p?.paused,disconnected,error:p?.phase==='Error'});
 if(disconnected){button.disabled=true;button.textContent='Reopen app';panel.hidden=true;return;}
 button.disabled=!!state?.busy;button.textContent=state?.busy?'Analysing…':p?.paused?'Resume analysis':'Scan replays';
 panel.hidden=!p||(!p.busy&&!p.paused&&p.phase!=='Interrupted'&&p.phase!=='Error'&&p.phase!=='Deferred');if(panel.hidden)return;
 $('import-phase').textContent=p.phase;$('import-count').textContent=p.total?`${num(p.completed)} / ${num(p.total)} replays · ${num(p.added)} added · ${num(p.failed)} failed`:'';
 const bar=$('import-bar');if(p.total){bar.max=p.total;bar.value=p.completed;}else bar.removeAttribute('value');
 const file=$('import-file');if(p.currentFile)file.setAttribute('data-i18n-skip','');else file.removeAttribute('data-i18n-skip');file.textContent=p.currentFile||p.message||'';$('import-pause').hidden=!p.busy;$('import-pause').disabled=!!p.paused;
}
function stats(matches,id,selfIds){let games=0,wins=0,losses=0,unknown=0;for(const m of matches){const me=m.players.find(p=>selfIds.includes(p.id));if(!me)continue;const p=id?m.players.find(p=>p.id===id):me;if(!p)continue;games++;const outcome=m.winner>0&&me.team>0?m.winner===me.team:me.result==='Win'?true:me.result==='Loss'?false:null;if(outcome===null)unknown++;else if(outcome)wins++;else losses++;}return{games,wins,losses,unknown,winRate:wins+losses?100*wins/(wins+losses):null};}
function visibleMatches(){return state.library.matches.filter(m=>m.mode==='Commanders'&&m.players.length===6&&new Set(m.players.map(p=>p.team)).size===2&&m.players.every(p=>p.team>0&&m.players.filter(x=>x.team===p.team).length===3));}
function visiblePlayers(){return sortPlayers(playerRows.filter(p=>(!mode||p.encounters>0)&&(!markedOnly||p.mark)&&[displayPlayerName(p.id,p.name),p.name,p.id,...(p.aliases||[])].some(n=>String(n).toLowerCase().includes(query))));}
function friendPlayers(){return state.library.marks.filter(mark=>markList(mark)==='friends').map(mark=>{const player=findPlayer(mark.id);return {...player,id:mark.id,name:player?.name||mark.name,aliases:player?.aliases||[mark.name],mark,encounters:player?.encounters||0};});}
function visibleFriends(){return sortPlayers(friendPlayers().filter(p=>[displayPlayerName(p.id,p.name),p.name,p.id,...(p.aliases||[])].some(n=>String(n).toLowerCase().includes(query))));}
let refreshPending=false,refreshQueued=false,liveRefreshQueued=false;
function drainRefreshQueue(){if(liveRefreshQueued){liveRefreshQueued=false;queueMicrotask(refreshLiveData);}else if(refreshQueued){refreshQueued=false;queueMicrotask(refresh);}}
async function refresh(){
 if(refreshPending){refreshQueued=true;return;}
 refreshPending=true;
 try{
  const livePreferenceRevision=typeof liveGameSoundRevision==='number'?liveGameSoundRevision:0;
  const appearanceRevision=typeof graphicalStyleRevision==='number'?graphicalStyleRevision:0;
  const fullAppearanceRefresh=typeof graphicalStyleRefreshNeeded==='boolean'&&graphicalStyleRefreshNeeded;
  const update=await api('state'+(!fullAppearanceRefresh&&state?.libraryVersion?'?libraryVersion='+encodeURIComponent(state.libraryVersion):''));
  const changed=!!update.library;
  if(!changed&&!state?.library)throw new Error('Saved replay library is unavailable.');
  state={...update,library:update.library||state.library};
  if(typeof mergeGraphicalStyleSettings==='function')mergeGraphicalStyleSettings(state.library.settings,appearanceRevision);
  if(typeof mergeLiveGamePreferences==='function')mergeLiveGamePreferences(update.lobbyPreferences,livePreferenceRevision);
  if(!languageSaving)setInterfaceLanguage(state.library.settings.language);else state.library.settings.language=interfaceLanguage;
  if(changed){
   const matches=visibleMatches();commanderProfiles=buildCommanderProfiles(matches);buildCombatCache(matches,state.library.settings.selfIds);
   const matchupData=siteMatchupData(matches,state.library.settings.selfIds);pickMatchups=buildPickMatchups(matchupData.matches,matchupData.selfIds);
   const encounterMatches=linkSiteEncounterMatches(matchupData.matches,state.library.players);
   playerRows=buildPlayerEncounterRows(encounterMatches,state.library.players,state.library.settings.selfIds);playerIndex=new Map(playerRows.map(p=>[p.id,p]));
  }
  if(typeof syncLiveTeammates==='function')syncLiveTeammates(state.lobby||{});
  render(changed);void maintainAutomaticData();
  if(typeof refreshImpactDialog==='function')refreshImpactDialog();
  if(changed){
   if($('player-dialog').open&&detailId)showPlayer(detailId,true);
   if($('combat-dialog').open&&combatSelection)showCombat(combatSelection.id,combatSelection.commander);
   if($('match-dialog').open&&matchSelection)showMatch(matchSelection);

  }
 }catch(e){if(state)state={...state,busy:false};renderImportProgress(true);$('replay-status').textContent=state?.library?'Companion disconnected · showing your saved library · reopen the app':'Companion disconnected · reopen from the system tray';}
 finally{refreshPending=false;drainRefreshQueue();}
}
async function refreshLiveData(){
 if(!state?.library)return;
 if(refreshPending){liveRefreshQueued=true;return;}
 refreshPending=true;
 try{
  const revision=typeof liveGameSoundRevision==='number'?liveGameSoundRevision:0,update=await api('live-state');
  state={...state,lobby:update.lobby,softwareUpdate:update.softwareUpdate||state.softwareUpdate,library:{...state.library,...update.site}};
  if(typeof mergeLiveGamePreferences==='function')mergeLiveGamePreferences(update.lobbyPreferences,revision);
  for(const player of playerRows)player.ratings=state.library.ratings?.[player.id]||null;
  if(typeof syncLiveTeammates==='function')syncLiveTeammates(state.lobby);
  renderLibrary();
  if($('match-dialog').open&&matchSelection)showMatch(matchSelection);
   if(typeof refreshImpactDialog==='function')refreshImpactDialog();
  if($('player-dialog').open&&detailId)showPlayer(detailId,true);
  void maintainAutomaticData();
 }catch{ /* Regular state refresh remains the reconnect fallback. */ }
 finally{refreshPending=false;drainRefreshQueue();}
}
async function listenForLiveUpdates(){
 while(true){
  try{
   const response=await fetch('/api/updates',{headers:{'X-DS-Companion':'1'}});
   if(!response.ok||!response.body)throw new Error('Live updates unavailable');
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
   while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let split;while((split=pending.indexOf('\n\n'))>=0){const event=pending.slice(0,split);pending=pending.slice(split+2);if(event.includes('data: update'))void refreshLiveData();}}
  }catch{ /* The existing periodic refresh remains the reconnect fallback. */ }
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
}
function render(updateLibrary=true){if(!state)return;const lib=state.library;const s=stats(visibleMatches(),null,lib.settings.selfIds);$('overall-rate').textContent=rate(s.winRate);$('overall-games').textContent=num(s.games);$('overall-marks').textContent=lib.marks.length;$('overall-detail').textContent=`${s.wins} wins · ${s.losses} losses`;$('unknown-detail').textContent=`${'3v3 Commanders'}${s.unknown?' · '+s.unknown+' undecided':''}`;$('player-count').textContent=num(lib.players.length);$('replay-count').textContent=num(lib.matches.length);$('mark-count').textContent=lib.marks.length;$('friend-count').textContent=lib.marks.filter(mark=>markList(mark)==='friends').length;renderImportProgress();$('replay-status').textContent=state.replayStatus;$('live-status').textContent=state.lobby.liveStatus;$('ocr-status').textContent=state.lobby.ocrStatus;$('screen-watch').checked=lib.settings.screenWatch;$('roster-list').innerHTML=state.lobby.roster.map(n=>`<span class="roster-chip">${esc(n)}</span>`).join('');$('alerts').innerHTML=state.lobby.alerts.length?state.lobby.alerts.slice(0,5).map(a=>`<div class="alert-item"><strong>${esc(a.names.join(', '))}</strong><p>${esc(a.message)}</p><small>${time(a.time)} · ${esc(a.source)}</small></div>`).join(''):'<p class="muted">No enabled-list names detected yet.</p>';if(updateLibrary||view==='lobby'||view==='sounds')renderLibrary();}
function encounterSourceLabel(s){const replay=s?.games-s?.site?.games,site=s?.site?.games;return site?`${num(replay)} ${replay===1?'replay':'replays'} · ${num(site)} ${site===1?'site game':'site games'}`:'';}
function statCell(s){return `<span class="stat">${rate(s.winRate)}</span><div class="sample">${s.wins}W / ${s.losses}L${s.unknown?' · '+s.unknown+'?':''}</div>${s.site?.games?`<div class="sample encounter-source">${encounterSourceLabel(s).split(' · ').map(part=>`<span class="encounter-source-part">${esc(part)}</span>`).join(' · ')}</div>`:''}`;}
function mostPlayedCell(id){const profile=commanderProfiles.get(id),most=profile?.mostPlayed;return most?`<div class="most-played-cell">${commanderPortrait(most.commander,'medium')}<div><span class="commander-name">${esc(commanderName(most.commander))}</span><div class="sample">${most.games} ${most.games===1?'game':'games'} · ${Math.round(100*most.games/profile.total)}%</div></div></div>`:'<span class="muted">No replay available</span>';}
function regionRating(p,region){return ownGroupFor(p.id)?ownRegionalRating(p.id,region):p.ratings?.[region==='EU'?'eu':'americas']||siteRating(p.id,region);}
function ratingCell(p,region){return automaticRatingCell(p,region);}
function regionalRatingCards(p){return automaticRegionalCards(p);}
function renderLibrary(){if(typeof renderSoftwareUpdateStatus==='function')renderSoftwareUpdateStatus(state?.softwareUpdate);if(typeof updateSc2AcceptAlert==='function')updateSc2AcceptAlert();renderLibraryContent();if(typeof refreshLobbyPickPreview==='function')refreshLobbyPickPreview();}
function syncLobbyPageActions(){
 const head=document.querySelector('.page-head'),actions=document.querySelector('.header-actions'),host=$('lobby-page-actions'),progress=$('import-progress');
 if(!head||!actions||!host)return;
 const inLobby=view==='lobby',destination=inLobby?host:head;
 // Move the existing controls only on view changes. Their event handlers and
 // any in-progress import remain intact through ordinary live-lobby updates.
 if(actions.parentElement!==destination)destination.appendChild(actions);
 if(progress){
  if(inLobby&&progress.parentElement!==host)host.appendChild(progress);
  else if(!inLobby&&progress.parentElement===host)head.after(progress);
 }
 host.hidden=!inLobby;
}
let libraryContentSnapshot=null;
function setLibraryContent(html){
 const target=$('library-content'),previous=libraryContentSnapshot;
 if(previous&&previous.target===target&&previous.view===view&&previous.html===html&&previous.anchor?.parentNode===target)return false;
 target.innerHTML=html;libraryContentSnapshot={target,view,html,anchor:target.firstElementChild};return true;
}
function renderLibraryContent(){
 if(!state?.library)return;
 document.querySelectorAll('.sidebar .nav').forEach(nav=>{if(nav.dataset.view===view)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');});
 const content=$('library-content'),expanded=['lobby','stats','profile','picks','sounds'].includes(view);
 const titles={players:'Players',friends:'Friends',matches:'Your replay history',marks:'Your private player lists',lobby:'Live lobby',stats:'Replay averages',profile:'My profile',picks:'Pick advisor',sounds:'Sounds'};
 const descriptions={players:'Win rates and most-played commanders use your imported replays. Ratings load automatically from ds-rating.com.',friends:'Your locally saved friends, with replay win rates, most-played commanders and EU / Americas ratings.',matches:'Direct Strike replays from your selected folders. Duplicated files count once.',lobby:'Your current detected group, refreshed automatically. Name matches need confirmation.',stats:'Kills, army value, economy and timings from your games. Only regular 3v3 Commanders count.',profile:'Your favourite commanders and strongest results across your selected accounts.',picks:'Estimate enemy picks and find commanders supported by your replay history.',marks:'Friends, blocked players and your manual losers list. Choose which lists alert you.',sounds:'Choose alert sounds and voices.'};
 document.querySelector('.workspace').classList.toggle('expanded',expanded);$('main').dataset.view=view;
 syncLobbyPageActions();
 $('main').classList.toggle('profile-page',view==='profile');$('main').classList.toggle('pick-page',view==='picks');
 document.querySelector('.page-head h1').textContent=titles[view];document.querySelector('.page-head .muted').textContent=descriptions[view];
 document.querySelector('.toolbar').hidden=expanded;document.querySelector('.footnote').hidden=expanded;
 $('search').placeholder=view==='matches'?'Search a map, mode or player…':'Search a player…';$('marked-only').hidden=view!=='players';renderSortControls();
 $('section-title').textContent=titles[view];$('section-copy').textContent=descriptions[view];
if(view==='lobby'){updateLiveLobby(content);return;}
if(view==='sounds'){updateSoundsPage(content);return;}
if(view==='stats'){setLibraryContent(renderCombatStats());return;}
if(view==='profile'){setLibraryContent(renderMyProfile());return;}
if(view==='picks'){refreshPickAdvisor(content);return;}
if(view==='players'||view==='friends')updatePlayerDirectory(content,view==='friends'?visibleFriends():visiblePlayers(),JSON.stringify([view,query,view==='players'?markedOnly:false,mode,currentSort('players')]));
else if(view==='matches')setLibraryContent(renderReplayHistory());
else renderPlayerLists();
content.querySelector('.error-list')?.remove();if(state.library.errors.length)content.insertAdjacentHTML('beforeend',`<details class="error-list"><summary class="muted">${state.library.errors.length} recent replay import issues</summary><ul>${state.library.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></details>`);
}
function empty(title,copy){return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`;}
function findPlayer(id){return playerIndex.get(id)||state.library.players.find(p=>p.id===id)||(()=>{const mark=state.library.marks.find(m=>m.id===id),account=ownProfileFor(id)||state.library.accounts?.find(p=>p.id===id);return mark||account?{id,name:mark?.name||account?.name||id,aliases:account?.aliases||[mark?.name||account?.name||id],clanTag:account?.clanTag,mark,against:{games:0,wins:0,losses:0,winRate:null},together:{games:0,wins:0,losses:0,winRate:null},ratings:state.library.ratings?.[id]||{}}:null;})();}
function playerOutcome(match,player){return match.winner>0&&player.team>0?match.winner===player.team:player.result==='Win'?true:player.result==='Loss'?false:null;}
function showPlayer(id,preserveDraft=false){
 const p=findPlayer(id);if(!p)return;detailId=id;$('detail-name').textContent=displayPlayerName(p.id,p.name);
 const rows=profileRows(id);
 const opened=new Set([...$('player-dialog').querySelectorAll('details[open][data-profile-detail]')].map(detail=>detail.dataset.profileDetail));
 const latest=rows[0];
 const lastResult=latest?playerOutcome(latest.match,latest.player):null;
 const tag=outcome=>`<span class="pill ${outcome===false?'loss':outcome===null?'unknown':''}">${outcome===true?'Win':outcome===false?'Loss':'Undecided'}</span>`;
 const editor=`<div id="player-editor"><div class="player-actions"><div class="player-list-field"><label class="field-label" for="player-list">PLAYER LIST</label><select id="player-list">${listOptions(markList(p.mark))}</select></div><div class="dialog-actions">${!state.library.settings.selfIds.includes(id)&&!id.startsWith('name:')?`<button type="button" class="button ghost" data-counter-pick="${esc(id)}">Suggest counterpicks</button>`:''}${p.mark?`<button class="button ghost" data-unmark="${esc(id)}">Remove from list</button>`:''}<button class="button" id="save-player-mark">${p.mark?'Save list / note':'Add to list'}</button></div></div><details class="player-note-editor"${p.mark?.note?' open':''}><summary>PRIVATE NOTE</summary><label class="sr" for="player-note">PRIVATE NOTE</label><textarea id="player-note" rows="3" maxlength="1000" placeholder="Private note about this player">${esc(p.mark?.note||'')}</textarea></details>${typeof playerNicknameEditor==='function'?playerNicknameEditor(p):''}</div>`;
 const html=`${editor}<div id="player-metrics"><p class="mono muted">${esc(p.id)}${p.aliases?.length>1?' · <span>Also seen as</span> <span data-i18n-skip>'+esc(p.aliases.join(', '))+'</span>':''}</p>
 ${profileCommanderShowcase(rows,id)}
 <p class="muted">Commander highlights use this account’s imported 3v3 Commanders games.</p>
 ${state.library.settings.selfIds.includes(id)?'':renderLikelyPicks(id)}
 <div class="detail-stats">${[['Your win rate against',p.against],['Your win rate together',p.together]].map(([label,s])=>`<div class="detail-stat"><span>${label}</span><strong>${rate(s.winRate)}</strong><small>${s.wins} wins · ${s.losses} losses · ${s.games} games${s.unknown?' · '+s.unknown+' undecided':''}</small>${s.site?.games?`<small>${encounterSourceLabel(s)}</small>`:''}</div>`).join('')}</div>
 ${latest?`<h3 class="field-label">THEIR LAST GAME</h3><div class="last-game-stats">${tag(lastResult)}<span>${num(latest.player.apm)} APM</span><span>${formatCombat(combatValue(latest,'UnitKills'),'UnitKills')} enemy kills</span><span>${formatCombat(combatValue(latest,'CombatDeaths'),'CombatDeaths')} combat losses</span><span>${formatCombat(combatValue(latest,'MineralsKilledArmy'),'MineralsKilledArmy')} army mineral value killed</span></div>`:''}
 ${regionalRatingCards(p)}
 ${rows.length?`<h3 class="field-label">THEIR REPLAY AVERAGES</h3>${combatCards(rows)}<button class="rating-button" data-combat-id="${esc(id)}">View all replay averages</button>${profileDisclosure('player-commanders','Performance by commander',combatCommanderTable(rows,id),opened)}${profileDisclosure('player-metrics','All replay averages, gas and economy',combatDetails(rows)+combatExplanation(),opened)}<h3 class="field-label">THEIR RECENT GAMES</h3>${profileRecentGames(rows)}`:''}
 ${ownGroupFor(id)?profileDisclosure('player-accounts','Regional accounts and rating links',ownAccountPanel(ownGroupFor(id)),opened):''}
 </div>`;
 if(preserveDraft&&$('player-editor')){const template=document.createElement('template');template.innerHTML=html;$('player-metrics').innerHTML=template.content.querySelector('#player-metrics').innerHTML;}else $('detail-content').innerHTML=html;
 if(!$('player-dialog').open)$('player-dialog').showModal();
}
async function searchRating(id,region='EU'){
 ratingId=id;ratingRegion=region;$('rating-title').textContent=`Link ${region} profile`;$('rating-name').value=ownRatingSearchName(id,region);
 if(!$('rating-dialog').open)$('rating-dialog').showModal();await searchRegionalProfiles();
}
async function searchRegionalProfiles(){
 const id=ratingId,region=ratingRegion,name=$('rating-name').value.trim(),request=++ratingRequest;
 $('rating-results').innerHTML='<p class="muted">Searching '+esc(region)+' profiles…</p>';
 try{
  const candidates=await api('rating/search',{id,region,name});if(request!==ratingRequest)return;ratingDisplayedQuery=name;
  $('rating-results').innerHTML=candidates.length?candidates.map(p=>`<div class="candidate"><div><strong>${esc(p.name)}</strong><p>${region} · <span>Site profile</span></p><a href="${esc(p.url)}" target="_blank" rel="noreferrer">Inspect profile ↗</a></div><button class="button" data-link-profile="${esc(p.profileId)}">Link ${region} profile</button></div>`).join(''):empty(`No ${region} profile found`,'Try their name on this server. ds-rating.com only knows players from uploaded replays.');
 }catch(e){if(request===ratingRequest)$('rating-results').innerHTML=`<p class="warning">${esc(e.message)}</p>`;}
}
$('rating-search-form').addEventListener('submit',async event=>{event.preventDefault();await searchRegionalProfiles();});
document.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;try{if(button.dataset.view){view=button.dataset.view;playerPage=1;replayPage=1;query='';$('search').value='';document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));renderLibrary();void maintainAutomaticData();}if(button.dataset.close)$(button.dataset.close).close();if(button.dataset.statsScope){statsScope=button.dataset.statsScope;renderLibrary();}if(button.dataset.combatId)showCombat(button.dataset.combatId,button.dataset.commander);if(button.dataset.match)showMatch(button.dataset.match);if(button.dataset.player)showPlayer(button.dataset.player);if(button.dataset.mark)showPlayer(button.dataset.mark);if(button.dataset.rating)await searchRating(button.dataset.rating,button.dataset.region);if(button.dataset.linkProfile){button.disabled=true;await api('rating/link',{id:ratingId,profileId:button.dataset.linkProfile,region:ratingRegion,name:ratingDisplayedQuery});$('rating-dialog').close();await refresh();if(detailId===ratingId)showPlayer(detailId);toast(ratingRegion+' rating profile linked.');}if(button.dataset.refreshRating){button.disabled=true;await api('rating/refresh',{id:button.dataset.refreshRating,region:button.dataset.region});await refresh();if(detailId===button.dataset.refreshRating)showPlayer(detailId);toast(button.dataset.region+' rating refreshed.');}if(button.dataset.unlinkRating){button.disabled=true;await api('rating/unlink',{id:button.dataset.unlinkRating,region:button.dataset.region});await refresh();if(detailId===button.dataset.unlinkRating)showPlayer(detailId);toast(button.dataset.region+' profile unlinked.');}if(button.dataset.unmark){const p=findPlayer(button.dataset.unmark);await api('mark',{id:p.id,name:p.name,remove:true});await refresh();showPlayer(p.id);toast('Player removed from list.');}}catch(e){toast(e.message);button.disabled=false;}});
$('save-player-mark')?.addEventListener('click',()=>{});
$('detail-content').addEventListener('click',async event=>{if(event.target.id!=='save-player-mark')return;const p=findPlayer(detailId);try{event.target.disabled=true;await api('mark',{id:p.id,name:p.name,note:$('player-note').value,list:$('player-list').value});await refresh();showPlayer(detailId);toast('Player list and note saved.');}catch(e){toast(e.message);event.target.disabled=false;}});
$('library-content').addEventListener('submit',async event=>{if(event.target.id!=='quick-mark-form')return;event.preventDefault();const name=$('quick-mark-name').value.trim();if(!name)return;try{await api('mark',{id:'name:'+name.toLowerCase(),name,list:$('quick-list').value,note:state.library.marks.find(mark=>mark.id==='name:'+name.toLowerCase())?.note??'Name-only entry. Confirm identity when a replay is available.'});await refresh();$('quick-mark-name').value='';toast('Player added to list.');}catch(e){toast(e.message);}});
$('search').addEventListener('input',event=>{query=event.target.value.toLowerCase().trim();replayPage=1;playerPage=1;renderLibrary();});

$('marked-only').addEventListener('click',()=>{markedOnly=!markedOnly;playerPage=1;$('marked-only').setAttribute('aria-pressed',markedOnly);renderLibrary();});
$('import-pause').addEventListener('click',async()=>{try{await api('import/pause',{});await refresh();}catch(e){toast(e.message);}});
$('import').addEventListener('click',async()=>{try{await api('import',{});toast('Scanning your replay folders.');setTimeout(refresh,400);}catch(e){toast(e.message);}});
$('notify-test').addEventListener('click',async()=>{try{await api('notify',{});toast('Test alert sent using your Live lobby sound settings.');}catch(e){toast(e.message);}});
$('check-lobby').addEventListener('click',async()=>{try{const hits=await api('check',{text:$('lobby-names').value});$('check-result').textContent=hits.length?'Alert-list name found: '+[...new Set(hits.map(h=>h.name))].join(', ')+'. Confirm the player and team.':'No alert-list names found. This does not verify player identity.';$('check-result').classList.toggle('warn',hits.length>0);await refresh();}catch(e){toast(e.message);}});
$('screen-watch').addEventListener('change',async event=>{const enabled=event.target.checked;try{await api('settings',{...state.library.settings,screenWatch:enabled});await refresh();toast(enabled?'Local SC2 screen checks enabled. Name matches need confirmation.':'SC2 screen checks disabled.');}catch(e){event.target.checked=!enabled;toast(e.message);}});
$('settings-open').addEventListener('click',()=>{const s=state.library.settings;$('settings-language').value=s.language||'en';$('folders').value=s.replayFolders.join('\n');$('self-ids').value=s.selfIds.join('\n');$('auto-detect-self').checked=s.autoDetectSelf!==false;$('own-accounts-settings').innerHTML=ownAccountsPanel();$('own-account-name').value='';$('own-account-region').value='';renderManualOwnLookup();$('auto-accept-match').checked=!!s.autoAcceptMatch;$('auto-pick-commander').innerHTML=automationCommanderOptions(s.autoPickCommander||'');$('live-watch').checked=s.liveWatch;$('data-path').textContent='Private data: '+state.dataPath;$('settings-dialog').showModal();});
$('own-account-find').addEventListener('click',findManualOwnAccount);
$('own-account-name').addEventListener('input',resetManualOwnLookup);
$('own-account-region').addEventListener('change',resetManualOwnLookup);
$('own-account-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void findManualOwnAccount();}});
$('own-account-results').addEventListener('click',event=>{const button=event.target.closest('button[data-own-account]');if(button&&!button.disabled)selectManualOwnAccount(button.dataset.ownAccount);});
$('self-ids').addEventListener('input',renderManualOwnLookup);
$('settings-dialog').addEventListener('close',resetManualOwnLookup);
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();const lines=id=>$(id).value.split('\n').map(s=>s.trim()).filter(Boolean);try{await api('settings',{...state.library.settings,language:$('settings-language').value,replayFolders:lines('folders'),selfIds:lines('self-ids'),autoDetectSelf:$('auto-detect-self').checked,autoAcceptMatch:$('auto-accept-match').checked,autoPickCommander:$('auto-pick-commander').value,liveWatch:$('live-watch').checked});$('settings-dialog').close();await refresh();toast('Settings saved.');}catch(e){toast(e.message);}});
$('retry-import').addEventListener('click',async()=>{try{await api('import',{retry:true});$('settings-dialog').close();toast('Retrying replay imports.');}catch(e){toast(e.message);}});
refresh();void listenForLiveUpdates();setInterval(refresh,4000);
document.addEventListener('toggle',event=>{if(event.target.matches?.('.combat-details'))combatExpanded=event.target.open;},true);

document.addEventListener('input',event=>{if(event.target.id==='live-lobby-names')lobbyDraft=event.target.value;});
document.addEventListener('submit',async event=>{if(event.target.id!=='live-lobby-form')return;event.preventDefault();try{lobbyDraft=$('live-lobby-names').value;const hits=await api('check',{text:lobbyDraft});document.activeElement?.blur();await refresh();document.querySelector('.live-roster-heading')?.scrollIntoView({block:'start',behavior:'auto'});toast(hits.length?'Alert-list name detected · confirm the player and team.':lobbyDraft.trim()?'Manual names checked. Verify this is your current group.':'Manual roster cleared.');}catch(e){toast(e.message);}});
