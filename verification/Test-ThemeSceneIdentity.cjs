'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
const g=require('./Build-ThemeLoops.cjs'),root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),report={success:false,scenes:[],grayscalePairs:[],failures:[]};
function check(value,message){if(!value)report.failures.push(message);}
function cosine(a,b){let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){ab+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return ab/Math.sqrt(aa*bb);}
function visible(a,i){const alpha=a[i+3]/255;return alpha*(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722);}
(async()=>{
 const m=JSON.parse(fs.readFileSync(path.join(web,'themes/loops/manifest.json'),'utf8'));assert.equal(m.revision,3);const distinct=new Set(),tiles=[],gray={};
 for(const {id,label} of g.themes){
  const ctx=g.createContext(id,'inset');distinct.add(ctx.anatomy.renderers[id]);
  const start=ctx.anatomy.draw(id,'inset',0).data,end=ctx.anatomy.draw(id,'inset',1).data;let period=0;
  for(let i=0;i<start.length;i++)period+=Math.abs(start[i]-end[i]);period/=start.length;check(period<.02,'Renderer itself must be periodic: '+id);
  const asset=m.assets.find(a=>a.id===id&&a.kind==='inset'),atlas=await sharp(path.join(web,asset.src)).ensureAlpha().raw().toBuffer(),means=[];
  for(let f=0;f<96;f++){
   const col=f%32,row=Math.floor(f/32);let total=0;
   for(let y=0;y<128;y++)for(let x=0;x<256;x++)total+=visible(atlas,((row*128+y)*8192+col*256+x)*4);
   means.push(total/(256*128));
  }
  const average=means.reduce((a,b)=>a+b)/96,min=Math.min(...means),max=Math.max(...means),steps=means.map((v,i)=>Math.abs(v-means[(i+95)%96])),maxStep=Math.max(...steps);
  check(min>average*.55&&min>.4,'Body never blacks out: '+id);check(maxStep<average*.2,'No frame-wide flicker: '+id);
  report.scenes.push({id,silhouette:asset.silhouette,choreography:asset.choreography,periodDifference:period,meanLuminance:average,minLuminance:min,maxLuminance:max,maxAdjacentLuminanceChange:maxStep,relativeStep:maxStep/average});
  const body=await sharp(path.join(web,asset.poster)).flatten({background:'#0b1017'}).png().toBuffer(),headerAsset=m.assets.find(a=>a.id===id&&a.kind==='header'),header=await sharp(path.join(web,headerAsset.poster)).flatten({background:'#0b1017'}).png().toBuffer();
  const grayBody=await sharp(body).greyscale().normalize().png().toBuffer();gray[id]=await sharp(grayBody).resize(64,32).removeAlpha().raw().toBuffer();
  const title=Buffer.from('<svg width="512" height="28"><text x="10" y="18" fill="#e5edf2" font-family="Arial" font-size="13">'+id+' · '+label.replaceAll('&','&amp;')+'</text></svg>');
  const tile=await sharp({create:{width:512,height:224,channels:4,background:'#0b1017'}}).composite([{input:title,left:0,top:0},{input:header,left:0,top:29},{input:body,left:0,top:96},{input:grayBody,left:256,top:96}]).png().toBuffer();tiles.push(tile);
 }
 assert.equal(distinct.size,20,'Twenty explicit construction/choreography functions');
 const critical=['fenix','nova','zerg','abathur','cerberus','arcade'];for(let i=0;i<critical.length;i++)for(let j=i+1;j<critical.length;j++){
  const a=critical[i],b=critical[j],similarity=cosine(gray[a],gray[b]);report.grayscalePairs.push({a,b,similarity});check(similarity<.985,'Critical silhouettes must differ without colour: '+a+'/'+b);
 }
 await sharp({create:{width:2048,height:1120,channels:4,background:'#0b1017'}}).composite(tiles.map((input,i)=>({input,left:i%4*512,top:Math.floor(i/4)*224}))).webp({quality:94}).toFile(path.join(__dirname,'local34-scene-identities.webp'));
 assert.deepEqual(report.failures,[]);report.success=true;console.log(JSON.stringify({success:true,scenes:20,uniqueRenderers:distinct.size,grayscalePairs:report.grayscalePairs.length,maxRelativeBrightnessStep:Math.max(...report.scenes.map(s=>s.relativeStep))}));
})().catch(e=>{report.error=e.stack;console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(__dirname,'local34-scene-identity.json'),JSON.stringify(report,null,2)));
