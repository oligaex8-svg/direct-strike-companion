'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const file=path.join(__dirname,'impact-real-replay.json'),data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
let nodes=0;
function verify(node){
 nodes++;
 for(const [key,direct] of [['kills','directKills'],['losses','directLosses']])assert.equal(node[key],node[direct]+node.children.reduce((n,child)=>n+child[key],0),node.name+' '+key+' must be inclusive exactly once');
 node.children.forEach(verify);
}
const players=data.match.players.map(player=>{
 const impact=player.combat.impact;assert.equal(impact.version,3);
 for(const key of ['kills','losses'])assert.equal(impact.units.reduce((n,row)=>n+row[key],0),impact.unitGroups.reduce((n,row)=>n+row[key],0),player.name+' '+key+' conserved');
 for(const group of impact.unitGroups){for(const key of ['kills','losses'])assert.equal(group[key],group.breakdown[key]);verify(group.breakdown);}
 assert.ok(!impact.unitGroups.some(group=>group.name.startsWith('StagingAreaFootprint')),'Placement scaffolding is not a summon family');
 return {player:player.name,kills:impact.units.reduce((n,row)=>n+row.kills,0),losses:impact.units.reduce((n,row)=>n+row.losses,0),families:impact.unitGroups.filter(group=>group.summonKills)};
});
// One decoded replay; reorder a copy for the Zagara-specific browser scenario.
const zagara={...data,match:{...data.match,players:[...data.match.players].sort((a,b)=>Number(a.name!=='TKnight')-Number(b.name!=='TKnight'))}};
fs.writeFileSync(path.join(__dirname,'impact-zagara-replay.json'),JSON.stringify(zagara));
const result={success:true,scope:'Actual replay: every nested node and all six player totals conserved',hash:data.match.hash,statsVersion:data.match.statsVersion,nodes,players};
fs.writeFileSync(path.join(__dirname,'summon-replay-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({success:true,players:players.length,nodes,statsVersion:data.match.statsVersion}));
