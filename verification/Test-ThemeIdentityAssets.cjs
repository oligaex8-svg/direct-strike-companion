'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),sources=require('../assets/themes/identity-sources.json'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function run(){
 sharp.concurrency(1);sharp.cache(false);const checks=[],frames=[],fields=[];
 for(const asset of sources.native.assets){
  const original=fs.readFileSync(path.join(root,asset.source)),runtime=fs.readFileSync(path.join(root,'wwwroot',asset.runtime));
  assert.equal(hash(original),asset.sha256);assert.equal(hash(runtime),asset.sha256);checks.push({native:asset.name,unchanged:true});
 }
 for(const skin of sources.authored.profiles){
  const bytes=fs.readFileSync(path.join(root,'wwwroot',skin.frame)),field=fs.readFileSync(path.join(root,'wwwroot',skin.field));
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,160);assert.equal(info.height,100);
  const alpha=(x,y)=>data[(y*info.width+x)*4+3];
  assert.equal(alpha(80,50),0,skin.id+': transparent viewing well');
  // Every adjoining edge interval contains material, including the corners'
  // nearest straight cross-sections. Browser checks own the actual scaling.
  for(const x of [31,32,80,127,128]){
   assert.ok(Array.from({length:32},(_,y)=>alpha(x,y)).some(a=>a>128),skin.id+': top rail '+x);
   assert.ok(Array.from({length:32},(_,y)=>alpha(x,99-y)).some(a=>a>128),skin.id+': bottom rail '+x);
  }
  for(const y of [31,32,50,67,68]){
   assert.ok(Array.from({length:32},(_,x)=>alpha(x,y)).some(a=>a>128),skin.id+': left rail '+y);
   assert.ok(Array.from({length:32},(_,x)=>alpha(159-x,y)).some(a=>a>128),skin.id+': right rail '+y);
  }
  frames.push(hash(bytes));fields.push(hash(field));checks.push({id:skin.id,transparentCentre:true,fourConnectedRails:true});
 }
 assert.equal(new Set(frames).size,18,'Separate frame compositions');assert.equal(new Set(fields).size,18,'Separate etched compositions');
 const report={success:true,scope:'Native source integrity and authored bezel transparency/rail coverage; not a visual-acceptance claim',nativeAssets:sources.native.assets.length,frames:frames.length,distinctFrames:new Set(frames).size,distinctFields:new Set(fields).size,checks};
 fs.writeFileSync(path.join(__dirname,process.env.DSC_IDENTITY_REPORT||'local23-identity-assets.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({success:true,nativeAssets:report.nativeAssets,frames:report.frames}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
