'use strict';
// Actual lobby components and CSS; public source fixtures, offline and GPU disabled.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const fixture=read(path.join(__dirname,'automatic-lobby-rating-preview-data.json')),tests=read(path.join(root,'release/test-output/dsstats-tests.json'));
assert.ok(fixture.success&&tests.success);
for(const file of ['dsstats.js','site-data.js','lobby.js','lobby.css','ru-ui.js','ui.css','index.html'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',file))).digest('hex').toUpperCase(),tests.assets[file],file+' embedded in tested EXE');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report={success:false,scope:'Compact real lobby components; recorded public dsstats and cached ds-rating.com fixtures; no live latency claim',cases:[],screenshots:[]};
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of [1440,960,375]){
   const page=await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname).replace(/^\//,'');
    const file=path.resolve(root,'wwwroot',relative);
    if(url.hostname==='fixture.invalid'&&file.startsWith(path.join(root,'wwwroot')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:relative.endsWith('.png')?'image/png':'text/plain'});
    return route.abort();
   });
   await page.setContent('<!doctype html><html><head><base href="https://fixture.invalid/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p>Live lobby</p></aside><main id="content" data-view="lobby" style="min-width:0"></main></div></body></html>');
   for(const file of ['style.css','i18n.css','lobby.css','player-lists.css','own-accounts.css','replays.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(fixture=>{
    window.fixture=fixture;
    window.state={library:{settings:{selfIds:[]},marks:[],matches:[],ownAccountGroups:[],siteLookups:{},dsstatsLookups:{},siteHistories:{},siteGames:{}},lobby:{region:'EU',phase:'pregame',source:'screen',rosterEntries:fixture.names.map((name,index)=>({name,team:index<3?1:2,candidates:[]}))}};
    window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n);window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=s=>new Date(s).toLocaleDateString('en-GB');window.time=()=>'';
    window.findPlayer=()=>null;window.displayPlayerName=(_id,name)=>name;window.api=async()=>({});window.toast=()=>{};window.renderLibrary=()=>{};
    window.siteIdentityKey=profile=>'site:'+profile.region+':'+profile.profileId;
   },fixture);
   for(const file of ['dsstats.js','site-data.js','own-accounts.js','commanders.js','replays.js','sound-library.js','lobby.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(()=>{
    window.buildLiveLobbyHistory=()=>null;window.liveReplayWinRate=()=>'';
    window.renderFixture=()=>document.getElementById('content').innerHTML='<h1>Live lobby</h1><div class="live-lobby"><div class="live-roster-grid">'+renderLiveLobbyRoster(state.lobby.rosterEntries)+'</div></div>';
    for(const name of fixture.names){const key=siteNameKey(name,'EU');state.library.siteLookups[key]={playerId:key,status:'Lobby; rating pending',profiles:[]};state.library.dsstatsLookups[key]={key,status:'Loading',profiles:[]};}renderFixture();
   });
   // Account attribution and completed failure states must survive compaction.
   await page.evaluate(()=>{
    const older={profileId:101,lastPlayed:'2026-10-01',searchGames:10,searchWinRate:30},newer={profileId:202,lastPlayed:'2026-10-15',searchGames:500,searchWinRate:90},linked={profileId:101,value:1200,automatic:true};
    const profile=liveLobbyRatingProfile([older,newer],linked);
    if(profile!==older||liveLobbyRatingProfile([newer],linked)!==null)throw Error('Linked rating borrowed another account stats');
    const html=liveLobbyRatingSummary('ds-rating.com','EU',{value:linked.value,kind:'published'},profile,{status:'Found'},null);
    if(!html.includes('10 <span>games</span>')||html.includes('500 <span>games</span>'))throw Error('Summary mixed account statistics');
    const unavailable=liveLobbyRatingSummary('ds-rating.com','EU',null,{profileChecked:'2026-10-01',profileAttempted:'2026-10-15'}, {status:'Found'},null);
    if(!unavailable.includes('Unavailable')||unavailable.includes('Loading…'))throw Error('Completed source failure mislabeled pending');
   });
   const rows=page.locator('[data-lobby-entry]');assert.equal(await rows.count(),6);
   for(const row of await rows.all()){
    assert.equal(await row.locator('.live-rating-columns > .live-rating-summary').count(),2);
    assert.equal(await row.locator('.live-rating-pending').count(),2);
   }
   const firstName=fixture.names[0];
   await page.evaluate(name=>{const key=siteNameKey(name,'EU');state.library={...state.library,siteLookups:{...state.library.siteLookups,[key]:fixture.dsRating[key]}};renderFixture();},firstName);
   assert.match(await rows.first().locator('.live-rating-columns').textContent(),/DSR/);
   assert.equal(await rows.first().locator('.live-rating-columns .live-rating-pending').count(),1,'First site value publishes independently');
   assert.equal(await rows.nth(1).locator('.live-rating-pending').count(),2,'Other players remain intelligibly pending');
   await page.evaluate(()=>{state.library={...state.library,siteLookups:fixture.dsRating,dsstatsLookups:fixture.dsstats};renderFixture();});
   for(const row of await rows.all()){
    const summary=row.locator(':scope > .live-profile > .live-row');
    assert.match(await summary.textContent(),/DSR.*dsstats/s);
    assert.equal(await summary.locator('.live-rating-value strong').count(),2);
    assert.equal(await summary.locator('.live-rating-stats').count(),2);
    assert.equal(await summary.locator('[data-quick-player-list]').count(),2);
    assert.doesNotMatch(await summary.textContent(),/Site name match|Name \/ region match|Most recently active|Cached|Load profile|Other accounts|other matching accounts|Last played|#\d/);
    assert.equal(await row.locator('details[open]').count(),0,'Details closed by default');
    assert.match(await summary.locator('.live-rating-summary').first().getAttribute('title'),/Cached/,'Cached status remains accessible');
    assert.equal(await row.locator('[data-lobby-site]').count(),0,'No profile choice required');
   }
   assert.equal(await page.locator('.live-team-1 [data-lobby-entry]').count(),3);assert.equal(await page.locator('.live-team-2 [data-lobby-entry]').count(),3);
   await page.evaluate(()=>{const entry=state.lobby.rosterEntries[0];entry.candidates=[{id:'2-S2-1-123',name:entry.name},{id:'2-S2-1-124',name:entry.name}];renderFixture();});
   assert.equal(await rows.first().locator('.live-rating-columns .live-rating-value strong').count(),2,'Ambiguous native matches retain automatic ratings');
   const details=rows.first().locator('details.live-profile-details'),summary=details.locator(':scope > summary'),before=await summary.boundingBox();
   for(const key of ['Enter','Space','Enter','Space']){
    await summary.focus();await page.keyboard.press(key);
    const after=await summary.boundingBox();assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,'Details stays anchored');
   }
   await summary.click();assert.equal(await details.getAttribute('open'),'');
   assert.ok(await details.locator('.site-account-primary').isVisible(),'Complete DSR profile evidence remains available');
   assert.ok(await details.locator('.dsstats-detail').isVisible(),'Complete second-source evidence remains available');
   await summary.click();
   for(const language of ['en','ru']){
    if(language==='ru')await page.evaluate(()=>{interfaceLanguage='ru';translateInterface(document.getElementById('content'));});
    const geometry=await rows.evaluateAll(nodes=>nodes.map(node=>{
     const row=node.querySelector('.live-row'),details=node.querySelector('.live-profile-details > summary'),bounds=row.getBoundingClientRect(),toggle=details.getBoundingClientRect();
     return {height:bounds.height,cards:[...row.children].map(cell=>{const r=cell.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right-parseFloat(getComputedStyle(cell).paddingRight||0),bottom:r.bottom};}),toggle:{x:toggle.x,y:toggle.y,right:toggle.right,bottom:toggle.bottom}};
    }));
    for(const g of geometry){
     assert.ok(g.height<=(width===1440?112:width===960?190:260),`${width}/${language} row too tall: ${g.height}`);
     for(const cell of g.cards)assert.ok(!(Math.min(cell.right,g.toggle.right)-Math.max(cell.x,g.toggle.x)>1&&Math.min(cell.bottom,g.toggle.bottom)-Math.max(cell.y,g.toggle.y)>1),'Details does not overlap row content');
    }
    if(width===1440)for(const g of geometry)assert.ok(Math.abs(g.cards[1].x-geometry[0].cards[1].x)<1,'Rating columns align across both teams');
    const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
    if(language==='en'&&width!==960){await page.evaluate(()=>document.activeElement?.blur());const file=path.join(__dirname,width===1440?'compact-lobby-ratings-preview.png':'compact-lobby-ratings-mobile.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);}
    report.cases.push({width,language,allies:3,enemies:3,bothSites:true,automaticMatches:true,statsRetained:true,noiseInDetails:true,detailsAnchored:true,maxRowHeight:Math.max(...geometry.map(g=>g.height)),overflow});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'compact-lobby-rating-ui-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
