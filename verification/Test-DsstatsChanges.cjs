'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','wwwroot','dsstats-changes.js'),'utf8'),context);
const estimate=(match,ratings,states)=>context.dsstatsReplayChanges(match,ratings,states),checks=[];
const check=(name,action)=>{action();checks.push(name);};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const game=()=>({mode:'Commanders',winner:1,players:Array.from({length:6},(_,index)=>({id:`2-S2-1-${100+index}`,team:index<3?1:2,result:index<3?'Win':'Loss'}))});
const ratings=(match,values=Array(6).fill(1000))=>new Map(match.players.map((player,index)=>[player.id,values[index]]));
const unavailable=(results,status)=>{for(const result of results.values()){assert.equal(result.delta,null);assert.equal(result.status,status);}};
check('Equal teams receive unrounded signed 31.5; all teammates share the estimate',()=>{
 const match=game(),results=estimate(match,ratings(match));assert.equal(results.size,6);
 for(const player of match.players){const result=results.get(player.id);assert.equal(result.status,'ready');close(result.expectedWin,.5);close(result.delta,player.team===1?31.5:-31.5);}
});
check('Team averages drive favourite and upset changes, independently of individual rating',()=>{
 const match=game(),values=[1000,1800,2600,200,1000,1800],results=estimate(match,ratings(match,values));
 const expectation=1/(1+10**(-1));
 for(const player of match.players){const result=results.get(player.id);close(result.expectedWin,player.team===1?expectation:1-expectation);close(result.delta,player.team===1?63/11:-63/11);}
 match.winner=2;for(const player of match.players)player.result=player.team===2?'Win':'Loss';
 const upset=estimate(match,ratings(match,values));close(upset.get(match.players[3].id).delta,630/11);close(upset.get(match.players[0].id).delta,-630/11);
});
check('Roster order, shared offsets, within-team distribution and team-number swapping preserve symmetry',()=>{
 const match=game(),values=[800,1200,1600,1000,1400,1800],baseline=estimate(match,ratings(match,values));
 const shuffled=game();shuffled.players.reverse();
 const shifted=values.map(value=>value+7000),redistributed=[1200,1200,1200,1400,1400,1400];
 for(const results of [estimate(shuffled,ratings(match,values)),estimate(match,ratings(match,shifted)),estimate(match,ratings(match,redistributed))]){
  for(const [id,result] of baseline)close(results.get(id).delta,result.delta);
 }
 match.winner=2;for(const player of match.players)player.team=3-player.team;
 const swapped=estimate(match,ratings(match,values));for(const [id,result] of baseline){close(swapped.get(id).delta,result.delta);close(swapped.get(id).expectedWin,result.expectedWin);}
});
check('Every missing or invalid exact rating suppresses both teams and reports a count',()=>{
 for(const invalid of [undefined,null,NaN,Infinity,-Infinity,'1000',true,{}]){
  const match=game(),current=ratings(match);current.set(match.players[0].id,invalid);current.delete(match.players[4].id);
  const results=estimate(match,current);unavailable(results,'missing-ratings');for(const result of results.values())assert.equal(result.missingRatings,2);
 }
 const match=game();for(const result of estimate(match,new Map()).values())assert.equal(result.missingRatings,6);
 unavailable(estimate(match,undefined),'missing-ratings');
});
check('Finite zero and negative ratings are usable without a floor',()=>{
 const match=game();for(const value of [0,-1500])close(estimate(match,ratings(match,Array(6).fill(value))).get(match.players[0].id).delta,31.5);
});
check('Absent outcomes use the winner; unknown or contradictory outcomes reject all estimates',()=>{
 const match=game();for(const player of match.players)delete player.result;
 close(estimate(match,ratings(match)).get(match.players[0].id).delta,31.5);
 for(const [index,value] of [[0,'Loss'],[3,'Win'],[0,'Unknown'],[3,''],[0,0],[0,null]]){
  const invalid=game();invalid.players[index].result=value;unavailable(estimate(invalid,ratings(invalid)),'unsupported-result');
 }
});
check('Incomplete, duplicate, mixed-region and unsupported identities or match shapes are rejected',()=>{
 const mutations=[match=>match.mode='Standard',match=>match.winner=0,match=>match.winner='1',match=>match.players.pop(),match=>match.players.push({...match.players[0],id:'2-S2-1-999'}),match=>match.players[0].team=2,match=>match.players[0].team='1',match=>match.players[0].id=match.players[1].id,match=>match.players[0].id='1-S2-1-100',match=>match.players[0].id='3-S2-1-100',match=>match.players[0].id='2-S2-0-100',match=>match.players[0].id='2-S2-1-0',match=>match.players[0].id='2-S2-01-100',match=>match.players[0].id='2-S2-1-0100',match=>match.players[0].id='2-S2-2147483648-100',match=>match.players[0].id='2-S2-1-9223372036854775808',match=>match.players[0].id='Same name',match=>match.players[0]=null];
 for(const mutate of mutations){const match=game();mutate(match);unavailable(estimate(match,new Map()),'unsupported');}
 const america=game();for(const player of america.players)player.id=player.id.replace(/^2/,'1');close(estimate(america,ratings(america)).get(america.players[0].id).delta,31.5);
 for(const malformed of [null,undefined,{},[],{players:null},{players:{}},{players:[]}])assert.equal(estimate(malformed,new Map()).size,0);
});
check('Extreme finite ratings cannot overflow averages or produce NaN',()=>{
 const match=game(),max=Number.MAX_VALUE;
 const cases=[Array(6).fill(max),Array(6).fill(-max),[max,max,max,-max,-max,-max],[-max,-max,-max,max,max,max],[max,-max,0,max,-max,0]];
 for(const values of cases){for(const result of estimate(match,ratings(match,values)).values()){assert.equal(result.status,'ready');assert.ok(Number.isFinite(result.delta));assert.ok(result.expectedWin>=0&&result.expectedWin<=1);assert.ok(Math.abs(result.delta)<=63);}}
 close(estimate(match,ratings(match,cases[0])).get(match.players[0].id).delta,31.5);
 close(estimate(match,ratings(match,cases[3])).get(match.players[0].id).delta,63);
});
check('No name, region, starting/average rating, DSR or combat inputs substitute for exact ratings',()=>{
 const match=game();Object.assign(match,{rating:1500,startingRating:1500,averageRating:1500,impact:100});
 for(const player of match.players)Object.assign(player,{name:'Same name',rating:1500,startingRating:1500,averageRating:1500,dsr:99999,impact:100,combat:{values:{MineralsKilledArmy:99999}}});
 const current=ratings(match);current.delete(match.players[0].id);current.set('Same name',1000);current.set('1-S2-1-100',1000);
 unavailable(estimate(match,current),'missing-ratings');
 const valid=estimate(match,ratings(match));for(const player of match.players)close(valid.get(player.id).delta,player.team===1?31.5:-31.5);
});
check('Frozen inputs are unchanged; outputs and maps are fresh',()=>{
 const match=game();match.players.forEach(Object.freeze);Object.freeze(match.players);Object.freeze(match);
 const current=ratings(match),before=JSON.stringify(match),entries=JSON.stringify([...current]);Object.freeze(current);
 const first=estimate(match,current);first.get(match.players[0].id).delta=999;first.delete(match.players[1].id);
 const second=estimate(match,current);assert.equal(second.size,6);close(second.get(match.players[0].id).delta,31.5);assert.equal(JSON.stringify(match),before);assert.equal(JSON.stringify([...current]),entries);
});
const states=(match,values=Array.from({length:6},()=>({consistency:.5,confidence:.5})))=>new Map(match.players.map((player,index)=>[player.id,values[index]]));
check('Published state gives the official individual consistency factor and preserves neutral parity',()=>{
 const match=game(),current=ratings(match);
 const published=states(match,Array.from({length:6},()=>({consistency:.9062,confidence:.8279})));
 const result=estimate(match,current,published);
 for(const player of match.players){const value=result.get(player.id);assert.equal(value.basis,'site-state');close(value.delta,(player.team===1?1:-1)*22.9698);close(value.expectedWin,.5);}
 for(const value of estimate(match,current,states(match)).values()){assert.equal(value.basis,'site-state');close(Math.abs(value.delta),31.5);}
});
check('Confidence is compared with the player own team average rather than the opposing team',()=>{
 const match=game(),current=ratings(match),state=states(match,[{consistency:.5,confidence:0},{consistency:.5,confidence:1},{consistency:.5,confidence:1},{consistency:.5,confidence:.1},{consistency:.5,confidence:.1},{consistency:.5,confidence:.1}]);
 const result=estimate(match,current,state),f=value=>1/(Math.sqrt(2*Math.PI)*(1.4-value));
 close(result.get(match.players[0].id).delta,63*(.5*(1-f(0))+.5*f(2/3)));
 close(result.get(match.players[1].id).delta,63*(.5*(1-f(1))+.5*f(2/3)));
 close(result.get(match.players[3].id).delta,-31.5);
 const changed=new Map(state);for(const player of match.players.filter(player=>player.team===2))changed.set(player.id,{consistency:.5,confidence:1});
 close(estimate(match,current,changed).get(match.players[0].id).delta,result.get(match.players[0].id).delta);
});
check('Lower consistency gives larger individual changes, including valid interval boundaries',()=>{
 const match=game(),current=ratings(match),state=states(match);state.set(match.players[0].id,{consistency:0,confidence:.5});state.set(match.players[1].id,{consistency:1,confidence:.5});
 const result=estimate(match,current,state);close(result.get(match.players[0].id).delta,42);close(result.get(match.players[1].id).delta,21);assert.equal(result.get(match.players[0].id).basis,'site-state');
});
check('Any absent or invalid state explicitly falls back for the entire roster',()=>{
 const match=game(),current=ratings(match);
 for(const invalid of [undefined,null,{},NaN,{consistency:.5},{consistency:NaN,confidence:.5},{consistency:.5,confidence:Infinity},{consistency:-.1,confidence:.5},{consistency:.5,confidence:1.1},{consistency:'0.5',confidence:.5}]){
  const state=states(match);state.set(match.players[0].id,invalid);
  for(const value of estimate(match,current,state).values()){assert.equal(value.basis,'baseline');close(Math.abs(value.delta),31.5);}
 }
 for(const value of estimate(match,current).values())assert.equal(value.basis,'baseline');
});
check('Published states and inputs stay immutable and extreme ratings remain finite',()=>{
 const match=game(),current=ratings(match,[-Number.MAX_VALUE,-Number.MAX_VALUE,-Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]);
 const state=states(match);for(const value of state.values())Object.freeze(value);Object.freeze(state);
 const snapshot=JSON.stringify([...state]);
 for(const value of estimate(match,current,state).values()){assert.equal(value.status,'ready');assert.equal(value.basis,'site-state');assert.ok(Number.isFinite(value.delta));}
 assert.equal(JSON.stringify([...state]),snapshot);
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
