'use strict';
// Offline source-material animation. Source artwork is never overwritten.
// Run through the resource-guarded asset stage; one sequential sharp worker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/material38');
const wells=JSON.parse(fs.readFileSync(path.join(root,'wwwroot/themes/motion37/well-catalog.json'),'utf8'));
const TAU=Math.PI*2,FRAMES=160,COLUMNS=16,ROWS=10;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
// Regions name visible source anatomy. Coordinates are original atlas pixels,
// not arbitrary screen positions. Feathered interiors leave the housings fixed.
const region=(name,mode,x,y,rx,ry,extra={})=>({name,mode,x,y,rx,ry,...extra});
const wellRegions={
 mecha:[region('recessed-bearing','bearing',78,94,23,23,{amount:.6}),region('amber-status-glass','lamp',182,107,9,4),region('lower-amber-status-glass','lamp',1418,898,9,4,{phase:1.4})],
 machined:[region('diagonal-vent-shutters','shutter',154,58,49,17,{amount:5}),region('furnace-aperture','heat',184,96,31,5),region('lower-heat-exchanger','heat',1455,919,43,8,{phase:2})],
 mira:[region('salvage-bearing','bearing',52,102,16,16,{amount:.42}),region('armoured-hose-bellows','bellows',1434,66,34,12,{amount:3})],
 zerg:[region('upper-glossy-lobe','membrane',170,95,24,20,{amount:4}),region('side-glossy-lobe','membrane',104,134,19,29,{amount:3,phase:1.2}),region('lower-glossy-lobe','membrane',1402,889,35,17,{amount:4,phase:2.4})],
 abathur:[region('native-green-gland','membrane',33,36,8,7,{amount:2}),region('native-green-gland-lower','membrane',43,70,8,12,{amount:2,phase:.6}),region('native-violet-membrane','membrane',35,124,12,41,{amount:3,phase:1.3})],
 dehaka:[region('wet-shoulder-seam','membrane',143,76,50,8,{amount:3}),region('primal-side-pore','membrane',21,130,8,14,{amount:2,phase:1.5}),region('lower-bone-seam','membrane',1455,926,45,9,{amount:3,phase:2.2})],
 cerberus:[region('contained-tissue','membrane',143,59,47,19,{amount:4}),region('hybrid-gland','membrane',115,71,11,9,{amount:2,phase:.8}),region('lower-contained-gland','membrane',1540,940,15,11,{amount:3,phase:2.5})],
 'classic-zerg':[region('ribbed-upper-muscle','peristalsis',201,48,65,13,{amount:4}),region('ribbed-side-muscle','peristalsis',45,242,13,40,{amount:4,phase:1.5}),region('lower-muscle','peristalsis',1402,950,64,13,{amount:4,phase:2.4})]
};
for(const id of ['protoss','nerazim','alarak','ihanrii','classic-protoss'])wellRegions[id]=[
 region('native-left-crystal-bank','refraction',91,31,44,7,{amount:2,phase:id==='nerazim'?1.2:0}),
 region('native-right-crystal-bank','refraction',896,31,44,7,{amount:2,phase:2.4})];
for(const id of ['terran','nova','tyrador','arcade','classic-terran'])wellRegions[id]=[
 region('native-left-indicator-inlay','lamp',76,11,13,5),
 region('native-right-indicator-inlay','lamp',903,11,13,5,{phase:2.2})];
const shellRegions={
 protoss:[region('native-left-energy-crystal','refraction',77,66,38,5,{amount:1}),region('native-right-energy-crystal','refraction',459,66,38,5,{amount:1,phase:1.8})],
 nerazim:[region('native-void-gem','refraction',126,63,10,10,{amount:1.2}),region('native-sculpted-eyes','lamp',39,80,16,4),region('native-right-void-gem','refraction',471,63,10,10,{amount:1.2,phase:2})],
 alarak:[region('native-left-sealed-facet','refraction',105,50,28,7,{amount:.7}),region('native-right-sealed-facet','refraction',431,50,28,7,{amount:.7,phase:2})],
 ihanrii:[region('native-left-recessed-cell','lamp',10,60,9,7),region('native-right-recessed-cell','lamp',528,60,9,7,{phase:1.7})],
 terran:[region('native-left-console-optics','refraction',77,68,45,4,{amount:.5}),region('native-right-console-optics','refraction',458,68,45,4,{amount:.5,phase:2.5})],
 nova:[region('native-blue-optical-bank','refraction',58,59,24,4,{amount:.6}),region('native-right-blue-optical-bank','refraction',491,59,24,4,{amount:.6,phase:1.9})],
 mira:[region('native-left-hose','bellows',65,72,36,23,{amount:2}),region('native-right-hose','bellows',473,72,36,23,{amount:2,phase:1.7})],
 machined:[region('native-left-vent','shutter',10,87,7,28,{amount:1.5}),region('native-right-vent','shutter',528,87,7,28,{amount:1.5,phase:1.8})],
 tyrador:[region('native-violet-ceramic-cell','refraction',59,63,36,6,{amount:.8}),region('native-right-violet-ceramic-cell','refraction',478,63,36,6,{amount:.8,phase:2.1})],
 zerg:[region('native-left-tissue-root','membrane',11,84,7,22,{amount:1.5}),region('native-right-tissue-root','membrane',527,84,7,22,{amount:1.5,phase:2})],
 abathur:[region('native-left-green-gland','membrane',57,55,9,6,{amount:1.2}),region('native-right-green-gland','membrane',482,55,9,6,{amount:1.2,phase:2})],
 dehaka:[region('native-left-wet-root','membrane',10,83,6,20,{amount:1.2}),region('native-right-wet-root','membrane',528,83,6,20,{amount:1.2,phase:2.6})],
 cerberus:[region('native-left-muscle-coupling','peristalsis',23,61,22,11,{amount:1.8}),region('native-right-muscle-coupling','peristalsis',515,61,22,11,{amount:1.8,phase:1.7})],
 mecha:[region('native-left-flexible-coupling','bellows',44,61,34,10,{amount:1.5}),region('native-right-flexible-coupling','bellows',494,61,34,10,{amount:1.5,phase:2.1})],
 arcade:[region('native-left-purple-button','lamp',3,66,3,6),region('native-right-purple-button','lamp',535,66,3,6,{phase:2.4})],
 'classic-terran':[region('native-left-green-status-lamp','lamp',134,64,6,4),region('native-right-green-status-lamp','lamp',405,64,6,4,{phase:2.3})],
 'classic-protoss':[region('native-left-gold-crystal-face','refraction',105,49,29,7,{amount:.7}),region('native-right-gold-crystal-face','refraction',433,49,29,7,{amount:.7,phase:2.2})],
 'classic-zerg':[region('native-left-ribbed-sinew','peristalsis',92,53,60,16,{amount:2}),region('native-right-ribbed-sinew','peristalsis',362,53,60,16,{amount:2,phase:2.3})]
};
const durations={mecha:4800,machined:6400,mira:7200,zerg:6400,abathur:8000,dehaka:9600,cerberus:7200,'classic-zerg':8000,protoss:6400,nerazim:8000,alarak:5600,ihanrii:8000,terran:6400,nova:7200,tyrador:8000,arcade:4800,'classic-terran':8000,'classic-protoss':8000};
function sample(data,w,h,x,y,c){x=clamp(x,0,w-1);y=clamp(y,0,h-1);const a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b,x1=Math.min(a+1,w-1),y1=Math.min(b+1,h-1);return (data[(b*w+a)*4+c]*(1-fx)+data[(b*w+x1)*4+c]*fx)*(1-fy)+(data[(y1*w+a)*4+c]*(1-fx)+data[(y1*w+x1)*4+c]*fx)*fy;}
function anatomy(r,x,y,t){
 const u=(x-r.x)/r.rx,v=(y-r.y)/r.ry,d=u*u+v*v;
 if(d>=1)return null;
 const mask=smooth((1-d)/.3),core=(1-d)*(1-d),p=TAU*t+(r.phase||0),a=r.amount||1;
 let sx=x,sy=y,gain=1;
 if(r.mode==='bearing'){
  const angle=Math.sin(p)*a*core,c=Math.cos(angle),s=Math.sin(angle),dx=x-r.x,dy=y-r.y;
  sx=r.x+dx*c-dy*s;sy=r.y+dx*s+dy*c;
 }else if(r.mode==='membrane'){
  const pressure=Math.sin(p-.6)*.7+Math.sin(2*p+v)*.3;
  sx-=u*a*pressure*core;sy-=v*a*pressure*core;
  gain=1+.22*Math.sin(p+u*1.7-v)*core;
 }else if(r.mode==='peristalsis'){
  const longitudinal=r.rx>r.ry?u:v,pressure=Math.sin(p-longitudinal*3);
  if(r.rx>r.ry)sy-=a*pressure*core;else sx-=a*pressure*core;
  gain=1+.15*Math.cos(p-longitudinal*3)*core;
 }else if(r.mode==='bellows'){
  sx-=a*Math.sin(p)*core;sy-=a*.3*Math.sin(p+u)*core;
 }else if(r.mode==='shutter'){
  // Slow closed/open dwell. The original metal texture articulates in its recess.
  sy-=a*(.5-.5*Math.cos(p))*core;gain=1+.18*Math.sin(p)*core;
 }else if(r.mode==='refraction'){
  sx+=a*Math.sin(p+v*2)*core;sy+=a*.5*Math.cos(p+u*2)*core;
  gain=.78+.34*Math.sin(p+u*2.5-v)+.12*Math.sin(2*p-u*4);
 }else if(r.mode==='heat'){
  sy+=a*.6*Math.sin(p+u*4)*core;gain=.88+.4*Math.sin(p+u*2)+.14*Math.sin(2*p-v*3);
 }else if(r.mode==='lamp'){
  // Broad internal changes through native glass. Never off or strobing.
  gain=.86+.36*Math.sin(p+u*1.8)+.12*Math.sin(2*p-v*2);
 }
 return {sx,sy,gain:clamp(gain,.45,1.6),mask};
}
function render(data,w,h,crop,regions,tw,th,t){
 const result=Buffer.alloc(tw*th*4);
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
  const sx=crop[0]+(x+.5)*crop[2]/tw-.5,sy=crop[1]+(y+.5)*crop[3]/th-.5;
  let hit=null;for(const r of regions){const next=anatomy(r,sx,sy,t);if(next&&(!hit||next.mask>hit.mask))hit=next;}
  if(!hit)continue;
  const i=(y*tw+x)*4,alpha=sample(data,w,h,sx,sy,3);
  // Coverage is from the stationary original, never displaced into transparent space.
  result[i+3]=Math.round(alpha*hit.mask);
  if(!result[i+3])continue;
  for(let c=0;c<3;c++)result[i+c]=Math.round(clamp(sample(data,w,h,hit.sx,hit.sy,c)*hit.gain,0,255));
 }
 return result;
}
function corners(regions,w,h,slice){
 const groups=new Map();
 for(const r of regions){
  const horizontal=r.x<w/2?'left':'right',vertical=r.y<h/2?'top':'bottom',key=vertical+'-'+horizontal;
  const bounds=[Math.max(0,Math.floor(r.x-r.rx-3)),Math.max(0,Math.floor(r.y-r.ry-3)),Math.min(w,Math.ceil(r.x+r.rx+3)),Math.min(h,Math.ceil(r.y+r.ry+3))];
  assert(horizontal==='left'?bounds[2]<=slice[3]:bounds[0]>=w-slice[1],r.name+' crosses horizontal nine-slice seam');
  assert(vertical==='top'?bounds[3]<=slice[0]:bounds[1]>=h-slice[2],r.name+' crosses vertical nine-slice seam');
  if(!groups.has(key))groups.set(key,{key,regions:[],bounds});const group=groups.get(key);group.regions.push(r);group.bounds=[Math.min(group.bounds[0],bounds[0]),Math.min(group.bounds[1],bounds[1]),Math.max(group.bounds[2],bounds[2]),Math.max(group.bounds[3],bounds[3])];
 }
 return [...groups.values()];
}
async function build(){
 sharp.concurrency(1);sharp.cache({memory:24,files:0});fs.mkdirSync(out,{recursive:true});
 const tokens=fs.readFileSync(path.join(root,'wwwroot/native-skin-frame-tokens.css'),'utf8');
 const catalog={version:38,frames:FRAMES,columns:COLUMNS,rows:ROWS,themes:{},provenance:'Companion-authored material deformation of existing source artwork, not native game animation exports.'};
 for(const well of wells){
  const id=well.id,entry={id,duration:durations[id],sources:[],patches:[]};
  for(const kind of ['well','shell']){
   const url=kind==='well'?well.url:`/themes/${id}-console-shell-frame.png`,file=path.join(root,'wwwroot',url),bytes=fs.readFileSync(file),decoded=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width:w,height:h}=decoded.info;
   const line=tokens.split('\n').find(line=>line.startsWith(`:root[data-graphical-style=${id}]`));
   const slice=kind==='well'?well.slice:line.match(/--skin-shell-slice:([\d ]+)/)[1].trim().split(/\s+/).map(Number);
   entry.sources.push({kind,url,hash:hash(bytes),dimensions:[w,h],slice,provenance:kind==='well'?well.sourceKind:'original-sc2-own-console-frame'});
   for(const group of corners(kind==='well'?wellRegions[id]:shellRegions[id],w,h,slice)){
    const [x,y,x2,y2]=group.bounds,crop=[x,y,x2-x,y2-y],scale=Math.min(1,144/Math.max(crop[2],crop[3])),tw=Math.max(1,Math.round(crop[2]*scale)),th=Math.max(1,Math.round(crop[3]*scale));
    const atlas=Buffer.alloc(tw*COLUMNS*th*ROWS*4),first=render(decoded.data,w,h,crop,group.regions,tw,th,0),last=render(decoded.data,w,h,crop,group.regions,tw,th,1);
    assert(first.equals(last),'nonperiodic '+id+' '+kind+' '+group.key);
    let changed=0,maxStep=0,previous=first;
    for(let frame=0;frame<FRAMES;frame++){
     const pixels=frame?render(decoded.data,w,h,crop,group.regions,tw,th,frame/FRAMES):first;
     for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){for(let c=0;c<3;c++){if(pixels[i+c]!==first[i+c])changed++;maxStep=Math.max(maxStep,Math.abs(pixels[i+c]-previous[i+c]));}}
     for(let row=0;row<th;row++)pixels.copy(atlas,(((Math.floor(frame/COLUMNS)*th+row)*tw*COLUMNS)+(frame%COLUMNS)*tw)*4,row*tw*4,(row+1)*tw*4);
     previous=pixels;
    }
    assert(changed>0,'No source-material motion '+id+' '+kind+' '+group.key);
    const name=`${id}-${kind}-${group.key}`,dest=path.join(out,name+'.png');
    await sharp(atlas,{raw:{width:tw*COLUMNS,height:th*ROWS,channels:4}}).png({compressionLevel:7}).toFile(dest);
    const poster=name+'-poster.png';await sharp(first,{raw:{width:tw,height:th,channels:4}}).png().toFile(path.join(out,poster));
    entry.patches.push({kind,corner:group.key,url:'/themes/material38/'+name+'.png',hash:hash(fs.readFileSync(dest)),poster:'/themes/material38/'+poster,crop,tile:[tw,th],features:group.regions.map(r=>({name:r.name,mode:r.mode,center:[r.x,r.y],radius:[r.rx,r.ry]})),verification:{exactLoop:true,changedComponents:changed,maxAdjacentComponentStep:maxStep,stationaryCoverage:true}});
   }
  }
  catalog.themes[id]=entry;console.log(JSON.stringify({theme:id,patches:entry.patches.length}));
 }
 fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
 console.log(JSON.stringify({themes:Object.keys(catalog.themes).length,patches:Object.values(catalog.themes).reduce((n,e)=>n+e.patches.length,0),catalog:'wwwroot/themes/material38/catalog.json'}));
}
if(require.main===module)build().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={anatomy,render,corners,wellRegions,shellRegions,build};
