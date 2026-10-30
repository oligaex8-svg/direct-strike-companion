'use strict';
// Actual app markup, theme assets and modal entry points; saved decoded replay,
// isolated API fixture. No owner library writes or external service requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const fixture=require('./LocalPreviewFixture.cjs'),web=path.resolve(__dirname,'../wwwroot');
const controlled=process.argv.includes('--control'),measured=process.argv.includes('--damage'),zagara=process.argv.includes('--zagara'),prefix=controlled?'postgame-control':measured?'postgame-damage':zagara?'postgame-zagara':'postgame';
const data=JSON.parse(fs.readFileSync(path.join(__dirname,controlled?'impact-control-replay.json':measured?'impact-damage-replay.json':zagara?'impact-zagara-replay.json':'impact-real-replay.json'),'utf8').replace(/^\uFEFF/,''));
const report={success:false,scope:'Full app and local theme assets with saved decoded replay and isolated API fixture',cases:[],screenshots:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const [theme,width,language] of (controlled?[['default',1440,'en']]:zagara?[['default',1440,'en'],['default',375,'ru']]:[['default',1440,'en'],['fenix',1440,'en'],['terran',1440,'ru'],['default',375,'ru']])){
  const sample=fixture(theme,language),page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],assets=[];
  sample.library.matches=[{...data.match,players:data.match.players.map(p=>({...p,combat:{...p.combat,impact:null}}))}];
  sample.library.settings.selfIds=[(measured?data.match.players.find(p=>p.name.includes('TKnight')):null)?.id||data.match.players[0].id];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='postgame.test')return route.abort();
   const name=url.pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name==='/api/state')return json({...sample,libraryVersion:'postgame',busy:false});
   if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
   if(name.startsWith('/api/replay-impact/'))return json({hash:data.match.hash,statsVersion:data.match.statsVersion,pending:false,players:data.match.players.map(p=>({id:p.id,impact:p.combat.impact}))});
   if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
   if(name.startsWith('/api/'))return json({});
   const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));
   if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
   assets.push(name);return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',headers:path.extname(file)==='.html'?{'Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'"}:{},body:fs.readFileSync(file)});
  });
  await page.goto('http://postgame.test/');await page.waitForFunction(()=>!!state?.library);
  await page.evaluate(hash=>showMatch(hash),data.match.hash);
  assert.equal(await page.locator('#match-dialog .battle-report-button').count(),6);
  if(measured){
   const text=await page.locator('#match-dialog .replay-damage-panel').innerText();
   assert.ok(text.includes(`${data.match.damage.players.length}/6`),'Measured coverage is explicit');
   assert.ok(!text.includes('after all six passes'),'Complete teams count independently');
  }
  const matchGeometry=await page.locator('#match-dialog').evaluate(d=>({width:d.clientWidth,scroll:d.scrollWidth,cardHeights:[...d.querySelectorAll('.match-player')].map(n=>Math.round(n.getBoundingClientRect().height))}));
  assert.ok(matchGeometry.scroll<=matchGeometry.width+1,'Match overview does not overflow');

  const overview=path.join(__dirname,`${prefix}-overview-${theme}-${width}-${language}.png`);
  await page.locator('#match-dialog').screenshot({path:overview,animations:'disabled'});report.screenshots.push(overview);console.log(JSON.stringify({theme,matchGeometry}));
  if(width===1440)assert.ok(Math.max(...matchGeometry.cardHeights)<270,'All player cards are substantially shorter');
  const more=page.locator('#match-dialog [data-replay-rating-details]').first();
  await more.locator('summary').click();assert.ok(await more.locator('.gas-timings').isVisible());
  await page.evaluate(hash=>showMatch(hash),data.match.hash);assert.ok(await page.locator('#match-dialog [data-replay-rating-details]').first().evaluate(n=>n.open),'Secondary statistics stay open during refresh');
  await page.locator('#match-dialog [data-replay-rating-details]').first().locator('summary').click();
  if(controlled){
   const index=data.match.players.findIndex(p=>p.commander==='Tychus');
   await page.locator('#match-dialog .battle-report-button').nth(index).click();
   await page.waitForFunction(()=>document.querySelectorAll('.impact-bars li').length>0);
   await page.locator('[data-impact-group-summons]').uncheck();
   const archon=page.locator('.impact-bars li').filter({hasText:'High Archon'});
   assert.equal(await archon.count(),1);
   assert.equal(await archon.locator('.impact-bar-label strong').textContent(),'3');
   await archon.locator('img').evaluate(img=>img.loading='eager');
   await page.waitForFunction(()=>[...document.querySelectorAll('.impact-bars li')].find(n=>n.textContent.includes('High Archon'))?.querySelector('img')?.naturalWidth>0);
   assert.equal(await page.locator('.impact-bars li').filter({hasText:'Unknown'}).locator('.impact-bar-label strong').textContent(),'12');
   const screenshot=path.join(__dirname,'postgame-control-unit-ranking.png');await page.locator('.impact-units').screenshot({path:screenshot,animations:'disabled'});report.screenshots.push(screenshot);
   assert.deepEqual(errors,[]);report.cases.push({theme,width,language,recoveredSource:'HighArchon',kills:3,unknown:12});await page.close();continue;
  }
  await page.locator('#match-dialog .battle-report-button').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.impact-bars li').length>0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.impact-bars .unit-icon img')].slice(0,3).every(img=>img.complete&&img.naturalWidth>0));
  assert.ok(await page.locator('[data-impact-group-summons]').isChecked(),'Summon families are shown by default');
  await page.locator('[data-impact-group-summons]').uncheck();
  const expectedIcons=await page.evaluate(()=>impactRankUnits(impactDetailCache.get(impactSelection.hash).players.find(p=>p.id===impactSelection.id).impact,'kills').slice(0,10).filter(row=>window.sc2UnitIcons[row.name]).length);
  assert.ok(expectedIcons>0);assert.equal(await page.locator('.impact-bars .unit-icon img').count(),expectedIcons,'Every mapped visible unit renders real artwork');
  assert.equal(await page.locator('.impact-bars .unit-icon').first().evaluate(n=>n.getBoundingClientRect().width),52);
  const bars=await page.locator('.impact-bars .impact-bar-track').evaluateAll(nodes=>nodes.map(n=>({fill:n.querySelector('.impact-bar-fill').getBoundingClientRect().width,track:n.getBoundingClientRect().width,value:Number(n.querySelector('.impact-bar-fill').getAttribute('width'))/1000})));
  assert.ok(bars.some(b=>b.value>0&&b.value<1));
  bars.forEach(b=>assert.ok(Math.abs(b.fill/b.track-b.value)<.01,'Bar proportions survive production CSP'));
  await page.locator('[data-impact-metric]').selectOption('damageDealt');
  assert.ok(await page.locator('.impact-measurement-note').isVisible());
  assert.ok((await page.locator('.impact-bars .impact-bar-label strong').allTextContents()).every(value=>value==='—'));
  assert.ok((await page.locator('.impact-bar-fill').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('width'))))).every(value=>value===0));
  await page.locator('[data-impact-metric]').selectOption('damageTaken');assert.ok(await page.locator('.impact-measurement-note').isVisible());
  await page.locator('[data-impact-metric]').selectOption('impact');assert.ok((await page.locator('.impact-bars .impact-bar-label strong').allTextContents()).some(value=>value.includes('%')));
  await page.locator('[data-impact-metric]').selectOption('kills');
  const rawTotal=await page.evaluate(()=>impactUnitRecords(impactDetailCache.get(impactSelection.hash).players.find(p=>p.id===impactSelection.id).impact).reduce((n,p)=>n+p.kills,0));
  await page.locator('[data-impact-group-summons]').check();
  assert.ok(await page.locator('.impact-source-node').count()>0,'Verified summon families appear');
  assert.equal(await page.evaluate(()=>impactUnitRecords(impactDetailCache.get(impactSelection.hash).players.find(p=>p.id===impactSelection.id).impact).reduce((n,p)=>n+p.kills,0)),rawTotal,'Grouped UI conserves kills');
  await page.evaluate(()=>renderImpactDialog());assert.ok(await page.locator('[data-impact-group-summons]').isChecked(),'Grouped view survives refresh');
  await page.locator('[data-impact-group-summons]').uncheck();assert.equal(await page.locator('.impact-source-node').count(),0,'Individual view restored');
  await page.locator('[data-impact-group-summons]').check();
  if(zagara){
   const family=page.locator('.impact-family-card').filter({has:page.locator('.impact-family-name strong',{hasText:'Aberration'})});
   assert.equal(await family.locator('[data-unit-source="Splitterling"]').count(),1);
   assert.equal(await family.locator('[data-unit-source="Splitterling"] [data-unit-source="SplitterlingSpawn"]').count(),1);
   const values=await family.locator('[data-unit-source]').evaluateAll(nodes=>nodes.map(n=>({name:n.dataset.unitSource,kills:Number(n.dataset.sourceKills),impact:Number(n.dataset.sourceImpact)})));
   const root=data.match.players.find(p=>p.name==='TKnight').combat.impact.unitGroups.find(g=>g.name==='InfestedAbomination');
   assert.equal(values[0].kills,root.breakdown.children[0].kills);
   assert.ok(Math.abs(values[0].impact-values[0].kills/rawTotal*100)<1e-8,'Descendant impact uses the whole army');
   assert.ok(values[0].kills<=root.kills,'Parent already includes descendants');
   assert.equal(await family.locator('.impact-source-row .unit-icon').first().evaluate(n=>n.getBoundingClientRect().width),36);
   assert.ok(await family.evaluate(card=>{const r=card.getBoundingClientRect();return [...card.querySelectorAll('.impact-source-row')].every(node=>{const b=node.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;});}),'Nested source rows stay inside their card');
   const sourceBars=await family.locator('.impact-source-track').evaluateAll(nodes=>nodes.map(n=>({width:Number(n.querySelector('.impact-bar-fill').getAttribute('width')),height:n.getBoundingClientRect().height,actual:n.querySelector('.impact-bar-fill').getBoundingClientRect().width/n.getBoundingClientRect().width})));
   assert.equal(sourceBars.length,2);assert.equal(sourceBars[0].height,4);assert.equal(sourceBars[1].height,3);
   const maximum=Math.max(...data.match.players.find(p=>p.name==='TKnight').combat.impact.unitGroups.map(g=>g.kills));
   sourceBars.forEach((bar,index)=>{assert.ok(Math.abs(bar.width-values[index].kills/maximum*1000)<1e-8);assert.ok(Math.abs(bar.actual-bar.width/1000)<.01,'Child bar width survives production CSP');});
   const familyShot=path.join(__dirname,`${prefix}-family-${width}-${language}.png`);await family.screenshot({path:familyShot,animations:'disabled'});report.screenshots.push(familyShot);
  }
  if(language==='ru'){
   assert.equal(await page.locator('label[for="impact-player"]').textContent(),'Игрок');
   assert.match(await page.locator('.impact-report-context').textContent(),/Команда [12]/);
  }
  const geometry=await page.locator('#impact-dialog').evaluate(d=>{const r=d.getBoundingClientRect(),b=d.querySelector('.dialog-body');return {width:d.clientWidth,scroll:d.scrollWidth,bodyWidth:b.clientWidth,bodyScroll:b.scrollWidth,inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,frame:getComputedStyle(d).borderImageSource};});
  assert.ok(geometry.inViewport&&geometry.scroll<=geometry.width+1&&geometry.bodyScroll<=geometry.bodyWidth+1,JSON.stringify({theme,width,geometry}));
  if(theme!=='default')assert.notEqual(geometry.frame,'none','The actual themed frame is present');
  const screenshot=path.join(__dirname,`${prefix}-${theme}-${width}-${language}.png`);
  await page.locator('#impact-dialog').screenshot({path:screenshot,animations:'disabled'});report.screenshots.push(screenshot);
  await page.evaluate(()=>{const body=document.getElementById('impact-content'),section=body.querySelector('.impact-units');body.scrollTop+=section.getBoundingClientRect().top-body.getBoundingClientRect().top;});
  if(theme==='default'&&width===1440){const units=path.join(__dirname,`${prefix}-unit-ranking.png`);await page.locator('#impact-dialog').screenshot({path:units,animations:'disabled'});report.screenshots.push(units);}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('#match-dialog .battle-report-button'));assert.equal(await page.locator('#match-dialog .battle-report-button').first().evaluate(n=>document.activeElement===n),true);
  if(measured&&theme==='default'&&width===1440){
   const selected=data.match.players.find(p=>p.name.includes('TKnight')),index=data.match.players.indexOf(selected);
   await page.locator('#match-dialog .battle-report-button').nth(index).click();
   await page.waitForFunction(id=>impactSelection.id===id&&document.querySelectorAll('.impact-bars li').length>0,selected.id);
   const expected=[selected.combat.values.DamageDealt,selected.combat.values.DamageTaken].map(v=>Math.round(v).toLocaleString('en-GB'));
   assert.deepEqual(await page.locator('.impact-damage-summary strong').allTextContents(),expected,'Actual SC2 damage is displayed in the battle report');
   const personal=path.join(__dirname,'postgame-damage-tknight.png');await page.locator('#impact-dialog').screenshot({path:personal,animations:'disabled'});report.screenshots.push(personal);
  }
  assert.deepEqual(errors,[]);report.cases.push({theme,width,language,geometry,loadedAssets:assets.length,matchEntryAndFocus:true});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,`${prefix}-app-tests.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(e=>{console.error(e);process.exitCode=1;});
