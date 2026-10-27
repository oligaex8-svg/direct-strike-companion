'use strict';
// Whole original SC2 corners; only the native quiet rail profiles are registered
// between their actual corner endpoints. Run generation under the parent guard.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
const catalog=require('../wwwroot/native-console-catalog.json');
const SIZE=1024,SLICE=320;
const raceIds={protoss:'protoss',nerazim:'protoss',alarak:'protoss',ihanrii:'protoss',fenix:'protoss',terran:'terran',nova:'terran',mira:'terran',machined:'terran',tyrador:'terran',arcade:'terran',zerg:'zerg',abathur:'zerg',dehaka:'zerg',cerberus:'zerg',mecha:'zerg','classic-protoss':'protoss','classic-terran':'terran','classic-zerg':'zerg'};
const originals=new Set(['protoss','terran','zerg','classic-protoss','classic-terran','classic-zerg']);
const geometry={protoss:{maxWidth:484,lipX:180,wallY:160},terran:{maxWidth:492,lipX:185,wallY:160},zerg:{maxWidth:500,wallY:160,quietWallRow:256}};
const sourceName=(role,race)=>'ui_frame_big_'+role+'_'+race+'.png';
function profile(image,axis,along,offset=0){
 const count=axis==='horizontal'?image.info.height:image.info.width,result=new Uint8Array(SIZE*4);
 for(let cross=0;cross<count;cross++){
  const x=axis==='horizontal'?along:cross,y=axis==='horizontal'?cross:along;
  if(cross+offset<0||cross+offset>=SIZE)continue;
  for(let c=0;c<4;c++)result[(cross+offset)*4+c]=image.data[(y*image.info.width+x)*4+c];
 }
 return result;
}
function materialEndpoint(corner,axis,preferred,direction,limit,label){
 const extent=axis==='horizontal'?corner.info.width:corner.info.height,offset=axis==='horizontal'?corner.top:corner.left;
 // Console exports can contain colourful RGB tails whose alpha is effectively
 // zero. Search a bounded distance inward for a real material cross-section;
 // never lower the alpha threshold or substitute an empty endpoint.
 for(let distance=0;distance<=limit;distance++){
  const along=preferred+direction*distance;if(along<0||along>=extent)continue;
  const row=profile(corner,axis,along,offset);let count=0;
  // A lower corner can also contain a separate inner lip at this row.
  // Register the outer wall corridor, not that disconnected decoration.
  if(axis==='vertical'&&corner.wallProfileWidth)for(let cross=0;cross<SIZE;cross++){
   const outside=corner.left===0?cross>=corner.wallProfileWidth:cross<SIZE-corner.wallProfileWidth;
   if(outside)row.fill(0,cross*4,cross*4+4);
  }
  for(let cross=0;cross<SIZE;cross++)if(row[cross*4+3]>=64)count++;
  if(count>=6)return {along,row,preferred,distance,materialPixels:count};
 }
 throw Error('No substantial native material endpoint within '+limit+' pixels: '+label);
}
function bounds(row,label){
 let low=0,high=SIZE-1;while(low<SIZE&&row[low*4+3]<64)low++;while(high>=low&&row[high*4+3]<64)high--;
 if(high<low)throw Error('Empty native material profile: '+label);
 return [Math.max(0,low-2),Math.min(SIZE-1,high+2)];
}
function sample(row,range,t,channel){
 const position=range[0]+t*(range[1]-range[0]),a=Math.floor(position),b=Math.min(SIZE-1,a+1),mix=position-a;
 return row[a*4+channel]*(1-mix)+row[b*4+channel]*mix;
}
function paintRail(canvas,axis,from,to,first,last,quiet,label){
 if(to<=from)throw Error('Invalid native rail endpoints: '+label);
 const a=bounds(first,label+' first'),b=bounds(last,label+' last'),q=bounds(quiet[Math.floor(quiet.length/2)],label+' quiet');
 // The quiet section keeps its own material thickness, aligned between the
 // real corner profiles. Transparent source padding is not a positioning cue.
 const center=(a[0]+a[1]+b[0]+b[1])/4,width=q[1]-q[0],middle=[center-width/2,center+width/2];
 const mix=(x,y,t)=>x+(y-x)*t;
 for(let along=from;along<=to;along++){
  const progress=(along-from)/(to-from),ramp=progress<.25?progress*4:progress>.75?(1-progress)*4:1;
  const endpoint=progress<.5?a:b,span=[mix(endpoint[0],middle[0],ramp),mix(endpoint[1],middle[1],ramp)];
  const native=quiet[(along-from)%quiet.length],near=progress<.5?first:last,nearBounds=progress<.5?a:b;
  // A short colour/alpha handoff starts at the exact authored endpoint pixel
  // profile, avoiding a hard texture phase cut even when edges stay connected.
  const nativeWeight=Math.min(1,Math.min(along-from,to-along)/24);
  for(let cross=Math.max(0,Math.floor(span[0]));cross<=Math.min(SIZE-1,Math.ceil(span[1]));cross++){
   const t=Math.max(0,Math.min(1,(cross-span[0])/Math.max(1,span[1]-span[0]))),x=axis==='horizontal'?along:cross,y=axis==='horizontal'?cross:along;
   const index=(y*SIZE+x)*4;
   for(let c=0;c<4;c++)canvas[index+c]=Math.round(mix(sample(near,nearBounds,t,c),sample(native,q,t,c),nativeWeight));
  }
 }
 return {label,axis,from,to,firstMaterialBounds:a,lastMaterialBounds:b,quietSourceBounds:q,registeredQuietBounds:middle};
}
async function raceFrame(race){
 const cfg=geometry[race],scale=SLICE/cfg.maxWidth,used=[],corners={},placements=[],railReport=[];
 const scaled=n=>Math.max(1,Math.round(n*scale));
 async function input(role){const file=sourceName(role,race),data=fs.readFileSync(path.join(source,file));used.push(file);return {data,width:data.readUInt32BE(16),height:data.readUInt32BE(20)};}
 async function raster(image,rect){
  const [left,top,width,height]=rect;
  return sharp(image.data).extract({left,top,width,height}).resize(scaled(width),scaled(height),{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 }
 for(const role of ['topleft','topright','bottomleft','bottomright']){
  const original=await input('corner_'+role),image=await raster(original,[0,0,original.width,original.height]);
  const left=role.endsWith('right')?SIZE-image.info.width:0,top=role.startsWith('bottom')?SIZE-image.info.height:0;
  if(image.info.width>SLICE||image.info.height>SLICE)throw Error('Whole corner exceeds atlas band: '+race+'/'+role);
  corners[role]={...image,left,top,original,wallProfileWidth:scaled(128)};placements.push({role,source:[original.width,original.height],atlas:[left,top,image.info.width,image.info.height]});
 }
 const layer=Buffer.alloc(SIZE*SIZE*4),tl=corners.topleft,tr=corners.topright,bl=corners.bottomleft,br=corners.bottomright;

 async function quietProfiles(image,rect,axis,offset){
  const rasterized=await raster(image,rect),count=axis==='horizontal'?rasterized.info.width:rasterized.info.height;
  return Array.from({length:count},(_,along)=>profile(rasterized,axis,along,offset));
 }
 // Each upper endpoint is inside the original quiet rail, before transparent
 // end padding. Whole corners remain overlaid and are never sliced/deformed.
 const topLeft=materialEndpoint(tl,'horizontal',tl.info.width-scaled(16),-1,scaled(96),race+' top left');
 const topRight=materialEndpoint(tr,'horizontal',scaled(16),1,scaled(96),race+' top right'),upper=await input('top');
 const topQuiet=await quietProfiles(upper,race==='zerg'?[200,0,4,upper.height]:[300,0,4,128],'horizontal',0);
 railReport.push(paintRail(layer,'horizontal',topLeft.along,tr.left+topRight.along,topLeft.row,topRight.row,topQuiet,'top'));
 let bottomLeft,bottomRight,bottomQuiet;
 if(race==='zerg'){
  const lower=await input('bottom');bottomLeft=bl.info.width-scaled(32);bottomRight=scaled(32);
  bottomQuiet=await quietProfiles(lower,[300,0,4,lower.height],'horizontal',SIZE-scaled(lower.height));
 }else{
  bottomLeft=scaled(cfg.lipX);bottomRight=scaled(br.original.width-cfg.lipX);
  bottomQuiet=await quietProfiles(bl.original,[cfg.lipX,0,4,bl.original.height],'horizontal',bl.top);
 }
 const lowerLeft=materialEndpoint(bl,'horizontal',bottomLeft,-1,scaled(96),race+' bottom left'),lowerRight=materialEndpoint(br,'horizontal',bottomRight,1,scaled(96),race+' bottom right');
 railReport.push(paintRail(layer,'horizontal',lowerLeft.along,br.left+lowerRight.along,lowerLeft.row,lowerRight.row,bottomQuiet,'bottom'));
 const upperY=scaled(cfg.wallY),lowerY=scaled(race==='zerg'?100:166);
 for(const side of ['left','right']){
  const upperCorner=side==='left'?tl:tr,lowerCorner=side==='left'?bl:br;
  let quiet;
  if(race==='zerg'){
   const wall=await input(side);quiet=await quietProfiles(wall,[0,cfg.quietWallRow,wall.width,4],'vertical',side==='left'?0:SIZE-scaled(wall.width));
  }else{
   const wall=upperCorner.original;quiet=await quietProfiles(wall,[side==='left'?0:wall.width-128,cfg.wallY,128,4],'vertical',side==='left'?0:SIZE-scaled(128));
  }
  const first=materialEndpoint(upperCorner,'vertical',upperY,1,scaled(64),race+' '+side+' upper'),last=materialEndpoint(lowerCorner,'vertical',lowerY,1,scaled(64),race+' '+side+' lower');
  railReport.push(paintRail(layer,'vertical',first.along,lowerCorner.top+last.along,first.row,last.row,quiet,side));
 }
 const overlays=[];for(const corner of Object.values(corners))overlays.push({input:await sharp(corner.data,{raw:corner.info}).png().toBuffer(),left:corner.left,top:corner.top});
 const {data,info}=await sharp(layer,{raw:{width:SIZE,height:SIZE,channels:4}}).composite(overlays).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let y=SLICE;y<SIZE-SLICE;y++)for(let x=SLICE;x<SIZE-SLICE;x++)if(data[(y*SIZE+x)*4+3]!==0)throw Error('Frame paints the content well: '+race);
 return {data,info,report:{race,scale,slice:SLICE,placements,endpointSelections:{topLeft:{preferred:topLeft.preferred,actual:topLeft.along,materialPixels:topLeft.materialPixels},topRight:{preferred:topRight.preferred,actual:topRight.along,materialPixels:topRight.materialPixels}},rails:railReport,quietWallRows:cfg.quietWallRow===undefined?null:[cfg.quietWallRow,cfg.quietWallRow+3],sources:[...new Set(used)]}};
}
function adaptedPixels(base,skin){
 const data=Buffer.from(base.data),race=raceIds[skin.id];
 if(originals.has(skin.id))return {data,adaptation:'Original race RGB and alpha; original shared race geometry.'};
 // Nerazim's console jewels are jade; its violet control states remain
 // separate source assets and are not changed by this frame adaptation.
 const energyColor=skin.id==='nerazim'?'#48ba8a':skin.accent;
 const accent=[1,3,5].map(i=>parseInt(energyColor.slice(i,i+2),16));
 const metal={fenix:[1.12,1.09,1.01],alarak:[.38,.37,.39],ihanrii:[.96,1.01,1.04],nova:[.88,1.01,1.11],mira:[1.06,.88,.97],tyrador:[1.03,.91,1.09],machined:[.94,1,1.04],mecha:[.88,1.01,1.12],cerberus:[1.05,.82,.86]}[skin.id];
 const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
 for(let i=0;i<data.length;i+=4){
  if(!data[i+3])continue; // Honor the original alpha, including hidden lightmaps.
  const [r,g,b]=[data[i],data[i+1],data[i+2]],max=Math.max(r,g,b),min=Math.min(r,g,b),saturation=max?(max-min)/max:0;
  const energy=race==='protoss'?b>r*1.18&&g>r*.88&&saturation>.28:
   race==='terran'?g>r*1.15&&g>b*1.12&&saturation>.25:
   b>g*1.35&&r>g*1.2&&saturation>.48&&max>75;
  if(energy){
   // Preserve each energy pixel's native brightness/relief; change hue only.
   const level=max/Math.max(...accent);for(let channel=0;channel<3;channel++)data[i+channel]=clamp(accent[channel]*level);
  }else if(metal){
   const luminance=.2126*r+.7152*g+.0722*b;
   if(race==='protoss'&&(skin.id==='fenix'||skin.id==='ihanrii'||skin.id==='alarak')){
    // Warm metallic casing becomes ivory, silver or dark forged material.
    // Near-neutral highlights follow the same material without colouring text.
    if((r>g*1.04&&g>b*1.06)||saturation<.24)for(let channel=0;channel<3;channel++)data[i+channel]=clamp(luminance*metal[channel]);
   }else if(saturation<.3)for(let channel=0;channel<3;channel++)data[i+channel]=clamp(data[i+channel]*metal[channel]);
  }
 }
 return {data,adaptation:'Original '+race+' frame geometry; selective native energy to '+energyColor+(metal?'; targeted casing material adaptation.':'; native casing RGB retained.')};
}
async function build(){
 sharp.concurrency(1);sharp.cache(false);fs.mkdirSync(out,{recursive:true});
 const races={};for(const race of Object.keys(geometry))races[race]=await raceFrame(race);
 const tokens=[],styles=[];
 for(const skin of catalog){
  const race=raceIds[skin.id];if(!race)throw Error('Unassigned frame race: '+skin.id);
  const base=races[race],variant=adaptedPixels(base,skin),filename=skin.id+'-game-frame.png';
  await sharp(variant.data,{raw:base.info}).png().toFile(path.join(out,filename));
  tokens.push(':root[data-graphical-style='+skin.id+"]{--game-frame:url('/themes/"+filename+"');--game-frame-slice:320}");
  styles.push({id:skin.id,race,filename,adaptation:variant.adaptation});
 }
 fs.writeFileSync(path.join(root,'wwwroot/game-frame-tokens.css'),'/* Generated by Build-GameFrames.cjs. Native race geometry; adapted skin colours are documented by the generator report. Atlas1024,corner bands320,transparent content well. */\n'+tokens.join('\n')+'\n');
 return {success:true,width:SIZE,height:SIZE,slice:SLICE,styles,races:Object.values(races).map(x=>x.report)};
}
module.exports={build,raceFrame,adaptedPixels,materialEndpoint};
if(require.main===module)build().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
