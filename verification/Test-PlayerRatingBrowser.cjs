'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
const embedded=JSON.parse(fs.readFileSync(path.join(root,'release/test-output/embedded-ui-assets.json'),'utf8'));
const crypto=require('node:crypto');
for(const file of ['site-data.js','players-view.js','ru-ui.js','i18n.js','style.css','ui.css','lobby.css','i18n.css'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',file))).digest('hex').toUpperCase(),embedded[file],'Rendered '+file+' is embedded in the tested EXE');
// Only affected public lookup fields; no notes/settings/replays in the fixture.
const library=JSON.parse(fs.readFileSync(path.resolve(root,'../../data/library.json'),'utf8'));
const selected=[['Bingo','1-S2-1-850431'],['Dominator','2-S2-1-10847374'],['GriNgo','2-S2-2-2136353']];
const lookups=Object.fromEntries(selected.map(([name,id])=>{const lookup=library.siteLookups[id];assert.ok(lookup,name+' lookup exists');return [id,{playerId:id,status:lookup.status,checked:lookup.checked,profiles:lookup.profiles}];}));
const black=JSON.parse(fs.readFileSync(path.join(__dirname,'site-profile-priority-cached.json'),'utf8')).lookups.find(lookup=>lookup.playerId==='name:EU:blackjoker');
assert.ok(black);lookups['2-S2-1-3128']={...black,playerId:'2-S2-1-3128'};
const players=[{id:'2-S2-1-3128',name:'BlackJoker'},...selected.map(([name,id])=>({id,name}))];
const report={success:false,scope:'Current Players component with saved public lookup data; fresh site requests unavailable',embeddedAssetsVerified:true,cases:[]};
let browser;
(async()=>{
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const width of [960,1440])for(const language of ['en','ru']){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p>Players</p></aside><main id="content"></main></div></body></html>');
   for(const file of ['style.css','ui.css','lobby.css','i18n.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(({lookups,players})=>{
    window.state={library:{settings:{language:'en',selfIds:[]},siteLookups:lookups}};
    window.players=players.map(player=>({...player,encounters:0,against:{wins:0,losses:0,winRate:null},together:{wins:0,losses:0,winRate:null}}));
    window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB').format(n);
    window.calls=[];window.api=async(route,body)=>{calls.push({route,body});return {};};window.ratingTargetId=id=>id;
    window.regionRating=(player,region)=>siteRating(player.id,region);window.ratingCell=(player,region)=>automaticRatingCell(player,region);
    window.displayPlayerName=(_id,name)=>name;window.mostPlayedCell=()=>'<span class="muted">—</span>';window.statCell=()=>'<span class="muted">—</span>';
   },{lookups,players});
   for(const file of ['site-data.js','players-view.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(language=>{setInterfaceLanguage(language);window.renderPreview=()=>{document.getElementById('content').innerHTML='<h1>Players</h1><p class="muted">Saved site data · fresh requests currently unavailable</p>'+renderPlayerDirectory(players);translateInterface(document.getElementById('content'));};renderPreview();},language);
   const blackRow=page.locator('tr').filter({has:page.locator('[data-player="2-S2-1-3128"]')});assert.ok((await blackRow.textContent()).includes('3,968'));
   for(const [name,id] of selected){
    const row=page.locator('tr').filter({has:page.locator('[data-player="'+id+'"]')});assert.equal(await row.locator('.site-account-primary').count(),1,name+' priority');
    assert.ok((await row.locator('.site-rating-empty').first().textContent()).includes(language==='en'?'Not loaded':'Не загружен'),name+' old missing evidence is not Unrated');
    assert.equal(await row.locator('.site-account-alternatives:visible').count(),0);
   }
   await page.evaluate(()=>observeSiteRatings());await page.waitForFunction(()=>calls.some(call=>call.route==='rating/sync'));
   const observed=await page.evaluate(()=>calls.filter(call=>call.route==='rating/sync').flatMap(call=>call.body.ids));for(const [,id] of selected)assert.ok(observed.includes(id),'Visible player queues '+id);
   if(width===1440&&language==='en'){report.screenshot=path.join(__dirname,'player-rating-status-preview.png');await page.screenshot({path:report.screenshot});}
   const bingo=page.locator('tr').filter({has:page.locator('[data-player="1-S2-1-850431"]')});await bingo.locator('[data-site-disclosure^="accounts:"]').click();assert.equal(await bingo.locator('.site-account-rating:visible').count(),3);
   await bingo.locator('[data-site-profile-id="383326"]').click();await page.waitForFunction(()=>calls.some(call=>call.route==='rating/site-profile'));
   assert.deepEqual(await page.evaluate(()=>calls.find(call=>call.route==='rating/site-profile').body),{profileId:'383326',region:'Americas'});
   // Controlled response regression test, not Bingo's actual current rating.
   await page.evaluate(()=>{state.library={...state.library,siteLookups:{...state.library.siteLookups,'1-S2-1-850431':{...state.library.siteLookups['1-S2-1-850431'],profiles:state.library.siteLookups['1-S2-1-850431'].profiles.map((profile,index)=>index===0?{...profile,searchRating:2999}:profile)}}};renderPreview();});
   assert.ok((await bingo.locator('.site-account-primary').textContent()).includes('2,999'));assert.ok((await bingo.locator('.site-account-primary').textContent()).includes(language==='en'?'Site DSR':'DSR сайта'));
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));assert.deepEqual(errors,[]);
   report.cases.push({width,language,visiblePlayersQueued:true,legacyAbsenceCorrect:true,searchDsrResponseRendered:true,overflow});await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(__dirname,'player-rating-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
