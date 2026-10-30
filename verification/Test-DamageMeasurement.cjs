'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname,load=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,''));
const result=load('sc2api-native-damage.json'),match=result.match;
assert.equal(result.success,true);assert.equal(result.settingsRestored,true);
const persisted=load('sc2api-native-damage.json.data/library.json').matches.find(m=>m.hash===match.hash);
assert.deepEqual(persisted.damage,match.damage,'Verified evidence survives durable library serialization');
assert.deepEqual(persisted.players.map(p=>p.combat.values),match.players.map(p=>p.combat.values),'Damage values persisted exactly');
assert.ok([3,6].includes(match.damage.players.length));
assert.equal(new Set(match.damage.players.map(p=>p.scorePlayerId)).size,match.damage.players.length);
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'../wwwroot/replay-impact.js'),'utf8'),context);
const scores=context.replayImpactScores(match),before=structuredClone(match);
before.players.forEach(p=>{p.combat.values.DamageDealt=null;p.combat.values.DamageTaken=null;});
const previous=context.replayImpactScores(before),rows=[];
for(const player of match.players){
 const recorded=match.damage.players.find(p=>p.accountId===player.id),values=player.combat.values,score=scores.get(player.id);
 if(!recorded){
  assert.equal(values.DamageDealt??null,null);assert.equal(values.DamageTaken??null,null);
  assert.equal(score.partial,true);assert.equal(score.value,previous.get(player.id).value);
  continue;
 }
 assert.ok(recorded.finalLoop>=18334);
 assert.equal(values.DamageDealt,recorded.damageDealt);assert.equal(values.DamageTaken,recorded.damageTaken);
 assert.ok(Number.isFinite(values.DamageDealt)&&values.DamageDealt>=0&&Number.isFinite(values.DamageTaken)&&values.DamageTaken>=0);
 assert.equal(score.partial,false);
 assert.equal(score.components.find(c=>c.key==='DamageDealt').weight,.4);
 assert.equal(score.components.find(c=>c.key==='DamageTaken').weight,.2);
 assert.ok(player.combat.impact.units.every(u=>u.damageDealt==null&&u.damageTaken==null),'Player damage must not be invented for individual unit types');
 rows.push({name:player.name,damageDealt:Math.round(values.DamageDealt),damageReceived:Math.round(values.DamageTaken),impact:score.value,previousImpact:previous.get(player.id).value});
}
for(const team of [1,2]){
 const players=match.players.filter(p=>p.team===team),measured=players.filter(p=>match.damage.players.some(r=>r.accountId===p.id));
 assert.ok(measured.length===0||measured.length===3,'A damage channel must cover the entire team');
 assert.ok(Math.abs(players.reduce((sum,p)=>sum+scores.get(p.id).value,0)-100)<1e-8);
}
assert.ok(rows.some(p=>Math.abs(p.impact-p.previousImpact)>.01),'Measured damage must actually change this replay’s Impact scores');
fs.writeFileSync(path.join(root,'impact-damage-replay.json'),JSON.stringify({match}));
const report={success:true,scope:'Native SC2 complete-team final measurements, persistence and actual Impact calculation',measuredPlayers:rows.length,unavailablePlayers:match.players.length-rows.length,phase:result.status.phase,rows};
fs.writeFileSync(path.join(root,'damage-measurement-check.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
