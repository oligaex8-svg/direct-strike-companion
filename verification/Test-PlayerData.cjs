'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/player-data.js'),'utf8'),context);
const build=vm.runInContext('buildPlayerEncounterRows',context);
// Frozen oracle from app.js stats/visiblePlayers before the optimization.
// Filtering and sorting are omitted to compare every augmented metadata row.
function stats(matches,id,selfIds){let games=0,wins=0,losses=0,unknown=0;for(const m of matches){const me=m.players.find(p=>selfIds.includes(p.id));if(!me)continue;const p=id?m.players.find(p=>p.id===id):me;if(!p)continue;games++;const outcome=m.winner>0&&me.team>0?m.winner===me.team:me.result==='Win'?true:me.result==='Loss'?false:null;if(outcome===null)unknown++;else if(outcome)wins++;else losses++;}return{games,wins,losses,unknown,winRate:wins+losses?100*wins/(wins+losses):null};}
function legacy(matches,players,own){return players.map(p=>{const versus=[],together=[];for(const m of matches){const me=m.players.find(x=>own.includes(x.id)),other=m.players.find(x=>x.id===p.id);if(!me||!other)continue;(me.team===other.team?together:versus).push(m);}return{...p,against:stats(versus,p.id,own),together:stats(together,p.id,own),encounters:versus.length+together.length};});}
const plain=value=>JSON.parse(JSON.stringify(value)),checks=[];
const check=(name,run)=>{run();checks.push(name);};
const player=(id,team=1,result='Undecided')=>({id,team,result,name:'Identical name',aliases:['Old name']});
const match=(winner,...players)=>({winner,players});
const metadata=['own','ally','enemy','missing','other-own'].map(id=>({...player(id),mark:{note:'Preserved'},ratings:{eu:1234}}));
function equivalent(matches,players=metadata,own=['own']) {
 const before=JSON.stringify({matches,players,own});
 assert.deepEqual(plain(build(matches,players,own)),plain(legacy(matches,players,own)));
 assert.equal(JSON.stringify({matches,players,own}),before);
 return build(matches,players,own);
}
check('Empty input and absent own accounts retain all metadata with unavailable rates',()=>{equivalent([]);equivalent([match(1,player('ally'),player('enemy',2))]);equivalent([match(1,player('own'))],metadata,[]);});
check('Recorded winner overrides conflicting results and uses own-team perspective',()=>{const rows=equivalent([match(1,player('own',1,'Loss'),player('ally'),player('enemy',2,'Win')),match(2,player('own',1,'Win'),player('enemy',2,'Loss'))]);assert.equal(rows[2].against.wins,1);assert.equal(rows[2].against.losses,1);assert.equal(rows[0].together.games,2);assert.equal(rows[0].against.games,0);});
check('Fallback Win Loss and unknown count encounters but exclude undecided from win rate',()=>{const rows=equivalent(['Win','Loss','Undecided',undefined].map(result=>match(0,{...player('own'),result},player('enemy',2))));assert.equal(rows[2].encounters,4);assert.equal(rows[2].against.unknown,2);assert.equal(rows[2].against.winRate,50);equivalent([match(1,player('own',0,'Loss'),player('enemy',2))]);});
check('First own player in replay order wins over self ID order',()=>{const rows=equivalent([match(2,player('other-own',2),player('own',1),player('enemy',1))],metadata,['own','other-own']);assert.equal(rows[2].against.wins,1);assert.equal(rows[0].against.wins,1);assert.equal(rows[4].together.wins,1);});
check('First occurrence of a duplicate identity sets relationship; duplicate matches still count',()=>{const m=match(1,player('own'),player('enemy',2),player('enemy',1));const rows=equivalent([m,m]);assert.equal(rows[2].against.games,2);assert.equal(rows[2].together.games,0);});
check('Stable identities do not merge identical names or differently typed IDs',()=>{const players=[player('1'),player(1),player(''),player(null),player(undefined),player(NaN)];equivalent([match(0,player('own',1,'Win'),...players)],players);});
check('Duplicate metadata stays in input order and gets independent stats objects',()=>{const players=[metadata[2],metadata[0],metadata[2]],rows=equivalent([match(1,player('own'),player('enemy',2))],players);assert.notEqual(rows[0].against,rows[2].against);assert.equal(rows[0].mark,players[0].mark);assert.notEqual(rows[0],players[0]);});
check('Generated mixed-team histories exactly match legacy for varied own selections',()=>{let seed=37;const random=n=>{seed=(seed*16807)%2147483647;return seed%n;};const players=Array.from({length:35},(_,i)=>player('id-'+i));const matches=Array.from({length:120},()=>match(random(4),...Array.from({length:6},()=>player('id-'+random(35),1+random(2),['Win','Loss','Undecided'][random(3)]))));for(const own of [[],['id-1'],['id-1','id-2','id-3']])equivalent(matches,players,own);});
if(require.main===module){const report={passed:checks.length,failed:0,checks};fs.writeFileSync(path.join(__dirname,'player-data-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
module.exports={build,legacy,plain};
