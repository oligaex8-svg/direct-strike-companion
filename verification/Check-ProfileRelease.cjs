'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const library=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
const fields=['matches','marks','ratings','settings'];
const snapshot={created:new Date().toISOString(),fields:Object.fromEntries(fields.map(key=>[key,hash(JSON.stringify(library[key]))]))};
if(process.argv.includes('--baseline')){
 fs.writeFileSync(path.join(__dirname,'pre-profile-preservation.json'),JSON.stringify(snapshot,null,2)+'\n');
 console.log('Recorded replay, note, rating-link and settings hashes.');
}else{
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'pre-profile-preservation.json'),'utf8'));
 for(const key of fields)assert.equal(snapshot.fields[key],baseline.fields[key],`${key} must remain unchanged`);
 fs.writeFileSync(path.join(__dirname,'profile-preservation.json'),JSON.stringify({...snapshot,preserved:fields},null,2)+'\n');
 const exe=fs.readFileSync(path.join(root,'Direct Strike Companion.exe'));
 const release=fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe'));
 assert.equal(hash(exe),hash(release));
 const base=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim();
 (async()=>{
  const assets=[];
  for(const file of ['index.html','app.js','profile.js','profile-view.js','profile.css']){
   const response=await fetch(new URL(file==='index.html'?'/':'/'+file,base));assert.equal(response.status,200,file);
   const served=Buffer.from(await response.arrayBuffer()),source=fs.readFileSync(path.join(root,'wwwroot',file));
   assert.equal(hash(served),hash(source),`Embedded ${file} must match source`);
   assets.push({file,sha256:hash(served)});
  }
  const report={created:new Date().toISOString(),exeSha256:hash(exe),bytes:exe.length,url:base,embeddedAssets:assets};
  fs.writeFileSync(path.join(__dirname,'profile-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
