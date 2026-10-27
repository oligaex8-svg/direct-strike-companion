'use strict';

// Site choices are temporary display evidence. They never become replay identities.
function liveLobbyRegionContext(entries=state?.lobby?.rosterEntries||[]){
 const observed=state?.lobby?.region;
 if(['EU','Americas'].includes(observed))return {region:observed,inferred:false};
 const self=new Set(state?.library?.settings?.selfIds||[]),regions=new Set();let peers=0;
 for(const entry of entries){
  const known=new Set((entry.candidates||[]).filter(c=>!c.nameOnly&&!self.has(c.id)).map(c=>dsstatsNativeRegion(c.id)).filter(Boolean));
  if(known.size===1){regions.add([...known][0]);peers++;}
 }
 // Corroborating known peers can suggest a region, never persist an identity.
 // Contradictory regions cannot be settled by a majority or account ordering.
 if(peers>=2&&regions.size===1)return {region:[...regions][0],inferred:true};
 const own=liveForecastOwnEntry(entries,null);
 return {region:own?dsstatsNativeRegion(own.id):null,inferred:!!own};
}
function liveForecastOwnEntry(entries,region){
 const ids=(state.library.settings.selfIds||[]).filter(id=>!region||dsstatsNativeRegion(id)===region);
 const records=ids.map(id=>{
  const local=typeof ownProfileFor==='function'?ownProfileFor(id):null,player=findPlayer(id),account=state.library.accounts?.find(item=>item.id===id);
  return {id,names:new Set([local?.name,...local?.aliases||[],player?.name,...player?.aliases||[],account?.name].filter(Boolean).map(name=>siteName(name).toLowerCase()))};
 });
 const matches=[];
 entries.forEach((entry,index)=>{
  const explicit=(entry.candidates||[]).filter(candidate=>!candidate.nameOnly&&ids.includes(candidate.id));
  const possible=explicit.length?records.filter(record=>explicit.some(candidate=>candidate.id===record.id)):records.filter(record=>record.names.has(siteName(entry.name).toLowerCase()));
  if(possible.length===1)matches.push({index,id:possible[0].id});
 });
 return matches.length===1?matches[0]:null;
}
function liveForecastDsstatsProfile(id,name,region,allowNameFallback=false){
 const lookup=dsstatsLookup(id,name,region),native=!!dsstatsNativeRegion(id);
 const activity=profile=>Number.isFinite(Date.parse(profile.lastPlayed))?Date.parse(profile.lastPlayed):-Infinity;
 let profiles=[...lookup?.profiles||[]].filter(profile=>profile.region===region&&(!native||profile.nativeId===id));
 if(!profiles.length&&allowNameFallback)profiles=[...dsstatsLookup('',name,region)?.profiles||[]].filter(profile=>profile.region===region);
 return profiles
  .sort((a,b)=>activity(b)-activity(a)||b.games-a.games||String(a.nativeId).localeCompare(String(b.nativeId)))[0]||null;
}
function liveLobbyForecast(entries){
 const lobby=state.lobby||{},hidden=!entries.length||!['pregame','manual','match'].includes(lobby.phase);
 if(hidden){
  const reasons={off:'Match watch is off.',replay:'Replay viewing: waiting for a live lobby.',finished:'Match complete: waiting for a fresh lobby.',disconnected:'SC2 client is unavailable.'};
  return {hidden:true,reason:reasons[lobby.phase]||'Waiting for a live lobby roster.'};
 }
 if(lobby.held)return {reason:'Waiting for a fresh lobby roster.'};
 const context=liveLobbyRegionContext(entries);let region=context.region;
 const own=liveForecastOwnEntry(entries,region);
 if(!own)return {reason:region?'Your lobby account is not identified yet.':'Waiting for the lobby region.'};
 region=region||dsstatsNativeRegion(own.id);
 if(!region)return {reason:'Waiting for the lobby region.'};
 if(entries.length!==6)return {reason:'Waiting for all six players.'};
 let teams=entries.map((entry,index)=>liveLobbyTeam(entry,index));
 const estimatedTeams=teams.every(team=>team===0);
 // Match the two provisional groups already shown in the roster. This is a
 // scenario, not team evidence, and never writes manual teammate selections.
 if(estimatedTeams)teams=entries.map((_,index)=>index<3?1:2);
 if(teams.filter(team=>team===1).length!==3||teams.filter(team=>team===2).length!==3)return {reason:'Waiting for complete lobby teams.'};
 const players=[],basis=new Map(),mainBasis=new Map(),dsPlayers=[],ratings=new Map(),ratingState=new Map();
 entries.forEach((entry,index)=>{
  const candidates=(entry.candidates||[]).filter(candidate=>!candidate.nameOnly&&dsstatsNativeRegion(candidate.id)===region);
  const id=index===own.index?own.id:candidates.length===1?candidates[0].id:'name:'+siteName(entry.name).toLowerCase();
  const ownPlayer=index===own.index,player=findPlayer(id),linked=ownPlayer?ownRegionalRating(id,region):player?regionRating(player,region):null;
  const lookup=siteRatingLookup(id,entry.name,region,linked),profile=liveLobbyRatingProfile(lookup.profiles,linked,entry.name);
  // General site estimates are a different scope from commanders_3v3.
  const value=siteHasRating(linked)?linked.value:typeof profile?.rating==='number'&&Number.isFinite(profile.rating)?profile.rating:null;
  const slot='lobby:'+index;
  players.push({id:slot,team:teams[index],commander:''});basis.set(slot,{value,games:null});mainBasis.set(slot,dsrMainBasis(profile));
  const other=liveForecastDsstatsProfile(id,entry.name,region,!ownPlayer);
  dsPlayers.push({id:other?.nativeId||'',team:teams[index]});
  if(other){ratings.set(other.nativeId,other.rating);ratingState.set(other.nativeId,{consistency:other.consistency,confidence:other.confidence});}
 });
 const completeMain=[...mainBasis.values()].every(item=>typeof item.value==='number'&&Number.isFinite(item.value));
 const dsr=dsrProjectedChanges(players,completeMain?mainBasis:basis,completeMain?'main_current':'commanders_3v3').get('lobby:'+own.index);
 const match={mode:'Commanders',players:dsPlayers,winner:teams[own.index]};
 const win=dsstatsReplayChanges(match,ratings,ratingState).get(dsPlayers[own.index].id);
 const lose=dsstatsReplayChanges({...match,winner:teams[own.index]===1?2:1},ratings,ratingState).get(dsPlayers[own.index].id);
 const stateReady=win?.status==='ready'&&lose?.status==='ready'&&win.basis==='site-state'&&lose.basis==='site-state';
 return {region,inferredRegion:context.inferred,estimatedTeams,dsr,dsstats:stateReady?{win:win.delta,loss:lose.delta,basis:win.basis}:null,dsstatsPendingState:!stateReady&&win?.status==='ready'};
}
function renderLiveLobbyForecast(entries){
 const forecast=liveLobbyForecast(entries);
 const heading='<h3>Rating gain / loss</h3>';
 const source=(key,result)=>{
  const ready=typeof result?.win==='number'&&Number.isFinite(result.win)&&typeof result?.loss==='number'&&Number.isFinite(result.loss);
  const value=number=>'~'+(number<0?'-':'+')+num(Math.round(Math.abs(number)));
  const detail=key==='dsr'?result?.scope==='main_current'?'DSR main projection uses all six general site ratings and available game counts; assumes no leavers.':'DSR 3v3 projection requires all six Commanders ratings; current commander mirrors and mode experience may be unknown.':'dsstats projection uses current ratings, player consistency and team-relative confidence; assumes no leavers.';
  const pending=forecast.reason||(key==='dsstats'?forecast.dsstatsPendingState?'Loading rating data…':'Waiting for all six dsstats ratings.':result?.status==='invalid-basis'?'DSR rating data is invalid.':'Waiting for all six DSR ratings.');
  return `<div class="live-forecast-source" data-rating-source="${key}" title="${esc(ready?detail:pending)}" role="group" aria-label="${key==='dsr'?'DSR':'dsstats'}"><span class="rating-source-label" data-i18n-skip>${key==='dsr'?'DSR':'dsstats'}</span><span><span>Win</span> <strong>${ready?value(result.win):'—'}</strong></span><span><span>Loss</span> <strong>${ready?value(result.loss):'—'}</strong></span>${!ready&&!forecast.reason?`<span class="live-forecast-missing">${esc(pending)}</span>`:''}</div>`;
 };
 const context=[forecast.reason,forecast.region,forecast.inferredRegion?'Region inferred':'',forecast.estimatedTeams?'Estimated teams':'',forecast.dsr?.scope==='main_current'?'DSR Main':forecast.dsr?'DSR 3v3':''].filter(Boolean).map(esc).join(' · ');
 return `<section class="live-rating-forecast" aria-label="Rating gain / loss">${heading}${source('dsr',forecast.dsr)}${source('dsstats',forecast.dsstats)}${context?`<span class="live-forecast-context">${context}</span>`:''}</section>`;
}
