'use strict';
// Run through the parent's resource guard. Synthetic data; no game or private library.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const fixture=require('./LocalPreviewFixture.cjs'),web=path.resolve(__dirname,'../wwwroot');
const catalog=JSON.parse(fs.readFileSync(path.join(web,'native-console-catalog.js'),'utf8').match(/Object.freeze\((\[.*\])\)/)[1]);
const ids=['default',...catalog.map(x=>x.id)],report={success:false,scope:'Synthetic settings; complete menu perimeter and full native console previews',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 const cases=[...ids.map(id=>[id,1000,'en']),...['default','nerazim','alarak','fenix','classic-zerg'].map(id=>[id,375,'ru'])];
 for(const [theme,width,language] of cases){
  const sample=fixture(theme,language),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name==='/api/state')return json({...sample,libraryVersion:'native-dialogs',busy:false});
   if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
   if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
   if(name.startsWith('/api/'))return json({});
   const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));
   if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.json':'application/json'};
   return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  await page.goto('http://dialogs.test/');await page.waitForFunction(()=>!!state?.library);
  await page.locator('#settings-open').click();await page.locator('#settings-dialog').waitFor({state:'visible'});
  const layout=await page.evaluate(async()=>{
   const d=document.querySelector('#settings-dialog'),body=d.querySelector('.dialog-body'),head=d.querySelector('.dialog-head'),close=head.querySelector('.close'),r=d.getBoundingClientRect(),h=head.getBoundingClientRect(),c=close.getBoundingClientRect();
   const previews=await Promise.all([...d.querySelectorAll('.appearance-choice')].map(async el=>{
    const thumb=el.querySelector('.appearance-thumbnail'),s=getComputedStyle(thumb),id=el.dataset.stylePreview;
    let loaded=true;if(id!=='default'){const img=new Image();img.src=`/themes/${id}-native-preview.png`;loaded=await new Promise(resolve=>{img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);});}
    return {id,image:s.backgroundImage,size:s.backgroundSize,border:s.borderImageSource,bars:[...thumb.children].every(x=>getComputedStyle(x).display==='none'),loaded,labelFits:el.scrollWidth<=el.clientWidth+1};
   }));
   const frame=getComputedStyle(d).borderImageSource;
   return {frame,languageFrame:getComputedStyle(d.querySelector('#settings-language')).borderImageSource,overlay:getComputedStyle(d,'::after').content,headOverlay:getComputedStyle(head,'::after').content,viewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,closeFits:c.left>=h.left&&c.right<=h.right&&c.top>=h.top&&c.bottom<=h.bottom,headFits:head.scrollWidth<=head.clientWidth+1,bodyFits:body.scrollWidth<=body.clientWidth+1,scrollable:body.scrollHeight>body.clientHeight,previews};
  });
  assert.ok(layout.viewport&&layout.closeFits&&layout.headFits&&layout.bodyFits,`${theme}/${width}: dialog, title and close stay inside their bounds`);
  assert.equal(layout.overlay,'none');assert.equal(layout.headOverlay,'none');
  if(theme!=='default'){assert.ok(layout.frame.includes(theme+'-hud-nav-normal.svg'),'Complete native menu perimeter');assert.ok(layout.languageFrame.includes(theme+'-hud-field-frame.png'),'Language field matches the active skin');}
  assert.equal(layout.previews.length,20);
  for(const p of layout.previews){assert.ok(p.loaded&&p.labelFits,p.id+' loads and label fits');if(p.id!=='default'){assert.ok(p.image.includes(p.id+'-native-preview.png'),p.id+' owns its image');assert.equal(p.size,'contain');assert.equal(p.border,'none');assert.ok(p.bars);}}
  const prefix=`native-dialogs-${theme}-${width}-${language}`,screenshots=[];
  await page.screenshot({path:path.join(__dirname,prefix+'-top.png'),animations:'disabled'});screenshots.push(prefix+'-top.png');
  await page.locator('.appearance-choice').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(__dirname,prefix+'-previews.png'),animations:'disabled'});screenshots.push(prefix+'-previews.png');
  if(width===375){await page.locator('.appearance-choice').nth(8).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,prefix+'-previews-middle.png'),animations:'disabled'});screenshots.push(prefix+'-previews-middle.png');await page.locator('.appearance-choice').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,prefix+'-previews-end.png'),animations:'disabled'});screenshots.push(prefix+'-previews-end.png');}
  await page.locator('#settings-dialog .close').click();assert.equal(await page.locator('#settings-dialog').evaluate(el=>el.open),false,'Close button closes scrolled dialog');
  assert.deepEqual(errors,[]);report.cases.push({theme,width,language,...layout,screenshots});await page.close();console.log(JSON.stringify({theme,width,language}));
 }
 report.success=true;
}catch(e){report.error=e.stack;throw e;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'native-dialogs-browser.json'),JSON.stringify(report,null,2)+'\n');}})().catch(e=>{console.error(e);process.exitCode=1;});
