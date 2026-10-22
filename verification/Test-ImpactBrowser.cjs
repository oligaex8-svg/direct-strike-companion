'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),data=JSON.parse(fs.readFileSync(path.join(__dirname,'impact-real-replay.json'),'utf8').replace(/^\uFEFF/,''));
assert.ok(data.success);const tests=JSON.parse(fs.readFileSync(path.join(__dirname,'self-tests-detailed-impact.json'),'utf8').replace(/^\uFEFF/,''));assert.ok(tests.success);
for(const file of ['impact-detail.js','impact-detail.css','replay-impact.js','replays.js','ru-ui.js','index.html','app.js'])assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex').toUpperCase(),tests.assets[file],file+' is packaged');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report={success:false,scope:'Actual replay impact controls/dialog with actual decoded replay; offline API fixture',cases:[],screenshots:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><main id="content"></main><dialog id="impact-dialog" aria-labelledby="impact-title"><div class="dialog-head"><div><span class="meta">Impact breakdown</span><h2 id="impact-title" data-i18n-skip></h2></div><button class="close" type="button" data-close="impact-dialog" aria-label="Close">×</button></div><div id="impact-content" class="dialog-body"></div></dialog></body></html>');
  for(const file of ['style.css','combat.css','replays.css','dialogs.css','impact-detail.css'])await page.addStyleTag({content:read(file)});
  await page.evaluate(({data,language})=>{
   window.$=id=>document.getElementById(id);window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=value=>value==null?'—':new Intl.NumberFormat(language==='ru'?'ru-RU':'en-GB',{maximumFractionDigits:0}).format(value);window.commanderName=name=>name;window.replayPlayerName=player=>player.name;window.fixtureData=data;window.calls=0;
   window.state={library:{settings:{language,selfIds:[]},matches:[{...data.match,players:data.match.players.map(player=>({...player,combat:{...player.combat,impact:null}}))}]}};
   window.api=async()=>{calls++;return {hash:data.match.hash,statsVersion:data.match.statsVersion,pending:false,players:data.match.players.map(player=>({id:player.id,impact:player.combat.impact}))};};
   document.addEventListener('click',event=>{const button=event.target.closest('[data-close]');if(button)document.getElementById(button.dataset.close).close();});
  },{data,language});
  for(const file of ['replay-impact.js','replays.js','impact-detail.js','ru-ui.js','i18n.js','dialogs.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(language=>{
   const match=state.library.matches[0],scores=replayImpactScores(match);$('content').innerHTML='<h1>Replays</h1><div class="impact-test-roster">'+match.players.map(player=>'<p><span data-i18n-skip>'+esc(player.name)+'</span> '+replayImpactCell(player,scores,match.hash)+'</p>').join('')+'</div>';
   setInterfaceLanguage(language);translateInterface();
  },language);
  assert.equal(await page.locator('[data-impact-match]').count(),6);await page.locator('[data-impact-match]').first().focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>impactDetailCache.size===1);
  assert.ok(await page.locator('#impact-dialog').isVisible());assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.locator('.impact-summary strong').count(),4);assert.equal(await page.locator('.impact-chart polyline').count(),2);
  const geometry=await page.locator('#impact-dialog').evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth}));assert.ok(geometry.scroll<=geometry.client+1,JSON.stringify(geometry));
  await page.locator('[data-impact-section="opponents"] summary').click();await page.locator('[data-impact-section="units"] summary').click();
  assert.ok(await page.locator('[data-impact-section="opponents"] tbody tr').count()>0);assert.ok(await page.locator('[data-impact-section="units"] tbody tr').count()>0);
  await page.evaluate(()=>{window.savedScroll=$('impact-content').scrollTop;refreshImpactDialog();});assert.equal(await page.locator('[data-impact-section="units"]').evaluate(node=>node.open),true);assert.equal(await page.evaluate(()=>calls),1,'Refresh reuses on-demand cache');
  const nextId=data.match.players[1].id;await page.locator('[data-impact-player]').selectOption(nextId);assert.equal(await page.locator('#impact-title').textContent(),data.match.players[1].name);assert.equal(await page.evaluate(()=>calls),1,'Switching player reuses same replay response');
  await page.locator('[data-impact-section="waves"] summary').click();assert.ok(await page.locator('[data-impact-section="waves"] tbody tr').count()>0);
  await page.locator('[data-impact-player]').selectOption(data.match.players[0].id);
  if(language==='en'){await page.evaluate(()=>{document.querySelectorAll('[data-impact-section]').forEach(node=>node.open=false);$('impact-content').scrollTop=0;});const file=path.join(__dirname,width===1440?'detailed-impact-preview.png':'detailed-impact-mobile.png');await page.locator('#impact-dialog').screenshot({path:file});report.screenshots.push(file);}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#impact-dialog').evaluate(node=>node.open),false);
  await page.locator('[data-impact-match]').first().click();assert.equal(await page.evaluate(()=>calls),1);
  await page.locator('[data-close="impact-dialog"]').click();
  // A legacy replay remains useful and upgrades on the next normal library refresh.
  await page.evaluate(()=>{impactDetailCache.clear();impactDetailAttempts.clear();state.library.matches[0].statsVersion=1;api=async()=>({hash:fixtureData.match.hash,statsVersion:1,pending:true,players:[]});});
  await page.locator('[data-impact-match]').first().click();await page.waitForFunction(()=>impactDetailCache.size===1);assert.ok((await page.locator('.impact-status').textContent()).includes(language==='ru'?'автоматически':'automatically'));
  await page.evaluate(()=>{state.library.matches[0].statsVersion=2;api=async()=>({hash:fixtureData.match.hash,statsVersion:2,pending:false,players:fixtureData.match.players.map(player=>({id:player.id,impact:player.combat.impact}))});refreshImpactDialog();});await page.waitForFunction(()=>!!document.querySelector('.impact-chart'));assert.equal(await page.locator('.impact-status').count(),0);
  await page.locator('[data-close="impact-dialog"]').click();
  await page.evaluate(()=>{impactDetailCache.clear();impactDetailAttempts.clear();state.library.matches[0].statsVersion=1;api=()=>new Promise(resolve=>window.oldImpactResponse=resolve);});
  await page.locator('[data-impact-match]').first().click();await page.waitForFunction(()=>typeof oldImpactResponse==='function');
  await page.evaluate(()=>{state.library.matches[0].statsVersion=2;api=async()=>({hash:fixtureData.match.hash,statsVersion:2,pending:false,players:fixtureData.match.players.map(player=>({id:player.id,impact:player.combat.impact}))});refreshImpactDialog();oldImpactResponse({hash:fixtureData.match.hash,statsVersion:1,pending:true,players:[]});});
  await page.waitForFunction(()=>!!document.querySelector('.impact-chart'));assert.equal(await page.locator('.impact-status').count(),0,'An old in-flight response cannot strand the final automatic upgrade');
  await page.evaluate(()=>{state.library.matches[0].players[0].name='Win';impactDialogRevision='';renderImpactDialog();});
  assert.equal(await page.locator('[data-impact-player] option').first().textContent(),'Win','Player names that collide with translation keys remain unchanged');
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-impact-match]').first().evaluate(node=>document.activeElement===node),true,'Focus returns to the compact impact control');
  assert.deepEqual(errors,[]);report.cases.push({width,language,keyboardOpen:true,allSections:true,lazyCache:true,refreshRetained:true,automaticUpgrade:true,lateOldResponse:true,playerNamesUntranslated:true,focusRestored:true,geometry});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'impact-detail-ui-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
