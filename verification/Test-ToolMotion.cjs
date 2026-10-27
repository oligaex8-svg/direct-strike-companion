'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),fixture=require('./LocalPreviewFixture.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),report={success:false,cases:[]},film=[],delays=[];
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
 try{
  for(const width of [1000,375]){
   const sample=fixture('zerg','en'),lib=sample.library,own=lib.settings.selfIds[0];
   for(let group=0;group<12;group++){
    const others=Array.from({length:5},(_,i)=>({id:'2-S2-1-'+(8000+group*5+i),name:'Motion player '+String(group*5+i).padStart(2,'0'),aliases:[],race:'Terran',team:i<2?1:2,commander:'Raynor',result:i<2?'Win':'Loss'}));
    lib.players.push(...others);lib.matches.push({hash:'motion-'+group,title:'Direct Strike',map:'Direct Strike',mode:'Commanders',time:new Date(Date.UTC(2026,9,22,group)).toISOString(),seconds:600,winner:1,players:[{id:own,name:'Own',team:1,commander:'Raynor',result:'Win'},...others]});
   }
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(name==='/api/state')return json({...sample,libraryVersion:'motion-fixture',busy:false,replayStatus:'Synthetic motion preview'});
    if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:lib.dsstatsLookups}});
    if(name==='/api/appearance'){lib.settings.graphicalStyle=route.request().postDataJSON().style;return json({style:lib.settings.graphicalStyle});}
    if(name==='/api/sort'){await new Promise(r=>setTimeout(r,80));const s=route.request().postDataJSON();lib.settings.sortPreferences[s.scope]={key:s.key,direction:s.direction};return json({});}
    if(name.startsWith('/api/'))return json({});
    const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.addInitScript(()=>{
    window.setInterval=()=>0;window.toolMotionCalls=[];const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){toolMotionCalls.push({id:this.id,tag:this.tagName,classes:this.className,dialog:this.closest('dialog')?.id,duration:options.duration,frames});return animate.call(this,frames,options);};
   });
   const finish=()=>page.evaluate(()=>{for(const a of document.getAnimations())if(a.effect?.getTiming().iterations!==Infinity)try{a.finish();}catch{}return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const count=()=>page.evaluate(()=>toolMotionCalls.length);
   const respond=async(action,test)=>{const start=await count(),began=Date.now();await action();try{await page.waitForFunction(({start,test})=>toolMotionCalls.slice(start).some(call=>test==='content'?call.id==='library-content':test==='dialog'?!!call.dialog:true),{start,test});}catch(error){console.error(JSON.stringify({action:String(action),elapsed:Date.now()-began,state:await page.evaluate(start=>({mode:document.documentElement.dataset.uiMotionInput,view:document.querySelector('#main')?.dataset.view,pager:document.querySelector('[data-directory-pager]')?.textContent,calls:toolMotionCalls.slice(start),focus:document.activeElement?.outerHTML.slice(0,250)}),start)}));throw error;}assert.equal(await page.locator('#toast').evaluate(el=>el.hidden),true,'No caught application error toast: '+await page.locator('#toast').textContent());return start;};
   const nav=id=>page.locator('nav [data-view="'+id+'"]');
   async function filmScene(){
    if(width!==1000)return;
    await page.evaluate(()=>{window.qaMotion=document.getAnimations().filter(a=>a.playState!=='finished'&&a.effect?.getTiming().iterations!==Infinity);for(const a of qaMotion)a.pause();});
    for(const t of [0,40,80,140,200,260]){
     await page.evaluate(t=>{for(const a of qaMotion)a.currentTime=t;},t);
     film.push(await sharp(await page.screenshot()).resize(800,720).ensureAlpha().raw().toBuffer());delays.push(t===260?500:70);
    }
    await finish();
   }
   await page.goto('http://tool-motion.test/');await page.waitForFunction(()=>state?.library&&window.DSUiMotion);await finish();
   const visited=[];
   for(const id of ['profile','matches','players','friends','picks','stats','marks','sounds','lobby']){await respond(()=>nav(id).click(),'content');await finish();visited.push(id);if(id==='stats'){await respond(()=>page.locator('[data-stats-scope=all]').click(),'content');await finish();await respond(()=>page.locator('.stats-controls [data-stats-scope=own]').click(),'content');await finish();}}
   await respond(()=>nav('profile').click(),'content');await filmScene();await finish();
   await respond(()=>nav('players').click(),'content');await finish();
   await respond(()=>page.locator('#sort-by').selectOption('name'),'content');await finish();
   await respond(()=>page.locator('[data-directory-pager=top] [data-page-action=next]').click(),'content');await finish();
   await respond(()=>page.locator('#marked-only').click(),'content');await finish();await respond(()=>page.locator('#marked-only').click(),'content');await finish();
   await respond(()=>page.locator('.player-table [data-player]').first().click(),'dialog');await filmScene();await finish();
   await page.locator('#player-dialog [data-close=player-dialog]').click();await finish();
   await respond(()=>page.locator('.directory-guide>summary').click());await finish();
   const beforePoll=await count();await page.evaluate(()=>refresh());await finish();assert.equal(await count(),beforePoll,'Unchanged full library refresh does not replay tool entry');
   await respond(()=>page.locator('#settings-open').click(),'dialog');await filmScene();await finish();
   const choice=page.locator('.appearance-choice[data-style-preview=alarak]');await respond(()=>choice.click());await finish();
   await page.waitForFunction(()=>!graphicalStyleBusy&&graphicalStyle==='alarak');
   const preview=page.locator('[data-ui-motion-preview]');await preview.scrollIntoViewIfNeeded();const stable=await page.evaluate(()=>({view,theme:graphicalStyle,open:document.querySelector('#settings-dialog').open}));
   await respond(()=>preview.click());await finish();assert.deepEqual(await page.evaluate(()=>({view,theme:graphicalStyle,open:document.querySelector('#settings-dialog').open})),stable);
   assert.equal(await preview.evaluate(el=>el===document.activeElement),true,'Preview preserves its focus');
   await page.screenshot({path:path.join(__dirname,'local28-motion-settings-'+width+'.png'),animations:'disabled'});
   await page.locator('#settings-dialog .close[data-close=settings-dialog]').click();await finish();
   const keyboardBefore=await count();await nav('profile').focus();await page.keyboard.press('Enter');await finish();assert.equal(await count(),keyboardBefore,'Keyboard navigation is immediate');
   await page.emulateMedia({reducedMotion:'reduce'});const reducedBefore=await count();await nav('players').click();await finish();await page.locator('#settings-open').click();await finish();await preview.click();await finish();assert.equal(await count(),reducedBefore,'System reduced motion suppresses the complete tool treatment');
   await page.locator('#settings-dialog .close[data-close=settings-dialog]').click();await finish();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   report.cases.push({width,navigation:visited,statsScope:true,delayedSort:true,paging:true,savedFilter:true,dialogs:true,disclosure:true,theme:true,preview:true,polling:true,keyboard:true,reduced:true,calls:await count()});await page.close();
  }
  if(film.length)await sharp(Buffer.concat(film),{raw:{width:800,height:720*film.length,channels:4,pageHeight:720}}).gif({delay:delays,loop:0,effort:2}).toFile(path.join(__dirname,'local28-tool-motion.gif'));
  report.success=true;report.demoFrames=film.length;console.log(JSON.stringify(report));
 }finally{await browser.close();fs.writeFileSync(path.join(__dirname,'local28-tool-motion-browser.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
