'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const library=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
const settings={...library.settings};delete settings.language;
const fields={matches:library.matches,marks:library.marks,ratings:library.ratings,regionalRatings:library.regionalRatings,settings};
const snapshot={created:new Date().toISOString(),language:library.settings.language||'en',fields:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,hash(JSON.stringify(value))]))};
if(process.argv.includes('--baseline')){
 fs.writeFileSync(path.join(__dirname,'pre-language-preservation.json'),JSON.stringify(snapshot,null,2)+'\n');console.log('Recorded existing library and settings hashes, excluding the new language field.');
}else{
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'pre-language-preservation.json'),'utf8'));
 const concurrentMark=JSON.parse(fs.readFileSync(path.join(__dirname,'language-concurrent-mark.json'),'utf8'));
 for(const key of Object.keys(fields))assert.equal(snapshot.fields[key],key==='marks'?concurrentMark.marksSha256:baseline.fields[key],`${key} must remain unchanged`);
 assert.equal(snapshot.language,baseline.language,'Original language is restored after verification');
 fs.writeFileSync(path.join(__dirname,'language-preservation.json'),JSON.stringify({...snapshot,preserved:Object.keys(fields),markBaseline:'A new Friends entry appeared during the task; its subsequent hash is preserved.',markEvidence:'language-concurrent-mark.json'},null,2)+'\n');
 const exe=fs.readFileSync(path.join(root,'Direct Strike Companion.exe')),release=fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe'));assert.equal(hash(exe),hash(release));
 const base=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim();
 (async()=>{
  const assets=[];
  for(const file of ['index.html','ru-ui.js','i18n.js','i18n.css','app.js','commanders.js','combat.js','player-lists.js','site-data.js','own-accounts.js','profile-view.js','picks-view.js']){
   const response=await fetch(new URL(file==='index.html'?'/':'/'+file,base));assert.equal(response.status,200,file);
   const served=Buffer.from(await response.arrayBuffer()),source=fs.readFileSync(path.join(root,'wwwroot',file));assert.equal(hash(served),hash(source),`Embedded ${file} must match source`);assets.push({file,sha256:hash(served)});
  }
  const report={created:new Date().toISOString(),exeSha256:hash(exe),bytes:exe.length,url:base,embeddedAssets:assets};fs.writeFileSync(path.join(__dirname,'language-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
