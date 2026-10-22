'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','wwwroot','dsr-projections.js'),'utf8'),context);
const estimate=(players,bases)=>context.dsrProjectedChanges(players,bases),checks=[];
const check=(name,action)=>{action();checks.push(name);};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const roster=()=>['Raynor','Nova','Kerrigan','Tychus','Artanis','Zeratul'].map((commander,index)=>({id:String.fromCharCode(97+index),team:index%2===0?1:2,commander}));
const ratings=(players,first=2000,second=2000,games=25)=>new Map(players.map(player=>[player.id,{value:player.team===1?first:second,games}]));
const first=(players,bases)=>estimate(players,bases).get(players[0].id);
check('Equal established teams project own perspective +50/-50 in interleaved roster order',()=>{
 const players=roster(),results=estimate(players,ratings(players));assert.deepEqual([...results.keys()],players.map(player=>player.id));
 for(const value of results.values()){assert.equal(value.status,'ready');assert.equal(value.win,50);assert.equal(value.loss,-50);assert.equal(value.experienceAssumed,false);assert.equal(value.mirrorAssumed,false);assert.equal(value.missingRatings,0);}
});
check('Unequal strengths use strongest player and opposite hypothetical outcome rewards',()=>{
 const players=roster(),results=estimate(players,ratings(players,2000,3000));
 assert.equal(results.get('a').win,65);assert.equal(results.get('a').loss,-35);assert.equal(results.get('b').win,35);assert.equal(results.get('b').loss,-65);
 const bases=ratings(players);bases.set('c',{value:3000,games:25});assert.equal(first(players,bases).win,35);
});
check('Compression boundary crossing, fractional bases and rounding match the C# known results',()=>{
 const players=roster();
 for(const [rating,win,loss] of [[900,5,-5],[1000,50,-5],[998,32,-5],[900.9,4.1,-5.9]]){const result=first(players,ratings(players,rating,rating));close(result.win,win);close(result.loss,loss);}
 const uneven=estimate(players,ratings(players,900,1000));assert.equal(uneven.get('a').win,7);assert.equal(uneven.get('b').loss,-7);
});
check('Minimum clipping, zero rewards and published zero are retained',()=>{
 const players=roster();
 assert.equal(estimate(players,ratings(players,1,2000)).get('b').loss,-100);
 assert.equal(estimate(players,ratings(players,2000,1)).get('b').loss,0);
 assert.equal(first(players,ratings(players,10000,2000)).win,0);
 const zero=first(players,ratings(players,0,2000));assert.equal(zero.win,10);assert.equal(zero.missingRatings,0);
});
check('Completed mode game multipliers are per player with source floating point truncation',()=>{
 const players=roster();
 for(const [games,win] of [[0,500],[23,85],[24,67],[25,50],[100,50]])assert.equal(first(players,ratings(players,2000,2000,games)).win,win);
 const mixed=ratings(players);mixed.set('a',{value:2000,games:0});const result=estimate(players,mixed);assert.equal(result.get('a').win,500);assert.equal(result.get('c').win,50);
});
check('Only known exact ordered commander mirrors double rewards',()=>{
 const players=roster();for(let index=0;index<6;index+=2)players[index+1].commander=players[index].commander;
 assert.equal(first(players,ratings(players)).win,100);
 [players[1].commander,players[3].commander]=[players[3].commander,players[1].commander];assert.equal(first(players,ratings(players)).win,50);
 for(const player of players)player.commander='Unknown';const unknown=first(players,ratings(players));assert.equal(unknown.win,50);assert.equal(unknown.mirrorAssumed,true);
});
check('Missing players suppress the forecast instead of inventing 2000-point opponents',()=>{
 const players=roster();
 for(const value of estimate(players,new Map()).values()){assert.equal(value.win,null);assert.equal(value.loss,null);assert.equal(value.status,'missing-ratings');assert.equal(value.missingRatings,6);}
 const bases=ratings(players,7800,2000);bases.set('b',{value:null,games:null});
 for(const value of estimate(players,bases).values()){assert.equal(value.win,null);assert.equal(value.status,'missing-ratings');assert.equal(value.missingRatings,1);}
});
check('General ratings use fresh same-scope values and experience, never a Commander value',()=>{
 const basis=context.dsrMainBasis({rating:9999,estimatedRating:4500,searchRating:4600,profileChecked:'2026-01-01',searchChecked:'2026-01-02',searchGames:70});
 assert.equal(basis.value,4600);assert.equal(basis.games,70);
 assert.equal(context.dsrMainBasis({rating:9999}).value,null);
 const players=roster(),results=context.dsrProjectedChanges(players,ratings(players,6000,6000,70),'main_current');
 for(const value of results.values()){assert.equal(value.win,50);assert.equal(value.scope,'main_current');}
});
check('Nonfinite or wrongly typed ratings reject team strength, invalid mode counts reject that player',()=>{
 const players=roster();
 for(const invalid of [NaN,Infinity,-Infinity,'2000',true,{}]){const bases=ratings(players);bases.set('a',{value:invalid,games:25});for(const value of estimate(players,bases).values()){assert.equal(value.status,'invalid-basis');assert.equal(value.win,null);assert.equal(value.loss,null);}}
 for(const games of [-1,.5,NaN,Infinity,'25',true]){const bases=ratings(players);bases.set('a',{value:2000,games});const result=estimate(players,bases);assert.equal(result.get('a').status,'invalid-basis');assert.equal(result.get('a').win,null);assert.equal(result.get('b').win,50);}
});
check('Malformed rosters are unsupported while distinct arbitrary slot IDs work',()=>{
 for(const mutate of [players=>players.pop(),players=>players.push({...players[0],id:'extra'}),players=>players[0].id=players[1].id,players=>players[0].id=' ',players=>players[0].team=2,players=>players[0].team='1',players=>players[0]=null]){const players=roster();mutate(players);for(const value of estimate(players,new Map()).values()){assert.equal(value.status,'unsupported');assert.equal(value.win,null);assert.equal(value.loss,null);}}
 for(const players of [null,undefined,{},[]])assert.equal(estimate(players,new Map()).size,0);
});
check('Extreme finite bases stay finite or explicitly reject overflowing expansion',()=>{
 const players=roster();
 for(const [one,two] of [[Number.MAX_VALUE,Number.MAX_VALUE],[Number.MAX_VALUE,2000],[2000,Number.MAX_VALUE],[-1e300,2000]])for(const value of estimate(players,ratings(players,one,two)).values()){assert.equal(value.status,'ready');assert.ok(Number.isFinite(value.win));assert.ok(Number.isFinite(value.loss));}
 for(const value of estimate(players,ratings(players,-Number.MAX_VALUE,2000)).values()){assert.equal(value.status,'invalid-basis');assert.equal(value.win,null);}
});
check('Frozen roster and bases stay unchanged and results are fresh',()=>{
 const players=roster(),bases=ratings(players,2000,3000,7),before=JSON.stringify([...bases]);
 for(const player of players)Object.freeze(player);Object.freeze(players);for(const basis of bases.values())Object.freeze(basis);Object.freeze(bases);
 const snapshot=JSON.stringify(players),result=estimate(players,bases);result.get('a').win=999;result.delete('b');const next=estimate(players,bases);assert.equal(next.size,6);assert.notEqual(next.get('a').win,999);assert.equal(JSON.stringify(players),snapshot);assert.equal(JSON.stringify([...bases]),before);
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
