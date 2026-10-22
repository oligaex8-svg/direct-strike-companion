'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {build,legacy,plain}=require('./Test-PlayerData.cjs');
const root=path.resolve(__dirname,'..'),library=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
const matches=library.matches.filter(m=>m.mode==='Commanders'&&m.players.length===6&&new Set(m.players.map(p=>p.team)).size===2&&m.players.every(p=>p.team>0&&m.players.filter(x=>x.team===p.team).length===3));
const own=library.settings.selfIds;
// Stored LibraryData does not include the computed API player summary. Rebuild
// its non-own stable-identity population and latest name/aliases from the same
// eligible matches. Ratings are irrelevant to encounter totals and timing.
const groups=new Map();
for(const m of matches) for(const p of m.players) {
 if(own.includes(p.id))continue;
 let row=groups.get(p.id);
 if(!row){row={id:p.id,name:p.name,aliases:[],lastSeen:m.time,mark:library.marks[p.id]||null};groups.set(p.id,row);}
 if(!row.aliases.includes(p.name))row.aliases.push(p.name);
 if(Date.parse(m.time)>Date.parse(row.lastSeen)){row.name=p.name;row.lastSeen=m.time;}
}
const players=Array.isArray(library.players)?library.players:[...groups.values()];
const oldResult=legacy(matches,players,own),newResult=build(matches,players,own);
assert.deepEqual(plain(newResult),plain(oldResult));
const iterations=[];
for(let i=0;i<3;i++){
 const started=performance.now(),oldRows=legacy(matches,players,own),middle=performance.now(),newRows=build(matches,players,own),ended=performance.now();
 assert.deepEqual(plain(newRows),plain(oldRows));
 iterations.push({legacyMs:Number((middle-started).toFixed(3)),singlePassMs:Number((ended-middle).toFixed(3))});
}
const report={scope:'Encounter row aggregation only; serial microbenchmark, not browser refresh or end-to-end performance.',libraryMatches:library.matches.length,eligibleMatches:matches.length,summaryPlayers:players.length,selectedOwnIds:own.length,playerSource:Array.isArray(library.players)?'Stored summary players':'Reconstructed eligible non-own identity summaries (rating metadata omitted)',equivalent:true,iterations};
fs.writeFileSync(path.join(__dirname,'player-data-benchmark.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
