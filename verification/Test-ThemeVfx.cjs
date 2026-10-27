'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),fixture=require('./LocalPreviewFixture.cjs'),manifest=require('../wwwroot/themes/vfx/manifest.json');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),report={success:false,themes:[],cases:[]},capture=process.env.DSC_VFX_CAPTURE!=='0';
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
 try{
  assert.equal(manifest.themes.length,20);const hashes=new Set();let maxEdgeAlpha=0,minLitFraction=1;
  for(const {id} of manifest.themes)for(const part of ['field','flow','nodes']){
   const filename=path.join(web,'themes/vfx',id+'-'+part+'.png'),bytes=fs.readFileSync(filename);
   hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
   const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   assert.deepEqual([info.width,info.height,info.channels],[480,240,4]);let lit=0,edge=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const alpha=data[(y*info.width+x)*4+3];if(alpha>4)lit++;
    if(!x||!y||x===info.width-1||y===info.height-1)edge=Math.max(edge,alpha);
   }
   maxEdgeAlpha=Math.max(maxEdgeAlpha,edge);minLitFraction=Math.min(minLitFraction,lit/(info.width*info.height));
   assert.ok(edge<=2,'Material must feather before its canvas edge: '+id+'/'+part);
   assert.ok(lit/(info.width*info.height)>(part==='nodes'?.002:.02),'Material must contain visible light or particles: '+id+'/'+part);
  }
  report.textures={count:hashes.size,format:'RGBA PNG',maxEdgeAlpha,minLitFraction};
  assert.ok(!fs.readFileSync(path.join(web,'themes/vfx/tokens.css'),'utf8').includes('.svg'),'Runtime materials no longer load wireframe vectors');
  assert.ok(!fs.readFileSync(path.join(web,'theme-vfx.css'),'utf8').includes('repeating-linear-gradient'),'The animated material pass has no hard striped light bands');
  assert.equal(hashes.size,60,'Every theme has its own three authored material layers');
  for(const width of [1600,375]){
   const sample=fixture('fenix',width===375?'ru':'en'),page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.setInterval=()=>0;});
   await page.route('**/*',route=>{
    const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(name==='/api/state')return json({...sample,libraryVersion:'theme-vfx-fixture',busy:false,replayStatus:'Synthetic graphical-effects preview'});
    if(name==='/api/live-state')return json({lobby:sample.lobby,site:{}});
    if(name.startsWith('/api/'))return json({});
    const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.goto('http://theme-vfx.test/');await page.waitForFunction(()=>state?.library&&window.DSThemeVfx);await page.bringToFront();await page.evaluate(()=>document.fonts.ready);
   await page.locator('nav [data-view=profile]').click();await page.waitForFunction(()=>document.querySelectorAll('.theme-vfx-layer[data-vfx-active=true]').length>0);
   if(width===1600){
    await page.setViewportSize({width,height:850});await page.evaluate(()=>DSThemeVfx.refresh());
    assert.equal(await page.locator('[data-vfx-role=scenery]:not([hidden])').evaluateAll(layers=>layers.every(el=>[...el.querySelectorAll('.vfx-field,.vfx-flow,.vfx-nodes')].every(span=>parseFloat(getComputedStyle(span).height)<=el.clientHeight+1))),true,'Short-window scenery fits without a hard crop');
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>DSThemeVfx.refresh());
   }
   const baseline=await page.evaluate(()=>({text:document.querySelector('#library-content').textContent,count:document.querySelectorAll('.theme-vfx-layer').length,phases:[...document.querySelectorAll('.theme-vfx-layer')].map(e=>e.style.getPropertyValue('--vfx-offset'))}));
   await page.evaluate(()=>{for(let i=0;i<5;i++)DSThemeVfx.refresh();});
   assert.deepEqual(await page.evaluate(()=>({count:document.querySelectorAll('.theme-vfx-layer').length,phases:[...document.querySelectorAll('.theme-vfx-layer')].map(e=>e.style.getPropertyValue('--vfx-offset'))})),{count:baseline.count,phases:baseline.phases},'Refresh does not duplicate layers or reset their phase');
   const active=()=>page.evaluate(()=>[...document.querySelectorAll('.theme-vfx-layer')].filter(el=>el.dataset.vfxActive==='true').length);
   assert.ok(await active()<=6);
   assert.ok(await page.locator('.theme-vfx-layer').evaluateAll(els=>els.every(el=>el.getAttribute('aria-hidden')==='true'&&getComputedStyle(el).pointerEvents==='none')));
   assert.equal(await page.locator('[data-vfx-role=frame]').evaluateAll(els=>els.every(el=>getComputedStyle(el).zIndex==='-1'&&getComputedStyle(el.parentElement).isolation==='isolate')),true,'Projection sits beneath readable content');
   if(width===1600){
    assert.equal(await page.locator('[data-vfx-mode=projection]:not([hidden])').count(),1,'The measured empty showcase area contains a complete projection');
    assert.equal(await page.locator('[data-vfx-mode=projection]:not([hidden])').evaluate(el=>{
     const box=el.getBoundingClientRect(),host=el.parentElement,range=document.createRange(),walker=document.createTreeWalker(host.querySelector('.profile-favourite-main'),NodeFilter.SHOW_TEXT);let node;
     while((node=walker.nextNode()))if(node.textContent.trim()){range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width&&r.height&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)return false;}
     return true;
    }),true,'Projected geometry clears every showcase text range');
   }
   const flow=page.locator('.theme-vfx-layer[data-vfx-active=true] .vfx-flow').first(),before=await flow.evaluate(el=>getComputedStyle(el).transform);
   await page.waitForTimeout(300);assert.notEqual(await flow.evaluate(el=>getComputedStyle(el).transform),before,'Material graphics move without a data update');
   assert.equal(await page.locator('#library-content').textContent(),baseline.text,'No stats or text change with the atmosphere');
   if(width===1600&&capture){
    const frames=[],delay=[];let frameHeight=0;
    for(const id of ['mecha','mira','zerg','cerberus']){
     await page.evaluate(id=>{state.library.settings.graphicalStyle=id;applyGraphicalStyle(id);DSThemeVfx.refresh();},id);
     await page.locator('.theme-vfx-layer span').evaluateAll(els=>Promise.all(els.map(el=>{const url=getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];if(!url)return;const img=new Image();img.src=url;return img.decode();})));
     for(const t of Array.from({length:24},(_,i)=>i*125)){
      await page.evaluate(t=>{for(const a of document.getAnimations())if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t;}else a.finish();},t);
      const frame=await sharp(await page.screenshot({animations:'allow'})).resize({width:1000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      frameHeight=frame.info.height;frames.push(frame.data);delay.push(125);
     }
    }
    await sharp(Buffer.concat(frames),{raw:{width:1000,height:frameHeight*frames.length,channels:4,pageHeight:frameHeight}}).gif({delay,loop:0,effort:2}).toFile(path.join(__dirname,'local32-interface-effects.gif'));
    const tiles=[];
    for(const {id,label} of manifest.themes){
     await page.evaluate(id=>{applyGraphicalStyle(id);DSThemeVfx.refresh();for(const a of document.getAnimations())if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=1400;}},id);
     const capture=await page.screenshot({path:path.join(__dirname,'local32-theme-'+id+'.png'),animations:'allow'});
     const heading=Buffer.from('<svg width="400" height="24"><rect width="400" height="24" fill="#080d14"/><text x="9" y="16" font-family="Arial" font-size="12" fill="#d7e4ed">'+id+' · '+label.replaceAll('&','&amp;')+'</text></svg>');
     tiles.push(await sharp(capture).resize({width:400}).extend({top:24,bottom:0,left:0,right:0,background:'#080d14'}).composite([{input:heading,top:0,left:0}]).png().toBuffer());
    }
    await sharp({create:{width:1600,height:274*5,channels:4,background:'#080d14'}}).composite(tiles.map((input,i)=>({input,left:i%4*400,top:Math.floor(i/4)*274}))).webp({quality:88}).toFile(path.join(__dirname,'local32-theme-gallery.webp'));
    await page.evaluate(()=>{applyGraphicalStyle('fenix');DSThemeVfx.refresh();for(const a of document.getAnimations())if(a.effect.getTiming().iterations===Infinity)a.playbackRate=1;});
    await page.screenshot({path:path.join(__dirname,'local32-fenix-interface.png'),animations:'allow'});
   }
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await active(),0,'Inactive window pauses all effects');
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.ok(await active()>0);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.hasAttribute('data-vfx-paused'));
    assert.ok(await page.locator('.theme-vfx-layer .vfx-flow').first().evaluate(el=>getComputedStyle(el).animationName==='none'));assert.equal(await active(),0);
   await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});assert.ok(await page.locator('.theme-vfx-layer').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none')));
   await page.emulateMedia({forcedColors:'none'});
   await page.locator('#settings-open').click();await page.waitForFunction(()=>document.querySelector('[data-vfx-role=preview][data-vfx-active=true]'));
   assert.equal(await page.locator('.theme-vfx-layer[data-vfx-active=true]').evaluateAll(els=>els.every(el=>!!el.closest('dialog[open]'))),true,'Dialog preview pauses atmosphere behind it');
   const stage=page.locator('.appearance-effects-stage');await stage.scrollIntoViewIfNeeded();
   const film=[],delays=[];let filmHeight=0;
   for(const {id,cycle=7} of width===1600?manifest.themes:[{id:'fenix'},{id:'zerg'}]){
    await page.evaluate(id=>{state.library.settings.graphicalStyle=id;applyGraphicalStyle(id);DSThemeVfx.refresh();},id);
    await page.locator('[data-vfx-role=preview] :is(.vfx-field,.vfx-flow,.vfx-nodes)').evaluateAll(els=>Promise.all(els.map(el=>{const url=getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];if(!url)throw Error('Missing effect artwork');const img=new Image();img.src=url;return img.decode();})));
    const material=await page.locator('[data-vfx-role=preview]').evaluate(el=>({theme:el.dataset.vfxTheme,active:el.dataset.vfxActive,art:[...el.querySelectorAll('.vfx-field,.vfx-flow,.vfx-nodes')].map(e=>getComputedStyle(e).backgroundImage),motion:[...el.children].map(e=>getComputedStyle(e).animationName)})).catch(async error=>{report.failure={width,id,errors,dom:await page.evaluate(()=>({settings:document.querySelector('#settings-dialog')?.open,stage:!!document.querySelector('[data-theme-vfx-preview]'),dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),layers:[...document.querySelectorAll('.theme-vfx-layer')].map(l=>({role:l.dataset.vfxRole,theme:l.dataset.vfxTheme,parent:l.parentElement?.className}))}))};throw error;});
    assert.equal(material.theme,id);assert.equal(material.active,'true');assert.ok(material.art.every(url=>url.includes('/'+id+'-')));assert.ok(material.motion.filter(name=>name!=='none').length>=2);
    if(width===1600){
     const samples=[],phase=await stage.evaluate(el=>{const layer=el.querySelector('.theme-vfx-layer'),phase=layer.style.getPropertyValue('--vfx-offset');layer.style.setProperty('--vfx-offset','0s');return phase;});
     // Cover one complete dominant material cycle. A clock-dependent 2.3s
     // window can sample only the quiet breathing phase of a localized leak.
     for(const t of Array.from({length:5},(_,i)=>i*cycle*250)){
      await stage.evaluate((el,t)=>{for(const a of el.getAnimations({subtree:true}))if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t;}},t);
      samples.push(await sharp(await page.screenshot({clip:await stage.boundingBox(),animations:'allow'})).resize({width:320}).removeAlpha().raw().toBuffer());
     }
     material.motionPixels={meanChannelDelta:0,changedPixelFraction:0};
     for(const sample of samples.slice(1)){
      let delta=0,changed=0;
      for(let i=0;i<samples[0].length;i+=3){let peak=0;for(let c=0;c<3;c++){const d=Math.abs(samples[0][i+c]-sample[i+c]);delta+=d;peak=Math.max(peak,d);}if(peak>=12)changed++;}
      material.motionPixels.meanChannelDelta=Math.max(material.motionPixels.meanChannelDelta,delta/samples[0].length);
      material.motionPixels.changedPixelFraction=Math.max(material.motionPixels.changedPixelFraction,changed/(samples[0].length/3));
     }
     await stage.evaluate((el,phase)=>{el.querySelector('.theme-vfx-layer').style.setProperty('--vfx-offset',phase);for(const a of el.getAnimations({subtree:true}))if(a.effect.getTiming().iterations===Infinity)a.playbackRate=1;},phase);
     report.themes.push(material);
    }
    if(width===1600&&capture&&['mecha','mira','zerg','cerberus'].includes(id)){
     for(const t of Array.from({length:16},(_,i)=>i*125)){
      await stage.evaluate((el,t)=>{for(const a of el.getAnimations({subtree:true}))if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t;}},t);
      const clip=await stage.boundingBox(),raw=await page.screenshot({clip,animations:'allow'});
      const frame=await sharp(raw).resize({width:800}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if(filmHeight)assert.equal(frame.info.height,filmHeight);filmHeight=frame.info.height;
      film.push(frame.data);delays.push(125);
     }
     await stage.evaluate(el=>{for(const a of el.getAnimations({subtree:true}))if(a.effect.getTiming().iterations===Infinity)a.playbackRate=1;});
    }
   }
   await page.locator('[data-ui-motion-preview]').click();assert.equal(await page.locator('#settings-dialog').evaluate(el=>el.open),true);
   for(const reason of ['blur','hidden','reduce']){
    await page.evaluate(()=>DSThemeVfx.preview());
    if(reason==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
    else await page.evaluate(reason=>{if(reason==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}else window.dispatchEvent(new Event('blur'));},reason);
    assert.equal(await stage.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.playState==='running')),false,'Preview interruption pauses every animation: '+reason);
    if(reason==='reduce')await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(__dirname,'local32-effects-settings-'+width+'.png'),animations:'disabled'});
   if(film.length)await sharp(Buffer.concat(film),{raw:{width:800,height:filmHeight*film.length,channels:4,pageHeight:filmHeight}}).gif({delay:delays,loop:0,effort:2}).toFile(path.join(__dirname,'local32-graphical-effects.gif'));
   report.cases.push({width,activeCap:6,phasePreserved:true,readingsSteady:true,blur:true,reduced:true,forced:true,dialogPriority:true});await page.close();
  }
  const faint=report.themes.filter(t=>t.motionPixels.meanChannelDelta<=1.2||t.motionPixels.changedPixelFraction<=.012).map(t=>({theme:t.theme,...t.motionPixels}));
  assert.deepEqual(faint,[],'Every theme must have clearly changing graphical pixels');
  report.success=true;console.log(JSON.stringify({success:true,themes:report.themes.length,cases:report.cases.length}));
 }finally{await browser.close();fs.writeFileSync(path.join(__dirname,'local32-vfx-browser.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
