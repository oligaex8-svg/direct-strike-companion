'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const live=read(path.join(__dirname,'automatic-lobby-rating-preview-data.json')),tests=read(path.join(root,'release/test-output/lobby-rating-tests.json'));
assert.ok(live.success&&tests.success);
for(const file of ['dsstats.js','site-data.js','lobby.js','replays.js','ui.css','index.html'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',file))).digest('hex').toUpperCase(),tests.assets[file],file+' embedded in tested EXE');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report={success:false,scope:live.scope,networkProbeSuccess:live.networkProbeSuccess,cases:[]};
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of [1440,375]){
   const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p>Live lobby</p></aside><main id="content" data-view="lobby" style="min-width:0"></main></div></body></html>');
   for(const file of ['style.css','ui.css','lobby.css','player-lists.css','own-accounts.css','replays.css','i18n.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(live=>{
    window.fixture=live;
    window.state={library:{settings:{selfIds:[]},marks:[],matches:[],ownAccountGroups:[],siteLookups:{},dsstatsLookups:{},siteHistories:{},siteGames:{}},lobby:{region:'EU',phase:'pregame',source:'screen',rosterEntries:live.names.map((name,index)=>({name,team:index<3?1:2,candidates:[]}))}};
    window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n);window.date=s=>new Date(s).toLocaleDateString('en-GB');window.time=()=>'';
    window.findPlayer=()=>null;window.displayPlayerName=(_id,name)=>name;window.api=async()=>({});window.toast=()=>{};window.renderLibrary=()=>{};
    window.siteIdentityKey=profile=>'site:'+profile.region+':'+profile.profileId;
   },live);
   for(const file of ['dsstats.js','site-data.js','own-accounts.js','replays.js','sound-library.js','lobby.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(()=>{
    window.buildLiveLobbyHistory=()=>null;
    window.liveLobbyHistoryCells=()=>'<div class="live-recent-games"></div><div class="live-favourites"></div>';
    window.liveReplayWinRate=()=>'';
    window.renderFixture=()=>document.getElementById('content').innerHTML='<h1>Live lobby</h1><p class="muted">Automatic ratings for allies and enemies · dsstats live data · ds-rating.com saved cache while unavailable.</p><div class="live-lobby"><div class="live-roster-grid">'+renderLiveLobbyRoster(state.lobby.rosterEntries)+'</div></div>';
    for(const name of fixture.names){const key=siteNameKey(name,'EU');state.library.siteLookups[key]={playerId:key,status:'Lobby; rating pending',profiles:[]};state.library.dsstatsLookups[key]={key,status:'Loading',profiles:[]};}renderFixture();
   });
   assert.equal(await page.locator('[data-lobby-entry]').count(),6);
   for(const row of await page.locator('[data-lobby-entry]').all())assert.match(await row.locator('.live-row-ratings').textContent(),/ds-rating\.com.*dsstats/s);
   const firstName=live.names.find(name=>live.dsRating['name:EU:'+name.toLowerCase()]?.profiles?.length);
   await page.evaluate(firstName=>{const key=siteNameKey(firstName,'EU');state.library={...state.library,siteLookups:{...state.library.siteLookups,[key]:fixture.dsRating[key]}};renderFixture();},firstName);
   const firstRow=page.locator('[data-lobby-entry]').filter({has:page.locator('.live-slot-head').filter({hasText:firstName})});
   assert.ok(await firstRow.locator('.site-account-primary strong').count()>0);
   assert.ok((await page.locator('.live-name-status').allTextContents()).some(text=>text.includes('Loading')),'Other rows remain pending while the first source result is visible');
   await page.evaluate(()=>{state.library={...state.library,siteLookups:fixture.dsRating,dsstatsLookups:fixture.dsstats};renderFixture();});
   for(const row of await page.locator('[data-lobby-entry]').all()){
    assert.equal(await row.locator('.dsstats-rating').count(),1,'Each ally/enemy has the second source');
    assert.equal(await row.locator('[data-lobby-site]').count(),0,'No history/profile selector is required');
   }
   assert.equal(await page.locator('.live-team-1 [data-lobby-entry]').count(),3);assert.equal(await page.locator('.live-team-2 [data-lobby-entry]').count(),3);
   assert.equal(await page.getByText('Review possible profiles',{exact:true}).count(),0);
   // Controlled ambiguity regression: two native local profiles must not hide public name ratings.
   await page.evaluate(()=>{const entry=state.lobby.rosterEntries[0];entry.candidates=[{id:'2-S2-1-123',name:entry.name,aliases:[entry.name]},{id:'2-S2-1-124',name:entry.name,aliases:[entry.name]}];renderFixture();});
   assert.ok(await page.locator('[data-lobby-entry]').first().locator('.site-account-primary strong').count()>0);
   assert.equal(await page.locator('[data-lobby-entry]').first().locator('.dsstats-rating').count(),1);
   const details=page.locator('[data-lobby-entry]').first().locator('details.live-profile-details > summary'),before=await details.boundingBox();
   await details.click();const after=await details.boundingBox();assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,'Details stays anchored');await details.click();
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
   if(width===1440){report.screenshot=path.join(__dirname,'automatic-lobby-ratings-preview.png');await page.screenshot({path:report.screenshot,fullPage:true});}
   await page.evaluate(()=>{interfaceLanguage='ru';translateInterface(document.getElementById('content'));});
   assert.equal(await page.locator('[data-lobby-entry]').count(),6);assert.deepEqual(errors,[]);
   report.cases.push({width,allies:3,enemies:3,bothSites:true,progressive:true,ambiguousNamesAutomatic:true,profileChoiceRequired:false,detailsAnchored:true,russian:true,overflow});await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'automatic-lobby-rating-ui-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
