'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const context=vm.createContext({document:{addEventListener(){}},state:{library:{settings:{selfIds:[]}}},
 esc:value=>String(value??''),num:value=>value??'—',rate:value=>value===null||value===undefined?'—':`${Math.round(value)}%`,date:value=>value,time:()=>'',
 findPlayer:()=>null,regionRating:()=>null,siteRatingStatus:()=>'',siteLookup:()=>null,siteNameKey:value=>value});
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('const esc=')),context);
vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('function playerOutcome(')),context);
for(const file of ['sound-library.js','player-names.js','commanders.js','picks.js','combat.js','replays.js','lobby.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
vm.runInContext('let commanderProfiles=new Map()',context);
const run=source=>vm.runInContext(source,context);
const check=(name,action)=>{action();checks.push(name);};
const match=(index,id,commander,winner=1,result='Unknown')=>({hash:`game-${index}`,time:new Date(Date.UTC(2026,0,1,index)).toISOString(),winner,players:[{id,commander,team:1,result}]});
const history=()=>run('buildLiveLobbyHistory(ids)');
function load(matches,ids=['opponent']){
 context.matches=matches;context.ids=ids;
 run('buildCombatCache(matches,[]);commanderProfiles=buildCommanderProfiles(matches)');
}

check('All-library favourites remain distinct from the last-30 pick distribution, including unknown picks',()=>{
 const matches=[];
 for(let i=0;i<40;i++)matches.push(match(i,'opponent','Raynor'));
 for(let i=40;i<55;i++)matches.push(match(i,'opponent','Swann'));
 for(let i=55;i<64;i++)matches.push(match(i,'opponent','Nova'));
 for(let i=64;i<70;i++)matches.push(match(i,'opponent','Unknown'));
 load(matches);
 const summary=history();
 assert.deepEqual(Array.from(summary.favourites,item=>item.commander),['Raynor','Swann','Nova']);
 assert.deepEqual(Array.from(summary.favourites,item=>item.games),[40,15,9]);
 assert.deepEqual(Array.from(summary.favourites,item=>item.pickEstimate),[0,50,30]);
 assert.equal(summary.history.total,30);assert.equal(summary.history.unknown,6);
 assert.equal(summary.rows.length,70);
});

check('The three newest replays show the player perspective, recorded winner first, then result fallback',()=>{
 const matches=[match(1,'opponent','Raynor',1,'Loss'),match(2,'opponent','Nova',2,'Win'),match(3,'opponent','Swann',0,'Unknown'),match(0,'opponent','Artanis',0,'Win')];
 load(matches);
 const summary=history();
 assert.deepEqual(Array.from(summary.recent,row=>row.player.commander),['Swann','Nova','Raynor']);
 assert.deepEqual(Array.from(summary.recent,row=>context.playerOutcome(row.match,row.player)),[null,false,true]);
 assert.equal(context.playerOutcome(summary.rows[3].match,summary.rows[3].player),true);
 const html=run('liveLobbyHistoryCells(buildLiveLobbyHistory(ids))');
 assert.match(html,/Undecided/);assert.match(html,/Loss/);assert.match(html,/Win/);
 assert.match(html,/2026-01-01T03:00:00.000Z/);
});

check('Linked own accounts pool unique replays and favourite counts without duplicating a shared replay',()=>{
 const shared=match(4,'own-eu','Raynor');
 shared.players.push({id:'own-am',commander:'Nova',team:1,result:'Win'});
 const older=match(1,'own-eu','Raynor'),newer=match(5,'own-am','Nova');
 load([shared,older,newer,shared],['own-eu','own-am']);
 const summary=history();
 assert.equal(summary.rows.length,3);assert.equal(summary.history.total,3);
 assert.deepEqual(Array.from(summary.recent,row=>row.match.hash),['game-5','game-4','game-1']);
 assert.deepEqual(Array.from(summary.favourites,item=>[item.commander,item.games]),[['Raynor',2],['Nova',1]]);
 assert.ok(Math.abs(summary.favourites[0].pickEstimate-200/3)<1e-9);
 assert.ok(Math.abs(summary.favourites[1].pickEstimate-100/3)<1e-9);
});

check('Same-name enemy regional profiles keep independent recent games and favourites',()=>{
 const eu=match(1,'enemy-eu','Raynor'),am=match(2,'enemy-am','Nova');
 eu.players[0].name=am.players[0].name='SharedName';
 load([eu,am],['enemy-eu']);
 assert.deepEqual(Array.from(history().favourites,item=>item.commander),['Raynor']);
 context.ids=['enemy-am'];
 assert.deepEqual(Array.from(history().favourites,item=>item.commander),['Nova']);
 assert.equal(history().rows.length,1);
});

check('An all-unknown recent sample leaves an older favourite estimate unavailable',()=>{
 const matches=[match(0,'opponent','Raynor')];
 for(let i=1;i<=30;i++)matches.push(match(i,'opponent','Unknown'));
 load(matches);
 const summary=history();
 assert.equal(summary.history.total,30);assert.equal(summary.history.known,0);assert.equal(summary.history.unknown,30);
 assert.equal(summary.favourites[0].commander,'Raynor');assert.equal(summary.favourites[0].pickEstimate,null);
});

check('Missing history does not invent commander picks, recent results or an estimate',()=>{
 load([],['missing']);const summary=history();
 assert.equal(summary.recent.length,0);assert.equal(summary.favourites.length,0);assert.equal(summary.history.total,0);
 assert.doesNotMatch(run('liveLobbyHistoryCells(buildLiveLobbyHistory(ids))'),/\d+%/);
});

check('Unhashed replays deduplicate by object identity while distinct replays remain separate',()=>{
 const first=match(1,'opponent','Raynor');delete first.hash;
 const second=match(1,'opponent','Nova');delete second.hash;
 load([first,first,second]);
 assert.equal(history().rows.length,2);assert.equal(history().history.total,2);
});

check('Tied favourites use the most recently played commander',()=>{
 load([match(1,'opponent','Raynor'),match(2,'opponent','Nova')]);
 assert.deepEqual(Array.from(history().favourites,item=>item.commander),['Nova','Raynor']);
});

check('Hero and recent-game buttons carry distinct target identities without duplicate native tooltips',()=>{
 load([match(1,'opponent','Raynor'),match(2,'opponent','Nova')]);
 const html=run('liveLobbyHistoryCells(buildLiveLobbyHistory(ids),"opponent")');
 assert.match(html,/data-lobby-pick-kind="game" data-lobby-pick-game="game-2"/);
 assert.match(html,/data-lobby-pick-kind="game" data-lobby-pick-game="game-1"/);
 assert.match(html,/data-lobby-pick-kind="commander" data-lobby-pick-commander="Nova"/);
 assert.match(html,/data-lobby-pick-kind="commander" data-lobby-pick-commander="Raynor"/);
 assert.equal((html.match(/<button /g)||[]).length,4);assert.doesNotMatch(html,/title=|role="img"/);assert.match(html,/aria-label=/);
});

check('Linked own recent games retain each recorded account and safely escape match labels and keys',()=>{
 const eu=match(1,'own-eu','Raynor'),am=match(2,'own-am','Nova');am.hash='game-"<&';am.time='invalid <date>';
 load([eu,am],['own-eu','own-am']);
 const html=run('liveLobbyHistoryCells(buildLiveLobbyHistory(ids))');
 assert.match(html,/data-lobby-pick-toggle="own-eu" data-lobby-pick-kind="game"/);assert.match(html,/data-lobby-pick-toggle="own-am" data-lobby-pick-kind="game"/);
 assert.match(html,/data-lobby-pick-game="game-&quot;&lt;&amp;"/);assert.doesNotMatch(html,/invalid <date>|title=/);
});

const report={created:new Date().toISOString(),passed:checks.length,checks};
fs.writeFileSync(path.join(__dirname,'compact-lobby-ui-tests.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
