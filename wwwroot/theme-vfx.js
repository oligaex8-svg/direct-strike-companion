/* Offline material loops. One compositor clock per atlas; no frame callbacks. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),byLayer=new WeakMap(),phases=new Map(),catalog=window.DSThemeLoopCatalog||{};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 const priority={preview:0,header:1,panel:2,scenery:3};let queued=false,focused=document.hasFocus();
 const theme=()=>catalog[root.dataset.graphicalStyle]?root.dataset.graphicalStyle:'default';
 const shown=el=>el?.isConnected&&el.getClientRects().length>0;
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const r=byLayer.get(entry.target);if(r)r.inside=entry.isIntersecting;}activity();});
 const resize=new ResizeObserver(()=>schedule());
 const phaseKey=(r,id,a)=>[r.key,id,a.src,a.width,a.height,a.frames??a.columns*a.rows,a.duration].join('|');
 function remember(r){
  if(!r.animation||!r.asset)return;
  const key=phaseKey(r,r.theme,r.asset),time=Number(r.animation.currentTime)||0;
  phases.delete(key);phases.set(key,time%(r.asset.duration*1000));
  if(phases.size>128)phases.delete(phases.keys().next().value);
 }
 function activity(){
  const paused=document.hidden||!focused||reduced.matches||forced.matches;
  root.toggleAttribute('data-vfx-paused',paused);
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);let active=0;
  for(const r of [...records.values()].sort((a,b)=>priority[a.role]-priority[b.role])){
   const allowed=!paused&&r.ready&&r.inside&&!r.layer.hidden&&(!dialog||dialog.contains(r.host))&&active<3;
   r.layer.dataset.vfxActive=String(allowed);
   if(r.animation){
    if(allowed){if(r.animation.playState!=='running')r.animation.play();}
    else if(r.animation.playState!=='paused')r.animation.pause();
   }
   if(allowed)active++;
  }
 }
 function bounds(el){if(!el)return null;const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect();}
 function fit(r){
  if(!r.asset||r.layer.hidden)return;
  const b=r.layer.getBoundingClientRect(),a=r.asset,scale=Math.min(b.width/a.width,b.height/a.height),w=a.width*scale,h=a.height*scale;
  const left=a.anchor==='right'?b.width-w:(b.width-w)/2,top=a.anchor==='bottom'?b.height-h:(b.height-h)/2;
  Object.assign(r.window.style,{left:left+'px',top:top+'px',transform:'scale('+scale+')'});
 }
 function place(r){
  const {host,role,layer}=r,b=host.getBoundingClientRect();layer.hidden=!shown(host);
  if(layer.hidden)return;
  if(role==='header'||role==='panel'){
   const title=host.querySelector('h1,h2,h3,.profile-kicker,strong,span'),t=bounds(title);
   const controls=[...host.children].filter(el=>el!==layer&&el!==title&&!el.contains(title)&&shown(el)).map(el=>el.getBoundingClientRect());
   const left=Math.max(12,(t?.right??b.left)-b.left+20),right=Math.min(b.width-12,...controls.map(r=>r.left-b.left-16));
   const width=Math.min(680,right-left),height=b.height;layer.hidden=width<100||height<16;
   Object.assign(layer.style,{left:(left+Math.max(0,right-left-width)/2)+'px',top:'0px',width:Math.max(0,width)+'px',height:Math.max(0,height)+'px'});
  }else if(role==='scenery'){
   const nav=host.querySelector('nav'),dock=host.querySelector('.sidebar-bottom');
   if(innerWidth<=750||!shown(nav)||!shown(dock)){layer.hidden=true;return;}
   const start=nav.getBoundingClientRect().bottom-b.top+20,end=dock.getBoundingClientRect().top-b.top-20,height=Math.min(220,end-start);
   layer.hidden=height<90;Object.assign(layer.style,{left:'12px',right:'0px',top:(start+Math.max(0,end-start-height)/2)+'px',height:Math.max(0,height)+'px'});
  }else layer.style.inset='0';
  fit(r);
 }
 function makeClock(r,a,id){
  const frames=a.frames??a.columns*a.rows,keyframes=[];
  for(let i=0;i<=frames;i++){
   const frame=i%frames;
   keyframes.push({offset:i/frames,transform:`translate3d(${-a.width*(frame%a.columns)}px,${-a.height*Math.floor(frame/a.columns)}px,0)`,easing:'steps(1,end)'});
  }
  // X and Y are one transform in one animation, so a row rollover is atomic.
  const animation=r.x.animate(keyframes,{duration:a.duration*1000,iterations:Infinity,easing:'linear',fill:'both'});
  animation.pause();animation.currentTime=phases.get(phaseKey(r,id,a))??0;
  return animation;
 }
 function load(r,id){
  const a=catalog[id]?.[r.role==='header'||r.role==='panel'?'header':'inset'];
  r.requestedTheme=id;r.layer.dataset.vfxTheme=id;r.layer.dataset.vfxReady='loading';
  const token={};r.token=token;
  if(!a){r.layer.dataset.vfxReady='error';return;}
  // Keep the previous decoded frame in place until both replacement images exist.
  const img=new Image(),poster=new Image();
  img.alt='';img.className='vfx-loop-atlas';img.draggable=false;img.src=a.src;
  poster.alt='';poster.className='vfx-loop-poster';poster.draggable=false;poster.src=a.poster;
  Promise.all([img.decode(),poster.decode()]).then(()=>{
   // Cached decode can resolve between a host replacement and its RAF reparent.
   // The semantic record/token owns the load, rather than that transient DOM gap.
   if(r.token!==token||records.get(r.key)!==r)return;
   remember(r);r.animation?.cancel();
   r.theme=id;r.asset=a;r.y.replaceChildren(img);r.poster.replaceWith(poster);r.poster=poster;
   for(const [name,value] of Object.entries({'--loop-width':a.width+'px','--loop-height':a.height+'px','--loop-atlas-width':a.atlasWidth+'px','--loop-atlas-height':a.atlasHeight+'px','--loop-cols':a.columns,'--loop-rows':a.rows,'--loop-duration':a.duration+'s'}))r.layer.style.setProperty(name,value);
   r.animation=makeClock(r,a,id);r.ready=true;r.layer.dataset.vfxHasFrame='true';r.layer.dataset.vfxReady='true';fit(r);activity();
  }).catch(()=>{if(r.token===token){r.layer.dataset.vfxReady='error';activity();}});
 }
 function discard(r){
  r.token=null;remember(r);r.animation?.cancel();observer.unobserve(r.layer);resize.unobserve(r.host);r.layer.remove();r.host.classList.remove('theme-vfx-host');records.delete(r.key);
 }
 function reconcile(){
  queued=false;const desired=new Map(),add=(key,host,role)=>{if(host)desired.set(key,{host,role});};
  // Existing native character/projector scenery owns the sidebar gap. An extra
  // inlay there can cover that artwork even when it clears every text rectangle.
  add('main-header',document.querySelector('.work-console>.page-head'),'header');
  add('primary-panel',document.querySelector('#library-content .profile-favourite-top,#library-content .live-team-head,#library-content .pick-opponent .pick-section-head'),'panel');
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){add('dialog-header:'+dialog.id,dialog.querySelector('.dialog-head'),'header');add('preview:'+dialog.id,dialog.querySelector('[data-theme-vfx-preview]'),'preview');}
  for(const [key,r] of records)if(!desired.has(key))discard(r);
  for(const [key,{host,role}] of desired){
   let r=records.get(key);
   if(r&&r.host!==host){
    // Reuse the decoded atlas AND its live clock when polling recreates a host.
    resize.unobserve(r.host);r.host.classList.remove('theme-vfx-host');r.host=host;
    if(getComputedStyle(host).position==='static')host.classList.add('theme-vfx-host');
    for(const child of host.querySelectorAll(':scope>.theme-vfx-layer'))if(child!==r.layer)child.remove();
    host.append(r.layer);resize.observe(host);
   }
   if(!r){
    const layer=document.createElement('div');layer.className='theme-vfx-layer';layer.dataset.vfxRole=role;layer.dataset.vfxKey=key;layer.dataset.vfxActive='false';layer.setAttribute('aria-hidden','true');
    const window=document.createElement('div'),poster=new Image(),x=document.createElement('div'),y=document.createElement('div');
    window.className='vfx-loop-window';poster.className='vfx-loop-poster';poster.alt='';poster.draggable=false;x.className='vfx-loop-x';y.className='vfx-loop-y';
    x.append(y);window.append(poster,x);layer.append(window);
    if(getComputedStyle(host).position==='static')host.classList.add('theme-vfx-host');host.append(layer);
    r={key,host,layer,window,poster,x,y,role,inside:false,theme:null,requestedTheme:null,ready:false,animation:null};
    records.set(key,r);byLayer.set(layer,r);observer.observe(layer);resize.observe(host);
   }
   // A host can also retain its identity while innerHTML removes its layer.
   if(r.layer.parentElement!==host){for(const child of host.querySelectorAll(':scope>.theme-vfx-layer'))if(child!==r.layer)child.remove();host.append(r.layer);}
   if(r.requestedTheme!==theme())load(r,theme());place(r);
  }
  activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 new MutationObserver(changes=>{
  if(changes.every(change=>{const target=change.target.nodeType===1?change.target:change.target.parentElement;return target?.closest('.theme-vfx-layer')||change.type==='childList'&&[...change.addedNodes,...change.removedNodes].every(node=>node.nodeType===1&&node.matches('.theme-vfx-layer'));}))return;
  schedule();
 }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','data-graphical-style']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style']});
 document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});
 window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('blur',()=>{focused=false;activity();});
 window.addEventListener('resize',schedule);reduced.addEventListener('change',activity);forced.addEventListener('change',activity);document.fonts.ready.then(schedule);
 function preview(){
  reconcile();if(document.hidden||!focused||reduced.matches||forced.matches)return false;
  const r=[...records.values()].find(r=>r.role==='preview')||[...records.values()].find(r=>r.role==='header'&&!r.layer.hidden);
  if(!r?.ready)return false;
  r.animation.pause();r.animation.currentTime=0;remember(r);activity();return true;
 }
 window.DSThemeVfx=Object.freeze({refresh:reconcile,preview});reconcile();
})();
