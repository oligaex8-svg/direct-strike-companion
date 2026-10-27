/* Cached logical devices, measured into free paint areas. No per-frame JS. */
(()=>{
 'use strict';
 const root=document.documentElement,catalog=window.DSThemeEquipmentCatalog||{},records=new Map(),byLayer=new WeakMap(),phases=new Map();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 let queued=false,focused=document.hasFocus();
 const theme=()=>catalog[root.dataset.graphicalStyle]?root.dataset.graphicalStyle:'default';
 const shown=el=>el?.isConnected&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
 const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
 const inflate=(r,n)=>({left:r.left-n,top:r.top-n,right:r.right+n,bottom:r.bottom+n,width:r.width+n*2,height:r.height+n*2});
 function paintsOver(box,obstacle,hole){
  const left=Math.max(box.left,obstacle.left),right=Math.min(box.right,obstacle.right),top=Math.max(box.top,obstacle.top),bottom=Math.min(box.bottom,obstacle.bottom);
  if(right<=left||bottom<=top)return false;
  return !hole||left<hole.left-.05||right>hole.right+.05||top<hole.top-.05||bottom>hole.bottom+.05;
 }
 function obstacles(host){
  const result=[],walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
   const parent=node.parentElement;if(!node.textContent.trim()||!parent||parent.closest('.theme-equipment-layer,.theme-vfx-layer,script,style')||!shown(parent))continue;
   const range=document.createRange();range.selectNodeContents(node);
   for(const box of range.getClientRects())if(box.width&&box.height)result.push(rect(box));
  }
  for(const el of host.querySelectorAll('button,a,input,select,textarea,img,svg,canvas,video,[role=button],.nav span')){
   if(el.closest('.theme-equipment-layer,.theme-vfx-layer')||!shown(el))continue;
   result.push(rect(el.getBoundingClientRect()));
  }
  return result;
 }
 const intersections=new IntersectionObserver(entries=>{for(const entry of entries){const r=byLayer.get(entry.target);if(r){r.inside=entry.isIntersecting;r.layer.dataset.equipmentInside=String(entry.isIntersecting);}}activity();});
 const resize=new ResizeObserver(()=>schedule());
 function phaseKey(r,id,a){return [r.key,id,r.kind,a.src,a.frames,a.duration].join('|');}
 function remember(r){
  if(!r.animation||!r.asset)return;
  const key=phaseKey(r,r.theme,r.asset);phases.delete(key);phases.set(key,(Number(r.animation.currentTime)||0)%(r.asset.duration*1000));
  if(phases.size>512)phases.delete(phases.keys().next().value);
 }
 function activity(){
  const blocked=document.hidden||!focused||reduced.matches||forced.matches,dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  const eligible=[...records.values()].filter(r=>!blocked&&r.ready&&r.inside&&!r.layer.hidden&&(!dialog||dialog.contains(r.host))&&!r.host.matches(':disabled,[aria-disabled=true]'));
  const chosen=new Set(),groups=new Map();
  for(const r of eligible){
   if(r.role==='control'||r.role==='nav'&&!r.host.classList.contains('active'))continue;
   if(!groups.has(r.role))groups.set(r.role,[]);groups.get(r.role).push(r);
  }
  // Every category gets a turn before additional devices consume the budget.
  for(const group of groups.values())if(chosen.size<8)chosen.add(group[0]);
  for(const r of eligible)if(chosen.size<8&&r.role!=='control'&&(r.role!=='nav'||r.host.classList.contains('active')))chosen.add(r);
  let extras=0;
  for(const r of eligible)if(!chosen.has(r)&&extras<2&&r.role==='control'&&r.host.matches(':hover,:focus-visible,:focus-within')){chosen.add(r);extras++;}
  for(const r of records.values()){
   const active=chosen.has(r);r.layer.dataset.equipmentActive=String(active);
   if(active){r.layer.dataset.equipmentPlayed='true';if(r.animation?.playState!=='running')r.animation?.play();}
   else if(r.animation&&r.animation.playState!=='paused')r.animation.pause();
  }
 }
 function clock(r,a,id){
  const frames=a.frames??a.columns*a.rows,keyframes=[];
  for(let i=0;i<=frames;i++){const f=i%frames;keyframes.push({offset:i/frames,transform:`translate3d(${-a.width*(f%a.columns)}px,${-a.height*Math.floor(f/a.columns)}px,0)`,easing:'steps(1,end)'});}
  const animation=r.clock.animate(keyframes,{duration:a.duration*1000,iterations:Infinity,easing:'linear',fill:'both'});
  animation.pause();animation.currentTime=phases.get(phaseKey(r,id,a))??0;return animation;
 }
 function load(r,id,kind){
  const a=catalog[id]?.[kind];r.requested=id+'|'+kind;r.layer.dataset.equipmentTheme=id;r.layer.dataset.equipmentReady='loading';const token={};r.token=token;
  if(!a){r.layer.dataset.equipmentReady='error';return;}
  const image=new Image(),poster=new Image();image.src=a.src;poster.src=a.poster;
  Promise.all([image.decode(),poster.decode()]).then(()=>{
   if(r.token!==token||records.get(r.key)!==r)return;
   remember(r);r.animation?.cancel();r.theme=id;r.kind=kind;r.asset=a;
   r.poster.style.backgroundImage=`url("${a.poster}")`;r.clock.style.backgroundImage=`url("${a.src}")`;
   for(const [name,value] of Object.entries({'--equipment-width':a.width+'px','--equipment-height':a.height+'px','--equipment-atlas-width':a.atlasWidth+'px','--equipment-atlas-height':a.atlasHeight+'px'}))r.layer.style.setProperty(name,value);
   r.animation=clock(r,a,id);r.ready=true;r.layer.dataset.equipmentReady='true';r.layer.dataset.equipmentObject=typeof a.object==='string'?a.object:'';fit(r);activity();
  }).catch(()=>{if(r.token===token)r.layer.dataset.equipmentReady='error';});
 }
 function fit(r){
  if(!r.asset||r.layer.hidden)return;
  const width=parseFloat(r.layer.style.width),height=parseFloat(r.layer.style.height),a=r.asset,scale=Math.min(width/a.width,height/a.height);
  r.window.style.transform='scale('+scale+')';r.window.style.left=(width-a.width*scale)/2+'px';r.window.style.top=(height-a.height*scale)/2+'px';
 }
 function desired(){
  const list=[],view=document.querySelector('#main')?.dataset.view||'page';
  const add=(key,host,role,kind,extra={})=>{if(host&&shown(host))list.push({key,host,role,kind,...extra});};
  for(const el of document.querySelectorAll('.sidebar nav .nav'))add('nav:'+el.dataset.view,el,'nav',el.classList.contains('active')?'core':'relay');
  add('sidebar-link',document.querySelector('.sidebar-bottom>a'),'link','utility');
  const headings='.profile-region>h3,.live-team-head,.profile-best-heading,.profile-section-heading,.sounds-results-head,.sounds-results-heading,.pick-section-head';
  [...document.querySelectorAll('#library-content :is('+headings+')')].forEach((el,i)=>add(view+':heading:'+i,el,'heading',el.getBoundingClientRect().height>=26?'core':'utility'));
  [...document.querySelectorAll('#library-content .combat-card,#library-content .profile-average-grid>section')].forEach((el,i)=>add(view+':metric:'+i,el,'metric','relay'));
  const portraitSelector='.profile-portrait-frame>img.commander-portrait,.profile-best-identity>img.commander-portrait,.live-hero-strip img.commander-portrait';
  [...document.querySelectorAll('#library-content :is('+portraitSelector+')')].slice(0,9).forEach((image,i)=>add(view+':socket:'+i,image.parentElement,'socket','socket',{image}));
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){
   [...dialog.querySelectorAll('.dialog-body h3,.dialog-body .field-label')].slice(0,6).forEach((el,i)=>add(dialog.id+':heading:'+i,el,'heading','utility'));
  }
  const controlSelector='.sidebar-settings,button.button,button.filter';
  const backgroundControls=[...document.querySelectorAll(controlSelector)].filter(el=>!el.closest('.theme-equipment-layer')).slice(0,16);
  backgroundControls.forEach((el,i)=>add((el.id||view+':control:'+i),el,'control','relay'));
  // Dialog controls get their own bounded candidates; opening a modal must not
  // discard or renumber the already-created background equipment records.
  if(dialog)[...dialog.querySelectorAll(controlSelector)].filter(el=>!backgroundControls.includes(el)&&!el.closest('.theme-equipment-layer')).slice(0,16).forEach((el,i)=>add(el.id||dialog.id+':control:'+i,el,'control','relay'));
  const priority=r=>r.role==='nav'?(r.host.classList.contains('active')?0:6):({heading:1,metric:2,socket:3,link:4,control:5}[r.role]??7);
  return list.sort((a,b)=>priority(a)-priority(b));
 }
 function externalControls(host,controls){
  return controls.filter(item=>item.el!==host&&!item.el.contains(host)&&!host.contains(item.el)).map(item=>item.box);
 }
 function chooseBox(r,blocked,reserved,controls){
  const host=r.host,b=host.getBoundingClientRect(),outside=externalControls(host,controls);let box,hole=null;
  if(r.role==='socket'){
   if(!shown(r.image))return null;
   hole=rect(r.image.getBoundingClientRect());if(hole.width<24||hole.height<24)return null;
   box=inflate(hole,3);
   const scope=host.closest('.profile-favourite-main,.profile-best-card,.live-hero-strip')||host;
   const items=obstacles(scope);
   if(items.some(o=>paintsOver(box,o,hole))||outside.some(o=>paintsOver(box,o,hole))||blocked.some(o=>paintsOver(box,o,hole))||reserved.some(o=>paintsOver(box,o,hole)))return null;
   return {box,hole};
  }
  const items=obstacles(host).map(o=>inflate(o,2)),asset=catalog[theme()]?.[r.wantedKind];if(!asset)return null;
  const preferred=r.role==='heading'?80:r.role==='link'?68:r.role==='metric'?34:36,min=r.role==='heading'?42:r.role==='link'?40:24;
  for(const fraction of [1,.85,.7]){
   const width=preferred*fraction,height=width*asset.height/asset.width;if(width<min||height>b.height-8)continue;
   const ys=r.role==='metric'?[b.top+6,b.top+18,b.top+30]:[b.top+(b.height-height)/2];
   for(const top of ys){
    if(top<b.top+3||top+height>b.bottom-3||r.role==='metric'&&top+height>b.top+b.height*.55)continue;
    for(let left=b.right-width-7;left>=b.left+7;left-=4){
     box={left,top,right:left+width,bottom:top+height,width,height};
     if(!items.some(o=>paintsOver(box,o))&&!outside.some(o=>paintsOver(box,o))&&!blocked.some(o=>paintsOver(box,o))&&!reserved.some(o=>paintsOver(box,o)))return {box,hole:null};
    }
   }
  }
  return null;
 }
 function place(r,blocked,reserved,controls){
  const chosen=chooseBox(r,blocked,reserved,controls);r.layer.hidden=!chosen;if(!chosen)return;
  const {box,hole}=chosen,b=r.host.getBoundingClientRect(),sx=b.width/(r.host.offsetWidth||b.width||1),sy=b.height/(r.host.offsetHeight||b.height||1);
  // Local absolute coordinates exclude the existing border and scroll offset.
  const originX=b.left+r.host.clientLeft*sx,originY=b.top+r.host.clientTop*sy;
  Object.assign(r.layer.style,{left:((box.left-originX)/sx+r.host.scrollLeft)+'px',top:((box.top-originY)/sy+r.host.scrollTop)+'px',width:box.width/sx+'px',height:box.height/sy+'px'});
  if(hole){
   for(const [name,value] of Object.entries({'--equipment-hole-left':(hole.left-box.left)/sx,'--equipment-hole-top':(hole.top-box.top)/sy,'--equipment-hole-width':hole.width/sx,'--equipment-hole-height':hole.height/sy}))r.layer.style.setProperty(name,value+'px');
  }
  reserved.push(box);fit(r);
 }
 function discard(r){remember(r);r.token=null;r.animation?.cancel();intersections.unobserve(r.layer);resize.unobserve(r.host);r.layer.remove();records.delete(r.key);if(![...records.values()].some(other=>other.host===r.host))r.host.classList.remove('theme-equipment-host');}
 function reconcile(){
  queued=false;
  const wants=desired(),keys=new Set(wants.map(r=>r.key));for(const [key,r] of records)if(!keys.has(key))discard(r);
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),paintRoot=dialog||document.body;
  const blocked=[...paintRoot.querySelectorAll('.theme-vfx-layer:not([hidden])')].filter(shown).map(el=>rect(el.getBoundingClientRect())),reserved=[];let placed=0;
  // Wrapped captions may extend outside their own heading at narrow widths.
  // Reserve visible text throughout the current paint scope. Backdrop-occluded
  // page text cannot occupy a modal's otherwise clear device slot.
  const textWalker=document.createTreeWalker(paintRoot,NodeFilter.SHOW_TEXT);let textNode;
  while((textNode=textWalker.nextNode())){
   const parent=textNode.parentElement;
   if(!textNode.textContent.trim()||!parent||parent.closest('.theme-equipment-layer,.theme-vfx-layer,script,style')||!shown(parent))continue;
   const range=document.createRange();range.selectNodeContents(textNode);
   for(const box of range.getClientRects())if(box.width&&box.height)blocked.push(inflate(rect(box),2));
  }
  const controls=[...paintRoot.querySelectorAll('button,a,input,select,textarea,summary,[role=button]')].filter(el=>shown(el)&&!el.closest('.theme-equipment-layer,.theme-vfx-layer')).map(el=>({el,box:inflate(rect(el.getBoundingClientRect()),2)}));
  for(const spec of wants){
   let r=records.get(spec.key);
   if(!r){
    const layer=document.createElement('i'),window=document.createElement('i'),poster=document.createElement('i'),clock=document.createElement('i');
    layer.className='theme-equipment-layer';window.className='equipment-window';poster.className='equipment-poster';clock.className='equipment-clock';
    layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.dataset.equipmentKey=spec.key;layer.dataset.equipmentRole=spec.role;layer.dataset.equipmentActive='false';layer.hidden=true;
    window.append(poster,clock);layer.append(window);r={...spec,layer,window,poster,clock,ready:false,inside:false,animation:null,asset:null,theme:null,kind:null};records.set(spec.key,r);byLayer.set(layer,r);intersections.observe(layer);
   }
   if(r.host!==spec.host){resize.unobserve(r.host);r.host.classList.remove('theme-equipment-host');r.host=spec.host;}
   r.image=spec.image;r.wantedKind=spec.kind;r.layer.dataset.equipmentPart=spec.kind;
   if(getComputedStyle(r.host).position==='static'&&!r.host.classList.contains('theme-equipment-host'))r.host.classList.add('theme-equipment-host');
   if(r.layer.parentElement!==r.host){for(const child of r.host.querySelectorAll(':scope>.theme-equipment-layer'))if(child.dataset.equipmentKey===r.key&&child!==r.layer)child.remove();r.host.append(r.layer);resize.observe(r.host);}
   // Background layers retain their existing placement, image and clock while
   // the modal owns the budget. activity() pauses them without reconstructing.
   if(!dialog||dialog.contains(r.host)){
    if(placed<20){place(r,blocked,reserved,controls);if(!r.layer.hidden)placed++;}else r.layer.hidden=true;
   }
   if(!r.layer.hidden&&r.requested!==theme()+'|'+spec.kind)load(r,theme(),spec.kind);
  }
  activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 new MutationObserver(changes=>{
  if(changes.every(change=>{const target=change.target.nodeType===1?change.target:change.target.parentElement;return target?.closest('.theme-equipment-layer,.theme-vfx-layer')||change.type==='childList'&&[...change.addedNodes,...change.removedNodes].every(node=>node.nodeType===1&&node.matches('.theme-equipment-layer,.theme-vfx-layer'));}))return;
  schedule();
 }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','open','disabled','aria-disabled','lang']});
 // A decoded large inlay can claim its final paint area after the theme switch.
 // Refit the smaller devices once that area changes; atlas clocks use WAAPI
 // transforms and do not generate these DOM mutations.
 new MutationObserver(changes=>{if(changes.some(change=>change.target.matches?.('.theme-vfx-layer')))schedule();})
  .observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','hidden','data-vfx-ready']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style','lang']});
 document.addEventListener('pointerover',activity,true);document.addEventListener('pointerout',activity,true);document.addEventListener('focusin',activity,true);document.addEventListener('focusout',activity,true);
 document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});window.addEventListener('blur',()=>{focused=false;activity();});window.addEventListener('focus',()=>{focused=true;activity();});
 window.addEventListener('resize',schedule);reduced.addEventListener('change',activity);forced.addEventListener('change',activity);document.fonts.ready.then(schedule);
 window.DSThemeEquipment=Object.freeze({refresh:reconcile});reconcile();
})();
