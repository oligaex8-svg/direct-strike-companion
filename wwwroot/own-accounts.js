'use strict';
function ownAccountGroups(){return state?.library?.ownAccountGroups||[];}
function ownGroupFor(id){return ownAccountGroups().find(g=>g.canAutoLink&&g.profiles.some(p=>p.id===id))||null;}
function ownProfileFor(id){return ownAccountGroups().flatMap(g=>g.profiles).find(p=>p.id===id)||null;}
function ownRegionalProfile(id,region){const profiles=ownGroupFor(id)?.profiles.filter(p=>p.region===region)||[];return profiles.length===1?profiles[0]:null;}
function ownRatingLinks(id,region){
 if(!['EU','Americas'].includes(region))return [];
 const key=region==='EU'?'eu':'americas',profiles=ownGroupFor(id)?.profiles||[{id}];
 return profiles.map(p=>({id:p.id,rating:state.library.ratings?.[p.id]?.[key]||ownProfileFor(p.id)?.ratings?.[key]||null})).filter(slot=>slot.rating);
}
function ownRatingSlot(id,region){
 const target=ownRegionalProfile(id,region)?.id||id,links=ownRatingLinks(id,region);
 // Keep an earlier link at its original storage key so refresh/unlink still operate on it.
 return links.find(slot=>slot.id===target)||links.find(slot=>slot.id===id)||(links.length===1?links[0]:{id:target,rating:null});
}
function ratingTargetId(id,region){return ownRatingSlot(id,region).id;}
function ownRegionalRating(id,region){return ownRatingSlot(id,region).rating||(typeof siteRating==='function'?siteRating(ownRegionalProfile(id,region)?.id||id,region):null);}
function ownRatingSearchName(id,region){return ownRegionalProfile(id,region)?.name||findPlayer(id)?.name||'';}
function ownEarlierRatings(group){
 if(!group.canAutoLink)return '';
 const earlier=['EU','Americas'].flatMap(region=>{
  const profile=ownRegionalProfile(group.profiles[0]?.id,region);
  const active=profile?ownRatingSlot(profile.id,region):null;
  return ownRatingLinks(group.profiles[0]?.id,region).filter(slot=>slot.id!==active?.id).map(slot=>({...slot,region}));
 });
 return earlier.length?`<div class="own-earlier"><h4>Other saved regional rating links</h4><p class="muted">These earlier links are still saved separately. Review them before choosing which profile to keep.</p>${earlier.map(slot=>`<div><span>${esc(slot.region)} · <a href="${esc(slot.rating.url)}" target="_blank" rel="noreferrer" data-i18n-skip>${esc(slot.rating.profileName||'Linked profile')}</a> · ${num(slot.rating.value)}</span><span class="mono meta">Saved under ${esc(slot.id)}</span><div class="rating-actions"><button type="button" class="rating-button" data-rating="${esc(slot.id)}" data-region="${slot.region}">Change</button><button type="button" class="rating-button" data-refresh-rating="${esc(slot.id)}" data-region="${slot.region}">Refresh</button><button type="button" class="rating-button" data-unlink-rating="${esc(slot.id)}" data-region="${slot.region}">Unlink</button></div></div>`).join('')}</div>`:'';
}
function ownAccountPanel(group){const profiles=[...group.profiles].sort((a,b)=>({EU:0,Americas:1}[a.region]??2)-({EU:0,Americas:1}[b.region]??2));return `<section class="own-account"><div class="own-account-head"><h3>${group.canAutoLink?'Your linked regional accounts':'Local account link needs review'}</h3><span class="scope-chip">${state.library.settings.autoDetectSelf?'Automatic detection':'Automatic detection off'}</span></div><p class="muted">${group.canAutoLink?'Linked by local account folders · different nicknames are supported.':'Conflicting local folders prevent automatic linking.'}</p><div class="own-regions">${profiles.map(p=>{const rating=ownRegionalRating(p.id,p.region),display=siteLinkedRatingDisplay(ratingTargetId(p.id,p.region),p.name||'',p.region,rating);return `<section><span class="field-label">${esc(p.region)}</span><button type="button" class="player-name" data-player="${esc(p.id)}">${esc(displayPlayerName(p.id,p.name||'Name not available yet'))}</button><span class="mono meta">${esc(p.id)}</span><small class="meta">${esc(p.nameSource)}</small><div class="own-rating"><span class="muted">${esc(display.label)}</span>${display.html}${['EU','Americas'].includes(p.region)?`<button type="button" class="rating-button" data-rating="${esc(ratingTargetId(p.id,p.region))}" data-region="${esc(p.region)}">${rating?'View linked rating':'Link rating profile'}</button>`:''}</div></section>`;}).join('')}</div>${ownEarlierRatings(group)}<p class="own-evidence">${esc(group.evidence)}. Current Battle.net login is not exposed by this link.</p>${group.warnings.map(w=>`<p class="warning">${esc(w)}</p>`).join('')}</section>`;}
function ownAccountsPanel(){return ownAccountGroups().map(ownAccountPanel).join('')||'<p class="muted">No regional account group detected. Set your account IDs in Settings; automatic detection can discover their regional siblings.</p>';}
function groupedLobbyCandidates(candidates){const output=[],seen=new Set();for(const candidate of candidates){const group=ownGroupFor(candidate.id);if(group){if(!seen.has(group.key)){seen.add(group.key);output.push({ownGroup:group});}}else output.push({candidate});}return output;}
function ownLobbyCandidate(group){return `<div class="own-lobby"><p class="muted">Possible match to your linked local account · confirm the lobby name.</p>${liveReplayWinRate(group.profiles.map(profile=>profile.id),'Your linked-account win rate')}${ownAccountPanel(group)}<button type="button" class="button ghost" data-view="stats" data-stats-scope="own">Your combined replay stats</button></div>`;}

// Replay identities are authoritative; a typed nickname alone never creates an account.
function manualOwnProfiles(library){
 const profiles=new Map();
 for(const match of [...(library.matches||[])].sort((a,b)=>new Date(b.time)-new Date(a.time))){
  for(const player of match.players||[]){
   const identity=/^([1235])-S2-\d+-\d+$/.exec(player.id||'');
   if(!identity||!player.name?.trim())continue;
   let profile=profiles.get(player.id);
   if(!profile){profile={id:player.id,name:player.name,region:({'1':'Americas','2':'EU','3':'Korea','5':'China'})[identity[1]],aliases:[],source:'Imported replay'};profiles.set(player.id,profile);}
   if(!profile.aliases.includes(player.name))profile.aliases.push(player.name);
  }
 }
 for(const group of library.ownAccountGroups||[]){
  for(const local of group.profiles||[]){
   if(!/^([1235])-S2-\d+-\d+$/.test(local.id||'')||!local.name?.trim())continue;
   let profile=profiles.get(local.id);
   if(!profile){profile={id:local.id,name:local.name,region:local.region,aliases:[],source:'Local SC2 account'};profiles.set(local.id,profile);}
   // The server projection already chooses a shortcut newer than the latest replay.
   profile.name=local.name;
   profile.source=local.nameSource==='Imported replay'?'Imported replay':'Local SC2 account';
   for(const alias of [local.name,...(local.aliases||[])])if(alias?.trim()&&!profile.aliases.includes(alias))profile.aliases.push(alias);
  }
 }
 return [...profiles.values()];
}
function manualOwnMatches(library,name,region=''){
 const query=(typeof playerNameParts==='function'?playerNameParts(name).name:name.trim()).toLowerCase();
 if(!query)return [];
 return manualOwnProfiles(library).filter(profile=>(!region||profile.region===region)&&(profile.id.toLowerCase()===query||profile.aliases.some(alias=>alias.trim().toLowerCase()===query))).sort((a,b)=>a.name.localeCompare(b.name)||a.region.localeCompare(b.region)||a.id.localeCompare(b.id));
}
function manualOwnIdsDraft(draft,id){
 const existing=draft.split('\n').map(line=>line.trim()).filter(Boolean);
 return existing.includes(id)?draft:draft+(draft&&!draft.endsWith('\n')?'\n':'')+id;
}
function renderManualOwnLookup(){
 const name=$('own-account-name').value,region=$('own-account-region').value;
 const matches=manualOwnMatches(state.library,name,region),ids=$('self-ids').value.split('\n').map(id=>id.trim());
 $('own-account-status').textContent=!name.trim()?'Enter your player name as it appears in a replay.':!matches.length?'No replay account found. Add your replay folder above, save settings, then Scan replays and try again.':matches.length>1?'Several replay accounts match. Check the region and account ID, then choose yours.':'Check the region and account ID, then choose your account.';
 $('own-account-results').innerHTML=matches.map((profile,index)=>`<li><div id="own-account-candidate-${index}" class="own-manual-identity"><strong data-i18n-skip>${esc(typeof displayPlayerName==='function'?displayPlayerName(profile.id,profile.name):profile.name)}</strong><span>${esc(profile.region)}</span><span class="mono meta" data-i18n-skip>${esc(profile.id)}</span><span class="meta">${profile.source}</span></div><button type="button" class="button ghost" data-own-account="${esc(profile.id)}" aria-describedby="own-account-candidate-${index}" ${ids.includes(profile.id)?'disabled':''}>${ids.includes(profile.id)?'Added to account IDs':'Use this account'}</button></li>`).join('');
 if(!name.trim())$('own-account-status').textContent='Enter your SC2 name or account ID.';
 else if(!matches.length)$('own-account-status').textContent='No local account found. Click Find account to search ds-rating.com, or import a replay to connect your SC2 account.';
 else if(matches.length>1)$('own-account-status').textContent='Several local accounts match. Check the region and account ID, then choose yours.';
 renderManualOwnSiteLookup();
}
function selectManualOwnAccount(id){
 // Recheck against the current local library and lookup; never trust an arbitrary button ID.
 if(!manualOwnMatches(state.library,$('own-account-name').value,$('own-account-region').value).some(profile=>profile.id===id))return;
 $('self-ids').value=manualOwnIdsDraft($('self-ids').value,id);
 renderManualOwnLookup();
 $('own-account-status').textContent='Account added. Save settings to apply.';
}

let manualOwnSearch={request:0,key:'',phase:'idle',profiles:[]};
function manualOwnSearchKey(){return JSON.stringify([$('own-account-name').value.trim().toLowerCase(),$('own-account-region').value]);}
function resetManualOwnLookup(){
 manualOwnSearch={request:manualOwnSearch.request+1,key:'',phase:'idle',profiles:[]};
 renderManualOwnLookup();
}
function manualOwnSiteRegion(region){return ({eu:'EU',europe:'EU','2':'EU',na:'Americas',us:'Americas',americas:'Americas','1':'Americas'})[String(region||'').toLowerCase()]||null;}
function manualOwnSiteProfiles(profiles,region){
 if(!Array.isArray(profiles))return [];
 const seen=new Set();
 return profiles.filter(profile=>{
  if(!profile||typeof profile.profileId!=='string'||typeof profile.name!=='string')return false;
  const nativeRegion=manualOwnSiteRegion(profile.region);
  if(!/^[1-9][0-9]*$/.test(profile.profileId||'')||!profile.name?.trim()||!nativeRegion||(region&&nativeRegion!==region)||seen.has(profile.profileId))return false;
  seen.add(profile.profileId);return true;
 }).map(profile=>({profileId:profile.profileId,name:profile.name,region:manualOwnSiteRegion(profile.region)})).slice(0,30);
}
function renderManualOwnSiteLookup(){
 const status=$('own-account-site-status'),results=$('own-account-site-results');
 if(!status||!results)return;
 const current=manualOwnSearch.key===manualOwnSearchKey()?manualOwnSearch:{phase:'idle',profiles:[]};
 const messages={idle:'Find account checks local SC2 names and ds-rating.com. Only a local SC2 identity can be added to your account IDs.',searching:'Searching ds-rating.com…',ready:current.profiles.length?'Site profiles found. Their site IDs are not SC2 account IDs. Import one of your replays to connect your account.':'No site profile found for this name and region. Import a replay to connect your SC2 account.',error:'Online search failed. Try Find account again; local account results still work.',unsupported:'Online account search supports EU and Americas. Local account search works in every region.',invalid:'Enter a player name from 1 to 32 characters.'};
 status.textContent=messages[current.phase];
 results.innerHTML=current.profiles.map(profile=>`<li><div class="own-manual-identity"><strong data-i18n-skip>${esc(profile.name)}</strong><span>${esc(profile.region)}</span><span class="meta"><span>Site profile ID</span> <span data-i18n-skip>${esc(profile.profileId)}</span></span></div><a class="rating-button" href="https://ds-rating.com/player/${profile.profileId}" target="_blank" rel="noreferrer">Inspect profile</a></li>`).join('');
 $('own-account-find').disabled=current.phase==='searching';
 $('own-account-find').textContent=current.phase==='searching'?'Searching…':'Find account';
 status.setAttribute('aria-busy',String(current.phase==='searching'));
}
async function findManualOwnAccount(){
 const name=typeof playerNameParts==='function'?playerNameParts($('own-account-name').value).name:$('own-account-name').value.trim(),region=$('own-account-region').value,key=manualOwnSearchKey();
 if(manualOwnSearch.phase==='searching'&&manualOwnSearch.key===key)return;
 const request=manualOwnSearch.request+1;
 const localId=/^([1235])-S2-\d+-\d+$/.test(name);
 manualOwnSearch={request,key,phase:!name||name.length>32?'invalid':region&&!['EU','Americas'].includes(region)?'unsupported':localId?'idle':'searching',profiles:[]};
 renderManualOwnLookup();
 if(manualOwnSearch.phase!=='searching')return;
 try{
  const candidates=await api('rating/search',{id:'',name,region});
  if(request!==manualOwnSearch.request||key!==manualOwnSearchKey())return;
  manualOwnSearch={request,key,phase:'ready',profiles:manualOwnSiteProfiles(candidates,region)};
 }catch{
  if(request!==manualOwnSearch.request||key!==manualOwnSearchKey())return;
  manualOwnSearch={request,key,phase:'error',profiles:[]};
 }
 renderManualOwnLookup();
}
