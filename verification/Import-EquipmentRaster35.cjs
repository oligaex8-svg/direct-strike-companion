'use strict';
// Whole rendered components are grouped by alpha-component centroids, never by
// equal-cell cuts. All RGBA crops remain at their authored source resolution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'assets/themes/equipment35'),out=path.join(base,'imported');
const names=['core','moving','utility','relay','socket','auxiliary'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function relative(file){return path.relative(root,file).replaceAll('\\','/');}
function inside(file){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('Source must remain inside project');return target;}
function components(data,width,height,predicate){
 const labels=new Int32Array(width*height),queue=new Int32Array(width*height),items=[];
 let label=0;
 for(let index=0;index<labels.length;index++){
  if(labels[index]||!predicate(index))continue;
  label++;let read=0,write=1,area=0,sx=0,sy=0,left=width,top=height,right=0,bottom=0,touchesEdge=false;queue[0]=index;labels[index]=label;
  while(read<write){
   const at=queue[read++],x=at%width,y=Math.floor(at/width);area++;sx+=x;sy+=y;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);if(!x||!y||x===width-1||y===height-1)touchesEdge=true;
   for(const next of [x?at-1:-1,x<width-1?at+1:-1,y?at-width:-1,y<height-1?at+width:-1])if(next>=0&&!labels[next]&&predicate(next)){labels[next]=label;queue[write++]=next;}
  }
  items.push({label,area,cx:sx/area,cy:sy/area,bounds:{left,top,width:right-left+1,height:bottom-top+1},touchesEdge});
 }
 return {labels,items};
}
function bucket(cx,cy,width,height){const bottom=cy>=height*.48;return (bottom?3:0)+(cx<width*.39?0:cx>width*(bottom?.70:.62)?2:1);}
function split(data,width,height,{threshold=16,minArea=Math.max(20,Math.floor(width*height*.000015))}={}){
 const found=components(data,width,height,i=>data[i*4+3]>=threshold),groups=names.map(name=>({name,components:[]}));
 for(const c of found.items)if(c.area>=minArea)groups[bucket(c.cx,c.cy,width,height)].components.push(c);
 for(const group of groups){
  if(!group.components.length)throw Error('No substantial alpha component in kit group '+group.name);
  const left=Math.max(0,Math.min(...group.components.map(c=>c.bounds.left))-2),top=Math.max(0,Math.min(...group.components.map(c=>c.bounds.top))-2);
  const right=Math.min(width,Math.max(...group.components.map(c=>c.bounds.left+c.bounds.width))+2),bottom=Math.min(height,Math.max(...group.components.map(c=>c.bounds.top+c.bounds.height))+2);
  group.bounds={left,top,width:right-left,height:bottom-top};
 }
 return {groups,labels:found.labels,threshold,minArea};
}
function crop(data,width,bounds){const result=Buffer.alloc(bounds.width*bounds.height*4);for(let y=0;y<bounds.height;y++)data.copy(result,y*bounds.width*4,((y+bounds.top)*width+bounds.left)*4,((y+bounds.top)*width+bounds.left+bounds.width)*4);return result;}
function apertures(data,width,height){
 const found=components(data,width,height,i=>data[i*4+3]<16),holes=found.items.filter(c=>!c.touchesEdge&&c.area>=Math.max(12,width*height*.00015)).sort((a,b)=>b.area-a.area);
 return {labels:found.labels,holes:holes.map(c=>({...c,center:{x:c.cx,y:c.cy},radii:{x:c.bounds.width/2,y:c.bounds.height/2}}))};
}
function holeMask(data,width,height,found,holes){
 const chosen=new Set(holes.map(c=>c.label)),mask=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x;let selected=chosen.has(found.labels[at]);
  if(!selected&&data[at*4+3]<250){for(let dy=-2;dy<=2&&!selected;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<width&&yy<height&&chosen.has(found.labels[yy*width+xx])){selected=true;break;}}}
  if(selected){mask[at*4]=mask[at*4+1]=mask[at*4+2]=255;mask[at*4+3]=255-data[at*4+3];}
 }
 return mask;
}
function lights(data,width,height){
 const colored=i=>{const at=i*4,r=data[at],g=data[at+1],b=data[at+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);return data[at+3]>24&&hi>85&&(hi-lo)/Math.max(hi,1)>.32;};
 const found=components(data,width,height,colored),regions=found.items.filter(c=>c.area>=Math.max(8,width*height*.00018)&&c.bounds.width/c.bounds.height>.28&&c.bounds.width/c.bounds.height<3.4&&c.bounds.width<width*.6&&c.bounds.height<height*.95).sort((a,b)=>b.area-a.area).slice(0,8);
 const selected=new Set(regions.map(r=>r.label)),mask=Buffer.alloc(data.length);
 for(let i=0;i<width*height;i++)if(selected.has(found.labels[i])){mask[i*4]=mask[i*4+1]=mask[i*4+2]=255;mask[i*4+3]=data[i*4+3];}
 return {regions:regions.map(c=>({bounds:c.bounds,area:c.area,center:{x:c.cx,y:c.cy}})),mask};
}
async function importOne(profile,sourceManifestHash){
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
 const source=inside(profile.source),bytes=fs.readFileSync(source),decoded=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(profile.sha256&&profile.sha256!==hash(bytes))throw Error('Source kit does not match recorded provenance '+profile.id);
 const {width,height}=decoded.info,splitKit=split(decoded.data,width,height),dir=path.join(out,profile.id);fs.mkdirSync(dir,{recursive:true});
 const report={version:1,id:profile.id,valid:true,provenance:'Image-generated physical raster kit based on the recorded native console reference; source pixels preserved, no native animation export',source:profile.source,reference:profile.reference,motion:profile.motion,sourceSha256:hash(bytes),sourceManifestSha256:sourceManifestHash,sourceDimensions:[width,height],threshold:splitKit.threshold,minArea:splitKit.minArea,parts:{},problems:[]};
 const write=async(name,data,w,h)=>{const file=path.join(dir,name+'.png'),body=await sharp(data,{raw:{width:w,height:h,channels:4}}).png({compressionLevel:6}).toBuffer();fs.writeFileSync(file,body);return {file:relative(file),sha256:hash(body)};};
 for(const group of splitKit.groups){
  const b=group.bounds,data=crop(decoded.data,width,b),part={...await write(group.name,data,b.width,b.height),width:b.width,height:b.height,sourceBounds:b,sourceComponents:group.components};
  if(group.name==='core'||group.name==='utility'){
   const found=apertures(data,b.width,b.height);part.apertures=found.holes;part.aperture=found.holes[0]||null;
   if(found.holes.length)part.apertureMask=await write(group.name+'-aperture',holeMask(data,b.width,b.height,found,group.name==='core'?[found.holes[0]]:found.holes),b.width,b.height);
   if(group.name==='core'&&(!part.aperture||part.aperture.area<b.width*b.height*.003)){report.valid=false;report.problems.push('Core has no substantial enclosed natural alpha aperture. Regenerate or explicitly correct the source kit; no cavity was invented.');}
   if(group.name==='utility'&&!found.holes.length)report.problems.push('Utility has no enclosed natural alpha gaps; its real front remains static.');
  }
  if(group.name==='relay'||group.name==='socket'){
   const registered=lights(data,b.width,b.height);part.lightRegions=registered.regions;
   if(registered.regions.length)part.lightMask=await write(group.name+'-lights',registered.mask,b.width,b.height);
  }
  report.parts[group.name]=part;
 }
 fs.writeFileSync(path.join(dir,'parts.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.valid)throw Error(profile.id+': '+report.problems.join(' '));
 console.log(JSON.stringify({success:true,id:profile.id,components:6,aperture:report.parts.core.aperture.bounds}));return report;
}
async function generate(ids){
 const manifestFile=path.join(base,'sources.json'),bytes=fs.readFileSync(manifestFile),manifest=JSON.parse(bytes);
 if(!ids.length||new Set(ids).size!==ids.length)throw Error('Supply distinct kit IDs');
 for(const id of ids){const profile=manifest.profiles.find(p=>p.id===id);if(!profile)throw Error('Missing source kit '+id);await importOne(profile,hash(bytes));}
}
function finalize(){
 const sourceBytes=fs.readFileSync(path.join(base,'sources.json')),sources=JSON.parse(sourceBytes),expected=require('./Build-ThemeVfx.cjs').themes.map(p=>p.id),profiles=[];
 for(const id of expected){const profile=sources.profiles.find(p=>p.id===id);if(!profile)throw Error('Missing source profile '+id);const report=JSON.parse(fs.readFileSync(path.join(out,id,'parts.json'),'utf8'));if(!report.valid||report.sourceSha256!==hash(fs.readFileSync(inside(profile.source))))throw Error('Invalid/stale imported kit '+id);for(const p of Object.values(report.parts))for(const file of [p,p.apertureMask,p.lightMask].filter(Boolean))if(hash(fs.readFileSync(inside(file.file)))!==file.sha256)throw Error('Imported component hash mismatch '+id);profiles.push(report);}
 const manifest={version:1,sourceManifestSha256:hash(sourceBytes),provenance:'High-resolution rendered component crops, actual alpha apertures and registered glass masks',profiles};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({success:true,profiles:profiles.length,components:profiles.length*6}));return manifest;
}
async function main(){const arg=process.argv[2];if(arg==='--finalize')return finalize();if(!arg?.startsWith('--ids='))throw Error('Use --ids=terran,nova,... or --finalize');await generate(arg.slice(6).split(',').filter(Boolean));}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={names,components,bucket,split,crop,apertures,holeMask,lights,importOne,generate,finalize,main};
