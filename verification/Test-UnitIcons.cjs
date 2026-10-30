'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'wwwroot/unit-icon-catalog.js'),'utf8'),context);
const catalog=context.window.sc2UnitIcons,sources=JSON.parse(fs.readFileSync(path.join(root,'assets/unit-icons/sources.json'),'utf8'));
assert.ok(Object.isFrozen(catalog));assert.equal(catalog.Unknown,undefined);assert.equal(catalog.Other,undefined);
for(const [name,url] of Object.entries(catalog)){
 assert.match(url,/^\/images\/units\/[a-f0-9]{16}\.png$/);
 const data=fs.readFileSync(path.join(root,'wwwroot',url.slice(1)));
 assert.equal(data.subarray(1,4).toString(),'PNG',name);
 assert.ok(data.readUInt32BE(16)>=24&&data.readUInt32BE(20)>=24,name+' has usable source resolution');
}
for(const source of sources.textures){
 const data=fs.readFileSync(path.join(root,'wwwroot/images/units',source.file+'.png'));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),source.pngSHA256,source.archivePath);
}
for(const [alias,target] of Object.entries(sources.curatedDirectStrikeAliases))assert.equal(catalog[alias],catalog[target],alias);
// Tracker variants use the original art for their corresponding unit forms.
for(const [name,target] of Object.entries({HeroZagaraWaveUnit:'ZaGara',Splitterling:'HotSSplitterlingBig',SplitterlingSpawn:'HotSSplitterlingMedium',HunterKillerZagara:'HunterKiller',ZagaraRoach:'Roach',SwarmlingLightweight:'HotSSwarmling'})){
 assert.ok(catalog[name],name+' is available');assert.equal(catalog[name],catalog[target],name+' uses the corresponding original unit art');
}
assert.notEqual(catalog.Splitterling,catalog.SplitterlingSpawn,'splitterling parent and spawn retain distinct art');
for(const [name,target] of Object.entries({HeroAlarakWaveUnit:'AlarakCoop',HornerDeimosVikingFighter:'HHVikingFighter',HornerDeimosVikingAssault:'HHVikingAssault',TrooperMengskFlamethrower:'TrooperMengsk',Vanguard:'ImmortalTaldarim',Wrathwalker:'ColossusTaldarimACGluescreenDummy'}))assert.equal(catalog[name],catalog[target],name+' matches its unit form');
assert.notEqual(catalog.HornerDeimosVikingFighter,catalog.HornerDeimosVikingAssault,'Viking forms retain distinct original art');
assert.equal(catalog.Destroyer,catalog.VoidRayTaldarim,"Alarak Destroyer uses its catalog-identified Tal'darim unit art");
for(const [name,texture] of Object.entries({HonorGuard:'btn-unit-protoss-zealot-aiur.dds',HornerAssaultDrone:'btn-unit-collection-interceptor-junker.dds',TychusRattlesnakeDeployRevitalizer:'btn-building-terran-tychushealingward.dds',TychusSiriusWarhoundTurret:'btn-building-terran-tychuswarhoundturret.dds'})){
 const source=sources.units[name];assert.ok(catalog[name],name+' is available');
 assert.equal(source.method,'Direct Strike actor UnitIcon');assert.equal(source.actor,name);
 assert.ok(source.archivePath.endsWith('/'+texture),name+' uses the replay map actor texture');
 assert.equal(catalog[name],'/images/units/'+source.file+'.png');
}
assert.ok(catalog.HornerStrikeFighter);assert.equal(sources.units.HornerStrikeFighter.button,'TrainHHBomber');assert.equal(sources.units.HornerStrikeFighter.method,'Curated button Icon');
assert.ok(catalog.ParasiticBombRelayDummy);assert.equal(sources.units.ParasiticBombRelayDummy.button,'ParasiticBomb');assert.ok(sources.units.ParasiticBombRelayDummy.archivePath.endsWith('/btn-ability-zerg-parasiticbomb.dds'));
for(const [first,second] of [['PurifierTalis','PurifierAdept'],['Mojo','PurifierScout'],['DehakaPrimalHydralisk','Hydralisk'],['LurkerStetmannBurrowed','Lurker']])assert.notEqual(catalog[first],catalog[second],first+' retains distinct art');
const replay=JSON.parse(fs.readFileSync(path.join(__dirname,'impact-real-replay.json'),'utf8').replace(/^\uFEFF/,''));
const names=[...new Set(replay.match.players.flatMap(p=>p.combat.impact.units.map(u=>u.name)))].filter(n=>n!=='Unknown'&&n!=='Other');
const missing=names.filter(name=>!catalog[name]);assert.deepEqual(missing,[],'Regression replay has no unmapped identified unit types');
const report={success:true,catalogEntries:Object.keys(catalog).length,sourceTextures:sources.textures.length,curatedAliases:Object.keys(sources.curatedDirectStrikeAliases).length,fixtureUnitTypes:names.length,missing};
fs.writeFileSync(path.join(__dirname,'unit-icon-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
