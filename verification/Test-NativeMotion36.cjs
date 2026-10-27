'use strict';
// One batched visual/geometry pass against the actual UI, with synthetic data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps})),sharp=require(require.resolve('sharp',{paths:deps}));sharp.concurrency(1);
const {routeApp}=require('./Test-ThemeLoops.cjs'),fixture=require('./LocalPreviewFixture.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'local36-native-motion'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={success:false,cases:[],assets:[],motion:[],errors:[]};
const ids=['default','fenix','protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg'];
async function open(browser,id,width=1600){
 const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));await routeApp(page,fixture(id,width===375?'ru':'en'));
 await page.goto('http://native36.test/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state?.library&&window.DSInPlaceMotion&&window.DSNativeFrameMotion);
 await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});await page.locator('nav [data-view=profile]').click();
 await page.waitForFunction(id=>{
  if(id==='fenix')return (innerWidth<=750||document.querySelector('.sidebar .inplace-sigil img')?.complete)&&!!document.querySelector('[data-native-surface=header-matrix]');
  if(id==='arcade'&&innerWidth>750&&!document.querySelector('.inplace-joystick-ball')?.complete)return false;
  return id==='default'||DSNativeFrameMotion.diagnostics().length>0&&DSNativeFrameMotion.diagnostics().every(x=>x.ready);
 },id);await page.mouse.move(2,2);await page.waitForTimeout(180);return page;
}
async function geometry(page){return page.evaluate(()=>{
 const result={};for(const selector of ['.sidebar .nav','.page-head','.profile-main-grid','.profile-commanders','.profile-region','.profile-best-card','.profile-average-grid>section','.profile-portrait-frame>img','.table-wrap th'])result[selector]=[...document.querySelectorAll(selector)].map(el=>{const b=el.getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(n=>Math.round(n*64)/64);});return result;
});}
function compare(a,b,label){for(const selector of Object.keys(b)){assert.equal(a[selector].length,b[selector].length,label+' '+selector);for(let i=0;i<b[selector].length;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(a[selector][i][j]-b[selector][i][j])<.1,label+' '+selector+'/'+i+'/'+j+' '+a[selector][i]+' / '+b[selector][i]);}}
async function seek(page,time){await page.evaluate(t=>{for(const a of document.getAnimations()){if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t+(a.nativePhase||0);}else try{a.finish();}catch{}}},time);await page.evaluate(()=>new Promise(requestAnimationFrame));}
async function difference(a,b){const x=await sharp(a).ensureAlpha().raw().toBuffer(),y=await sharp(b).ensureAlpha().raw().toBuffer();let count=0;for(let i=0;i<x.length;i+=4)if(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])>4)count++;return count;}
async function registered(page){return page.evaluate(()=>{
 const failures=[];
 for(const el of document.querySelectorAll('.native-frame-light36')){const p=getComputedStyle(el.parentElement,'::before'),s=getComputedStyle(el);for(const key of ['top','right','bottom','left','width','height','borderImageSlice','borderImageWidth','borderImageOutset'])if(s[key]!==p[key]&&!(s[key].endsWith('px')&&p[key].endsWith('px')&&Math.abs(parseFloat(s[key])-parseFloat(p[key]))<.025))failures.push(key+': '+s[key]+' != '+p[key]);}
 for(const el of document.querySelectorAll('.inplace-surface,.inplace-object,.native-frame-light36'))if(el.getAttribute('aria-hidden')!=='true'||!el.hasAttribute('inert')||getComputedStyle(el).pointerEvents!=='none')failures.push('not inert');
 return failures;
});}
function encode(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1',...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||String(r.error));}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'frames'),{recursive:true});
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'wwwroot/themes/native-motion36/catalog.json')));assert.equal(Object.keys(catalog.themes).length,18);
 for(const [id,e]of Object.entries(catalog.themes)){
  assert.ok(e.layers.length>0,'Native source material present '+id);
  const src=fs.readFileSync(path.join(root,'wwwroot',e.source));assert.equal(hash(src),e.sourceSha256);
  const original=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const mask of e.layers){const bytes=fs.readFileSync(path.join(root,'wwwroot',mask.src)),m=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(hash(bytes),mask.sha256);assert.deepEqual([m.info.width,m.info.height],[original.info.width,original.info.height]);let lit=0;for(let i=0;i<m.data.length;i+=4)if(m.data[i+3]){assert.deepEqual([...m.data.subarray(i,i+3)],[...original.data.subarray(i,i+3)],'Source RGB and exact coordinates '+id);assert.ok(m.data[i+3]<=original.data[i+3]);lit++;}assert.ok(lit>2);report.assets.push({id,source:e.source,mask:mask.src,pixels:lit,selection:e.selection});}
 }
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{
  for(const width of [1600,375]){
   const baseline=await open(browser,'default',width),base=await geometry(baseline);await baseline.close();
   for(const id of width===1600?ids:['fenix','terran','zerg','arcade']){
    const page=await open(browser,id,width);compare(await geometry(page),base,id+'/'+width);
    assert.equal(await page.locator('.theme-equipment-layer,.theme-vfx-layer').count(),0,'No old duplicate props');assert.deepEqual(await registered(page),[]);
    const roles=await page.locator('[data-native-surface]').evaluateAll(els=>els.map(el=>el.dataset.nativeSurface));if(id==='fenix')assert.deepEqual(roles.sort(),['header-matrix','projector','sidebar-matrix']);
    await seek(page,900);const first=await page.screenshot({animations:'allow'});await seek(page,3200);const second=await page.screenshot({path:path.join(out,id+'-'+width+'.png'),animations:'allow'});
    let pixels=await difference(first,second);if(id!=='default'&&pixels<=8){await seek(page,0);const zero=await page.screenshot({animations:'allow'});await seek(page,(catalog.themes[id]?.duration||8400)*.5);pixels=Math.max(pixels,await difference(zero,await page.screenshot({animations:'allow'})));}if(id!=='default'&&pixels<=8)console.log(JSON.stringify({lowMotion:id,width,pixels,clocks:await page.evaluate(()=>DSNativeFrameMotion.diagnostics())}));
    report.cases.push({id,width,defaultGeometry:true,registered:true,oldProps:0,roles,changedPixels:pixels});console.log(JSON.stringify({phase:'native-case',id,width,pixels}));
    if(process.env.DSC_NATIVE_CAPTURE==='1'&&width===1600&&['fenix','terran','arcade','zerg'].includes(id)){
     const clocks=await page.evaluate(()=>document.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity).length);
     for(let f=0;f<120;f++){await seek(page,f*1000/20);fs.writeFileSync(path.join(out,'frames',id+'-'+String(f).padStart(3,'0')+'.jpg'),await page.screenshot({type:'jpeg',quality:90,animations:'allow'}));}
     report.motion.push({id,frames:120,duration:6,fps:20,clocks});
    }
    if(width===1600&&id==='fenix'){
     await page.evaluate(()=>{window.__nativeClock=document.querySelector('[data-native-surface=projector]').getAnimations({subtree:true})[0];__nativeClock.playbackRate=1;});
     await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const t=await page.evaluate(()=>__nativeClock.currentTime);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__nativeClock.currentTime),t);
     await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#settings-open').click();await page.waitForFunction(()=>!!document.querySelector('[data-native-surface=preview-projector] .inplace-sigil img')?.complete);assert.equal(await page.locator('[data-native-active=true]').evaluateAll(els=>els.every(el=>!!el.closest('dialog[open]'))),true);
     await page.locator('#settings-dialog').evaluate(el=>el.close());await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelectorAll('[data-native-active=true]').length===0);assert.equal(await page.locator('[data-native-active=true]').count(),0);await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.locator('.inplace-object,.inplace-surface').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none')),true);
    }
    await page.close();
   }
  }
 }finally{await browser.close();}
 assert.deepEqual(report.errors,[]);assert.ok(report.cases.filter(x=>x.id==='fenix').every(x=>x.changedPixels>500),'Fenix projection visibly changes at both sizes');assert.ok(report.cases.find(x=>x.id==='arcade'&&x.width===1600).changedPixels>100,'Existing joystick moves');report.limits='Shell-source highlights are subtle or visually static on some skins; these are not bespoke object animations. The visible-motion acceptance applies to Fenix and the desktop Arcade joystick.';
 if(!report.motion.length){report.success=true;console.log(JSON.stringify({success:true,cases:report.cases.length,sourceMasks:report.assets.length,limits:report.limits}));return;}
 for(const m of report.motion)encode(['-framerate','20','-i',path.join(out,'frames',m.id+'-%03d.jpg'),'-frames:v','120','-c:v','libx264','-threads','1','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,m.id+'-in-place.mp4')]);
 fs.writeFileSync(path.join(out,'videos.txt'),report.motion.map(m=>"file '"+m.id+"-in-place.mp4'").join('\n'));
 encode(['-f','concat','-safe','0','-i',path.join(out,'videos.txt'),'-c','copy','-movflags','+faststart',path.join(out,'in-place-motion.mp4')]);
 const figures=report.cases.filter(c=>c.width===1600).map(c=>`<figure><img src="${c.id}-1600.png"><figcaption>${c.id}</figcaption></figure>`).join('');
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Local.36 — motion in the original art</title><style>body{background:#0b1017;color:#dce5eb;font:15px system-ui;margin:24px}img,video{max-width:100%}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}</style><h1>Motion in existing theme artwork</h1><p>Actual interface with synthetic data. Default layout; no floating equipment decorations.</p><video controls width="1200" src="in-place-motion.mp4"></video><div class="grid">'+figures+'</div>');
 report.success=true;console.log(JSON.stringify({success:true,cases:report.cases.length,sourceMasks:report.assets.length,movies:report.motion.length}));
}
if(require.main===module)main().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)));

module.exports={open,geometry,seek,registered,errors:report.errors};
