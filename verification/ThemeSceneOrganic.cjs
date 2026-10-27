'use strict';
// Bespoke attached anatomy, authored companion artwork rather than game exports.
const P=require('./ThemeScenePrimitives.cjs');
const {TAU,gradient:G,polygon:poly,rounded:round,ellipse:E,radial:R,seeded,texture,metal}=P;
const descriptions={
 zerg:['continuous wet chitin fold with a recessed vascular membrane','a peristaltic wave travels through one connected fold under a wet reflection'],
 abathur:['one translucent teardrop sac joined to a narrow organic neck','internal fluid circulation and neck constriction deform a single connected body'],
 dehaka:['coarse serrated slate hide with overlapping interlocked plates','a flex propagates through the plate sequence with two grounded dust releases'],
 cerberus:['flesh cuff gripping a rigid teal metal coupling','contained fluid slides behind the fixed coupling while its flesh cuff creeps locally'],
 'classic-zerg':['muted wet muscular root with unequal branches and compressed irregular folds','one branch squeezes while its partner relaxes, moving broad muscle highlights']
};
function clipped(c,path,draw){c.save();path();c.clip();draw();c.restore();}
function fill(c,path,paint){path();c.fillStyle=paint;c.fill();}
// Filled compressed creases: unequal recess and overhanging wet tissue lip.
function crease(c,x,y,rx,ry,angle,shade='#100e18d9',lip='#b39c8242'){
 c.save();c.translate(x,y);c.rotate(angle);
 c.beginPath();c.moveTo(-rx,ry*.32);c.bezierCurveTo(-rx*.72,-ry*.8,rx*.02,-ry*.62,rx*.97,-ry*.21);c.bezierCurveTo(rx*.36,-ry*.06,rx*.43,ry*.55,-rx*.24,ry*.69);c.quadraticCurveTo(-rx*.68,ry*.83,-rx,ry*.32);c.closePath();
 c.fillStyle=G(c,-rx,-ry,rx*1.8,ry*1.8,[[0,shade],[.55,'#17121bad'],[1,'#34252c20']]);c.fill();
 c.beginPath();c.moveTo(-rx*.95,ry*.28);c.bezierCurveTo(-rx*.67,-ry*.6,rx*.07,-ry*.55,rx*.91,-ry*.22);c.bezierCurveTo(rx*.05,-ry*.12,-rx*.26,-ry*.2,-rx*.72,ry*.35);c.closePath();c.fillStyle=lip;c.fill();c.restore();
}
function pores(c,x,y,w,h,seed,amount=100){
 for(let i=0;i<amount;i++){
  const px=x+seeded(seed+i*7)*w,py=y+seeded(seed+i*7+1)*h,rx=.35+seeded(seed+i*7+2)*1.35,ry=.3+seeded(seed+i*7+3)*.8;
  E(c,px,py,rx,ry,i%4?'#060c1270':'#0d0d1690',seeded(i+seed)*2);
  if(i%3===0)E(c,px-rx*.3,py-ry*.5,rx*.55,ry*.35,'#b7b1a329');
 }
}
function wetFold(c,w,h,k,t){
 const b=k==='header'?h:h-9;
 const height=k==='header'?34:64,x=w*.12,rw=w*.88;
 const upper=u=>b-height*(.49+.07*Math.sin(u*5-t)+.07*Math.sin(u*9+1.2)+.025*Math.sin(u*23-.6));
 const shell=()=>{
  c.beginPath();c.moveTo(x,b);c.lineTo(x,upper(0)+height*.2);
  for(let i=1;i<=40;i++){const u=i/40;c.lineTo(x+u*rw,upper(u));}
  c.lineTo(w,b);c.closePath();
 };
 fill(c,shell,G(c,x,b-height,0,height,[[0,'#93816b'],[.24,'#604737'],[.45,'#3b2a2a'],[.76,'#271d27'],[1,'#0d1119']]));
 clipped(c,shell,()=>{
  // The dark, wet membrane is a filled recess inside the same uninterrupted fold.
  c.beginPath();c.moveTo(x,b-4);
  for(let i=0;i<=40;i++){const u=i/40;c.lineTo(x+u*rw,upper(u)+height*(.23+.055*Math.sin(u*6-t)));}
  for(let i=40;i>=0;i--){const u=i/40;c.lineTo(x+u*rw,upper(u)+height*(.48+.075*Math.sin(u*6-t)));}
  c.closePath();c.fillStyle=G(c,x,b-height*.75,0,height*.7,[[0,'#0e0e15'],[.45,'#5a2b438d'],[.7,'#1e1725'],[1,'#93604453']]);c.fill();
  for(const [u,r,depth,a] of [[.065,.055,.15,-.31],[.18,.035,.23,.23],[.32,.076,.24,-.12],[.49,.042,.32,.41],[.62,.069,.17,-.46],[.77,.045,.28,.18],[.9,.062,.2,-.2]]){
   const yy=upper(u)+height*(.19+.05*Math.sin(t-u*5));
   crease(c,x+u*rw,yy,rw*r,height*depth,a,'#0c101be6','#c0a47c37');
  }
  const hx=x+rw*(.54+.15*Math.sin(t)),hy=upper((hx-x)/rw)+height*.17;
  E(c,hx,hy,rw*.18,height*.14,R(c,hx,hy,rw*.2,[[0,'#d5bd994c'],[.5,'#bfad9430'],[1,'#c4b6a000']]),-.055*Math.cos(t));
  texture(c,x,b-height,rw,height,913,230);
  pores(c,x,b-height,rw,height,941,125);
  c.fillStyle=G(c,0,b-height*.3,0,height*.3,[[0,'#070b1100'],[1,'#070b11aa']]);c.fillRect(x,b-height*.3,rw,height*.3);
 });
}
function evolvedSac(c,w,h,k,t){
 const b=k==='header'?h:h-9;
 const cx=w*.49,cy=b-(k==='header'?22:43),rx=w*.25,ry=k==='header'?20:36,constrict=.76+.13*Math.sin(t);
 const sac=()=>{
  c.beginPath();c.moveTo(w,b-6);c.bezierCurveTo(w*.88,b-7,w*.84,cy+ry*.3*constrict,w*.73,cy+ry*.39*constrict);
  c.bezierCurveTo(cx+rx*.5,cy+ry*1.2,cx-rx*.69,cy+ry*1.05,cx-rx,cy+ry*.12);
  c.bezierCurveTo(cx-rx*1.1,cy-ry*.72,cx-rx*.06,cy-ry*1.17,cx+rx*.57,cy-ry*.69);
  c.bezierCurveTo(w*.75,cy-ry*.33*constrict,w*.84,b-21,w,b-23);c.closePath();
 };
 fill(c,sac,G(c,cx-rx,cy-ry,rx*1.6,ry*2,[[0,'#5c5557'],[.15,'#34303c'],[.43,'#29372e'],[.67,'#172428'],[1,'#10131e']]));
 clipped(c,sac,()=>{
  E(c,cx-rx*.04,cy+ry*.04,rx*.82,ry*.8,R(c,cx-rx*.19,cy-ry*.14,rx*.88,[[0,'#95a45baa'],[.36,'#5f784e97'],[.77,'#32443284'],[1,'#18232d00']]),-.12);
  const flowX=cx+Math.cos(t)*rx*.24,flowY=cy+Math.sin(t)*ry*.31;
  E(c,flowX,flowY,rx*.52,ry*.46,R(c,flowX,flowY,rx*.55,[[0,'#a6b67547'],[.6,'#738f4933'],[1,'#35503900']]),.25*Math.sin(t));
  const px=cx+Math.cos(t)*rx*.26,py=cy+Math.sin(t)*ry*.3;
  c.save();c.translate(px,py);c.rotate(.18*Math.sin(t));
  c.beginPath();c.moveTo(-rx*.24,-ry*.16);c.bezierCurveTo(-rx*.15,-ry*.38,rx*.21,-ry*.19,rx*.17,ry*.12);c.bezierCurveTo(rx*.1,ry*.37,-rx*.09,ry*.29,-rx*.08,ry*.07);c.quadraticCurveTo(-rx*.2,ry*.16,-rx*.24,-ry*.16);c.closePath();c.fillStyle=G(c,-rx*.2,-ry*.3,rx*.4,ry*.7,[[0,'#bac78991'],[.32,'#697f42da'],[1,'#1e352cd9']]);c.fill();c.restore();
  E(c,cx+rx*.46-Math.sin(t)*rx*.1,cy+ry*.27+Math.cos(t)*ry*.12,rx*.065,ry*.22,'#a3b66e6b',-.47);
  // Opaque membrane rims obscure parts of the contents and cast deep near-side shade.
  c.beginPath();c.moveTo(cx-rx,cy);c.bezierCurveTo(cx-rx*.7,cy+ry*.36,cx+rx*.42,cy+ry*.71,cx+rx*.79,cy-ry*.07);c.bezierCurveTo(cx+rx*.64,cy+ry*.98,cx-rx*.62,cy+ry*1.1,cx-rx,cy);c.closePath();c.fillStyle=G(c,0,cy,0,ry,[[0,'#37324170'],[.45,'#332636bd'],[1,'#131620f2']]);c.fill();
  c.beginPath();c.moveTo(cx-rx,cy+ry*.1);c.bezierCurveTo(cx-rx*.97,cy-ry*.79,cx-rx*.13,cy-ry*1.04,cx+rx*.59,cy-ry*.66);c.bezierCurveTo(cx-rx*.02,cy-ry*.7,cx-rx*.65,cy-ry*.44,cx-rx*.77,cy+ry*.05);c.closePath();c.fillStyle=G(c,0,cy-ry,0,ry,[[0,'#8c89715c'],[.35,'#3e354be8'],[1,'#2423322a']]);c.fill();
  crease(c,cx-rx*.65,cy-ry*.14,rx*.17,ry*.31,.4,'#141420bd','#b1b39c24');
  crease(c,cx+rx*.69,cy+ry*.09,rx*.16,ry*.29,-.25,'#13151ed9','#afb18a28');
  const neckX=w*.81,neckY=b-15;
  E(c,neckX,neckY,w*.017,12,R(c,neckX,neckY,13,[[0,'#0b101baf'],[.55,'#382a44a0'],[1,'#3d303d00']]),-.25);
  E(c,cx-rx*.2,cy-ry*.59,rx*.53,ry*.19,'#d4d4ae25',-.18);
  texture(c,cx-rx,cy-ry,rx*2,ry*2,1873,160);
  pores(c,cx-rx,cy-ry,rx*2,ry*2,1899,100);
 });
 // The lip folds over the sac only at the neck, leaving its volume connected.
 c.beginPath();c.moveTo(w*.744,cy-ry*.43*constrict);c.bezierCurveTo(w*.78,cy-ry*.36,w*.81,b-21,w*.87,b-23);c.lineTo(w*.872,b-20);c.bezierCurveTo(w*.8,b-17,w*.79,cy-ry*.2,w*.753,cy-ry*.28);c.closePath();c.fillStyle='#30232de0';c.fill();
}
function primalRidge(c,w,h,k,t){
 const b=k==='header'?h:h-9,x=w*.1,rw=w*.9,rh=k==='header'?29:57;
 c.beginPath();c.moveTo(x,b);c.bezierCurveTo(x+rw*.18,b-rh*.85,x+rw*.54,b-rh*.35,w,b-rh*.72);c.lineTo(w,b);c.closePath();c.fillStyle=G(c,x,b-rh,0,rh,[[0,'#435158'],[.4,'#18252e'],[1,'#080e16']]);c.fill();
 const plates=[
  [0,.25,.64,.15,[[0,.14],[.08,-.26],[.32,-.62],[.65,-.5],[.88,-.15],[1,.25],[.57,.39]]],
  [.16,.19,.48,.32,[[0,.25],[.03,-.19],[.45,-.52],[.72,-.43],[.83,-.11],[1,.23],[.61,.46]]],
  [.31,.3,.87,.2,[[0,.1],[.19,-.33],[.38,-.87],[.5,-.63],[.67,-.58],[.84,-.22],[1,.31],[.43,.37]]],
  [.55,.18,.43,.37,[[0,.24],[.1,-.24],[.45,-.39],[.65,-.22],[1,.14],[.79,.43],[.23,.36]]],
  [.67,.27,.74,.22,[[0,.26],[.08,-.17],[.3,-.52],[.66,-.74],[.75,-.46],[.94,-.29],[1,.36],[.5,.42]]],
  [.87,.2,.56,.31,[[0,.24],[.03,-.2],[.28,-.56],[.59,-.43],[.85,-.16],[1,.27],[.45,.41]]]
 ];
 for(const [i,plate] of plates.entries()){
  const [start,span,,drop,points]=plate,xx=x+rw*start,pw=rw*span,flex=Math.sin(t-i*.83),yy=b-rh*drop+flex*rh*.04;
  const shape=()=>poly(c,points.map(([px,py])=>[xx+pw*px,yy+rh*py]),null);
  c.save();c.translate(-.6,2.1);fill(c,shape,'#020912ed');c.restore();
  fill(c,shape,G(c,xx,yy-rh,0,rh*1.5,[[0,'#829294'],[.27,'#46585f'],[.5,'#24343f'],[.84,'#121d27'],[1,'#080e17']]));
  clipped(c,shape,()=>{
   const chips=3+(i%3);
   for(let j=0;j<chips;j++){
    const fx=xx+pw*(.13+seeded(i*41+j*7)*.68),fy=yy-rh*(.12+seeded(i*31+j*5)*.4),fw=pw*(.09+seeded(i*17+j)*.12);
    poly(c,[[fx,fy],[fx+fw,fy-rh*.035],[fx+fw*.65,fy+rh*.12],[fx-fw*.22,fy+rh*.18]],j%2?'#050e18c7':'#a7b1ad31');
   }
   E(c,xx+pw*.47,yy-rh*.42,pw*.37,rh*.12,R(c,xx+pw*.42,yy-rh*.43,pw*.4,[[0,'#abb8b23d'],[1,'#758a8e00']]),-.18+i*.037);
   texture(c,xx,yy-rh,pw,rh*1.5,233+i*17,95);pores(c,xx,yy-rh,pw,rh*1.5,349+i*23,90);
  });
 }
 for(let i=0;i<2;i++){
  const u=((t/TAU+i*.47)%1+1)%1,alpha=Math.sin(Math.PI*u)**2,px=w*(.38+i*.31)+u*4,py=b-rh*(.72-i*.13)-u*rh*.4;
  c.save();c.globalAlpha=alpha*.35;E(c,px,py,.65,.9,'#9e9b82');c.restore();
 }
}
function infestedCoupling(c,w,h,k,t){
 const b=k==='header'?h:h-9;
 const top=b-(k==='header'?38:70),mh=b-top-4,x=w*.53,rw=w*.47;
 // Rigid substrate and occluding brackets never deform with the flesh.
 round(c,x,top+7,rw,mh-6,4,metal(c,x,top,rw,mh,'#4d746f'));
 poly(c,[[w*.69,top],[w*.83,top+4],[w*.86,b-5],[w*.7,b-3]],metal(c,w*.7,top,w*.16,mh,'#759c91'));
 const lx=w*.6,ly=top+12,lw=w*.17,lh=mh-16;
 round(c,lx-2,ly-2,lw+4,lh+4,3,'#0b191b');
 clipped(c,()=>round(c,lx,ly,lw,lh,2),()=>{
  c.fillStyle=G(c,lx,ly,0,lh,[[0,'#182a27'],[.5,'#46664a'],[1,'#1b332e']]);c.fillRect(lx,ly,lw,lh);
  for(let i=0;i<3;i++){
   const xx=lx+lw*(.18+i*.34)+Math.sin(t+i*2.1)*lw*.08,yy=ly+lh*.55+Math.cos(t+i)*lh*.18;
   E(c,xx,yy,lw*.36,lh*.49,R(c,xx,yy,lw*.48,[[0,'#a2d87a80'],[.6,'#70aa6139'],[1,'#548d5600']]));
  }
 });
 round(c,w*.84,top+12,w*.16,6,2,'#0b181e');round(c,w*.85,b-15,w*.15,4,1,'#b0c2ad64');
 E(c,w*.733,top+7,3,3,'#152c31');E(c,w*.733,top+7,1.6,1.6,'#a1c7b7');
 const cuff=()=>{
  const f=Math.sin(t)*1.2;c.beginPath();c.moveTo(w*.16,b);c.bezierCurveTo(w*.22,top+mh*.37,w*.41,top-3+f,w*.56,top+6);c.bezierCurveTo(w*.61,top+10,w*.6,top+mh*.57,w*.64,b-5);c.lineTo(w*.54,b);c.bezierCurveTo(w*.53,top+mh*.7,w*.45,top+mh*.5,w*.36,b-2);c.closePath();
 };
 fill(c,cuff,G(c,w*.17,top,0,mh,[[0,'#b28972'],[.17,'#73483e'],[.52,'#422631'],[.82,'#6a443d'],[1,'#221e26']]));
 clipped(c,cuff,()=>{
  for(const [u,drop,rx,ry,a] of [[.25,.35,.035,.16,-.4],[.31,.53,.045,.21,.2],[.41,.3,.052,.19,-.25],[.465,.62,.034,.24,.42],[.55,.42,.028,.22,-.18]]){
   const xx=w*u,yy=top+mh*drop+Math.sin(t-u*5)*.6;
   crease(c,xx,yy,w*rx,mh*ry,a,'#1d1523dc','#c6a18c2f');
  }
  pores(c,w*.15,top,w*.5,mh,3139,135);
  texture(c,w*.15,top,w*.5,mh,3097,180);
 });
 // A fixed collar pins the living cuff to the mechanical coupling.
 poly(c,[[w*.55,top+5],[w*.584,top+8],[w*.61,b-4],[w*.578,b]],metal(c,w*.55,top,w*.06,mh,'#6a9187'));
}
function muscularRoot(c,w,h,k,t){
 const b=k==='header'?h:h-9,mid=b-(k==='header'?22:39),rh=k==='header'?24:43,paths=[];
 const tube=(start,control,end,radius,squeeze,paint)=>{
  const r=radius*squeeze,path=()=>{
   c.moveTo(start[0],start[1]-r*.84);
   c.bezierCurveTo(control[0],control[1]-r*1.31,end[0]+w*.06,end[1]-r*.69,end[0],end[1]-r*.38);
   c.quadraticCurveTo(end[0]-w*.018,end[1],end[0],end[1]+r*.52);
   c.bezierCurveTo(end[0]+w*.05,end[1]+r*.98,control[0],control[1]+r*.76,start[0],start[1]+r*1.08);c.closePath();
  };
  c.beginPath();path();c.fillStyle=paint;c.fill();paths.push(path);
 };
 const flesh=G(c,0,mid-rh,0,rh*2,[[0,'#a38a73'],[.14,'#79564a'],[.37,'#493137'],[.68,'#5a3e3e'],[1,'#211a25']]);
 tube([w,mid+rh*.17],[w*.7,mid+rh*.1],[w*.4,mid],rh*.56,1,flesh);
 const a=1+.14*Math.sin(t),breathe=1-.14*Math.sin(t);
 tube([w*.65,mid],[w*.37,mid-rh*.64],[w*.13,mid-rh*.54],rh*.4,a,flesh);
 tube([w*.64,mid+rh*.24],[w*.44,mid+rh*.75],[w*.27,b-6],rh*.35,breathe,flesh);
 tube([w*.82,mid],[w*.74,mid-rh*.68],[w*.66,mid-rh*.87],rh*.27,1+.07*Math.cos(t),flesh);
 clipped(c,()=>{c.beginPath();for(const path of paths)path();},()=>{
  const folds=[
   [.2,-.48,.031,.21,-.47],[.29,-.37,.047,.29,.2],[.43,-.17,.065,.31,-.32],
   [.51,-.05,.036,.36,.39],[.66,.09,.058,.27,-.27],[.78,.15,.043,.32,.3],[.91,.17,.067,.22,-.14],
   [.34,.62,.038,.22,.44],[.45,.48,.055,.24,-.36],[.56,.28,.033,.3,.2],
   [.69,-.63,.032,.25,-.21]
  ];
  for(const [u,v,rx,ry,angle] of folds){
   const squeeze=Math.sin(t-u*4+v*2),yy=mid+rh*v;
   crease(c,w*u,yy,w*rx,rh*ry*(1+.075*squeeze),angle,'#180f1edb','#baa19435');
  }
  const hx=w*(.73+.055*Math.sin(t)),hy=mid-rh*.2;
  E(c,hx,hy,w*.13,rh*.16,R(c,hx,hy,w*.14,[[0,'#c2b8ab38'],[1,'#94847700']]),-.1);
  texture(c,w*.1,mid-rh,w*.9,rh*2,4517,200);pores(c,w*.1,mid-rh,w*.9,rh*2,4549,175);
 });
}
const attached=renderer=>(c,w,h,k,t)=>{
 c.save();c.beginPath();c.rect(0,0,w,k==='inset'?h-9:h);c.clip();
 renderer(c,w,h,k,t);c.restore();
};
const renderers={zerg:attached(wetFold),abathur:attached(evolvedSac),dehaka:attached(primalRidge),cerberus:attached(infestedCoupling),'classic-zerg':attached(muscularRoot)};
function draw(id,kind,phase){
 if(!renderers[id]||!['header','inset'].includes(kind)||!Number.isFinite(phase))throw Error('Unknown organic scene or phase');
 const {canvas,c,width,height}=P.surface(kind),t=(((phase%1)+1)%1)*TAU;
 renderers[id](c,width,height,kind,t);return P.raw(canvas);
}
module.exports={descriptions,renderers,draw};
