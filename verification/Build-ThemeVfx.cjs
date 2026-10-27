'use strict';
// Authored companion artwork inspired by the existing console palettes.
// Deterministic offline raster materials; not native SC2 exports. No GPU or runtime pixel loops.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/vfx');
const themes=[
 ['default','#74b9d9','#9ccbd3','Instrument orbit','vfx-orbit','vfx-signal',10],
 ['fenix','#edb456','#ffe1a0','Purifier holographic matrix currents','vfx-current','vfx-matrix',7],
 ['protoss','#66d5f7','#dfbc70','Khala conduits','vfx-conduit','vfx-resonate',8],
 ['nerazim','#8b65ce','#60dfc4','Void wisps','vfx-wisp','vfx-resonate',10],
 ['alarak','#ef4936','#ff9a75','Tal’darim blade energy','vfx-blade','vfx-signal',6],
 ['ihanrii','#66d4b9','#b4eee1','Ihan-rii rune activation','vfx-rune','vfx-matrix',9],
 ['terran','#62c292','#d2deb0','Tactical scanner and status lamps','vfx-scan','vfx-signal',6],
 ['nova','#53d4fc','#c3f4ff','Covert targeting reticle','vfx-reticle','vfx-signal',7],
 ['mira','#f5a34e','#ee93af','Salvage sparks','vfx-sparks','vfx-embers',5],
 ['machined','#e0a84d','#8fcbdf','Reactor induction rings','vfx-orbit','vfx-resonate',10],
 ['tyrador','#c7a6ee','#eee1ff','Luxury telemetry ribbon','vfx-telemetry','vfx-matrix',8],
 ['zerg','#bc77d5','#cfad76','Hive bioluminescent veins','vfx-veins','vfx-resonate',9],
 ['abathur','#b1dc50','#d8eea1','Evolution vesicles','vfx-vesicles','vfx-resonate',8],
 ['dehaka','#e5ad5d','#c9d897','Primal spores','vfx-spores','vfx-embers',10],
 ['cerberus','#6ed5b5','#f3a36c','Infested containment','vfx-containment','vfx-signal',6],
 ['mecha','#f4a544','#a9c8ee','Synthetic cell sequencing','vfx-cells','vfx-matrix',7],
 ['arcade','#d96bff','#6ce5f5','Neon pixel cascade','vfx-pixels','vfx-pixels',5],
 ['classic-terran','#84d5a0','#c6e4bb','CRT phosphor sweep','vfx-crt','vfx-signal',8],
 ['classic-protoss','#71d0ed','#e2c976','Psionic resonance','vfx-psionic','vfx-resonate',10],
 ['classic-zerg','#d18c55','#cbb477','Organic nerve tendrils','vfx-tendrils','vfx-embers',9]
].map(([id,energy,secondary,label,motion,nodesMotion,cycle])=>({id,energy,secondary,label,motion,nodesMotion,cycle}));

const WIDTH=480,HEIGHT=240,LAYERS=Object.freeze(['field','flow','nodes']);
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const gauss=(x,y,sx=1,sy=sx)=>Math.exp(-.5*((x/sx)**2+(y/sy)**2));
const seedOf=text=>{let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
function hash(x,y,seed){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);return ((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v)*2-1;}
function fbm(x,y,seed){return noise(x,y,seed)*.57+noise(x*2.07+17,y*2.07-11,seed+101)*.29+noise(x*4.13-7,y*4.13+19,seed+211)*.14;}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
// Filled material interiors: broad soft panes, never a stroked grid or contour.
function softPane(ctx,u,v,offset=0){
 const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix-.5,fy=v-iy-.5;
 const interior=(1-smooth(.29,.49,Math.abs(fx)))*(1-smooth(.29,.49,Math.abs(fy)));
 return {interior,power:.35+.65*hash(ix,iy,ctx.seed+offset),tilt:hash(ix,iy,ctx.seed+offset+73)};
}
const surfaceThemes=new Set(['default','fenix','protoss','ihanrii','terran','nova','machined','tyrador','mecha','arcade','classic-terran']);
const intents={
 default:'Cool instrument-light atmosphere and dispersed neutral ion dust',
 fenix:'Filled amber holographic panes, charged interference interiors and golden caustics',
 protoss:'Filled refractive crystal-light facets, cyan plasma and gold prismatic caustics',
 nerazim:'Violet void haze, curling mint wisps and isolated cold motes',
 alarak:'Dense red plasma, split hot updrafts and molten embers',
 ihanrii:'Broad teal dielectric mineral sheets and subsurface scintillation',
 terran:'Flat green radar light wash, granular phosphor surface and equipment-light scatter',
 nova:'Flat cyan polarized optical coating, spectral shimmer and micro-scintillation',
 mira:'Localized welded-seam ember plume, warm dust and seam-bound hot sparks',
 machined:'Shielded foundry heat core, concentrated hot lobes and localized thermal bleed',
 tyrador:'Broad lavender pearlescent wave curtains, opalescent sheen and crystalline dust',
 zerg:'Purple biological fluid, irregular membranes and bioluminescent inclusions',
 abathur:'Acid-green translucent sacs, suspended fluid and luminous vesicle nuclei',
 dehaka:'Amber primal dust, drifting spore volume and warm organic motes',
 cerberus:'Localized infested vent leak, organic seam intrusion and contaminated plasma',
 mecha:'Uneven cooled synthetic plasma, recessed charge pockets and a soft transfer flow',
 arcade:'Granular purple-cyan pixel phosphor surface and quantized glow particles',
 'classic-terran':'Coarse green CRT phosphor, low-frequency light wash and aged sensor bloom',
 'classic-protoss':'Soft cyan psionic volume, gold light refraction and diffuse psychic motes',
 'classic-zerg':'Ochre organic fluid, swollen membrane folds and warm cellular emission'
};
function createMaterial(theme){
 const p=typeof theme==='string'?themes.find(item=>item.id===theme):theme;
 if(!p||!themes.some(item=>item.id===p.id))throw Error('Unknown theme material');
 const seed=seedOf('companion-material-v1:'+p.id),random=i=>hash(i,13,seed);
 const count=['mira','dehaka','arcade'].includes(p.id)?38:23;
 const particles=Array.from({length:count},(_,i)=>{
  let x=(random(i*5)-.5)*1.85,y=(random(i*5+1)-.5)*1.65;
  if(p.id==='arcade'){x=Math.round(x*12)/12;y=Math.round(y*10)/10;}
  // Local hardware-relative emitters; the parent places the material over its
  // native seam/core. No screen-wide particle blanket or regular charged grid.
  if(p.id==='mira'){y=(random(i*5+1)-.5)*1.35;x=.58+.17*y+(random(i*5)-.5)*.15;}
  if(p.id==='cerberus'){y=.16+(random(i*5+1)-.5)*.73;x=.51+.14*Math.sin(y*5)+(random(i*5)-.5)*.2;}
  if(p.id==='machined'){x=.22+(random(i*5)-.5)*.59;y=.04+(random(i*5+1)-.5)*.67;}
  if(p.id==='mecha'){const side=i%3===0?-.37:.33;x=side+(random(i*5)-.5)*.4;y=(side<0?.09:-.14)+(random(i*5+1)-.5)*.51;}
  return {x,y,r:.009+random(i*5+2)*.027,power:.35+random(i*5+3)*.65,stretch:p.id==='mira'?2.7:p.id==='nova'?.7:1};
 });
 const sacs=p.id==='abathur'?[[-.48,.05,.26,.36],[0,-.38,.31,.37],[.45,.11,.29,.37],[0,.53,.23,.25]]:[[-.52,.2,.32,.32],[-.2,-.35,.37,.3],[.32,-.25,.34,.38],[.45,.38,.3,.28],[0,.4,.32,.3]];
 const surface=surfaceThemes.has(p.id);
 const composition={revision:2,kind:surface?'filled-optical-surface':'noise-shaped-biological-volume',seed,center:[240,120],intent:intents[p.id],particles:count,envelopePower:surface?4:2,sacs:sacs.map(item=>item.slice())};
 const signature=crypto.createHash('sha256').update(JSON.stringify(composition)).digest('hex');
 return {theme:p,seed,particles,sacs,surface,energy:rgb(p.energy),secondary:rgb(p.secondary),composition,signature};
}
function density(ctx,x,y,n,w){
 const id=ctx.theme.id,angle=Math.atan2(y,x),grain=.62+.48*n;
 let volume=0,blend=.3,heat=0,coherence=0,structure=0;
 switch(id){
 case 'default':volume=gauss(x+.12*w,y,.69,.47)*(.65+.4*n)+.35*gauss(x-.3,y+.25,.3,.35);blend=.45;break;
 case 'fenix':{
  const pane=softPane(ctx,x*3.6+y*1.7,y*4.2-x*.8,130),sheet=1-smooth(.59,1.16,Math.abs(y+.09*w));
  const charge=.62+.38*Math.sin(7*x+4*y+2*n)**2;
  structure=pane.interior*pane.power;
  volume=sheet*(.4+1.18*structure*charge)+.14*gauss(x,y+.15,.61,.51);
  blend=.25+.5*pane.tilt;heat=.06+.08*structure;coherence=.88;break;
 }
 case 'protoss':{
  const pane=softPane(ctx,x*2.1+y*1.25+.07*w,y*2.3-x*1.1,280);
  const refraction=.3+.7*smooth(-.25,.55,Math.sin(3.4*x+4.1*y+pane.tilt*3));
  structure=pane.interior*(.48+.52*pane.power);
  volume=(.42+1.02*structure*refraction)*(1-smooth(.63,1.22,Math.abs(y-.12*w)));
  blend=.12+.65*pane.tilt;heat=.08*refraction;coherence=.84;break;
 }
 case 'nerazim':volume=gauss(x+.23,y-.42*Math.sin(2.4*x+.7*w),1.22,.24)*(1+.4*n)+.64*gauss(x-.32,y+.26*Math.sin(3*x)+.2,.81,.29);blend=.2+.45*smooth(-.25,.7,w);break;
 case 'alarak':volume=gauss(x-.31*y-.11*w,y,.24,.85)+.7*gauss(x+.36*y+.3,y+.1,.26,.56);volume*=.6+.8*grain;blend=.15;heat=.22*gauss(x,y,.28,.55);break;
 case 'ihanrii':{
  const sheet=softPane(ctx,x*1.65+y*1.8,y*2.7-x*.3,390);
  structure=sheet.interior*sheet.power;
  volume=(.42+.97*structure+.18*Math.cos(5*y+2*w)**2)*(1-smooth(.7,1.21,Math.abs(y)));
  blend=.43+.4*sheet.tilt;heat=.04;coherence=.93;break;
 }
 case 'terran':{
  const phosphor=hash(Math.floor(x*83),Math.floor(y*69),ctx.seed+500);
  structure=smooth(.43,.82,phosphor);
  volume=(.55+.42*smooth(-.7,.7,x+.22*n)+.3*structure)*(1-smooth(.7,1.2,Math.abs(y)));
  blend=.24;heat=.05;coherence=.95;break;
 }
 case 'nova':{
  const polarized=.5+.5*Math.cos(2.7*x+1.8*y+.25*w)**2;
  structure=polarized*(.7+.3*smooth(-.5,.6,n));
  volume=(.39+.85*structure)*(1-smooth(.67,1.2,Math.abs(y+.14*w)));
  blend=.66+.18*Math.cos(3*x-2*y);heat=.055;coherence=.94;break;
 }
 case 'mira':{
  const seam=x-.58-.17*y+.035*w,hot=gauss(seam,y+.19,.105,.48),dust=gauss(seam-.08,y-.13,.22,.63);
  volume=hot*(.67+.7*grain)+dust*.26;structure=hot;
  blend=.04+.1*smooth(-.3,.6,n);heat=.16*hot;coherence=.44;break;
 }
 case 'machined':{
  const shield=.22+.78*smooth(-.28,.05,x),core=gauss(x-.21+.025*w,y+.02,.22,.31);
  const hotLobe=gauss(x-.43,y+.15+.045*n,.19,.21)+.62*gauss(x-.09,y-.29,.2,.19);
  volume=shield*(core*(.9+.3*grain)+.62*hotLobe);structure=core+.32*hotLobe;
  blend=.07+.3*(1-smooth(.1,.8,core));heat=.21*core;coherence=.7;break;
 }
 case 'tyrador':{
  const curtain=.5+.5*Math.sin(5*x+1.8*Math.sin(2.2*y)+.55*w);
  structure=curtain**1.6;
  volume=(.4+.83*structure)*(1-smooth(.66,1.2,Math.abs(y+.08*n)));
  blend=.56+.32*Math.sin(3*x+2*y);heat=.075;coherence=.87;break;
 }
 case 'zerg':{
  volume=gauss(x+.15*w,y+.15*n,.79,.67)*(.3+.9*(1-Math.abs(n*1.8))**2);
  for(const [sx,sy,rx,ry] of ctx.sacs)volume+=.19*gauss(x-sx+.12*w,y-sy+.12*n,rx,ry);
  blend=.18+.24*w;heat=.08;break;
 }
 case 'abathur':{
  for(const [sx,sy,rx,ry] of ctx.sacs){const q=((x-sx+.055*w)/rx)**2+((y-sy+.055*n)/ry)**2;volume+=(1-smooth(.2,1.65,q))*(.55+.26*n)+.26*Math.exp(-q*4);}
  blend=.43;heat=.06;break;
 }
 case 'dehaka':volume=gauss(x+.22*w,y,.94,.66)*(.28+.8*grain*grain);blend=.35;heat=.1;break;
 case 'cerberus':{
  const seam=x-.51-.11*Math.sin(y*5)-.07*w;
  const leak=gauss(seam,y-.16+.07*n,.14,.35),intrusion=gauss(x-.65+.12*w,y-.36,.2,.22);
  volume=1.25*(leak*(.6+1.05*Math.abs(n))+.36*intrusion);structure=leak;
  blend=.12+.28*smooth(-.1,.6,w);heat=.05;coherence=.2;break;
 }
 case 'mecha':{
  const left=gauss(x+.37+.065*w,y-.09+.07*n,.25,.24),right=gauss(x-.33+.06*n,y+.14+.05*w,.27,.31);
  const transfer=gauss(y+.12*Math.sin(3*x+w),0,.13,1)*gauss(x,0,.62,1);
  structure=(.7*left+right)*(.67+.33*smooth(-.4,.5,n));
  volume=.91*structure+.21*transfer;
  blend=.7-.53*smooth(.18,.8,structure);heat=.05*smooth(.2,.9,structure);coherence=.66;break;
 }
 case 'arcade':{
  const pixel=softPane(ctx,x*18,y*13,770);structure=pixel.interior*pixel.power;
  volume=(.44+.9*structure)*(1-smooth(.7,1.2,Math.abs(y)));
  blend=.15+.75*smooth(.2,.8,noise(x*3,y*2,ctx.seed+800));heat=.08;coherence=.97;break;
 }
 case 'classic-terran':{
  const phosphor=hash(Math.floor(x*53),Math.floor(y*41),ctx.seed+900);
  structure=smooth(.25,.95,phosphor);
  volume=(.52+.5*structure+.13*Math.sin(63*y)**2)*(1-smooth(.66,1.2,Math.abs(y)));
  blend=.23;heat=.08;coherence=.95;break;
 }
 case 'classic-protoss':volume=gauss(x+.12*n,y,.68,.67)*(.67+.32*Math.cos(3*angle+w))+.44*gauss(x,y,.24,.3);blend=.25+.4*smooth(-.3,.6,w);heat=.17;break;
 case 'classic-zerg':volume=gauss(x+.19*n,y+.18*w,.8,.7)*(.35+.75*(1-Math.abs(w*1.8))**2)+.3*gauss(x-.4*y,y,.3,.76);blend=.28;heat=.08;break;
 default:throw Error('Missing material field: '+id);
 }
 return {volume:Math.max(0,volume),blend:clamp(blend),heat,coherence,structure};
}
// Returns straight-alpha sRGB bytes. x/y are pixel-center coordinates.
function sampleMaterial(material,layer,x,y,width=WIDTH,height=HEIGHT){
 if(!LAYERS.includes(layer))throw Error('Unknown material layer');
 const ctx=material.theme?material:createMaterial(material),px=(x/width-.5)*2.66,py=(y/height-.5)*2.52;
 const radius=ctx.surface?(Math.abs(px)**4+Math.abs(py)**4)**.25:Math.hypot(px,py),feather=1-smooth(.69,1.22,radius);
 if(feather<=0)return [0,0,0,0];
 const phase=layer==='field'?0:layer==='flow'?17:39;
 const n=fbm(px*3.1+phase,py*3.1-phase,ctx.seed),w=fbm(px*2.3-7+phase,py*2.3+11,ctx.seed+701);
 const d=density(ctx,px,py,n,w),grain=hash(Math.floor(x),Math.floor(y),ctx.seed+phase);
 let light=0,alpha=0,blend=d.blend;
 if(layer==='field'){
  light=d.volume*(.59+.3*n*(1-d.coherence));alpha=feather*clamp(light*.63);light=.68+light*.24;
 }else if(layer==='flow'){
  light=d.volume*(.48+.8*(smooth(-.42,.65,n)*(1-d.coherence)+.5*d.coherence))*(.72+.28*w*(1-d.coherence));
  alpha=feather*clamp(light*.88);light=.8+light*.27;
 }else{
  let particles=0;
  for(const particle of ctx.particles){const dx=px-particle.x,dy=(py-particle.y)/particle.stretch,r=particle.r;if(Math.abs(dx)>r*4||Math.abs(dy)>r*4)continue;const q=(dx*dx+dy*dy)/(r*r);particles+=Math.exp(-q*.5)*particle.power+Math.exp(-q*4)*particle.power*.7;}
  const inclusions=Math.max(0,n-.27)**2*d.volume*3.2*(1-d.coherence)+d.structure*d.coherence*.23;
  light=particles+inclusions;alpha=feather*clamp(light);blend=clamp(blend+.18);light=.95+light*.25;
 }
 // Subtle per-pixel grain shapes volume; it never creates a hard texture border.
 alpha*=.88+.12*grain;
 const white=clamp(d.heat+Math.max(0,light-1.05)*.3,0,.45);
 const color=ctx.energy.map((c,i)=>{const tint=c*(1-blend)+ctx.secondary[i]*blend;return Math.round(clamp((tint*(1-white)+255*white)*light,0,255));});
 const a=Math.round(clamp(alpha)*255);return a?[...color,a]:[0,0,0,0];
}
function rasterMaterial(theme,layer,{width=WIDTH,height=HEIGHT}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>WIDTH||height>HEIGHT)throw Error('Unsupported raster dimensions');
 const ctx=theme.theme?theme:createMaterial(theme),buffer=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const rgba=sampleMaterial(ctx,layer,x+.5,y+.5,width,height),offset=(y*width+x)*4;for(let c=0;c<4;c++)buffer[offset+c]=rgba[c];}
 return {data:buffer,width,height,channels:4,signature:ctx.signature};
}
function tokensCss(){return '/* Generated offline material textures. Authored companion art, not SC2 exports. */\n'+themes.map(p=>`:root[data-graphical-style="${p.id}"] .theme-vfx-layer:not([data-vfx-theme]),.theme-vfx-layer[data-vfx-theme="${p.id}"]{--vfx-field:url('/themes/vfx/${p.id}-field.png');--vfx-flow:url('/themes/vfx/${p.id}-flow.png');--vfx-nodes:url('/themes/vfx/${p.id}-nodes.png');--vfx-motion:${p.motion};--vfx-node-motion:${p.nodesMotion};--vfx-cycle:${p.cycle}s;--vfx-energy:${p.energy};--vfx-secondary:${p.secondary}}`).join('\n')+'\n';}
async function build(){
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
 sharp.concurrency(1);fs.mkdirSync(out,{recursive:true});const assets=[],materials=[];
 // Sequential production: one raw layer and one PNG encoder, no worker pool/GPU.
 for(const p of themes){
  const ctx=createMaterial(p);materials.push({id:p.id,label:p.label,intent:intents[p.id],motion:p.motion,nodesMotion:p.nodesMotion,cycle:p.cycle,composition:ctx.composition,compositionSignature:ctx.signature});
  for(const layer of LAYERS){
   const raster=rasterMaterial(ctx,layer),body=await sharp(raster.data,{raw:{width:raster.width,height:raster.height,channels:4}}).png({compressionLevel:6,adaptiveFiltering:false}).toBuffer();
   const file=p.id+'-'+layer+'.png';fs.writeFileSync(path.join(out,file),body);assets.push({theme:p.id,layer,file,format:'png',width:WIDTH,height:HEIGHT,sha256:crypto.createHash('sha256').update(body).digest('hex'),rgbaSha256:crypto.createHash('sha256').update(raster.data).digest('hex')});
  }
 }
 // Publish the asset map only after every PNG completed. Existing native art is untouched.
 fs.writeFileSync(path.join(out,'tokens.css'),tokensCss());
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({provenance:'Authored offline procedural raster materials; not native SC2 exports',generator:'Build-ThemeVfx.cjs',revision:3,dimensions:[WIDTH,HEIGHT],format:'png',alpha:'straight RGBA',runtime:'Cached PNG layers; CSS transform/opacity only; no runtime pixel generation',themes:materials,assets},null,2)+'\n');
 // Retire only the exact legacy files owned by this generator, after map replacement.
 for(const p of themes)for(const layer of LAYERS){const old=path.join(out,p.id+'-'+layer+'.svg');if(fs.existsSync(old))fs.unlinkSync(old);}
 console.log(JSON.stringify({success:true,themes:themes.length,pngAssets:assets.length,output:'wwwroot/themes/vfx'}));
}
if(require.main===module)build().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={themes,WIDTH,HEIGHT,LAYERS,intents,createMaterial,sampleMaterial,rasterMaterial,tokensCss,build};
