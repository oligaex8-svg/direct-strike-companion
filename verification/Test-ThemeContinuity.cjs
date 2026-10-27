'use strict';
// Guarded by the parent runner. Uses synthetic fixture data; no live application.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const {routeApp,ready}=require('./Test-ThemeLoops.cjs'),fixture=require('./LocalPreviewFixture.cjs');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function test(){
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 const report={success:false,scope:'Synthetic app: atomic atlas addressing, DOM polling continuity, visibility/focus recovery, accessibility and dialog cap'};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await routeApp(page,fixture('fenix','en'));await page.goto('http://theme-continuity.test/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>state?.library&&window.DSThemeVfx);await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});
  await page.locator('nav [data-view=profile]').click();await ready(page,'fenix');
  await page.waitForFunction(()=>document.querySelector('[data-vfx-key=main-header][data-vfx-active=true]'));
  await page.evaluate(()=>{
   window.dispatchEvent(new Event('blur'));
   window.__continuityLayer=document.querySelector('[data-vfx-key=main-header]');
   window.__continuityClock=__continuityLayer.getAnimations({subtree:true})[0];
   window.__continuityAtlas=__continuityLayer.querySelector('.vfx-loop-atlas');
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settle();
  const geometry=await page.evaluate(()=>{
   const l=__continuityLayer,s=getComputedStyle(l),timing=__continuityClock.effect.getTiming();
   const width=parseFloat(s.getPropertyValue('--loop-width')),height=parseFloat(s.getPropertyValue('--loop-height')),columns=Number(s.getPropertyValue('--loop-cols'));
   return {width,height,columns,frames:__continuityClock.effect.getKeyframes().length-1,duration:timing.duration};
  });
  // Probe both sides of a row rollover. A single effect addresses X and Y.
  assert.equal(await page.evaluate(()=>__continuityLayer.getAnimations({subtree:true}).length),1);
  for(const frame of [0,geometry.columns-1,geometry.columns,geometry.frames-1]){
   await page.evaluate(({frame,g})=>{__continuityClock.currentTime=(frame+.2)*g.duration/g.frames;},{frame,g:geometry});await settle();
   const xy=await page.evaluate(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(__continuityLayer.querySelector('.vfx-loop-x')).transform);return [m.m41,m.m42];});
   assert.ok(Math.abs(xy[0]+geometry.width*(frame%geometry.columns))<.1);
   assert.ok(Math.abs(xy[1]+geometry.height*Math.floor(frame/geometry.columns))<.1);
  }
  await page.evaluate(g=>{__continuityClock.currentTime=(g.columns+2.4)*g.duration/g.frames;},geometry);await settle();
  const selector='[data-vfx-key=main-header]',before=await page.locator(selector).screenshot({animations:'allow'}),phase=await page.evaluate(()=>__continuityClock.currentTime);
  await page.evaluate(()=>{for(let i=0;i<5;i++)DSThemeVfx.refresh();});await settle();
  assert.equal(await page.evaluate(()=>__continuityClock.currentTime),phase,'unchanged refresh retains paused phase');
  assert.equal(digest(await page.locator(selector).screenshot({animations:'allow'})),digest(before),'unchanged refresh retains pixels');
  await page.evaluate(()=>{
   const host=__continuityLayer.parentElement,replacement=host.cloneNode(true);host.replaceWith(replacement);DSThemeVfx.refresh();
  });await settle();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-vfx-key=main-header]')===__continuityLayer),true,'recreated host adopts the original layer');
  assert.equal(await page.evaluate(()=>__continuityLayer.getAnimations({subtree:true})[0]===__continuityClock),true,'recreated host retains the original clock');
  assert.equal(await page.evaluate(()=>__continuityLayer.querySelector('.vfx-loop-atlas')===__continuityAtlas),true,'no atlas re-decode on host replacement');
  assert.equal(await page.locator(selector).count(),1,'cloned decorations do not duplicate the layer');
  assert.equal(await page.evaluate(()=>__continuityClock.currentTime),phase);
  assert.equal(digest(await page.locator(selector).screenshot({animations:'allow'})),digest(before),'recreated host retains exact paused pixels');
  // Hidden windows freeze the material, and return starts from that exact phase.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await settle();
  const hidden=await page.evaluate(()=>__continuityClock.currentTime);await page.waitForTimeout(90);
  assert.equal(await page.evaluate(()=>__continuityClock.currentTime),hidden);
  const immediate=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});document.dispatchEvent(new Event('visibilitychange'));return __continuityClock.currentTime;});
  assert.equal(immediate,hidden,'visibility recovery does not restart at frame zero');await page.waitForTimeout(90);
  assert.ok(await page.evaluate(()=>__continuityClock.currentTime)>hidden,'playback resumes');
  // Live replacement preserves a running clock as well as a frozen one.
  const runningBefore=await page.evaluate(()=>__continuityClock.currentTime);
  await page.evaluate(()=>{const host=__continuityLayer.parentElement;host.replaceWith(host.cloneNode(true));DSThemeVfx.refresh();});await settle();
  const runningAfter=await page.evaluate(()=>__continuityClock.currentTime);assert.ok(runningAfter>=runningBefore&&runningAfter<runningBefore+1000);
  assert.equal(await page.evaluate(()=>__continuityLayer.getAnimations({subtree:true})[0]===__continuityClock),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();const blurred=await page.evaluate(()=>__continuityClock.currentTime);await page.waitForTimeout(70);
  assert.equal(await page.evaluate(()=>__continuityClock.currentTime),blurred);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(70);assert.ok(await page.evaluate(()=>__continuityClock.currentTime)>blurred);
  await page.emulateMedia({reducedMotion:'reduce'});await settle();assert.equal(await page.evaluate(()=>__continuityClock.playState),'paused');
  assert.equal(await page.locator(selector+' .vfx-loop-poster').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.equal(await page.evaluate(()=>DSThemeVfx.preview()),false);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{document.querySelector('#settings-dialog').showModal();DSThemeVfx.refresh();});await ready(page,'fenix');await settle();
  assert.ok(await page.locator('.theme-vfx-layer[data-vfx-active=true]').count()<=3);
  assert.equal(await page.locator('.theme-vfx-layer[data-vfx-active=true]').evaluateAll(els=>els.every(el=>!!el.closest('dialog[open]'))),true);
  await page.evaluate(()=>document.querySelector('#settings-dialog').close());await settle();
  // UI feedback may decorate numbers; whole-data opacity dips are forbidden.
  await page.evaluate(()=>{window.__dataDips=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('#library-content,.work-console,dialog'))__dataDips.push(this.id||this.className);return animate.call(this,frames,options);};});
  await page.locator('nav [data-view=stats]').click();await settle();assert.deepEqual(await page.evaluate(()=>__dataDips),[]);
  assert.deepEqual(errors,[]);report.success=true;report.atomicClock=true;report.pausedPixels=digest(before);report.geometry=geometry;
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
 return report;
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={test};
