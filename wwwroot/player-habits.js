'use strict';

// The caller supplies history for one stable identity. Names never join histories.
// Shares the regular 3v3 Commanders eligibility and replay keys with picks.js.
function buildPlayerHabits(rows,{commander=null,limit=30,earlyGasSeconds=180}={}) {
 const summary = {total:0,scopeCommander:commander,
  gas:{known:0,unknown:0,noGas:0,early:0,earlySamples:0,shortSamples:0,earlyPercent:null,noGasPercent:null},
  timings:{firstGas:{value:null,count:0},secondGas:{value:null,count:0},tier2:{value:null,count:0},tier3:{value:null,count:0}}};
 const maximum = Number.isFinite(limit) ? Math.min(30,Math.max(0,Math.floor(limit))) : 30;
 const threshold = Number.isFinite(earlyGasSeconds) && earlyGasSeconds>0 ? earlyGasSeconds : 180;
 if (!Array.isArray(rows) || !maximum) return summary;
 const timestamp = value => {
  const parsed = typeof value==='string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
 };
 const ordered = rows.filter(row=>row?.player && pickEligibleMatch(row.match) && (commander===null || row.player.commander===commander))
  .map((row,position)=>({row,position,time:timestamp(row.match.time)}))
  .sort((a,b)=>(a.time===b.time ? 0 : a.time>b.time ? -1 : 1) || a.position-b.position);
 const seen = new Set(), samples = {firstGas:[],secondGas:[],tier2:[],tier3:[]};
 for (const {row} of ordered) {
  const {match,player} = row, key = pickMatchKey(match);
  if (seen.has(key)) continue;
  seen.add(key);
  summary.total++;
  const duration = match.seconds;
  // Both extractors require positive clocks. Zero is missing/ambiguous, not a time.
  const validTime = value => Number.isFinite(duration) && duration>0 && Number.isFinite(value) && value>0 && value<=duration;
  const economies = typeof player.id==='string' && player.id.trim() && Array.isArray(match.economy?.players)
   ? match.economy.players.filter(entry=>entry?.id===player.id) : [];
  const recorded = economies.length===1 ? economies[0].gasTimes : null;
  const gasTimes = Number.isFinite(duration) && duration>0 && Array.isArray(recorded) && recorded.every(validTime)
   ? [...recorded].sort((a,b)=>a-b) : null;
  if (gasTimes!==null) {
   summary.gas.known++;
   if (!gasTimes.length) summary.gas.noGas++;
   // Short games and known early departures cannot establish a full observation.
   const active = economies[0].activeSeconds;
   const observedSeconds = Number.isFinite(active) && active>=0 ? Math.min(duration,active) : duration;
   if (observedSeconds>=threshold) {
    summary.gas.earlySamples++;
    if (gasTimes.length && gasTimes[0]<=threshold) summary.gas.early++;
   } else summary.gas.shortSamples++;
  } else summary.gas.unknown++;
  const values = player.combat?.values;
  for (const [name,index,keyName] of [['firstGas',0,'FirstGasSeconds'],['secondGas',1,'SecondGasSeconds']]) {
   // A known timeline is authoritative, including a known absence of another gas.
   const value = gasTimes!==null ? gasTimes[index] : values?.[keyName];
   if (validTime(value)) samples[name].push(value);
  }
  for (const [name,keyName] of [['tier2','Tier2Seconds'],['tier3','Tier3Seconds']]) {
   const value = values?.[keyName];
   if (validTime(value)) samples[name].push(value);
  }
  if (summary.total===maximum) break;
 }
 summary.gas.earlyPercent = summary.gas.earlySamples ? 100*summary.gas.early/summary.gas.earlySamples : null;
 summary.gas.noGasPercent = summary.gas.known ? 100*summary.gas.noGas/summary.gas.known : null;
 for (const [name,values] of Object.entries(samples)) {
  values.sort((a,b)=>a-b);
  const middle = Math.floor(values.length/2);
  summary.timings[name] = {value:values.length ? (values.length%2 ? values[middle] : values[middle-1]+(values[middle]-values[middle-1])/2) : null,count:values.length};
 }
 return summary;
}
