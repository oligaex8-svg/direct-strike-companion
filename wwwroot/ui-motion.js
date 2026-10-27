/* Finite feedback for real data changes. Decorative rails never change text layout. */
(() => {
 'use strict';
 const values=new Map(),running=new Map(),seenMeters=new Set(),pendingMeters=new WeakMap(),watchedMeters=new Set();
 const percentSelector='#overall-rate,.profile-results>strong,.profile-favourite-rate>strong,.profile-best-rate,[data-ui-meter-value]';
 const ratingSelector='.profile-region-data>strong,.profile-region .dsstats-value strong,.site-account-rating>strong:not(.site-rating-empty),.live-rating-value';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 const ease='cubic-bezier(0.23, 1, 0.32, 1)';
 let keyboard=false,queued=false;
 document.documentElement.dataset.uiMotionInput='pointer';
 const numeric=text=>{const value=String(text).trim().replace(/[\s\u00a0\u202f,]/g,'');return /^[-+]?\d+(?:\.\d+)?$/.test(value)?Number(value):null;};
 function remember(key,value){
  const previous=values.get(key);values.delete(key);values.set(key,value);
  if(values.size>256)values.delete(values.keys().next().value);
  return previous;
 }
 function scope(element){
  const dialog=element.closest('dialog');
  return dialog?.id||document.querySelector('.sidebar .nav.active')?.dataset.view||'page';
 }
 function identity(element){
  if(element.dataset.uiMeterKey)return element.dataset.uiMeterKey;
  if(element.matches('.profile-results>strong'))return 'profile-overall-rate';
  if(element.matches('.profile-favourite-rate>strong'))return 'profile-favourite-rate';
  if(element.id)return element.id;
  const best=element.closest('.profile-best-card');
  if(best)return 'commander:'+best.querySelector('[data-commander]')?.dataset.commander+':'+best.querySelector('h4')?.textContent;
  const account=element.closest('.site-account-entry');
  if(account)return 'site:'+account.querySelector('a[href]')?.getAttribute('href');
  const regional=element.closest('[data-site-player]');
  if(regional)return 'regional:'+regional.dataset.sitePlayer+':'+(element.closest('.dsstats-rating')?'dsstats':'dsr');
  const live=element.closest('.live-profile');
  if(live){
   const summary=element.closest('.live-rating-summary');
   const region=summary?.dataset.region||summary?.querySelector('.live-rating-label')?.textContent.trim()||'';
   return 'live:'+(live.querySelector('[data-player],[data-lobby-pick-toggle]')?.dataset.player||live.querySelector('[data-lobby-pick-toggle]')?.dataset.lobbyPickToggle||live.querySelector('h3')?.textContent)+':'+element.closest('[data-rating-source]')?.dataset.ratingSource+':'+region;
  }
  const stable=e=>[...(e?.classList||[])].filter(c=>!c.startsWith('ui-')).join('.');
  return [element.tagName,stable(element),stable(element.parentElement),[...document.querySelectorAll(percentSelector+','+ratingSelector)].indexOf(element)].join(':');
 }
 function stop(){for(const animation of running.values())animation.cancel();running.clear();}
 function feedback(element,frames,duration=200,delay=0){
  if(!element)return;
  const active=running.get(element);if(active)active.cancel();
  if(document.hidden||keyboard||forced.matches||reduced.matches||typeof element.animate!=='function')return;
  const animation=element.animate(frames,{duration,easing:ease,delay});
  running.set(element,animation);
  const clean=()=>{if(running.get(element)===animation)running.delete(element);};
  animation.addEventListener('finish',clean,{once:true});animation.addEventListener('cancel',clean,{once:true});
 }
 const meterVisibility=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   const info=pendingMeters.get(entry.target);meterVisibility.unobserve(entry.target);watchedMeters.delete(entry.target);
   if(!info||seenMeters.has(info.key))continue;
   seenMeters.add(info.key);
   if(seenMeters.size>256)seenMeters.delete(seenMeters.values().next().value);
   if(info.value>0)feedback(info.fill,[{opacity:.2,transform:`scaleX(${info.value/400})`},{opacity:.8,transform:`scaleX(${info.value/100})`}],240);
  }
 });
 function meter(element){
  const raw=element.dataset.uiMeterValue??element.textContent.trim();
  const value=element.hasAttribute('data-ui-meter-value')?numeric(raw):/^\d+(?:[.,]\d+)?\s*%$/.test(raw)?Number(raw.replace('%','').replace(',','.').trim()):null;
  let rail=element.querySelector(':scope > .ui-data-rail');
  const key=scope(element)+':meter:'+identity(element);
  if(value===null||!Number.isFinite(value)||value<0||value>100){rail?.remove();element.classList.remove('ui-meter-host');values.delete(key);return;}
  const previous=remember(key,value);
  if(!rail){
   rail=document.createElement('span');rail.className='ui-data-rail';rail.setAttribute('aria-hidden','true');
   const fill=document.createElement('i');rail.append(fill);element.append(rail);element.classList.add('ui-meter-host');
  }
  const fill=rail.firstElementChild,target=`scaleX(${value/100})`;
  if(fill.style.transform!==target)fill.style.transform=target;
  if(!seenMeters.has(key)){pendingMeters.set(element,{key,value,fill});watchedMeters.add(element);meterVisibility.observe(element);}
  if(previous!==undefined&&previous!==value)feedback(fill,[{transform:`scaleX(${previous/100})`},{transform:target}]);
 }
 function rating(element){
  // Values remain steady even when a site updates. Presentation never flashes
  // the number or a coloured box behind it.
  element.querySelector(':scope > .ui-rating-feedback')?.remove();
 }
 function refresh(){
  queued=false;
  for(const [element,animation] of running)if(!element.isConnected){animation.cancel();running.delete(element);}
  for(const element of watchedMeters)if(!element.isConnected){meterVisibility.unobserve(element);watchedMeters.delete(element);}
  document.querySelectorAll(percentSelector).forEach(meter);
  document.querySelectorAll(ratingSelector).forEach(rating);
 }
 function schedule(records){
  if(records?.every(record=>{const target=record.target.nodeType===1?record.target:record.target.parentElement;return target?.closest('.ui-data-rail,.ui-rating-feedback')||record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===1&&node.matches('.ui-data-rail,.ui-rating-feedback'));}))return;
  if(!queued){queued=true;queueMicrotask(refresh);}
 }
 function preview(){if(window.DSCharacterTech?.preview())return true;window.DSEquipmentActivity?.preview();window.DSTerranInstruments?.preview();window.DSNativeRace?.preview();if(window.DSCampaignInteriors?.preview()){if(document.documentElement.dataset.graphicalStyle==='protoss')window.DSProtossFeedback?.preview();return true;}if(['terran','zerg'].includes(document.documentElement.dataset.graphicalStyle))return window.DSNativeTech?.preview?.()??false;if(document.documentElement.dataset.graphicalStyle==='protoss'){window.DSProtossPower?.preview();const pylon=window.DSProtossPylon?.preview?.()??false;return (window.DSProtossFeedback?.preview?.()??false)||pylon;}return document.documentElement.dataset.graphicalStyle==='fenix'?(window.DSInPlaceMotion?.preview()??false):(window.DSThemeSurfaces?.preview?.()||window.DSThemeNativeMotion?.preview?.()||false);}
 document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-ui-motion-preview]'))preview();},true);
 document.addEventListener('keydown',()=>{keyboard=true;document.documentElement.dataset.uiMotionInput='keyboard';stop();},true);
 document.addEventListener('pointerdown',()=>{keyboard=false;document.documentElement.dataset.uiMotionInput='pointer';},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();refresh();});
 reduced.addEventListener('change',stop);forced.addEventListener('change',stop);
 new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['data-ui-meter-value','open']});
 window.DSUiMotion=Object.freeze({refresh,preview});
 refresh();
})();
