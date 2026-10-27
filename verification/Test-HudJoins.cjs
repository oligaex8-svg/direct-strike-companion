'use strict';
// Exercise the wide-window joins reported by the owner, plus compact/RU use.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const fixture=require('./LocalPreviewFixture.cjs'),web=path.resolve(__dirname,'../wwwroot');
const report={success:false,scope:'Production UI, synthetic data, software rendering; no game input or private library',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const [theme,width,language] of [['nerazim',2149,'en'],['nerazim',1000,'en'],['nerazim',375,'ru'],...['protoss','fenix','alarak','terran','zerg','dehaka','abathur','mecha','arcade'].map(id=>[id,1000,'en'])]){
  if(process.argv.includes('--core-only')&&!['dehaka','fenix','arcade','nerazim'].includes(theme))continue;
  const sample=fixture(theme,language),page=await browser.newPage({viewport:{width,height:width===2149?1090:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name==='/api/state')return json({...sample,libraryVersion:'hud-joins',busy:false,replayStatus:'Local preview · sample data'});
   if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
   if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
   if(name.startsWith('/api/'))return json({});
   const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));
   if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  await page.goto('http://joins.test/');await page.waitForFunction(()=>!!state?.library);
  const entry={theme,width,language,views:[],screenshots:[]};
  for(const view of ['players','picks','profile','lobby']){
   if(theme==='dehaka'&&view==='lobby'){Object.assign(sample.lobby,{phase:'unavailable',roster:[],rosterEntries:[]});await page.evaluate(lobby=>{state.lobby=lobby;},sample.lobby);}
   await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(v=>document.querySelector('main').dataset.view===v,view);
   await page.evaluate(()=>scrollTo(0,0));
   const layout=await page.evaluate(()=>{
    const sidebar=document.querySelector('.sidebar'),brand=document.querySelector('.brand'),frame=document.querySelector('.work-console'),head=document.querySelector('.page-head'),s=getComputedStyle(frame),ornament=getComputedStyle(frame,'::before'),r=frame.getBoundingClientRect(),b=brand.getBoundingClientRect(),bank=sidebar.getBoundingClientRect();
    const fields=[...document.querySelectorAll('input[type=search],select')].filter(el=>el.getBoundingClientRect().height>0).map(el=>{const f=getComputedStyle(el),context=document.createElement('canvas').getContext('2d');context.font=f.font;const text=el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:el.placeholder;return {height:el.getBoundingClientRect().height,frame:f.borderImageSource,paint:parseFloat(f.borderImageWidth),left:parseFloat(f.paddingLeft),right:parseFloat(f.paddingRight),textFits:context.measureText(text||'').width<=el.clientWidth-parseFloat(f.paddingLeft)-parseFloat(f.paddingRight)+1};});
    const dock=document.querySelector('.sidebar-bottom'),foot=document.querySelector('main>footer');
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,duplicateSidebarFrame:getComputedStyle(sidebar,'::after').content,brandFits:brand.scrollWidth<=brand.clientWidth+1&&b.left>=bank.left&&b.right<=bank.right,brandFrame:getComputedStyle(brand).borderImageSource,ornamentTop:r.top+parseFloat(s.borderTopWidth)+parseFloat(ornament.top),headerHeight:head.getBoundingClientRect().height,headerPaint:getComputedStyle(head).backgroundImage,dockFrame:getComputedStyle(dock).borderImageSource,dockFits:dock.scrollWidth<=dock.clientWidth+1,footerMaterial:getComputedStyle(foot).backgroundImage,fields};
   });
   assert.ok(!layout.overflow,`${theme}/${width}/${view}: no page overflow`);
   assert.equal(layout.duplicateSidebarFrame,'none','Obsolete overlay cannot cross the sidebar content');
   assert.ok(layout.brandFits,'Brand plate and text remain inside the sidebar');
   assert.ok(layout.brandFrame.includes(theme+'-hud-nav-normal.svg'),'Brand uses the same complete menu plate as the navigation');
   assert.ok(layout.ornamentTop>=8,'Complete shoulder remains below the viewport edge');
   assert.ok(layout.headerPaint.includes('20px'),'Panel paint meets the backing at its lower join');
   assert.ok(layout.dockFrame.includes(theme+'-native-well.png')&&layout.dockFits,'Utility dock uses the matching closed native frame with clear insets: '+JSON.stringify(layout));
   assert.ok(layout.footerMaterial.includes('linear-gradient'),'Status dock carries the shell material');
   assert.ok(layout.fields.length&&layout.fields.every(f=>f.frame.includes(theme+'-hud-field-frame.png')&&f.left>f.paint&&f.right>f.paint&&f.textFits),'Field caps have matching family and clear text insets');
   if(view==='profile')assert.ok(await page.locator('.profile-favourite-main,.profile-best-grid').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).borderImageSource==='none')),'Commander contents share one well instead of nested perspective frames');
   const file=`hud-joins-${theme}-${view}-${width}-${language}.png`;
   if(view==='players'||(theme==='nerazim'&&view==='picks')||(theme==='fenix'&&view==='profile')||(theme==='dehaka'&&view==='lobby')){await page.screenshot({path:path.join(__dirname,file),animations:'disabled'});entry.screenshots.push(file);}
   entry.views.push({view,...layout});
  }
  // Inspect the lower turn as well as the initial, fully visible shoulders.
  await page.locator('nav [data-view="players"]').click();await page.evaluate(()=>document.querySelector('.work-console').scrollIntoView({block:'end'}));
  const foot=`hud-joins-${theme}-foot-${width}-${language}.png`;
  await page.locator('.work-console').screenshot({path:path.join(__dirname,foot),animations:'disabled'});entry.screenshots.push(foot);
  assert.deepEqual(errors,[]);report.cases.push(entry);await page.close();console.log(JSON.stringify({theme,width,views:entry.views.length}));
 }
 report.success=true;
}catch(e){report.error=e.stack;throw e;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'hud-joins-browser.json'),JSON.stringify(report,null,2)+'\n');}})().catch(e=>{console.error(e);process.exitCode=1;});
