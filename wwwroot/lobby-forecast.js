'use strict';

// Site choices are temporary display evidence. They never become replay identities.
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
 const lobby=state.lobby||{},hidden=!entries.length||lobby.held||!['pregame','manual'].includes(lobby.phase);
 if(hidden)return {hidden:true};
 let region=['EU','Americas'].includes(lobby.region)?lobby.region:null;
 const own=liveForecastOwnEntry(entries,region);
 if(!own)return {reason:'Your lobby account is not identified yet.'};
 region=region||dsstatsNativeRegion(own.id);
 if(!region)return {reason:'Waiting for the lobby region.'};
 if(entries.length!==6)return {reason:'Waiting for all six players.'};
 const teams=entries.map((entry,index)=>liveLobbyTeam(entry,index));
 if(teams.filter(team=>team===1).length!==3||teams.filter(team=>team===2).length!==3)return {reason:'Waiting for confirmed lobby teams.'};
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
 return {dsr,dsstats:stateReady?{win:win.delta,loss:lose.delta,basis:win.basis}:null,dsstatsPendingState:!stateReady&&win?.status==='ready'};
}
function renderLiveLobbyForecast(entries){
 const forecast=liveLobbyForecast(entries);
 if(forecast.hidden)return '<section class="live-rating-forecast" hidden></section>';
 const heading='<h3>Your rating change</h3>';
 if(forecast.reason)return `<section class="live-rating-forecast live-forecast-pending" aria-label="Your rating change">${heading}<span>${esc(forecast.reason)}</span></section>`;
 const source=(key,result)=>{
  const ready=typeof result?.win==='number'&&Number.isFinite(result.win)&&typeof result?.loss==='number'&&Number.isFinite(result.loss);
  const value=number=>'~'+(number<0?'-':'+')+num(Math.round(Math.abs(number)));
  const detail=key==='dsr'?result?.scope==='main_current'?'DSR main projection uses all six general site ratings and available game counts; assumes no leavers.':'DSR 3v3 projection requires all six Commanders ratings; current commander mirrors and mode experience may be unknown.':'dsstats projection uses current ratings, player consistency and team-relative confidence; assumes no leavers.';
  const pending=key==='dsstats'&&forecast.dsstatsPendingState?'Loading rating data…':'Waiting for ratings…';
  return `<div class="live-forecast-source" data-rating-source="${key}" title="${esc(ready?detail:'Waiting for the required site ratings. Name matches and team groups need verification.')}" role="group" aria-label="${key==='dsr'?(result?.scope==='main_current'?'DSR Main':'DSR 3v3'):'dsstats'}"><span class="rating-source-label" data-i18n-skip>${key==='dsr'?(result?.scope==='main_current'?'DSR Main':'DSR 3v3'):'dsstats'}</span>${ready?`<span><span>Win</span> <strong>${value(result.win)}</strong></span><span><span>Loss</span> <strong>${value(result.loss)}</strong></span>`:`<span class="live-forecast-missing">${pending}</span>`}</div>`;
 };
 return `<section class="live-rating-forecast" aria-label="Your rating change">${heading}${source('dsr',forecast.dsr)}${source('dsstats',forecast.dsstats)}</section>`;
}
