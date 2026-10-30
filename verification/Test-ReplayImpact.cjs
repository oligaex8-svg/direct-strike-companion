'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','wwwroot','replay-impact.js'),'utf8'),context);
const score=match=>context.replayImpactScores(match),checks=[];
const check=(name,action)=>{action();checks.push(name);};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const game=(army=[100,200,300],kills=[3,2,1])=>({players:Array.from({length:6},(_,index)=>({id:`p${index}`,team:index<3?1:2,combat:{values:{MineralsKilledArmy:army[index%3],UnitKills:kills[index%3]}}}))});
const assertTeamTotal=(match,results,team)=>close(match.players.filter(player=>player.team===team).reduce((sum,player)=>sum+results.get(player.id).value,0),100);
check('Known weighted contributions use only raw combat metrics and retain effective components',()=>{
 const match=game();Object.assign(match.players[0],{apm:9999,rating:9999,wins:9999});match.economy={middleTime:[9999,0]};
 const results=score(match);[25,100/3,125/3].forEach((value,index)=>close(results.get(`p${index}`).value,value));
 const first=results.get('p0');assert.equal(first.status,'ready');assert.equal(first.components.length,2);
 assert.equal(first.components[0].key,'MineralsKilledArmy');assert.equal(first.components[0].weight,0.75);close(first.components[0].share,100/6);assert.equal(first.components[0].value,100);assert.equal(first.components[0].total,600);
 assert.equal(first.components[1].key,'UnitKills');assert.equal(first.components[1].weight,0.25);close(first.components[1].share,50);assert.equal(first.components[1].total,6);
 assertTeamTotal(match,results,1);assertTeamTotal(match,results,2);
});
check('Equal contributions are unrounded thirds; zero and extreme contributions remain bounded',()=>{
 close(score(game([1,1,1],[1,1,1])).get('p0').value,100/3);
 for(const high of [1e12,Number.MAX_VALUE]){
  const match=game([0,high,high],[0,high,high]),results=score(match);
  close(results.get('p0').value,0);close(results.get('p1').value,50);close(results.get('p2').value,50);assertTeamTotal(match,results,1);
 }
 close(score(game([0,0,1],[0,0,1])).get('p2').value,100);
});
check('Metric scaling and player ordering do not change contribution',()=>{
 const match=game(),scaled=game([100e6,200e6,300e6],[3e-6,2e-6,1e-6]);scaled.players.reverse();
 const baseline=score(match),results=score(scaled);for(const [id,result] of baseline)close(results.get(id).value,result.value);
});
check('Teams use independent denominators and availability',()=>{
 const match=game();match.players[3].combat.values.MineralsKilledArmy=null;match.players[3].combat.values.UnitKills=1000;
 const results=score(match);close(results.get('p0').value,25);assert.equal(results.get('p3').components.length,1);close(results.get('p3').value,1000/1003*100);assertTeamTotal(match,results,2);
});
check('One invalid teammate drops the whole metric and renormalizes the remaining weight',()=>{
 for(const invalid of [null,undefined,-1,NaN,Infinity,-Infinity,'100',{},true]){
  const match=game();match.players[1].combat.values.MineralsKilledArmy=invalid;
  const results=score(match);for(let index=0;index<3;index++){const result=results.get(`p${index}`);assert.equal(result.status,'ready');assert.equal(result.components.length,1);assert.equal(result.components[0].weight,1);assert.equal(result.components[0].key,'UnitKills');close(result.value,[50,100/3,100/6][index]);}
 }
 const match=game();delete match.players[1].combat;for(const player of match.players.slice(0,3))assert.equal(score(match).get(player.id).status,'missing');
});
check('A complete all-zero metric drops without penalizing the usable metric',()=>{
 for(const match of [game([0,0,0],[3,2,1]),game([3,2,1],[0,0,0])]){
  const results=score(match);close(results.get('p0').value,50);assert.equal(results.get('p0').components[0].weight,1);assert.equal(results.get('p0').components.length,1);assertTeamTotal(match,results,1);
 }
});
check('No combat differs from missing evidence and neither fabricates an equal share',()=>{
 const zero=game([0,0,0],[0,0,0]);zero.players.forEach(p=>Object.assign(p.combat.values,{DamageDealt:0,DamageTaken:0}));for(const result of score(zero).values()){assert.equal(result.value,null);assert.equal(result.status,'no-combat');assert.equal(result.components.length,0);}
 for(const match of [game([null,null,null],[null,null,null]),game([0,0,0],[0,null,0]),game([-1,0,0],[0,0,0])]){
  for(const result of score(match).values()){assert.equal(result.value,null);assert.equal(result.status,'missing');assert.equal(result.components.length,0);}
 }
});
check('Unsupported team sizes and invalid or duplicate identities reject the whole match',()=>{
 const mutations=[match=>match.players.pop(),match=>match.players.push({...match.players[0],id:'extra'}),match=>match.players[0].team=2,match=>match.players[0].team=3,match=>match.players[0].team='1',match=>match.players[0].id='p1',match=>match.players[0].id='',match=>match.players[0].id=' ',match=>match.players[0].id=123,match=>match.players[0]=null];
 for(const mutate of mutations){const match=game();mutate(match);for(const result of score(match).values()){assert.equal(result.value,null);assert.equal(result.status,'unsupported');assert.equal(result.components.length,0);}}
});
check('Malformed matches safely return an empty map',()=>{for(const match of [null,undefined,{},[],{players:null},{players:{}},{players:[]}])assert.equal(score(match).size,0);});
check('Frozen input is unchanged and outputs are fresh for each call',()=>{
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 const match=freeze(game()),before=JSON.stringify(match),first=score(match);first.get('p0').components[0].weight=99;first.get('p0').value=-1;
 const second=score(match);assert.equal(JSON.stringify(match),before);close(second.get('p0').value,25);assert.equal(second.get('p0').components[0].weight,0.75);
});
check('Measured damage changes impact and all four shares normalize to100',()=>{
 const m=game([100,100,100],[10,10,10]);m.players.forEach((p,i)=>Object.assign(p.combat.values,{DamageDealt:i%3===0?900:0,DamageTaken:i%3===1?900:0}));
 const values=score(m);close(values.get('p0').value,40+40/3);close(values.get('p1').value,20+40/3);close(values.get('p2').value,40/3);assert.equal(values.get('p0').partial,false);
 close([...values.values()].slice(0,3).reduce((sum,r)=>sum+r.value,0),100);
});
check('Partial teammate damage is excluded for everyone rather than assumed zero',()=>{
 const m=game();m.players[0].combat.values.DamageDealt=10000;const before=score(game()),after=score(m);close(after.get('p0').value,before.get('p0').value);assert.ok(after.get('p0').partial);assert.ok(after.get('p0').components.every(c=>c.key!=='DamageDealt'));
});
check('Complete measured zero damage channels are not marked incomplete',()=>{const m=game();m.players.forEach(p=>Object.assign(p.combat.values,{DamageDealt:0,DamageTaken:0}));assert.equal(score(m).get('p0').partial,false);});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
