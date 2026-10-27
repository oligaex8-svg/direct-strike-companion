'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
const g=require('./Build-ThemeEquipment.cjs'),root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),report={success:false,objects:[],failures:[]};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),check=(value,message)=>{if(!value)report.failures.push(message);};
function visibleDiff(a,b){let count=0,sum=0;for(let i=0;i<a.length;i+=4){let v=0;for(let j=0;j<3;j++)v+=Math.abs(a[i+j]*a[i+3]-b[i+j]*b[i+3])/255;if(v>3)count++;sum+=v;}return {pixels:count,total:sum};}
(async()=>{
 const m=JSON.parse(fs.readFileSync(path.join(web,'themes/equipment/manifest.json'),'utf8'));assert.equal(m.assets.length,80);assert.equal(m.sourceSha256,g.SOURCE_HASH);
 const tiles=[];
 for(const id of g.ids){
  await g.art.prepare(id); const rows=[];
  for(const part of g.parts){
   const a=m.assets.find(x=>x.id===id&&x.part===part),bytes=fs.readFileSync(path.join(web,a.src)),poster=fs.readFileSync(path.join(web,a.poster)),geometry=await sharp(bytes).metadata();
   check(hash(bytes)===a.sha256&&hash(poster)===a.posterSha256,'Hashes '+id+'/'+part);check(geometry.width===a.atlasWidth&&geometry.height===a.atlasHeight&&geometry.hasAlpha,'Atlas geometry '+id+'/'+part);
   const image=await sharp(poster).ensureAlpha().raw().toBuffer({resolveWithObject:true});let edge=0,hole=0,lit=0;
   for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const alpha=image.data[(y*a.width+x)*4+3];if(!x||!y||x===a.width-1||y===a.height-1)edge=Math.max(edge,alpha);if(part==='socket'&&x>=18&&x<a.width-18&&y>=18&&y<a.height-18)hole=Math.max(hole,alpha);if(alpha>16)lit++;}
   check(edge<=2,'Exposed edge '+id+'/'+part);check(part!=='socket'||hole<=2,'Portrait cutout '+id);check(lit>25,'Visible physical object '+id+'/'+part);
   const f0=g.art.render(id,part,0).data,f1=g.art.render(id,part,1).data;let period=0;for(let i=0;i<f0.length;i++)period+=Math.abs(f0[i]-f1[i]);period/=f0.length;check(period<.025,'Periodic motion '+id+'/'+part);
   const change=visibleDiff(f0,g.art.render(id,part,7/144).data);const imported=JSON.parse(fs.readFileSync(path.join(root,'assets/themes/equipment35/imported',id,'parts.json'))); const moving=part==='core'||part==='utility'&&imported.parts.utility.aperture||['relay','socket'].includes(part)&&imported.parts[part].lightRegions?.length;check(!moving||change.pixels>0,'Working part moves '+id+'/'+part);
   report.objects.push({id,part,object:a.object,periodDifference:period,movingPixels:change.pixels,opaquePixels:lit,maxEdgeAlpha:edge,faceAlpha:hole});
   rows.push(await sharp(poster).flatten({background:'#101923'}).resize({width:part==='socket'?72:part==='relay'?128:256}).png().toBuffer());
  }
  const caption=Buffer.from('<svg width="360" height="26"><text x="10" y="18" font-family="Arial" font-size="14" fill="#dce8ee">'+id+' · physical equipment</text></svg>');
  const tile=await sharp({create:{width:360,height:260,channels:4,background:'#101923'}}).composite([{input:caption,left:0,top:0},{input:rows[0],left:8,top:29},{input:rows[1],left:8,top:132},{input:rows[2],left:8,top:202},{input:rows[3],left:280,top:42}]).webp({quality:92}).toBuffer();tiles.push(tile);
 }
 await sharp({create:{width:1440,height:1300,channels:4,background:'#101923'}}).composite(tiles.map((input,i)=>({input,left:i%4*360,top:Math.floor(i/4)*260}))).webp({quality:94}).toFile(path.join(__dirname,'local35-equipment-gallery.webp'));
 assert.deepEqual(report.failures,[]);report.success=true;console.log(JSON.stringify({success:true,themes:20,objects:80,exposedEdges:'transparent',portraitHoles:'WebP alpha <=2; runtime face mask exact',sourceHash:g.SOURCE_HASH}));
})().catch(e=>{report.error=e.stack;console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(__dirname,'local35-equipment-assets.json'),JSON.stringify(report,null,2)));
