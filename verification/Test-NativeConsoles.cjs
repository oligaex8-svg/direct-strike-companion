'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const web=path.resolve(__dirname,'../wwwroot'),catalog=require('../wwwroot/native-console-catalog.json'),fixture=require('./LocalPreviewFixture.cjs');
const crypto=require('node:crypto'),hash=crypto.createHash('sha256');
for(const entry of fs.readdirSync(web,{recursive:true}).sort()){const file=path.join(web,entry);if(fs.statSync(file).isFile())hash.update(entry.replaceAll('\\','/')+'\0').update(fs.readFileSync(file));}
const report={success:false,sourceHash:hash.digest('hex'),scope:'Local production UI with synthetic fixtures; 20 styles, two widths, five categories; no game input or external requests',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of (process.argv.includes('--narrow')?[375]:[1000])){
  const sample=fixture('default',width===375?'ru':'en'),page=await browser.newPage({viewport:{width,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name==='/api/state')return json({...sample,libraryVersion:'native-local',busy:false,replayStatus:'Local preview · sample data'});
   if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
   if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
   if(name.startsWith('/api/'))return json({});
   const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));
   if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
   const ext=path.extname(file),types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
   return route.fulfill({contentType:types[ext]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  await page.goto('http://native.test/');await page.waitForFunction(()=>!!state?.library);
  for(const id of ['default',...catalog.map(x=>x.id)]){
   if(process.argv.some(arg=>arg.startsWith('--only='))&&id!==process.argv.find(arg=>arg.startsWith('--only=')).slice(7))continue;
   sample.library.settings.graphicalStyle=id;
   await page.evaluate(id=>{state.library.settings.graphicalStyle=id;applyGraphicalStyle(id);},id);
   const entry={id,width,views:[]};
   for(const category of ['profile','picks','players','lobby','matches']){
    await page.locator(`nav [data-view="${category}"]`).click();
    await page.waitForFunction(view=>document.querySelector('main').dataset.view===view,category);
    const layout=await page.evaluate(()=>{
     const h=document.querySelector('.page-head'),s=getComputedStyle(document.querySelector('.work-console'),'::before');
     return {overflow:document.documentElement.scrollWidth>innerWidth+1,head:h.getBoundingClientRect().height,toast:document.querySelector('#toast')?.hidden===false,header:s.backgroundImage};
    });
    assert.ok(!layout.overflow&&!layout.toast,`${id}/${width}/${category}: contained layout and no render error`);
    if(id!=='default')assert.ok(layout.header.includes(id+'-native-left.png')&&layout.header.includes(id+'-native-right.png'),`${id}: header belongs to the selected family`);
    if(category==='profile'){
     const captions=await page.locator('.profile-favourite-rate>span').evaluateAll(nodes=>nodes.map(el=>{const box=el.getBoundingClientRect(),card=el.closest('.profile-favourite-main').getBoundingClientRect();return {fits:el.scrollWidth<=el.clientWidth+1,contained:box.left>=card.left&&box.right<=card.right+1,whiteSpace:getComputedStyle(el).whiteSpace};}));
     assert.ok(captions.length&&captions.every(c=>c.fits&&c.contained&&c.whiteSpace!=='nowrap'),`${id}: translated win-rate captions wrap within their card`);
    }
    if(category==='picks'&&id!=='default'){
     const fields=await page.locator('#library-content input:not([type=hidden]),#library-content select').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().height>0).map(el=>{const c=getComputedStyle(el);const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=c.font;const text=el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:el.placeholder;return {frame:c.borderImageSource,repeat:c.borderImageRepeat,padding:parseFloat(c.paddingLeft),height:el.getBoundingClientRect().height,textFits:context.measureText(text||'').width<=el.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)+1,text};}));
     assert.ok(fields.length>=3&&fields.every(c=>c.frame.includes(id+'-hud-field-frame.png')&&c.repeat==='repeat'&&c.padding>=16&&c.height>=38&&c.textFits),`${id}: fixed corner frames, repeating rails and text inset: ${JSON.stringify(fields)}`);
    }
    if(category==='lobby'){
     const panel=page.locator('.live-rating-forecast');assert.ok(await panel.isVisible());assert.equal(await panel.locator('strong').count(),4);
     const order=await page.evaluate(()=>document.querySelector('.live-rating-forecast').getBoundingClientRect().bottom<=document.querySelector('.live-roster-grid').getBoundingClientRect().top);assert.ok(order,'Rating panel precedes players');
    }
    if(category==='matches')assert.ok(await page.locator('.replay-middle-preview svg').count()>0,'Middle-control timeline remains present');
    entry.views.push({category,...layout});
    if((process.argv.includes('--frame-review')&&category==='profile')||(!process.argv.includes('--assertions-only')&&(category==='profile'||(['protoss','nerazim','alarak','fenix','terran'].includes(id)&&['picks','lobby','matches'].includes(category))))){
     await page.evaluate(()=>scrollTo(0,0));const file=`native-local-${id}-${category}-${width}.png`;await page.screenshot({path:path.join(__dirname,file)});(entry.screenshots??=[]).push(file);
    }
   }
   const names=id==='default'?[]:[id+'-hud-field-frame.png',...['nav-normal','nav-hover','command-normal','group-normal'].map(role=>id+'-hud-'+role+'.svg'),...['left','right','rail','well'].map(role=>id+'-native-'+role+'.png')];
   await page.evaluate(names=>Promise.all(names.map(async name=>{const image=new Image();image.src='/themes/'+name;await image.decode();if(!image.naturalWidth)throw Error(name);})),names);
   report.cases.push(entry);console.log(JSON.stringify({id,width,views:entry.views.length}));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 report.success=true;
}catch(e){report.error=e.stack;throw e;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,(process.argv.find(x=>x.startsWith('--only='))?'native-'+process.argv.find(x=>x.startsWith('--only=')).slice(7)+(process.argv.includes('--narrow')?'-narrow':'-desktop')+'-browser.json':process.argv.includes('--narrow')?'native-local-narrow-browser.json':'native-local-desktop-browser.json')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,cases:report.cases.length,error:report.error}));}})().catch(e=>{console.error(e);process.exitCode=1;});
