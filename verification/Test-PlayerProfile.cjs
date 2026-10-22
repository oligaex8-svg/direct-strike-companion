'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({}),checks=[];
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
const outcome=app.split(/\r?\n/).find(line=>line.startsWith('function playerOutcome('));
assert.ok(outcome,'The profile must use the current authoritative playerOutcome helper');
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/player-names.js'),'utf8'),context);
vm.runInContext(outcome,context);
for(const file of ['commanders.js','profile.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
let sequence=0;
function row(commander,result='Win',day=1,options={}) {
 return {match:{hash:`game-${++sequence}`,time:`2026-10-${String(day).padStart(2,'0')}T10:00:00Z`,winner:0,...options.match},
  player:{id:'eu',name:'SameName',team:1,commander,result,...options.player}};
}
const sample=(commander,wins,losses,day=1)=>[
 ...Array.from({length:wins},()=>row(commander,'Win',day)),
 ...Array.from({length:losses},()=>row(commander,'Loss',day))
];
function build(rows) { context.rows=rows;return vm.runInContext('buildPlayerShowcase(rows)',context); }
function check(name,body) { body();checks.push(`PASS: ${name}`); }

check('Player results use the authoritative team winner before result fallback',()=>{
 const result=build([row('Raynor','Loss',1,{match:{winner:2},player:{team:2}}),
  row('Raynor','Win',2,{match:{winner:1},player:{team:2}}),row('Nova','Win'),row('Nova','Unknown')]);
 assert.equal(result.total,4);assert.equal(result.wins,2);assert.equal(result.losses,1);assert.equal(result.unknown,1);
 assert.equal(result.winRate,200/3);
});
check('Linked regional rows count a shared hash once and preserve distinct games',()=>{
 const shared=row('Nova','Win');
 const result=build([shared,{match:{...shared.match},player:{...shared.player,id:'us'}},row('Raynor','Loss')]);
 assert.equal(result.total,2);assert.equal(result.wins,1);assert.equal(result.losses,1);
 assert.equal(result.mostPlayed.games,1);assert.equal(result.mostPlayed.share,50);
 const missingHash=row('Nova','Win',1,{match:{hash:''}});
 assert.equal(build([missingHash,{...missingHash,match:{...missingHash.match}}]).total,2);
});
check('Separately selected same-name identities retain separate performance',()=>{
 const eu=row('Raynor','Win'),us=row('Nova','Loss',1,{player:{id:'us'}});
 assert.equal(build([eu]).winRate,100);assert.equal(build([us]).winRate,0);
 assert.equal(build([eu]).mostPlayed.commander,'Raynor');assert.equal(build([us]).mostPlayed.commander,'Nova');
});
check('Unknown and unselected factions stay in total outcomes but never become showcase cards',()=>{
 const result=build([row('Terran','Win',10),row('Unknown','Loss',11),row('','Unknown',12),row('Raynor','Win',1)]);
 assert.equal(result.total,4);assert.equal(result.wins,2);assert.equal(result.losses,1);assert.equal(result.unknown,1);
 assert.equal(result.mostPlayed.commander,'Raynor');assert.equal(result.lastPlayed.commander,'Raynor');
 assert.equal(result.mostPlayed.share,25);assert.equal(result.bestPlayed.length,0);
 const unknownOnly=build([row('Terran','Win')]);
 assert.equal(unknownOnly.mostPlayed,null);assert.equal(unknownOnly.lastPlayed,null);assert.equal(unknownOnly.winRate,100);
});
check('Undecided outcomes do not dilute commander rates or qualify four decided games',()=>{
 const result=build([...sample('Nova',2,2),...Array.from({length:5},()=>row('Nova','Unknown',2))]);
 assert.equal(result.mostPlayed.games,9);assert.equal(result.mostPlayed.decided,4);
 assert.equal(result.mostPlayed.unknown,5);assert.equal(result.mostPlayed.winRate,50);assert.equal(result.bestPlayed.length,0);
 const unknown=build([row('Raynor','Unknown')]);
 assert.equal(unknown.winRate,null);assert.equal(unknown.lastPlayed.winRate,null);
});
check('Best played requires five decided games and never fills slots with small samples',()=>{
 const result=build([...sample('Raynor',3,2),...sample('Nova',1,0),...sample('Tychus',4,0)]);
 assert.equal(result.bestMinimum,5);assert.equal(result.bestPlayed.length,1);assert.equal(result.bestPlayed[0].commander,'Raynor');
 assert.equal(result.bestPlayed[0].winRate,60);
});
check('Tied favourites and last commander use the newest recognized replay regardless of row order',()=>{
 const result=build([row('Raynor','Win',1),row('Nova','Loss',3),row('Raynor','Win',2),row('Nova','Win',4),row('Terran','Win',12)]);
 assert.equal(result.mostPlayed.commander,'Nova');assert.equal(result.lastPlayed.commander,'Nova');
 assert.equal(result.lastPlayed.lastSeen,'2026-10-04T10:00:00Z');assert.equal(result.mostPlayed.games,2);
});
check('Best rankings use rate, decided count, recency and name with at most three cards',()=>{
 const result=build([...sample('Nova',5,0,1),...sample('Raynor',6,0,1),...sample('Tychus',5,0,3),...sample('Artanis',5,0,3),...sample('Swann',4,1,10)]);
 assert.deepEqual(Array.from(result.bestPlayed,item=>item.commander),['Raynor','Artanis','Tychus']);
});
check('Recorded zero rates remain eligible while unavailable dates have deterministic ordering',()=>{
 const result=build(sample('Raynor',0,5));
 assert.equal(result.winRate,0);assert.equal(result.bestPlayed[0].winRate,0);
 const missingDates=build([row('Raynor','Win',1,{match:{time:''}}),row('Nova','Loss',1,{match:{time:''}})]);
 assert.equal(missingDates.mostPlayed.commander,'Nova');
});
check('Empty libraries return honest unavailable values without cards',()=>{
 const result=build([]);
 assert.equal(result.total,0);assert.equal(result.wins,0);assert.equal(result.losses,0);assert.equal(result.unknown,0);
 assert.equal(result.winRate,null);assert.equal(result.mostPlayed,null);assert.equal(result.lastPlayed,null);
 assert.equal(result.bestPlayed.length,0);assert.equal(result.bestMinimum,5);
});
process.stdout.write(checks.join('\n')+'\n');
