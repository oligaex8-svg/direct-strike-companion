'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const url=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim(),assets={};
 const response=await fetch(url+'/api/state',{headers:{'X-DS-Companion':'1'}});assert.equal(response.status,200);const state=await response.json();
 for(const file of ['site-history.js','site-data.js','picks-view.js','picks-hover.js','lobby.js','lobby.css','app.js','index.html','ru-ui.js']){
  const response=await fetch(url+'/'+file);assert.equal(response.status,200);const value=hash(Buffer.from(await response.arrayBuffer()));assert.equal(value,hash(fs.readFileSync(path.join(root,'wwwroot',file))),file);assets[file]=value;
 }
 const friendly=hash(fs.readFileSync(path.join(root,'Direct Strike Companion.exe')));assert.equal(friendly,hash(fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe'))));
 assert.equal(state.library.settings.language,'en');assert.equal(state.library.settings.pingOnGameLoading,false);assert.equal(state.library.settings.pingOnGameLoaded,false);
 const histories=Object.values(state.library.siteHistories),games=Object.values(state.library.siteGames);
 assert(histories.length>0);assert(games.length>0);assert(histories.every(history=>history.games.length<=100&&history.games.every(game=>game.mode==='3v3 commanders')));assert(histories.length<=500&&games.length<=120);
 const report={created:new Date().toISOString(),url,assetsMatchSource:assets,friendlyExeMatchesRelease:true,friendlySha256:friendly,defaultOptionsRestored:true,language:'en',siteHistories:histories.map(history=>({profileId:history.profileId,region:history.region,name:history.name,games:history.games.length,status:history.status})),siteGames:games.length};
 fs.writeFileSync(path.join(__dirname,'site-sounds-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 const scans=['exe','zip'].map(kind=>{const log=fs.readFileSync(path.join(__dirname,`site-sounds-${kind}-scan-output.txt`),'utf8');assert.match(log,/found no threats\./);return{kind,exit:0,noThreats:true};});fs.writeFileSync(path.join(__dirname,'site-sounds-defender.json'),JSON.stringify({created:new Date().toISOString(),scans,scope:'Targeted diagnostic scans of this EXE and ZIP; no settings changed.'},null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
