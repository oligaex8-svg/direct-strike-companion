'use strict';
// Isolated behavior fixture: no private library, app/API server, or external traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.abort());
  await page.setContent('<style>strong{display:block;width:120px;height:35px;margin:10px}section{padding:10px}</style><button id="control">Navigate</button><section id="fixture"><strong id="overall-rate">75%</strong><strong data-ui-meter-key="edge" data-ui-meter-value="0">Zero</strong><div class="profile-region-data" data-site-player="sample-account"><strong>1500</strong></div></section>');
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot/ui-motion.css'),'utf8')});
  const before=await page.locator('#fixture').boundingBox();
  await page.evaluate(()=>{
   window.motionCalls=[];const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){window.motionCalls.push({frames,options,target:this.id,label:this.closest('.live-rating-summary')?.querySelector('.live-rating-label')?.textContent});return animate.call(this,frames,options);};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot/ui-motion.js'),'utf8')});
  const flush=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await flush();
  assert.deepEqual(await page.locator('#fixture').boundingBox(),before,'decorations preserve layout');
  assert.equal(await page.locator('#overall-rate').textContent(),'75%');
  assert.equal(await page.locator('#overall-rate .ui-data-rail').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('[data-ui-meter-key=edge] i').evaluate(el=>el.style.transform),'scaleX(0)');
  assert.equal(await page.evaluate(()=>motionCalls.length),1,'first visible percentage receives one reveal');
  await page.evaluate(()=>document.querySelector('#fixture').innerHTML=document.querySelector('#fixture').innerHTML);
  await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),1,'unchanged polling replacement stays still');
  await page.evaluate(()=>document.querySelector('#overall-rate').textContent='80%');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'changed percentage animates once');
  assert.equal(await page.locator('#overall-rate i').evaluate(el=>el.style.transform),'scaleX(0.8)');
  await page.evaluate(()=>DSUiMotion.refresh());await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'explicit unchanged refresh stays still');
  await page.evaluate(()=>document.querySelector('.profile-region-data>strong').textContent='1512');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'rating updates remain visually steady');
  assert.equal(await page.locator('.profile-region-data .ui-data-rail').count(),0,'rating has no fabricated progress maximum');
  await page.evaluate(()=>document.querySelector('[data-ui-meter-key=edge]').dataset.uiMeterValue='101');await flush();
  assert.equal(await page.locator('[data-ui-meter-key=edge] .ui-data-rail').count(),0,'invalid percentage has no rail');
  await page.evaluate(()=>document.querySelector('#overall-rate').textContent='—');await flush();
  assert.equal(await page.locator('#overall-rate .ui-data-rail').count(),0,'missing data is not zero');
  await page.keyboard.press('Tab');
  await page.evaluate(()=>document.querySelector('.profile-region-data>strong').textContent='1520');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'keyboard interaction stays still');
  await page.mouse.click(2,2);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>document.querySelector('.profile-region-data>strong').textContent='1530');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'reduced motion stays still');
  await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});
  assert.equal(await page.locator('.ui-rating-feedback').count(),0,'rating flash ornament is absent');
  await page.evaluate(()=>document.querySelector('.profile-region-data>strong').textContent='1540');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'forced colors stays still');
  await page.emulateMedia({forcedColors:'none'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));document.querySelector('.profile-region-data>strong').textContent='1550';});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'hidden document stays still');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'returning to document does not replay old changes');
  await page.evaluate(()=>{
   const row=document.createElement('div');row.className='live-profile';row.dataset.testLive='regional';
   row.innerHTML='<button data-player="sample-live-player">Sample</button>'+[
    ['dsr','DSR · EU',7000],['dsr','DSR · AM',6000],
    ['dsstats','dsstats · EU',2500],['dsstats','dsstats · AM',2100]
   ].map(([source,label,value])=>`<span class="live-rating-summary" data-rating-source="${source}"><span class="live-rating-label">${label}</span><span class="live-rating-value">${value}</span></span>`).join('');
   document.body.append(row);
  });await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'independent EU/AM source values start still');
  await page.evaluate(()=>{
   const row=document.querySelector('[data-test-live]');row.innerHTML=row.innerHTML;
  });await flush();
  await page.evaluate(()=>{DSUiMotion.refresh();DSUiMotion.refresh();});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'EU/AM DSR and dsstats do not cross-trigger on replacement or refresh');
  await page.evaluate(()=>document.querySelectorAll('[data-test-live] .live-rating-value')[3].textContent='2112');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'regional rating updates remain steady');
  assert.equal(await page.locator('[data-test-live] .live-rating-value').nth(3).textContent(),'2112','changed regional data remains visible');
  await page.evaluate(()=>{
   const row=document.querySelector('[data-test-live]');row.innerHTML=row.innerHTML;
  });await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),2,'changed regional value is retained across replacement');
  // Navigation lifts, heading demos and whole-dialog entries were retired with
  // the local.36 in-place motion contract. Preserve their historical fixture,
  // while current callers can verify only the supported data-feedback behavior.
  if(process.argv.includes('--data-only')){console.log(JSON.stringify({success:true,scope:'current data feedback: layout, unchanged polling, per-region identity, unavailable values, keyboard and accessibility gates'}));return;}
  await page.evaluate(()=>{
   motionCalls=[];document.documentElement.dataset.graphicalStyle='default';
   document.body.insertAdjacentHTML('beforeend','<button data-view="profile" id="fixture-nav">Profile</button><button id="marked-only">Filter</button><button id="fixture-open">Dialog</button><button data-ui-motion-preview id="fixture-preview">Preview</button><main id="main" class="work-console" data-view="players"><div id="library-content"><p>Players</p></div></main><details id="fixture-details"><summary>Details</summary><div id="fixture-details-body">More information</div></details><dialog id="fixture-dialog"><div class="dialog-head" id="fixture-dialog-head">Settings</div><label class="appearance-choice" id="fixture-choice"><input type="radio" name="graphical-style" value="zerg">Zerg</label><button data-ui-motion-preview id="fixture-dialog-preview">Preview</button></dialog>');
   document.querySelector('#fixture-nav').onclick=()=>{document.querySelector('#main').dataset.view='profile';document.querySelector('#library-content').innerHTML='<p>Profile content</p>';};
   document.querySelector('#marked-only').onclick=()=>{setTimeout(()=>{document.querySelector('#library-content').innerHTML='<p>Filtered content</p>';},80);};
   document.querySelector('#marked-only').insertAdjacentHTML('afterend','<select id="sort-by"><option value="name">Name</option><option value="rating">Rating</option></select>');
   document.querySelector('#sort-by').onchange=()=>{setTimeout(()=>{document.querySelector('#library-content').innerHTML='<p>Sorted content</p>';},80);};
   document.querySelector('#fixture-open').onclick=()=>document.querySelector('#fixture-dialog').showModal();
   document.querySelector('[name=graphical-style]').onchange=event=>{document.documentElement.dataset.graphicalStyle=event.target.value;};
  });await flush();
  await page.locator('#fixture-nav').click();await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),1,'pointer navigation enters the content once');
  await page.evaluate(()=>{const content=document.querySelector('#library-content');content.innerHTML=content.innerHTML;});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),1,'ordinary unchanged content replacement has no entry');
  await page.locator('#marked-only').click();await flush();
  // The response arrives after the first frame, like a persisted sort preference.
  await page.waitForFunction(()=>document.querySelector('#library-content').textContent==='Filtered content');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),2,'delayed filter change receives finite feedback');
  await page.evaluate(()=>{const content=document.querySelector('#library-content');content.innerHTML=content.innerHTML;});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),2,'consumed list intent cannot replay on unchanged polling');
  await page.locator('#sort-by').selectOption('rating');
  await page.waitForFunction(()=>document.querySelector('#library-content').textContent==='Sorted content');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),3,'delayed sort change receives one response');
  await page.locator('#marked-only').click();await page.keyboard.press('Tab');
  await page.waitForFunction(()=>document.querySelector('#library-content').textContent==='Filtered content');await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),3,'keyboard input cancels pending asynchronous feedback');
  await page.evaluate(()=>{
   document.querySelector('#library-content').innerHTML='<div class="directory-pager" data-directory-pager="top"><span>Players shown: 1–50 / 67</span><button class="filter" data-player-page="2" data-page-action="next">Next player page</button></div><div class="player-table-scroll" tabindex="0">Page one players</div>';
   document.addEventListener('click',event=>{
    const button=event.target.closest('[data-player-page]');if(!button||button.disabled)return;
    document.querySelector('#library-content').innerHTML='<div class="directory-pager" data-directory-pager="top"><span>Players shown: 51–67 / 67</span><button class="filter" data-player-page="3" data-page-action="next" disabled>Next player page</button></div><div class="player-table-scroll" tabindex="0">Page two players</div>';
    document.querySelector('.player-table-scroll').focus({preventScroll:true});
   });
  });await flush();
  await page.locator('[data-player-page="2"]').click();await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),4,'paging inside #main[data-view] receives one list response');
  assert.equal(await page.locator('[data-directory-pager=top]').textContent(),'Players shown: 51–67 / 67Next player page');
  await page.evaluate(()=>{const content=document.querySelector('#library-content');content.innerHTML=content.innerHTML;});await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='library-content').length),4,'paging response does not repeat on unchanged replacement');
  await page.locator('#fixture-details>summary').click();await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='fixture-details-body').length),1,'pointer disclosure reveals its body');
  await page.locator('#fixture-open').click();await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='fixture-dialog').length),1,'pointer-open dialog enters once');
  await page.locator('#fixture-choice').click();await flush();
  assert.equal(await page.evaluate(()=>motionCalls.filter(call=>call.target==='fixture-choice').length),1,'theme change responds once');
  const previewBefore=await page.evaluate(()=>({view:document.querySelector('#main').dataset.view,theme:document.documentElement.dataset.graphicalStyle,open:document.querySelector('#fixture-dialog').open}));
  await page.locator('#fixture-dialog-preview').click();await flush();
  assert.deepEqual(await page.evaluate(()=>({view:document.querySelector('#main').dataset.view,theme:document.documentElement.dataset.graphicalStyle,open:document.querySelector('#fixture-dialog').open})),previewBefore,'preview changes no view, setting or dialog state');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'fixture-dialog-preview','preview preserves button focus');
  assert.ok(await page.evaluate(()=>motionCalls.some(call=>call.target==='fixture-dialog-head')),'preview visibly demonstrates independent surfaces');
  const beforeKeyboard=await page.evaluate(()=>motionCalls.length);
  await page.locator('#fixture-dialog-preview').focus();await page.keyboard.press('Enter');await flush();
  assert.ok(await page.evaluate(()=>motionCalls.length)>beforeKeyboard,'explicit keyboard preview demonstrates motion');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'fixture-dialog-preview','keyboard preview preserves focus');
  const beforeReducedPreview=await page.evaluate(()=>motionCalls.length);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>DSUiMotion.preview());await flush();
  assert.equal(await page.evaluate(()=>motionCalls.length),beforeReducedPreview,'explicit demo still honors reduced motion');
  console.log(JSON.stringify({success:true,scope:'isolated data feedback, layout, polling, unavailable values, keyboard, reduced motion, forced colors, visibility'}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
