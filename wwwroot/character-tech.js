/* Original theme-specific SC2 models, confined to the unused sidebar recess. */
(() => {
 'use strict';
 const root=document.documentElement,records=new Map(),images=new Map();
 const allowed=new Set(['nova','mira','machined','tyrador','classic-terran','nerazim','alarak','ihanrii','classic-protoss','arcade','abathur','dehaka','cerberus','mecha','classic-zerg']);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)'),forced=matchMedia('(forced-colors:active)');
 let catalog=null,queued=false,focused=document.hasFocus(),held=false,lastTheme='',error=null;
 const io=new IntersectionObserver(entries=>{for(const entry of entries){const r=[...records.values()].find(r=>r.layer===entry.target);if(r)r.inside=entry.isIntersecting;}activity();});
 const ro=new ResizeObserver(schedule);
 function decode(url){if(!images.has(url)){const image=new Image();image.src=url;images.set(url,image.decode());}return images.get(url);}
 const nativeBlur=()=>!focused&&!!window.chrome?.webview&&!(typeof state!=='undefined'&&state.libraryVersion==='local-ui-preview');
 function register(){const next=[...records.values()].some(r=>r.ready)?root.dataset.graphicalStyle:'';if((root.dataset.character54||'')!==next){if(next)root.dataset.character54=next;else delete root.dataset.character54;window.DSThemeSurfaces?.refresh();}for(const r of records.values())if(r.scope==='preview'){if(r.ready)r.host.dataset.character54Preview=r.id;else delete r.host.dataset.character54Preview;}}
 function activity(){const modal=document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1);for(const r of records.values()){
  const hidden=!r.ready||!r.visible||forced.matches;if(r.layer.hidden!==hidden)r.layer.hidden=hidden;
  r.poster.hidden=!reduced.matches&&r.asset.count>1;r.viewport.hidden=reduced.matches||r.asset.count===1;
  r.active=r.ready&&r.visible&&r.inside&&!held&&!document.hidden&&!nativeBlur()&&!reduced.matches&&!forced.matches&&(!modal||modal.contains(r.host));
  if(r.animation){if(r.active&&r.animation.playState==='paused')r.animation.play();else if(!r.active&&r.animation.playState==='running')r.animation.pause();}
  r.layer.dataset.character54Active=String(r.active);
 }}
 function fit(r){const host=r.host,[w,h]=r.asset.tile;let left=8,top=8,width=host.clientWidth-16,height=host.clientHeight-16;r.visible=!!host.getClientRects().length;
  if(r.scope==='sidebar'){const box=host.getBoundingClientRect(),nav=host.querySelector('nav')?.getBoundingClientRect(),dock=host.querySelector('.sidebar-bottom')?.getBoundingClientRect();if(innerWidth<=750||!nav||!dock){r.visible=false;return;}top=nav.bottom-box.top-host.clientTop+10;height=dock.top-nav.bottom-20;if(height<130){r.visible=false;return;}}
  const scale=Math.min(width/w,height/h);if(scale<=0){r.visible=false;return;}Object.assign(r.layer.style,{left:left+(width-w*scale)/2+'px',top:top+(height-h*scale)/2+'px',width:w+'px',height:h+'px',transform:`scale(${scale})`});
 }
 function mount(r){const children=[...r.host.children].filter(e=>e!==r.layer);r.host.insertBefore(r.layer,children[1]||children[0]||null);}
 function drop(r){r.animation?.cancel();io.unobserve(r.layer);ro.unobserve(r.host);delete r.host.dataset.character54Preview;r.layer.remove();records.delete(r.scope);}
 function create(scope,host,id,asset){const layer=document.createElement('i'),poster=document.createElement('img'),viewport=document.createElement('i'),atlas=document.createElement('i');
  layer.className='character54-object';layer.dataset.character54Scope=scope;layer.dataset.character54Object=id;layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.hidden=true;
  poster.className='character54-poster';poster.src=asset.poster;poster.alt='';poster.draggable=false;viewport.className='character54-viewport';atlas.className='character54-atlas';const [w,h]=asset.tile;Object.assign(atlas.style,{width:w*asset.columns+'px',height:h*asset.rows+'px',backgroundImage:`url("${asset.atlas}")`});viewport.append(atlas);layer.append(poster,viewport);
  const r={scope,host,id,asset,layer,poster,viewport,atlas,animation:null,ready:false,visible:false,inside:false,active:false};records.set(scope,r);mount(r);
  if(asset.count>1){r.animation=atlas.animate(Array.from({length:asset.count+1},(_,i)=>{const f=i%asset.count;return{offset:i/asset.count,easing:'steps(1,end)',transform:`translate(${-(f%asset.columns)*w}px,${-Math.floor(f/asset.columns)*h}px)`};}),{duration:asset.duration,iterations:Infinity,fill:'both',easing:'linear'});r.animation.pause();r.animation.currentTime=0;}
  fit(r);io.observe(layer);ro.observe(host);Promise.all([decode(asset.atlas),decode(asset.poster)]).then(()=>{if(records.get(scope)!==r)return;r.ready=true;fit(r);register();activity();}).catch(e=>{if(records.get(scope)!==r)return;error=String(e);drop(r);register();activity();});return r;
 }
 function valid(a){return a&&typeof a.atlas==='string'&&typeof a.poster==='string'&&Array.isArray(a.tile)&&a.tile.length===2&&a.tile.every(v=>Number.isFinite(v)&&v>0)&&Number.isInteger(a.count)&&a.count>0&&Number.isInteger(a.columns)&&a.columns>0&&Number.isInteger(a.rows)&&a.rows>0&&a.count<=a.columns*a.rows&&Number.isFinite(a.duration)&&a.duration>0;}
 function refresh(){queued=false;if(!catalog)return;const theme=root.dataset.graphicalStyle,id=allowed.has(theme)?catalog.themes?.[theme]:null,asset=catalog.objects?.[id],wants=[];
  if(lastTheme!==theme){lastTheme=theme;images.clear();error=null;}
  if(valid(asset)){const side=document.querySelector('.sidebar'),stage=document.querySelector('#settings-dialog[open] .appearance-effects-stage');if(side&&innerWidth>750)wants.push(['sidebar',side]);if(stage)wants.push(['preview',stage]);}
  for(const r of [...records.values()])if(r.id!==id||!wants.some(([scope,host])=>r.scope===scope&&r.host===host))drop(r);
  for(const [scope,host]of wants){let r=records.get(scope);if(!r)r=create(scope,host,id,asset);else{if(r.layer.parentElement!==host)mount(r);fit(r);}}
  register();activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(refresh);}}
 const own='.character54-object,.theme-surface41,.material-motion38,.campaign48-scene,.equipment51-optics,.native45-object,.protoss-pylon42,.protoss-power47,.race46-bio,.race46-lamp,.native-frame-light36,.stable-scroll-frame46,.ui-data-rail,.ui-rating-feedback';
 new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.(own)&&!(c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches(own)))))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style']});window.addEventListener('resize',schedule);window.addEventListener('focus',()=>{focused=true;activity();});window.addEventListener('blur',()=>{focused=false;activity();});document.addEventListener('visibilitychange',activity);reduced.addEventListener('change',activity);forced.addEventListener('change',activity);document.fonts.ready.then(schedule);
 window.DSCharacterTech=Object.freeze({refresh,seek:ms=>{held=true;for(const r of records.values())if(r.animation){r.animation.pause();r.animation.currentTime=ms;}activity();},resume:()=>{held=false;activity();},preview:()=>{if(!allowed.has(root.dataset.graphicalStyle)||!valid(catalog?.objects?.[catalog?.themes?.[root.dataset.graphicalStyle]]))return false;held=false;refresh();const r=records.get('preview');if(!r?.ready)return false;if(r.animation)r.animation.currentTime=0;activity();return true;},diagnostics:()=>[...records.values()].map(r=>({scope:r.scope,id:r.id,theme:root.dataset.graphicalStyle,sourceModel:r.asset.sourceModel,title:r.asset.title,ready:r.ready,visible:r.visible,inside:r.inside,active:r.active,time:r.animation?.currentTime??0,state:r.animation?.playState??'static',frames:r.asset.count,error}))});
 fetch('/themes/character54/catalog.json').then(r=>{if(!r.ok)throw Error('Native character catalog unavailable');return r.json();}).then(value=>{catalog=value;schedule();}).catch(e=>{error=String(e);});
})();
