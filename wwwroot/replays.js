'use strict';
let replayPage=1;
const REPLAYS_PER_PAGE=40;
const quickPlayerListPending=new Map();
function quickPlayerListName(name){
 if(typeof siteName==='function')return siteName(name);
 const display=typeof playerNameParts==='function'?playerNameParts(name).display:String(name??'').trim();
 return display.replace(/^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+/,'').trim();
}
function quickPlayerListTarget(player,nameOnly=false){
 if(!player||(state.library.settings.selfIds||[]).includes(player.id))return null;
 const name=quickPlayerListName(player.name),native=!nameOnly&&/^\d+-S2-\d+-\d+$/.test(String(player.id));
 if(!name)return null;
 const marks=state.library.marks||[],nameId='name:'+name.toLowerCase();
 const direct=native&&(marks.find(mark=>mark.id===player.id)||findPlayer(player.id)?.mark);
 const named=marks.find(mark=>mark.id===nameId)||marks.find(mark=>String(mark.id).startsWith('name:')&&quickPlayerListName(mark.name).toLowerCase()===name.toLowerCase());
 // Public site IDs and unconfirmed candidates never become replay identities.
 // Reuse an existing name entry until it is explicitly linked; moving lists
 // must not duplicate that entry or discard a note under an older clan key.
 return {id:direct?player.id:named?.id||(native?player.id:nameId),name};
}
function quickPlayerListMark(target){
 return (state.library.marks||[]).find(mark=>mark.id===target.id)||findPlayer(target.id)?.mark;
}
function replayQuickListButtons(player,options={}){
 const target=quickPlayerListTarget(player,options.nameOnly);if(!target)return '';
 const selected=quickPlayerListPending.get(target.id)?.list||quickPlayerListMark(target)?.list;
 return `<div class="replay-quick-lists${options.lobby?' live-quick-lists':''}">${(options.lobby?['losers','friends']:['friends','losers']).map(list=>{const active=selected===list,label=list==='friends'?'Friends':'Losers';return `<button type="button" class="replay-quick-list${active?' is-selected':''}" data-quick-player-list="${list}" data-quick-player-id="${esc(target.id)}" data-quick-player-name="${esc(target.name)}" aria-pressed="${active}" aria-label="${esc(label+' · '+target.name)}"${quickPlayerListPending.has(target.id)?' disabled':''}>${active?'✓':'+'} <span>${label}</span></button>`;}).join('')}</div>`;
}
function updateQuickPlayerListButtons(target){
 const pending=quickPlayerListPending.get(target.id),selected=pending?.list||quickPlayerListMark(target)?.list;
 document.querySelectorAll('[data-quick-player-id]').forEach(button=>{
  if(button.dataset.quickPlayerId!==target.id)return;
  const active=selected===button.dataset.quickPlayerList;
  button.disabled=!!pending;button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
  button.firstChild.textContent=(active?'✓':'+')+' ';
 });
}
function replayCompactRating(source,rating,status){
 const numeric=typeof rating?.value==='number'&&Number.isFinite(rating.value),estimated=rating?.kind==='estimated',general=rating?.kind==='site';
 const label=source==='ds-rating.com'?'DSR':'dsstats',missing=/unavailable|^Error:/i.test(status||'')?'Unavailable':/not found|no site match/i.test(status||'')?'No match':/unrated|no site rating/i.test(status||'')?'Unrated':'Loading…';
 const title=[source,general?'General site DSR':estimated?'Estimated':'Current 3v3 Commanders',status].filter(Boolean).join(' · ');
 return `<span class="replay-rating-cell" data-rating-source="${source==='ds-rating.com'?'dsr':'dsstats'}" title="${esc(title)}" aria-label="${esc(source+' · '+(numeric?(estimated?'~':'')+num(rating.value):missing))}"><span class="replay-rating-label" data-i18n-skip>${label}</span>${numeric?`<strong>${estimated?'~':''}${num(rating.value)}</strong>${general?'<small>Site DSR</small>':''}`:`<span class="replay-rating-missing">${esc(missing)}</span>`}</span>`;
}
function replayCompactPlayerRatings(player,current){
 const profile=sitePreferredProfiles(current.profiles||[])[0],rating=current.value!==null?{value:current.value,kind:'published'}:siteProfileRating(profile);
 const status=rating?siteCurrentRatingLabel(current):profile?siteProfileMissingRating(profile,current.lookup).value:siteMissingRatingStatus(current.lookup);
 const lookup=typeof dsstatsLookup==='function'?dsstatsLookup(player.id,player.name,current.region):null;
 // Replay identity is known: another native account with the same nickname is
 // never a substitute for this player's second-source rating.
 const dsProfile=(lookup?.profiles||[]).find(item=>item.nativeId===player.id&&(!current.region||item.region===current.region));
 const dsStatus=/unavailable|^Error:/i.test(lookup?.status||'')?lookup.status:dsProfile&&dsProfile.rating==null?'Unrated':lookup?.status;
 return `<span class="replay-name-rating replay-compact-ratings">${replayCompactRating('ds-rating.com',rating,status)}${replayCompactRating('dsstats',dsProfile?{value:dsProfile.rating}:null,dsStatus)}</span>`;
}
function replayPlayerRating(player,compact=false){
 const rating=currentMatchRating(player.id,player.name),label=siteCurrentRatingLabel(rating)+(rating.region?' · '+rating.region:'');
 if(compact)return replayCompactPlayerRatings(player,rating);
 const value=rating.value!==null?`<strong>${num(rating.value)}</strong>${siteProfileSupplement(rating.profiles)}`:rating.profiles?.length?siteAccountRatingList(rating.profiles,rating.lookup,false):`<span class="site-rating-empty">${esc(siteMissingRatingStatus(rating.lookup))}</span>`;
 return `<span class="replay-name-rating" title="${esc(label)}">${value}${additionalSiteRating(player.id,player.name,rating.region)}</span>`;
}
async function quickPlayerList(id,list,observedName){
 if(!['friends','losers'].includes(list)||quickPlayerListPending.has(id))return;
 const player=findPlayer(id)||(state.library.matches||[]).flatMap(match=>match.players).find(player=>player.id===id);
 const target=quickPlayerListTarget({id,name:observedName||player?.name},String(id).startsWith('name:'));
 if(!target||target.id!==id||quickPlayerListMark(target)?.list===list)return;
 const mark=state.library.marks?.find(mark=>mark.id===id)||player?.mark;
 quickPlayerListPending.set(id,{list});updateQuickPlayerListButtons(target);
 try{const result=await api('mark/list',{id,name:target.name,list});
  const saved={...mark,...result,id,name:result?.name||target.name,note:result?.note??mark?.note??'',list};state.library.marks??=[];
  const index=state.library.marks.findIndex(item=>item.id===id);if(index>=0)state.library.marks[index]=saved;else state.library.marks.push(saved);
  if(player)player.mark=saved;renderLibrary();if(document.getElementById('match-dialog')?.open&&matchSelection)showMatch(matchSelection);
  await refresh();}
 catch(error){toast(error.message);}
 finally{quickPlayerListPending.delete(id);updateQuickPlayerListButtons(target);}
}
function replayClock(seconds){if(seconds===null||seconds===undefined||!Number.isFinite(seconds))return '—';const value=Math.max(0,Math.floor(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
function replayTeamName(match,team){return `Team ${team}${match.players.some(p=>p.team===team&&state.library.settings.selfIds.includes(p.id))?' · your team':''}`;}
function replayPlayerEconomy(match,id){return match.economy?.players?.find(p=>p.id===id)||null;}
function replayGasTimes(match,player){const economy=replayPlayerEconomy(match,player.id);if(match.economy)return Array.isArray(economy?.gasTimes)?economy.gasTimes:null;const times=['FirstGasSeconds','SecondGasSeconds','ThirdGasSeconds'].map(key=>player.combat?.values?.[key]).filter(value=>Number.isFinite(value)&&value>0);return times.length?times:null;}
function replayGasChips(match,player){const times=replayGasTimes(match,player);if(times===null)return '<span class="muted">Gas timings unavailable</span>';return times.length?times.map((seconds,index)=>`<span class="gas-chip">Gas ${index+1} <strong>${replayClock(seconds)}</strong></span>`).join(' '):`<span class="muted">No gas taken recorded</span>`;}
function replayTeamSeconds(match,team){return match.economy?.middleAvailable?match.economy.middleIntervals.filter(interval=>interval.team===team).reduce((sum,interval)=>sum+interval.endSeconds-interval.startSeconds,0):null;}
function replayMiddleTimeline(match){
 const intervals=match.economy?.middleIntervals,duration=match.seconds;
 if(!match.economy?.middleAvailable||!Number.isFinite(duration)||duration<=0||!Array.isArray(intervals))return '';
 if(intervals.some((span,index)=>![1,2].includes(span.team)||!Number.isFinite(span.startSeconds)||!Number.isFinite(span.endSeconds)||span.startSeconds<0||span.endSeconds<span.startSeconds||span.endSeconds>duration||index>0&&span.startSeconds<intervals[index-1].endSeconds))return '';
 const neutral=intervals[0]?.startSeconds??duration;
 return `<svg class="middle-timeline" viewBox="0 0 ${duration} 8" preserveAspectRatio="none" role="img" aria-label="Middle-control timeline">${neutral>0?`<rect x="0" y="0" width="${neutral}" height="8" class="middle-neutral"><title>Neutral · 0:00–${replayClock(neutral)}</title></rect>`:''}${intervals.filter(span=>span.endSeconds>span.startSeconds).map(span=>`<rect x="${span.startSeconds}" y="0" width="${span.endSeconds-span.startSeconds}" height="8" class="team-${span.team}"><title>Team ${span.team} · ${replayClock(span.startSeconds)}–${replayClock(span.endSeconds)}</title></rect>`).join('')}</svg>`;
}
function replayMiddlePreview(match){
 const timeline=replayMiddleTimeline(match);
 if(!timeline)return '<div class="replay-middle-preview replay-middle-missing"><div class="replay-middle-labels"><span>Middle control</span><span>Unavailable</span></div><span class="replay-middle-unavailable" aria-hidden="true"></span></div>';
 return `<div class="replay-middle-preview"><div class="replay-middle-labels"><span class="team-1"><span>Team 1</span> <strong>${replayClock(replayTeamSeconds(match,1))}</strong></span><span>Middle control</span><span class="team-2"><span>Team 2</span> <strong>${replayClock(replayTeamSeconds(match,2))}</strong></span></div>${timeline}<div class="replay-middle-axis"><span>0:00</span><span>${replayClock(match.seconds)}</span></div></div>`;
}
function replayImpactCell(player,scores,hash=''){
 const result=scores.get(player.id),ready=typeof result?.value==='number'&&Number.isFinite(result.value),partial=ready&&result.components.length===1;
 const titles={missing:'Impact unavailable: incomplete combat data','no-combat':'Impact unavailable: no recorded combat',unsupported:'Impact requires a complete 3v3 roster'};
 const title=ready?partial?'Custom combat share; one usable metric':'Custom combat share within this team':titles[result?.status]||titles.missing;
 const value=ready?new Intl.NumberFormat(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{minimumFractionDigits:1,maximumFractionDigits:1}).format(result.value)+'%':'—';
 const content=`<span class="replay-impact-label">Impact</span><strong>${value}${partial?'<sup>*</sup>':''}</strong>`;
 return hash?`<button type="button" class="replay-impact-score" data-impact-match="${esc(hash)}" data-impact-id="${esc(player.id)}" aria-haspopup="dialog" title="View impact breakdown">${content}</button>`:`<span class="replay-impact-score" title="${esc(title)}">${content}</span>`;
}
function replayImpactGuide(){
 return `<details class="replay-impact-guide" data-replay-impact-guide><summary>Impact calculation</summary><p>Custom combat share within each team. Equal contributions are 33.3% each.</p><p><strong>75% army mineral value killed + 25% enemy kills.</strong></p><p>Each metric is divided by its team total, then the weighted shares are combined. Percentages are rounded to one decimal.</p><p>Only metrics recorded for all three teammates with a positive total are used. * marks one usable metric; — means no usable combat data. Support effects are not measured.</p></details>`;
}
function replayTeams(match){
 const impact=typeof replayImpactScores==='function'?replayImpactScores(match):new Map();
 return `<div class="replay-teams">${[1,2].map(team=>`<section class="replay-team team-${team}" aria-label="${esc(replayTeamName(match,team))}"><div class="replay-team-heading"><div class="replay-team-label">${esc(replayTeamName(match,team))}${match.winner===team?' · won':''}</div><span class="rating-source-label" data-rating-source="dsr" data-i18n-skip>DSR</span><span class="rating-source-label" data-rating-source="dsstats" data-i18n-skip>dsstats</span><span title="Custom combat share within this team">Impact</span></div>${match.players.filter(player=>player.team===team).map(player=>`<div class="replay-player" data-site-player="${esc(player.id)}">${commanderPortrait(player.commander,'small')}<div class="replay-player-identity"><div class="replay-name-line"><button type="button" class="player-name" data-player="${esc(player.id)}">${esc(replayPlayerName(player))}</button></div><span class="meta">${esc(commanderName(player.commander))}${state.library.settings.selfIds.includes(player.id)?' · you':''}</span></div>${replayPlayerRating(player,true)}${replayImpactCell(player,impact,match.hash)}</div>`).join('')}</section>`).join('')}</div>${replayMiddlePreview(match)}`;
}
function replayDsstatsChanges(match){
 const ratings=new Map(),ratingState=new Map();
 for(const player of match.players||[]){
  const region=typeof dsstatsNativeRegion==='function'?dsstatsNativeRegion(player.id):null;
  const lookup=region&&typeof dsstatsLookup==='function'?dsstatsLookup(player.id,player.name,region):null;
  const profile=lookup?.profiles?.find(item=>item.nativeId===player.id&&item.region===region);
  if(typeof profile?.rating==='number'&&Number.isFinite(profile.rating)){ratings.set(player.id,profile.rating);ratingState.set(player.id,{consistency:profile.consistency,confidence:profile.confidence});}
 }
 return typeof dsstatsReplayChanges==='function'?dsstatsReplayChanges(match,ratings,ratingState):new Map();
}
function replaySourceChange(source,change){
 const available=typeof change?.delta==='number'&&Number.isFinite(change.delta);
 const rounded=available?Math.round(Math.abs(change.delta)):null;
 const value=available?(change.kind==='confirmed'?'':'~')+(change.delta<0?'-':'+')+num(rounded):change?.status==='pending'?'Loading…':'—';
 return `<span class="replay-source-change" data-rating-source="${source}"><span class="rating-source-label" data-i18n-skip>${source==='dsr'?(change?.scope==='main_current'?'DSR Main':'DSR 3v3'):'dsstats'}</span><strong title="${esc(change?.detail||'Change unavailable')}"${available?'':' class="replay-change-missing"'}>${value}</strong></span>`;
}
function replayChangeSummary(match,id,dsstatsChanges){
 const cached=matchRatingChange(match,id),dsr=cached||{status:[1,2].includes(match.winner)?'pending':'unavailable',detail:'Waiting for rating data'};
 const other=(dsstatsChanges||replayDsstatsChanges(match)).get(id);
 const details={ready:'dsstats estimate uses current team ratings, neutral consistency (0.5), equal confidence and no leavers.', 'missing-ratings':'Needs current dsstats ratings for all six exact replay accounts.', 'unsupported-result':'Unknown or contradictory player result; departure effects are unavailable.',unsupported:'Requires a regular 3v3 Commanders replay with a known winner.'};
 const dsstats={...other,detail:other?.status==='ready'&&other.basis==='site-state'?'dsstats projection uses current ratings, player consistency and team-relative confidence; assumes no leavers.':details[other?.status]||'Change unavailable'};
 return `<span class="replay-compact-change" role="group" aria-label="Rating change"><span class="replay-change-heading">Rating change</span>${replaySourceChange('dsr',dsr)}${replaySourceChange('dsstats',dsstats)}</span>`;
}
function replayChangeGuide(){
 return `<details class="replay-impact-guide" data-replay-change-guide><summary>Rating change estimates</summary><p>Published changes are shown when verified. Otherwise estimates use all six ratings from one rating scope.</p><p><strong class="rating-source-label" data-rating-source="dsr" data-i18n-skip>DSR</strong> · <span>Main uses general site ratings; 3v3 uses Commanders ratings. Missing players never default to 2,000.</span></p><p><strong class="rating-source-label" data-rating-source="dsstats" data-i18n-skip>dsstats</strong> · <span>Uses public player consistency and team-relative confidence when all six rating states are available. Otherwise uses neutral consistency (0.5) and equal confidence. Assumes no leavers.</span></p><p>These are approximate changes; source history and departure effects can change the published result.</p><a href="https://github.com/ipax77/dsstats/blob/fc4e744c3a5a613fd1de1c42d5127712117725fc/src/server/dsstats.ratings/RatingService.Calc.cs" target="_blank" rel="noreferrer">dsstats calculation source</a></details>`;
}
function renderReplayHistory(){
 const matches=sortMatches(visibleMatches().filter(match=>[match.title,match.mode,...match.players.map(player=>replayPlayerName(player))].some(value=>value.toLowerCase().includes(query))));
 const pages=Math.max(1,Math.ceil(matches.length/REPLAYS_PER_PAGE));replayPage=Math.max(1,Math.min(replayPage,pages));const start=(replayPage-1)*REPLAYS_PER_PAGE,selected=matches.slice(start,start+REPLAYS_PER_PAGE);
 const pager=()=>`<div class="replay-pager"><span class="muted">${matches.length?start+1:0}–${Math.min(start+REPLAYS_PER_PAGE,matches.length)} of ${num(matches.length)} replays</span><div><button type="button" class="filter" data-replay-page="${replayPage-1}"${replayPage===1?' disabled':''}>Previous</button><span>${replayPage} / ${pages}</span><button type="button" class="filter" data-replay-page="${replayPage+1}"${replayPage===pages?' disabled':''}>Next</button></div></div>`;
 return matches.length?`${pager()}<div class="table-wrap replay-history-wrap"><table class="replay-history"><thead><tr><th>MATCH</th><th>TEAMS &amp; CURRENT RATINGS</th></tr></thead><tbody>${selected.map(match=>{const me=match.players.find(player=>state.library.settings.selfIds.includes(player.id)),outcome=me?playerOutcome(match,me):null;return `<tr><td class="replay-match-summary"><button type="button" class="replay-open" data-match="${esc(match.hash)}">${date(match.time)}</button><span class="meta">${time(match.time)}</span><div class="replay-match-result"><span class="pill ${outcome===false?'loss':outcome===null?'unknown':''}">${outcome===true?'Win':outcome===false?'Loss':me?'Undecided':'Other account'}</span><span class="replay-duration" title="Length">${replayClock(match.seconds)}</span></div>${me?replayChangeSummary(match,me.id):''}<button type="button" class="rating-button replay-details-link" data-match="${esc(match.hash)}">Details</button></td><td class="replay-match-teams">${replayTeams(match)}</td></tr>`;}).join('')}</tbody></table></div>${pager()}`:empty('No replays found','Check your folders in Settings, then scan again.');
}
function replayMiddleDetails(match){
 const economy=match.economy;
 if(!economy?.middleAvailable)return `<section class="middle-section"><h3>Middle control</h3><p class="muted">${esc(economy?.status||'Middle-control timings pending replay enrichment.')}</p></section>`;
 const intervals=economy.middleIntervals,neutral=intervals[0]?.startSeconds||0;
 const teamTotal=team=>{const players=match.players.filter(player=>player.team===team).map(player=>replayPlayerEconomy(match,player.id)?.estimatedMiddleMinerals);return players.every(Number.isFinite)?players.reduce((sum,value)=>sum+value,0):null;};
 return `<section class="middle-section"><h3>Middle control</h3><div class="middle-totals">${[1,2].map(team=>`<div class="team-${team}"><span>${esc(replayTeamName(match,team))}</span><strong>${replayClock(replayTeamSeconds(match,team))} held</strong><small>Estimated team bonus · ${teamTotal(team)===null?'—':num(teamTotal(team))+' minerals'}</small></div>`).join('')}</div><p class="muted">${neutral?`Neutral until ${replayClock(neutral)}. `:''}Middle income is calculated at ${num(economy.middleIncomeRate)} mineral/sec per active player. This is an estimate, separate from the replay’s resource totals.</p><svg class="middle-timeline" viewBox="0 0 ${match.seconds} 14" preserveAspectRatio="none" role="img" aria-label="Middle-control timeline">${neutral?`<rect x="0" y="0" width="${neutral}" height="14" class="middle-neutral"><title>Neutral · 0:00–${replayClock(neutral)}</title></rect>`:''}${intervals.map(interval=>`<rect x="${interval.startSeconds}" y="0" width="${interval.endSeconds-interval.startSeconds}" height="14" class="team-${interval.team}"><title>Team ${interval.team} · ${replayClock(interval.startSeconds)}–${replayClock(interval.endSeconds)}</title></rect>`).join('')}</svg><details class="middle-periods"><summary>All middle holding periods · ${intervals.length}</summary><div class="middle-period-grid">${intervals.map(interval=>`<div class="team-${interval.team}"><span>Team ${interval.team}</span><strong>${replayClock(interval.startSeconds)} → ${replayClock(interval.endSeconds)}</strong><small>${replayClock(interval.endSeconds-interval.startSeconds)} held</small></div>`).join('')}</div></details></section>`;
}
function replayMatchDetails(match){
 const impact=typeof replayImpactScores==='function'?replayImpactScores(match):new Map();
 const dsstatsChanges=replayDsstatsChanges(match);
 return `<p class="muted">3v3 Commanders · ${replayClock(match.seconds)} · Recorded teams and gas timings</p>${replayChangeGuide()}${replayImpactGuide()}<div class="match-team-grid">${[1,2].map(team=>`<section class="match-team team-${team}"><h3>${esc(replayTeamName(match,team))}${match.winner===team?' · won':''}</h3>${match.players.filter(player=>player.team===team).map(player=>{
  const row={match,player},economy=replayPlayerEconomy(match,player.id);
  return `<article class="match-player"><div class="match-player-heading">${commanderPortrait(player.commander,'medium')}<div class="match-player-identity"><div class="replay-name-line"><button type="button" class="player-name" data-player="${esc(player.id)}">${esc(replayPlayerName(player))}</button></div><span class="meta">${esc(commanderName(player.commander))}${state.library.settings.selfIds.includes(player.id)?' · you':''}</span></div>${replayQuickListButtons(player)}</div>
   <div class="match-player-rating-line">${replayPlayerRating(player,true)}${replayImpactCell(player,impact,match.hash)}${replayChangeSummary(match,player.id,dsstatsChanges)}</div>
   <div class="gas-timings" aria-label="Gas timings for ${esc(replayPlayerName(player))}">${replayGasChips(match,player)}</div>
   <div class="match-player-stats">${[['Enemy kills','UnitKills'],['Combat losses','CombatDeaths'],['Army minerals killed','MineralsKilledArmy'],['Scans','ScanCount']].map(([label,key])=>`<span>${label}<strong>${formatCombat(combatValue(row,key),key)}</strong></span>`).join('')}<span>Middle held while active<strong>${replayClock(economy?.middleHeldSeconds)}</strong></span><span>Middle bonus · estimated<strong>${economy?.estimatedMiddleMinerals===null||economy?.estimatedMiddleMinerals===undefined?'—':num(economy.estimatedMiddleMinerals)+' minerals'}</strong></span></div>
   <details class="replay-rating-evidence" data-replay-rating-details="${esc(player.id)}"><summary>Rating details</summary>${replayPlayerRating(player)}<p class="meta">Published ratings use 3v3 Commanders in the player region. Estimated labels identify the site estimate. ~ marks an estimated change.</p></details>
  </article>`;
 }).join('')}</section>`).join('')}</div>${replayMiddleDetails(match)}${combatExplanation()}`;
}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.replayPage){replayPage=Number(button.dataset.replayPage);renderLibrary();}});
document.addEventListener('click',event=>{const button=event.target.closest('[data-quick-player-list]');if(button&&!button.disabled)void quickPlayerList(button.dataset.quickPlayerId,button.dataset.quickPlayerList,button.dataset.quickPlayerName);});
