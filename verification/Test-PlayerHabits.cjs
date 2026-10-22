'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],context=vm.createContext({});
for (const file of ['picks.js','player-habits.js']) vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const build=(rows,options)=>{context.rows=rows;context.options=options;return JSON.parse(JSON.stringify(vm.runInContext('buildPlayerHabits(rows,options)',context)));};
const check=(name,run)=>{run();checks.push(name);};
let serial=0;
function row(gasTimes,values={},extra={}) {
 const player={id:'1-S2-1-123',name:'Shared name',team:1,commander:'Artanis',combat:{values}};
 const match={hash:`match-${serial++}`,time:'2026-10-07T12:00:00Z',mode:'Commanders',seconds:600,
  players:[player,...Array.from({length:5},(_,i)=>({id:`other-${i}`,team:i<2?1:2,commander:'Swann'}))],
  economy:{players:[{id:player.id,gasTimes}]},...extra};
 return {match,player};
}
check('Empty and malformed histories have unavailable rates and timings',()=>{
 for(const rows of [null,[],[null,{}, {match:{}}]]) {const s=build(rows);assert.equal(s.total,0);assert.equal(s.gas.earlyPercent,null);assert.equal(s.timings.firstGas.value,null);}
});
check('Known no gas and missing attribution have separate denominators',()=>{
 const s=build([row([]),row(null),row(undefined),row([180]),row([181])]);
 assert.deepEqual(s.gas,{known:3,unknown:2,noGas:1,early:1,earlySamples:3,shortSamples:0,earlyPercent:100/3,noGasPercent:100/3});
});
check('Gas by 3:00 includes the exact boundary and excludes censored short games',()=>{
 const s=build([row([180],{}, {seconds:180}),row([10],{}, {seconds:179}),row([],{}, {seconds:90}),row([])]);
 assert.equal(s.gas.early,1);assert.equal(s.gas.earlySamples,2);assert.equal(s.gas.earlyPercent,50);assert.equal(s.gas.shortSamples,2);assert.equal(s.gas.noGasPercent,50);
});
check('Custom threshold and invalid threshold fallback are deterministic',()=>{
 const rows=[row([200]),row([250])];assert.equal(build(rows,{earlyGasSeconds:210}).gas.earlyPercent,50);assert.equal(build(rows,{earlyGasSeconds:0}).gas.earlyPercent,0);
});
check('Known early departures are censored while missing active clocks use game duration',()=>{
 const rows=[row([10]),row([]),row([180]),row([]),row([10])];
 rows[0].match.economy.players[0].activeSeconds=179;
 rows[1].match.economy.players[0].activeSeconds=0;
 rows[2].match.economy.players[0].activeSeconds=180;
 rows[3].match.economy.players[0].activeSeconds=null;
 const s=build(rows);assert.equal(s.gas.known,5);assert.equal(s.gas.earlySamples,3);assert.equal(s.gas.shortSamples,2);assert.equal(s.gas.early,2);assert.equal(s.gas.noGas,2);
});
check('Sorted reliable timelines override conflicting legacy timing without mutation',()=>{
 const r=row([250,10,180],{FirstGasSeconds:99,SecondGasSeconds:98});const before=JSON.stringify(r),s=build([r]);
 assert.equal(s.timings.firstGas.value,10);assert.equal(s.timings.secondGas.value,180);assert.equal(JSON.stringify(r),before);
});
check('Known empty and single-entry timelines never invent absent gas from combat',()=>{
 const s=build([row([],{FirstGasSeconds:10,SecondGasSeconds:20}),row([30],{SecondGasSeconds:20})]);
 assert.deepEqual(s.timings.firstGas,{value:30,count:1});assert.deepEqual(s.timings.secondGas,{value:null,count:0});
});
check('Null or absent economy supports observed combat timing only',()=>{
 const s=build([row(null,{FirstGasSeconds:40,SecondGasSeconds:90}),row(null,{FirstGasSeconds:60},{economy:null})]);
 assert.equal(s.gas.known,0);assert.equal(s.gas.noGasPercent,null);assert.deepEqual(s.timings.firstGas,{value:50,count:2});assert.deepEqual(s.timings.secondGas,{value:90,count:1});
});
check('Duplicate or wrong economy identities cannot establish no gas',()=>{
 const a=row([]);a.match.economy.players.push({id:a.player.id,gasTimes:[]});const b=row([]);b.match.economy.players[0].id='different-id';
 const s=build([a,b]);assert.equal(s.gas.known,0);assert.equal(s.gas.unknown,2);
});
check('Any invalid timeline entry leaves attribution unknown',()=>{
 const rows=[0,-1,601,NaN,Infinity,null,'10'].map(value=>row([10,value]));rows.push(row('not-an-array'));
 const s=build(rows);assert.equal(s.gas.unknown,8);assert.equal(s.timings.firstGas.count,0);
});
check('Invalid timeline still permits positive in-range observed combat fallback',()=>{
 const s=build([row([0],{FirstGasSeconds:20,SecondGasSeconds:100})]);assert.equal(s.gas.known,0);assert.equal(s.timings.firstGas.value,20);assert.equal(s.timings.secondGas.value,100);
});
check('Invalid durations cannot establish a timeline or observed timing',()=>{
 const s=build([0,-10,null,NaN,Infinity,'600'].map(seconds=>row([],{FirstGasSeconds:10,Tier2Seconds:20},{seconds})));
 assert.equal(s.gas.known,0);assert.equal(s.timings.firstGas.count,0);assert.equal(s.timings.tier2.count,0);
});
check('Tier medians use finite positive in-game clocks including game end',()=>{
 const rows=[row([],{Tier2Seconds:100,Tier3Seconds:600}),row([],{Tier2Seconds:200,Tier3Seconds:400}),row([],{Tier2Seconds:300}),
  ...[0,-1,601,null,NaN,Infinity,'100'].map(value=>row([],{Tier2Seconds:value,Tier3Seconds:value}))];
 const s=build(rows);assert.deepEqual(s.timings.tier2,{value:200,count:3});assert.deepEqual(s.timings.tier3,{value:500,count:2});
});
check('Missing and zero combat timing never becomes a timing or a no-tech fraction',()=>{
 const s=build([row(null),row(null,{FirstGasSeconds:0,SecondGasSeconds:0,Tier2Seconds:0,Tier3Seconds:0})]);
 assert.deepEqual(Object.keys(s.timings),['firstGas','secondGas','tier2','tier3']);for(const sample of Object.values(s.timings))assert.deepEqual(sample,{value:null,count:0});
});
check('Ineligible modes, player counts and team partitions are excluded',()=>{
 const a=row([],{},{mode:'Standard'}),b=row([]);b.match.players.pop();const c=row([]);c.match.players[2].team=2;const d=row([]);d.match.players[5].team=3;const e=row([]);e.match.players[0].team='1';
 assert.equal(build([a,b,c,d,e,row([])]).total,1);
});
check('Commander scope filters before the recent cap',()=>{
 const old=row([100],{},{time:'2026-01-01'}),newer=row([10],{},{time:'2026-10-07'});newer.player.commander='Swann';
 const scoped=build([newer,old],{commander:'Artanis',limit:1});assert.equal(scoped.scopeCommander,'Artanis');assert.equal(scoped.total,1);assert.equal(scoped.timings.firstGas.value,100);assert.equal(build([newer,old],{limit:1}).timings.firstGas.value,10);
});
check('Recent distinct replays deduplicate hashes and object identity before cap',()=>{
 const old=row([100],{},{hash:'duplicate',time:'2026-01-01'}),newer=row([10],{},{hash:'duplicate',time:'2026-10-07'}),other=row([30],{},{time:'2026-02-01'});
 const s=build([old,newer,newer,other],{limit:2});assert.equal(s.total,2);assert.equal(s.timings.firstGas.value,20);
 const unhashed=row([20],{},{hash:''}),different=row([40],{},{hash:''});assert.equal(build([unhashed,unhashed,different]).total,2);
});
check('Stable tied and unavailable timestamps preserve input order',()=>{
 const first=row([20]),second=row([40]),invalid=row([60],{},{time:'invalid'});assert.equal(build([first,second,invalid],{limit:1}).timings.firstGas.value,20);
 assert.equal(build([invalid,row([80],{},{time:null})],{limit:1}).timings.firstGas.value,60);
});
check('History limit caps at thirty and handles zero, fractional and invalid options',()=>{
 const rows=Array.from({length:35},(_,i)=>row([i+1]));assert.equal(build(rows,{limit:100}).total,30);assert.equal(build(rows,{limit:0}).total,0);assert.equal(build(rows,{limit:2.9}).total,2);assert.equal(build(rows,{limit:NaN}).total,30);
});
check('Exact stable identities match economy despite identical display names',()=>{
 const a=row([20]);a.match.economy.players.push({id:'different-id',gasTimes:[]});assert.equal(build([a]).gas.noGas,0);assert.equal(build([a]).timings.firstGas.value,20);
});
const report={passed:checks.length,failed:0,checks};
fs.writeFileSync(path.join(__dirname,'player-habits-tests.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
