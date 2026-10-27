/* Existing raster anatomy, registered to its original nine-slice frame. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),decodes=new Map();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 const wellSelector='.profile-commanders,.live-team-group,.pick-opponent,.sounds-recordings,.combat-card,.table-wrap';
 let catalog=null,queued=false,focused=document.hasFocus(),currentTheme='';
 const io=new IntersectionObserver(items=>{for(const item of items){for(const r of records.values())if(r.layer===item.target)r.inside=item.isIntersecting;}activity();});
 const resize=new ResizeObserver(schedule);
 const number=value=>Number.parseFloat(value)||0;
 const four=value=>{const a=value.trim().split(/\s+/);return [a[0],a[1]||a[0],a[2]||a[0],a[3]||a[1]||a[0]];};
 function decoded(url){
  if(!decodes.has(url)){const image=new Image();image.src=url;decodes.set(url,image.decode().then(()=>true));}
  return decodes.get(url);
 }
 function activity(){
  const modal=document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1),blocked=document.hidden||!focused||reduced.matches||forced.matches;
  for(const r of records.values()){
   const active=!blocked&&r.ready&&r.inside&&r.valid&&(!modal||modal.contains(r.host));
   const hidden=!r.ready||!r.valid||reduced.matches||forced.matches;if(r.layer.hidden!==hidden)r.layer.hidden=hidden;
   r.layer.dataset.materialActive=String(active);
   for(const p of r.patches){if(active&&p.animation.playState!=='running')p.animation.play();else if(!active&&p.animation.playState!=='paused')p.animation.pause();}
  }
 }
 // CSS border-image-width can be a length, fraction of the physical border,
 // or percentage of its axis. Outsets can only be lengths or border multiples.
 function length(value,border,axis){if(value.endsWith('%'))return number(value)*axis/100;if(value.endsWith('px'))return number(value);return number(value)*border;}
 function box(r){
  const s=getComputedStyle(r.host,'::before');
  if(s.display==='none'||s.content==='none'||!s.borderImageSource.includes(r.source.url))return null;
  const border=[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth].map(number);
  let width=number(s.width),height=number(s.height);
  if(s.boxSizing!=='border-box'){width+=border[1]+border[3]+number(s.paddingLeft)+number(s.paddingRight);height+=border[0]+border[2]+number(s.paddingTop)+number(s.paddingBottom);}
  if(width<=0||height<=0)return null;
  const outset=four(s.borderImageOutset).map((v,i)=>length(v,border[i],i%2?width:height));
  const areaWidth=width+outset[1]+outset[3],areaHeight=height+outset[0]+outset[2];
  const paint=four(s.borderImageWidth).map((v,i)=>length(v,border[i],i%2?areaWidth:areaHeight));
  const factor=Math.min(1,areaWidth/(paint[1]+paint[3]),areaHeight/(paint[0]+paint[2]));
  return {x:number(s.left)-outset[3],y:number(s.top)-outset[0],width:areaWidth,height:areaHeight,paint:paint.map(v=>v*factor)};
 }
 function layout(r){
  const b=box(r);r.valid=!!b&&!!r.host.getClientRects().length;
  if(!b)return;
  Object.assign(r.layer.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
  const [sourceWidth,sourceHeight]=r.source.dimensions,[top,right,bottom,left]=r.source.slice;
  for(const p of r.patches){
   const patch=p.entry,[x,y,w,h]=patch.crop,isRight=patch.corner.endsWith('right'),isBottom=patch.corner.startsWith('bottom');
   const sx=b.paint[isRight?1:3]/(isRight?right:left),sy=b.paint[isBottom?2:0]/(isBottom?bottom:top);
   const px=isRight?b.width-b.paint[1]+(x-sourceWidth+right)*sx:x*sx;
   const py=isBottom?b.height-b.paint[2]+(y-sourceHeight+bottom)*sy:y*sy;
   Object.assign(p.viewport.style,{left:px+'px',top:py+'px',transform:`scale(${w*sx/patch.tile[0]},${h*sy/patch.tile[1]})`});
  }
 }
 function mount(layer,host){const children=[...host.children].filter(e=>e!==layer);host.insertBefore(layer,children.length>1?children[1]:children[0]||null);}
 function makeRecord(key,id,kind,scope,host,entry){
  const layer=document.createElement('i');layer.className='material-motion38';layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.hidden=true;
  layer.dataset.materialTheme=id;layer.dataset.materialScope=scope;
  const r={key,id,kind,scope,host,entry,layer,source:entry.sources.find(s=>s.kind===kind),patches:[],ready:false,inside:false,valid:false,token:{}};
  for(const patch of entry.patches.filter(p=>p.kind===kind)){
   const [w,h]=patch.tile,viewport=document.createElement('i'),atlas=document.createElement('i');viewport.className='material-patch38';atlas.className='material-atlas38';
   viewport.dataset.materialFeatures=patch.features.map(f=>f.name).join(' ');
   Object.assign(viewport.style,{width:w+'px',height:h+'px'});
   Object.assign(atlas.style,{width:w*catalog.columns+'px',height:h*catalog.rows+'px',backgroundImage:`url("${patch.url}")`});
   viewport.append(atlas);layer.append(viewport);
   // One stepped transform selects an entire cached raster frame atomically.
   const frames=Array.from({length:catalog.frames+1},(_,i)=>{const n=i%catalog.frames;return {offset:i/catalog.frames,easing:'steps(1,end)',transform:`translate(${-(n%catalog.columns)*w}px,${-Math.floor(n/catalog.columns)*h}px)`};});
   const animation=atlas.animate(frames,{duration:entry.duration,iterations:Infinity,easing:'linear',fill:'both'});animation.pause();
   animation.currentTime=scope==='well-1'?entry.duration*.31:0;
   r.patches.push({entry:patch,viewport,atlas,animation});
  }
  records.set(key,r);mount(layer,host);io.observe(layer);resize.observe(host);
  const token=r.token;
  Promise.all(r.patches.map(p=>decoded(p.entry.url))).then(()=>{if(records.get(key)!==r||r.token!==token)return;r.ready=true;layout(r);activity();}).catch(()=>{if(records.get(key)===r)r.layer.dataset.materialError='decode';});
  return r;
 }
 function drop(r){r.token=null;for(const p of r.patches)p.animation.cancel();io.unobserve(r.layer);resize.unobserve(r.host);r.layer.remove();records.delete(r.key);}
 function reconcile(){
  queued=false;if(!catalog)return;
  const id=root.dataset.graphicalStyle,entry=catalog.themes[id];
  if(currentTheme!==id){decodes.clear();currentTheme=id;}
  const wants=[];
  const preview=document.querySelector('#settings-dialog .appearance-effects-stage');
  if(preview){if(entry)preview.dataset.materialPreview=id;else delete preview.dataset.materialPreview;}
  if(entry){
   const shell=document.querySelector('.work-console');if(shell)wants.push({scope:'shell',kind:'shell',host:shell});
   const hosts=[...document.querySelectorAll('.work-console '+wellSelector.split(',').join(',.work-console '))].filter(host=>host.getClientRects().length&&getComputedStyle(host,'::before').borderImageSource.includes('/well-'+id+'.png')).slice(0,2);
   hosts.forEach((host,i)=>wants.push({scope:'well-'+i,kind:'well',host}));
   if(preview?.closest('dialog[open]')&&!preview.hasAttribute('data-surface41-preview')&&!preview.hasAttribute('data-pylon42-preview')&&!preview.hasAttribute('data-native45-preview'))wants.push({scope:'preview',kind:'well',host:preview});
  }
  for(const r of [...records.values()])if(r.id!==id||!wants.some(w=>w.scope===r.scope))drop(r);
  for(const want of wants){
   const key=id+'|'+want.scope;let r=records.get(key);
   if(!r)r=makeRecord(key,id,want.kind,want.scope,want.host,entry);
   if(r.host!==want.host||r.layer.parentElement!==want.host){resize.unobserve(r.host);r.host=want.host;mount(r.layer,r.host);resize.observe(r.host);}
   layout(r);
  }
  activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 function preview(){if(document.hidden||!focused||reduced.matches||forced.matches)return false;reconcile();const modal=[...document.querySelectorAll('dialog[open]')].at(-1);let count=0;for(const r of records.values())if(r.scope==='preview'&&modal?.contains(r.host)){for(const p of r.patches)p.animation.currentTime=r.entry.duration*.25;count++;}activity();return count>0;}
 new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.('.material-motion38,.theme-surface41,.protoss-pylon42')&&!(c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches('.material-motion38,.theme-surface41,.protoss-pylon42')))))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style','data-native-console']});
 window.addEventListener('resize',schedule);window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('blur',()=>{focused=false;activity();});document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});
 reduced.addEventListener('change',activity);forced.addEventListener('change',()=>{schedule();activity();});document.fonts.ready.then(schedule);
 const api=Object.freeze({refresh:reconcile,preview,diagnostics:()=>[...records.values()].map(r=>({id:r.id,scope:r.scope,kind:r.kind,ready:r.ready,valid:r.valid,active:r.layer.dataset.materialActive==='true',error:r.layer.dataset.materialError||null,features:r.patches.flatMap(p=>p.entry.features.map(f=>f.name)),times:r.patches.map(p=>p.animation.currentTime),states:r.patches.map(p=>p.animation.playState)}))});
 window.DSMaterialMotion=api;window.DSThemeNativeMotion=api;
 fetch('/themes/material38/catalog.json').then(response=>{if(!response.ok)throw Error('Material catalog '+response.status);return response.json();}).then(value=>{catalog=value;schedule();}).catch(()=>{});
})();
