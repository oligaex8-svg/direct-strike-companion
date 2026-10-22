'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const live=read(path.join(__dirname,'dsstats-live.json')),tests=read(path.join(root,'release/test-output/dsstats-tests.json'));
assert.ok(live.success&&tests.success,'Fresh source and built EXE checks passed');
for(const file of ['dsstats.js','site-data.js','lobby.js','replays.js','ui.css','index.html','ru-ui.js'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',file))).digest('hex').toUpperCase(),tests.assets[file],file+' matches built EXE');
const native='2-S2-1-7408040',profile=live.lookups[native].profiles[0],checks=[];
const context=vm.createContext({state:{library:{dsstatsLookups:live.lookups}},document:{addEventListener(){},createElement:()=>({})},date:value=>String(value).slice(0,10),num:n=>n==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n),esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),siteNameKey:(name,region)=>'name:'+(region?region+':':'')+name.toLowerCase()});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/dsstats.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
assert.match(run(`dsstatsRating('${native}','TKnight','EU')`),/dsstats/);
assert.ok(run(`dsstatsRating('${native}','TKnight','EU')`).includes(new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(profile.rating)));checks.push('Native rating is rendered with the dsstats source and its own rating scale');
assert.equal(run(`dsstatsRating('${native}','TKnight','Americas')`),'');checks.push('EU native data cannot appear as an Americas rating');
assert.equal(run(`dsstatsRating('2-S2-1-999999','TKnight','EU')`),'');checks.push('A missing native account never borrows a same-name public account');
assert.match(run("dsstatsRating('','TKnight','EU')"),/Name \/ region match/);checks.push('Name-only lobby results remain labelled as unconfirmed name and region matches');
context.state.library.dsstatsLookups={...live.lookups,[native]:{...live.lookups[native],status:'Unavailable'}};
assert.match(run(`dsstatsRating('${native}','TKnight','EU')`),/Cached/);assert.doesNotMatch(run(`dsstatsRating('${native}','TKnight','EU')`),/>Unrated</);checks.push('An outage preserves and labels successful cached values');
context.state.library.dsstatsLookups[native]={status:'Unavailable',profiles:[]};assert.match(run(`dsstatsRating('${native}','TKnight','EU')`),/Temporarily unavailable/);checks.push('A failed first request displays unavailable rather than unrated');
context.state.library.dsstatsLookups[native]={...live.lookups[native],profiles:[{...profile,url:'javascript:alert(1)',name:'<script>alert(1)</script>'}]};
const escaped=run(`dsstatsRating('${native}','TKnight','EU',true)`);assert.doesNotMatch(escaped,/<script>|javascript:/);assert.match(escaped,/ratings\?Rt=2&amp;Player=7408040x2x1/);checks.push('Links derive from a native SC2 identity and remote text is escaped');
for(const file of ['site-data.js','own-accounts.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
context.state.library={ownAccountGroups:[{canAutoLink:true,profiles:[{id:native,region:'EU'},{id:'1-S2-1-20',region:'Americas'}]}],ratings:{[native]:{americas:{value:7076}}},dsstatsLookups:{'1-S2-1-20':{status:'Ready',profiles:[{...profile,nativeId:'1-S2-1-20',region:'Americas'}]}}};
assert.equal(run(`ratingTargetId('${native}','Americas')`),native);assert.match(run(`additionalSiteRating('${native}','TKnight','Americas')`),/Player=20x1x1/);checks.push('Older DSR link storage stays intact while dsstats follows the actual linked regional SC2 identity');
const library=read(path.resolve(root,'../../data/library.json')),rating=library.regionalRatings?.[native]?.eu||null;
const selectedLookup=library.siteLookups?.[native];
const lookups={...(selectedLookup?{[native]:selectedLookup}:{})};
const player={id:native,name:'TKnight',encounters:1,ratings:{eu:rating},against:{winRate:null,wins:0,losses:0},together:{winRate:null,wins:0,losses:0}};
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report={success:false,scope:'Actual built UI components, live dsstats response and existing cached ds-rating.com data',checks,cases:[]};
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of [1100,1500]){
   const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p>Players</p><p>Live lobby</p><p>Replays</p></aside><main id="content"></main></div></body></html>');
   for(const file of ['style.css','ui.css','lobby.css','replays.css','own-accounts.css','i18n.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(({lookups,live,player})=>{
    window.state={library:{settings:{language:'en',selfIds:[]},dsstatsLookups:live.lookups,siteLookups:lookups,ratings:{},marks:[]},lobby:{region:'EU'}};
    window.player=player;window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n);window.date=s=>new Date(s).toLocaleDateString('en-GB');window.time=()=>'';
    window.ratingTargetId=id=>id;window.regionRating=(p,region)=>p.ratings?.[region==='EU'?'eu':'americas']||null;window.ratingCell=(p,region)=>automaticRatingCell(p,region);
    window.displayPlayerName=(_id,name)=>name;window.mostPlayedCell=()=>'<span>Artanis</span>';window.statCell=()=>'<span>—</span>';window.findPlayer=()=>player;
    window.api=async()=>({});window.toast=()=>{};window.renderLibrary=()=>{};window.liveSiteProfileChoices=new Map();
   },{lookups,live,player});
   for(const file of ['dsstats.js','site-data.js','players-view.js','replays.js','sound-library.js','lobby.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(()=>{
    const content=document.getElementById('content');content.innerHTML='<h1>Additional player data</h1><p class="muted">dsstats · live public API data. ds-rating.com · existing saved cache.</p>'+renderPlayerDirectory([player])+'<h2>Live lobby · ratings beside the player</h2><section class="live-team"><div class="live-row"><header class="live-slot-head"><h3>TKnight</h3></header>'+liveLobbyRatings(player.id,player)+'</div></section><h2>Replay player</h2><div class="replay-name-line"><strong>TKnight</strong>'+replayPlayerRating(player)+'</div>';
   });
   assert.equal(await page.locator('tbody .dsstats-rating').count(),1);assert.equal(await page.locator('.live-row-ratings .dsstats-rating').count(),1);assert.equal(await page.locator('.replay-name-rating .dsstats-rating').count(),1);
   const dsrBefore=await page.locator('tbody td').nth(4).textContent();assert.ok(dsrBefore.includes('ds-rating.com')&&dsrBefore.includes('dsstats'));
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));assert.deepEqual(errors,[]);
   if(width===1500){report.screenshot=path.join(__dirname,'dsstats-source-preview.png');await page.screenshot({path:report.screenshot,fullPage:true});}
   await page.evaluate(()=>{interfaceLanguage='ru';translateInterface(document.getElementById('content'));});
   assert.match(await page.locator('.dsstats-summary').first().textContent(),/игр/);report.cases.push({width,sourceLabelsSeparate:true,directoryLobbyReplay:true,russian:true,overflow});await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'dsstats-ui-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
