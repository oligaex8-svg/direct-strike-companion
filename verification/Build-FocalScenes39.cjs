'use strict';
// One integrated raster chamber, two compositions. Never distributes equipment.
// Invoke through the resource guard; --ids=nova,mecha,zerg,protoss for first review.
process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {createCanvas,loadImage}=require(require.resolve('@napi-rs/canvas',{paths:deps}));
const sharp=require(require.resolve('sharp',{paths:deps})),equipment=require('./ThemeEquipmentRaster.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/focal39'),TAU=2*Math.PI;
const FRAMES=144,COLUMNS=12,ROWS=12,DURATION=6000;
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const profiles={
 protoss:{name:'Khala crystal chamber',motion:'crystal',color:'#278ad9',scene:'artanis'},
 nerazim:{name:'Void-glass chamber',motion:'void',color:'#258c71',scene:'vorazun'},
 alarak:{name:'Forged plasma containment',motion:'plasma',color:'#a82625',scene:'alarak'},
 ihanrii:{name:'Ihan-rii suspended crystal',motion:'crystal',color:'#4aa696'},
 terran:{name:'Terran ventilation chamber',motion:'fan',turns:1,color:'#93814b',scene:'raynor'},
 nova:{name:'Covert optical chamber',motion:'optic',color:'#259fba',scene:'nova'},
 mira:{name:'Salvaged turbine bay',motion:'fan',turns:2,color:'#b65d5a',scene:'hanandhorner'},
 machined:{name:'Foundry exhaust chamber',motion:'fan',turns:3,color:'#b18a4b',scene:'swann'},
 tyrador:{name:'Tyrador optical chamber',motion:'optic',color:'#9368b8'},
 zerg:{name:'Chitin brood chamber',motion:'membrane',color:'#814d8e',scene:'kerrigan'},
 abathur:{name:'Evolution membrane chamber',motion:'membrane',color:'#7d973b',scene:'abathur'},
 dehaka:{name:'Primal root chamber',motion:'root',color:'#78845a',scene:'dehaka'},
 cerberus:{name:'Living containment turbine',motion:'fan',turns:1,color:'#758448'},
 mecha:{name:'Armoured actuator chamber',motion:'servo',color:'#b38a35'},
 arcade:{name:'Original arcade joystick',motion:'joystick',color:'#a14cbd'},
 'classic-terran':{name:'Remastered turbine chamber',motion:'fan',turns:2,color:'#72925d',scene:'raynor'},
 'classic-protoss':{name:'Remastered crystal socket',motion:'crystal',color:'#2d9db8',scene:'artanis'},
 'classic-zerg':{name:'Remastered muscle chamber',motion:'membrane',color:'#a65a48',scene:'kerrigan'}
};
function canvas(w,h){const image=createCanvas(w,h),c=image.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';return {image,c};}
function cover(c,image,x,y,w,h,alpha=1){const s=Math.max(w/image.width,h/image.height);c.save();c.globalAlpha=alpha;c.drawImage(image,x+(w-image.width*s)/2,y+(h-image.height*s)/2,image.width*s,image.height*s);c.restore();}
function colorAlpha(hex,alpha){return hex+Math.round(alpha*255).toString(16).padStart(2,'0');}
async function environment(id){const p=profiles[id];if(!p.scene)return null;const file=`assets/themes/identity-native/sc2_ui_coop_detail_background_${p.scene}.png`,bytes=fs.readFileSync(path.join(root,file));return {image:await loadImage(bytes),file,hash:hash(bytes)};}
function stage(w,h,p,scene){
 const {image,c}=canvas(w,h);c.fillStyle='#080e14';c.fillRect(0,0,w,h);
 if(scene)cover(c,scene.image,0,0,w,h,.2);
 const light=c.createRadialGradient(w*.5,h*.52,0,w*.5,h*.52,Math.max(w,h)*.6);light.addColorStop(0,colorAlpha(p.color,.23));light.addColorStop(1,'#02040800');c.fillStyle=light;c.fillRect(0,0,w,h);
 // Stable fine grain gives the bay a surface without drawing another device.
 let seed=39;for(let i=0;i<w*h/8;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%w;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%h;c.fillStyle=i%2?'#ffffff05':'#00000018';c.fillRect(x,y,1,1);}
 // Feather only the environment; the physical casing is drawn afterwards and
 // keeps its entire silhouette. This avoids a wallpaper rectangle in Settings.
 c.globalCompositeOperation='destination-in';
 const horizontal=c.createLinearGradient(0,0,w,0);horizontal.addColorStop(0,'#0000');horizontal.addColorStop(.17,'#000');horizontal.addColorStop(.83,'#000');horizontal.addColorStop(1,'#0000');c.fillStyle=horizontal;c.fillRect(0,0,w,h);
 const vertical=c.createLinearGradient(0,0,0,h);vertical.addColorStop(0,'#0000');vertical.addColorStop(.2,'#000');vertical.addColorStop(.8,'#000');vertical.addColorStop(1,'#0000');c.fillStyle=vertical;c.fillRect(0,0,w,h);
 return image;
}
function placement(ctx,w,h,portrait){
 const part=ctx.parts.core.image,scale=portrait?Math.min((h-20)/part.width,(w-26)/part.height):Math.min((w-24)/part.width,(h-20)/part.height);
 return {scale,cx:w/2,cy:h/2,angle:portrait?Math.PI/2:0,sw:part.width,sh:part.height};
}
function place(c,image,b){c.save();c.translate(b.cx,b.cy);c.rotate(b.angle);c.scale(b.scale,b.scale);c.drawImage(image,-b.sw/2,-b.sh/2);c.restore();}
function rectangle(b,hole,w,h){
 const points=[[hole.left,hole.top],[hole.left+hole.width,hole.top],[hole.left,hole.top+hole.height],[hole.left+hole.width,hole.top+hole.height]].map(([x,y])=>{x=(x-b.sw/2)*b.scale;y=(y-b.sh/2)*b.scale;return [b.cx+x*Math.cos(b.angle)-y*Math.sin(b.angle),b.cy+x*Math.sin(b.angle)+y*Math.cos(b.angle)];});
 const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))-3),y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))-3),right=Math.min(w,Math.ceil(Math.max(...points.map(p=>p[0])))+3),bottom=Math.min(h,Math.ceil(Math.max(...points.map(p=>p[1])))+3);
 return [x,y,right-x,bottom-y];
}
function mechanism(ctx,p,phase){
 const part=ctx.parts.core,moving=ctx.parts.moving.image,hole=part.meta.aperture.bounds,{width:w,height:h}=part.image;
 const {image,c}=ctx.focalScratch||(ctx.focalScratch=canvas(w,h)),t=((phase%1)+1)%1*TAU,cx=hole.left+hole.width/2,cy=hole.top+hole.height/2;
 c.resetTransform();c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,w,h);
 // The natural alpha aperture is the sole motion boundary.
 c.fillStyle='#03070b';c.fillRect(hole.left,hole.top,hole.width,hole.height);
 const organic=['membrane','root'].includes(p.motion),s=(organic?Math.max(hole.width/moving.width,hole.height/moving.height):Math.min(hole.width/moving.width,hole.height/moving.height))*(organic?1.13:.97),mw=moving.width*s,mh=moving.height*s;
 c.save();c.translate(cx,cy);
 if(p.motion==='fan'){
  c.rotate(t*p.turns);c.drawImage(moving,-mw/2,-mh/2,mw,mh);
 }else if(p.motion==='servo'){
  c.translate(Math.sin(t)*hole.width*.075,0);c.drawImage(moving,-mw/2,-mh/2,mw,mh);
 }else if(organic){
  // Contiguous source strips deform underneath fixed bone/chitin. Extra cover
  // keeps the aperture filled through the full contraction; no tissue fades.
  const n=40;for(let i=0;i<n;i++){const sx=moving.width*i/n,sw=moving.width/n+.7,dy=Math.sin(t-i*.13)*hole.height*.055,stretch=1+.055*Math.cos(t-i*.11);c.drawImage(moving,sx,0,sw,moving.height,-mw/2+mw*i/n,-mh/2*stretch+dy,mw/n+s*.7,mh*stretch);}
 }else if(p.motion==='optic'||p.motion==='void'){
  c.drawImage(moving,-mw/2,-mh/2,mw,mh);
  // The lens rim remains stationary. Only original glass pixels refract.
  c.save();c.beginPath();c.ellipse(0,0,mw*.33,mh*.33,0,0,TAU);c.clip();c.rotate(Math.sin(t)*.13);c.scale(1.035+.02*Math.sin(t),1.035+.02*Math.cos(t));c.drawImage(moving,-mw/2,-mh/2,mw,mh);c.globalCompositeOperation='screen';c.globalAlpha=.1;c.translate(Math.cos(t)*mw*.035,Math.sin(t)*mh*.025);c.drawImage(moving,-mw/2,-mh/2,mw,mh);c.restore();
 }else{
  c.translate(Math.sin(t)*hole.width*.018,Math.cos(t)*hole.height*.018);c.scale(1+.035*Math.sin(t),1+.018*Math.cos(t));c.drawImage(moving,-mw/2,-mh/2,mw,mh);
  c.globalCompositeOperation='screen';c.globalAlpha=p.motion==='plasma'?.2:.12;c.translate(Math.cos(t)*mw*.025,Math.sin(t)*mh*.025);c.drawImage(moving,-mw/2,-mh/2,mw,mh);
 }
 c.restore();c.globalCompositeOperation='destination-in';c.drawImage(part.apertureMask,0,0);return image;
}
function composition(ctx,p,scene,w,h,portrait){
 const b=placement(ctx,w,h,portrait),background=stage(w,h,p,scene);
 const crop=rectangle(b,ctx.parts.core.meta.aperture.bounds,w,h);
 // Source sculpture casts its contact shadow into the same stationary bay.
 const shell=canvas(w,h);shell.c.save();shell.c.shadowColor='#000b';shell.c.shadowBlur=6;shell.c.shadowOffsetY=3;place(shell.c,ctx.parts.core.image,b);shell.c.restore();
 return {crop,render:phase=>{const frame=canvas(w,h);frame.c.drawImage(background,0,0);place(frame.c,mechanism(ctx,p,phase),b);frame.c.drawImage(shell.image,0,0);return frame;}};
}
async function joystick(p){
 const parts={};for(const name of ['ball','stick','base']){const file=`assets/themes/identity-native/ui_console_flavor_joystick_${name}_arcadecabinetpurple.png`,bytes=fs.readFileSync(path.join(root,file));parts[name]={image:await loadImage(bytes),file,hash:hash(bytes)};}
 const w=320,h=160,back=stage(w,h,p,null);
 return {w,h,crop:[119,8,82,145],sources:Object.values(parts).map(({file,hash})=>({file,hash})),render:phase=>{phase=((phase%1)+1)%1;const frame=canvas(w,h),c=frame.c;c.drawImage(back,0,0);c.save();c.translate(160,122);c.rotate(Math.sin(phase*TAU)*.045);c.drawImage(parts.stick.image,-3,-70,6,72);c.drawImage(parts.ball.image,-27,-111,54,54);c.restore();c.drawImage(parts.base.image,126,94,68,58);return frame;}};
}
function raw(image){return Buffer.from(image.c.getImageData(0,0,image.image.width,image.image.height).data);}
function cut(data,w,crop){const [x,y,cw,ch]=crop,result=Buffer.alloc(cw*ch*4);for(let r=0;r<ch;r++)data.copy(result,r*cw*4,((y+r)*w+x)*4,((y+r)*w+x+cw)*4);return result;}
async function writeScene(id,kind,scene,w,h){
 const first=raw(scene.render(0)),last=raw(scene.render(1));assert(first.equals(last),id+' '+kind+' loop mismatch');
 const [x,y,cw,ch]=scene.crop,atlas=Buffer.alloc(cw*COLUMNS*ch*ROWS*4),firstCrop=cut(first,w,scene.crop);let changed=0;
 for(let frame=0;frame<FRAMES;frame++){
  const full=frame?raw(scene.render(frame/FRAMES)):first,pixels=cut(full,w,scene.crop);
  // Stationary housing/background is an explicit invariant, not a visual claim.
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(xx<x||xx>=x+cw||yy<y||yy>=y+ch){const i=(yy*w+xx)*4;if(full[i]!==first[i]||full[i+1]!==first[i+1]||full[i+2]!==first[i+2]||full[i+3]!==first[i+3])throw Error('Motion escaped aperture '+id+' '+kind);}
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==firstCrop[i]||pixels[i+1]!==firstCrop[i+1]||pixels[i+2]!==firstCrop[i+2])changed++;
  for(let row=0;row<ch;row++)pixels.copy(atlas,(((Math.floor(frame/COLUMNS)*ch+row)*cw*COLUMNS)+(frame%COLUMNS)*cw)*4,row*cw*4,(row+1)*cw*4);
 }
 assert(changed>100,id+' '+kind+' has no substantial material change');
 const name=id+'-'+kind,poster=name+'-poster.webp',sprite=name+'-atlas.webp',base=name+'-base.webp',basePixels=Buffer.from(first);
 // The atlas supplies this rectangle exactly once, including any translucent
 // environment pixels. Keep a separate complete poster for reduced motion.
 for(let row=y;row<y+ch;row++)for(let col=x;col<x+cw;col++)basePixels.fill(0,(row*w+col)*4,(row*w+col)*4+4);
 await sharp(basePixels,{raw:{width:w,height:h,channels:4}}).webp({lossless:true,effort:2}).toFile(path.join(out,base));
 await sharp(first,{raw:{width:w,height:h,channels:4}}).webp({lossless:true,effort:2}).toFile(path.join(out,poster));
 // Lossless atlas keeps exact joins with its poster and stationary casing.
 await sharp(atlas,{raw:{width:cw*COLUMNS,height:ch*ROWS,channels:4}}).webp({lossless:true,effort:2}).toFile(path.join(out,sprite));
 return {width:w,height:h,crop:scene.crop,tile:[cw,ch],base:'/themes/focal39/'+base,poster:'/themes/focal39/'+poster,atlas:'/themes/focal39/'+sprite,baseHash:hash(fs.readFileSync(path.join(out,base))),posterHash:hash(fs.readFileSync(path.join(out,poster))),atlasHash:hash(fs.readFileSync(path.join(out,sprite))),verification:{exactLoop:true,stationaryOutsideAperture:true,changedPixelsAcrossFrames:changed}};
}
async function build(ids){
 sharp.concurrency(1);sharp.cache({memory:24,files:0});fs.mkdirSync(out,{recursive:true});
 const catalogFile=path.join(out,'catalog.json'),catalog=fs.existsSync(catalogFile)?JSON.parse(fs.readFileSync(catalogFile,'utf8')):{version:39,frames:FRAMES,columns:COLUMNS,rows:ROWS,duration:DURATION,themes:{}};
 Object.assign(catalog,{version:39,frames:FRAMES,columns:COLUMNS,rows:ROWS,duration:DURATION,provenance:'Companion-authored scene compositions using existing image-generated SC2-referenced physical kits and credited original SC2 scenery; not native game animation exports.'});
 for(const id of ids){
  if(!profiles[id])throw Error('Unknown focal theme '+id);const p=profiles[id],entry={id,name:p.name,motion:p.motion,sources:[],compositions:{}};
  if(id==='arcade'){const scene=await joystick(p);entry.sources=scene.sources;entry.provenance='Original SC2 joystick artwork; companion-authored articulation. Existing sidebar joystick retained.';entry.compositions.preview=await writeScene(id,'preview',scene,scene.w,scene.h);}
  else{
   const ctx=await equipment.prepare(id),scene=await environment(id);entry.sources=[{file:ctx.profile.source,hash:ctx.record.sourceSha256},{file:ctx.parts.core.meta.file,hash:ctx.parts.core.meta.sha256},{file:ctx.parts.moving.meta.file,hash:ctx.parts.moving.meta.sha256}];if(scene)entry.sources.push({file:scene.file,hash:scene.hash});
   for(const [kind,w,h,portrait]of [['preview',320,160,false],['sidebar',192,224,true]])entry.compositions[kind]=await writeScene(id,kind,composition(ctx,p,scene,w,h,portrait),w,h);
  }
  catalog.themes[id]=entry;fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');console.log(JSON.stringify({theme:id,compositions:Object.keys(entry.compositions)}));
 }
 console.log(JSON.stringify({themes:Object.keys(catalog.themes).length,catalog:'wwwroot/themes/focal39/catalog.json'}));
}
if(require.main===module){const flag=process.argv.find(x=>x.startsWith('--ids='));build(flag?flag.slice(6).split(','):Object.keys(profiles)).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={profiles,build};
