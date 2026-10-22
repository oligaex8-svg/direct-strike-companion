'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({document:{addEventListener(){}},state:{library:{settings:{selfIds:[]}}},
 esc:value=>String(value??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),num:value=>String(value)});
for(const file of ['dsr-projections.js','replays.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../wwwroot',file),'utf8'),context);
const checks=[];
for(const delta of [0,17,-61]){
 const html=context.replaySourceChange('dsr',{delta,kind:'confirmed',scope:'main_current',detail:'Verified site delta'});
 assert.ok(html.includes('DSR Main'));assert.ok(html.includes('>'+(delta<0?'':'+')+delta+'</strong>'));assert.ok(!html.includes('~'));
 checks.push('Published '+delta+' keeps its sign and zero without an approximation marker');
}
const estimated=context.replaySourceChange('dsr',{delta:50,kind:'estimated',scope:'commanders_3v3'});
assert.ok(estimated.includes('DSR 3v3'));assert.ok(estimated.includes('~+50'));checks.push('Commanders forecast keeps its separate scope and approximation marker');
const players=Array.from({length:6},(_,i)=>({id:String(i),team:i<3?1:2,commander:''}));
const missing=new Map(players.slice(0,3).map(p=>[p.id,{value:7800,games:100}]));
assert.equal(context.dsrProjectedChanges(players,missing).get('0').win,null);
const complete=new Map(players.map(p=>[p.id,{value:6000,games:100}]));
assert.equal(context.dsrProjectedChanges(players,complete,'main_current').get('0').win,50);
checks.push('An incomplete high-rated team never receives the old default-opponent tiny gain; complete equal teams give +50');
const report={success:true,scope:'Synthetic regression evidence; not measured real-match accuracy',checks};
fs.writeFileSync(path.join(__dirname,'rating-estimate-evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
