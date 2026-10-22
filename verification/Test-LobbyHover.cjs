'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
class Element {
 constructor(kind,id='',parent=null){this.kind=kind;this.id=id;this.parent=parent;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.isConnected=true;this.innerHTML='';this.open=false;this.rect={left:40,top:40,right:220,bottom:140,width:180,height:100};this.properties={};this.styleWrites=[];this.style={setProperty:(key,value)=>{this.properties[key]=value;this.styleWrites.push([key,value]);if(key==='--pick-preview-max-height'&&parseFloat(value)>=this.rect.height)this.scrollTop=0;}};if(parent)parent.children.push(this);}
 get innerHTML(){return this.html||'';}
 set innerHTML(value){this.html=value;this.scrollTop=0;}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();return part==='[data-lobby-pick]'?!!this.dataset.lobbyPick:part==='[data-lobby-pick-toggle]'?!!this.dataset.lobbyPickToggle:part==='.live-profile-link'?this.kind==='profile':part==='[data-player]'?!!this.dataset.player:part==='[data-counter-pick]'?!!this.dataset.counterPick:part==='[data-view]'?!!this.dataset.view:false;});}
 closest(selector){for(let item=this;item;item=item.parent)if(item.matches(selector))return item;return null;}
 contains(target){for(let item=target;item;item=item.parent)if(item===this)return true;return false;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key]??null;}
 removeAttribute(key){delete this.attributes[key];}
 getBoundingClientRect(){return this.rect;}
 focus(){const old=this.document.activeElement;this.document.activeElement=this;this.document.emit('focusout',{target:old,relatedTarget:this});this.document.emit('focusin',{target:this,relatedTarget:old});}
}
function fixture(){
 const listeners={},windowListeners={},timers=new Map(),callbacks=[],observers=[];let next=0,revision=1;
 const body=new Element('body'),html=new Element('html'),popup=new Element('popup','lobby-pick-preview',body),dialog=new Element('dialog','player-dialog',body),manual=new Element('input','manual',body);
 popup.hidden=true;popup.rect={left:0,top:0,right:340,bottom:260,width:340,height:260};html.clientWidth=800;html.clientHeight=600;
 const document={body,documentElement:html,activeElement:body,hidden:false,getElementById:id=>id===popup.id?popup:null,addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),querySelectorAll:selector=>selector==='dialog'?[dialog]:body.querySelectorAll(selector),querySelector:selector=>selector==='dialog[open]'&&dialog.open?dialog:null,emit:(type,event)=>{for(const fn of listeners[type]||[])fn(event);}};
 function roster(id){
  const node=new Element('section','',body);node.dataset.lobbyPick=id;
  const trigger=(kind,value)=>{const el=new Element('toggle','',node);el.dataset.lobbyPickToggle=id;el.dataset.lobbyPickKind=kind;if(kind==='commander')el.dataset.lobbyPickCommander=value;if(kind==='game')el.dataset.lobbyPickGame=value;el.setAttribute('aria-expanded','false');el.document=document;return el;};
  const toggle=trigger('commander','Dehaka'),second=trigger('commander','Raynor'),recent=trigger('game','match-1');
  const profile=new Element('profile','',node);profile.dataset.player=id;
  for(const el of [node,profile])el.document=document;
  return {node,toggle,second,recent,profile};
 }
 const a=roster('a'),b=roster('b');
 const window={innerWidth:800,innerHeight:600,addEventListener:(name,fn)=>windowListeners[name]=fn};
 const context=vm.createContext({document,window,renderLobbyPickPreview:(id,target)=>`<p>${id} revision ${revision} ${target.kind} ${target.commander} ${target.game}</p>`,setTimeout:fn=>{const id=++next;timers.set(id,fn);callbacks.push(fn);return id;},clearTimeout:id=>timers.delete(id),MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}}});
 vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/picks-hover.js'),'utf8'),context);
 const emit=(type,target,extra={})=>document.emit(type,{target,relatedTarget:null,pointerType:'mouse',clientX:100,clientY:100,...extra});
 function remove(row){for(const el of [row.node,row.toggle,row.second,row.recent,row.profile])el.isConnected=false;body.children=body.children.filter(el=>el!==row.node);if(row.node.contains(document.activeElement))document.activeElement=body;}
 return {a,b,body,popup,dialog,manual,document,html,window,windowListeners,timers,callbacks,observers,roster,remove,emit,refresh:()=>window.refreshLobbyPickPreview(),revision:()=>revision++};
}
function check(name,run){run(fixture());checks.push(name);}
check('Each hero and recent game has its own target; blank row areas do not open previews',f=>{
 f.emit('pointerover',f.a.node);assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.toggle);assert.match(f.popup.innerHTML,/commander Dehaka/);
 f.emit('pointerout',f.a.toggle,{relatedTarget:f.a.second});assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.second,{relatedTarget:f.a.toggle});assert.match(f.popup.innerHTML,/commander Raynor/);
 assert.equal(f.a.toggle.getAttribute('aria-expanded'),'false');assert.equal(f.a.second.getAttribute('aria-describedby'),f.popup.id);
 f.emit('pointerout',f.a.second,{relatedTarget:f.a.recent});f.emit('pointerover',f.a.recent,{relatedTarget:f.a.second});assert.match(f.popup.innerHTML,/game  match-1/);
});
check('Leaving an icon hides synchronously with no timeout, even if that mouse-clicked icon has focus',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('pointerdown',f.a.toggle);f.a.toggle.focus();f.emit('click',f.a.toggle);
 f.emit('pointerout',f.a.toggle,{relatedTarget:f.a.node});assert.ok(f.popup.hidden);assert.equal(f.timers.size,0);assert.equal(f.a.toggle.getAttribute('aria-describedby'),null);
 f.emit('focusin',f.a.toggle);f.refresh();assert.ok(f.popup.hidden);
});
check('Moving to another icon updates immediately; descendants inside one icon retain content',f=>{
 const image=new Element('image','',f.a.toggle);f.emit('pointerover',f.a.toggle);f.popup.scrollTop=20;
 f.emit('pointerout',f.a.toggle,{relatedTarget:image});f.emit('pointerover',image,{relatedTarget:f.a.toggle});assert.equal(f.popup.scrollTop,20);
 f.emit('pointerover',f.a.recent,{relatedTarget:image});assert.match(f.popup.innerHTML,/match-1/);assert.equal(f.popup.scrollTop,0);
});
check('A direct transition into the popup remains readable; leaving it closes instantly',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('pointerout',f.a.toggle,{relatedTarget:f.popup});f.emit('pointerover',f.popup,{relatedTarget:f.a.toggle});assert.ok(!f.popup.hidden);
 f.emit('pointerout',f.popup,{relatedTarget:f.body});assert.ok(f.popup.hidden);assert.equal(f.timers.size,0);
});
check('No delayed bridge keeps a tooltip alive when the pointer leaves for empty space',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('pointerout',f.a.toggle);assert.ok(f.popup.hidden);
 f.emit('pointerover',f.popup);assert.ok(f.popup.hidden);assert.equal(f.callbacks.length,0);
});
check('Pointer motion outside a trigger closes even if its pointerout was missed',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('pointermove',f.a.node);assert.ok(f.popup.hidden);
});
check('Mouse and pen work without focusing; touch hover is ignored',f=>{
 f.emit('pointerover',f.a.toggle,{pointerType:'touch'});assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.toggle);assert.equal(f.document.activeElement,f.body);
 f.emit('pointerover',f.b.profile,{pointerType:'pen'});assert.match(f.popup.innerHTML,/b revision/);assert.equal(f.a.toggle.getAttribute('aria-expanded'),'false');
});
check('Touch tap opens and toggles; outside tap and profile actions dismiss',f=>{
 f.emit('pointerdown',f.a.toggle,{pointerType:'touch'});f.a.toggle.focus();assert.ok(f.popup.hidden);
 f.emit('click',f.a.toggle);assert.ok(!f.popup.hidden);f.emit('pointerout',f.a.toggle,{pointerType:'touch'});assert.ok(!f.popup.hidden);
 f.emit('click',f.a.toggle);assert.ok(f.popup.hidden);f.emit('click',f.a.toggle);f.emit('click',f.manual);assert.ok(f.popup.hidden);
 f.emit('click',f.a.toggle);f.emit('click',f.a.profile);assert.ok(f.popup.hidden);
});
check('Keyboard focus uses the exact icon and closes immediately when focus leaves',f=>{
 f.a.recent.focus();assert.match(f.popup.innerHTML,/match-1/);f.manual.document=f.document;f.manual.focus();assert.ok(f.popup.hidden);assert.equal(f.timers.size,0);
 f.emit('keydown',f.a.second,{key:'Tab'});f.a.second.focus();assert.match(f.popup.innerHTML,/commander Raynor/);
});
check('Unrelated focused row controls do not open any tooltip',f=>{
 const checkbox=new Element('checkbox','',f.a.node);checkbox.document=f.document;checkbox.focus();assert.ok(f.popup.hidden);
});
check('Escape suppresses the same icon until leaving; another icon still opens normally',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('keydown',f.a.toggle,{key:'Escape'});assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.toggle);assert.ok(f.popup.hidden);f.refresh();assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.second);assert.match(f.popup.innerHTML,/Raynor/);
 f.emit('pointerout',f.a.toggle);f.emit('pointerover',f.a.toggle);assert.match(f.popup.innerHTML,/Dehaka/);
});
check('Refresh retains exactly the selected hero or game and its reading position',f=>{
 f.a.second.focus();f.popup.scrollTop=140;f.remove(f.a);const replacement=f.roster('a');f.revision();f.refresh();
 assert.match(f.popup.innerHTML,/revision 2 commander Raynor/);assert.equal(f.popup.scrollTop,140);assert.equal(f.document.activeElement,replacement.second);
 assert.equal(replacement.toggle.getAttribute('aria-expanded'),'false');
 f.emit('keydown',replacement.recent,{key:'Tab'});replacement.recent.focus();f.remove(replacement);const next=f.roster('a');f.refresh();assert.match(f.popup.innerHTML,/match-1/);assert.equal(f.document.activeElement,next.recent);
});
check('Refresh closes a removed recent game instead of showing a different game or hero',f=>{
 f.emit('pointerover',f.a.recent);f.remove(f.a);const replacement=f.roster('a');replacement.recent.dataset.lobbyPickGame='match-2';f.refresh();assert.ok(f.popup.hidden);assert.equal(f.document.activeElement,f.body);
});
check('Dismissed hover never reopens or restores stale focus during refresh',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('pointerdown',f.a.toggle);f.a.toggle.focus();f.emit('click',f.a.toggle);f.emit('pointerout',f.a.toggle);f.remove(f.a);f.roster('a');f.refresh();assert.ok(f.popup.hidden);assert.equal(f.document.activeElement,f.body);
});
check('Refresh closes a hover when the refreshed icon moved away from the pointer',f=>{
 f.emit('pointerover',f.a.toggle);f.document.elementFromPoint=()=>f.body;f.refresh();assert.ok(f.popup.hidden);
});
check('Refresh keeps the hover when the same exact replacement still lies under the pointer',f=>{
 f.emit('pointerover',f.a.second);f.remove(f.a);const replacement=f.roster('a');f.document.elementFromPoint=()=>replacement.second;f.refresh();assert.match(f.popup.innerHTML,/Raynor/);
});
check('Dialog opening, page blur, hidden page, and missing player clear previews immediately',f=>{
 f.emit('pointerover',f.a.toggle);f.windowListeners.blur();assert.ok(f.popup.hidden);f.refresh();assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.toggle);f.document.hidden=true;f.emit('visibilitychange',f.body);assert.ok(f.popup.hidden);
 f.document.hidden=false;f.emit('pointerover',f.a.toggle);f.remove(f.a);f.refresh();assert.ok(f.popup.hidden);
 f.emit('pointerover',f.b.toggle);f.dialog.open=true;f.observers[0]();assert.ok(f.popup.hidden);f.emit('pointerover',f.b.toggle);assert.ok(f.popup.hidden);
});
check('Clicks inside the preview preserve it; outside, navigation and advisor actions close',f=>{
 f.emit('pointerover',f.a.toggle);f.emit('click',f.popup);assert.ok(!f.popup.hidden);f.emit('click',f.manual);assert.ok(f.popup.hidden);
 f.emit('pointerover',f.a.toggle);const advisor=new Element('button');advisor.dataset.counterPick='a';f.emit('click',advisor);assert.ok(f.popup.hidden);
});
check('Bottom-right pointer placement and resize stay within 12px viewport margins',f=>{
 f.emit('pointerover',f.a.toggle,{clientX:790,clientY:590});assert.equal(f.popup.properties['--pick-preview-left'],'432px');assert.equal(f.popup.properties['--pick-preview-top'],'312px');
 f.html.clientWidth=400;f.html.clientHeight=300;f.windowListeners.resize();assert.equal(f.popup.properties['--pick-preview-left'],'12px');assert.equal(f.popup.properties['--pick-preview-top'],'158px');assert.equal(f.popup.properties['--pick-preview-max-height'],'130px');
 f.emit('pointerover',f.b.toggle,{clientX:1,clientY:1});assert.equal(f.popup.properties['--pick-preview-left'],'19px');assert.equal(f.popup.properties['--pick-preview-top'],'19px');
});
check('Focused button positioning uses anchor bounds and scroll repositions',f=>{
 f.a.toggle.rect={left:720,top:500,right:780,bottom:530,width:60,height:30};f.a.toggle.focus();assert.equal(f.popup.properties['--pick-preview-left'],'362px');assert.equal(f.popup.properties['--pick-preview-top'],'252px');
 f.a.toggle.rect.left=100;f.a.toggle.rect.right=160;f.windowListeners.scroll();assert.equal(f.popup.properties['--pick-preview-left'],'178px');
});
check('Narrow translated popup remains above focused toggle/profile without covering click targets',f=>{
 f.html.clientWidth=400;f.html.clientHeight=900;f.popup.rect.width=340;f.popup.rect.height=465;
 f.a.toggle.rect={left:100,top:538,right:260,bottom:582,width:160,height:44};f.a.toggle.focus();
 const left=parseFloat(f.popup.properties['--pick-preview-left']),top=parseFloat(f.popup.properties['--pick-preview-top']),cap=parseFloat(f.popup.properties['--pick-preview-max-height']);
 assert.ok(left>=12&&left+340<=388);assert.ok(top>=12);assert.ok(top+Math.min(465,cap)<=520);assert.equal(cap,508);
});
check('Tall narrow preview caps height above or below anchor and resets cap on desktop',f=>{
 f.html.clientWidth=400;f.html.clientHeight=900;f.popup.rect.height=700;
 f.a.toggle.rect={left:100,top:400,right:260,bottom:444,width:160,height:44};f.a.toggle.focus();
 assert.equal(f.popup.properties['--pick-preview-top'],'462px');assert.equal(f.popup.properties['--pick-preview-max-height'],'426px');
 f.html.clientWidth=1200;f.windowListeners.resize();assert.equal(f.popup.properties['--pick-preview-max-height'],'876px');
});
check('Wide narrow-screen pointer preview never covers its pointer coordinate',f=>{
 f.html.clientWidth=400;f.html.clientHeight=900;f.popup.rect.height=700;
 f.emit('pointerover',f.a.toggle,{clientX:200,clientY:550});
 const left=parseFloat(f.popup.properties['--pick-preview-left']),top=parseFloat(f.popup.properties['--pick-preview-top']),cap=parseFloat(f.popup.properties['--pick-preview-max-height']);
 assert.ok(left>=12&&left+340<=388);assert.equal(cap,520);assert.equal(top,12);assert.ok(top+Math.min(700,cap)<550);
 f.emit('pointerover',f.b.toggle,{clientX:200,clientY:100});assert.equal(f.popup.properties['--pick-preview-top'],'118px');assert.equal(f.popup.properties['--pick-preview-max-height'],'770px');
});
check('Retained desktop pointer outside resized client viewport falls back to current toggle bounds',f=>{
 f.popup.rect.height=680;f.emit('pointerover',f.a.toggle,{clientX:391,clientY:300});
 f.html.clientWidth=385;f.html.clientHeight=900;f.window.innerWidth=400;f.window.innerHeight=900;
 f.a.toggle.rect={left:100,top:451,right:260,bottom:495,width:160,height:44};f.windowListeners.resize();
 const left=parseFloat(f.popup.properties['--pick-preview-left']),top=parseFloat(f.popup.properties['--pick-preview-top']),cap=parseFloat(f.popup.properties['--pick-preview-max-height']);
 assert.equal(cap,421);assert.equal(top,12);assert.ok(left>=12&&left+340<=373);assert.ok(top+Math.min(680,cap)<451);
 f.refresh();assert.equal(f.popup.properties['--pick-preview-max-height'],'421px');assert.equal(f.popup.properties['--pick-preview-top'],'12px');
});
check('Nonfinite and negative pointer coordinates use the current trigger instead of invalid styles',f=>{
 f.html.clientWidth=385;f.html.clientHeight=900;f.popup.rect.height=680;
 f.a.toggle.rect={left:100,top:451,right:260,bottom:495,width:160,height:44};
 for(const point of [{clientX:NaN,clientY:300},{clientX:100,clientY:Infinity},{clientX:-1,clientY:300},{clientX:100,clientY:-1}]){
  f.emit('pointerover',f.a.toggle,point);assert.equal(f.popup.properties['--pick-preview-max-height'],'421px');assert.equal(f.popup.properties['--pick-preview-top'],'12px');assert.ok(Number.isFinite(parseFloat(f.popup.properties['--pick-preview-left'])));
 }
});
check('Viewport reposition preserves scroll despite temporary max-height layout clamping',f=>{
 f.html.clientWidth=385;f.html.clientHeight=900;f.popup.rect.height=680;
 f.a.toggle.rect={left:100,top:451,right:260,bottom:495,width:160,height:44};f.a.toggle.focus();f.popup.scrollTop=120;
 f.windowListeners.resize();assert.equal(f.popup.scrollTop,120);assert.equal(f.popup.properties['--pick-preview-max-height'],'421px');
 f.windowListeners.scroll({target:f.document});assert.equal(f.popup.scrollTop,120);
 const writes=f.popup.styleWrites.length;f.popup.scrollTop=180;f.windowListeners.scroll({target:f.popup});assert.equal(f.popup.scrollTop,180);assert.equal(f.popup.styleWrites.length,writes);
 const child=new Element('content','',f.popup);f.windowListeners.scroll({target:child});assert.equal(f.popup.styleWrites.length,writes);
});
const result={passed:checks.length,checks,browserVerification:'Native pointer/focus dispatch, tooltip layout, CSP and embedded WebView integration require browser verification.'};
fs.writeFileSync(path.join(__dirname,'lobby-hover-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
