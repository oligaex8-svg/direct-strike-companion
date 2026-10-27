'use strict';
// Offline bespoke animation scenes. Only atlas storage/playback is shared.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {themes}=require('./Build-ThemeVfx.cjs'),raster=require('./ThemeEquipmentRaster.cjs');
const FPS=24,DURATION=4,FRAMES=96,POSTER_FRAME=32;
const KINDS=Object.freeze({header:Object.freeze({width:512,height:64,columns:16,rows:6}),inset:Object.freeze({width:256,height:128,columns:32,rows:3})});
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/loops'),digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const SOURCES=['Build-ThemeLoops.cjs','ThemeEquipmentRaster.cjs','Import-EquipmentRaster35.cjs','assets/themes/equipment35/sources.json'];
const generatorHash=()=>digest(Buffer.concat([fs.readFileSync(__filename),Buffer.from(raster.sourceHash())]));
const GENERATOR_HASH=generatorHash(),prepared=new Map(),pending=new Map();
const wrap=(n,p)=>((n%p)+p)%p;
function sourceRecord(id){
 const sources=JSON.parse(fs.readFileSync(path.join(root,'assets/themes/equipment35/sources.json'),'utf8')),profile=sources.profiles.find(p=>p.id===id);
 if(!profile)throw Error('Missing physical raster source '+id);
 const record=JSON.parse(fs.readFileSync(path.join(root,'assets/themes/equipment35/imported',id,'parts.json'),'utf8'));
 if(!record.valid)throw Error('Invalid physical raster import '+id);
 return {profile,record};
}
function profileFor(id,kind){
 if(!themes.some(p=>p.id===id)||!KINDS[kind])throw Error('Unknown raster console inlay '+id+'/'+kind);
 const {profile,record}=sourceRecord(id),part=kind==='header'?'utility':'core',component=record.parts[part];
 return {revision:4,id,kind,generatorSha256:GENERATOR_HASH,renderer:'ThemeEquipmentRaster.cjs',sourceComponent:part,sourceImage:profile.source,sourceImageSha256:record.sourceSha256,sourcePart:component.file,sourcePartSha256:component.sha256,motion:profile.motion,silhouette:'Original rendered '+id+' '+(part==='utility'?'physical intake housing':'physical core housing'),choreography:'Selective '+profile.motion+' interior motion behind the fixed original raster shell',anchor:kind==='header'?'bottom':'right',geometry:KINDS[kind],frames:FRAMES,fps:FPS,duration:DURATION,continuousBody:true,codePaintedFallback:false};
}
async function prepare(id){
 if(prepared.has(id))return prepared.get(id);if(pending.has(id))return pending.get(id);
 const task=(async()=>{
  const source=await raster.prepare(id),contexts={};
  for(const kind of Object.keys(KINDS)){
   const g=KINDS[kind],profile=profileFor(id,kind),seat=raster.render(id,profile.sourceComponent,0,{width:g.width,height:g.height});let maxX=0,maxY=0;
   for(let y=0;y<seat.height;y++)for(let x=0;x<seat.width;x++)if(seat.data[(y*seat.width+x)*4+3]>=64){maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   const contactOffset=kind==='header'?{x:0,y:seat.height-1-maxY}:{x:seat.width-1-maxX,y:0};
   contexts[kind]={id,kind,source,profile,contactOffset,signature:digest(JSON.stringify(profile))};
  }
  prepared.set(id,contexts);return contexts;
 })();pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
function createContext(id,kind='inset'){
 id=typeof id==='string'?id:id.id;
 const ctx=prepared.get(id)?.[kind];if(!ctx)throw Error('Call await prepare('+id+') before createContext('+kind+')');return ctx;
}
function renderFrame(ctx,frame,{width,height}={}){
 const g=KINDS[ctx.kind];if((width&&width!==g.width)||(height&&height!==g.height))throw Error('Raster inlays preserve authored geometry');
 const f=wrap(frame,FRAMES),source=raster.render(ctx.id,ctx.profile.sourceComponent,f/FRAMES,{width:g.width,height:g.height}),image={...source,data:Buffer.alloc(source.data.length)},offset=ctx.contactOffset;
 for(let y=0;y<source.height-offset.y;y++)source.data.copy(image.data,((y+offset.y)*source.width+offset.x)*4,y*source.width*4,(y*source.width+source.width-offset.x)*4);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const exposed=ctx.kind==='header'?Math.min(x,image.width-1-x,y):Math.min(x,y,image.height-1-y),factor=Math.min(1,exposed/2),i=(y*image.width+x)*4;
  image.data[i+3]=Math.round(image.data[i+3]*factor);if(!image.data[i+3])image.data[i]=image.data[i+1]=image.data[i+2]=0;
 }
 return {...image,frame:f,time:f/FPS,signature:ctx.signature};
}
function renderAtlas(ctx){
 const g=KINDS[ctx.kind],width=g.width*g.columns,height=g.height*g.rows,data=Buffer.alloc(width*height*4);let poster;
 for(let frame=0;frame<FRAMES;frame++){
  const image=renderFrame(ctx,frame),col=frame%g.columns,row=Math.floor(frame/g.columns);
  for(let y=0;y<g.height;y++)image.data.copy(data,((row*g.height+y)*width+col*g.width)*4,y*g.width*4,(y+1)*g.width*4);
  if(frame===POSTER_FRAME)poster=image;
 }
 return {data,width,height,channels:4,poster};
}
function catalogEntry(id,kind){const g=KINDS[kind],profile=profileFor(id,kind);return {src:`/themes/loops/${id}-${kind}.webp`,poster:`/themes/loops/${id}-${kind}-poster.webp`,...g,fps:FPS,duration:DURATION,frames:FRAMES,atlasWidth:g.width*g.columns,atlasHeight:g.height*g.rows,anchor:profile.anchor,silhouette:profile.silhouette,choreography:profile.choreography};}
async function generate(ids){
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!themes.some(p=>p.id===id)))throw Error('Supply distinct supported theme IDs');
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);fs.mkdirSync(out,{recursive:true});
 for(const id of ids){await prepare(id);const assets=[];
  for(const kind of Object.keys(KINDS)){
   const ctx=createContext(id,kind),atlas=renderAtlas(ctx),entry=catalogEntry(id,kind);
   const encode=raw=>sharp(raw.data,{raw:{width:raw.width,height:raw.height,channels:4}}).webp({quality:93,alphaQuality:100,effort:2}).toBuffer();
   const body=await encode(atlas),poster=await encode(atlas.poster),file=`${id}-${kind}.webp`,posterFile=`${id}-${kind}-poster.webp`;
   fs.writeFileSync(path.join(out,file),body);fs.writeFileSync(path.join(out,posterFile),poster);
   assets.push({id,kind,...entry,file,posterFile,sha256:digest(body),posterSha256:digest(poster),rgbaSha256:digest(atlas.data),posterFrame:POSTER_FRAME,composition:ctx.profile,contactOffset:ctx.contactOffset,compositionSignature:ctx.signature});
  }
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({revision:4,id,assets},null,2)+'\n');console.log(JSON.stringify({success:true,phase:'physical-raster-inlay-complete',id,atlases:2}));
 }
}
function finalize(){
 const catalog={},assets=[];if(generatorHash()!==GENERATOR_HASH)throw Error('Raster source set changed; regenerate with a stable completed import');
 for(const theme of themes){
  const record=JSON.parse(fs.readFileSync(path.join(out,theme.id+'.json'),'utf8'));catalog[theme.id]={};if(record.id!==theme.id||record.revision!==4||record.assets.length!==2)throw Error('Stale scene metadata: '+theme.id);
  for(const kind of Object.keys(KINDS)){
   const asset=record.assets.find(a=>a.kind===kind),entry=catalogEntry(theme.id,kind);if(!asset)throw Error('Missing scene: '+theme.id+'/'+kind);
   for(const key of ['width','height','columns','rows','frames','fps','duration','atlasWidth','atlasHeight','anchor','silhouette','choreography'])if(asset[key]!==entry[key])throw Error('Stale scene contract: '+theme.id+'/'+key);
   if(asset.compositionSignature!==digest(JSON.stringify(profileFor(theme.id,kind))))throw Error('Stale raster inlay source: '+theme.id);
   const g=KINDS[kind],offset=asset.contactOffset;if(!offset||!Number.isInteger(offset.x)||!Number.isInteger(offset.y)||offset.x<0||offset.y<0||offset.x>=g.width||offset.y>=g.height)throw Error('Invalid raster contact metadata: '+theme.id);
   if(digest(fs.readFileSync(path.join(out,asset.file)))!==asset.sha256||digest(fs.readFileSync(path.join(out,asset.posterFile)))!==asset.posterSha256)throw Error('Scene hash mismatch: '+theme.id);
   catalog[theme.id][kind]=entry;assets.push(asset);
  }
 }
 const manifest={revision:4,generatorSha256:GENERATOR_HASH,sourceFiles:SOURCES,provenance:'High-resolution rendered raster equipment kits based on native console references; no visible code-painted fallback or native animation export',runtime:'Cached WebP atlas with one atomic compositor clock',time:{duration:DURATION,fps:FPS,frames:FRAMES,posterFrame:POSTER_FRAME,duplicateEndpoint:false},encoding:{format:'webp',quality:93,alphaQuality:100,effort:2,concurrency:1},assets};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(root,'wwwroot/theme-loop-catalog.js'),'/* Generated from twenty high-resolution physical raster kits. */\nwindow.DSThemeLoopCatalog=Object.freeze('+JSON.stringify(catalog,null,1)+');\n');
 console.log(JSON.stringify({success:true,phase:'finalized',themes:themes.length,atlases:assets.length}));return {catalog,manifest};
}
async function main(args=process.argv.slice(2)){
 if(args.length===1&&args[0]==='--finalize'){finalize();return;}const idsArg=args.find(arg=>arg.startsWith('--ids='));if(args.length!==1||!idsArg)throw Error('Usage: --ids=fenix,protoss,... OR --finalize');await generate(idsArg.slice(6).split(',').filter(Boolean));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={themes,FPS,DURATION,FRAMES,POSTER_FRAME,KINDS,GENERATOR_HASH,profileFor,prepare,createContext,renderFrame,renderAtlas,catalogEntry,generate,finalize,main};
