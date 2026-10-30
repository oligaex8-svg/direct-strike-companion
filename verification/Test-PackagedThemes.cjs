'use strict';
// Exercise the packaged dashboard with synthetic data, without opening the app or its library.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const fixture=require('./LocalPreviewFixture.cjs');
const gallery=process.argv.includes('--gallery');
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),out=path.join(__dirname,'packaged-theme-output');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};
const geometry=()=>Object.fromEntries(['.sidebar','#main','.work-console','.page-head','#settings-open'].map(selector=>{
 const node=document.querySelector(selector),r=node.getBoundingClientRect();return [selector,[r.x+scrollX,r.y+scrollY,r.width,r.height]];
}));

async function run(){
 const build=read(path.join(__dirname,'native-local-build.json'));
 assert.equal(build.Success,true,'A successful native local build is required');
 assert.equal(sha(fs.readFileSync(build.Path)).toLowerCase(),build.SHA256.toLowerCase(),'Build record matches the executable');
 const testFile=path.join(path.dirname(build.Path),'test-output','sound-tests.json');
 assert.ok(fs.statSync(testFile).mtimeMs>=fs.statSync(build.Path).mtimeMs,'Packaged dashboard manifest must be produced after the recorded build');
 const tests=read(testFile);
 assert.equal(tests.success,true,'Run packaged --self-test --dashboard-only first');
 const manifest=tests.assets,styles=['default',...read(path.join(web,'native-console-catalog.json')).map(item=>item.id)];
 assert.equal(styles.length,20);assert.equal(new Set(styles).size,20);
 const aliases={TKnight:'CommanderOne',Vanea:'NovaPilot',BlackJoker:'IronGuard',aumka:'Aster',Kthulhu:'StarForge',BlueMage:'VoidRunner',Expend:'DEMO',IPVGI:'DEMO'};
 const sample=gallery?JSON.parse(JSON.stringify(fixture('default','en'),(_key,value)=>typeof value==='string'?(aliases[value]||value):value)):fixture('default','en');
 if(gallery)sample.library.ratingChanges=Object.fromEntries(sample.library.matches.map(match=>[match.hash,match.players.map(player=>({playerId:player.id,status:'unavailable',detail:'Historical rating changes are not included in demonstration data'}))]));
 const errors=[],requests=[],verified=new Map();
 const report={success:false,buildSha256:build.SHA256,scope:gallery?'Packaged asset hashes, fictional gallery data, four featured themes':'Packaged asset hashes, synthetic local data, 20 themes',themes:[],screenshots:[],errors};
 fs.mkdirSync(out,{recursive:true});let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:gallery?'reduce':'no-preference'});page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push('pageerror: '+error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});
  page.on('requestfailed',request=>errors.push('request failed: '+request.url()+' '+request.failure()?.errorText));
  await page.addInitScript(()=>{window.setInterval=()=>0;});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),name=url.pathname;
   const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(url.origin!=='http://packaged-theme.test'){errors.push('Unexpected external request: '+url.href);return route.abort();}
   if(name==='/api/state')return json({...sample,libraryVersion:'packaged-theme-fixture',busy:false,replayStatus:'Synthetic local data'});
   if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
   if(name==='/api/appearance'){const style=request.postDataJSON().style;sample.library.settings.graphicalStyle=style;return json({style});}
   if(name.startsWith('/api/'))return json({});
   let relative;
   try{relative=decodeURIComponent(name==='/'?'/index.html':name).slice(1);}catch{errors.push('Invalid asset URL: '+name);return route.fulfill({status:400});}
   const file=path.resolve(web,relative),expected=manifest[relative];
   if(!file.startsWith(web+path.sep)||!expected||!fs.existsSync(file)){
    errors.push('Asset missing from package or source: '+relative);return route.fulfill({status:404,body:'Missing packaged asset'});
   }
   let bytes=verified.get(relative);
   if(!bytes){bytes=fs.readFileSync(file);if(sha(bytes).toLowerCase()!==String(expected).toLowerCase()){
    errors.push('Packaged asset hash mismatch: '+relative);return route.fulfill({status:500,body:'Asset hash mismatch'});
   }verified.set(relative,bytes);}
   requests.push(relative);return route.fulfill({contentType:types[path.extname(file).toLowerCase()]||'application/octet-stream',body:bytes});
  });
  await page.goto('http://packaged-theme.test/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!state?.library);await page.evaluate(()=>document.fonts.ready);
  await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  let baseline;
  for(const id of (gallery?[]:styles)){
   sample.library.settings.graphicalStyle=id;
   await page.evaluate(async id=>{state.library.settings.graphicalStyle=id;applyGraphicalStyle(id);scrollTo(0,0);await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},id);
   assert.equal(await page.locator('html').getAttribute('data-graphical-style'),id);
   const current=await page.evaluate(geometry);
   if(!baseline)baseline=current;
   for(const [selector,box] of Object.entries(current))for(let i=0;i<box.length;i++)assert.ok(Math.abs(box[i]-baseline[selector][i])<=1,`${id}: ${selector} geometry differs from Default (${box} vs ${baseline[selector]})`);
   if(['default','fenix','terran','zerg'].includes(id)){
    const file=id+'.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});report.screenshots.push(file);
   }
   await page.locator('#settings-open').click();
   const preview=page.locator('[data-ui-motion-preview]');await preview.scrollIntoViewIfNeeded();
   assert.equal(await page.locator('.appearance-choice').count(),20,'Every theme has a settings choice');
   await page.waitForFunction(isDefault=>document.querySelector('[data-ui-motion-preview]')?.disabled===isDefault,id==='default');
   if(id==='default')assert.equal(await preview.isDisabled(),true,'Default has no animated preview');
   else {await preview.click();assert.equal(await page.locator('#settings-dialog').evaluate(el=>el.open),true);}
   if(['default','fenix','terran','zerg'].includes(id)){
    const file=id+'-preview.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});report.screenshots.push(file);
   }
   await page.locator('#settings-dialog').evaluate(el=>el.close());
   report.themes.push({id,geometry:current,effectsPreview:id==='default'?'disabled':'clicked'});
  }
  if(gallery){
   const galleryOut=path.join(root,'assets','screenshots');fs.mkdirSync(galleryOut,{recursive:true});
   report.gallery=[];
   const shots=[
    {file:'default-profile.png',theme:'default',view:'profile'},
    {file:'fenix-lobby.png',theme:'fenix',view:'lobby'},
    {file:'terran-players.png',theme:'terran',view:'players'},
    {file:'zerg-players.png',theme:'zerg',view:'players'},
    {file:'default-postgame.png',theme:'default',view:'matches',dialog:'match'}
   ];
   for(const shot of shots){
    await page.emulateMedia({reducedMotion:shot.theme==='terran'?'no-preference':'reduce'});
    await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(el=>el.close()));
    sample.library.settings.graphicalStyle=shot.theme;
    await page.evaluate(theme=>{state.library.settings.graphicalStyle=theme;applyGraphicalStyle(theme);},shot.theme);
    await page.locator('nav .nav[data-view="'+shot.view+'"]').click();
    if(shot.dialog==='match')await page.evaluate(hash=>showMatch(hash),sample.library.matches[0].hash);
    await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await Promise.race([Promise.all([...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}).map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,5000))]);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
    await page.waitForLoadState('networkidle');
    const body=await page.locator('body').innerText();
    for(const name of Object.keys(aliases))assert.ok(!body.includes(name),'Gallery contains only demonstration names: '+name);
    assert.deepEqual(await page.locator('img').evaluateAll(images=>images.filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&(!img.complete||img.naturalWidth===0);}).map(img=>({src:img.getAttribute('src'),loading:img.loading}))),[],'Visible gallery images load');
    await page.screenshot({path:path.join(galleryOut,shot.file),animations:'disabled'});
    report.gallery.push(shot);
   }
  }
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors,[],'No browser, network or packaged asset errors');
  report.success=true;report.verifiedAssets=verified.size;report.assetRequests=requests.length;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({success:true,themes:report.themes.length,verifiedAssets:report.verifiedAssets,screenshots:report.screenshots.length,gallery:report.gallery?.length||0}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
