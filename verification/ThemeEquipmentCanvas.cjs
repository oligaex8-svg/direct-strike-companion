'use strict';
// Small logical SC2-inspired equipment. Offline CPU paint only; no live Canvas.
process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const P=require('./ThemeScenePrimitives.cjs'),{TAU,clamp,gradient:G,polygon:poly,rounded:round,ellipse:E,radial:R,glow,seeded,texture,metal}=P;
const PARTS={core:{width:128,height:48,columns:16,rows:9},utility:{width:128,height:32,columns:16,rows:9},relay:{width:64,height:24,columns:16,rows:9},socket:{width:48,height:48,columns:12,rows:12}};
const profiles={
 default:{family:'instrument',metal:'#597b92',light:'#b7d2e3',energy:'#75c8e7',objects:['dual instrument cooling impellers','frosted instrument duct','two recessed optical power lamps','brushed corner sockets']},
 terran:{family:'military',metal:'#596d61',light:'#c2c8ac',energy:'#7bcb9c',objects:['armoured ventilation fan and heat exchanger','deep ribbed air intake','green power relay and amber equipment lamp','bolted ventilated portrait clamps']},
 nova:{family:'covert',metal:'#3d617a',light:'#b2d8e8',energy:'#66dfff',objects:['rotating covert optical sensor and diagnostic lamps','polarized optical equipment bank','sequenced blue elite equipment lights','clean optical corner housings']},
 mira:{family:'salvage',metal:'#80646b',light:'#d0ae9b',energy:'#f2b172',objects:['mismatched salvage fans and weld','patched slanted exhaust grille','unequal salvaged lamp relay','riveted asymmetric salvage clamps']},
 machined:{family:'foundry',metal:'#62747a',light:'#bbc6c4',energy:'#ecb35d',objects:['meshing blower gears and heat sink','cast furnace heat exchanger','amber induction cartridges','cast steel thermal sockets']},
 tyrador:{family:'ceramic',metal:'#9b8eac',light:'#f0e6f2',energy:'#d2b4f1',objects:['paired polished equipment optics','pearlescent ceramic power bank','lavender elite status lamps','polished ceramic fittings']},
 mecha:{family:'synthetic',metal:'#7192a6',light:'#d2e4eb',energy:'#efb353',objects:['opposed synthetic servo actuators','articulated sliding shutter','amber and blue power gates','mechanical articulated corner clamps']},
 arcade:{family:'arcade',metal:'#785298',light:'#d9b9ee',energy:'#ac73f0',objects:['recessed pixel equipment terminal','RGB pixel cooling matrix','three square phosphor indicators','moulded purple cabinet sockets']},
 'classic-terran':{family:'retro-metal',metal:'#66745e',light:'#c1c8ad',energy:'#94ca86',objects:['coarse five-blade ventilation rotor','heavy four-slot grille','vintage recessed equipment bulbs','aged steel bolted corners']},
 fenix:{family:'purifier',metal:'#baa36d',light:'#fff0c3',energy:'#ffd076',objects:['ivory projector and rising hologram hexes','three amber matrix emitters','hexagonal Purifier power cells','ivory prism projector sockets']},
 protoss:{family:'khala',metal:'#a58b48',light:'#f2df97',energy:'#76dff1',objects:['curved psionic capacitor housing','unequal blue crystal conduits','split crystal power coupling','curved gold jewel sockets']},
 nerazim:{family:'void',metal:'#635372',light:'#c2aecf',energy:'#7de8bb',objects:['onyx void aperture and mint crescent','glaive-shaped phase coupler','paired recessed void gems','dark hooked gem sockets']},
 alarak:{family:'forged',metal:'#66505a',light:'#c0a6a5',energy:'#ef6851',objects:['obsidian plasma funnel','black blade heat vents','triangular crimson coupling','black blade portrait prongs']},
 ihanrii:{family:'mineral',metal:'#62837e',light:'#c6e6d4',energy:'#8ce2c1',objects:['mineral geode equipment aperture','subsurface mineral light valve','two unequal mineral power inserts','engraved stone corner sockets']},
 'classic-protoss':{family:'retro-khala',metal:'#a28b4a',light:'#f0dfa3',energy:'#84cee8',objects:['rounded psionic globe and gold claws','two rounded blue energy cells','single large psionic node','rounded gold glass corners']},
 zerg:{family:'chitin',metal:'#70523c',light:'#bb9270',energy:'#b187cb',objects:['breathing chitin gill bank','folding cuticle valve','unequal bioluminescent nerve nodes','wet curled chitin claws']},
 abathur:{family:'evolved',metal:'#65754c',light:'#b5c681',energy:'#b1dd69',objects:['unequal vesicle pumps and constricting neck','translucent mutation valve','recessed mutation gland','hooked green membrane sockets']},
 dehaka:{family:'primal',metal:'#646d54',light:'#b4ba8e',energy:'#d4be7c',objects:['primal breathing spiracles under hide','five unequal flexing hide scales','unpolished spore glands','asymmetric bony portrait horns']},
 cerberus:{family:'infested',metal:'#566c65',light:'#b0c4b5',energy:'#88d5a6',objects:['implanted fan with living tissue cuff','rigid coupling and fluid valve','contained green bio-fluid relay','metal clamps wrapped in living tissue']},
 'classic-zerg':{family:'muscle',metal:'#77513f',light:'#c19c79',energy:'#ce9c79',objects:['muscular spiracle and coarse ligaments','compressed branching flesh cuff','two coated ganglia','thick muscular corner hooks']}
};
const organic=new Set(['chitin','evolved','primal','infested','muscle']);
function cut(c,shape,draw){c.save();shape();c.clip();draw();c.restore();}
function shade(c,x,y,w,h,p){return G(c,x,y,0,h,[[0,p.light],[.08,p.metal],[.25,'#27333a'],[.7,'#101b23'],[.9,p.metal],[1,'#070c11']]);}
function screw(c,x,y,r=1.3){E(c,x,y,r,r,'#070e12');E(c,x-.2,y-.3,r*.77,r*.77,'#92a0a0');c.fillStyle='#263235';c.fillRect(x-r*.5,y-.2,r,.4);}
function housing(c,x,y,w,h,p,angle=0){
 c.save();c.translate(x+w/2,y+h/2);c.rotate(angle);glow(c,'#000c',3,()=>round(c,-w/2,-h/2,w,h,Math.min(4,h*.18),shade(c,-w/2,-h/2,w,h,p)));
 round(c,-w/2+2,-h/2+2,w-4,h-4,Math.min(3,h*.13),'#06111a');
 c.save();c.globalCompositeOperation='source-atop';texture(c,-w/2,-h/2,w,h,Math.round(x*17+y*23),Math.floor(w*h/22));c.restore();
 for(const sx of [-1,1])for(const sy of [-1,1])if(w>35&&h>21)screw(c,sx*(w/2-3),sy*(h/2-3),1);c.restore();
}
function lamp(c,x,y,r,color,level=1,square=false){
 if(square)round(c,x-r-1,y-r-1,r*2+2,r*2+2,1,'#0b1218');else E(c,x,y,r+1,r+1,'#0a1117');
 c.save();c.globalAlpha=.2+.8*level;glow(c,color,r*1.7,()=>{if(square)round(c,x-r,y-r,r*2,r*2,.5,color);else E(c,x,y,r,r,R(c,x-r*.3,y-r*.3,r*1.5,[[0,'#f0ffff'],[.25,color],[1,'#10212a']]));});c.restore();
}
function fan(c,x,y,r,t,p,blades=7,coarse=false){
 E(c,x,y,r+2,r+2,shade(c,x-r,y-r,r*2,r*2,p));E(c,x,y,r,r,'#040c10');
 cut(c,()=>E(c,x,y,r-1,r-1,null),()=>{
  E(c,x,y,r-1,r-1,R(c,x-r*.3,y-r*.3,r*1.7,[[0,'#3c5158'],[1,'#02090e']]));
  c.save();c.translate(x,y);c.rotate(t);
  for(let j=0;j<blades;j++){
   c.rotate(TAU/blades);c.beginPath();c.moveTo(r*.1,-r*.1);c.quadraticCurveTo(r*.8,-r*.25,r*.8,-r*.64);c.quadraticCurveTo(r*.05,-r*.92,-r*.04,-r*.18);c.closePath();c.fillStyle=G(c,-r,-r,r*1.5,r*1.5,[[0,p.light],[.32,p.metal],[1,'#172932']]);c.fill();
  }c.restore();E(c,x,y,r*.23,r*.23,shade(c,x-r*.2,y-r*.2,r*.4,r*.4,p));E(c,x-r*.05,y-r*.05,r*.055,r*.055,p.light);
  if(coarse){for(let a=-1;a<=1;a++){c.fillStyle='#17241c';c.fillRect(x-r,y+a*r*.5,r*2,1.8);}}
 });
}
function grille(c,x,y,w,h,t,p,count=9,slant=0){
 round(c,x-2,y-2,w+4,h+4,2,shade(c,x,y,w,h,p));round(c,x,y,w,h,1,'#050e12');
 cut(c,()=>round(c,x,y,w,h,1),()=>{
  const wave=.5+.5*Math.sin(t);c.fillStyle=G(c,x,y,w,h,[[0,'#0e2022'],[.4,p.metal],[1,'#172b29']]);c.fillRect(x,y,w,h);
  for(let i=0;i<count;i++){const xx=x+i*w/count;poly(c,[[xx,y-1],[xx+w/count*.42,y-1],[xx+w/count*.42+slant,y+h+1],[xx+slant,y+h+1]],shade(c,xx,y,w/count*.5,h,p));}
  c.fillStyle=G(c,x,y+h*.6,w,0,[[0,'#a5c3a000'],[wave*.7+.05,'#a5c3a035'],[1,'#a5c3a000']]);c.fillRect(x,y+h*.7,w,h*.25);
 });
}
function lens(c,x,y,r,t,p,oval=1){
 E(c,x,y,r+2,r*oval+2,shade(c,x-r,y-r,r*2,r*2,p));
 cut(c,()=>E(c,x,y,r,r*oval,null),()=>{
  E(c,x,y,r,r*oval,R(c,x-r*.3,y-r*.3,r*1.6,[[0,p.energy],[.35,'#204558'],[.7,'#0b1b2c'],[1,'#020a12']]));
  const px=x+Math.cos(t)*r*.43,py=y+Math.sin(t)*r*.43*oval;
  E(c,px,py,r*.62,r*.62*oval,R(c,px,py,r*.7,[[0,'#dfffff92'],[.25,p.energy+'6b'],[1,p.energy+'00']]));E(c,x+r*.15,y+r*.13,r*.2,r*.2*oval,'#03111b7f');
 });
}
function gear(c,x,y,r,t,p,teeth=10){
 c.save();c.translate(x,y);c.rotate(t);const points=[];for(let j=0;j<teeth*4;j++){const a=j/(teeth*4)*TAU,rr=j%4===1||j%4===2?r:r*.8;points.push([Math.cos(a)*rr,Math.sin(a)*rr]);}poly(c,points,shade(c,-r,-r,r*2,r*2,p));E(c,0,0,r*.43,r*.43,'#071016');E(c,0,0,r*.2,r*.2,p.metal);c.restore();
}
function hex(c,x,y,r,fill){poly(c,Array.from({length:6},(_,i)=>[x+Math.cos(i*TAU/6)*r,y+Math.sin(i*TAU/6)*r*.65]),fill);}
function holograms(c,w,h,t,p,mode){
 const baseY=h-6,count=mode==='relay'?3:mode==='utility'?3:7,span=w*(mode==='core'?.72:.68),step=span/(count-1),r=Math.min(7,w/(count+3));
 // Each visible hologram has a physical projector socket, not a floating patch.
 poly(c,[[w*.08,baseY+3],[w*.15,baseY-6],[w*.83,baseY-7],[w*.93,baseY+3]],G(c,0,baseY-6,w,9,[[0,p.light],[.2,p.metal],[.7,'#353224'],[1,'#a2874c']]));
 for(let i=0;i<count;i++){
  const x=w*.16+i*step,y=baseY-3,z=(.45+.55*(.5+.5*Math.sin(t-i*.7)))*(h*.44);
  E(c,x,y,r*.65,1.8,'#261f11');glow(c,p.energy,2,()=>E(c,x,y,r*.4,.7,p.energy));
  c.fillStyle=G(c,0,y-z,0,z,[[0,p.energy+'00'],[1,p.energy+'22']]);poly(c,[[x-r*.55,y-z],[x+r*.55,y-z],[x+r*.32,y],[x-r*.32,y]],c.fillStyle);
  c.save();c.globalAlpha=.55+.22*Math.sin(t-i*.7);hex(c,x,y-z,r,G(c,x-r,y-z-r,r*2,r*2,[[0,'#fff1ca'],[.35,p.energy],[1,'#aa773a']]));hex(c,x,y-z,r*.56,'#5c471c62');c.restore();
 }
}
function crystal(c,x,y,w,h,t,p,rounder=false){
 if(rounder){lens(c,x+w*.5,y+h*.5,Math.min(w*.48,h*.48),t,p,1);return;}
 const points=[[x,y+h*.7],[x+w*.27,y],[x+w*.75,y+h*.08],[x+w,y+h*.65],[x+w*.5,y+h]];
 poly(c,points,G(c,x,y,w,h,[[0,p.light],[.23,p.energy],[.5,'#173b49'],[.8,p.energy],[1,'#49634c']]));
 cut(c,()=>poly(c,points,null),()=>{const px=x+w*(.5+.34*Math.sin(t));c.fillStyle=G(c,px-w*.17,y,w*.34,h,[[0,'#efffff00'],[.5,'#efffff88'],[1,'#efffff00']]);c.fillRect(x,y,w,h);poly(c,[[x+w*.27,y],[x+w*.5,y+h],[x+w*.62,y+h*.12]],'#ffffff1f');});
}
function tissue(c,x,y,w,h,t,p,mode){
 const bend=mode==='muscle'?.8:mode==='primal'?.32:.53;
 const shell=()=>{c.beginPath();c.moveTo(x,y+h);c.bezierCurveTo(x-w*.04,y+h*.1,x+w*.21,y-h*bend*.13,x+w*.52,y+h*.13);c.bezierCurveTo(x+w*.83,y-h*.03,x+w*1.03,y+h*.35,x+w,y+h);c.closePath();};
 cut(c,shell,()=>{
  c.fillStyle=G(c,x,y,0,h,[[0,p.light],[.13,p.metal],[.4,'#30322b'],[.7,p.metal],[1,'#101915']]);c.fillRect(x-2,y-2,w+4,h+4);
  for(let i=0;i<7;i++){
   const u=.08+i*.138,xx=x+w*u,open=.3+.18*Math.sin(t-i*.8),yy=y+h*(.28+.08*Math.sin(i*1.8));
   c.beginPath();c.moveTo(xx,yy);c.bezierCurveTo(xx-w*.04,yy+h*.3,xx+w*.03,y+h*.9,xx+w*.08,y+h);c.lineTo(xx+w*.08+w*open*.04,y+h);c.bezierCurveTo(xx+w*.06,yy+h*.3,xx+w*.02,yy-h*.03,xx,yy);c.closePath();c.fillStyle=G(c,xx,yy,w*.08,h*.7,[[0,'#101719'],[.6,p.energy+'66'],[1,'#070e13']]);c.fill();
  }
  texture(c,x,y,w,h,139,150);
 });
}
function vesicle(c,x,y,w,h,t,p){
 const shape=()=>{c.beginPath();c.moveTo(x,y+h*.6);c.bezierCurveTo(x+w*.05,y-h*.2,x+w*.85,y-h*.1,x+w,y+h*.6);c.bezierCurveTo(x+w*.7,y+h*1.1,x+w*.15,y+h*1.1,x,y+h*.6);c.closePath();};
 cut(c,shape,()=>{
  c.fillStyle=R(c,x+w*.42,y+h*.3,w*.65,[[0,p.energy],[.45,p.metal],[.78,'#26342b'],[1,'#111d22']]);c.fillRect(x,y,w,h);
  const px=x+w*(.5+.18*Math.cos(t)),py=y+h*(.55+.14*Math.sin(t));E(c,px,py,w*.12,h*.21,p.energy+'8a',.4);
  c.beginPath();c.moveTo(x,y+h*.6);c.bezierCurveTo(x+w*.22,y+h*.3,x+w*.4,y+h*.99,x+w,y+h*.54);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.closePath();c.fillStyle=G(c,x,y+h*.3,w,h*.7,[[0,'#19252e50'],[.7,'#13221ec9'],[1,'#071112']]);c.fill();texture(c,x,y,w,h,74,80);
 });
}
function plates(c,x,y,w,h,t,p){
 const widths=[.26,.18,.25,.2,.22];let start=x;
 for(let i=0;i<widths.length;i++){
  const rw=w*widths[i],lift=Math.sin(t-i*.7)*1.2;
  poly(c,[[start,y+h],[start+rw*.1,y+h*.35+lift],[start+rw*.67,y+h*(.05+.1*(i%2))+lift],[start+rw*.74,y+h*.43],[start+rw,y+h*.32],[start+rw*1.14,y+h]],G(c,start,y,0,h,[[0,p.light],[.18,p.metal],[.45,'#35463d'],[1,'#172725']]));texture(c,start,y,rw,h,i*79,30);start+=rw*.78;
 }
}
function piston(c,x,y,w,h,t,p){
 round(c,x,y,w,h,3,shade(c,x,y,w,h,p));round(c,x+3,y+3,w-6,h-6,2,'#07131d');
 const travel=(.5+.5*Math.sin(t))*w*.28;
 c.fillStyle=G(c,x,y,0,h,[[0,'#d3e8ec'],[.3,'#4f7489'],[.6,'#172b3c'],[1,'#bed0cf']]);c.fillRect(x+w*.17+travel,y+h*.32,w*.58-travel,h*.28);
 round(c,x+w*.08+travel,y+2,w*.19,h-4,2,p.metal);c.fillStyle=p.energy;c.fillRect(x+3,y+h*.35,2,h*.3);
}
function pixels(c,x,y,w,h,t,p,rows=3){
 round(c,x,y,w,h,2,shade(c,x,y,w,h,p));round(c,x+2,y+2,w-4,h-4,1,'#080c1c');
 const gap=Math.min(5,(h-6)/(rows+1));
 for(let a=0;a<8;a++)for(let b=0;b<rows;b++){
  const bright=.4+.3*(.5+.5*Math.sin(t-a*.6+b*.9)),xx=x+5+a*(w-10)/8,yy=y+4+b*gap;
  c.fillStyle=b%2?'#75dfdc':'#be8bec';c.globalAlpha=bright;c.fillRect(xx,yy,Math.min(3,(w-14)/9),Math.max(1.4,gap*.55));
 }c.globalAlpha=1;
}
function muscleValve(c,x,y,w,h,t,p){
 const cx=x+w*.5,cy=y+h*.56;
 E(c,cx,cy,w*.45,h*.45,G(c,x,y,w,h,[[0,p.light],[.15,p.metal],[.5,'#422c2a'],[1,'#1b171a']]));
 E(c,cx,cy,w*.25,h*(.16+.04*Math.sin(t)),'#0d1417');
 for(let i=0;i<3;i++){
  const a=i*TAU/3,open=.8+.12*Math.sin(t-i*TAU/3);c.save();c.translate(cx,cy);c.rotate(a);
  c.beginPath();c.moveTo(-w*.1,0);c.bezierCurveTo(-w*.12,-h*.5,w*.22,-h*.44,w*.18,-h*.08*open);c.quadraticCurveTo(w*.03,h*.06,-w*.1,0);c.closePath();c.fillStyle=G(c,0,-h*.4,0,h*.46,[[0,p.light],[.12,p.metal],[.6,'#503930'],[1,'#17191c']]);c.fill();c.restore();
 }texture(c,x,y,w,h,755,110);
}
function core(c,w,h,t,p,id){
 const f=p.family;
 if(f==='purifier'){holograms(c,w,h,t,p,'core');return;}
 if(f==='muscle'){muscleValve(c,6,5,w-12,h-9,t,p);return;}if(f==='chitin'){tissue(c,6,7,w-12,h-11,t,p,f);return;}
 if(f==='evolved'){vesicle(c,7,7,w*.56,h-12,t,p);vesicle(c,w*.62,15,w*.3,h-21,-t,p);poly(c,[[w*.51,h*.6],[w*.7,h*.46],[w*.74,h*.68],[w*.53,h*.79]],p.metal);return;}
 if(f==='primal'){plates(c,5,7,w-13,h-10,t,p);return;}
 if(f==='khala'||f==='retro-khala'){
  poly(c,[[7,h-5],[13,h*.42],[w*.35,h*.27],[w*.76,h*.3],[w-8,h-5]],shade(c,4,h*.3,w-8,h*.6,p));crystal(c,w*.3,4,w*.43,h*.76,t,p,f==='retro-khala');
  for(const s of [-1,1])E(c,w*.51+s*w*.19,h*.66,w*.045,h*.24,p.metal,s*.4);return;
 }
 if(f==='void'){
  poly(c,[[4,h-4],[16,h*.27],[w*.42,h*.41],[w*.84,h*.13],[w-5,h-4]],shade(c,5,3,w-10,h-6,p));lens(c,w*.56,h*.48,h*.32,t,p,.66);E(c,w*.6+Math.cos(t)*5,h*.48+Math.sin(t)*3,8,2,p.energy+'9c',-.4);return;
 }
 if(f==='forged'){
  poly(c,[[4,h-5],[14,8],[w-18,13],[w-3,h-6]],shade(c,4,4,w-8,h-8,p));
  for(let i=0;i<4;i++){const x=20+i*23,y=15+Math.sin(t-i)*2;poly(c,[[x,h-8],[x+5,y],[x+15,y+5],[x+9,h-8]],G(c,x,y,14,h-y,[[0,'#350f19'],[.4,p.energy],[1,'#5e1925']]));}
  return;
 }
 if(f==='mineral'){for(let i=0;i<3;i++)crystal(c,6+i*38,7+(i%2)*5,43,h-12-(i%2)*5,t+i,p);return;}
 if(f==='arcade'){housing(c,5,6,w-10,h-11,p);pixels(c,12,11,w-24,h-22,t,p,4);return;}
 if(f==='covert'||f==='ceramic'){
  housing(c,5,9,w-10,h-14,p);lens(c,f==='covert'?38:37,h*.52,h*.33,t,p);if(f==='ceramic')lens(c,86,h*.52,h*.27,-t,p);
  else for(let i=0;i<3;i++){const age=((t/TAU*3+i/3)%1+1)%1,level=age<.28?Math.min(1,age/.035,(.28-age)/.035):.08;lamp(c,77+i*15,h*.53,2.6,p.energy,level);}
  return;
 }
 if(f==='synthetic'){housing(c,4,7,w-8,h-12,p);piston(c,9,11,49,26,t,p);piston(c,67,11,51,26,-t,p);return;}
 if(f==='foundry'){
  housing(c,4,6,w-8,h-11,p);gear(c,33,24,16,t*4,p,10);gear(c,60,25,12,-t*4*10/8,p,8);grille(c,81,13,32,25,t,p,6,0);return;
 }
 if(f==='salvage'){
  housing(c,4,8,65,h-13,p,-.045);housing(c,69,11,53,h-15,{...p,metal:'#8a7250'},.05);fan(c,34,25,14,t*4,p,6);fan(c,93,27,11,-t*3,p,5);for(let i=0;i<4;i++)lamp(c,67,13+i*6,.8,p.energy,.65+.1*Math.sin(t-i));return;
 }
 if(f==='infested'){
  housing(c,25,8,w-31,h-13,p);fan(c,78,25,15,t*3,p,6);tissue(c,3,7,51,h-10,t,p,'chitin');lamp(c,113,26,2.1,p.energy,.7);return;
 }
 if(f==='retro-metal'){
  housing(c,5,7,w-10,h-13,p);fan(c,43,24,16,t*3,p,5,true);grille(c,71,14,39,21,t,p,4);return;
 }
 housing(c,5,7,w-10,h-13,p);fan(c,33,24,15,t*(f==='instrument'?2:4),p,7);grille(c,60,13,52,24,t,p,f==='instrument'?7:9,2);
}
function utility(c,w,h,t,p,id){
 const f=p.family;
 if(f==='purifier'){holograms(c,w,h,t,p,'utility');return;}
 if(f==='muscle'){muscleValve(c,5,2,w-10,h-4,t,p);return;}if(f==='chitin'){tissue(c,4,3,w-8,h-6,t,p,f);return;}
 if(f==='evolved'){vesicle(c,5,2,w*.75,h-4,t,p);return;}
 if(f==='primal'){plates(c,4,3,w-8,h-6,t,p);return;}
 if(f==='infested'){housing(c,28,5,w-34,h-10,p);tissue(c,3,3,42,h-5,t,p,'muscle');round(c,55,10,54,12,2,G(c,55,10,54,0,[[0,p.energy+'41'],[.5,p.energy],[1,'#182d21']]));return;}
 if(f==='synthetic'){housing(c,4,4,w-8,h-8,p);for(let i=0;i<5;i++){const x=12+i*20+Math.sin(t)*5;poly(c,[[x,7],[x+13,7],[x+5,h-7],[x-8,h-7]],shade(c,x,7,15,h-14,p));}return;}
 if(f==='arcade'){pixels(c,5,4,w-10,h-8,t,p,3);return;}
 if(['khala','retro-khala','void','mineral','forged'].includes(f)){
  const count=f==='retro-khala'?2:f==='void'?2:3;
  poly(c,[[4,h-4],[9,h*.38],[w-10,h*.38],[w-4,h-4]],shade(c,4,7,w-8,h-10,p));
  for(let i=0;i<count;i++){
   const x=9+i*(w-18)/count,rw=(w-20)/count-6;
   if(f==='void')lens(c,x+rw*.5,h*.51,Math.min(rw*.4,h*.31),t+i,p,.55);else crystal(c,x,3+(i%2)*2,rw,h-8-(i%2)*3,t+i,p,f==='retro-khala');
  }return;
 }
 if(f==='covert'||f==='ceramic'){
  housing(c,4,4,w-8,h-8,p);for(let i=0;i<3;i++){lens(c,25+i*33,h*.5,8.5,t+i,p,.64);lamp(c,39+i*33,10,1.3,p.energy,f==='covert'?(.2+.8*(.5+.5*Math.cos(t*3-i*1.4))):.7);}return;
 }
 grille(c,7,6,w-14,h-12,t,p,f==='retro-metal'?5:f==='foundry'?11:9,f==='salvage'?6:0);
}
function relay(c,w,h,t,p,id){
 const f=p.family;
 if(f==='purifier'){holograms(c,w,h,t,p,'relay');return;}
 if(organic.has(f)){
  if(f==='primal'){plates(c,3,3,w-6,h-6,t,p);return;}
  if(f==='evolved'){vesicle(c,3,3,w-6,h-6,t,p);return;}
  if(f==='infested'){housing(c,3,3,w-6,h-6,p);round(c,10,8,w-20,h-13,2,G(c,10,8,w-20,0,[[0,'#152a21'],[.5,p.energy],[1,'#274b34']]));tissue(c,1,5,19,h-6,t,p,'muscle');return;}
  if(f==='muscle'){vesicle(c,4,4,w*.43,h-8,t,p);vesicle(c,w*.54,6,w*.35,h-11,-t,p);return;}tissue(c,3,4,w-6,h-7,t,p,f);return;
 }
 if(['khala','void','forged','mineral','retro-khala'].includes(f)){
  poly(c,[[3,h-3],[7,5],[w-7,5],[w-3,h-3]],shade(c,3,3,w-6,h-6,p));
  if(f==='retro-khala')lens(c,w*.52,h*.5,7,t,p,.65);else for(let i=0;i<2;i++)crystal(c,10+i*25,4,19,h-8,t+i,p);return;
 }
 housing(c,2,3,w-4,h-6,p);
 const count=f==='instrument'?2:3;
 for(let i=0;i<count;i++){
  const x=w*(count===2?.32+i*.36:.25+i*.25);let level=.7;
  if(f==='covert'||f==='ceramic'){
   const age=((t/TAU*3+i/3)%1+1)%1;level=age<.3?Math.min(1,age/.04,(.3-age)/.04):.07;
  }else if(f==='salvage')level=.58+.15*Math.sin(t-i*1.3);else if(f==='synthetic')level=.5+.25*Math.sin(t-i*1.1);else if(f==='arcade')level=.45+.45*(.5+.5*Math.sin(t*2-i*1.7));else if(f==='foundry')level=.55+.22*Math.sin(t*2-i*1.2);else level=.6+.2*Math.sin(t-i*1.1);
  const color=f==='synthetic'&&i===2?'#86cbe7':f==='retro-metal'&&i===2?'#d4b36c':p.energy;lamp(c,x,h*.52,2.2,color,level,f==='arcade'||f==='synthetic');
 }
}
function socket(c,w,h,t,p,id){
 const f=p.family;
 // Four physically shaded corner fittings; the central portrait stays clear.
 for(let i=0;i<4;i++){
  c.save();c.translate(w*.5,h*.5);c.rotate(i*Math.PI/2);c.translate(-w*.5,-h*.5);
  if(organic.has(f)){
   c.beginPath();c.moveTo(2,16);c.bezierCurveTo(0,5,2,1,15,2);c.lineTo(11,5);c.bezierCurveTo(5,4,4,8,5,13);c.closePath();c.fillStyle=G(c,1,1,13,13,[[0,p.light],[.2,p.metal],[.55,'#26312b'],[1,p.metal]]);c.fill();
   if(f==='primal'){const flex=.45*Math.sin(t-i*.8);poly(c,[[2,12],[1,3],[11+flex,1],[7+flex,5],[5,6]],p.light+'a8');}
   else E(c,4+.4*Math.cos(t-i*.7),4+.35*Math.sin(t-i*.7),1.25,1.25,p.energy+'bd');
   if(f==='infested'){poly(c,[[1,14],[1,2],[13,1],[12,3],[3,4],[3,14]],shade(c,1,1,12,12,p));screw(c,4,4,1.1);}
  }else if(['purifier','khala','void','forged','mineral','retro-khala'].includes(f)){
   poly(c,[[1,15],[1,3],[4,1],[15,1],[10,4],[5,5],[4,10]],G(c,1,1,14,14,[[0,p.light],[.25,p.metal],[.7,'#2c2b29'],[1,p.metal]]));
   if(f==='purifier')hex(c,5,5,2+.3*Math.sin(t-i*.8),p.energy);else if(f==='forged')poly(c,[[3,3],[8,3],[3,8]],G(c,3,3,5,5,[[0,p.energy],[.5+.2*Math.sin(t-i),'#ffd5b2'],[1,'#8b2930']]));else E(c,4.7+.35*Math.cos(t-i),4.7+.35*Math.sin(t-i),1.5,1.5,p.energy+'bd');
  }else{
   poly(c,[[1,15],[1,3],[3,1],[15,1],[14,4],[5,5],[4,14]],shade(c,1,1,14,14,p));screw(c,4.1,4.1,1.1);
   const blink=f==='covert'||f==='ceramic'?(.15+.85*Math.max(0,Math.sin(t*3-i*Math.PI/2))):.7;
   if(['military','instrument','foundry','salvage','retro-metal'].includes(f)){E(c,9,2.8,1.55,1.55,'#071117');c.save();c.translate(9,2.8);c.rotate(t*(f==='foundry'?3:2));for(let j=0;j<3;j++){c.rotate(TAU/3);poly(c,[[0,0],[.4,-1.3],[1.25,-.4],[.35,.3]],p.light);}c.restore();}else if(f==='synthetic'){c.fillStyle=p.energy;c.fillRect(7.5+.65*Math.sin(t-i),2,2.2,1.7);}else lamp(c,9,2.8,.8,p.energy,f==='arcade'?.45+.45*(.5+.5*Math.sin(t*2-i)):blink,f==='arcade');
  }c.restore();
 }
}
function render(id,part,phase){
 const p=profiles[id],g=PARTS[part];if(!p||!g)throw Error('Unknown equipment '+id+'/'+part);
 const big=createCanvas(g.width*2,g.height*2),c=big.getContext('2d');c.scale(2,2);
 const t=phase*TAU;({core,utility,relay,socket})[part](c,g.width,g.height,t,p,id);
 c.save();c.globalCompositeOperation='source-atop';texture(c,0,0,g.width,g.height,id.length*47+part.length*79,Math.floor(g.width*g.height/17));c.restore();
 const small=createCanvas(g.width,g.height),target=small.getContext('2d');target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';target.drawImage(big,0,0,g.width,g.height);
 const pixels=target.getImageData(0,0,g.width,g.height).data;
 for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
  const i=(y*g.width+x)*4;if(!x||!y||x===g.width-1||y===g.height-1||(part==='socket'&&x>=7&&x<g.width-7&&y>=7&&y<g.height-7)){pixels[i]=pixels[i+1]=pixels[i+2]=pixels[i+3]=0;}
 }
 return {data:Buffer.from(pixels),width:g.width,height:g.height,channels:4};
}
module.exports={profiles,PARTS,render};
