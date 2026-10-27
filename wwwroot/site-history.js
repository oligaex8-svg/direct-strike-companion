'use strict';

// Site IDs identify ds-rating.com profiles, never Battle.net accounts.
function siteIdentityKey(profile){return `site:${profile.region}:${profile.profileId}`;}
function siteProfileFor(id){
 const native=/^([12])-S2-/.exec(id||''),online=/^site:(EU|Americas):([1-9][0-9]*)$/.exec(id||'');
 if(online){
  const history=state?.library?.siteHistories?.[online[2]];
  if(history?.region===online[1])return history;
  return Object.values(state?.library?.siteLookups||{}).flatMap(lookup=>lookup.profiles||[]).find(profile=>profile.profileId===online[2]&&profile.region===online[1])||null;
 }
 if(!native)return null;
 const region=native[1]==='2'?'EU':'Americas';
 const selected=typeof ownRatingSlot==='function'?ownRatingSlot(id,region)?.rating:state?.library?.ratings?.[id]?.[region==='EU'?'eu':'americas'];
 if(selected?.profileId)return {profileId:selected.profileId,name:selected.profileName,region,rating:selected.value,checked:selected.checked};
 const lookup=state?.library?.siteLookups?.[id];
 if(/ambig/i.test(lookup?.status||''))return null;
 const profiles=(lookup?.profiles||[]).filter(profile=>profile.region===region);
 return profiles.length===1?profiles[0]:null;
}
function siteCommander(value){
 const name=String(value||'').toLowerCase().replace(/[ &]/g,'');
 if(['hanhorner','horner'].includes(name))return 'Horner';
 return [...commanderPortraits.keys()].find(commander=>commander.toLowerCase()===name)||'Unknown';
}
function siteTargetPlayer(id){return (typeof findPlayer==='function'?findPlayer(id):null)||(/^site:/.test(id)?siteProfileFor(id):null);}
function siteKnownOutcome(value){return value==='Win'?'Win':value==='Loss'?'Loss':'Unknown';}
function siteHistoryRows(ids){
 const rows=[],seen=new Set(),local=[];
 for(const id of new Set(ids))for(const row of combatRowsByPlayer.get(id)||[]){
  const key=pickMatchKey(row.match);if(seen.has(key))continue;
  seen.add(key);const item={...row,source:'replay'};rows.push(item);local.push(item);
 }
 for(const id of new Set(ids)){
  const profile=siteProfileFor(id),history=profile&&state?.library?.siteHistories?.[profile.profileId];
  if(!history||history.region!==profile.region)continue;
  for(const game of history.games||[]){
   if(game.mode!=='3v3 commanders'||!Number.isFinite(Date.parse(game.time))||!/^\d+$/.test(game.gameId||''))continue;
   const key='site:'+game.gameId;if(seen.has(key))continue;seen.add(key);
   // Conservatively omit overlapping observations. A timestamp collision is not
   // sufficient evidence to link the site record to a stable replay identity.
   if(local.some(row=>row.match.players?.some(player=>player.id===id)&&Math.abs(Date.parse(row.match.time)-Date.parse(game.time))<=6000))continue;
   const player={id,commander:siteCommander(game.commander),team:1,result:siteKnownOutcome(game.result)};
   rows.push({source:'site',player,match:{hash:key,time:game.time,seconds:game.minutes*60,winner:0,players:[player],source:'site'}});
  }
 }
 return rows.sort((a,b)=>Date.parse(b.match.time)-Date.parse(a.match.time));
}
function siteHistoryCounts(rows){return {replays:rows.filter(row=>row.source!=='site').length,site:rows.filter(row=>row.source==='site').length};}
function siteHistorySource(rows){const count=siteHistoryCounts(rows);return `${num(count.replays)} replays · ${num(count.site)} site games`;}

// Only complete site game evidence from a linked own profile enters the advisor.
// Replay-based personal stats, gas timings and private marks keep their own inputs.
function siteMatchupData(matches,selfIds){
 const output=[...matches],bindings=new Map();
 for(const id of selfIds||[]){
  const profile=siteProfileFor(id);if(!profile)continue;
  if(bindings.has(profile.profileId))bindings.set(profile.profileId,null);
  else bindings.set(profile.profileId,{id,region:profile.region});
 }
 const seen=new Set();
 for(const game of Object.values(state?.library?.siteGames||{})){
  if(game.mode!=='3v3 commanders'||!/^\d+$/.test(game.gameId||'')||seen.has(game.gameId)||!Number.isFinite(Date.parse(game.time))||!Number.isFinite(game.seconds)||game.seconds<0||game.players?.length!==6)continue;
  seen.add(game.gameId);
  if(new Set(game.players.map(player=>player.profileId)).size!==6)continue;
  const own=game.players.filter(player=>bindings.has(player.profileId));if(own.length!==1)continue;
  const binding=bindings.get(own[0].profileId);
  if(!binding)continue;
  if(matches.some(match=>match.players.some(player=>player.id===binding.id)&&Math.abs(Date.parse(match.time)-Date.parse(game.time))<=6000))continue;
  const players=game.players.map(player=>({id:bindings.get(player.profileId)?.id||`site:${binding.region}:${player.profileId}`,name:player.name,team:player.team+1,commander:siteCommander(player.commander),result:siteKnownOutcome(player.result)}));
  const match={hash:'site:'+game.gameId,mode:'Commanders',time:game.time,seconds:game.seconds,winner:0,players,source:'site'};
  if(!pickEligibleMatch(match))continue;
  const outcomes=[...new Set(players.map(player=>player.team))].map(team=>new Set(players.filter(player=>player.team===team).map(player=>player.result).filter(result=>result!=='Unknown')));
  if(outcomes.some(outcome=>outcome.size!==1)||[...outcomes[0]][0]===[...outcomes[1]][0])continue;
  output.push(match);
 }
 return {matches:output,selfIds};
}

// Link the already validated, deduplicated siteMatchupData rows to the directory.
// A website profile is not a Battle.net ID. Only a unique regional binding may
// project its shared-game evidence onto an existing native player row.
function encounterProfileFor(id){
 const native=/^([12])-S2-\d+-\d+$/.exec(id||'');if(!native)return null;
 const region=native[1]==='2'?'EU':'Americas';
 const selected=typeof ownRatingSlot==='function'?ownRatingSlot(id,region)?.rating:state?.library?.ratings?.[id]?.[region==='EU'?'eu':'americas'];
 // Automatic nickname searches display ratings, but cannot establish that two
 // accounts played together. Only a stored, user-selected link supplies proof.
 if(!selected?.profileId||selected.automatic||selected.region&&selected.region!==region)return null;
 return {profileId:String(selected.profileId),region};
}
function linkSiteEncounterMatches(matches,players){
 const bindings=new Map();
 const anchors=matches.filter(match=>match.source==='site').flatMap(match=>match.players.map(player=>player.id).filter(id=>/^[12]-S2-\d+-\d+$/.test(id||'')));
 for(const id of new Set([...players.map(player=>player.id),...anchors])){
  if(!/^[12]-S2-\d+-\d+$/.test(id||''))continue;
  const profile=encounterProfileFor(id);
  if(!profile||!['EU','Americas'].includes(profile.region)||!/^\d+$/.test(profile.profileId||''))continue;
  const key=siteIdentityKey(profile);
  bindings.set(key,bindings.has(key)&&bindings.get(key)!==id?null:id);
 }
 return matches.map(match=>{
  if(match.source!=='site')return match;
  // The selected own participant has already been converted to a native ID by
  // siteMatchupData. Validate its reverse binding too, not just opponents.
  const own=match.players.filter(player=>/^[12]-S2-\d+-\d+$/.test(player.id||''));
  if(!own.length||own.some(player=>{const profile=encounterProfileFor(player.id);return !profile||bindings.get(siteIdentityKey(profile))!==player.id;}))return null;
  const linked=match.players.map(player=>bindings.get(player.id)?{...player,id:bindings.get(player.id)}:player);
  // Never collapse two participants onto one account, even with a bad binding.
  if(new Set(linked.map(player=>player.id)).size!==linked.length)return null;
  return {...match,players:linked};
 }).filter(Boolean);
}
