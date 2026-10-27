'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),fixture=require('./LocalPreviewFixture.cjs');
const report={success:false,assets:[],materials:[],browser:[]},digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function difference(a,b){let d=0;for(let i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d/a.length;}
async function routeApp(page,sample){
 await page.addInitScript(()=>{window.setInterval=()=>0;});
 await page.route('**/*',route=>{
  const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(name==='/api/state')return json({...sample,libraryVersion:'loop35-fixture',busy:false,replayStatus:'Synthetic material-loop review'});
  if(name==='/api/live-state')return json({lobby:sample.lobby,site:{}});if(name.startsWith('/api/'))return json({});
  const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
  return route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
}
async function ready(page,id){
 await page.evaluate(id=>{applyGraphicalStyle(id);DSThemeVfx.refresh();},id);
 try{await page.waitForFunction(id=>[...document.querySelectorAll('.theme-vfx-layer')].every(el=>el.dataset.vfxTheme===id&&el.dataset.vfxReady==='true'),id,{timeout:15000});}catch(error){const details=await page.locator('.theme-vfx-layer').evaluateAll(els=>els.map(el=>({theme:el.dataset.vfxTheme,ready:el.dataset.vfxReady,key:el.dataset.vfxKey})));console.error(JSON.stringify({phase:'theme-ready-timeout',id,details}));throw error;}
}
async function test(){
 const generator=require('./Build-ThemeLoops.cjs'),sharp=require(require.resolve('sharp',{paths:deps}));sharp.concurrency(1);
 const manifest=JSON.parse(fs.readFileSync(path.join(web,'themes/loops/manifest.json'),'utf8'));assert.equal(manifest.assets.length,40);assert.equal(manifest.revision,4);assert.equal(manifest.generatorSha256,generator.GENERATOR_HASH,'Assets match the final raster source set');
 for(const a of manifest.assets){
  const bytes=fs.readFileSync(path.join(web,a.src)),poster=fs.readFileSync(path.join(web,a.poster));
  assert.equal(digest(bytes),a.sha256);assert.equal(digest(poster),a.posterSha256);
  assert.equal(a.composition.renderer,'ThemeEquipmentRaster.cjs');assert.equal(a.composition.codePaintedFallback,false);assert.equal(a.composition.sourceComponent,a.kind==='header'?'utility':'core');
  assert.equal(digest(fs.readFileSync(path.join(root,a.composition.sourceImage))),a.composition.sourceImageSha256);assert.equal(digest(fs.readFileSync(path.join(root,a.composition.sourcePart))),a.composition.sourcePartSha256);
  const m=await sharp(bytes).metadata();assert.deepEqual([m.width,m.height,m.hasAlpha],[8192,384,true]);
  const p=await sharp(poster).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([p.info.width,p.info.height],[a.width,a.height]);
  let edge=0,attachment=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const alpha=p.data[(y*a.width+x)*4+3],attached=a.anchor==='bottom'?y===a.height-1:x===a.width-1;if(attached)attachment=Math.max(attachment,alpha);else if(!x||!y||x===a.width-1||y===a.height-1)edge=Math.max(edge,alpha);}assert.ok(attachment>30,'Scene connects to native housing: '+a.id+'/'+a.kind);
  assert.ok(edge<=2,'Transparent outer pixels: '+a.id+'/'+a.kind);report.assets.push({id:a.id,kind:a.kind,bytes:bytes.length,maxEdgeAlpha:edge});
 }
 for(const {id} of generator.themes){
  await generator.prepare(id);
  for(const kind of ['header','inset']){
   const ctx=generator.createContext(id,kind),render=f=>generator.renderFrame(ctx,f).data;
   // Non-harmonic samples expose a turning fan; exact quarter-turns can repeat
   // a symmetric physical rotor and therefore are not a reliable motion test.
   const f=[0,7,23,41,95,1].map(render),changes=f.slice(1,4).map(v=>difference(f[0],v));
   const motionPixels=f.slice(1,4).map(b=>{let count=0;for(let i=0;i<b.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(f[0][i+c]*f[0][i+3]-b[i+c]*b[i+3])/255;if(delta>3)count++;}return count;});
   const part=ctx.source.parts[ctx.profile.sourceComponent],holes=kind==='header'?part.meta.apertures:[part.meta.aperture];
   const g=generator.KINDS[kind],fit=require('./ThemeEquipmentRaster.cjs').fitted(part.image,g.width,g.height),offset=ctx.contactOffset;
   const windows=(holes||[]).map(h=>({left:fit.x+h.bounds.left*fit.scale+offset.x-2,top:fit.y+h.bounds.top*fit.scale+offset.y-2,right:fit.x+(h.bounds.left+h.bounds.width)*fit.scale+offset.x+2,bottom:fit.y+(h.bounds.top+h.bounds.height)*fit.scale+offset.y+2}));
   let stationary=0,changedShell=0;
   for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
    const i=(y*g.width+x)*4;if(f[0][i+3]<250||windows.some(w=>x>=w.left&&x<=w.right&&y>=w.top&&y<=w.bottom))continue;
    stationary++;if(f.slice(1,4).some(b=>[0,1,2,3].some(c=>Math.abs(b[i+c]-f[0][i+c])>2)))changedShell++;
   }
   assert.ok(stationary>20,'Fixed physical shell remains present: '+id+'/'+kind);assert.equal(changedShell,0,'Original housing pixels never animate: '+id+'/'+kind);
   const naturalMotion=!!part.apertureMask;
   if(kind==='inset'||naturalMotion)assert.ok(Math.max(...motionPixels)>=(kind==='inset'?8:3),'Actual interior parts move: '+id+'/'+kind);
   else assert.ok(motionPixels.every(n=>n===0),'No invented moving cavity in opaque intake: '+id);
   const seam=difference(f[4],f[0]),neighbor=difference(f[0],f[5]);assert.ok(seam<Math.max(5,neighbor*4),'Physical loop seam: '+id+'/'+kind);assert.deepEqual(render(0),render(96),'Exact period: '+id+'/'+kind);
   report.materials.push({id,kind,source:ctx.profile.sourceImage,motionPixels,nonHarmonicDifferences:changes,stationaryShellPixels:stationary,changedShellPixels:changedShell,naturalMotion,seamDifference:seam,nextDifference:neighbor});
  }
 }
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{for(const width of [1600,375]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await routeApp(page,fixture('fenix',width===375?'ru':'en'));await page.goto('http://loop34.test/',{waitUntil:'domcontentloaded',timeout:10000});await page.waitForFunction(()=>state?.library&&window.DSThemeVfx);
  await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});await page.locator('nav [data-view=profile]').click();await ready(page,'fenix');
  const active=()=>page.locator('.theme-vfx-layer[data-vfx-active=true]').count();
  const phases=await page.locator('.theme-vfx-layer').evaluateAll(els=>els.map(e=>e.style.getPropertyValue('--loop-shift')));
  await page.evaluate(()=>{for(let i=0;i<5;i++)DSThemeVfx.refresh();});assert.deepEqual(await page.locator('.theme-vfx-layer').evaluateAll(els=>els.map(e=>e.style.getPropertyValue('--loop-shift'))),phases);
  for(const {id} of generator.themes){
   await ready(page,id);assert.ok(await active()<=3);
   assert.equal(await page.locator('.theme-vfx-layer:not([hidden])').evaluateAll(els=>els.every(el=>{
    if(!['header','panel'].includes(el.dataset.vfxRole))return true;const box=el.getBoundingClientRect(),walker=document.createTreeWalker(el.parentElement,NodeFilter.SHOW_TEXT),range=document.createRange();let n;
    while((n=walker.nextNode()))if(n.textContent.trim()){range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width&&r.height&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)return false;}return true;
   })),true,'Text clearance: '+id+'/'+width);
   const layer=page.locator('.theme-vfx-layer[data-vfx-active=true]').first();
   if(await layer.count()){
    const frames=await layer.evaluate(async el=>{
     el.style.setProperty('--loop-shift','0s');const animations=el.getAnimations({subtree:true});for(const a of animations)a.playbackRate=0;
     const result=[];for(const time of [10,1010,2010,3010,4010]){for(const a of animations)a.currentTime=time;await new Promise(requestAnimationFrame);result.push([...el.querySelectorAll('.vfx-loop-x,.vfx-loop-y')].map(e=>getComputedStyle(e).transform));}return result;
    });assert.deepEqual(frames[0],frames[4]);assert.notDeepEqual(frames[0],frames[1]);
    await layer.evaluate(el=>{for(const a of el.getAnimations({subtree:true}))a.playbackRate=1;});
   }
   report.browser.push({id,width,active:await active(),clearance:true});
  }
  const beforeBlur=await active();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await active(),0);
  assert.equal(await page.locator('.vfx-loop-x').evaluateAll(els=>els.every(e=>e.getAnimations().every(a=>a.playState==='paused'))),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await active(),beforeBlur);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.hasAttribute('data-vfx-paused'));assert.equal(await active(),0);
  assert.equal(await page.locator('.vfx-loop-poster').first().evaluate(e=>getComputedStyle(e).visibility),'visible');assert.equal(await page.evaluate(()=>DSThemeVfx.preview()),false);
  await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});assert.equal(await page.locator('.theme-vfx-layer').evaluateAll(els=>els.every(e=>getComputedStyle(e).display==='none')),true);
  await page.emulateMedia({forcedColors:'none'});await page.locator('#settings-open').click();await page.locator('.appearance-effects-stage').scrollIntoViewIfNeeded();await ready(page,'classic-zerg');
  await page.waitForFunction(()=>document.querySelector('[data-vfx-role=preview][data-vfx-active=true]'));assert.equal(await page.locator('.theme-vfx-layer[data-vfx-active=true]').evaluateAll(els=>els.every(e=>!!e.closest('dialog[open]'))),true);
  assert.equal(await page.evaluate(()=>DSThemeVfx.preview()),true);
  await page.evaluate(()=>{applyGraphicalStyle('terran');DSThemeVfx.refresh();applyGraphicalStyle('fenix');DSThemeVfx.refresh();});await ready(page,'fenix');
  assert.equal(await page.locator('.vfx-loop-atlas').evaluateAll(els=>els.every(e=>e.src.includes('/fenix-'))),true,'No stale decoded theme after interrupted switch');
  await page.locator('.appearance-effects-stage').evaluate(e=>e.scrollIntoView());await page.evaluate(()=>document.querySelector('.appearance-effects-stage').style.display='none');await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-vfx-role=preview][data-vfx-active=true]').count(),0,'Offscreen/hidden preview stops');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
 report.success=true;console.log(JSON.stringify({success:true,assets:40,themes:20,browserCases:report.browser.length}));
}
if(require.main===module)test().catch(e=>{report.error=e.stack;console.error(e);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(__dirname,'local35-loops-browser.json'),JSON.stringify(report,null,2)));
module.exports={routeApp,ready};
