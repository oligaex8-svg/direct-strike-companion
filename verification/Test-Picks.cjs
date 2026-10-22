'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/commanders.js'),'utf8'),context);
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
const outcomeSource=app.split(/\r?\n/).find(line=>line.startsWith('function playerOutcome('));
assert.ok(outcomeSource,'Load the actual application outcome function');
vm.runInContext(outcomeSource,context);
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/picks.js'),'utf8'),context);
const history=vm.runInContext('buildPickHistory',context),matchups=vm.runInContext('buildPickMatchups',context),rank=vm.runInContext('rankCounterPicks',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} should equal ${expected}`);
const check=(name,body)=>{body();checks.push({name,passed:true});};
let serial=0;
const fixture=({commander='Raynor',enemies=['Kerrigan','Kerrigan','Kerrigan'],win=true,self='self',team=1,hash,time,mode='Commanders'}={})=>{
 const enemyTeam=team===1?2:1;
 return {hash:hash??`fixture-${++serial}`,time:time??'2026-10-06T12:00:00Z',mode,winner:win===null?0:win?team:enemyTeam,players:[
  {id:self,name:'SameName',team,commander,result:'Unknown'},
  {id:`friend-a-${serial}`,team,commander:'Nova',result:'Unknown'},
  {id:`friend-b-${serial}`,team,commander:'Nova',result:'Unknown'},
  ...enemies.map((enemy,i)=>({id:`enemy-${serial}-${i}`,name:'SameName',team:enemyTeam,commander:enemy,result:'Unknown'}))
 ]};
};
const row=(match,id='self')=>({match,player:match.players.find(player=>player.id===id)});
const games=(count,options={})=>Array.from({length:count},()=>fixture(options));
const distribution=(commander='Kerrigan',probability=100)=>[{commander,probability}];
try {
 check('History retains newest thirty distinct replays and counts unknown choices in its denominator',()=>{
  const matches=Array.from({length:35},(_,i)=>fixture({time:`2026-09-${String(i%28+1).padStart(2,'0')}T12:00:00Z`,commander:'Raynor'}));
  matches.forEach((match,i)=>{match.time=new Date(Date.UTC(2026,8,1+i)).toISOString();match.players[0].commander=i>=30?'Unselected':'Raynor';});
  const duplicate={...matches[34]}, result=history([...matches.map(match=>row(match)),row(duplicate)]);
  assert.equal(result.total,30);assert.equal(result.known,25);assert.equal(result.unknown,5);
  close(result.items[0].probability,100*25/30);assert.equal(result.lastSeen,matches[34].time);
 });
 check('History sorts duplicate representations by newest timestamp before choosing the window',()=>{
  const older=fixture({hash:'shared',commander:'Raynor',time:'2026-10-01T00:00:00Z'}),newer=fixture({hash:'shared',commander:'Nova',time:'2026-10-06T00:00:00Z'});
  const result=history([row(older),row(newer)],1);
  assert.equal(result.total,1);assert.equal(result.items[0].commander,'Nova');
 });
 check('History count ties use newest commander occurrence, then stable commander name',()=>{
  const result=history(['Nova','Raynor','Kerrigan'].map(commander=>row(fixture({commander}))));
  assert.deepEqual(plain(result.items.map(item=>item.commander)),['Kerrigan','Nova','Raynor']);
  const recent=history([row(fixture({commander:'Nova',time:'2026-10-01'})),row(fixture({commander:'Raynor',time:'2026-10-06'}))]);
  assert.equal(recent.items[0].commander,'Raynor');
 });
 check('Missing or blank hashes deduplicate by match identity without conflating distinct matches',()=>{
  const a=fixture(),b=fixture();delete a.hash;b.hash=' ';
  assert.equal(history([row(a),row(a),row(b)]).total,2);
  const index=matchups([a,a,b],['self']);assert.equal(index.info.accepted,2);assert.equal(index.info.duplicates,1);
 });
 check('History empty, malformed and unknown-only inputs remain unavailable without invented commanders',()=>{
  assert.deepEqual(plain(history(null)),{total:0,known:0,unknown:0,lastSeen:null,items:[]});
  assert.equal(history([null,{}, {match:null,player:{}}, row(fixture({commander:''})),row(fixture({commander:'Unknown'}))]).unknown,2);
  assert.equal(history([row(fixture({commander:'Unknown'}))]).items.length,0);
 });
 check('History limits remain a bounded last-thirty window, including zero and invalid limits',()=>{
  const rows=games(40).map(match=>row(match));
  assert.equal(history(rows,3).total,3);assert.equal(history(rows,31).total,30);
  assert.equal(history(rows,0).total,0);assert.equal(history(rows,-1).total,0);assert.equal(history(rows,NaN).total,30);
 });
 check('Explicit stable IDs keep same-name player histories separate',()=>{
  const a=fixture({self:'id-a',commander:'Raynor'}),b=fixture({self:'id-b',commander:'Nova'}),all=[a,b];
  const rowsFor=id=>all.flatMap(match=>match.players.filter(player=>player.id===id).map(player=>({match,player})));
  assert.equal(history(rowsFor('id-a')).items[0].commander,'Raynor');assert.equal(history(rowsFor('id-b')).items[0].commander,'Nova');
 });
 check('Matchup index recognizes all eighteen candidates and validates exact regular three-versus-three scope',()=>{
  const valid=fixture(),brawl=fixture({mode:'Commanders Brawl'}),standard=fixture({mode:'Standard'}),short=fixture(),unequal=fixture(),zeroTeam=fixture(),stringTeam=fixture();
  short.players.pop();unequal.players[2].team=2;zeroTeam.players[0].team=0;stringTeam.players[0].team='1';
  const index=matchups([valid,brawl,standard,short,unequal,zeroTeam,stringTeam,null],['self']);
  assert.equal(index.commanders.size,18);assert.equal(index.info.input,8);assert.equal(index.info.eligible,1);assert.equal(index.info.accepted,1);
 });
 check('Only enemy-team choices enter pairs, including when own team is team two',()=>{
  const index=matchups([fixture({team:2,enemies:['Kerrigan','Kerrigan','Unknown']})],['self']);
  const own=index.commanders.get('Raynor');assert.equal(own.wins,1);assert.equal(own.pairs.has('Nova'),false);
  assert.equal(own.pairs.get('Kerrigan').games,1);assert.equal(index.info.unknownEnemies,1);
 });
 check('Distinct enemy commanders count a replay once per pair even with duplicated enemy choice',()=>{
  const own=matchups([fixture({enemies:['Kerrigan','Kerrigan','Nova']})],['self']).commanders.get('Raynor');
  assert.equal(own.games,1);assert.equal(own.pairs.get('Kerrigan').games,1);assert.equal(own.pairs.get('Nova').games,1);
 });
 check('Repeated hashes do not add overall or pair evidence',()=>{
  const a=fixture(),b={...a};const index=matchups([a,b],['self']);
  assert.equal(index.info.duplicates,1);assert.equal(index.commanders.get('Raynor').games,1);
 });
 check('Own selection requires exactly one player and ignores duplicate requested IDs',()=>{
  const valid=fixture(),conflict=fixture();conflict.players[1].id='other-own';
  const index=matchups([valid,conflict],['self','self','other-own']);
  assert.equal(index.info.accepted,1);assert.equal(index.info.conflictingSelf,1);
  assert.equal(matchups([valid],['missing']).info.noSelf,1);
 });
 check('Repeated own player records are also conflicting and cannot choose the first record silently',()=>{
  const match=fixture();match.players[1].id='self';
  assert.equal(matchups([match],['self']).info.conflictingSelf,1);
 });
 check('Authoritative outcome uses winner over contradictory result, then fallback, and skips undecided',()=>{
  const win=fixture(),fallback=fixture({win:null}),unknown=fixture({win:null});
  win.players[0].result='Loss';fallback.players[0].result='Loss';
  const index=matchups([win,fallback,unknown],['self']),own=index.commanders.get('Raynor');
  assert.equal(own.games,2);assert.equal(own.wins,1);assert.equal(own.losses,1);assert.equal(index.info.unknownOutcome,1);
 });
 check('Invalid own commander contributes no overall sample; unknown enemies contribute no invented pairs',()=>{
  const index=matchups([fixture({commander:'Unselected'}),fixture({enemies:['Unknown','',null]})],['self']);
  assert.equal(index.info.invalidSelfCommander,1);assert.equal(index.info.unknownEnemies,3);
  assert.equal(index.commanders.get('Raynor').games,1);assert.equal(index.commanders.get('Raynor').pairs.size,0);
 });
 check('Five decided overall games and five decided pair games are both required',()=>{
  assert.equal(rank(matchups(games(4),['self']),distribution()).length,0);
  const index=matchups([...games(4),...games(3,{enemies:['Nova','Nova','Nova']})],['self']);
  assert.equal(index.commanders.get('Raynor').games,7);assert.equal(rank(index,distribution()).length,0);
 });
 check('Known zero pair win rate yields a supported zero score',()=>{
  const result=rank(matchups(games(5,{win:false}),['self']),distribution());
  assert.equal(result.length,1);assert.equal(result[0].score,0);assert.equal(result[0].support,5);assert.equal(result[0].overallWinRate,0);
 });
 check('Unsupported predicted bins remain in coverage denominator and exact sixty percent passes',()=>{
  const index=matchups(games(5),['self']);
  assert.equal(rank(index,[{commander:'Kerrigan',probability:59},{commander:'Nova',probability:41}]).length,0);
  const result=rank(index,[{commander:'Kerrigan',probability:60},{commander:'Nova',probability:40}]);
  assert.equal(result.length,1);assert.equal(result[0].coverage,60);assert.equal(result[0].score,100);
 });
 check('Pairs below five games do not enter coverage, score or support',()=>{
  const index=matchups([...games(5),...games(4,{enemies:['Nova','Nova','Nova'],win:false})],['self']);
  assert.equal(rank(index,[{commander:'Kerrigan',probability:50},{commander:'Nova',probability:50}]).length,0);
  const result=rank(index,[{commander:'Kerrigan',probability:60},{commander:'Nova',probability:40}])[0];
  assert.equal(result.coverage,60);assert.equal(result.support,5);assert.equal(result.evidence.length,1);
 });
 check('Pair shrinkage uses each candidate overall rate and five equivalent prior games',()=>{
  const index=matchups([...games(5),...games(5,{win:false,enemies:['Nova','Nova','Nova']})],['self']);
  const result=rank(index,distribution())[0];
  assert.equal(result.games,10);assert.equal(result.wins,5);assert.equal(result.losses,5);assert.equal(result.overallWinRate,50);
  close(result.score,75);assert.equal(result.evidence[0].winRate,100);assert.equal(result.evidence[0].adjustedWinRate,75);
 });
 check('Supported pair rates are weighted only by their predicted weight and use candidate-specific baselines',()=>{
  const index=matchups([...games(5),...games(5,{win:false,enemies:['Nova','Nova','Nova']}),...games(5,{commander:'Artanis'})],['self']);
  const result=rank(index,[{commander:'Kerrigan',probability:60},{commander:'Nova',probability:40}]);
  assert.equal(result[0].commander,'Artanis');close(result[0].score,100);assert.equal(result[0].coverage,60);
  const raynor=result.find(item=>item.commander==='Raynor');close(raynor.score,55);assert.equal(raynor.coverage,100);
 });
 check('Union support counts each replay once when several supported enemy commanders share the game',()=>{
  const result=rank(matchups(games(5,{enemies:['Kerrigan','Nova','Nova']}),['self']),[{commander:'Kerrigan',probability:50},{commander:'Nova',probability:50}])[0];
  assert.equal(result.evidence.length,2);assert.equal(result.support,5);assert.equal(result.games,5);
 });
 check('Unknown, zero, negative, nonnumeric and nonfinite distribution entries are omitted; duplicates combine',()=>{
  const index=matchups(games(5),['self']);
  const result=rank(index,[{commander:'Kerrigan',probability:30},{commander:'Kerrigan',probability:30},{commander:'Nova',probability:40},
   {commander:'Unknown',probability:100},{commander:'Raynor',probability:0},{commander:'Swann',probability:-10},
   {commander:'Alarak',probability:'100'},{commander:'Tychus',probability:Infinity},null])[0];
  assert.equal(result.coverage,60);assert.equal(result.evidence[0].weight,60);assert.equal(rank(index,distribution('Kerrigan',0)).length,0);
 });
 check('Ranking orders score, then union support, then overall games, then name and returns at most three',()=>{
  const input=[...games(5,{commander:'Raynor'}),...games(5,{commander:'Nova'}),...games(5,{commander:'Kerrigan'}),...games(5,{commander:'Artanis'})];
  assert.deepEqual(plain(rank(matchups(input,['self']),distribution()).map(item=>item.commander)),['Artanis','Kerrigan','Nova']);
  input.push(...games(1,{commander:'Raynor'}));
  assert.equal(rank(matchups(input,['self']),distribution())[0].commander,'Raynor');
  const overallTie=[...games(5,{commander:'Raynor'}),...games(5,{commander:'Artanis'}),...games(1,{commander:'Raynor',enemies:['Nova','Nova','Nova']})];
  assert.equal(rank(matchups(overallTie,['self']),distribution())[0].commander,'Raynor');
 });
 check('Ranking and history are deterministic across caller ordering and preserve input data',()=>{
  const input=[...games(5,{commander:'Raynor',win:false}),...games(5,{commander:'Nova'})],before=JSON.stringify(input);
  assert.deepEqual(plain(rank(matchups(input,['self']),distribution())),plain(rank(matchups([...input].reverse(),['self']),distribution())));
  assert.equal(JSON.stringify(input),before);
  const rows=[row(fixture({time:'2026-10-01',commander:'Nova'})),row(fixture({time:'2026-10-03',commander:'Raynor'}))];
  assert.deepEqual(plain(history(rows)),plain(history([...rows].reverse())));
 });
 check('Empty and invalid index inputs return no recommendations and an empty matchup index',()=>{
  assert.equal(rank(null,distribution()).length,0);assert.equal(rank({},distribution()).length,0);
  assert.equal(rank({commanders:new Map()},null).length,0);assert.equal(rank(matchups(games(5),['self']),[]).length,0);
  assert.equal(matchups(null,null).info.input,0);assert.equal(matchups(games(1),null).info.accepted,0);
 });
 const result={success:true,total:checks.length,checks,scope:'Pure replay pick engine using the application commander list and playerOutcome; no browser, build or live-game validation.'};
 fs.writeFileSync(path.join(__dirname,'pick-engine-tests.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`Pick engine: ${checks.length}/${checks.length} checks passed.`);
} catch(error) {
 fs.writeFileSync(path.join(__dirname,'pick-engine-tests.json'),JSON.stringify({success:false,total:checks.length,checks,error:error.stack},null,2)+'\n');
 console.error(error.stack);process.exitCode=1;
}
