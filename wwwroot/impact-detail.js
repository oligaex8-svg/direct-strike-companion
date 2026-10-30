'use strict';

const impactDetailCache=new Map(),impactDetailRequests=new Map(),impactDetailAttempts=new Map();
let impactSelection=null,impactDialogRevision='',impactUnitMetric='kills',impactGroupSummons=true,impactUnitSearch='',impactOpener=null;
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
const impactUnitNames={InfestedAbomination:'Aberration',HeroZagaraWaveUnit:'Zagara',HunterKillerZagara:'Hunter Killer',ZagaraRoach:'Roach',SwarmlingLightweight:'Swarmling',SpineCrawlerPermanent:'Spine Crawler',OverseerZagara:'Overseer',HonorGuard:'Honor Guard',TychusRattlesnakeDeployRevitalizer:'Revitalizer',TychusSiriusWarhoundTurret:'Warhound Turret',HornerAssaultDrone:'Assault Drone',ParasiticBombRelayDummy:'Parasitic Bomb (effect)'};
function impactUnitLabel(name){return String(Object.prototype.hasOwnProperty.call(impactUnitNames,name)?impactUnitNames[name]:name||'Unknown').replace(/_/g,' ').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2');}
const impactUnitMetrics=[['kills','Kills credited'],['damageDealt','Damage dealt'],['damageTaken','Damage received'],['impact','Impact'],['losses','Combat losses']];
function impactSelectedUnits(detail){return impactGroupSummons&&Array.isArray(detail?.unitGroups)?detail.unitGroups:detail?.units||[];}
function impactUnitScoreModel(detail){
 const rows=impactSelectedUnits(detail).filter(row=>row&&typeof row.name==='string');
 const definitions=[['damageDealt',40],['damageTaken',20],['armyValueKilled',30],['kills',10]];
 const channels=definitions.map(([key,weight])=>{const values=rows.map(row=>impactNumber(row[key])),complete=values.length>0&&values.every(value=>value!==null),scale=complete?Math.max(...values):0;return{key,weight,scale,complete,total:scale>0?values.reduce((sum,value)=>sum+value/scale,0):0};});
 const usable=channels.filter(channel=>channel.total>0);
 return {rows,usable,weight:usable.reduce((sum,channel)=>sum+channel.weight,0),incomplete:channels.some(channel=>!channel.complete)};
}
function impactScoreNode(row,model){
 const measured=model.usable.every(channel=>impactNumber(row[channel.key])!==null);
 return {...row,impact:model.weight&&measured?model.usable.reduce((sum,channel)=>sum+channel.weight/model.weight*(row[channel.key]/channel.scale)/channel.total*100,0):null,impactIncomplete:model.incomplete};
}
function impactUnitRecords(detail){const model=impactUnitScoreModel(detail);return model.rows.map(row=>impactScoreNode(row,model));}
function impactFamilyMatches(node,query,depth=0){return !!node&&depth<10&&(impactUnitLabel(node.name).toLocaleLowerCase().includes(query)||(node.children||[]).some(child=>impactFamilyMatches(child,query,depth+1)));}
function impactRankUnits(detail,metric,search=''){
 const query=search.trim().toLocaleLowerCase(),measurements=['damageDealt','damageTaken','impact'];
 return impactUnitRecords(detail).filter(row=>(measurements.includes(metric)||impactNumber(row[metric])!==null)&&(impactUnitLabel(row.name).toLocaleLowerCase().includes(query)||(impactGroupSummons&&impactFamilyMatches(row.breakdown,query))))
  .sort((a,b)=>(impactNumber(b[metric])??-1)-(impactNumber(a[metric])??-1)||impactUnitLabel(a.name).localeCompare(impactUnitLabel(b.name)));
}
function impactIsAggregateUnit(row){return /^(unknown|other)$/i.test(String(row?.name||'Unknown').trim());}
function impactUnitValue(row,metric){return metric==='impact'?impactPercent(impactNumber(row.impact))+(row.impact!==null&&row.impactIncomplete?'*':''):num(impactNumber(row[metric]));}
function impactUnitHighlights(detail,metric){
 const rows=impactRankUnits(detail,metric).filter(row=>!impactIsAggregateUnit(row)),highest=rows[0]?.[metric];
 if(!highest)return '—';
 return rows.filter(row=>row[metric]===highest).map(row=>unitBadge(row.name,'large')).join('')+' · '+num(highest);
}
function impactSummonBreakdown(row){
 if(!impactGroupSummons||!Number.isInteger(row.summonKills)||(!row.summonsProduced&&!row.summonKills&&!row.summonLosses))return '';
 return `<div class="impact-summon-breakdown"><span>Direct kills <b>${num(row.directKills)}</b></span><span>Summon kills <b>${num(row.summonKills)}</b></span><span>Recorded summons <b>${num(row.summonsProduced)}</b></span></div>${row.children?.length?`<div class="impact-summon-types"><span>Includes</span>: <span data-i18n-skip>${row.children.map(name=>esc(impactUnitLabel(name))).join(', ')}</span></div>`:''}`;
}
function impactDirectNode(node){
 const direct={...node,kills:node.directKills,losses:node.directLosses};
 for(const key of ['damageDealt','damageTaken','armyValueKilled']){
  const total=impactNumber(node[key]),children=(node.children||[]).map(child=>impactNumber(child[key]));
  const sum=children.reduce((n,value)=>n+(value??0),0);
  direct[key]=total===null||children.some(value=>value===null)||sum>total?null:total-sum;
 }
 return direct;
}
function impactOwnContribution(node,model){
 const own=impactScoreNode(impactDirectNode(node),model);
 return `<div class="impact-own-contribution"><span>Own contribution</span><b>${impactUnitValue(own,'impact')}</b><span>· ${num(node.directKills)} <span>kills</span></span></div>`;
}
function impactFamilyChildren(node,model,depth=0,max=Math.max(0,...model.rows.map(row=>impactNumber(impactUnitMetric==='impact'?impactScoreNode(row,model).impact:row[impactUnitMetric])||0))){
 if(!node.children?.length||depth>=8)return '';
 return `<ul class="impact-source-tree">${node.children.map(child=>{
  const scored=impactScoreNode(child,model),nested=!!child.children?.length,value=impactNumber(scored[impactUnitMetric]),fill=max&&value!==null?Math.min(1000,value/max*1000):0;
  return `<li class="impact-source-node" data-unit-source="${esc(child.name)}" data-source-kills="${num(child.kills)}" data-source-impact="${scored.impact??''}"><div class="impact-source-row">${unitIcon(child.name)}<div class="impact-source-name"><span data-i18n-skip>${esc(impactUnitLabel(child.name))}</span><small>${num(child.kills)} <span>kills</span>${nested?' · <span>includes descendants</span>':''}</small></div><div class="impact-source-score"><strong>${impactUnitValue(scored,'impact')}</strong><small>Impact</small></div></div>${!['kills','impact'].includes(impactUnitMetric)?`<div class="impact-source-metric"><span>${impactUnitMetrics.find(([key])=>key===impactUnitMetric)?.[1]||''}</span><b>${impactUnitValue(scored,impactUnitMetric)}</b></div>`:''}<svg class="impact-bar-track impact-source-track" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><rect class="impact-bar-background" width="1000" height="8"/><rect class="impact-bar-fill" width="${fill}" height="8"/></svg>${nested?impactOwnContribution(child,model):''}${impactFamilyChildren(child,model,depth+1,max)}</li>`;
 }).join('')}</ul>`;
}
function impactFamilyCard(row,model,max){
 const node=row.breakdown,hasChildren=!!node?.children?.length;
 return `<li class="impact-family-card"><div class="impact-family-heading">${unitIcon(row.name,'large')}<div class="impact-family-name"><strong data-i18n-skip>${esc(impactUnitLabel(row.name))}</strong><span>${hasChildren?'Family total':'Unit total'}</span></div><div class="impact-family-score"><strong>${impactUnitValue(row,'impact')}</strong><span>Impact</span></div></div><div class="impact-family-metric"><span>${impactUnitMetrics.find(([key])=>key===impactUnitMetric)?.[1]||'Kills credited'}</span><b>${impactUnitValue(row,impactUnitMetric)}</b></div><svg class="impact-bar-track" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><rect class="impact-bar-background" width="1000" height="8"/><rect class="impact-bar-fill" width="${max&&impactNumber(row[impactUnitMetric])!==null?row[impactUnitMetric]/max*1000:0}" height="8"/></svg>${hasChildren?`${impactOwnContribution(node,model)}${impactFamilyChildren(node,model,0,max)}`:!node?impactSummonBreakdown(row):''}${row.breakdownTruncated?'<p class="impact-tree-note">Some ancestry is grouped as Other; totals are preserved.</p>':''}</li>`;
}
function impactUnitsHtml(detail){
 const rows=impactRankUnits(detail,impactUnitMetric,impactUnitSearch),max=impactNumber(rows[0]?.[impactUnitMetric])||0,empty=impactUnitSearch.trim()&&impactRankUnits(detail,impactUnitMetric).length?'No matching unit records.':'Unit attribution unavailable.';
 const missingDamage=['damageDealt','damageTaken'].includes(impactUnitMetric)&&!impactSelectedUnits(detail).some(row=>impactNumber(row?.[impactUnitMetric])!==null);
 const model=impactUnitScoreModel(detail),families=impactGroupSummons&&Array.isArray(detail?.unitGroups);
 const bars=families?rows.slice(0,10).map(row=>impactFamilyCard(row,model,max)).join(''):rows.slice(0,10).map(row=>`<li>${unitIcon(row.name,'large')}<div class="impact-unit-result"><div class="impact-bar-label"><span data-i18n-skip>${esc(impactUnitLabel(row.name))}</span><strong>${impactUnitValue(row,impactUnitMetric)}</strong></div><svg class="impact-bar-track" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><rect class="impact-bar-background" width="1000" height="8"/><rect class="impact-bar-fill" width="${max&&impactNumber(row[impactUnitMetric])!==null?row[impactUnitMetric]/max*1000:0}" height="8"/></svg><div class="impact-unit-measures"><span>Damage dealt <b>${num(impactNumber(row.damageDealt))}</b></span><span>Damage received <b>${num(impactNumber(row.damageTaken))}</b></span><span>Impact <b>${impactUnitValue(row,'impact')}</b></span></div>${impactSummonBreakdown(row)}</div></li>`).join('');
 const table=rows.length?impactTable(['Unit','Kills credited','Damage dealt','Damage received','Impact','Combat losses'],rows.map(unit=>`<tr><td>${unitBadge(unit.name)}${impactSummonBreakdown(unit)}</td><td>${num(impactNumber(unit.kills))}</td><td>${num(impactNumber(unit.damageDealt))}</td><td>${num(impactNumber(unit.damageTaken))}</td><td>${impactUnitValue(unit,'impact')}</td><td>${num(impactNumber(unit.losses))}</td></tr>`)):`<p class="muted">${empty}</p>`;
 return `<section class="impact-section impact-units"><div class="impact-section-heading"><div><h3>Unit performance</h3></div><p>Kill credit records the finishing blow, not damage or assists.</p></div>
 <div class="impact-highlights"><div><span>Most finishing blows</span><strong>${impactUnitHighlights(detail,'kills')}</strong></div><div><span>Most units lost</span><strong>${impactUnitHighlights(detail,'losses')}</strong></div></div>
 <div class="impact-unit-controls"><label for="impact-metric">Rank by</label><select id="impact-metric" data-impact-metric>${impactUnitMetrics.map(([key,label])=>`<option value="${key}"${impactUnitMetric===key?' selected':''}>${label}</option>`).join('')}</select><label for="impact-search">Search units</label><input id="impact-search" data-impact-search type="search" value="${esc(impactUnitSearch)}" autocomplete="off"></div>
 <label class="impact-unit-grouping"><input id="impact-group-summons" type="checkbox" data-impact-group-summons${impactGroupSummons?' checked':''}${Array.isArray(detail?.unitGroups)?'':' disabled'}> <span>Group summons with summoner</span></label>
 ${impactGroupSummons&&Array.isArray(detail?.unitGroups)?'<p class="impact-tree-note">Child contributions are included in their parent. All percentages use your whole army as the denominator.</p>':''}
 <details class="impact-ability-note" data-impact-section="ability-attribution"><summary>Attack and ability damage unavailable</summary><p>This replay does not record damage by attack or ability. Summoned-unit kills can be traced; they are not a measurement of spell damage.</p>${(detail?.units||[]).some(row=>/Zagara/i.test(row.name))?'<p>Zagara’s split attack and Baneling cast cannot be separated from the recorded events.</p>':''}</details>
 ${missingDamage?'<p class="impact-measurement-note">This replay has no verified unit damage measurements. — means unavailable, not zero.</p>':''}
 ${rows.length?`<ol class="impact-bars${families?' impact-families':''}">${bars}</ol>${rows.length>10?'<p class="meta">Top 10 shown. Open the full table for all matching records.</p>':''}`:`<p class="muted">${empty}</p>`}
 <p class="meta">Unit Impact is a share of this player’s army contribution. * means incomplete measurements; with only kills recorded, it is kill share.</p>
 <details class="impact-unit-table" data-impact-section="units"><summary>Full unit table</summary>${table}</details>
 ${impactSelectedUnits(detail).some(impactIsAggregateUnit)?'<p class="meta">Unknown records are unattributed; Other groups less common units. These groups are excluded from individual unit highlights.</p>':''}<p class="meta">Losses count units lost; they do not measure damage taken or tanking.</p></section>`;
}
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
 const periods=impactPeriods(detail),waves=detail?.waves||[],hasDamage=[player.combat?.values?.DamageDealt,player.combat?.values?.DamageTaken,...(detail?.units||[]).flatMap(unit=>[unit.damageDealt,unit.damageTaken])].some(value=>impactNumber(value)!==null);
 const opponentRows=(detail?.opponents||[]).filter(row=>match.players.some(other=>other.id===row.playerId&&other.team!==player.team)).map(row=>{const other=match.players.find(other=>other.id===row.playerId);return `<tr><td data-i18n-skip>${esc(replayPlayerName(other))}</td><td>${num(row.kills)}</td><td>${num(row.losses)}</td></tr>`;});
 return `<div class="impact-report-context"><span class="impact-eyebrow">BATTLE REPORT</span><span>${replayClock(match.seconds)} · <span>${esc(replayTeamName(match,player.team))}</span></span></div><div class="impact-player-picker"><label for="impact-player">Player</label><select id="impact-player" data-impact-player>${options}</select><span>${esc(commanderName(player.commander))}</span></div>
 <div class="impact-summary">${stat('Impact',impactPercent(score?.value??null)+(score?.partial?'*':''),'Custom share of team combat')}${stat('Army value killed',num(metrics.killed),`${impactPercent(metrics.killedShare)} <span>of team</span>`)}${stat('Army value lost',num(metrics.lost),'Recorded mineral value')}${stat('Trade efficiency',trade,`${impactSigned(metrics.net)} <span>net minerals</span>`)}</div>
 <div class="impact-secondary">${stat('Enemy kills',num(metrics.kills),`${impactPercent(metrics.killShare)} <span>of team</span>`)}${stat('Combat losses',num(metrics.deaths))}${stat('Army value / min',num(metrics.perMinute),'Through the last recorded sample')}${stat('Scans',num(impactNumber(player.combat?.values?.ScanCount)),'Recorded activity')}</div>
 ${pending?'<p class="impact-status" role="status">Detailed replay data is upgrading automatically. Existing totals remain available.</p>':''}${error?'<p class="impact-status" role="status">Detailed data could not be loaded.</p><button type="button" class="rating-button" data-impact-retry>Retry</button>':''}
 <div class="impact-damage-summary">${stat('Damage dealt',num(impactNumber(player.combat?.values?.DamageDealt)))}${stat('Damage received',num(impactNumber(player.combat?.values?.DamageTaken)))}</div>
 <details class="impact-availability" data-impact-section="availability"><summary>${hasDamage?'Measurement availability':'Damage and ability data unavailable'}</summary><p>${hasDamage?'Player damage totals include HP and shields measured by SC2. Unit and ability damage remain unavailable; missing values are not zero.':'HP damage, damage taken and ability effects are not recorded by this parser. Scans are recorded activity, not ability impact.'}</p></details>
 ${impactUnitsHtml(detail)}
 <section class="impact-section"><h3>Contribution over time</h3>${impactTimeline(detail)}${periods.length?impactTable(['Recorded interval','Army value killed','Army value lost','Net trade'],periods.map(period=>`<tr><td>${replayClock(period.start)}–${replayClock(period.end)}</td><td>${num(period.killed)}</td><td>${num(period.lost)}</td><td>${impactSigned(impactTrade(period.killed,period.lost).net)}</td></tr>`)):''}<p class="meta">Changes between recorded samples; missing or reset counters stay unavailable.</p></section>
 <details class="impact-section" data-impact-section="opponents"><summary>Opponent breakdown</summary>${opponentRows.length?impactTable(['Opponent','Kills credited','Losses to opponent'],opponentRows):'<p class="muted">Opponent attribution unavailable.</p>'}<p class="meta">Kill credit records the finishing blow, not damage or assists.</p></details>
 <details class="impact-section" data-impact-section="waves"><summary>Spawn waves</summary>${waves.length?impactTable(['Time','Units recorded'],waves.map(wave=>`<tr><td>${replayClock(wave.seconds)}</td><td data-i18n-skip>${(wave.units||[]).map(unit=>`<span class="impact-wave-unit">${unitBadge(unit.name)} <span>× ${num(unit.count)}</span></span>`).join(' · ')}</td></tr>`)):'<p class="muted">Spawn composition unavailable.</p>'}<p class="meta">Waves use the parser's grouping of recorded spawns.</p></details>
 <details class="impact-section" data-impact-section="economy"><summary>Army and income</summary>${detail?.samples?.length?impactTable(['Time','Army value','Income / min'],detail.samples.map(sample=>`<tr><td>${replayClock(sample.seconds)}</td><td>${num(sample.armyValue)}</td><td>${num(sample.incomeRate)}</td></tr>`)):'<p class="muted">Army and income samples unavailable.</p>'}</details>
 ${detail?.samplesTruncated||detail?.wavesTruncated?'<p class="meta">Long replay details are sampled; endpoints are retained.</p>':''}
 <details class="impact-section" data-impact-section="formula"><summary>How impact is calculated</summary><p>40% damage dealt + 20% damage received + 30% army mineral value killed + 10% enemy kills.</p><p>Only complete measured channels with a positive total count. Remaining weights are renormalized: without damage, 75% army value and 25% kills. Damage received measures pressure absorbed, not survival efficiency.</p><p>Damage is included only when verified measurements exist. Healing and support effects remain unmeasured; losses, APM and shared middle control are not added as individual credit.</p></details>`;
}
function impactCurrentMatch(){return state?.library?.matches?.find(match=>match.hash===impactSelection?.hash);}
function renderImpactDialog(){
 const dialog=document.getElementById('impact-dialog'),match=impactCurrentMatch();if(!dialog?.open||!match)return;
 const player=match.players.find(player=>player.id===impactSelection.id);if(!player)return;
 const cached=impactDetailCache.get(match.hash),detail=cached?.players?.find(row=>row.id===player.id)?.impact||null;
 const revision=JSON.stringify([match.statsVersion,player.combat,detail,cached?.pending,cached?.error,impactSelection.id,impactUnitMetric,impactGroupSummons,impactUnitSearch,typeof interfaceLanguage==='string'?interfaceLanguage:'en']);
 if(revision===impactDialogRevision)return;impactDialogRevision=revision;
 const content=document.getElementById('impact-content'),scroll=content.scrollTop,open=[...content.querySelectorAll('[data-impact-section][open]')].map(node=>node.dataset.impactSection),focused=content.contains(document.activeElement)?document.activeElement?.id:null,selection=focused==='impact-search'?[document.activeElement.selectionStart,document.activeElement.selectionEnd,document.activeElement.selectionDirection]:null;
 document.getElementById('impact-title').textContent=replayPlayerName(player);
 content.innerHTML=impactBreakdownHtml(match,player,detail,(match.statsVersion||0)<2||cached?.pending||(!cached&&!detail),cached?.error);
 content.querySelectorAll('[data-impact-section]').forEach(node=>node.open=open.includes(node.dataset.impactSection));
 if(typeof translateInterface==='function')translateInterface();content.scrollTop=scroll;
 if(focused){const target=document.getElementById(focused);target?.focus({preventScroll:true});if(selection)target?.setSelectionRange(...selection);}
}
async function loadImpactDetails(force=false){
 const match=impactCurrentMatch();if(!match)return;
 const cached=impactDetailCache.get(match.hash),currentVersion=match.statsVersion||0;
 if(!force&&cached&&!cached.pending&&!cached.error&&cached.statsVersion===currentVersion)return;
 const attempt=impactDetailAttempts.get(match.hash);
 if(impactDetailRequests.has(match.hash)||(!force&&attempt?.version>=currentVersion&&Date.now()-attempt.at<10000))return;
 impactDetailAttempts.delete(match.hash);impactDetailAttempts.set(match.hash,{at:Date.now(),version:currentVersion});while(impactDetailAttempts.size>12)impactDetailAttempts.delete(impactDetailAttempts.keys().next().value);const hash=match.hash;
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
 impactSelection={hash,id};impactUnitMetric='kills';impactGroupSummons=true;impactUnitSearch='';impactDialogRevision='';const dialog=document.getElementById('impact-dialog');
 if(!dialog.open)dialog.showModal();renderImpactDialog();void loadImpactDetails();
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.impactMatch){impactOpener=button;showImpact(button.dataset.impactMatch,button.dataset.impactId);}
 if(button.hasAttribute('data-impact-retry'))void loadImpactDetails(true);
});
document.addEventListener('change',event=>{if(event.target.matches('[data-impact-player]')&&impactSelection){impactSelection.id=event.target.value;impactDialogRevision='';renderImpactDialog();}else if(event.target.matches('[data-impact-group-summons]')){impactGroupSummons=event.target.checked;renderImpactDialog();}else if(event.target.matches('[data-impact-metric]')){impactUnitMetric=impactUnitMetrics.some(([key])=>key===event.target.value)?event.target.value:'kills';renderImpactDialog();}});
document.addEventListener('input',event=>{if(event.target.matches('[data-impact-search]')&&!event.isComposing){impactUnitSearch=event.target.value;renderImpactDialog();}});
document.addEventListener('compositionend',event=>{if(event.target.matches('[data-impact-search]')){impactUnitSearch=event.target.value;renderImpactDialog();}});
document.getElementById('impact-dialog')?.addEventListener('close',()=>{
 const matches=[...document.querySelectorAll('[data-impact-match]')].filter(button=>button.dataset.impactMatch===impactSelection?.hash&&button.dataset.impactId===impactSelection?.id);
 const target=matches.find(button=>button.closest('dialog')?.open)||matches.find(button=>!button.closest('dialog'));
 (impactOpener?.isConnected?impactOpener:target)?.focus({preventScroll:true});
});
