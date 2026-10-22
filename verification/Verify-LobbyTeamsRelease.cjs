'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const url=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim();
 const response=await fetch(url+'/api/state',{headers:{'X-DS-Companion':'1'}});assert.equal(response.status,200);
 const state=await response.json(),assets={};
 for(const file of ['lobby.js','lobby.css','picks-hover.js','own-accounts.js','own-accounts.css','app.js','index.html','ru-ui.js']){
  const resource=await fetch(url+'/'+file);assert.equal(resource.status,200,file);
  assets[file]=digest(Buffer.from(await resource.arrayBuffer()));assert.equal(assets[file],digest(fs.readFileSync(path.join(root,'wwwroot',file))),file);
 }
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'lobby-compact-private-baseline.json'),'utf8'));
 const database=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8')),preserved={};
 for(const field of Object.keys(baseline.fields)){preserved[field]=digest(JSON.stringify(database[field]))===baseline.fields[field];assert.equal(preserved[field],true,field);}
 assert.equal(state.library.settings.language,'en');assert.deepEqual(state.library.settings.selfIds,['1-S2-1-13373014','2-S2-1-7408040']);
 const result={created:new Date().toISOString(),url,assetsMatchSource:assets,preservedFields:preserved,originalMatches:baseline.matches,currentStoredMatches:database.matches.length,eligibleMatches:state.library.matches.length,ownIdsRestored:true,language:'en',source:state.lobby.source,rosterCount:state.lobby.rosterEntries.length,friendlyExeMatchesRelease:digest(fs.readFileSync(path.join(root,'Direct Strike Companion.exe')))===digest(fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe')))};
 assert.equal(result.friendlyExeMatchesRelease,true);
 fs.writeFileSync(path.join(__dirname,'lobby-teams-release.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
