/* One authored field per existing scene. No props in navigation/data slots. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),cache=new Map(),NS='http://www.w3.org/2000/svg';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 let fields=null,scenes=null,serial=0,queued=false,focused=document.hasFocus();
 const xml=(name,attrs)=>{const el=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs||{}))el.setAttribute(k,v);return el;};
 const io=new IntersectionObserver(items=>{for(const e of items){const r=[...records.values()].find(r=>r.layer===e.target);if(r)r.inside=e.isIntersecting;}activity();});
 const resize=new ResizeObserver(schedule);
 function text(url){if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error(url);return r.text();}));return cache.get(url);}
 function picture(source){const doc=new DOMParser().parseFromString(source,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('Invalid native field');const el=document.importNode(doc.documentElement,true),prefix='native37-'+(++serial)+'-';for(const node of el.querySelectorAll('[id]')){const old=node.id;node.id=prefix+old;for(const item of el.querySelectorAll('*'))for(const a of [...item.attributes])if(a.value.includes('url(#'+old+')'))item.setAttribute(a.name,a.value.replaceAll('url(#'+old+')','url(#'+prefix+old+')'));}return el;}
 function animate(r,el,frames,duration,phase=0,easing='ease-in-out'){const a=el.animate(frames,{duration,iterations:Infinity,easing,fill:'both'});a.pause();a.currentTime=phase;a.nativePhase=phase;r.animations.push(a);}
 function activity(){
  const modal=[...document.querySelectorAll('dialog[open]')].at(-1),blocked=document.hidden||!focused||reduced.matches||forced.matches;
  for(const r of records.values()){const active=r.ready&&r.inside&&!r.layer.hidden&&!blocked&&(!modal||modal.contains(r.host));r.layer.dataset.sceneActive=String(active);for(const a of r.animations)if(active&&a.playState!=='running')a.play();else if(!active&&a.playState!=='paused')a.pause();}
 }
 function suppress(r){
  // Remove only the original field image on these two scenery surfaces. The
  // replacement contains its original fixed base and separately animated parts.
  const host=r.scope==='header'?r.host.closest('.work-console'):r.host;
  if(r.scope==='preview'||!host)return;
  if(r.painted===host)return;
  restore(r);r.painted=host;r.saved=[host.style.getPropertyValue('background-image'),host.style.getPropertyPriority('background-image')];
  const old=getComputedStyle(host).backgroundImage,next=old.replace(/url\(["']?[^)]*-identity-field\.svg["']?\)/g,'none');
  if(old!==next){host.style.setProperty('background-image',next,'important');r.applied=next;}
  if(r.scope==='sidebar')host.dataset.motion37=r.id;
 }
 function restore(r){if(r.painted){if(r.applied&&r.painted.style.getPropertyValue('background-image')===r.applied){if(r.saved[0])r.painted.style.setProperty('background-image',...r.saved);else r.painted.style.removeProperty('background-image');}delete r.painted.dataset.motion37;r.painted=null;r.applied=null;}}
 function layout(r){
  const h=r.host.getBoundingClientRect();let area={x:0,y:0,width:h.width,height:h.height};
  r.layer.hidden=!r.host.getClientRects().length||getComputedStyle(r.host).display==='none';
  if(r.scope==='sidebar'){
   const nav=r.host.querySelector('nav')?.getBoundingClientRect(),dock=r.host.querySelector('.sidebar-bottom')?.getBoundingClientRect();const top=nav?nav.bottom-h.top+12:h.height,bottom=dock?dock.top-h.top-12:top;
   area={x:0,y:Math.max(0,top),width:h.width,height:Math.max(0,bottom-top)};r.layer.style.clipPath=`inset(${area.y}px 0 ${Math.max(0,h.height-bottom)}px 0)`;
   if(innerWidth<=750||area.height<70)r.layer.hidden=true;
  }
  const scale=r.scope==='preview'?.7:1,right=r.scope==='header'?(h.width>600?125:-22):r.scope==='preview'?-50:0;
  r.field.style.right=right+'px';r.field.style.top=(area.y+area.height*.5-r.entry.focusY*scale)+'px';r.field.style.transform=`scale(${scale})`;r.field.style.transformOrigin='right top';
  if(r.photo){const s=getComputedStyle(r.host,'::after');r.photo.hidden=s.display==='none'||parseFloat(s.height)<50;for(const k of ['left','right','top','bottom','width','height'])r.photo.style[k]=s[k];}
  if(r.scope==='header'&&r.foreground){
   const b=r.field.getBoundingClientRect(),holes=[];const walker=document.createTreeWalker(r.host,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))if(n.textContent.trim()&&!n.parentElement.closest('.theme-live37')){const range=document.createRange();range.selectNodeContents(n);for(const a of range.getClientRects())if(a.width&&a.height)holes.push([a.left-b.left-7,a.top-b.top-4,a.width+14,a.height+8]);}
   for(const node of r.host.querySelectorAll('button,.button')){const a=node.getBoundingClientRect();holes.push([a.left-b.left-4,a.top-b.top-4,a.width+8,a.height+8]);}
   r.clip.replaceChildren(xml('path',{d:'M0 0H480V240H0Z '+holes.map(([x,y,w,h])=>`M${x} ${y}v${h}h${w}v-${h}Z`).join(' '),'clip-rule':'evenodd','fill-rule':'evenodd'}));
  }
 }
 async function build(r){
  const token=r.token,[base,front]=await Promise.all([text(r.entry.baseUrl),text(r.entry.foregroundUrl)]);if(records.get(r.key)!==r||r.token!==token)return;
  r.field=document.createElement('i');r.field.className='live-field37';const ground=picture(base),foreground=picture(front);r.foreground=foreground;r.field.append(ground,foreground);r.layer.append(r.field);
  if(r.scope==='header'){const defs=xml('defs'),clip=xml('clipPath',{id:'text-clear37-'+(++serial)}),body=xml('g',{'clip-path':'url(#'+clip.id+')'});for(const el of [...foreground.children])if(el.tagName.toLowerCase()!=='defs')body.append(el);defs.append(clip);foreground.append(defs,body);r.clip=clip;}
  for(const group of foreground.querySelectorAll('[data-motion-name]'))animate(r,group,JSON.parse(group.dataset.keyframes),Number(group.dataset.duration),Number(group.dataset.phase||0));
  const scene=scenes[r.id];
  if(scene&&r.scope==='sidebar'){
   const img=new Image();img.src=scene.url;await img.decode();if(records.get(r.key)!==r||r.token!==token)return;
   r.photo=document.createElement('i');r.photo.className='live-photo37';const svg=xml('svg',{viewBox:`0 0 ${scene.width} ${scene.height}`,preserveAspectRatio:'xMidYMid meet'}),cut=xml('image',{href:scene.url,width:scene.width,height:scene.height});cut.style.transformOrigin=scene.origin[0]+'px '+scene.origin[1]+'px';cut.style.transformBox='view-box';svg.append(cut);r.photo.append(svg);r.layer.append(r.photo);animate(r,cut,scene.frames,scene.duration,0,scene.name==='hangar-engine-interior'?'linear':'ease-in-out');r.layer.dataset.sceneObject=scene.name;
  }
  r.ready=true;r.layer.dataset.sceneReady='true';suppress(r);layout(r);activity();
 }
 function drop(r){r.token=null;for(const a of r.animations)a.cancel();io.unobserve(r.layer);resize.unobserve(r.host);restore(r);r.layer.remove();records.delete(r.key);}
 function reconcile(){
  queued=false;if(!fields)return;const id=root.dataset.graphicalStyle,entry=fields.find(e=>e.id===id),modal=document.querySelector('dialog[open] .appearance-effects-stage');
  const wants=entry?[['header',document.querySelector('.work-console>.page-head')],['sidebar',document.querySelector('.sidebar')],['preview',modal]].filter(x=>x[1]):[];
  for(const r of [...records.values()])if(r.id!==id||!wants.some(([scope])=>scope===r.scope))drop(r);
  for(const[scope,host]of wants){const key=id+'|'+scope;let r=records.get(key);if(!r){const layer=document.createElement('i');layer.className='theme-live37';layer.dataset.sceneTheme=id;layer.dataset.sceneScope=scope;layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');r={key,id,scope,host,entry,layer,animations:[],inside:false,ready:false,token:{}};records.set(key,r);host.append(layer);io.observe(layer);resize.observe(host);build(r).catch(e=>{if(records.get(key)===r)r.layer.dataset.sceneError=e.message;});}
   if(r.host!==host||r.layer.parentElement!==host){resize.unobserve(r.host);restore(r);r.host=host;host.append(r.layer);resize.observe(host);}
   if(r.ready){suppress(r);layout(r);}
  }activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.('.theme-live37')&&!(c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches('.theme-live37')))))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style']});window.addEventListener('resize',schedule);document.fonts.ready.then(schedule);
 window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('blur',()=>{focused=false;activity();});document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});reduced.addEventListener('change',activity);forced.addEventListener('change',activity);
 function preview(){if(reduced.matches||forced.matches||!focused||document.hidden)return false;for(const r of records.values())if(r.scope==='preview')for(const a of r.animations)a.currentTime=1800+(a.nativePhase||0);activity();return true;}
 window.DSThemeNativeMotion={refresh:reconcile,preview,diagnostics:()=>[...records.values()].map(r=>({id:r.id,scope:r.scope,ready:r.ready,active:r.layer.dataset.sceneActive==='true',hidden:r.layer.hidden,error:r.layer.dataset.sceneError||null,names:r.entry.names,times:r.animations.map(a=>a.currentTime)}))};
 Promise.all([fetch('/themes/motion37/field-catalog.json').then(r=>r.json()),fetch('/themes/motion37/scene-catalog.json').then(r=>r.json())]).then(([f,s])=>{fields=f;scenes=s;schedule();}).catch(()=>{});
})();
