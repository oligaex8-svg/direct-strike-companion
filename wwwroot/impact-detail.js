'use strict';

const impactDetailCache=new Map(),impactDetailRequests=new Map(),impactDetailAttempts=new Map();
let impactSelection=null,impactDialogRevision='';
function impactNumber(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function impactPercent(value){return value===null?'—':new Intl.NumberFormat(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{maximumFractionDigits:1}).format(value)+'%';}
function impactShare(match,player,key){
 const team=match.players.filter(other=>other.team===player.team),values=team.map(other=>impactNumber(other.combat?.values?.[key]));
 if(team.length!==3||values.some(value=>value===null))return null;
 const scale=Math.max(...values);if(!scale)return null;
 return (impactNumber(player.combat?.values?.[key])/scale)/values.reduce((sum,value)=>sum+value/scale,0)*100;
}
function impactTrade(killed,lost){
 killed=impactNumber(killed);lost=impactNumber(lost);
 const ratio=killed===null||lost===null||lost===0?null:killed/lost;
 return {net:killed===null||lost===null?null:killed-lost,ratio:Number.isFinite(ratio)?ratio:null,noLosses:lost===0&&killed>0};
}
function impactPeriods(detail){
 const samples=(detail?.samples||[]).filter(sample=>impactNumber(sample.seconds)!==null).slice().sort((a,b)=>a.seconds-b.seconds);
 if(samples.length<2)return [];
 const first=samples[0].seconds,last=samples.at(-1).seconds;
 if(last<=first)return [];
 const cuts=[0,...[1,2].map(part=>samples.findIndex(sample=>sample.seconds>=first+(last-first)*part/3)),samples.length-1];
 const unique=[...new Set(cuts)].filter(index=>index>=0),result=[];
 for(let index=1;index<unique.length;index++){
  const from=unique[index-1],to=unique[index],start=samples[from],end=samples[to];
  const delta=key=>{const slice=samples.slice(from,to+1).map(sample=>impactNumber(sample[key]));return slice.some((value,i)=>value===null||(i>0&&value<slice[i-1]))?null:slice.at(-1)-slice[0];};
  result.push({start:start.seconds,end:end.seconds,killed:delta('armyKilled'),lost:delta('armyLost')});
 }
 return result;
}
function impactDetailMetrics(match,player){
 const values=player.combat?.values||{},killed=impactNumber(values.MineralsKilledArmy),lost=impactNumber(values.MineralsLostArmy);
 const loop=impactNumber(player.combat?.lastSampleLoop),seconds=loop>0?loop/22.4:impactNumber(match.seconds);
 return {killed,lost,kills:impactNumber(values.UnitKills),deaths:impactNumber(values.CombatDeaths),
  killedShare:impactShare(match,player,'MineralsKilledArmy'),killShare:impactShare(match,player,'UnitKills'),
  perMinute:killed===null||!seconds?null:killed/(seconds/60),...impactTrade(killed,lost)};
}
function impactSigned(value){return value===null?'—':(value>0?'+':'')+num(value);}
function impactUnitLabel(name){return String(name||'Unknown').replace(/_/g,' ').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2');}
function impactTimeline(detail){
 const samples=(detail?.samples||[]).filter(sample=>impactNumber(sample.seconds)!==null&&impactNumber(sample.armyKilled)!==null&&impactNumber(sample.armyLost)!==null).slice().sort((a,b)=>a.seconds-b.seconds);
 if(samples.length<2||samples.at(-1).seconds<=samples[0].seconds)return '<p class="muted">Timeline unavailable in this replay.</p>';
 const first=samples[0].seconds,last=samples.at(-1).seconds,max=Math.max(1,...samples.flatMap(sample=>[sample.armyKilled,sample.armyLost]));
 const points=key=>samples.map(sample=>`${(12+(sample.seconds-first)/(last-first)*976).toFixed(2)},${(142-sample[key]/max*126).toFixed(2)}`).join(' ');
 return `<div class="impact-chart-legend"><span class="impact-killed">Army value killed</span><span class="impact-lost">Army value lost</span><span>${num(max)} minerals</span></div><svg class="impact-chart" viewBox="0 0 1000 156" role="img" aria-label="Recorded army value killed and lost over time"><path class="impact-axis" d="M12 12V142H988"/><polyline class="impact-killed" points="${points('armyKilled')}"/><polyline class="impact-lost" points="${points('armyLost')}"/></svg><div class="impact-chart-axis"><span>${replayClock(first)}</span><span>${replayClock(last)}</span></div>`;
}
function impactTable(headers,rows){return `<div class="impact-table-wrap"><table><thead><tr>${headers.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
function impactBreakdownHtml(match,player,detail,pending,error){
 const metrics=impactDetailMetrics(match,player),score=replayImpactScores(match).get(player.id),trade=metrics.noLosses?'<span>No recorded losses</span>':metrics.ratio===null?'—':new Intl.NumberFormat(typeof interfaceLocale==='function'?interfaceLocale():'en-GB',{maximumFractionDigits:2}).format(metrics.ratio)+'×';
 const stat=(label,value,note='')=>`<div><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;
 const options=match.players.map(other=>`<option data-i18n-skip value="${esc(other.id)}"${other.id===player.id?' selected':''}>${esc(replayPlayerName(other))}</option>`).join('');
 const periods=impactPeriods(detail),units=(detail?.units||[]).filter(row=>Number.isInteger(row.kills)&&row.kills>=0&&Number.isInteger(row.losses)&&row.losses>=0),waves=detail?.waves||[];
 const opponentRows=(detail?.opponents||[]).filter(row=>match.players.some(other=>other.id===row.playerId&&other.team!==player.team)).map(row=>{const other=match.players.find(other=>other.id===row.playerId);return `<tr><td data-i18n-skip>${esc(replayPlayerName(other))}</td><td>${num(row.kills)}</td><td>${num(row.losses)}</td></tr>`;});
 return `<div class="impact-player-picker"><label for="impact-player">Player</label><select id="impact-player" data-impact-player>${options}</select><span>${esc(commanderName(player.commander))}</span></div>
 <div class="impact-summary">${stat('Impact',impactPercent(score?.value??null),'Custom share of team combat')}${stat('Army value killed',num(metrics.killed),`${impactPercent(metrics.killedShare)} <span>of team</span>`)}${stat('Army value lost',num(metrics.lost),'Recorded mineral value')}${stat('Trade efficiency',trade,`${impactSigned(metrics.net)} <span>net minerals</span>`)}</div>
 <div class="impact-secondary">${stat('Enemy kills',num(metrics.kills),`${impactPercent(metrics.killShare)} <span>of team</span>`)}${stat('Combat losses',num(metrics.deaths))}${stat('Army value / min',num(metrics.perMinute),'Through the last recorded sample')}${stat('Scans',num(impactNumber(player.combat?.values?.ScanCount)))}</div>
 ${pending?'<p class="impact-status" role="status">Detailed replay data is upgrading automatically. Existing totals remain available.</p>':''}${error?'<p class="impact-status" role="status">Detailed data could not be loaded.</p><button type="button" class="rating-button" data-impact-retry>Retry</button>':''}
 <section class="impact-section"><h3>Contribution over time</h3>${impactTimeline(detail)}${periods.length?impactTable(['Recorded interval','Army value killed','Army value lost','Net trade'],periods.map(period=>`<tr><td>${replayClock(period.start)}–${replayClock(period.end)}</td><td>${num(period.killed)}</td><td>${num(period.lost)}</td><td>${impactSigned(impactTrade(period.killed,period.lost).net)}</td></tr>`)):''}<p class="meta">Changes between recorded samples; missing or reset counters stay unavailable.</p></section>
 <details class="impact-section" data-impact-section="opponents"><summary>Opponent breakdown</summary>${opponentRows.length?impactTable(['Opponent','Kills credited','Losses to opponent'],opponentRows):'<p class="muted">Opponent attribution unavailable.</p>'}<p class="meta">Kill credit records the finishing blow, not damage or assists.</p></details>
 <details class="impact-section" data-impact-section="units"><summary>Unit performance</summary>${units.length?impactTable(['Unit','Kills credited','Combat losses'],units.map(unit=>`<tr><td data-i18n-skip>${esc(impactUnitLabel(unit.name))}</td><td>${num(unit.kills)}</td><td>${num(unit.losses)}</td></tr>`)):'<p class="muted">Unit attribution unavailable.</p>'}${detail?.unitsTruncated?'<p class="meta">Less common units are grouped as Other.</p>':''}</details>
 <details class="impact-section" data-impact-section="waves"><summary>Spawn waves</summary>${waves.length?impactTable(['Time','Units recorded'],waves.map(wave=>`<tr><td>${replayClock(wave.seconds)}</td><td data-i18n-skip>${(wave.units||[]).map(unit=>`${esc(impactUnitLabel(unit.name))} × ${num(unit.count)}`).join(' · ')}</td></tr>`)):'<p class="muted">Spawn composition unavailable.</p>'}<p class="meta">Waves use the parser's grouping of recorded spawns.</p></details>
 <details class="impact-section" data-impact-section="economy"><summary>Army and income</summary>${detail?.samples?.length?impactTable(['Time','Army value','Income / min'],detail.samples.map(sample=>`<tr><td>${replayClock(sample.seconds)}</td><td>${num(sample.armyValue)}</td><td>${num(sample.incomeRate)}</td></tr>`)):'<p class="muted">Army and income samples unavailable.</p>'}</details>
 ${detail?.samplesTruncated||detail?.wavesTruncated?'<p class="meta">Long replay details are sampled; endpoints are retained.</p>':''}
 <details class="impact-section" data-impact-section="formula"><summary>How impact is calculated</summary><p>75% army mineral value killed + 25% enemy kills.</p><p>Each metric uses its share of the team total. Efficiency and timelines explain the result without adding arbitrary score weights.</p><p>HP damage, healing, shields and support contribution are unavailable. Shared middle control is not individual credit.</p></details>`;
}
function impactCurrentMatch(){return state?.library?.matches?.find(match=>match.hash===impactSelection?.hash);}
function renderImpactDialog(){
 const dialog=document.getElementById('impact-dialog'),match=impactCurrentMatch();if(!dialog?.open||!match)return;
 const player=match.players.find(player=>player.id===impactSelection.id);if(!player)return;
 const cached=impactDetailCache.get(match.hash),detail=cached?.players?.find(row=>row.id===player.id)?.impact||null;
 const revision=JSON.stringify([match.statsVersion,player.combat,detail,cached?.pending,cached?.error,impactSelection.id,typeof interfaceLanguage==='string'?interfaceLanguage:'en']);
 if(revision===impactDialogRevision)return;impactDialogRevision=revision;
 const content=document.getElementById('impact-content'),scroll=content.scrollTop,open=[...content.querySelectorAll('[data-impact-section][open]')].map(node=>node.dataset.impactSection),focused=content.contains(document.activeElement)?document.activeElement?.id:null;
 document.getElementById('impact-title').textContent=replayPlayerName(player);
 content.innerHTML=impactBreakdownHtml(match,player,detail,(match.statsVersion||0)<2||cached?.pending||(!cached&&!detail),cached?.error);
 content.querySelectorAll('[data-impact-section]').forEach(node=>node.open=open.includes(node.dataset.impactSection));
 if(typeof translateInterface==='function')translateInterface();content.scrollTop=scroll;
 if(focused)document.getElementById(focused)?.focus({preventScroll:true});
}
async function loadImpactDetails(force=false){
 const match=impactCurrentMatch();if(!match)return;
 const cached=impactDetailCache.get(match.hash),currentVersion=match.statsVersion||0;
 if(!force&&cached&&!cached.pending&&!cached.error&&cached.statsVersion===currentVersion)return;
 const attempt=impactDetailAttempts.get(match.hash);
 if(impactDetailRequests.has(match.hash)||(!force&&attempt?.version>=currentVersion&&Date.now()-attempt.at<10000))return;
 impactDetailAttempts.set(match.hash,{at:Date.now(),version:currentVersion});const hash=match.hash;
 const request=(async()=>{try{const result=await api('replay-impact/'+encodeURIComponent(hash));
  if(result?.hash!==hash||!Array.isArray(result.players))throw Error('Invalid replay impact response');
  impactDetailCache.set(hash,result);
 }catch{impactDetailCache.set(hash,{statsVersion:currentVersion,error:true});}
 finally{impactDetailRequests.delete(hash);while(impactDetailCache.size>12)impactDetailCache.delete(impactDetailCache.keys().next().value);if(impactSelection?.hash===hash){renderImpactDialog();
  if(document.getElementById('impact-dialog')?.open&&(impactCurrentMatch()?.statsVersion||0)>(impactDetailAttempts.get(hash)?.version||0))void loadImpactDetails();
 }}})();
 impactDetailRequests.set(hash,request);await request;
}
function refreshImpactDialog(){if(document.getElementById('impact-dialog')?.open){renderImpactDialog();void loadImpactDetails();}}
function showImpact(hash,id){
 const match=state.library.matches.find(match=>match.hash===hash),player=match?.players.find(player=>player.id===id);if(!player)return;
 impactSelection={hash,id};impactDialogRevision='';const dialog=document.getElementById('impact-dialog');
 if(!dialog.open)dialog.showModal();renderImpactDialog();void loadImpactDetails();
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.impactMatch)showImpact(button.dataset.impactMatch,button.dataset.impactId);
 if(button.hasAttribute('data-impact-retry'))void loadImpactDetails(true);
});
document.addEventListener('change',event=>{if(event.target.matches('[data-impact-player]')&&impactSelection){impactSelection.id=event.target.value;impactDialogRevision='';renderImpactDialog();}});
document.getElementById('impact-dialog')?.addEventListener('close',()=>{
 const matches=[...document.querySelectorAll('[data-impact-match]')].filter(button=>button.dataset.impactMatch===impactSelection?.hash&&button.dataset.impactId===impactSelection?.id);
 const target=matches.find(button=>button.closest('dialog')?.open)||matches.find(button=>!button.closest('dialog'));
 target?.focus({preventScroll:true});
});
