'use strict';
// One immutable saved-library snapshot; no replay launches or library writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../../data/library.json');
const bytes=fs.readFileSync(source),library=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'wwwroot/unit-icon-catalog.js'),'utf8'),context);
const catalog=context.window.sc2UnitIcons,types=new Set(),commanders=new Map();
let rows=0,unknownKills=0,unknownRows=0;
for(const match of library.matches)for(const player of match.players){
 const commander=player.commander;
 if(!commanders.has(commander))commanders.set(commander,{types:new Set(),replays:new Set(),rows:0,unknownKills:0});
 const record=commanders.get(commander);record.replays.add(match.hash);
 for(const unit of player.combat?.impact?.units||[]){
  if(unit.name==='Unknown'){unknownKills+=unit.kills;unknownRows++;record.unknownKills+=unit.kills;continue;}
  if(unit.name==='Other')continue;
  rows++;record.rows++;types.add(unit.name);record.types.add(unit.name);
 }
}
const missing=[...types].filter(name=>!catalog[name]).sort();
const report={success:missing.length===0,checkedAt:new Date().toISOString(),source,sourceSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),
 scope:'Identified types in saved combat records only; not a complete playable roster. Unknown kill sources remain explicit. Snapshot may precede combat-v6 reprocessing.',
 matches:library.matches.length,identifiedTypes:types.size,identifiedRows:rows,mappedTypes:types.size-missing.length,missing,unknownRows,unknownKills,
 unrepresentedCommanders:['Abathur','Alarak','Artanis','Dehaka','Fenix','Horner','Karax','Kerrigan','Mengsk','Nova','Raynor','Stetmann','Stukov','Swann','Tychus','Vorazun','Zagara','Zeratul'].filter(name=>!commanders.has(name)),
 commanders:[...commanders].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,replays:value.replays.size,identifiedTypes:value.types.size,identifiedRows:value.rows,missing:[...value.types].filter(type=>!catalog[type]),unknownKills:value.unknownKills}))};
fs.writeFileSync(path.join(__dirname,'unit-icon-coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({success:report.success,matches:report.matches,identifiedTypes:types.size,identifiedRows:rows,missing,unknownKills,unrepresentedCommanders:report.unrepresentedCommanders}));
assert.deepEqual(missing,[],'Every identified type in the saved-library snapshot has verified icon art');
