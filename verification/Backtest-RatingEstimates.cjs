'use strict';
// Reads a bounded, local-only snapshot on stdin; emits aggregate numbers only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync(0,'utf8')),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../wwwroot/dsr-projections.js'),'utf8'),context);
const samples=[];let skipped=0;
for(const row of data.rows){
 const game=data.games[row.gameId],ownProfile=data.ownProfiles[row.nativeId];
 if(!game||!ownProfile||row.delta===0){skipped++;continue;}
 const own=game.players.find(p=>p.profileId===ownProfile),teams=[...new Set(game.players.map(p=>p.team))];
 if(!own||teams.length!==2||game.players.length!==6){skipped++;continue;}
 const players=game.players.map(p=>({id:p.profileId,team:teams.indexOf(p.team)+1,commander:p.commander}));
 const mode=new Map(),main=new Map();
 for(const p of players){const profile=data.profiles[p.id];mode.set(p.id,{value:profile?.rating??2000,games:null});main.set(p.id,context.dsrMainBasis(profile));}
 const before=context.dsrProjectedChanges(players,mode).get(ownProfile),after=context.dsrProjectedChanges(players,main,'main_current').get(ownProfile);
 const key=row.delta>0?'win':'loss';
 if(typeof after?.[key]!=='number'||typeof before?.[key]!=='number'){skipped++;continue;}
 samples.push({actual:row.delta,before:before[key],after:after[key]});
}
const mae=key=>samples.length?samples.reduce((sum,s)=>sum+Math.abs(s[key]-s.actual),0)/samples.length:null;
const report={scope:'Retrospective check against cached verified main DSR; uses current cached bases, not historical pregame state. No identities emitted.',available:data.rows.length,compared:samples.length,skipped,oldModeWithDefault2000Mae:mae('before'),completeMainMae:mae('after')};
fs.writeFileSync(path.join(__dirname,'rating-estimate-backtest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
