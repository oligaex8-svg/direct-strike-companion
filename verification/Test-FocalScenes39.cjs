'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const {open,boxes,checks,seek}=require('./Test-MaterialMotion38.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'local39-hover-scenes');
const catalog=require('../wwwroot/themes/focal39/catalog.json');
const report={success:false,cases:[],lifecycle:[],assets:[],errors:[]};
function same(a,b,label){for(const key of Object.keys(b)){assert.equal(a[key].length,b[key].length,label+key);for(let i=0;i<b[key].length;i++)for(let k=0;k<4;k++)assert.ok(Math.abs(a[key][i][k]-b[key][i][k])<.1,label+key+JSON.stringify([a[key][i],b[key][i]]));}}
async function ready(p,id,scope){await p.waitForFunction(({id,scope})=>window.DSFocalScenes?.diagnostics().some(x=>x.id===id&&x.scope===scope&&x.ready),{id,scope});}
async function sceneChecks(p){return p.evaluate(()=>{const errors=[];for(const el of document.querySelectorAll('.focal-scene39')){if(el.getAttribute('aria-hidden')!=='true'||!el.hasAttribute('inert')||getComputedStyle(el).pointerEvents!=='none')errors.push('Not inert');if(el.hidden)continue;const b=el.getBoundingClientRect();if(el.dataset.focalScope==='sidebar'){const nav=document.querySelector('.sidebar nav').getBoundingClientRect(),dock=document.querySelector('.sidebar-bottom').getBoundingClientRect();if(b.top<nav.bottom||b.bottom>dock.top)errors.push('Outside gap');}else{const host=el.parentElement.getBoundingClientRect();if(b.top<host.top||b.bottom>host.bottom||b.left<host.left||b.right>host.right)errors.push('Outside preview');}}return errors;});}
async function main(){
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 for(const entry of Object.values(catalog.themes)){
  for(const source of entry.sources)assert.equal(hash(fs.readFileSync(path.join(root,source.file))),source.hash);
  for(const [scope,spec]of Object.entries(entry.compositions)){assert.equal(hash(fs.readFileSync(path.join(root,'wwwroot',spec.base))),spec.baseHash);assert.equal(hash(fs.readFileSync(path.join(root,'wwwroot',spec.poster))),spec.posterHash);assert.equal(hash(fs.readFileSync(path.join(root,'wwwroot',spec.atlas))),spec.atlasHash);assert.ok(spec.verification.exactLoop&&spec.verification.stationaryOutsideAperture&&spec.verification.changedPixelsAcrossFrames>100);report.assets.push({id:entry.id,scope,loop:true,stationaryCasing:true});}
 }
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{
  const ids=process.env.DSC_FOCAL_PILOT==='1'?['nova','mecha','zerg','protoss']:Object.keys(catalog.themes);
  for(const [width,height,view,list]of [[1600,1000,'profile',ids],[1000,750,'lobby',['nova','zerg']],[375,1000,'lobby',['nova','mecha']]]){
   const base=await open(browser,'default',width,height,view),g=await boxes(base);await base.close();
   for(const id of list){const p=await open(browser,id,width,height,view);p.on('pageerror',e=>report.errors.push(e.message));if(id!=='arcade'&&width>750&&height===1000)await ready(p,id,'sidebar');same(await boxes(p),g,id+'/'+view+'/'+width);assert.deepEqual(await checks(p,id),[]);assert.deepEqual(await sceneChecks(p),[]);
    await seek(p,1800);if(width===1600){await p.screenshot({path:path.join(out,id+'-profile.png'),animations:'allow'});await p.locator('#settings-open').click();await ready(p,id,'preview');assert.deepEqual(await sceneChecks(p),[]);await seek(p,1800);await p.locator('#settings-dialog').screenshot({path:path.join(out,id+'-settings.png'),animations:'allow'});const stage=p.locator('.appearance-effects-stage');await stage.screenshot({path:path.join(out,id+'-stage.png'),animations:'allow'});
     // Moving the pointer across normal controls cannot rebuild a scene clock.
     const before=await p.evaluate(()=>{window.__focalClock=document.querySelector('[data-focal-scope=preview] .focal-atlas39').getAnimations()[0];return DSFocalScenes.diagnostics().find(x=>x.scope==='preview');});
     await p.locator('[data-ui-motion-preview]').hover();await p.mouse.move(10,10);assert.ok(await p.evaluate(()=>{for(let i=0;i<10;i++)DSFocalScenes.refresh();return document.querySelector('[data-focal-scope=preview] .focal-atlas39').getAnimations()[0]===__focalClock;}));
     assert.ok(await p.evaluate(()=>DSFocalScenes.diagnostics().filter(x=>x.active).every(x=>x.scope==='preview')));await p.locator('#settings-dialog').evaluate(el=>el.close());
     if(['nova','mecha','zerg'].includes(id)){
      await p.evaluate(()=>{for(const a of document.getAnimations())if(a.effect.getTiming().iterations===Infinity)a.playbackRate=1;dispatchEvent(new Event('blur'));});const t=await p.evaluate(()=>DSFocalScenes.diagnostics().find(x=>x.scope==='sidebar').time);await p.waitForTimeout(90);assert.equal(await p.evaluate(()=>DSFocalScenes.diagnostics().find(x=>x.scope==='sidebar').time),t);await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(40);assert.ok(await p.evaluate(()=>DSFocalScenes.diagnostics().every(x=>!x.active)));assert.ok(await p.locator('.focal-motion39').evaluateAll(es=>es.every(e=>getComputedStyle(e).display==='none')));await p.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});assert.ok(await p.locator('.focal-scene39').evaluateAll(es=>es.every(e=>getComputedStyle(e).display==='none')));report.lifecycle.push({id,blur:true,modal:true,reduced:true,forced:true,hoverClockStable:true});
      await p.waitForTimeout(150);await p.evaluate(()=>{window.__decorationMutations=0;window.__decorationObserver=new MutationObserver(records=>__decorationMutations+=records.length);__decorationObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});});await p.waitForTimeout(180);assert.equal(await p.evaluate(()=>{__decorationObserver.disconnect();return __decorationMutations;}),0,'Accessibility pause must settle without decorative observer churn');
     }
    }report.cases.push({id,width,height,view,defaultGeometry:true,diagnostics:await p.evaluate(()=>DSFocalScenes.diagnostics())});await p.close();console.log(JSON.stringify({id,width,view,ok:true}));
   }
  }assert.deepEqual(report.errors,[]);report.success=true;
 }finally{await browser.close();}
 console.log(JSON.stringify({success:true,cases:report.cases.length,lifecycle:report.lifecycle.length}));
}
main().catch(e=>{report.error=e.stack;console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(out,'focal-report.json'),JSON.stringify(report,null,2)));
