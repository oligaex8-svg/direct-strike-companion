'use strict';
// Offline acceptance/preview pass. Run under the parent's resource-guarded runner.
// Uses the actual shell, styles, lobby renderer/updater and app navigation helpers.
// DOM continuity is evidence for attachment; it does not verify a WebView2 native popup.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
const read=file=>fs.readFileSync(path.join(web,file),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'automatic-lobby-state-preview-data.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(data.success,true,'Recorded public rating fixture is complete');
// Compile candidate endings to handle braces in nested objects, comments and strings.
function appFunction(name){
 const source=read('app.js'),start=source.indexOf('function '+name+'(');
 assert.ok(start>=0,'Actual app helper exists: '+name);
 for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
  const candidate=source.slice(start,end+1);
  try{new vm.Script(candidate);return candidate;}catch(error){if(!(error instanceof SyntaxError))throw error;}
 }
 throw Error('Cannot extract app helper: '+name);
}
const navigation=appFunction('renderLibraryContent');
assert.match(navigation,/syncLobbyPageActions\s*\(/,'Actual navigation invokes the reparent helper');
const helpers=appFunction('syncLobbyPageActions')+'\n'+navigation+'\n'+appFunction('renderLibrary');
const shell=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const report={success:false,scope:'Offline real shell/render/update/navigation; recorded public ratings; no live latency or native-popup claim',cases:[],screenshots:[]};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function fixture(browser,width,language){
 const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.fixtureErrors=[];page.on('pageerror',error=>page.fixtureErrors.push(error.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),file=path.resolve(web,decodeURIComponent(url.pathname).replace(/^\//,''));
  if(url.hostname==='fixture.invalid'&&file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.png')?'image/png':'text/plain'});
  return route.abort();
 });
 await page.setContent(shell.replace('<head>','<head><base href="https://fixture.invalid/">'));
 for(const file of ['style.css','i18n.css','combat.css','lobby.css','player-lists.css','own-accounts.css','replays.css','profile.css','picks.css','dialogs.css','picks-hover.css','ui.css'])await page.addStyleTag({content:read(file)});
 await page.evaluate(({data,language})=>{
  window.fixtureData=data;window.view='lobby';window.query='';window.markedOnly=false;window.mode='Commanders';window.lobbyDraft='';
  window.$=id=>document.getElementById(id);
  window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.num=n=>n==null?'—':new Intl.NumberFormat(language==='ru'?'ru-RU':'en-GB',{maximumFractionDigits:0}).format(n);
  window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=s=>new Date(s).toLocaleDateString('en-GB');window.time=()=> '12:00';
  window.state={library:{settings:{language,selfIds:[],sound:true,autoAcceptMatch:false,autoPickCommander:'',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:80,notificationSoundStyles:{}},players:[],marks:[],matches:[],errors:[],ownAccountGroups:[],siteLookups:data.dsRating,dsstatsLookups:data.dsstats,siteHistories:{},siteGames:{}},lobby:{region:'EU',phase:'pregame',source:'screen',observedAt:new Date().toISOString(),detectionStatus:'Public preview roster detected',ocrStatus:'Visible roster captured',rosterEntries:data.names.map((name,index)=>({name,team:index<3?1:2,candidates:[]}))}};
  window.findPlayer=()=>null;window.displayPlayerName=(_id,name)=>name;window.toast=()=>{};
  window.api=async(_route,body)=>body||{};window.refresh=async()=>renderLibrary();
  window.siteIdentityKey=profile=>'site:'+profile.region+':'+profile.profileId;
  window.renderSortControls=()=>{};window.currentSort=()=> 'name';window.visiblePlayers=()=>[];window.visibleFriends=()=>[];
  window.updatePlayerDirectory=content=>{content.innerHTML='<p class="muted">Offline navigation fixture</p>';};
  window.automaticDataError='';
 },{data,language});
 for(const file of ['dsstats.js','dsstats-changes.js','dsr-projections.js','site-data.js','own-accounts.js','commanders.js','replays.js','sound-library.js','sc2-automation.js','lobby.js','lobby-forecast.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:read(file)});
 await page.addScriptTag({content:helpers});
 await page.evaluate(language=>{
  // Replay-history computation is outside this layout test; real site cards remain.
  window.buildLiveLobbyHistory=()=>null;window.liveReplayWinRate=()=>'';
  liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();
  window.fixtureActions=document.querySelector('.header-actions');window.fixtureImport=$('import');window.fixtureAlert=$('notify-test');window.fixtureProgress=$('import-progress');
  window.fixtureClicks={import:0,alert:0};fixtureImport.addEventListener('click',()=>fixtureClicks.import++);fixtureAlert.addEventListener('click',()=>fixtureClicks.alert++);
  document.querySelectorAll('.nav').forEach(button=>button.classList.toggle('active',button.dataset.view==='lobby'));
  $('replay-status').textContent='Recorded public ratings · layout preview';
  renderLibrary();setInterfaceLanguage(language);translateInterface();
 },language);
 await settle(page);return page;
}
async function layout(page,populated){
 const result=await page.evaluate(()=>{
  const roster=document.querySelector('.live-roster-grid'),tools=document.querySelector('.live-overview'),heading=document.querySelector('.live-roster-heading');
  const after=node=>!!(roster.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);
  const before=node=>!!(roster.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_PRECEDING);
  const nodes=['.live-overview','.live-manual-details','.live-footer','#lobby-page-actions'];
  return {order:nodes.map(selector=>({selector,after:after(document.querySelector(selector))})),headingFirst:before(heading),
   directControls:tools.querySelector('.live-control-details')?.parentElement===tools,
   actionsParent:fixtureActions.parentElement.id,progressParent:fixtureProgress.parentElement.id,
   unique:['import','notify-test','import-progress','live-lobby-names'].every(id=>document.querySelectorAll('#'+id).length===1),
   subtitleHidden:getComputedStyle(document.querySelector('.page-head .muted')).display==='none',
   status:heading.textContent,
   geometry:{heading:heading.getBoundingClientRect().top,roster:roster.getBoundingClientRect().top,tools:tools.getBoundingClientRect().top,rosterBottom:roster.getBoundingClientRect().bottom},
   overflow:{client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}};
 });
 assert.ok(result.headingFirst,'Compact status precedes players');
 assert.ok(result.order.every(item=>item.after),'Players precede tools, manual check, review links and page actions: '+JSON.stringify(result.order));
 assert.ok(result.directControls,'Native sound/control details remain a direct child of the retained overview');
 assert.equal(result.actionsParent,'lobby-page-actions');assert.equal(result.progressParent,'lobby-page-actions');
 assert.ok(result.unique,'Action and manual-input IDs are unique');assert.ok(result.subtitleHidden,'Long page subtitle is hidden on lobby');
 assert.ok(result.status.includes('6')||!populated,'Populated compact status includes detected count');
 assert.ok(result.geometry.heading<=result.geometry.roster,'Status visually precedes roster');
 assert.ok(result.geometry.tools>=result.geometry.rosterBottom-1,'Tools visually follow every player');
 assert.ok(result.overflow.scroll<=result.overflow.client+1,'No horizontal document overflow: '+JSON.stringify(result.overflow));
 assert.equal(await page.locator('[data-lobby-entry]').count(),populated?6:0);
 if(populated){
  assert.equal(await page.locator('.live-rating-columns > .live-rating-summary').count(),12,'Both source columns survive for all six players');
  const colors=await page.evaluate(()=>Object.fromEntries(['dsr','dsstats'].map(source=>[source,getComputedStyle(document.querySelector(`.live-rating-summary[data-rating-source="${source}"] .live-rating-value strong`)).color])));
  assert.notEqual(colors.dsr,colors.dsstats,'Lobby source colors are distinct');
  assert.equal(colors.dsr,'rgb(89, 214, 234)');assert.equal(colors.dsstats,'rgb(196, 167, 255)');result.sourceColors=colors;
  assert.equal(await page.locator('[data-quick-player-list="friends"]').count(),6);assert.equal(await page.locator('[data-quick-player-list="losers"]').count(),6);
 }else assert.equal(await page.locator('.live-slot-empty').count(),6,'Empty roster keeps six waiting rows');
 return result;
}
async function continuity(page){
 await page.evaluate(()=>{
  document.querySelector('.live-control-details').open=true;document.querySelector('.live-monitor-details').open=true;document.querySelector('.live-manual-details').open=true;
  $('live-lobby-names').value='Unsaved draft\nЧерновик';
  document.querySelector('.live-profile-details').open=true;
  const select=document.querySelector('[data-live-preference="preset"]');select.focus();
  const branch=[];for(let node=select;node;node=node.parentNode)branch.push(node);
  window.fixtureProtected=[...branch,...select.querySelectorAll('optgroup,option')];window.fixtureSelect=select;window.fixtureRemoved=[];
  window.fixtureObserver=new MutationObserver(records=>{for(const record of records)for(const removed of record.removedNodes)if(fixtureProtected.some(node=>removed===node||removed.contains?.(node)))fixtureRemoved.push(removed.nodeName);});
  fixtureObserver.observe(document.body,{childList:true,subtree:true});
 });
 for(let poll=0;poll<4;poll++){
  await page.evaluate(poll=>{
   state.lobby.detectionStatus='Live status poll '+poll;state.lobby.observedAt=new Date().toISOString();
   if(poll===2)state.library.settings.notificationSoundVolume=35; // pending preference must not detach the active select.
   renderLibrary();
  },poll);
  await settle(page);
  const value=await page.evaluate(()=>({same:document.querySelector('[data-live-preference="preset"]')===fixtureSelect,connected:fixtureProtected.every(node=>node.isConnected),focused:document.activeElement===fixtureSelect,removals:fixtureRemoved,
   manual:$('live-lobby-names').value,manualOpen:document.querySelector('.live-manual-details').open,controlsOpen:document.querySelector('.live-control-details').open,monitorOpen:document.querySelector('.live-monitor-details').open,playerOpen:document.querySelector('.live-profile-details').open,
   diagnostics:document.querySelector('.live-monitor-details').textContent,actions:document.querySelector('.header-actions')===fixtureActions&&$('import')===fixtureImport&&$('notify-test')===fixtureAlert&&$('import-progress')===fixtureProgress}));
  assert.equal(value.same,true);assert.equal(value.connected,true);assert.equal(value.focused,true);assert.deepEqual(value.removals,[],'No protected select/option/ancestor removal at any point');
  assert.equal(value.manual,'Unsaved draft\nЧерновик');for(const key of ['manualOpen','controlsOpen','monitorOpen','playerOpen','actions'])assert.equal(value[key],true,key+' survives poll');
  assert.ok(value.diagnostics.includes('Live status poll '+poll),'Real diagnostics update while select is active');
 }
 await page.evaluate(()=>{fixtureObserver.disconnect();$('live-lobby-names').focus();});await settle(page);
 assert.equal(await page.locator('[data-live-preference="volume"]').inputValue(),'35','Deferred preference flushes when leaving native sound control');
 return {polls:4,continuousSelectOptionsAndAncestors:true,backgroundPreferenceDeferred:true,manualDraftRetained:true,detailsRetained:true};
}
async function forecastChecks(page,language){
 await page.evaluate(()=>{
  const name=fixtureData.names[0],id=fixtureData.dsstats['name:EU:'+name.toLowerCase()].profiles[0].nativeId;
  state.library={...state.library,settings:{...state.library.settings,selfIds:[id]},accounts:[{id,name}],ownAccountGroups:[{key:'preview-own',canAutoLink:true,evidence:'Preview account',warnings:[],profiles:[{id,name,region:'EU',aliases:[name],nameSource:'Preview account'}]}]};
  state.lobby.rosterEntries[0].candidates=[{id,name}];renderLibrary();translateInterface();
 });await settle(page);
 const values=await page.locator('.live-forecast-source strong').allTextContents();
 assert.equal(values.length,4,'Live lobby shows both Win/Loss outcomes for both sites');
 assert.match(values[0],/^~\+\d+/);assert.match(values[1],/^~-\d+/);assert.match(values[2],/^~\+\d+/);assert.match(values[3],/^~-\d+/);
 assert.equal(await page.locator('.live-forecast-basis').count(),0,'Actual source state needs no Baseline fallback');
 const colors=await page.locator('.live-forecast-source strong').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
 assert.deepEqual(colors,['rgb(89, 214, 234)','rgb(89, 214, 234)','rgb(196, 167, 255)','rgb(196, 167, 255)']);
 const placement=await page.evaluate(()=>({forecast:document.querySelector('.live-rating-forecast').getBoundingClientRect().bottom,players:document.querySelector('.live-roster-grid').getBoundingClientRect().top}));assert.ok(placement.forecast<=placement.players);
 const pendingValues=await page.evaluate(()=>{
  window.fixtureForecastCache=state.library.dsstatsLookups;
  state.library={...state.library,dsstatsLookups:Object.fromEntries(Object.entries(state.library.dsstatsLookups).map(([key,lookup])=>[key,{...lookup,profiles:lookup.profiles.map(profile=>({...profile,consistency:null,confidence:null}))}]))};renderLibrary();translateInterface();
  return {pending:liveLobbyForecast(state.lobby.rosterEntries).dsstatsPendingState,values:[...document.querySelectorAll('.live-forecast-source strong')].map(node=>node.textContent)};
 });await settle(page);
 assert.equal(pendingValues.pending,true);assert.deepEqual(pendingValues.values,values.slice(0,2),'Incomplete state keeps DSR independent and withholds baseline numbers');
 assert.equal(await page.locator('.live-forecast-source[data-rating-source="dsstats"] .live-forecast-missing').textContent(),language==='ru'?'Загрузка данных рейтинга…':'Loading rating data…');
 const hydrated=await page.evaluate(()=>{
  const next={...state.library.dsstatsLookups};
  for(const lookup of Object.values(fixtureForecastCache))for(const profile of lookup.profiles||[])next[profile.nativeId]={key:profile.nativeId,status:'Ready',checked:lookup.checked,profiles:[profile]};
  state.library={...state.library,dsstatsLookups:next};renderLibrary();translateInterface();
  return {basis:liveLobbyForecast(state.lobby.rosterEntries).dsstats.basis,values:[...document.querySelectorAll('.live-forecast-source strong')].map(node=>node.textContent)};
 });await settle(page);
 assert.equal(hydrated.basis,'site-state');assert.deepEqual(hydrated.values,values,'Automatic exact-native completion updates the existing lobby forecast');
 await page.evaluate(()=>{state.library={...state.library,dsstatsLookups:fixtureForecastCache};renderLibrary();translateInterface();});await settle(page);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);assert.ok(overflow,'Forecast fits a narrow translated layout');
 return {bothOutcomes:true,sourceColors:colors,baselineAbsent:true,loadingUntilActualState:true,automaticNativeCompletion:true,publishedStateUsed:true,values,placement};
}
async function navigationChecks(page){
 for(const next of ['players','lobby','players','lobby']){
  await page.evaluate(next=>{view=next;renderLibrary();translateInterface();},next);await settle(page);
  const value=await page.evaluate(()=>({same:document.querySelector('.header-actions')===fixtureActions&&$('import')===fixtureImport&&$('notify-test')===fixtureAlert&&$('import-progress')===fixtureProgress,
   parent:fixtureActions.parentElement.className,progressAfterHead:document.querySelector('.page-head').nextElementSibling===fixtureProgress,
   lobbyParent:fixtureActions.parentElement.id,unique:document.querySelectorAll('#import').length===1&&document.querySelectorAll('#notify-test').length===1,subtitleHidden:getComputedStyle(document.querySelector('.page-head .muted')).display==='none'}));
  assert.ok(value.same&&value.unique,'Navigation retains the actual original action and progress nodes');
  if(next==='lobby'){assert.equal(value.lobbyParent,'lobby-page-actions');assert.ok(value.subtitleHidden);}else{assert.equal(value.parent,'page-head');assert.ok(value.progressAfterHead);assert.equal(value.subtitleHidden,false);}
  await page.locator('#import').click();await page.locator('#notify-test').click();
 }
 assert.deepEqual(await page.evaluate(()=>fixtureClicks),{import:4,alert:4},'Original listeners fire exactly once after repeated reparenting');
 return {switches:4,sameActionAndProgressNodes:true,uniqueIds:true,originalListenersExactlyOnce:true};
}
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of [1440,375])for(const language of ['en','ru']){
   const page=await fixture(browser,width,language),item={width,language};report.cases.push(item);
   try{
    item.populated=await layout(page,true);item.forecast=await forecastChecks(page,language);
    if(language==='en'){
     const file=path.join(__dirname,width===1440?'automatic-rating-state-preview.png':'automatic-rating-state-mobile.png');
     await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);
    }
    item.continuity=await continuity(page);item.navigation=await navigationChecks(page);
    await page.evaluate(()=>{
     state.lobby.automation={acceptNeeded:true,acceptKind:'party-invite',status:'Accept needed · checking input safety'};renderLibrary();translateInterface();
    });await settle(page);
    assert.ok(await page.locator('.live-accept-needed').isVisible(),'Actionable invitation stays visible above players');
    assert.ok(await page.evaluate(()=>!!(document.querySelector('.live-accept-needed').compareDocumentPosition(document.querySelector('.live-roster-grid'))&Node.DOCUMENT_POSITION_FOLLOWING)));
    assert.equal(await page.locator('.live-accept-needed strong').textContent(),language==='ru'?'Примите приглашение в SC2':'Accept invite in SC2');item.invitationAbovePlayers=true;
    await page.evaluate(()=>{
     state.lobby={region:'EU',phase:'disconnected',source:'none',rosterEntries:[],detectionStatus:'Fixture client unavailable',ocrStatus:'SC2 capture unavailable'};
     renderLibrary();translateInterface();
    });await settle(page);
    item.empty=await layout(page,false);
    assert.ok((await page.locator('.live-monitor-details').textContent()).includes('Fixture client unavailable'),'Full empty-state diagnostics remain available');
    assert.match(await page.locator('.live-roster-heading').textContent(),language==='ru'?/клиент недоступен/i:/Client unavailable/i,'Unavailable phase remains in compact status');
    if(width===1440&&language==='en'){
     const file=path.join(__dirname,'players-first-lobby-empty.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);
    }
    assert.deepEqual(page.fixtureErrors,[],'No uncaught browser errors');
   }finally{await page.close();}
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{await browser?.close();const file=path.join(__dirname,'players-first-lobby-ui-tests.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,cases:report.cases.length,report:file,screenshots:report.screenshots,error:report.error}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
