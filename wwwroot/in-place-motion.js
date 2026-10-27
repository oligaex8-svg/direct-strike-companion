/* Animate the existing matrix, projected emblem and native joystick in place. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),byElement=new WeakMap(),svgNS='http://www.w3.org/2000/svg';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 let focused=document.hasFocus(),queued=false,serial=0;
 const shown=el=>el?.isConnected&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 const svg=(name,attrs={})=>{const el=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
 const observer=new IntersectionObserver(entries=>{for(const e of entries){const r=byElement.get(e.target);if(r)r.inside=e.isIntersecting;}activity();});
 const resize=new ResizeObserver(()=>schedule());
 function activity(){
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),blocked=document.hidden||!focused||reduced.matches||forced.matches;
  const button=document.querySelector('[data-ui-motion-preview]');if(button)button.disabled=root.dataset.graphicalStyle==='default'||reduced.matches||forced.matches;
  for(const r of records.values()){
   const active=!blocked&&r.ready&&r.inside&&!r.layer.hidden&&(!dialog||dialog.contains(r.host));r.layer.dataset.nativeActive=String(active);
   for(const a of r.animations){if(active&&a.playState!=='running')a.play();else if(!active&&a.playState!=='paused')a.pause();}
  }
 }
 function animate(r,el,frames,duration,phase=0){const a=el.animate(frames,{duration,iterations:Infinity,easing:'linear',fill:'both'});a.pause();a.currentTime=phase;a.nativePhase=phase;r.animations.push(a);return a;}
 function clearAnimations(r){for(const a of r.animations)a.cancel();r.animations=[];}
 function hex(cx,cy){return `M${cx-6} ${cy-10.392}H${cx+6}L${cx+12} ${cy} ${cx+6} ${cy+10.392}H${cx-6}L${cx-12} ${cy}Z`;}
 function matrix(r){
  const b=r.layer.getBoundingClientRect(),w=b.width,h=b.height;if(w<40||h<12)return;
  const textBoxes=[];if(r.kind==='header-matrix'){const walker=document.createTreeWalker(r.host,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(node.textContent.trim()&&!node.parentElement.closest('.inplace-surface')){const range=document.createRange();range.selectNodeContents(node);for(const box of range.getClientRects())if(box.width&&box.height)textBoxes.push({left:box.left-b.left-5,right:box.right-b.left+5,top:box.top-b.top-3,bottom:box.bottom-b.top+3});}for(const control of r.host.querySelectorAll('button,.button')){const box=control.getBoundingClientRect();textBoxes.push({left:box.left-b.left-3,right:box.right-b.left+3,top:box.top-b.top-3,bottom:box.bottom-b.top+3});}}
  const geometry=[Math.round(w),Math.round(h),r.kind,JSON.stringify(textBoxes)].join(':');if(r.geometry===geometry)return;
  const phase=r.animations[0]?.currentTime||0;clearAnimations(r);r.layer.replaceChildren();r.geometry=geometry;
  const picture=svg('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none'}),defs=svg('defs'),id='native-cell-'+(++serial);
  const gradient=svg('linearGradient',{id,x2:'.2',y2:'1'});gradient.append(svg('stop',{'stop-color':'#ffe5a7','stop-opacity':'.75'}),svg('stop',{offset:'.42','stop-color':'#eab85f','stop-opacity':'.45'}),svg('stop',{offset:'1','stop-color':'#ad6721','stop-opacity':'.12'}));defs.append(gradient);picture.append(defs);
  // Same 36 × 20.784 tessellation and right/top or right/centre registration
  // as fenix-matrix.svg. Filled cells charge; the original grid stays fixed.
  let originX=w-480,originY=r.kind==='sidebar-matrix'?(h-240)/2:0;
  if(r.kind==='header-matrix'){
   const work=r.host.closest('.work-console'),box=work?.getBoundingClientRect(),paint=work&&getComputedStyle(work,'::after');
   if(box&&paint){const x=box.left+work.clientLeft+(parseFloat(paint.left)||0),y=box.top+work.clientTop+(parseFloat(paint.top)||0);originX=x+(parseFloat(paint.width)||box.width)-r.host.getBoundingClientRect().left-480;originY=y-b.top;}
  }
  while(originX>0)originX-=480;while(originY>0)originY-=240;
  let n=0;
  for(let tx=originX;tx<w;tx+=480)for(let ty=originY;ty<h;ty+=240){
   for(const [col,row]of [[6,1],[9,2],[11,0],[7,4],[10,6],[5,8],[8,10]]){
    const cx=tx+12+36*col,cy=ty+10.392+20.784*row;
    if(cx<48||cx>w+10||cy<-20||cy>h+20)continue;
    for(let step=0;step<3;step++){
     const x=cx+step*18,y=cy+(step%2?10.392:0);if(x>w+12||y>h+16||textBoxes.some(box=>x+12>box.left&&x-12<box.right&&y+10.392>box.top&&y-10.392<box.bottom))continue;
     const cell=svg('path',{d:hex(x,y),fill:`url(#${id})`,opacity:'.015'});picture.append(cell);
     animate(r,cell,[{offset:0,opacity:.015},{offset:.12,opacity:.035},{offset:.29,opacity:.62},{offset:.48,opacity:.23},{offset:.74,opacity:.03},{offset:1,opacity:.015}],8400,phase+(n%7)*1010-step*260);n++;
    }
   }
  }
  r.layer.append(picture);r.layer.dataset.nativeCells=String(n);r.layer.dataset.nativeRegistration='fenix-matrix.svg:36x20.784';r.ready=true;activity();
 }
 function pseudoGeometry(r){
  if(r.kind==='preview-projector')return true;
  const s=getComputedStyle(r.host,'::after');
  if(s.display==='none'||['none','normal'].includes(s.content)||parseFloat(s.height)<50)return false;
  for(const p of ['left','right','top','bottom','width','height'])r.layer.style[p]=s[p];
  r.layer.style.maskImage=s.maskImage;r.layer.style.setProperty('--native-object-opacity',r.kind==='projector'?'.72':s.opacity);return true;
 }
 async function projector(r){
  const token={};r.token=token;
  const [text,image]=await Promise.all([fetch('/themes/fenix-projector.svg').then(x=>x.text()),loadImage('/themes/fenix-purifier-sigil.png')]);
  if(records.get(r.key)!==r||r.token!==token)return;
  const picture=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
  const prefix='native-projector-'+(++serial)+'-';
  for(const el of picture.querySelectorAll('[id]')){const old=el.id;el.id=prefix+old;for(const node of picture.querySelectorAll('*'))for(const a of [...node.attributes])if(a.value.includes('url(#'+old+')'))node.setAttribute(a.name,a.value.replaceAll('url(#'+old+')','url(#'+prefix+old+')'));}
  const circle=[...picture.querySelectorAll('circle')].find(el=>el.getAttribute('r')==='79');
  const arcs=[...picture.querySelectorAll('path')].find(el=>el.getAttribute('d')?.startsWith('M29 64'));
  for(const [el,duration,direction]of [[circle,36000,-1],[arcs,24000,1]])if(el){el.style.transformOrigin='100px 87px';animate(r,el,[{transform:'rotate(0deg)'},{transform:`rotate(${direction*360}deg)`}],duration);}
  const beam=picture.querySelector('path');animate(r,beam,[{opacity:.65},{opacity:1},{opacity:.65}],6000);
  const glow=picture.querySelector('ellipse[fill]');if(glow)animate(r,glow,[{opacity:.55},{opacity:1},{opacity:.55}],4800);
  const sparks=svg('g');for(let i=0;i<5;i++){
   const x=88+i*6,dot=svg('circle',{cx:x,cy:186,r:'.9',fill:'#ffe7aa',opacity:'0'});sparks.append(dot);
   animate(r,dot,[{offset:0,opacity:0,transform:'translate(0,0)'},{offset:.18,opacity:.7},{offset:.76,opacity:.4},{offset:1,opacity:0,transform:`translate(${(i-2)*7}px,-64px)`}],4200,i*730);
  }picture.append(sparks);
  const body=document.createElement('i');body.className='inplace-sigil';const core=document.createElement('i');body.append(image,core);r.layer.append(picture,body);
  animate(r,body,[{transform:'perspective(280px) rotateY(-4deg) translateY(1px)'},{transform:'perspective(280px) rotateY(4deg) translateY(-1px)'},{transform:'perspective(280px) rotateY(-4deg) translateY(1px)'}],8400);
  animate(r,core,[{opacity:.23},{opacity:.68},{opacity:.23}],5400,700);
  r.ready=true;r.layer.dataset.nativeSource='fenix-purifier-sigil.png + fenix-projector.svg';if(r.kind==='projector')r.host.dataset.inplaceObject='fenix';activity();
 }
 function loadImage(src){const image=new Image();image.src=src;image.alt='';image.draggable=false;return image.decode().then(()=>image);}
 async function joystick(r){
  const token={};r.token=token;const prefix='/themes/identity-native-ui_console_flavor_joystick_';
  const [ball,stick,base]=await Promise.all(['ball','stick','base'].map(p=>loadImage(prefix+p+'_arcadecabinetpurple.png')));
  if(records.get(r.key)!==r||r.token!==token)return;
  const arm=document.createElement('i');arm.className='inplace-joystick-arm';ball.className='inplace-joystick-ball';stick.className='inplace-joystick-stick';base.className='inplace-joystick-base';arm.append(stick,ball);r.layer.append(base,arm);
  animate(r,arm,[{offset:0,transform:'rotate(-1.6deg)'},{offset:.3,transform:'rotate(2.4deg)'},{offset:.56,transform:'rotate(.6deg)'},{offset:.8,transform:'rotate(-2.1deg)'},{offset:1,transform:'rotate(-1.6deg)'}],9600);
  r.ready=true;r.layer.dataset.nativeSource='original Arcade ball, stick and base';r.host.dataset.inplaceObject='arcade';activity();
 }
 function discard(r){r.token=null;clearAnimations(r);observer.unobserve(r.layer);resize.unobserve(r.host);r.layer.remove();delete r.host.dataset.inplaceObject;records.delete(r.key);}
 function reconcile(){
  queued=false;const wants=[],theme=root.dataset.graphicalStyle,side=document.querySelector('.sidebar'),header=document.querySelector('.work-console>.page-head'),preview=document.querySelector('dialog[open] [data-theme-vfx-preview]');
  if(theme==='fenix'){
   if(header)wants.push({key:'header-matrix',kind:'header-matrix',host:header});
   if(side)wants.push({key:'sidebar-matrix',kind:'sidebar-matrix',host:side},{key:'projector',kind:'projector',host:side});
   if(preview)wants.push({key:'preview-matrix',kind:'preview-matrix',host:preview},{key:'preview-projector',kind:'preview-projector',host:preview});
  }else if(theme==='arcade'&&side)wants.push({key:'joystick',kind:'joystick',host:side});
  const keys=new Set(wants.map(r=>r.key));for(const [key,r]of records)if(!keys.has(key))discard(r);
  for(const spec of wants){
   let r=records.get(spec.key);
   if(!r){const layer=document.createElement('i');layer.className=spec.kind.includes('matrix')?'inplace-surface':'inplace-object';layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.dataset.nativeSurface=spec.kind;r={...spec,layer,animations:[],inside:false,ready:false};records.set(r.key,r);byElement.set(layer,r);observer.observe(layer);}
   if(r.host!==spec.host){resize.unobserve(r.host);delete r.host.dataset.inplaceObject;r.host=spec.host;r.geometry=null;}
   if(r.layer.parentElement!==r.host){for(const old of r.host.querySelectorAll(':scope>[data-native-surface="'+r.kind+'"]'))if(old!==r.layer)old.remove();r.host.append(r.layer);resize.observe(r.host);if(r.ready&&r.kind==='projector')r.host.dataset.inplaceObject='fenix';if(r.ready&&r.kind==='joystick')r.host.dataset.inplaceObject='arcade';}
   r.layer.hidden=!shown(r.host)||(!r.kind.includes('matrix')&&!pseudoGeometry(r));
   if(r.kind==='sidebar-matrix'){const b=r.host.getBoundingClientRect(),nav=r.host.querySelector('nav')?.getBoundingClientRect(),dock=r.host.querySelector('.sidebar-bottom')?.getBoundingClientRect();const top=nav?Math.max(0,nav.bottom-b.top+10):b.height,bottom=dock?Math.max(0,b.bottom-dock.top+10):b.height;r.layer.style.clipPath=`inset(${top}px 0 ${bottom}px 0)`;if(b.height-top-bottom<40)r.layer.hidden=true;}
   if(r.layer.hidden)continue;
   if(r.kind.includes('matrix'))matrix(r);else if(!r.started){r.started=true;(r.kind==='joystick'?joystick(r):projector(r)).catch(()=>{r.layer.dataset.nativeError='decode';});}
  }activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 new MutationObserver(changes=>{if(changes.every(c=>{const el=c.target.nodeType===1?c.target:c.target.parentElement;return el?.closest('.inplace-surface,.inplace-object,.native-frame-motion')||c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches('.inplace-surface,.inplace-object,.native-frame-motion'));}))return;schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style']});
 document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});window.addEventListener('blur',()=>{focused=false;activity();});window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('resize',schedule);reduced.addEventListener('change',activity);forced.addEventListener('change',activity);document.fonts.ready.then(schedule);
 function previewMotion(){reconcile();if(reduced.matches||forced.matches||document.hidden||!focused)return false;for(const r of records.values())if(r.host.closest('dialog[open]'))for(const a of r.animations)a.currentTime=1500+(a.nativePhase||0);activity();return true;}
 window.DSInPlaceMotion=Object.freeze({refresh:reconcile,preview:previewMotion});reconcile();
})();
