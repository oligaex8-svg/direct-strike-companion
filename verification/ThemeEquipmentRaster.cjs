'use strict';
// Actual imported bitmap parts carry all visible sculpture. Motion is confined
// to natural alpha apertures and registered glass pixels, with no CG fallback.
process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createCanvas,loadImage}=require(require.resolve('@napi-rs/canvas',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),base=path.join(root,'assets/themes/equipment35'),cache=new Map(),pending=new Map(),TAU=Math.PI*2;
const PARTS={core:{width:128,height:48,columns:16,rows:9},utility:{width:128,height:32,columns:16,rows:9},relay:{width:64,height:24,columns:16,rows:9},socket:{width:48,height:48,columns:12,rows:12}};
const ids=require('./Build-ThemeVfx.cjs').themes.map(p=>p.id),profiles=Object.fromEntries(ids.map(id=>[id,{objects:['raster physical core and interior mechanism','raster intake and grille','registered physical lamp relay','raster portrait corner fittings']} ]));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const readSources=()=>JSON.parse(fs.readFileSync(path.join(base,'sources.json'),'utf8'));
function resolve(file){const result=path.resolve(root,file);if(!result.startsWith(root+path.sep))throw Error('Component path outside project');return result;}
async function prepare(id){
 if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
 if(!profiles[id])throw Error('Unknown raster equipment theme '+id);
 const task=(async()=>{
  const profile=readSources().profiles.find(p=>p.id===id);if(!profile)throw Error('Missing image-generated raster kit '+id);
  const record=JSON.parse(fs.readFileSync(path.join(base,'imported',id,'parts.json'),'utf8'));
  if(!record.valid||record.sourceSha256!==hash(fs.readFileSync(resolve(profile.source))))throw Error('Missing/stale valid raster import '+id);
  if(!record.parts.core.aperture||!record.parts.core.apertureMask)throw Error('No natural core aperture '+id);
  const parts={};
  for(const [name,meta] of Object.entries(record.parts)){
   const bytes=fs.readFileSync(resolve(meta.file));if(hash(bytes)!==meta.sha256)throw Error('Changed imported raster '+id+'/'+name);
   const part={meta,image:await loadImage(bytes)};
   for(const key of ['apertureMask','lightMask'])if(meta[key]){const data=fs.readFileSync(resolve(meta[key].file));if(hash(data)!==meta[key].sha256)throw Error('Changed registered mask '+id+'/'+key);part[key]=await loadImage(data);}
   parts[name]=part;
  }
  const ctx={id,profile,record,parts};cache.set(id,ctx);return ctx;
 })();pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
function fitted(image,width,height,padding=2){const scale=Math.min((width-padding*2)/image.width,(height-padding*2)/image.height);return {x:(width-image.width*scale)/2,y:(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale,scale};}
function boxImage(c,image,b){c.drawImage(image,b.x,b.y,b.width,b.height);}
function apertureBounds(part,all=false){
 const holes=all?part.meta.apertures:[part.meta.aperture];if(!holes?.length)return null;
 const x=Math.min(...holes.map(h=>h.bounds.left)),y=Math.min(...holes.map(h=>h.bounds.top)),right=Math.max(...holes.map(h=>h.bounds.left+h.bounds.width)),bottom=Math.max(...holes.map(h=>h.bounds.top+h.bounds.height));return {x,y,width:right-x,height:bottom-y};
}
function interior(ctx,part,b,width,height,phase,utility=false){
 if(!part.apertureMask)return null;
 const hole=apertureBounds(part,utility);if(!hole)return null;
 const canvas=createCanvas(width,height),c=canvas.getContext('2d'),moving=ctx.parts.moving.image;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 const cx=b.x+(hole.x+hole.width/2)*b.scale,cy=b.y+(hole.y+hole.height/2)*b.scale,hw=hole.width*b.scale,hh=hole.height*b.scale,t=phase*TAU;
 const scale=(utility?Math.max(hw/moving.width,hh/moving.height):Math.min(hw/moving.width,hh/moving.height))*.98,mw=moving.width*scale,mh=moving.height*scale;
 const motion=ctx.profile.motion;
 c.save();c.translate(cx,cy);
 if(motion==='fan'||motion==='optic'){
  c.rotate(t*(motion==='fan'?4:1));c.drawImage(moving,-mw/2,-mh/2,mw,mh);
 }else if(motion==='servo'){
  c.translate(Math.sin(t)*hw*.14,0);c.drawImage(moving,-mw/2,-mh/2,mw,mh);
 }else if(motion==='membrane'){
  const strips=12;
  for(let i=0;i<strips;i++){const sx=moving.width*i/strips,sw=moving.width/strips+.5,dy=Math.sin(t+i*.62)*hh*.045,stretch=1+.025*Math.cos(t+i*.47);c.drawImage(moving,sx,0,sw,moving.height,-mw/2+mw*i/strips,-mh/2*stretch+dy,mw/strips+scale*.5,mh*stretch);}
 }else{
  c.translate(Math.sin(t)*hw*.025,Math.cos(t)*hh*.035);c.scale(1+.025*Math.sin(t),1+.03*Math.cos(t));c.drawImage(moving,-mw/2,-mh/2,mw,mh);
  // Refraction reuses source pixels; it does not replace the object with vectors.
  if(['crystal','plasma','hologram','pixel'].includes(motion)){
   c.save();c.globalCompositeOperation='screen';c.globalAlpha=.1+.05*Math.sin(t);c.translate(Math.cos(t)*hw*.045,-Math.sin(t)*hh*.055);c.drawImage(moving,-mw/2,-mh/2,mw,mh);c.restore();
  }
 }
 c.restore();c.globalCompositeOperation='destination-in';boxImage(c,part.apertureMask,b);return canvas;
}
function lightLayers(part){
 if(part.lightLayers)return part.lightLayers;
 if(!part.lightMask||!part.meta.lightRegions?.length)return [];
 part.lightLayers=part.meta.lightRegions.map(region=>{
  const {left,top,width,height}=region.bounds,canvas=createCanvas(part.image.width,part.image.height),c=canvas.getContext('2d');
  c.save();c.beginPath();c.rect(left,top,width,height);c.clip();c.drawImage(part.lightMask,0,0);c.restore();
  const black=createCanvas(part.image.width,part.image.height),bc=black.getContext('2d');bc.drawImage(canvas,0,0);bc.globalCompositeOperation='source-in';bc.fillStyle='#000';bc.fillRect(0,0,black.width,black.height);
  const color=createCanvas(part.image.width,part.image.height),cc=color.getContext('2d');cc.drawImage(part.image,0,0);cc.globalCompositeOperation='destination-in';cc.drawImage(canvas,0,0);return {black,color};
 });return part.lightLayers;
}
function illuminate(c,part,b,phase,subtle=false){
 for(const [i,mask] of lightLayers(part).entries()){
  const wave=.5+.5*Math.sin(phase*TAU*2-i*1.31),level=wave*wave*(3-2*wave);
  c.save();c.globalAlpha=(subtle?.1:.45)*(1-level);boxImage(c,mask.black,b);c.globalCompositeOperation='screen';c.globalAlpha=(subtle?.035:.12)*level;boxImage(c,mask.color,b);c.restore();
 }
}
function render(id,partName,phase,{width=PARTS[partName]?.width,height=PARTS[partName]?.height}={}){
 const ctx=cache.get(id);if(!ctx)throw Error('Call await prepare('+id+') before synchronous render');
 if(!PARTS[partName]||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||!Number.isFinite(phase))throw Error('Invalid raster output geometry/phase');
 phase=((phase%1)+1)%1;const canvas=createCanvas(width,height),c=canvas.getContext('2d'),part=ctx.parts[partName],b=fitted(part.image,width,height);
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 if(partName==='core'||partName==='utility'){
  const animated=interior(ctx,part,b,width,height,phase,partName==='utility');if(animated)c.drawImage(animated,0,0);
  boxImage(c,part.image,b); // The original fixed physical front shell always wins.
 }else{boxImage(c,part.image,b);illuminate(c,part,b,phase,partName==='socket');}
 const pixels=c.getImageData(0,0,width,height);return {data:Buffer.from(pixels.data),width,height,channels:4};
}
function sourceHash(){
 const h=crypto.createHash('sha256');
 for(const file of ['Build-ThemeEquipment.cjs','ThemeEquipmentRaster.cjs','Import-EquipmentRaster35.cjs'])h.update(file).update(fs.readFileSync(path.join(__dirname,file)));
 const file=path.join(base,'sources.json'),sourceBytes=fs.readFileSync(file);h.update(sourceBytes);
 const sources=JSON.parse(sourceBytes);
 for(const p of sources.profiles.slice().sort((a,b)=>a.id.localeCompare(b.id))){
  h.update(p.id).update(fs.readFileSync(resolve(p.source)));
  const meta=path.join(base,'imported',p.id,'parts.json');
  if(!fs.existsSync(meta)){h.update('NOT_IMPORTED');continue;}
  const bytes=fs.readFileSync(meta),record=JSON.parse(bytes);h.update(bytes);
  for(const name of Object.keys(record.parts).sort())for(const part of [record.parts[name],record.parts[name].apertureMask,record.parts[name].lightMask].filter(Boolean))h.update(part.file).update(fs.readFileSync(resolve(part.file)));
 }
 return h.digest('hex');
}
module.exports={PARTS,profiles,prepare,render,draw:render,sourceHash,fitted,apertureBounds};
