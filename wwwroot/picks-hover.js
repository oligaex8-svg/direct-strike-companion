'use strict';

(() => {
 const popup=document.getElementById('lobby-pick-preview');
 if(!popup)return;
 let current=null,suppressed='',pointerType='',inputMode='keyboard',pointerNode=null,restoringFocus=false;
 const candidate=target=>target?.closest?.('[data-lobby-pick-toggle], .live-profile-link');
 function targetFor(node){
  const id=node?.dataset.lobbyPickToggle||node?.dataset.player;
  if(!id)return null;
  const kind=node.dataset.lobbyPickKind||'player',commander=node.dataset.lobbyPickCommander||'',game=node.dataset.lobbyPickGame||'';
  return {id,kind,commander,game,key:JSON.stringify([id,kind,commander,game,node.matches('.live-profile-link')?'profile':'toggle'])};
 }
 const find=key=>[...document.querySelectorAll('[data-lobby-pick-toggle], .live-profile-link')].find(node=>targetFor(node)?.key===key);
 const blocked=()=>!!document.querySelector('dialog[open]');
 const inside=(node,target)=>!!node&&!!target&&(node===target||node.contains(target));
 function describe(node,open){
  if(node.matches('[data-lobby-pick-toggle]'))node.setAttribute('aria-expanded',String(open));
  const ids=(node.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==popup.id);
  if(open)ids.push(popup.id);
  if(ids.length)node.setAttribute('aria-describedby',ids.join(' '));else node.removeAttribute('aria-describedby');
 }
 function close(){if(current)describe(current.node,false);current=null;popup.hidden=true;popup.innerHTML='';popup.scrollTop=0;}
 function position(event){
  if(!current||popup.hidden||inside(popup,event?.target))return;
  const scrollTop=popup.scrollTop;
  const margin=12,gap=18;
  const viewportWidth=document.documentElement.clientWidth||window.innerWidth;
  const viewportHeight=document.documentElement.clientHeight||window.innerHeight;
  const viewportLimit=Math.max(0,viewportHeight-2*margin);
  // Reset the previous regional cap before measuring a changed translation or viewport.
  popup.style.setProperty('--pick-preview-max-height',`${viewportLimit}px`);
  const bounds=popup.getBoundingClientRect(),width=bounds.width;
  let height=Math.min(bounds.height,viewportLimit);
  const rect=(current.anchor?.isConnected?current.anchor:current.node).getBoundingClientRect();
  // A resize can leave the last desktop pointer outside the new client viewport.
  // Discard it so the current trigger controls mobile placement and height caps.
  if(current.point&&(!Number.isFinite(current.point.x)||!Number.isFinite(current.point.y)||
   current.point.x<0||current.point.x>=viewportWidth||current.point.y<0||current.point.y>=viewportHeight))current.point=null;
  const point=current.point,anchorLeft=point?point.x:rect.left,anchorRight=point?point.x:rect.right;
  const anchorTop=point?point.y:rect.top,anchorBottom=point?point.y:rect.bottom;
  const right=anchorRight+gap,leftSide=anchorLeft-width-gap;
  const fitsRight=right+width<=viewportWidth-margin, fitsLeft=leftSide>=margin;
  let left=fitsRight?right:leftSide,top=point?point.y+gap:rect.top;
  if(!fitsRight&&!fitsLeft){
   // A full-width mobile preview goes wholly above or below its trigger/pointer.
   const above=Math.max(0,Math.min(viewportLimit,anchorTop-gap-margin));
   const below=Math.max(0,Math.min(viewportLimit,viewportHeight-margin-anchorBottom-gap));
   const useAbove=above>=below,available=useAbove?above:below;
   popup.style.setProperty('--pick-preview-max-height',`${available}px`);
   height=Math.min(height,available);
   left=(anchorLeft+anchorRight-width)/2;
   top=useAbove?anchorTop-gap-height:anchorBottom+gap;
  }else if(top+height>viewportHeight-margin)top=anchorBottom-height-gap;
  left=Math.max(margin,Math.min(left,viewportWidth-width-margin));
  top=Math.max(margin,Math.min(top,viewportHeight-height-margin));
  popup.style.setProperty('--pick-preview-left',`${left}px`);
  popup.style.setProperty('--pick-preview-top',`${top}px`);
  // Measuring without the regional cap can clamp scrollTop; restore after final sizing.
  popup.scrollTop=scrollTop;
 }
 function show(node,options={}){
  const target=targetFor(node);
  if(!target||blocked()||suppressed===target.key)return;
  const html=renderLobbyPickPreview(target.id,target);
  if(!html){close();return;}
  const scrollTop=current?.key===target.key?popup.scrollTop:0;
  if(current&&current.node!==node)describe(current.node,false);
  const mode=options.mode||'focus',point=options.point===undefined&&mode==='hover'&&current?.key===target.key?current.point:options.point||null;
  current={...target,node,anchor:node,point,mode};
  popup.innerHTML=html;popup.hidden=false;describe(node,true);position();popup.scrollTop=scrollTop;
 }
 document.addEventListener('pointerdown',event=>{pointerType=event.pointerType;inputMode='pointer';},true);
 document.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch')return;
  inputMode='pointer';pointerType=event.pointerType;
  if(inside(popup,event.target))return;
  const node=candidate(event.target);
  if(node&&!inside(node,event.relatedTarget)){
   pointerNode=node;show(node,{mode:'hover',point:{x:event.clientX,y:event.clientY}});
  }
 });
 document.addEventListener('pointerout',event=>{
  if(event.pointerType==='touch')return;
  const node=candidate(event.target);
  if(node&&!inside(node,event.relatedTarget)){
   if(pointerNode===node)pointerNode=null;
   if(suppressed===targetFor(node)?.key)suppressed='';
   // Mouse focus and clicks never keep a hover popup alive after its icon is left.
   if(current?.node===node&&current.mode==='hover'&&!inside(popup,event.relatedTarget))close();
  }
  if(inside(popup,event.target)&&!inside(popup,event.relatedTarget)&&current?.mode==='hover'&&!inside(current.node,event.relatedTarget))close();
 });
 document.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||current?.mode!=='hover'||inside(popup,event.target))return;
  if(candidate(event.target)!==current.node){close();return;}
  current.point={x:event.clientX,y:event.clientY};
 });
 document.addEventListener('focusin',event=>{
  if(restoringFocus||inputMode==='pointer')return;
  const node=candidate(event.target);
  if(node)show(node,{mode:'focus'});
 });
 document.addEventListener('focusout',event=>{
  const node=candidate(event.target);
  if(node&&!inside(node,event.relatedTarget)){
   if(suppressed===targetFor(node)?.key)suppressed='';
   if(current?.node===node&&current.mode==='focus'&&!inside(popup,event.relatedTarget))close();
  }
  if(inside(popup,event.target)&&!inside(popup,event.relatedTarget)&&current?.mode==='focus'&&!inside(current.node,event.relatedTarget))close();
 });
 document.addEventListener('click',event=>{
  const toggle=event.target.closest?.('[data-lobby-pick-toggle]');
  if(toggle){
   const target=targetFor(toggle),mode=pointerType==='touch'?'touch':inputMode==='pointer'?'hover':'focus';
   if(current?.key===target?.key&&mode==='touch'&&current.mode==='touch'){suppressed=current.key;close();}
   else{suppressed='';show(toggle,{mode});}
   return;
  }
  if(event.target.closest?.('.live-profile-link, [data-player], [data-counter-pick], [data-view]')){close();return;}
  if(!inside(popup,event.target)&&!inside(current?.node,event.target))close();
 },true);
 document.addEventListener('keydown',event=>{
  inputMode='keyboard';pointerType='';
  if(event.key==='Escape'&&current){suppressed=current.key;close();}
 });
 window.addEventListener('resize',position);
 window.addEventListener('scroll',position,true);
 window.addEventListener('blur',()=>{pointerNode=null;close();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pointerNode=null;close();}});
 // Dialogs may open without a roster render (for example, the profile action).
 document.querySelectorAll('dialog').forEach(dialog=>new MutationObserver(()=>{if(dialog.open)close();}).observe(dialog,{attributes:true,attributeFilter:['open']}));
 window.refreshLobbyPickPreview=()=>{
  if(blocked()){close();return;}
  if(!current)return;
  const previous=current,node=find(current.key);
  if(!node){close();return;}
  if(previous.mode==='hover'&&previous.point&&typeof document.elementFromPoint==='function'){
   const hit=document.elementFromPoint(previous.point.x,previous.point.y);
   if(!inside(node,hit)&&!inside(popup,hit)){close();return;}
  }
  // Reconnect the exact hero/game, never the first icon from a refreshed player row.
  if(previous.mode==='focus'&&!previous.node.isConnected&&
   (!document.activeElement||document.activeElement===document.body||document.activeElement===document.documentElement)){
   restoringFocus=true;
   try{node.focus({preventScroll:true});}finally{restoringFocus=false;}
  }
  if(pointerNode===previous.node)pointerNode=node;
  show(node,{mode:previous.mode,point:previous.point});
 };
})();
