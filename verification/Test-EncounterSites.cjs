'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],own='2-S2-1-77',ally='2-S2-1-78',enemy='2-S2-1-79';
const context=vm.createContext({commanderPortraits:new Map([['Raynor',{}],['Kerrigan',{}]])});
for(const file of ['picks.js','site-history.js','player-data.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=code=>vm.runInContext(code,context),plain=value=>JSON.parse(JSON.stringify(value)),check=(name,action)=>{action();checks.push(name);};
const lobbySource=fs.readFileSync(path.join(root,'wwwroot/lobby.js'),'utf8'),comparisonStart=lobbySource.indexOf('function lobbyTeammateComparison(');
vm.runInContext(lobbySource.slice(comparisonStart,lobbySource.indexOf('\n}',comparisonStart)+2),context);
const game=(id,minute,win=true)=>({gameId:String(id),mode:'3v3 commanders',time:new Date(Date.UTC(2026,9,22,0,minute)).toISOString(),seconds:600,players:Array.from({length:6},(_,i)=>({profileId:i?'20'+i:'100',name:i===1?'Same name':'Player '+i,team:i<3?0:1,commander:'raynor',result:(i<3)===win?'Win':'Loss'}))});
function reset(){
 context.state={library:{settings:{selfIds:[own]},ratings:{},siteLookups:{},siteGames:{},siteHistories:{}}};
 context.players=[{id:own,name:'Own'},{id:ally,name:'Same name'},{id:enemy,name:'Opponent'}];
 for(const [id,profileId] of [[own,'100'],[ally,'201'],[enemy,'203']]){context.state.library.siteLookups[id]={status:'Name match',profiles:[{profileId,name:'Same name',region:'EU',winRate:99,discoveredGames:9000}]};context.state.library.ratings[id]={eu:{profileId,profileName:'Chosen',region:'EU'}};}
 context.local=[];
}
function rows(){return run('buildPlayerEncounterRows(linkSiteEncounterMatches(siteMatchupData(local,state.library.settings.selfIds).matches,players),players,state.library.settings.selfIds)');}
function localFrom(g){return {...g,hash:'local-'+g.gameId,mode:'Commanders',winner:g.players[0].result==='Win'?1:2,players:g.players.map((p,i)=>({...p,id:[own,ally,'2-S2-1-80',enemy,'2-S2-1-81','2-S2-1-82'][i],team:p.team+1}))};}
check('Complete shared site rosters contribute both relationships and own-perspective percentages',()=>{
 reset();context.state.library.siteGames={a:game(1,1),b:game(2,2,false)};
 const result=rows();assert.equal(result[1].together.winRate,50);assert.equal(result[1].encounters,2);assert.equal(result[2].against.wins,1);assert.equal(result[2].against.losses,1);assert.equal(result[1].together.site.games,2);
});
check('Site/local overlap and repeated cached site IDs count only once, preferring the replay',()=>{
 reset();context.local=[localFrom(game(1,1))];context.state.library.siteGames={a:game(1,1),b:game(2,2,false),duplicate:game(2,2,false)};
 const result=rows();assert.equal(result[1].together.games,2);assert.equal(result[1].together.site.games,1);assert.equal(result[1].together.winRate,50);
});
check('Profile totals and individual history lists cannot invent a shared match',()=>{
 reset();context.state.library.siteHistories={100:{games:[{gameId:'1',result:'Win'}]}};
 assert.equal(rows()[1].together.winRate,null);assert.equal(rows()[1].encounters,0);
});
check('Same names and ambiguous account bindings remain separate',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players.push({id:'2-S2-1-99',name:'Same name'});
 assert.equal(rows()[3].encounters,0);
 delete context.state.library.ratings[ally];context.state.library.siteLookups[ally].status='Ambiguous';assert.equal(rows()[1].encounters,0);
 context.state.library.ratings[ally]={eu:{profileId:'201',profileName:'Chosen'}};assert.equal(rows()[1].together.games,1);
});
check('Two native accounts bound to one site profile cannot both inherit its games',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players.push({id:'2-S2-1-99',name:'Duplicate binding'});
 context.state.library.ratings['2-S2-1-99']=context.state.library.ratings[ally];
 const result=rows();assert.equal(result[1].encounters,0);assert.equal(result[3].encounters,0);
});
check('Regional identities cannot borrow the same numeric profile from another region',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players.push({id:'1-S2-1-99',name:'Same name'});
 context.state.library.siteLookups['1-S2-1-99']={status:'Name match',profiles:[{profileId:'201',region:'Americas'}]};
 context.state.library.ratings['1-S2-1-99']={americas:{profileId:'201',region:'Americas'}};
 const result=rows();assert.equal(result[1].together.games,1);assert.equal(result[3].encounters,0);
});
check('Incomplete rosters, wrong modes, duplicate profiles and contradictory teams add no evidence',()=>{
 for(const damage of [g=>g.players.pop(),g=>g.mode='2v2 commanders',g=>g.players[2].profileId='201',g=>g.players[4].result='Win',g=>g.players[3].team=0]){
  reset();const g=game(1,1);damage(g);context.state.library.siteGames={a:g};assert.equal(rows()[1].encounters,0);
 }
});
check('Missing or multiply-bound selected-own identities cannot establish a shared game',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};delete context.state.library.ratings[own];delete context.state.library.siteLookups[own];assert.equal(rows()[1].encounters,0);
 reset();context.state.library.settings.selfIds.push(ally);context.state.library.siteGames={a:game(1,1)};assert.equal(rows()[2].encounters,0);
});
check('Automatic name matches cannot link either the own anchor or another player',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};delete context.state.library.ratings[ally];assert.equal(rows()[1].encounters,0);assert.equal(rows()[2].against.games,1);
 delete context.state.library.ratings[own];assert.equal(rows()[2].encounters,0);
});
check('A duplicate native binding to the own profile rejects the whole site match',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players.push({id:'2-S2-1-99',name:'Other account'});context.state.library.ratings['2-S2-1-99']=context.state.library.ratings[own];assert.equal(rows()[1].encounters,0);
});
check('An explicitly linked own account need not have a local replay metadata row',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players=context.players.filter(player=>player.id!==own);assert.equal(rows()[0].together.games,1);
});
check('Unknown own results count the observed game but do not fabricate a win rate',()=>{
 reset();const g=game(1,1);g.players[0].result='Unknown';context.state.library.siteGames={a:g};
 const result=rows();assert.equal(result[1].together.games,1);assert.equal(result[1].together.unknown,1);assert.equal(result[1].together.winRate,null);
});
check('Replay-only teammate-risk sample is recovered exactly from mixed evidence',()=>{
 reset();context.local=[localFrom(game(1,1,false))];context.state.library.siteGames={a:game(2,2)};context.combined=rows()[1].together;
 assert.equal(context.combined.winRate,50);assert.deepEqual(plain(run('replayEncounterStats(combined)')),{games:1,wins:0,losses:1,unknown:0,winRate:0});
 const risk=run('lobbyTeammateComparison({together:combined},{wins:8,losses:2})');assert.equal(risk.games,1);assert.equal(risk.winRate,0);
});
check('Inputs and cached site records remain unchanged; duplicate metadata gets independent source objects',()=>{
 reset();context.state.library.siteGames={a:game(1,1)};context.players.push(context.players[1]);const before=JSON.stringify({state:context.state,players:context.players});
 const result=rows();assert.equal(JSON.stringify({state:context.state,players:context.players}),before);assert.notEqual(result[1].together.site,result[3].together.site);
});
const report={success:true,passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'encounter-sites-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
