'use strict';
// Bespoke console inlays. These are authored companion graphics, not game exports.
const P=require('./ThemeScenePrimitives.cjs');
const {TAU,clamp,gradient:G,polygon:poly,rounded:round,ellipse:E,radial:R,glow,seeded,texture,metal,base,surface,raw}=P;
const descriptions={
 default:['frosted instrument glass','subsurface granular refraction'],fenix:['three unequal joined Purifier holographic facets','continuous white-gold refraction across overlapping planes'],protoss:['Khala crystal in a curved gold setting','opposing refracted caustics'],nerazim:['Nerazim glaive and deep void lens','continuous mint reflection under twisting violet glass'],alarak:['Tal’darim black blades around a plasma wedge','inward folded crimson circulation'],ihanrii:['one asymmetric Ihan-rii mineral and glass body','unequal optical planes shear below the fixed bevel'],terran:['ribbed equipment heat exchanger','continuous thermal flow behind fixed steel ribs'],nova:['covert optical sensor and baffled housing','polarized lens rotation'],mira:['two mismatched salvage plates and a welded joint','molten seam flow and two grounded sparks'],machined:['shielded foundry furnace','counter-rotating convection behind an occluding lip'],tyrador:['bevelled ceramic armor and violet glass','broad pearl reflection over the bevel'],mecha:['twin synthetic chambers and a rigid shutter','continuous mechanical exposure of warm and cold interiors'],arcade:['purple cabinet with a recessed pixel volume','constant-density rotating voxel assembly'],'classic-terran':['coarse steel grille and fan rotor','rotating shadow behind fixed ribs'],'classic-protoss':['rounded energy lens in chunky gold housing','slow broad liquid psionic wave']};
// The native console supplies the seat. Do not invent miniature display stands.
function dock(c,w,h,k){return k==='header'?h:h-9;}
function clipped(c,path,draw){c.save();path();c.clip();draw();c.restore();}
function ripple(c,x,y,rx,ry,t,color,phase=0){
 c.save();c.translate(x,y);c.scale(rx,ry);c.beginPath();c.moveTo(-1,.15);
 for(let i=0;i<=32;i++){const u=i/16-1,v=.24*Math.sin(u*3.4+t+phase)+.1*Math.cos(u*7-t*2);c.lineTo(u,v);}
 c.lineTo(1,1);c.lineTo(-1,1);c.closePath();c.fillStyle=color;c.fill();c.restore();
}
function frosted(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.12,y],[w*.12,y-13],[w*.2,y-19],[w*.87,y-19],[w*.91,y-8],[w*.91,y]],[[0,'#43627b'],[.2,'#101f2a'],[.9,'#152633'],[1,'#080f16']]);
 const x=w*.19,y=b-17,rw=w*.65,rh=14;
 round(c,x,y,rw,rh,3,'#112a3a');clipped(c,()=>round(c,x,y,rw,rh,3),()=>{
  for(let i=0;i<18;i++){const px=x+rw*i/17,py=y+rh*.55+Math.sin(i*.7+t)*rh*.15;E(c,px,py,rw/13,rh*.54,R(c,px,py,rw/13,[[0,'#75c8ed31'],[1,'#3679a200']]));}
  texture(c,x,y,rw,rh,19,180);
 });
}
function purifier(c,w,h,k,t){
 const b=dock(c,w,h,k),rh=k==='header'?43:85;
 const planes=[[[w*.13,b-2],[w*.25,b-rh*.6],[w*.49,b-rh*.45],[w*.43,b]],[[w*.37,b],[w*.46,b-rh],[w*.73,b-rh*.79],[w*.66,b]],[[w*.64,b],[w*.71,b-rh*.69],[w*.88,b-rh*.42],[w*.83,b]]];
 for(let j=0;j<planes.length;j++){
  const points=planes[j],shape=()=>poly(c,points,null);
  clipped(c,shape,()=>{
   c.fillStyle=G(c,w*.2,b-rh,w*.6,rh,[[0,'#ffe2a67d'],[.25,'#8e642144'],[.55,'#f8b94780'],[.82,'#9668275c'],[1,'#ffdf9e8c']]);c.fillRect(0,b-rh,w,rh);
   const px=w*(.45+.29*Math.sin(t+j*.62));
   const light=G(c,px-w*.18,b-rh,w*.36,rh,[[0,'#fff2c500'],[.34,'#ffe5aa19'],[.5,'#fff2cfa6'],[.69,'#ffd66e24'],[1,'#ffd66e00']]);
   c.fillStyle=light;c.fillRect(0,b-rh,w,rh);
   // Broad internal caustics follow each joined plane, with a stable body.
   ripple(c,w*(.3+j*.2),b-rh*.32,w*.24,rh*.46,t+j,'#ffe8b527',j*.8);
  });
  const [a,d]=[points[0],points[1]];
  poly(c,[a,d,[d[0]+2,d[1]+2],[a[0]+2,a[1]]],'#fff0c1a3');
  poly(c,[[points[3][0],b],[points[2][0],points[2][1]],[points[2][0]+3,points[2][1]+3],[points[3][0]+3,b]],'#a7793260');
 }
}
function khala(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.13,y],[w*.18,y-11],[w*.38,y-17],[w*.67,y-17],[w*.85,y-7],[w*.9,y]],[[0,'#e8d595'],[.18,'#8e7842'],[.55,'#242b2b'],[1,'#6b5630']]);
 const x=w*.5,y=b-(k==='header'?24:43),rx=w*.28,ry=k==='header'?20:34;
 const lens=()=>{c.beginPath();c.moveTo(x-rx,y+ry*.35);c.bezierCurveTo(x-rx*.8,y-ry,x+rx*.5,y-ry*1.2,x+rx,y+ry*.15);c.quadraticCurveTo(x,y+ry*.9,x-rx,y+ry*.35);c.closePath();};
 c.save();lens();c.fillStyle=G(c,x-rx,y-ry,rx*2,ry*2,[[0,'#0a283e'],[.47,'#154d6d'],[.7,'#7adff486'],[1,'#112b47']]);c.fill();c.restore();
 clipped(c,lens,()=>{ripple(c,x,y,rx,ry,t,'#65e7ff55');ripple(c,x,y-ry*.2,rx,ry*.75,-t,'#d3f8ff3c',2);E(c,x+Math.sin(t)*rx*.42,y+Math.cos(t)*ry*.3,rx*.2,ry*.5,R(c,x+Math.sin(t)*rx*.42,y,rx*.28,[[0,'#b3f4ff65'],[1,'#73cfe900']]));});
 poly(c,[[x-rx,y+ry*.35],[x-rx*.6,y+ry*.7],[x,y+ry*.93],[x+rx*.73,y+ry*.57],[x+rx,y+ry*.15],[x+rx*.6,y+ry*.4],[x,y+ry*.65],[x-rx*.62,y+ry*.5]],'#a2894b');
}
function voidGlass(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.07,y],[w*.19,y-8],[w*.31,y-21],[w*.46,y-15],[w*.82,y-11],[w*.94,y]],[[0,'#71637f'],[.22,'#27232f'],[.75,'#0e111b'],[1,'#393044']]);
 const x=w*.55,y=b-(k==='header'?26:46),rx=w*.3,ry=k==='header'?22:37;
 const lens=()=>E(c,x,y,rx,ry,null,-.06);lens();c.fillStyle=R(c,x+rx*.2,y,rx,[[0,'#101221'],[.5,'#261d3b'],[1,'#070a11']]);c.fill();
 clipped(c,lens,()=>{
  for(let j=0;j<4;j++){c.beginPath();c.moveTo(x-rx*1.1,y+ry*.55);c.bezierCurveTo(x-rx*.3,y-ry*(.4+.3*Math.sin(t+j)),x+rx*.1,y+ry*Math.cos(t+j),x+rx*1.15,y-ry*.5);c.bezierCurveTo(x+rx*.1,y+ry*.4,x-rx*.4,y+ry*.75,x-rx*1.1,y+ry*.55);c.closePath();c.fillStyle=G(c,x-rx,y,rx*2,ry,[[0,'#3c215a00'],[.5,`rgba(137,89,190,${.12+j*.05})`],[1,'#38225300']]);c.fill();}
  const a=t,px=x+Math.cos(a)*rx*.56,py=y+Math.sin(a)*ry*.43;
  c.save();c.translate(px,py);c.rotate(a+.7);E(c,0,0,rx*.22,ry*.18,'#82ebcc8c');E(c,rx*.1,-ry*.07,rx*.22,ry*.19,'#1a1930');c.restore();
 });
 poly(c,[[x-rx*.98,y+ry*.45],[x-rx*.84,y-ry*.5],[x-rx*.65,y-ry*.85],[x-rx*.74,y+ry*.25],[x-rx*.42,y+ry*.75]],'#574363');
}
function forged(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.09,y],[w*.17,y-6],[w*.27,y-17],[w*.74,y-14],[w*.91,y]],[[0,'#7d6a70'],[.18,'#28202b'],[.6,'#120e17'],[1,'#514048']]);
 const x=w*.2,y=b-7,rw=w*.65,rh=k==='header'?38:72;
 const wedge=()=>poly(c,[[x,y],[x+rw*.1,y-rh],[x+rw*.92,y-rh*.56],[x+rw,y-rh*.15],[x+rw*.68,y]],null);
 clipped(c,wedge,()=>{c.fillStyle=G(c,x,y-rh,rw,rh,[[0,'#2a0a14'],[.4,'#8f1325'],[1,'#ec4935']]);c.fillRect(x,y-rh,rw,rh);
  for(let i=0;i<7;i++){const yy=y-rh+i*rh/6;const bend=Math.sin(t+i*.8)*rh*.26;c.beginPath();c.moveTo(x-rw*.1,yy);c.bezierCurveTo(x+rw*.4,yy+bend,x+rw*.4,y-rh*.2,x+rw,yy+rh*.3);c.lineTo(x+rw,yy+rh*.5);c.bezierCurveTo(x+rw*.4,y-rh*.1,x+rw*.4,yy+bend+rh*.14,x-rw*.1,yy+rh*.14);c.closePath();c.fillStyle=i%2?'#ff704247':'#33081890';c.fill();}
 });
 poly(c,[[x-rw*.025,y],[x+rw*.03,y-rh*1.08],[x+rw*.15,y-rh*.78],[x+rw*.12,y-rh*.12]],metal(c,x,y-rh,rw*.2,rh,'#55434e'));
 poly(c,[[x+rw*.88,y-rh*.64],[x+rw*1.08,y-rh*.15],[x+rw*.98,y+3],[x+rw*.75,y],[x+rw*.96,y-rh*.17]],'#201722');
}
function mineral(c,w,h,k,t){
 const b=dock(c,w,h,k),rh=k==='header'?40:83,x=w*.15,rw=w*.73;
 const shape=()=>poly(c,[[x,b],[x+rw*.13,b-rh*.63],[x+rw*.39,b-rh],[x+rw*.79,b-rh*.75],[x+rw,b-rh*.23],[x+rw*.91,b]],null);
 clipped(c,shape,()=>{
  c.fillStyle=G(c,x,b-rh,rw,rh,[[0,'#aac2bb'],[.18,'#4f7c7d'],[.4,'#1f4449'],[.7,'#365f63'],[1,'#8ab7a4']]);c.fillRect(x,b-rh,rw,rh);
  const shear=Math.sin(t)*rw*.025;
  poly(c,[[x+rw*.14,b],[x+rw*.35+shear,b-rh],[x+rw*.55+shear,b-rh],[x+rw*.42,b]],'#8edacb29');
  poly(c,[[x+rw*.43,b],[x+rw*.62-shear,b-rh],[x+rw*.86,b-rh*.77],[x+rw*.69,b]],'#061d2e4f');
  poly(c,[[x+rw*.72,b],[x+rw*.83+shear,b-rh*.68],[x+rw,b-rh*.17],[x+rw*.92,b]],'#c8e9da32');
  const px=x+rw*(.5+.3*Math.sin(t));c.fillStyle=G(c,px-rw*.12,b-rh,rw*.24,rh,[[0,'#d3fff000'],[.5,'#c7f9e857'],[1,'#d3fff000']]);c.fillRect(x,b-rh,rw,rh);
  texture(c,x,b-rh,rw,rh,514,180);
 });
 // An asymmetrical rough inward lip, without repeated plaques or chevrons.
 poly(c,[[x,b],[x+rw*.13,b-rh*.63],[x+rw*.39,b-rh],[x+rw*.37,b-rh*.91],[x+rw*.16,b-rh*.52],[x+5,b]],'#bad4c18f');
}
function exchanger(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.09,y],[w*.09,y-9],[w*.16,y-21],[w*.87,y-21],[w*.94,y-10],[w*.94,y]],[[0,'#91a69a'],[.15,'#45584e'],[.42,'#1b2b29'],[1,'#0b1618']]);
 const x=w*.17,y=b-(k==='header'?37:70),rw=w*.68,rh=k==='header'?29:58;
 round(c,x-4,y-4,rw+8,rh+8,3,'#0a1215');
 clipped(c,()=>round(c,x,y,rw,rh,2),()=>{
  c.fillStyle=G(c,x,y,0,rh,[[0,'#101e1b'],[.5,'#536647'],[1,'#c58a3a']]);c.fillRect(x,y,rw,rh);
  for(let i=0;i<4;i++){const px=x+rw*(.1+i*.27)+Math.sin(t+i)*rw*.04;E(c,px,y+rh*.7,rw*.17,rh*.7,R(c,px,y+rh*.7,rw*.19,[[0,'#f0b7504b'],[1,'#1c291600']]));}
  for(let i=0;i<12;i++){const xx=x+i*rw/11;poly(c,[[xx-3,y-3],[xx+4,y-3],[xx+rw*.04,y+rh+3],[xx-3+rw*.04,y+rh+3]],metal(c,xx,y,7,rh,'#53665b'));}
 });
 const sx=x+rw*.03,sy=b-7;for(let i=0;i<5;i++){round(c,sx+i*7,sy,4,2,1,'#8ce8a4');}
}
function optical(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.12,y],[w*.14,y-8],[w*.32,y-13],[w*.79,y-13],[w*.9,y]],[[0,'#6b8798'],[.15,'#293b4b'],[.5,'#0a1a29'],[1,'#243b4b']]);
 const r=k==='header'?22:40,x=w*.62,y=b-r-7;
 round(c,w*.2,y+r*.2,w*.47,r*.7,3,metal(c,w*.2,y,w*.5,r,'#314b5d'));
 E(c,x,y,r+5,r+5,metal(c,x-r,y-r,r*2,r*2,'#4f6678'));E(c,x,y,r,r,'#050e1a');
 clipped(c,()=>E(c,x,y,r-2,r-2,null),()=>{
  E(c,x,y,r-2,r-2,R(c,x-r*.3,y-r*.2,r*1.5,[[0,'#245b82'],[.45,'#0c2946'],[1,'#040c19']]));
  const px=x+Math.cos(t)*r*.42,py=y+Math.sin(t)*r*.42;E(c,px,py,r*.65,r*.65,R(c,px,py,r*.65,[[0,'#a7f3ffbe'],[.2,'#51d4e875'],[1,'#277eb300']]));
  c.save();c.translate(x,y);c.rotate(-t*2);E(c,-r*.24,0,r*.18,r*.87,'#a9e9ff27');c.restore();E(c,x+r*.05,y+r*.1,r*.19,r*.19,'#00101b88');
 });
 for(let i=0;i<3;i++){poly(c,[[w*.23+i*8,y+r*.18],[w*.25+i*8,y+r*.18],[w*.27+i*8,y+r*.9],[w*.25+i*8,y+r*.9]],'#0e202c');}
}
function salvage(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.08,y],[w*.12,y-13],[w*.46,y-10],[w*.49,y-18],[w*.9,y-12],[w*.94,y]],[[0,'#8c7363'],[.2,'#433c3a'],[.6,'#201d23'],[1,'#5d4243']]);
 const x=w*.17,y=b-(k==='header'?36:73),rh=k==='header'?31:66;
 poly(c,[[x,y+rh],[x+4,y],[w*.48,y+4],[w*.49,y+rh]],metal(c,x,y,w*.32,rh,'#9a7558'));
 poly(c,[[w*.51,y+rh],[w*.52,y+2],[w*.85,y-3],[w*.89,y+rh]],metal(c,w*.51,y,w*.38,rh,'#735065'));
 for(let i=0;i<6;i++){const xx=w*.49+Math.sin(i*.9)*2,yy=y+i*rh/5;const warm=.5+.5*Math.sin(t-i*.8);glow(c,'#ff9b45',5,()=>E(c,xx,yy,2.8,4,G(c,xx,yy-3,0,6,[[0,'#ffe5b8'],[.3,`rgba(255,137,48,${.45+warm*.4})`],[1,'#a24327']])));}
 for(let i=0;i<2;i++){
  const u=((t/TAU+i*.5)%1+1)%1,life=Math.sin(Math.PI*u)**2,px=w*.5+u*w*.12,py=y+rh*.32+u*u*rh*.7;
  c.save();c.globalAlpha=life*.9;glow(c,'#ffb554',3,()=>E(c,px,py,1,2.2,'#ffe0a2',-.4));c.restore();
 }
 texture(c,x,y,w*.7,rh,765,170);for(const xx of [x+6,w*.84])for(const yy of [y+6,y+rh-5])E(c,xx,yy,2,2,'#aaa294');
}
function foundry(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.1,y],[w*.14,y-16],[w*.26,y-22],[w*.78,y-20],[w*.91,y]],[[0,'#9da8a6'],[.15,'#3e4d55'],[.48,'#17232b'],[1,'#617079']]);
 const x=w*.24,y=b-(k==='header'?37:77),rw=w*.51,rh=k==='header'?30:67;
 round(c,x-8,y-5,rw+16,rh+10,5,metal(c,x,y,rw,rh,'#6b7881'));round(c,x,y,rw,rh,3,'#1d100c');
 clipped(c,()=>round(c,x,y,rw,rh,3),()=>{
  c.fillStyle=G(c,x,y,0,rh,[[0,'#1a1214'],[.5,'#ad4f1e'],[1,'#f9b94d']]);c.fillRect(x,y,rw,rh);
  for(let j=0;j<2;j++)for(let i=0;i<12;i++){const a=t*(j? -1:1)+i/12*TAU,px=x+rw*(j?.72:.28)+Math.cos(a)*rw*.19,py=y+rh*.53+Math.sin(a)*rh*.4;E(c,px,py,rw*.12,rh*.18,R(c,px,py,rw*.12,[[0,'#ffe1a96b'],[1,'#b64b1700']]));}
 });
 poly(c,[[x-12,y-8],[x+rw+12,y-8],[x+rw+7,y+3],[x-7,y+3]],metal(c,x,y-8,rw,11,'#7a8a91'));for(let i=0;i<4;i++)round(c,x+rw*(.12+i*.24),y+rh-2,rw*.09,7,1,'#24323a');
}
function pearl(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.11,y],[w*.16,y-14],[w*.34,y-23],[w*.78,y-18],[w*.92,y]],[[0,'#d5ccdf'],[.12,'#817589'],[.28,'#3e384e'],[.8,'#242437'],[1,'#8c839c']]);
 const x=w*.17,y=b-(k==='header'?37:78),rw=w*.68,rh=k==='header'?31:69;
 const bevel=()=>poly(c,[[x,y+rh],[x+rw*.11,y],[x+rw*.8,y+rh*.07],[x+rw,y+rh*.74],[x+rw*.86,y+rh]],null);
 clipped(c,bevel,()=>{c.fillStyle=G(c,x,y,rw,rh,[[0,'#c6bfd9'],[.2,'#695c82'],[.4,'#211f36'],[.72,'#4c3c65'],[1,'#a8abc6']]);c.fillRect(x,y,rw,rh);
  const px=x+rw*(.5+.35*Math.sin(t));const sheen=G(c,px-rw*.3,y,rw*.6,rh,[[0,'#edf6ff00'],[.4,'#d8dcff1f'],[.5,'#eff9ff77'],[.7,'#bfcaff18'],[1,'#efdeff00']]);c.fillStyle=sheen;c.fillRect(x,y,rw,rh);texture(c,x,y,rw,rh,56,70);
 });
 poly(c,[[x,y+rh],[x+rw*.1,y+3],[x+rw*.14,y+4],[x+rw*.08,y+rh]],'#d6cee1a6');
}
function synthetic(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.08,y],[w*.12,y-12],[w*.27,y-18],[w*.78,y-18],[w*.93,y]],[[0,'#b9c7cc'],[.12,'#6a8998'],[.5,'#1b2e3b'],[1,'#425e71']]);
 const x=w*.19,y=b-(k==='header'?36:75),rw=w*.64,rh=k==='header'?29:66;
 round(c,x-4,y-4,rw+8,rh+8,4,metal(c,x,y,rw,rh,'#8aadb9'));
 clipped(c,()=>round(c,x,y,rw,rh,2),()=>{
  c.fillStyle=G(c,x,y,rw,0,[[0,'#ad4c1f'],[.42,'#e7b65d'],[.5,'#152633'],[.62,'#8bc6e3'],[1,'#25476e']]);c.fillRect(x,y,rw,rh);
  for(let i=0;i<2;i++)ripple(c,x+rw*(i?.75:.25),y+rh*.4,rw*.26,rh*.6,t*(i?-1:1),i?'#d0f5ff4a':'#ffebc451');
  const travel=(.5+.5*Math.sin(t))*rw*.27;
  for(let i=0;i<3;i++){const xx=x+rw*.19+i*rw*.19+travel;poly(c,[[xx,y-1],[xx+rw*.13,y-1],[xx+rw*.04,y+rh+1],[xx-rw*.09,y+rh+1]],metal(c,xx,y,rw*.1,rh,'#819ead'));}
 });
}
function cabinet(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.13,y],[w*.14,y-10],[w*.22,y-18],[w*.82,y-18],[w*.91,y]],[[0,'#b38bd5'],[.1,'#634e80'],[.28,'#251e3c'],[1,'#64517e']]);
 const x=w*.23,y=b-(k==='header'?42:91),rw=w*.54,rh=k==='header'?35:83;
 round(c,x-4,y-4,rw+8,rh+8,3,metal(c,x,y,rw,rh,'#77558a'));round(c,x,y,rw,rh,2,'#090c1a');
 clipped(c,()=>round(c,x,y,rw,rh,2),()=>{
  const voxels=[];for(let z=-1;z<=1;z++)for(let a=-2;a<=2;a++)for(let b=-1;b<=1;b++)if((a*a+b*b+z*z)%3!==0){
   const u=a*Math.cos(t)+z*Math.sin(t),v=z*Math.cos(t)-a*Math.sin(t),yy=b*Math.cos(t*2)-v*Math.sin(t*2)*.5;voxels.push({u,v,yy,a,b,z});
  }
  voxels.sort((a,b)=>a.v-b.v);const s=Math.min(rw/11,rh/7);
  for(const v of voxels){const px=x+rw*.5+v.u*s*1.5,py=y+rh*.5+v.yy*s*1.4,size=s*(.72+v.v*.06);glow(c,v.z>0?'#65e1ed':'#bd71ed',3,()=>{c.fillStyle=v.z>0?'#6fd7e6':'#b16be3';c.fillRect(px-size/2,py-size/2,size,size);});c.fillStyle='#faf2ff5e';c.fillRect(px-size/2,py-size/2,size,1);}
 });
}
function oldMilitary(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.08,y],[w*.11,y-14],[w*.26,y-20],[w*.83,y-17],[w*.92,y]],[[0,'#8e9d8c'],[.1,'#516251'],[.5,'#19261f'],[1,'#495748']]);
 const x=w*.19,y=b-(k==='header'?34:75),rw=w*.64,rh=k==='header'?27:66;
 round(c,x-4,y-3,rw+8,rh+6,2,'#526254');round(c,x,y,rw,rh,1,'#07140e');
 clipped(c,()=>round(c,x,y,rw,rh,1),()=>{
  const cx=x+rw*.43,cy=y+rh*.54,r=rh*.58;E(c,cx,cy,r,r,'#263d2b');c.save();c.translate(cx,cy);c.rotate(t);
  for(let i=0;i<5;i++){c.rotate(TAU/5);poly(c,[[0,0],[r*.45,-r*.9],[r*.95,-r*.15],[r*.28,r*.18]],'#0a1b12');}c.restore();
  for(let i=0;i<9;i++){const xx=x+i*rw/8;c.fillStyle=metal(c,xx,y,4,rh,'#64715d');c.fillRect(xx,y,4,rh);}
  const px=x+rw*.8;for(let a=0;a<3;a++)for(let b=0;b<4;b++){c.fillStyle=`rgba(130,207,117,${.45+.17*Math.sin(t+a*.6+b*.4)})`;c.fillRect(px+a*3,y+rh*.23+b*3,1.5,1.5);}
 });texture(c,x,y,rw,rh,486,100);
}
function oldKhala(c,w,h,k,t){
 const b=dock(c,w,h,k,y=>[[w*.14,y],[w*.18,y-10],[w*.32,y-19],[w*.74,y-18],[w*.89,y]],[[0,'#e8d99e'],[.2,'#9c833e'],[.55,'#3a382c'],[1,'#85672f']]);
 const x=w*.52,y=b-(k==='header'?24:49),rx=w*.27,ry=k==='header'?20:43;
 E(c,x,y,rx+7,ry+4,G(c,x,y-ry,0,ry*2,[[0,'#d6bc73'],[.3,'#6b5b36'],[.7,'#2b3029'],[1,'#bfa65c']]));
 clipped(c,()=>E(c,x,y,rx,ry,null),()=>{E(c,x,y,rx,ry,G(c,x-rx,y-ry,rx*2,ry*2,[[0,'#75c0d5'],[.3,'#164860'],[.8,'#132d51'],[1,'#568cb0']]));ripple(c,x,y,rx,ry*.82,t,'#a4e7f45e');ripple(c,x,y+ry*.15,rx,ry*.7,-t,'#47729b60',1);texture(c,x-rx,y-ry,rx*2,ry*2,579,140);});
 for(const s of [-1,1])E(c,x+s*rx*.91,y+ry*.31,rx*.11,ry*.54,'#b5a264',s*.38);
}
const renderers={default:frosted,fenix:purifier,protoss:khala,nerazim:voidGlass,alarak:forged,ihanrii:mineral,terran:exchanger,nova:optical,mira:salvage,machined:foundry,tyrador:pearl,mecha:synthetic,arcade:cabinet,'classic-terran':oldMilitary,'classic-protoss':oldKhala};
function draw(id,kind,phase){const r=renderers[id];if(!r)throw Error('No bespoke electronic scene: '+id);const {canvas,c,width,height}=surface(kind);r(c,width,height,kind,phase*TAU);c.save();c.globalCompositeOperation='source-atop';texture(c,0,0,width,height,137,kind==='header'?340:260);c.restore();return raw(canvas);}
module.exports={renderers,descriptions,draw};
