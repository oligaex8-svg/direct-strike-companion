'use strict';
const siteRequestTimes=new Map();
let siteObserver=null,automaticMonitorBusy=false,automaticDataError='';
function additionalSiteRating(id,name='',region=null,detail=false){
 const native=typeof ownRegionalProfile==='function'?ownRegionalProfile(id,region)?.id||id:id;
 return typeof dsstatsRating==='function'?dsstatsRating(native,name,region,detail):'';
}
function siteName(name){let value=String(name||'').trim();if(value.includes('&')&&typeof document.createElement==='function'){const decoder=document.createElement('textarea');decoder.innerHTML=value;value=decoder.value;}return value.replace(/^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+/,'').trim();}
function siteNameKey(name,region=null){return 'name:'+(['EU','Americas'].includes(region)?region+':':'')+siteName(name).toLowerCase();}
function siteLookup(id){return state?.library?.siteLookups?.[id]||null;}
// Reuse already downloaded name matches immediately, including native replay lookups.
// This groups displayed site accounts; it never binds their identities or histories.
let siteNameIndexLibrary=null,siteNameIndex=new Map();
// Aggregated names can have a pending primary lookup and completed profiles from
// another lookup. Keep each copied profile's own verified evidence timestamp.
const siteProfileEvidenceTimes=new WeakMap();
const siteAccountDisclosures=new Set();
function siteCollectSearchEvidence(target,key,profile){
 const time=Date.parse(profile.searchChecked),previous=target.get(key);
 if(Number.isFinite(time)&&(!previous||time>Date.parse(previous.searchChecked)))target.set(key,profile);
}
function siteMergeSearchEvidence(profile,search){
 return search?{...profile,searchRating:search.searchRating,searchChecked:search.searchChecked,
  lastPlayed:search.lastPlayed,searchGames:search.searchGames,searchWinRate:search.searchWinRate}:profile;
}
function siteProfileRatingScore(profile){return {published:3,estimated:2,site:1}[siteProfileRating(profile)?.kind]||0;}
function siteProfileNames(name){const value=siteName(name),legacy=/^(.+?)\s+\((.+)\)$/.exec(value);return legacy?[legacy[1],legacy[2]].map(part=>part.toLowerCase()):[value.toLowerCase()];}
function siteLookupForName(name,region=null){
 const library=state?.library,key=siteName(name).toLowerCase();
 if(siteNameIndexLibrary!==library){
  siteNameIndexLibrary=library;siteNameIndex=new Map();
  for(const [id,lookup] of Object.entries(library?.siteLookups||{})){
   const names=new Set((lookup.profiles||[]).flatMap(profile=>siteProfileNames(profile.name)));
   if(id.startsWith('name:'))names.add(id.replace(/^name:(?:(?:EU|Americas):)?/,''));
   for(const nickname of names){if(!siteNameIndex.has(nickname))siteNameIndex.set(nickname,[]);siteNameIndex.get(nickname).push(lookup);}
  }
 }
 const scoped=siteLookup(siteNameKey(name,region)),legacy=siteLookup(siteNameKey(name));
 const lookups=[scoped,legacy,...(siteNameIndex.get(key)||[])].filter(Boolean),profiles=new Map(),evidenceTimes=new Map(),searchEvidence=new Map();
 for(const lookup of lookups)for(const profile of lookup.profiles||[]){
  if(region&&profile.region!==region)continue;
  if(!siteProfileNames(profile.name).includes(key))continue;
  const id=profile.region+':'+profile.profileId,previous=profiles.get(id);
  siteCollectSearchEvidence(searchEvidence,id,profile);
  const time=siteProfileModeEvidenceTime(profile,lookup.status),earlier=evidenceTimes.get(id)??-Infinity;
  if(!previous||time>earlier||time===earlier&&siteProfileRatingScore(profile)>siteProfileRatingScore(previous)){profiles.set(id,profile);evidenceTimes.set(id,time);}
 }
 const primary=scoped||legacy||lookups[0];
 return primary?{...primary,profiles:[...profiles].map(([id,profile])=>{const copy={...siteMergeSearchEvidence(profile,searchEvidence.get(id))};siteProfileEvidenceTimes.set(copy,evidenceTimes.get(id));return copy;})}:null;
}
function siteProfileRating(profile){
 if(typeof profile?.rating==='number'&&Number.isFinite(profile.rating))return {value:profile.rating,kind:'published'};
 if(typeof profile?.mainRating==='number'&&Number.isFinite(profile.mainRating))return {value:profile.mainRating,kind:'site'};
 if(typeof profile?.estimatedRating==='number'&&Number.isFinite(profile.estimatedRating))return {value:profile.estimatedRating,kind:'estimated'};
 if(typeof profile?.searchRating==='number'&&Number.isFinite(profile.searchRating))return {value:profile.searchRating,kind:'site'};
 return null;
}
function siteHasRating(rating){return typeof rating?.value==='number'&&Number.isFinite(rating.value);}
function siteProfileModeEvidenceTime(profile,status){
 if(siteProfileEvidenceTimes.has(profile))return siteProfileEvidenceTimes.get(profile);
 const verified=siteProfileRating(profile)?.kind==='published'||(profile.profileChecked||profile.profileAttempted)&&!/(?:rating unavailable|rating pending|^Error:)/i.test(status||'');
 const time=verified?Date.parse(profile.checked):-Infinity;return Number.isFinite(time)?time:-Infinity;
}
function siteProfilesForRating(lookup,region,rating){return (lookup?.profiles||[]).filter(profile=>(!region||profile.region===region)&&(!rating?.profileId||rating.automatic||profile.profileId===rating.profileId));}
function siteRatingLookup(id,name,region,rating){
 const native=siteLookup(id),named=siteLookupForName(name||native?.profiles?.[0]?.name||'',region),choices=[native,named].filter(Boolean),combined=new Map(),times=new Map(),searchEvidence=new Map();
 for(const item of choices)for(const profile of siteProfilesForRating(item,region,rating)){
  const key=profile.region+':'+profile.profileId,previous=combined.get(key),time=siteProfileModeEvidenceTime(profile,item.status),earlier=times.get(key)??-Infinity;
  siteCollectSearchEvidence(searchEvidence,key,profile);
  if(!previous||time>earlier||time===earlier&&siteProfileRatingScore(profile)>siteProfileRatingScore(previous)){combined.set(key,profile);times.set(key,time);}
 }
 const profiles=[...combined].map(([key,profile])=>{const copy={...siteMergeSearchEvidence(profile,searchEvidence.get(key))};siteProfileEvidenceTimes.set(copy,times.get(key));return copy;}),lookup=choices.length?{...(native?.profiles?.length?native:named||native),profiles}:null;
 return {lookup:rating?.profileId&&!rating.automatic&&!profiles.length?{...lookup,status:'Checking selected site profile…',profiles:[]}:lookup,profiles};
}
function siteLinkedRatingDisplay(id,name,region,rating){
 const {lookup,profiles}=siteRatingLookup(id,name,region,rating),grouped=!siteHasRating(rating)&&profiles.length;
 return {html:(grouped?siteAccountRatingList(profiles,lookup,false):`<strong>${siteHasRating(rating)?num(rating.value):esc(siteMissingRatingStatus(lookup))}</strong>${siteProfileSupplement(profiles)}`)+additionalSiteRating(id,name,region),label:grouped?'Site account ratings':siteHasRating(rating)?'3v3 Commanders · ds-rating.com':siteMissingRatingStatus(lookup)};
}
function siteCurrentRatingLabel(current){return current.value!==null?'Current 3v3 Commanders':current.profiles?.some(profile=>siteProfileRating(profile)?.kind==='estimated')?'Site rating · estimates labelled':'Site account ratings';}
function sitePreferredProfiles(profiles){
 const activity=profile=>{const time=Date.parse(profile.lastPlayed);return Number.isFinite(time)?time:-Infinity;};
 return [...profiles].sort((a,b)=>activity(b)-activity(a)||((b.searchGames??b.discoveredGames??0)-(a.searchGames??a.discoveredGames??0))||String(a.profileId).localeCompare(String(b.profileId),undefined,{numeric:true}));
}
function siteProfileSummary(profile){
 const games=profile.discoveredGames??profile.searchGames,winRate=profile.winRate??profile.searchWinRate;
 const items=[];
 if(Number.isInteger(games)&&games>=0)items.push(`<span><span>Site games</span> <strong>${num(games)}</strong></span>`);
 if(typeof winRate==='number'&&Number.isFinite(winRate)&&winRate>=0&&winRate<=100)items.push(`<span><span>Win rate</span> <strong>${Number(winRate.toFixed(1))}%</strong></span>`);
 if(Number.isFinite(Date.parse(profile.lastPlayed)))items.push(`<span><span>Last played</span> <span data-i18n-skip>${esc(profile.lastPlayed.slice(0,10))}</span></span>`);
 return items.length?`<span class="site-profile-summary">${items.join('')}</span>`:'';
}
function siteCommanderStats(profile){
 const stats=(profile?.commanderStats||[]).filter(item=>Number.isInteger(item.games)&&item.games>=0).slice(0,12);
 if(!stats.length)return '';
 return `<span class="site-commander-stats"><span class="site-stats-heading">Site commander stats</span>${stats.map(item=>{
  const slug=String(item.commander||'').toLowerCase().replace(/[^a-z]/g,'');
  const commander=typeof commanderPortraits!=='undefined'?[...commanderPortraits].find(([name,file])=>file===slug||name.toLowerCase()===slug||file==='horner'&&slug==='hanhorner')?.[0]:null;
  const name=commander&&typeof commanderName==='function'?commanderName(commander):item.commander;
  const rate=typeof item.winRate==='number'&&Number.isFinite(item.winRate)&&item.winRate>=0&&item.winRate<=100?Number(item.winRate.toFixed(1))+'%':'—';
  return `<span class="site-commander-stat">${commander&&typeof commanderPortrait==='function'?commanderPortrait(commander,'small'):''}<span>${esc(name)}</span><span><strong>${num(item.games)}</strong> <span>games</span></span><span><strong>${rate}</strong> <span>Win rate</span></span></span>`;
 }).join('')}<small>Shown commanders only · site statistics</small></span>`;
}
function siteProfileNeedsDetails(profile){
 const checked=Date.parse(profile.profileChecked),attempted=Date.parse(profile.profileAttempted);
 return profile.detailsPending||!(profile.profileStatsVersion>=1)||!Number.isFinite(checked)||Date.now()-checked>=1800000||Number.isFinite(attempted)&&attempted>checked;
}
function siteProfileMissingRating(profile,lookup){
 const checked=Date.parse(profile.profileChecked),attempted=Date.parse(profile.profileAttempted),status=lookup?.status||'';
 // A search result's null rating says nothing about the main profile estimate.
 // Only a completed main-profile check may establish that no site value exists.
 if(/unavailable|^Error:/i.test(status)||Number.isFinite(attempted)&&(!Number.isFinite(checked)||attempted>checked))return {value:'Unavailable',description:'Site rating unavailable · will retry'};
 if(/(?:rating|profile) pending/i.test(status)&&!profile.detailsPending)return {value:'Loading…',description:'Loading site rating…'};
 if(profile.profileStatsVersion>=1&&Number.isFinite(checked)&&!profile.detailsPending)return {value:'No site rating',description:'No rating returned by the checked site profile'};
 return {value:'Not loaded',description:'Site profile not checked yet'};
}
function siteProfileSupplement(profiles){
 // Numeric/manual rows already show their authoritative rating. Supplement
 // only a single scoped account; an ambiguous group uses its full account list.
 if(profiles?.length!==1)return '';
 const profile=profiles[0],summary=siteProfileSummary(profile),stats=siteCommanderStats(profile);
 if(!summary&&!stats)return '';
 const key='stats:'+profile.region+':'+profile.profileId,open=siteAccountDisclosures.has(key);
 return `<span class="site-account-entry site-profile-supplement">${summary}${stats?`<button type="button" class="site-account-action" data-site-disclosure="${esc(key)}" aria-expanded="${open}">Stats</button><span class="site-account-panel"${open?'':' hidden'}>${stats}</span>`:''}</span>`;
}
function siteAccountRatingRow(profile,lookup,showRegion,priority=false){
 const rating=siteProfileRating(profile),estimated=rating?.kind==='estimated',status=siteProfileRatingStatus(profile,lookup),value=rating?num(rating.value):siteProfileMissingRating(profile,lookup).value;
 const cached=!!rating&&/Error:|unavailable/i.test(lookup?.status||'');
 const stats=siteCommanderStats(profile),key='stats:'+profile.region+':'+profile.profileId,open=siteAccountDisclosures.has(key),load=siteProfileNeedsDetails(profile);
 return `<span class="site-account-entry${priority?' site-account-primary':''}"><span class="site-account-rating" title="${esc(status)}"><a href="https://ds-rating.com/player/${esc(profile.profileId)}${rating?.kind==='published'?'/ratings':''}" target="_blank" rel="noreferrer" aria-label="${esc(profile.region+' · '+profile.name+' · #'+profile.profileId)}" data-i18n-skip>${showRegion?(profile.region==='EU'?'EU':'AM')+' ':''}#${esc(profile.profileId)}</a><strong${!rating?' class="site-rating-empty"':''}>${esc(value)}</strong>${estimated?'<small class="site-rating-estimated">Estimated</small>':rating?.kind==='site'?'<small class="site-rating-estimated">Site DSR</small>':''}${cached?'<small class="site-rating-estimated">Cached</small>':''}${load?`<button type="button" class="site-account-action" data-site-profile-id="${esc(profile.profileId)}" data-site-profile-region="${esc(profile.region)}">Load profile</button>`:''}${stats?`<button type="button" class="site-account-action" data-site-disclosure="${esc(key)}" aria-expanded="${open}">Stats</button>`:''}</span>${siteProfileSummary(profile)}${stats?`<span class="site-account-panel"${open?'':' hidden'}>${stats}</span>`:''}</span>`;
}
function siteAccountRatingList(profiles,lookup,showRegion=true){
 const ordered=sitePreferredProfiles(profiles),regions=new Set(),primary=[],others=[];
 for(const profile of ordered){if(!regions.has(profile.region)){regions.add(profile.region);primary.push(profile);}else others.push(profile);}
 const key='accounts:'+ordered.map(profile=>profile.region+':'+profile.profileId).sort().join(','),open=siteAccountDisclosures.has(key);
 return `<span class="site-account-ratings">${primary.map(profile=>siteAccountRatingRow(profile,lookup,showRegion,true)).join('')}${others.length?`<span class="site-account-disclosure"><button type="button" class="site-account-action" data-site-disclosure="${esc(key)}" aria-expanded="${open}"><span>Other accounts</span> (${others.length})</button><span class="site-account-panel site-account-alternatives"${open?'':' hidden'}><small>Most recently active first · name and region matches</small>${others.map(profile=>siteAccountRatingRow(profile,lookup,showRegion)).join('')}</span></span>`:''}</span>`;
}
document.addEventListener?.('click',event=>{
 const toggle=event.target.closest?.('[data-site-disclosure]');
 if(toggle){const panel=toggle.closest('.site-account-entry,.site-account-disclosure')?.querySelector(':scope > .site-account-panel');if(!panel)return;const key=toggle.dataset.siteDisclosure,open=toggle.getAttribute('aria-expanded')!=='true';if(open)siteAccountDisclosures.add(key);else siteAccountDisclosures.delete(key);toggle.setAttribute('aria-expanded',String(open));panel.hidden=!open;return;}
 const load=event.target.closest?.('[data-site-profile-id]');
 if(load){load.disabled=true;load.textContent='Loading…';void requestSiteProfile({profileId:load.dataset.siteProfileId,region:load.dataset.siteProfileRegion}).finally(()=>{if(load.isConnected){load.disabled=false;load.textContent='Load profile';}if(typeof translateInterface==='function')translateInterface(load);});}
});
function siteMissingRatingStatus(lookup){return !lookup?'Checking ds-rating.com…':/^Not found/i.test(lookup.status||'')?'No site match':/^Error:/i.test(lookup.status||'')?'Site unavailable · retrying':/pending/i.test(lookup.status||'')?'Loading ds-rating.com…':lookup.status||'Checking ds-rating.com…';}
function siteProfileRatingStatus(profile,lookup){const rating=siteProfileRating(profile);return rating?.kind==='published'?'Site name match':rating?.kind==='estimated'?'Site estimated rating · ds-rating.com':rating?.kind==='site'?'General site DSR · ds-rating.com':siteProfileMissingRating(profile,lookup).description;}
async function requestSiteProfile(profile){
 if(!profile||!/^[1-9][0-9]*$/.test(profile.profileId)||!['EU','Americas'].includes(profile.region))return;
 const key='profile:'+profile.region+':'+profile.profileId,now=Date.now();
 if(now-(siteRequestTimes.get(key)||0)<120000)return;
 siteRequestTimes.set(key,now);
 try{await api('rating/site-profile',{profileId:profile.profileId,region:profile.region});automaticDataError='';}
 catch(error){siteRequestTimes.delete(key);automaticDataError=error.message;}
}
function siteRating(id,region){const lookup=siteLookup(id);if(/ambig/i.test(lookup?.status||''))return null;const profiles=lookup?.profiles?.filter(profile=>profile.region===region)||[];if(profiles.length!==1)return null;const original=profiles[0],profile=siteRatingLookup(id,original.name,region,null).profiles.find(profile=>profile.profileId===original.profileId)||original;return{value:profile.rating,checked:profile.checked,profileId:profile.profileId,profileName:profile.name,status:'Automatic name and region match',url:'https://ds-rating.com/player/'+profile.profileId+'/ratings',automatic:true};}
function siteRatingStatus(id,region){if((region==='EU'&&!id.startsWith('2-S2-'))||(region==='Americas'&&!id.startsWith('1-S2-')))return 'Regional account unknown';const lookup=siteLookup(id);return lookup?.status||'Automatic lookup pending';}
function automaticRatingCell(player,region){const id=ratingTargetId(player.id,region),rating=regionRating(player,region),{lookup,profiles}=siteRatingLookup(id,player.name||'',region,rating),grouped=!siteHasRating(rating)&&profiles.length;return `<div data-site-player="${esc(id)}">${grouped?siteAccountRatingList(profiles,lookup,false):`<span class="stat">${num(rating?.value)}</span>${siteProfileSupplement(profiles)}`}<span class="meta">ds-rating.com</span><span class="meta">${grouped?profiles.length===1?esc(siteProfileRatingStatus(profiles[0],lookup)):'Matching site accounts':rating?rating.value==null?esc(siteProfileRatingStatus({rating:rating.value},lookup)):rating.automatic?'Name matched':'Selected profile':esc(siteRatingStatus(id,region))}</span>${additionalSiteRating(id,player.name,region)}</div>`;}
function automaticRegionalCards(player){return `<div class="rating-pair">${['EU','Americas'].map(region=>{const id=ratingTargetId(player.id,region),rating=regionRating(player,region),{lookup,profiles}=siteRatingLookup(id,player.name||'',region,rating),grouped=!siteHasRating(rating)&&profiles.length;return `<section class="regional-rating" aria-label="${region} rating" data-site-player="${esc(id)}"><h3>${region}</h3><div class="regional-value">${grouped?siteAccountRatingList(profiles,lookup,false):num(rating?.value)+siteProfileSupplement(profiles)}</div><p class="meta">${grouped?'Site account ratings':'3v3 Commanders'} · ds-rating.com</p>${additionalSiteRating(id,player.name,region,true)}<p class="muted rating-status">${rating?'<span data-i18n-skip>'+esc(rating.profileName)+'</span> · '+(rating.automatic?'Name/region match':'Selected profile')+' · '+date(rating.checked):esc(siteRatingStatus(id,region))}</p>${rating?`<a class="profile-link" href="${esc(grouped&&profiles.some(profile=>siteProfileRating(profile)?.kind==='estimated')?'https://ds-rating.com/player/'+rating.profileId:rating.url)}" target="_blank" rel="noreferrer">View on site ↗</a>`:''}<div class="rating-actions"><button type="button" class="rating-button" data-rating="${esc(id)}" data-region="${region}">${rating?'Choose different profile':profiles.length?'View accounts':'Find account'}</button>${rating&&!rating.automatic?`<button type="button" class="rating-button" data-refresh-rating="${esc(id)}" data-region="${region}">Refresh</button><button type="button" class="rating-button" data-unlink-rating="${esc(id)}" data-region="${region}">Unlink</button>`:''}</div></section>`;}).join('')}</div><p class="muted">Matching account ratings appear automatically by name and region. Each account keeps its own history.</p>`;}
function siteLobbyUnknown(name){const lookup=siteLookupForName(name,state?.lobby?.region),profiles=lookup?.profiles||[];return profiles.length?`<div class="live-unknown"><strong>Matching site accounts</strong>${siteAccountRatingList(profiles,lookup)}<p>Each account keeps its own history.</p></div>`:`<div class="live-unknown"><p>${esc(siteMissingRatingStatus(lookup))}</p></div>`;}
async function requestSiteRatings(ids=[],names=[],region=null){const now=Date.now(),ready=(key)=>now-(siteRequestTimes.get(key)||0)>120000;const selectedIds=[...new Set(ids)].filter(id=>/^\d-S2-\d-\d+$/.test(id)&&ready(id)).slice(0,40),selectedNames=[...new Map(names.map(siteName).filter(Boolean).map(name=>[name.toLowerCase(),name])).values()].filter(name=>ready(siteNameKey(name,region))).slice(0,12);if(!selectedIds.length&&!selectedNames.length)return;for(const id of selectedIds)siteRequestTimes.set(id,now);for(const name of selectedNames)siteRequestTimes.set(siteNameKey(name,region),now);try{await api('rating/sync',{ids:selectedIds,names:selectedNames,...(region?{region}:{})});automaticDataError='';}catch(error){for(const id of selectedIds)siteRequestTimes.delete(id);for(const name of selectedNames)siteRequestTimes.delete(siteNameKey(name,region));automaticDataError=error.message;}}
function observeSiteRatings(){if(typeof IntersectionObserver==='undefined')return;if(!siteObserver)siteObserver=new IntersectionObserver(entries=>{const ids=entries.filter(entry=>entry.isIntersecting).map(entry=>entry.target.dataset.sitePlayer);if(ids.length)void requestSiteRatings(ids);},{rootMargin:'100px'});siteObserver.disconnect();document.querySelectorAll('[data-site-player]').forEach(element=>siteObserver.observe(element));}
async function requestLobbySiteHistories(entries){
 const profiles=new Map(),region=['EU','Americas'].includes(state.lobby?.region)?state.lobby.region:null;
 for(const entry of entries){
  const candidates=(entry.candidates||[]).filter(candidate=>/^\d-S2-/.test(candidate.id));
  const keys=candidates.length===1?[candidates[0].id]:candidates.length?[]:[siteNameKey(entry.name)];
  for(const key of keys){const lookup=key.startsWith('name:')?siteLookupForName(entry.name,region):siteLookup(key);if(/ambig/i.test(lookup?.status||''))continue;const possible=lookup?.profiles||[],regional=region?possible.filter(profile=>profile.region===region):possible;if(regional.length!==1)continue;const profile=regional[0];profiles.set(profile.region+':'+profile.profileId,profile);}
 }
 for(const profile of profiles.values())await requestSiteProfile(profile);
}
async function maintainAutomaticData(){if(!state?.library)return;observeSiteRatings();if(automaticMonitorBusy)return;automaticMonitorBusy=true;try{if(view==='lobby'&&!document.hidden){await api('lobby/watch',{});const entries=state.lobby?.rosterEntries||[],ids=entries.flatMap(entry=>(entry.candidates||[]).map(candidate=>candidate.id)),names=entries.filter(entry=>!(entry.candidates||[]).some(candidate=>/^\d-S2-/.test(candidate.id))).map(entry=>entry.name);await requestSiteRatings(ids,names,state.lobby?.region);await requestLobbySiteHistories(entries);if(typeof liveSiteProfileChoices!=='undefined')for(const key of liveSiteProfileChoices.values()){const profile=typeof siteProfileFor==='function'?siteProfileFor(key):null;if(profile)await requestSiteProfile(profile);}}if(!document.hidden&&detailId&&document.getElementById('player-dialog')?.open)await requestSiteRatings([detailId]);if(!document.hidden&&matchSelection&&document.getElementById('match-dialog')?.open){const match=state.library.matches.find(item=>item.hash===matchSelection);if(match)await requestSiteRatings(match.players.map(player=>player.id));}}catch(error){automaticDataError=error.message;}finally{automaticMonitorBusy=false;}}
function matchRatingChange(match,id){return state?.library?.ratingChanges?.[match.hash]?.find(change=>change.playerId===id)||null;}
function currentMatchRating(id,name=''){
 const region=/^2-S2-/.test(id)?'EU':/^1-S2-/.test(id)?'Americas':null;
 if(!region)return {region:null,value:null};
 const player=typeof findPlayer==='function'?findPlayer(id):state?.library?.players?.find(player=>player.id===id);
 const rating=typeof regionRating==='function'?regionRating(player||{id,ratings:state?.library?.ratings?.[id]},region):siteRating(id,region);
 const {lookup,profiles}=siteRatingLookup(id,player?.name||name,region,rating);
 return {region,value:typeof rating?.value==='number'&&Number.isFinite(rating.value)?rating.value:null,lookup,profiles};
}
function ratingChangeCell(match,id,showCurrent=true){
 const cachedChange=matchRatingChange(match,id),change=cachedChange,available=typeof change?.delta==='number'&&Number.isFinite(change.delta),current=currentMatchRating(id,match.players?.find(player=>player.id===id)?.name);
 const value=current.value!==null?`<strong>${num(current.value)}</strong>${siteProfileSupplement(current.profiles)}`:current.profiles?.length?siteAccountRatingList(current.profiles,current.lookup,false):`<span class="site-rating-empty">${esc(siteMissingRatingStatus(current.lookup))}</span>`;
 return `<span class="rating-change rating-change-estimated" data-rating-source="dsr" data-site-player="${esc(id)}">${showCurrent?`<span class="rating-current" title="${esc(siteCurrentRatingLabel(current))}">${value}<small>${siteCurrentRatingLabel(current)}${current.region?' · '+esc(current.region):''}</small></span>`:''}<span class="rating-delta" title="${esc(change?.detail||'Waiting for rating data')}"><strong>${available?(change.kind==='confirmed'?'':'~')+(change.delta>=0?'+':'')+num(change.delta):'—'}</strong><small>${available?(change.kind==='confirmed'?'Published DSR Main':change.scope==='main_current'?'DSR Main estimate':'3v3 Commanders estimate'):'Change unavailable'}</small></span></span>`;
}
