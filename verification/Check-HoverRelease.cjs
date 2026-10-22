'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bytesHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const hash=value=>bytesHash(JSON.stringify(canonical(value)));
(async()=>{
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,process.argv[2]||'hover-private-baseline.json'),'utf8'));
 const url=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim(),assets={};
 const response=await fetch(url+'/api/state',{headers:{'X-DS-Companion':'1'}});assert.equal(response.status,200);
 const state=await response.json();
 for(const file of ['picks-view.js','picks-hover.js','lobby.js','lobby.css','index.html','ru-ui.js']){
  const response=await fetch(url+'/'+file);assert.equal(response.status,200);
  const value=bytesHash(Buffer.from(await response.arrayBuffer()));
  assert.equal(value,bytesHash(fs.readFileSync(path.join(root,'wwwroot',file))),file);assets[file]=value;
 }
 const friendly=bytesHash(fs.readFileSync(path.join(root,'Direct Strike Companion.exe')));
 assert.equal(friendly,bytesHash(fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe'))));
 const saved=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
 const regionalLinks=Object.entries(saved.regionalRatings||{}).map(([id,value])=>({id,eu:value.eu?.profileId??null,americas:value.americas?.profileId??null}));
 const privateChecks={marksPreserved:hash(saved.marks)===baseline.marks,settingsPreserved:hash(saved.settings)===baseline.settings,regionalLinksPreserved:baseline.regionalProfileLinks?hash(regionalLinks)===baseline.regionalProfileLinks:hash(saved.regionalRatings)===baseline.regionalLinks};
 for(const [name,value] of Object.entries(privateChecks))assert.equal(value,true,name);
 const archive=path.join(root,baseline.archive),archiveHash=bytesHash(fs.readFileSync(archive));
 assert.equal(archiveHash,baseline.archiveHash);assert.equal(fs.statSync(archive).mtime.toISOString(),baseline.archiveModified);
 const report={created:new Date().toISOString(),url,assetsMatchSource:assets,friendlyExeMatchesRelease:true,friendlySha256:friendly,privateChecks,matchesBefore:baseline.matches,matchesNow:saved.matches.length,eligibleMatches:state.library.matches.length,portableZipBuilt:false,previousZipUnchanged:true,previousZipSha256:archiveHash};
 fs.writeFileSync(path.join(__dirname,process.argv[3]||'hover-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
