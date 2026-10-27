'use strict';
// Parent resource guard owns browser execution. All data/requests are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const {routeApp}=require('./Test-ThemeLoops.cjs'),fixture=require('./LocalPreviewFixture.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function open(browser,width,language,baseline=false){
 const page=await browser.newPage({viewport:{width,height:1100}});page.setDefaultTimeout(12000);
 await routeApp(page,fixture('default',language));
 if(baseline)await page.route('**/theme-equipment.js',route=>route.fulfill({contentType:'text/javascript',body:'/* layout baseline */'}));
 await page.goto('http://equipment-fixture.test/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state?.library);
 await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});return page;
}
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function view(page,name){
 const dialog=page.locator('#settings-dialog');if(await dialog.evaluate(el=>el.open))await dialog.evaluate(el=>el.close());
 if(name==='settings')await page.locator('#settings-open').click();else await page.locator('nav [data-view='+name+']').click();
 await settle(page);
}
async function waitEquipment(page){
 await page.waitForFunction(()=>window.DSThemeEquipment&&window.DSThemeEquipmentCatalog&&Object.keys(DSThemeEquipmentCatalog).length===20);
 await page.waitForFunction(()=>[...document.querySelectorAll('.theme-vfx-layer')].every(el=>el.dataset.vfxReady==='true'));
 await page.evaluate(()=>DSThemeEquipment.refresh());
 await page.waitForFunction(()=>[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].every(el=>el.dataset.equipmentReady==='true'));await settle(page);
}
async function geometry(page){
 await page.mouse.move(2,2);await page.waitForTimeout(180);
 return page.evaluate(()=>{
  const selectors=['.sidebar .nav','.sidebar-bottom>a','.profile-average-grid>section','.profile-region>h3','.profile-portrait-frame>img','.profile-best-identity>img','.combat-card','.live-team-head','.pick-section-head','#settings-dialog .field-label'];
  const result={};for(const selector of selectors)result[selector]=[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length).map(el=>{const b=el.getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(n=>Math.round(n*100)/100);});return result;
 });
}
function sameGeometry(actual,expected,context){
 for(const key of Object.keys(expected)){assert.equal(actual[key].length,expected[key].length,context+' count '+key);for(let i=0;i<expected[key].length;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(actual[key][i][j]-expected[key][i][j])<.65,context+' geometry '+key+'/'+i+'/'+j+' actual='+actual[key][i]+' expected='+expected[key][i]);}
}
async function audit(page){
 return page.evaluate(()=>{
  const modal=[...document.querySelectorAll('dialog[open]')].at(-1),scope=modal||document.body;
  const failures=[],roles=new Set(),layers=[...scope.querySelectorAll('.theme-equipment-layer:not([hidden])')];
  const shown=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const paints=(b,o,hole)=>{const x=Math.max(b.left,o.left),r=Math.min(b.right,o.right),y=Math.max(b.top,o.top),d=Math.min(b.bottom,o.bottom);return r>x&&d>y&&(!hole||x<hole.left-.15||r>hole.right+.15||y<hole.top-.15||d>hole.bottom+.15);};
  const texts=[],walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){if(!node.textContent.trim()||node.parentElement.closest('.theme-equipment-layer,.theme-vfx-layer,script,style')||!shown(node.parentElement))continue;const range=document.createRange();range.selectNodeContents(node);for(const b of range.getClientRects())if(b.width&&b.height)texts.push(b);}
  // Atlas img boxes extend beyond their clipped windows. Their actual paint
  // bounds are checked separately through the large-effect layer rectangles.
  const images=[...scope.querySelectorAll('img')].filter(el=>shown(el)&&!el.closest('.theme-vfx-layer,.theme-equipment-layer')),controls=[...scope.querySelectorAll('button,a,input,select,textarea,svg,canvas,video')].filter(shown),large=[...scope.querySelectorAll('.theme-vfx-layer:not([hidden])')].filter(shown);
  let visible=0;
  for(const el of layers){
   const b=el.getBoundingClientRect(),s=getComputedStyle(el),host=el.parentElement;let hole=null;
   if(el.dataset.equipmentRole==='socket'){
    const px=n=>parseFloat(s.getPropertyValue(n));hole={left:b.left+px('--equipment-hole-left'),top:b.top+px('--equipment-hole-top')};hole.right=hole.left+px('--equipment-hole-width');hole.bottom=hole.top+px('--equipment-hole-height');
    const image=images.find(img=>{const r=img.getBoundingClientRect();return Math.abs(r.left-hole.left)<.2&&Math.abs(r.top-hole.top)<.2&&Math.abs(r.right-hole.right)<.2&&Math.abs(r.bottom-hole.bottom)<.2;});
    if(!image)failures.push('Socket hole does not match an exact image DOM rectangle');
    if(!s.maskComposite.split(',').every(value=>value.trim()==='exclude'))failures.push('Socket does not exclude portrait pixels');
   }
   if(el.getAttribute('aria-hidden')!=='true'||!el.hasAttribute('inert')||s.pointerEvents!=='none')failures.push('Equipment is not inert');
   if(el.querySelector('img'))failures.push('Equipment inserted an img element');
   if(texts.some(t=>paints(b,t,hole)))failures.push('Text overlap: '+el.dataset.equipmentKey);
   if(images.some(img=>paints(b,img.getBoundingClientRect(),hole)))failures.push('Image overlap: '+el.dataset.equipmentKey);
   if(controls.some(control=>control!==host&&!control.contains(el)&&paints(b,control.getBoundingClientRect(),hole)))failures.push('Control overlap: '+el.dataset.equipmentKey);
   if(large.some(layer=>paints(b,layer.getBoundingClientRect(),hole)))failures.push('Large effect overlap: '+el.dataset.equipmentKey);
   const clip=el.closest('.dialog-body')?.getBoundingClientRect()||modal?.getBoundingClientRect();
   if(b.right>0&&b.left<innerWidth&&b.bottom>Math.max(0,clip?.top??0)&&b.top<Math.min(innerHeight,clip?.bottom??innerHeight)){visible++;roles.add(el.dataset.equipmentRole);}
  }
  return {failures,visible,roles:[...roles],active:document.querySelectorAll('.theme-equipment-layer[data-equipment-active=true]').length,large:document.querySelectorAll('.theme-vfx-layer[data-vfx-active=true]').length};
 });
}
async function test(){
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),report={success:false,cases:[]};
 try{
  for(const [width,language] of [[1600,'en'],[375,'ru']]){
   const baseline=await open(browser,width,language,true),page=await open(browser,width,language),errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const name of ['profile','lobby','picks','settings']){
    await view(baseline,name);const before=await geometry(baseline);
    await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await view(page,name);await waitEquipment(page);
    sameGeometry(await geometry(page),before,width+'/'+name+'/Default');
    const result=await audit(page);
    if(result.failures.length){await page.screenshot({path:path.join(__dirname,'local35-equipment-debug.png'),animations:'allow'});fs.writeFileSync(path.join(__dirname,'local35-equipment-debug.json'),JSON.stringify({width,name,result,details:await page.evaluate(()=>({layers:[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].map(el=>({key:el.dataset.equipmentKey,role:el.dataset.equipmentRole,box:el.getBoundingClientRect().toJSON(),mask:getComputedStyle(el).maskComposite,hole:['left','top','width','height'].map(n=>getComputedStyle(el).getPropertyValue('--equipment-hole-'+n))})),images:[...document.querySelectorAll('img')].filter(e=>e.getClientRects().length).map(e=>({src:e.getAttribute('src'),box:e.getBoundingClientRect().toJSON()}))}))},null,2));}
    assert.deepEqual(result.failures,[]);assert.ok(result.active<=10);assert.ok(result.large<=2);
    if(width===1600&&name==='profile'){assert.ok(result.visible>=10,'Desktop profile has at least ten measured devices');assert.ok(result.roles.length>=4,'Devices occupy at least four surface categories');}
    report.cases.push({width,language,view:name,...result});
   }
   await view(page,'profile');await waitEquipment(page);await page.mouse.move(width-2,1098);
   assert.ok((await audit(page)).active<=8,'Ambient device budget');
   if(width===1600){
    // Theme changes preserve the accepted Default geometry.
    await view(baseline,'profile');const original=await geometry(baseline);
    for(const id of await page.evaluate(()=>Object.keys(window.DSThemeEquipmentCatalog))){await page.evaluate(id=>{applyGraphicalStyle(id);DSThemeEquipment.refresh();},id);await waitEquipment(page);sameGeometry(await geometry(page),original,id+'/Default');const review=await audit(page);if(review.failures.length)fs.writeFileSync(path.join(__dirname,'local35-equipment-theme-failure.json'),JSON.stringify({id,review,boxes:await page.evaluate(()=>[...document.querySelectorAll('.theme-vfx-layer,.theme-equipment-layer')].map(e=>({key:e.dataset.equipmentKey||e.dataset.vfxKey,hidden:e.hidden,box:e.getBoundingClientRect().toJSON(),parent:e.parentElement.outerHTML.slice(0,200)})))},null,2));assert.deepEqual(review.failures,[]);}
    assert.ok(await page.locator('[data-equipment-role=socket]:not([hidden])').count()>0,'A portrait socket is actually present');
    const image=page.locator('.profile-portrait-frame>img').first();await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));for(const animation of document.getAnimations())animation.pause();});await settle(page);
    const face=await image.screenshot({animations:'allow'}),hide=await page.addStyleTag({content:'.theme-equipment-layer{display:none!important}'});await settle(page);
    assert.equal(hash(await image.screenshot({animations:'allow'})),hash(face),'Actual portrait pixels are unchanged');await hide.evaluate(el=>el.remove());await settle(page);
    await page.evaluate(()=>{
     const el=[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].find(el=>el.dataset.equipmentRole==='nav'&&el.parentElement.classList.contains('active')&&el.getAnimations({subtree:true}).length);window.__equipmentLayer=el;window.__equipmentClock=el.getAnimations({subtree:true})[0];__equipmentClock.pause();__equipmentClock.currentTime=2170;
    });await settle(page);
    const key=await page.evaluate(()=>__equipmentLayer.dataset.equipmentKey),phase=await page.evaluate(()=>__equipmentClock.currentTime),snapshot=await page.locator('[data-equipment-key="'+key+'"]').screenshot({animations:'allow'});
    await page.evaluate(()=>{const host=__equipmentLayer.parentElement;host.replaceWith(host.cloneNode(true));DSThemeEquipment.refresh();});await settle(page);
    assert.equal(await page.evaluate(()=>document.querySelector('[data-equipment-key="'+__equipmentLayer.dataset.equipmentKey+'"]')===__equipmentLayer),true);
    assert.equal(await page.evaluate(()=>__equipmentLayer.getAnimations({subtree:true})[0]===__equipmentClock),true);assert.equal(await page.evaluate(()=>__equipmentClock.currentTime),phase);
    assert.equal(hash(await page.locator('[data-equipment-key="'+key+'"]').screenshot({animations:'allow'})),hash(snapshot),'Polling replacement retains exact pixels');
    await page.evaluate(()=>{for(let i=0;i<4;i++)DSThemeEquipment.refresh();});await settle(page);assert.equal(await page.evaluate(()=>__equipmentClock.currentTime),phase);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__equipmentClock.currentTime),phase);
    const restored=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});document.dispatchEvent(new Event('visibilitychange'));return __equipmentClock.currentTime;});assert.equal(restored,phase,'Visible recovery does not restart equipment');
    await page.waitForFunction(()=>__equipmentLayer.dataset.equipmentActive==='true');
    await page.evaluate(()=>{window.__equipmentTransform=__equipmentLayer.parentElement.style.transform;__equipmentLayer.parentElement.style.setProperty('transform','translateY(2000px)','important');});await page.waitForFunction(()=>__equipmentLayer.dataset.equipmentActive==='false');await settle(page);
    const offscreen=await page.evaluate(()=>__equipmentClock.currentTime);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__equipmentClock.currentTime),offscreen,'Offscreen clock is frozen');
    await page.evaluate(()=>{__equipmentLayer.parentElement.style.transform=__equipmentTransform;});await page.waitForFunction(()=>__equipmentLayer.dataset.equipmentActive==='true');
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.__equipmentBackground=[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].map(layer=>({layer,clock:layer.getAnimations({subtree:true})[0]}));});await page.locator('#settings-open').hover();assert.ok((await audit(page)).active<=10);
    await page.locator('#settings-open').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#settings-dialog').evaluate(el=>el.open),true);await waitEquipment(page);
    assert.equal(await page.locator('.theme-equipment-layer[data-equipment-active=true]').evaluateAll(els=>els.every(el=>!!el.closest('dialog[open]'))),true);
    assert.equal(await page.evaluate(()=>__equipmentBackground.every(({layer,clock})=>layer.isConnected&&layer.getAnimations({subtree:true})[0]===clock)),true,'Opening a modal retains background layers and clocks');
    const backgroundPhase=await page.evaluate(()=>__equipmentClock.currentTime);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__equipmentClock.currentTime),backgroundPhase,'Background equipment is paused behind a modal');
    // A deliberate free test slot proves the modal is not blocked by backdrop
    // text or the twenty already-existing background placements. No product UI
    // spacing is changed, and a cramped real heading is never forced to fit.
    await page.evaluate(()=>{
     const button=document.createElement('button');button.id='equipment-modal-free-slot';button.className='button';button.type='button';button.textContent='Probe';
     Object.assign(button.style,{display:'block',width:'260px',maxWidth:'100%',height:'42px',boxSizing:'border-box',margin:'0 0 12px'});window.__equipmentProbeClicks=0;button.onclick=()=>__equipmentProbeClicks++;
     document.querySelector('#settings-dialog .dialog-body').prepend(button);DSThemeEquipment.refresh();
    });await waitEquipment(page);
    await page.waitForFunction(()=>document.querySelector('#equipment-modal-free-slot>.theme-equipment-layer:not([hidden])[data-equipment-ready=true]'));
    const modalReview=await audit(page);assert.ok(modalReview.visible>0,'A genuine free modal slot receives a small device');assert.deepEqual(modalReview.failures,[]);
    const device=page.locator('#equipment-modal-free-slot>.theme-equipment-layer'),deviceBox=await device.boundingBox();await page.mouse.click(deviceBox.x+deviceBox.width/2,deviceBox.y+deviceBox.height/2);assert.equal(await page.evaluate(()=>__equipmentProbeClicks),1,'Modal device remains click-through');
    await page.locator('#settings-dialog').evaluate(el=>el.close());await settle(page);
    assert.equal(await page.evaluate(()=>__equipmentBackground.every(({layer,clock})=>layer.isConnected&&layer.getAnimations({subtree:true})[0]===clock)),true,'Closing the modal restores the original background clocks');
    assert.ok(await page.evaluate(()=>__equipmentClock.currentTime)>=backgroundPhase,'Background phase does not reset on modal close');await page.locator('#equipment-modal-free-slot').evaluate(el=>el.remove());
   }
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle(page);assert.equal((await audit(page)).active,0);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.emulateMedia({reducedMotion:'reduce'});await settle(page);assert.equal((await audit(page)).active,0);
   assert.equal(await page.locator('.equipment-poster').evaluateAll(els=>els.every(el=>getComputedStyle(el).visibility==='visible')),true);
   await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});assert.equal(await page.locator('.theme-equipment-layer').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none')),true);
   assert.deepEqual(errors,[]);await page.close();await baseline.close();
  }
  report.success=true;fs.writeFileSync(require('node:path').join(__dirname,'local35-equipment-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));return report;
 }finally{await browser.close();}
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={test,audit};
