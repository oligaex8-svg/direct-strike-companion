/* Light only: source sculpture, pixel coordinates and the data layout stay fixed. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),cache=new Map();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 let catalog=null,queued=false,focused=document.hasFocus(),serial=0;
 const geometry=['top','right','bottom','left','width','height','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderImageSlice','borderImageWidth','borderImageOutset','borderImageRepeat','boxSizing','transform','transformOrigin'];
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const r=records.get(entry.target);if(r)r.inside=entry.isIntersecting;}activity();});
 function activity(){
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),blocked=document.hidden||!focused||reduce.matches||forced.matches;
  for(const r of records.values()){
   const active=!blocked&&r.ready&&r.inside&&(!dialog||dialog.contains(r.host));
   r.layer.dataset.nativeFrameActive=String(active);
   if(active){if(r.animation.playState!=='running')r.animation.play();}else if(r.animation.playState!=='paused')r.animation.pause();
   // Accessibility suppression also removes the additive static highlight.
   r.layer.hidden=reduce.matches||forced.matches||!r.ready;
  }
 }
 function decoded(src){if(!cache.has(src)){const image=new Image();image.src=src;cache.set(src,image.decode());}return cache.get(src);}
 function frames(mode,phase){
  // Never extinguish the light: native base pixels remain present throughout.
  const level=mode==='tissue'?[.12,.26,.48,.30,.12]:mode==='ember'?[.14,.42,.26,.68,.14]:mode==='refraction'?[.16,.36,.62,.34,.16]:[.12,.58,.24,.45,.12];
  return Array.from({length:13},(_,i)=>{const p=(i/12+phase)%1,n=p*4,j=Math.floor(n);return {offset:i/12,opacity:level[j]+(level[j+1]-level[j])*(n-j)};});
 }
 function drop(r){r.token=null;r.animation.cancel();observer.unobserve(r.layer);r.layer.remove();records.delete(r.layer);}
 function refresh(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 function reconcile(){
  queued=false;if(!catalog)return;
  const id=root.dataset.graphicalStyle,entry=catalog.themes[id],stage=document.querySelector('#settings-dialog .appearance-effects-stage');
  if(stage){if(entry&&id!=='fenix')stage.dataset.nativeFramePreview=id;else delete stage.dataset.nativeFramePreview;}
  const scopes=[['shell',document.querySelector('.work-console')],['preview',stage]].map(([scope,host])=>({scope,host,pseudo:host&&getComputedStyle(host,'::before')})).filter(s=>entry&&id!=='fenix'&&id!=='zerg'&&id!=='protoss'&&s.pseudo?.borderImageSource.includes(id+'-console-shell-frame.png'));
  for(const r of [...records.values()])if(r.id!==id||!scopes.some(s=>s.scope===r.scope))drop(r);
  for(const {scope,host,pseudo} of scopes)for(const item of entry.layers){
   let r=[...records.values()].find(r=>r.scope===scope&&r.src===item.src);
   if(!r){
    const layer=document.createElement('i');layer.className='native-frame-light36';layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.hidden=true;layer.dataset.nativeFrameTheme=id;layer.dataset.nativeFrameSource=item.src;layer.dataset.nativeFrameScope=scope;
    const animation=layer.animate(frames(entry.mode,item.phase),{duration:entry.duration,iterations:Infinity,easing:'linear',fill:'both'});animation.pause();
    r={layer,host,id,scope,src:item.src,animation,ready:false,inside:false,token:++serial};records.set(layer,r);host.append(layer);observer.observe(layer);
    const token=r.token;decoded(item.src).then(()=>{if(r.token!==token||!records.has(layer))return;r.ready=true;layer.style.borderImageSource='url("'+item.src+'")';activity();}).catch(()=>{if(r.token===token)layer.dataset.nativeFrameError='decode';});
   }
   for(const clone of host.querySelectorAll(':scope>.native-frame-light36'))if(clone!==r.layer&&clone.dataset.nativeFrameSource===r.src)clone.remove();
   if(r.host!==host||r.layer.parentElement!==host){r.host=host;host.append(r.layer);}
   for(const property of geometry)if(r.layer.style[property]!==pseudo[property])r.layer.style[property]=pseudo[property];
  }
  activity();
 }
 new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.('.native-frame-light36')&&!(c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches('.native-frame-light36')))))refresh();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 new MutationObserver(refresh).observe(root,{attributes:true,attributeFilter:['data-graphical-style','data-native-console']});
 document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});window.addEventListener('blur',()=>{focused=false;activity();});window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('resize',refresh);reduce.addEventListener('change',activity);forced.addEventListener('change',activity);
 function preview(){
  if(document.hidden||!focused||reduce.matches||forced.matches)return 0;
  const modal=[...document.querySelectorAll('dialog[open]')].at(-1);if(!modal)return 0;
  // Explicit demo consent changes only the modal's frame clock; the live shell
  // retains its paused phase behind the backdrop and no focus is moved.
  reconcile();let count=0;
  for(const r of records.values())if(r.scope==='preview'&&modal.contains(r.host)){r.animation.currentTime=catalog.themes[r.id].duration*.26;count++;}
  activity();return count;
 }
 window.DSNativeFrameMotion={refresh,preview,diagnostics:()=>[...records.values()].map(r=>({theme:r.id,scope:r.scope,source:r.src,ready:r.ready,active:r.layer.dataset.nativeFrameActive==='true',time:r.animation.currentTime,state:r.animation.playState}))};
 fetch('/themes/native-motion36/catalog.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Native light catalog '+r.status);return r.json();}).then(value=>{catalog=value;refresh();}).catch(()=>{});
})();
