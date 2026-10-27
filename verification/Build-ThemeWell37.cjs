'use strict';
// Direct high-resolution PNG frames. Parent invokes only in its guarded image stage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ids=['protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg'];
const art32=new Set(['zerg','mecha','mira','machined','dehaka','cerberus','classic-zerg']);
function materialProfile(data,w,h,axis,reverse=false){const count=axis==='horizontal'?h:w,values=[];for(let k=0;k<count;k++){const at=reverse?count-1-k:k,x=axis==='horizontal'?Math.floor(w/2):at,y=axis==='horizontal'?at:Math.floor(h/2),i=(y*w+x)*4;if(data[i+3]>=128)values.push(k);}const half=values.filter(k=>k<count/2);if(!half.length)throw Error('Missing opaque midpoint material '+axis);return {start:Math.min(...half),end:Math.max(...half),pixels:half.length};}
function opaqueBounds(data,w,h){let left=w,top=h,right=-1,bottom=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=240){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}if(right<0)throw Error('Missing opaque frame');return [left,top,right,bottom];}
function seams(data,w,h,slice){let maxDifference=0,components=0;const compare=(a,b)=>{for(let c=0;c<4;c++){maxDifference=Math.max(maxDifference,Math.abs(data[a+c]-data[b+c]));components++;}};for(const x of [slice,w-slice])for(let y=0;y<h;y++)if(y<slice||y>=h-slice)compare((y*w+x-1)*4,(y*w+x)*4);for(const y of [slice,h-slice])for(let x=0;x<w;x++)if(x<slice||x>=w-slice)compare(((y-1)*w+x)*4,(y*w+x)*4);return {allFourCorners:true,comparedComponents:components,maxAdjacentChannelDifference:maxDifference,interpretation:'Measured existing atlas transitions; adjacent textured pixels need not match. No reconstructed joins introduced.'};}
async function build(options={}){
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);sharp.cache(false);
 const sourceRoot=path.resolve(options.sourceRoot||root),outputRoot=path.resolve(options.outputRoot||path.join(sourceRoot,'wwwroot')),out=path.join(outputRoot,'themes/motion37');fs.mkdirSync(out,{recursive:true});const catalog=[],tokens=[];
 for(const id of ids){
  const authored=art32.has(id),source=authored?`assets/themes/art32/${id}-inset-atlas-v1.png`:`wwwroot/themes/${id}-game-frame.png`,bytes=fs.readFileSync(path.join(sourceRoot,source)),decoded=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let {data,info}=decoded;
  if(authored?(info.width!==1600||info.height!==1000):(info.width!==1024||info.height!==1024))throw Error('Unexpected high-resolution frame '+id);
  const bounds=opaqueBounds(data,info.width,info.height);let trim=0,removedTailPixels=0;
  if(!authored){
   // Actual opaque native corners begin at18px for Protoss,22px for Terran,
   //15px for Abathur. A24-32px crop would amputate real corner material.
   trim=Math.max(0,Math.min(24,bounds[0],bounds[1],info.width-1-bounds[2],info.height-1-bounds[3]));
   const w=info.width-trim*2,h=info.height-trim*2,result=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=((y+trim)*info.width+x+trim)*4,d=(y*w+x)*4;data.copy(result,d,s,s+4);if(result[d+3]<128){if(result[d+3])removedTailPixels++;result.fill(0,d,d+4);}}
   data=result;info={width:w,height:h,channels:4};
  }
  const slice=320-trim,horizontal=materialProfile(data,info.width,info.height,'horizontal'),vertical=materialProfile(data,info.width,info.height,'vertical');
  // Paint is allocation including transparent corner margin, not material width.
  // Select uniform scaling from measured horizontal material to obtain8px body.
  const bottom=materialProfile(data,info.width,info.height,'horizontal',true),right=materialProfile(data,info.width,info.height,'vertical',true),paint=+(slice*8/Math.max(horizontal.pixels,vertical.pixels,bottom.pixels,right.pixels)).toFixed(3),scale=paint/slice,outset=[horizontal,right,bottom,vertical].map(p=>+(p.start*scale+4).toFixed(3)),filename=`well-${id}.png`,target=path.join(out,filename);
  if(authored)fs.copyFileSync(path.join(sourceRoot,source),target);else await sharp(data,{raw:info}).png().toFile(target);const output=fs.readFileSync(target);
  const race=['protoss','nerazim','alarak','ihanrii','classic-protoss'].includes(id)?'protoss':id==='abathur'?'zerg':'terran';
  catalog.push({id,source,sourceHash:hash(bytes),sourceDimensions:[decoded.info.width,decoded.info.height],sourceKind:authored?'existing-authored-detailed-art32-frame':'original-sc2-race-frame-existing-flavour-adaptation',adaptation:authored?'Byte-identical existing detailed image-authored inset atlas; SC2-matched companion artwork, not native game export':`Original ${race} SC2 race frame geometry with existing flavour adaptation; uniformly trimmed external margin and removed alpha<128 export tails; no new paint, status buttons or SVG wrapper`,url:'/themes/motion37/'+filename,hash:hash(output),dimensions:[info.width,info.height],sourceOpaqueBounds:bounds,uniformTrim:trim,removedTailPixels,originalOpaqueCornersPreserved:true,byteIdenticalToSource:authored,slice:[slice,slice,slice,slice],paint:[paint,paint,paint,paint],scale,outset,center:'transparent',profiles:{horizontal,vertical,bottom,right},visibleMaterialThickness:{horizontal:+(horizontal.pixels*scale).toFixed(3),vertical:+(vertical.pixels*scale).toFixed(3)},joinVerification:seams(data,info.width,info.height,slice)});
  const ex=Math.max(0,vertical.start-(bounds[0]-trim),horizontal.start-(bounds[1]-trim),right.start-(info.width-1-(bounds[2]-trim)),bottom.start-(info.height-1-(bounds[3]-trim)))*scale,compactFactor=Math.min(.65,ex?7/ex:.65),compactPaint=paint*compactFactor,compactOutset=outset.map(n=>(n-4)*compactFactor+2);catalog.at(-1).compact={factor:compactFactor,paint:compactPaint,outset:compactOutset};
  tokens.push(`:root[data-graphical-style="${id}"]{--skin-well37-image:url('/themes/motion37/${filename}');--skin-well37-slice:${slice};--skin-well37-paint:${paint}px;--skin-well37-outset:${outset.map(n=>n+'px').join(' ')};--skin-well37-material:8px;--skin-well37-compact-paint:${compactPaint.toFixed(3)}px;--skin-well37-compact-outset:${compactOutset.map(n=>n.toFixed(3)+'px').join(' ')}}`);
 }
 fs.writeFileSync(path.join(out,'well-catalog.json'),JSON.stringify(catalog,null,2)+'\n');fs.writeFileSync(path.join(out,'well-tokens.css'),'/* Direct high-resolution PNG inset frames; no SVG downsampling. Border-image slice WITHOUT fill; paint and outset include registered transparent source margins. Inert pseudo only; do not add layout borders. */\n'+tokens.join('\n')+'\n');return {themes:catalog.length,assets:catalog.length,catalog};
}
module.exports={build};
if(require.main===module)build().then(r=>console.log(JSON.stringify({themes:r.themes,assets:r.assets}))).catch(e=>{console.error(e);process.exitCode=1;});
