'use strict';
// Offline real-render regression. Run via -Stage SoundMenuBrowser for the resource guard.
// Headless DOM attachment/focus evidence does not prove a visible WebView2 native popup.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
const report={success:false,runId,fixture:'Actual lobby and custom-sound rendering/update/save/preview; offline API',cases:[],baseline:null,nativePopup:'DOM continuity and focus only; visible WebView2 popup not verified'};
const reportPath=path.join(__dirname,'sound-menu-continuity-'+runId+'.json');
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function fixture(browser,width,language,old=false){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 page.fixtureErrors=[];page.on('pageerror',error=>page.fixtureErrors.push(error.message));
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><button id="outside">Outside</button><div class="app"><aside class="sidebar">Direct Strike Companion</aside><main id="content" data-view="lobby" style="min-width:0"></main></div><section id="settings-fixture"><select id="sound-preset"></select><input id="sound-volume" type="range" value="80"><div id="settings-custom-sounds"></div><button id="settings-outside">Leave settings sound</button></section></body></html>');
 for(const file of ['style.css','i18n.css','lobby.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
 await page.evaluate(()=>{
  window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  window.num=n=>n==null?'—':String(Math.round(n));window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=()=> '08 Oct';window.time=()=> '12:00';
  window.state={library:{settings:{language:'en',selfIds:[],sound:true,autoAcceptMatch:true,autoPickCommander:'Random',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:80,notificationSoundStyles:{}}},lobby:{source:'manual',phase:'pregame',rosterEntries:[{name:'Before poll',team:1,candidates:[]}]}};
  window.groupedLobbyCandidates=candidates=>candidates.map(candidate=>({candidate}));
  window.siteNameKey=name=>name;window.siteLookup=()=>({profiles:[]});window.siteLobbyUnknown=()=>'<p>Offline unknown identity</p>';
  window.siteLookupForName=()=>({profiles:[]});window.siteMissingRatingStatus=()=> 'Checking ds-rating.com…';
  window.sitePreferredProfiles=profiles=>profiles;window.siteCommanderStats=()=>'';
  window.siteProfileRatingStatus=()=> 'Unrated on ds-rating.com';window.siteAccountRatingList=()=>'';
  window.automationCommanderOptions=selected=>['','Random','Raynor'].map(v=>`<option value="${v}"${v===selected?' selected':''}>${v||'Off'}</option>`).join('');
  window.commanderName=s=>s;window.automaticDataError='';window.toast=()=>{};
  window.fixtureCalls=[];window.fixtureEvents=[];window.fixtureMetadataResolve=null;
  for(const type of ['input','change','blur','focus'])document.addEventListener(type,event=>{
   const node=event.target;
   if(node.matches?.('[data-live-preference],[data-sound-style]'))fixtureEvents.push({type,preference:node.dataset.livePreference,style:node.dataset.soundStyle,context:node.dataset.soundContext,value:node.value,trusted:event.isTrusted});
  },true);
  window.api=async(route,body)=>{fixtureCalls.push({route,body});if(route==='sounds/custom')return new Promise(resolve=>window.fixtureMetadataResolve=resolve);return body||{};};
  window.renderLibrary=()=>updateLiveLobby(document.getElementById('content'));window.refresh=async()=>renderLibrary();
 });
 for(const file of ['sound-library.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
 await page.addScriptTag({content:fs.readFileSync(old?path.join(__dirname,'lobby-before-sound-menu-continuity.js'):path.join(root,'wwwroot','lobby.js'),'utf8')});
 await page.evaluate(language=>{
  liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();renderLibrary();
  document.querySelector('.live-control-details').open=true;
  document.getElementById('sound-preset').innerHTML=notificationSoundStyleOptions('sc2-nuclear');
  updateCustomSoundControls();setInterfaceLanguage(language);
  // Every watch records select descendants before the mutation, not only the final focus.
  window.fixtureWatch=selector=>{
   window.fixtureObserver?.disconnect();const node=document.querySelector(selector);
   const descendants=[node,...node.querySelectorAll('optgroup,option')];
   const events={blur:0,focus:0};node.addEventListener('blur',()=>events.blur++);node.addEventListener('focus',()=>events.focus++);
   window.fixtureProtected={selector,node,descendants,events,removals:[]};
   window.fixtureObserver=new MutationObserver(records=>{
    for(const record of records)for(const removed of record.removedNodes)if(descendants.some(n=>removed===n||removed.contains?.(n)))fixtureProtected.removals.push(removed.nodeName);
   });fixtureObserver.observe(document.body,{childList:true,subtree:true});
  };
  window.fixtureContinuity=()=>{const w=fixtureProtected,current=document.querySelector(w.selector);return {same:current===w.node,connected:w.descendants.every(n=>n.isConnected),sameChildren:w.descendants.slice(1).every((n,i)=>current.querySelectorAll('optgroup,option')[i]===n),focused:document.activeElement===w.node,events:w.events,removals:w.removals};};
 },language);
 await settle(page);return page;
}
async function watch(page,selector,keyboard=true){
 await page.locator(selector).focus();
 if(keyboard&&await page.locator(selector).evaluate(node=>node.tagName==='SELECT')){await page.keyboard.press('Alt+ArrowDown');await page.keyboard.press('Escape');}
 await page.evaluate(selector=>fixtureWatch(selector),selector);
}
async function continuity(page,label){
 await settle(page);const value=await page.evaluate(()=>fixtureContinuity());
 assert.deepEqual(value,{same:true,connected:true,sameChildren:true,focused:true,events:{blur:0,focus:0},removals:[]},label);return value;
}
async function poll(page,label){
 await page.evaluate(label=>{state.lobby.detectionStatus=label;state.lobby.rosterEntries=[{name:label,team:2,candidates:[]}];updateLiveLobby(document.getElementById('content'));},label);
 assert.equal(await page.locator('[data-lobby-entry]').getAttribute('data-lobby-entry'),label,'Roster updates while sound menu stays focused');
 assert.ok((await page.locator('.live-monitor-details').textContent()).includes(label),'Detection status updates while sound menu stays focused');
}
async function metadata(page,name){
 await page.evaluate(()=>{window.fixtureMetadataRequest=requestCustomNotificationSounds(true);});
 await page.waitForFunction(()=>typeof fixtureMetadataResolve==='function');
 await page.evaluate(name=>{fixtureMetadataResolve({accept:{name,seconds:1.5}});fixtureMetadataResolve=null;},name);
 await page.evaluate(()=>fixtureMetadataRequest);
}
async function blur(page,selector='#outside'){
 await page.evaluate(()=>fixtureObserver.disconnect());await page.locator(selector).focus();await settle(page);
}
async function heldPreview(page,context,name){
 const flushedName=context==='settings'?'during-'+name:name;
 const select=`[data-sound-style="accept"][data-sound-context="${context}"]`;
 const button=`[data-sound-preview="accept"][data-sound-context="${context}"]:not([data-sound-built-in])`;
 await page.locator(button).scrollIntoViewIfNeeded();await watch(page,select,false);
 await metadata(page,name);await continuity(page,`${context} metadata pending before mouse gesture`);
 const expected=await page.evaluate(({button,context})=>{
  window.fixtureHeldButton=document.querySelector(button);
  const options=liveGameSoundOptions();
  return {count:fixtureCalls.filter(call=>call.route==='sounds/preview').length,
   preset:options.styles?.accept||(context==='settings'?document.getElementById('sound-preset').value:options.preset),
   volume:context==='settings'?Number(document.getElementById('sound-volume').value):options.volume};
 },{button,context});
 const box=await page.locator(button).boundingBox();assert.ok(box,`${context} adjacent Preview visible`);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 // Exercise the background updater itself while the pointer owns the blurred
 // select's destination button, not only its previously queued blur flush.
 if(context==='live')await poll(page,`Held Preview poll ${name}`);
 else{await metadata(page,flushedName);await page.evaluate(()=>updateCustomSoundControls());}
 await page.waitForTimeout(100);
 const held=await page.evaluate(button=>({same:document.querySelector(button)===fixtureHeldButton,attached:fixtureHeldButton.isConnected,
  previews:fixtureCalls.filter(call=>call.route==='sounds/preview').length,continuity:fixtureContinuity()}),button);
 assert.equal(held.same,true,`${context} Preview identity through held mouse-down`);
 assert.equal(held.attached,true,`${context} Preview continuously attached through held mouse-down`);
 assert.equal(held.previews,expected.count,`${context} Preview waits for mouse-up`);
 assert.equal(held.continuity.same,true,`${context} select identity through pending mouse gesture`);
 assert.equal(held.continuity.connected,true,`${context} select/options remain attached through pending mouse gesture`);
 assert.deepEqual(held.continuity.removals,[],`${context} no protected subtree removal before click`);
 await page.evaluate(()=>fixtureObserver.disconnect());await page.mouse.up();await settle(page);
 const calls=await page.evaluate(()=>fixtureCalls.filter(call=>call.route==='sounds/preview'));
 assert.equal(calls.length,expected.count+1,`${context} held gesture fires Preview exactly once`);
 assert.deepEqual(calls.at(-1).body,{cue:'accept',preset:expected.preset,volume:expected.volume},`${context} held gesture preserves intended Preview sound`);
 const host=context==='settings'?'#settings-custom-sounds':'.live-controls';
 await page.waitForFunction(({host,name})=>document.querySelector(host).textContent.includes(name),{host,name:flushedName});
 return {context,heldMilliseconds:100,backgroundUpdateDuringHold:context==='live'?'updateLiveLobby poll':'custom metadata completion plus updateCustomSoundControls',preview:calls.at(-1).body,buttonAttachedBeforeRelease:held.attached,protectedRemovalsBeforeRelease:held.continuity.removals,metadataFlushed:true};
}
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const beforePath=path.join(__dirname,'lobby-before-sound-menu-continuity.js');
  assert.ok(fs.existsSync(beforePath),'Saved before implementation is required for regression discrimination');
  const before=await fixture(browser,960,'en',true);
  try{
   await watch(before,'[data-live-preference="preset"]',false);await poll(before,'Old implementation poll');await settle(before);
   report.baseline=await before.evaluate(()=>fixtureContinuity());
   assert.ok(report.baseline.removals.length>0,'Old implementation must fail continuous attachment, even if it restores focus');
  }finally{await before.close();}
  for(const width of [960,1440])for(const language of ['en','ru']){
   const page=await fixture(browser,width,language),item={width,language,checks:[]};report.cases.push(item);
   try{
    const library=await page.evaluate(()=>starcraftSoundLibrary);
    for(const selector of ['[data-live-preference="preset"]','[data-sound-style="accept"][data-sound-context="live"]','[data-live-preference="volume"]']){
     item.activeCheck=selector+' background/metadata continuity and blur flush';
     await watch(page,selector);for(let n=0;n<4;n++){await poll(page,`Poll ${width}/${language}/${n}`);await continuity(page,`${selector} unchanged poll ${n}`);}
     await page.evaluate(()=>{state.library.settings.notificationSoundVolume=35;updateLiveLobby(document.getElementById('content'));});
     await continuity(page,`${selector} background preference update`);
     await metadata(page,`delayed-${width}-${language}.wav`);await continuity(page,`${selector} delayed custom metadata`);
     await blur(page);
     assert.equal(await page.locator('[data-live-preference="volume"]').inputValue(),'35','Preference replacement flushes after blur');
     assert.ok((await page.locator('.live-controls').textContent()).includes(`delayed-${width}-${language}.wav`),'Metadata replacement flushes after blur');
     // Reset with a distinct signature before the next control case.
     await page.evaluate(()=>{state.library.settings.notificationSoundVolume=80;liveCustomSounds={};updateCustomSoundControls();});await settle(page);
     item.checks.push(selector+' repeated polls, background preference, metadata and blur flush');
    }
    const menu=page.locator('[data-live-preference="preset"]');
    item.activeCheck='Catalog labels and explicit live save/preview';
    assert.equal(await menu.locator('optgroup').count(),library.categories.length);assert.equal(await menu.locator('option').count(),library.sounds.length);
    for(const category of library.categories)assert.equal(await menu.locator(`optgroup[label="${category[language]}"]`).count(),1);
    for(const sound of library.sounds)assert.equal(await menu.locator(`option[value="${sound.preset}"]`).textContent(),sound[language]);
    await menu.focus();await menu.selectOption('sc1-nuclear');await page.waitForFunction(()=>!liveGameSoundSaving);
    assert.equal(await menu.inputValue(),'sc1-nuclear','Explicit global save updates selection');
    const eventMenu=page.locator('[data-sound-style="accept"][data-sound-context="live"]');
    await eventMenu.focus();await eventMenu.selectOption('sc2-nuclear');await page.waitForFunction(()=>!liveGameSoundSaving);
    assert.equal(await eventMenu.inputValue(),'sc2-nuclear','Explicit per-alert save updates selection');
    await page.locator('[data-sound-preview="accept"]:not([data-sound-context])').click();
    await page.waitForFunction(()=>fixtureCalls.some(call=>call.route==='sounds/preview'));
    assert.deepEqual(await page.evaluate(()=>fixtureCalls.filter(call=>call.route==='sounds/preview').at(-1).body),{cue:'accept',preset:'sc2-nuclear',volume:80});
    assert.ok(await page.evaluate(()=>fixtureCalls.filter(call=>call.route==='lobby/preferences').length>=2));
    item.checks.push('Complete translated catalog, explicit global/per-alert saves, preview API payload');
    const settingsSelector='[data-sound-style="accept"][data-sound-context="settings"]';
    item.activeCheck='Settings metadata continuity, blur flush and explicit save/preview';
    await watch(page,settingsSelector);
    await page.evaluate(()=>{window.fixtureDefault=document.getElementById('sound-preset');window.fixtureDefaultChildren=[...fixtureDefault.querySelectorAll('optgroup,option')];});
    await metadata(page,`settings-${width}-${language}.wav`);await continuity(page,'Settings per-alert metadata continuity');
    for(let n=0;n<3;n++){await page.evaluate(()=>updateCustomSoundControls());await continuity(page,'Settings repeated async host update');}
    await blur(page,'#settings-outside');
    assert.ok((await page.locator('#settings-custom-sounds').textContent()).includes(`settings-${width}-${language}.wav`),'Settings metadata flushes after blur');
    assert.ok(await page.evaluate(()=>document.getElementById('sound-preset')===fixtureDefault&&fixtureDefaultChildren.every(n=>n.isConnected)),'Settings main default node and catalog remain attached');
    await page.locator(settingsSelector).selectOption('sc1-nuclear');await page.waitForFunction(()=>!liveGameSoundSaving);
    assert.equal(await page.locator(settingsSelector).inputValue(),'sc1-nuclear','Settings per-alert explicit save');
    await page.locator('[data-sound-preview="accept"][data-sound-context="settings"]:not([data-sound-built-in])').click();
    await page.waitForFunction(()=>fixtureCalls.filter(call=>call.route==='sounds/preview').length>=2);
    assert.equal(await page.evaluate(()=>fixtureCalls.filter(call=>call.route==='sounds/preview').at(-1).body.preset),'sc1-nuclear');
    item.checks.push('Settings host delayed metadata/polls, blur flush, default continuity, per-alert save/preview');
    item.activeCheck='Held Preview pointer gesture while metadata replacement is pending';
    item.pointerGestures=[];
    for(const context of ['live','settings'])item.pointerGestures.push(await heldPreview(page,context,`held-${context}-${width}-${language}.wav`));
    item.checks.push('Live/Settings held mouse-down preserves adjacent Preview, exactly one intended preview on mouse-up, then metadata flush');
    const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));item.overflow=overflow;
    assert.deepEqual(page.fixtureErrors,[],'No uncaught browser errors');
    // Exercise the actual invitation badge in the continuously refreshed lobby.
    await page.evaluate(()=>{window.fixtureCommanderOptions=automationCommanderOptions;});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot','sc2-automation.js'),'utf8')});
    await page.evaluate(()=>{
     window.automationCommanderOptions=fixtureCommanderOptions;
     state.lobby.automation={acceptNeeded:true,acceptKind:'party-invite',status:'Accept needed · checking input safety'};
     state.lobby.rosterEntries=[{name:'Ваня Кузьмич',team:1,candidates:[]}];
     updateLiveLobby(document.getElementById('content'));
     document.querySelector('.live-control-details').open=false;
    });
    await settle(page);
    assert.ok(await page.locator('.live-accept-needed').isVisible(),'Party invitation cue is visible above the roster');
    const heading=await page.locator('.live-accept-needed strong').textContent();
    assert.equal(heading,language==='ru'?'Примите приглашение в SC2':'Accept invite in SC2');
    item.checks.push('Party invitation marker appears with localized label during lobby refresh');
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot','site-data.js'),'utf8')});
    await page.evaluate(()=>{
     window.buildLiveLobbyHistory=()=>null;window.liveReplayWinRate=()=>'';window.siteIdentityKey=p=>'site:'+p.region+':'+p.profileId;
     state.library.siteLookups={'name:unrated':{status:'Candidates',profiles:[{profileId:'25585',name:'Unrated',region:'EU',rating:null}]}};
     state.lobby.region='EU';state.lobby.rosterEntries.push({name:'Unrated',team:2,candidates:[]});
     state.lobby.automation={acceptNeeded:false,status:'No recognized match-accept popup',lastAcceptStatus:'SC2 did not receive automatic input · no click sent',lastAcceptObservedAt:new Date().toISOString()};
     updateLiveLobby(document.getElementById('content'));
    });
    await settle(page);
    assert.equal(await page.locator('.live-controls-error').textContent(),language==='ru'?'SC2 не получила автоматическое нажатие — щелчок не отправлен':'SC2 did not receive automatic input · no click sent');
    assert.ok((await page.locator('[data-lobby-entry="Unrated"] .live-name-status').textContent()).includes(language==='ru'?'Нет опубликованного рейтинга на ds-rating.com':'Unrated on ds-rating.com'));
    item.checks.push('The latest rejected invitation and a verified unrated site profile remain readable and localized');
    await page.evaluate(()=>{
     state.library.siteLookups['name:EU:mrbig']={status:'Candidates',profiles:[{profileId:'1956',name:'MrBig',region:'EU',rating:6200,lastPlayed:'2026-10-07'},{profileId:'225559',name:'MrBig',region:'EU',rating:5800,lastPlayed:'2026-10-09'},{profileId:'175286',name:'MrBig',region:'Americas',rating:7300}]};
     state.library={...state.library};state.lobby.rosterEntries.push({name:'MrBig',team:2,candidates:[]});
     updateLiveLobby(document.getElementById('content'));
    });
    await settle(page);
    const grouped=page.locator('[data-lobby-entry="MrBig"]');
    assert.equal(await grouped.locator('.live-row .site-account-rating:visible').count(),1,'Only the most recent EU matching account starts visible');
    assert.ok((await grouped.locator('.site-account-primary').textContent()).includes('5800'),'Recent activity outranks an older higher rating');
    const accounts=grouped.locator('[data-site-disclosure^="accounts:"]');
    assert.equal(await accounts.getAttribute('aria-expanded'),'false');
    await accounts.click();
    assert.equal(await grouped.locator('.live-row .site-account-rating:visible').count(),2,'One click reveals all alternate EU account ratings');
    await page.evaluate(()=>updateLiveLobby(document.getElementById('content')));
    assert.equal(await accounts.getAttribute('aria-expanded'),'true','Account disclosure stays open through a background refresh');
    await accounts.click();
    assert.ok((await grouped.locator('.live-row-ratings').textContent()).includes('6200'));
    assert.ok((await grouped.locator('.live-row-ratings').textContent()).includes('5800'));
    assert.ok(!(await grouped.locator('.live-row-ratings').textContent()).includes('7300'),'Other region excluded');
    const details=grouped.locator('.live-profile-details>summary');await details.scrollIntoViewIfNeeded();
    const before=await details.boundingBox();await details.click();const after=await details.boundingBox();
    assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,'Details stays anchored when grouped accounts expand');
    await details.click();
    item.checks.push('Recent account ranks first; alternatives expand and retain state through polling; Details remains anchored');
    await page.evaluate(()=>{
     state.library={...state.library,siteLookups:{...state.library.siteLookups,'name:EU:blackjoker':{status:'Site estimate',profiles:[{profileId:'3128',name:'BlackJoker',region:'EU',rating:null,estimatedRating:3968,profileChecked:'2026-10-10'}]}}};
     state.lobby.rosterEntries.push({name:'BlackJoker',team:2,candidates:[]});updateLiveLobby(document.getElementById('content'));
    });
    const estimated=page.locator('[data-lobby-entry="BlackJoker"] .live-row-ratings');
    assert.ok((await estimated.textContent()).includes('3968'),'BlackJoker main-profile estimate appears in the lobby');
    assert.equal(await estimated.locator('.site-rating-estimated').textContent(),language==='ru'?'Оценка':'Estimated');
    assert.equal(await estimated.locator('a').getAttribute('href'),'https://ds-rating.com/player/3128');
    item.checks.push('A main-profile estimate has its number, localized label and correct source link in the lobby');
    if(width===1440&&language==='en'){
     const screenshot=path.join(__dirname,'grouped-lobby-ratings-preview.png');
     await page.locator('#content').screenshot({path:screenshot});item.screenshot=screenshot;
    }
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot','replays.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot','replays.js'),'utf8')});
    const portraits={};for(const name of ['dehaka','artanis','tychus','abathur','nova','stetmann'])portraits[name]='data:image/png;base64,'+fs.readFileSync(path.join(root,'wwwroot','images','commanders',name+'.png')).toString('base64');
    await page.evaluate(portraits=>{
     window.fixtureMatch={hash:'replay-preview',mode:'Commanders',seconds:930,winner:1,time:'2026-10-10T12:00:00Z',players:[
      {id:'2-S2-1-1',name:'Vanea',team:1,commander:'Dehaka'},
      {id:'2-S2-1-2',name:'TKnight',team:1,commander:'Artanis'},
      {id:'2-S2-1-3',name:'MrBig',team:1,commander:'Abathur'},
      {id:'2-S2-1-4',name:'Pangu',team:2,commander:'Tychus'},
      {id:'2-S2-1-5',name:'BlackJoker',team:2,commander:'Nova'},
      {id:'2-S2-1-6',name:'BlueMage',team:2,commander:'Stetmann'}]};
     state.library.settings.selfIds=['2-S2-1-2'];state.library.matches=[fixtureMatch];
     state.library.marks=[{id:'2-S2-1-1',name:'Vanea',list:'friends',note:'Newest server note'}];state.library.ratingChanges={};
     const values=[5461,7729,null,5935,null,6100];
     fixtureMatch.players.forEach((player,index)=>{state.library.siteLookups[player.id]={status:'Name match',profiles:[{profileId:String(100+index),name:player.name,region:'EU',rating:values[index]}]};});
     state.library.siteLookups['2-S2-1-3']={status:'Ambiguous',profiles:[{profileId:'1956',name:'MrBig',region:'EU',rating:6200},{profileId:'225559',name:'MrBig',region:'EU',rating:5800}]};
     state.library.siteLookups['2-S2-1-5']={status:'Site estimate',profiles:[{profileId:'3128',name:'BlackJoker',region:'EU',rating:null,estimatedRating:3968,profileChecked:'2026-10-10'}]};
     window.findPlayer=id=>{const player=fixtureMatch.players.find(player=>player.id===id);return player&&{...player,mark:state.library.marks.find(mark=>mark.id===id)};};
     window.regionRating=(player,region)=>siteRating(player.id,region);window.ratingTargetId=id=>id;
     window.commanderPortrait=(name,size)=>`<img class="commander-portrait ${size}" src="${portraits[name.toLowerCase()]}" alt="${name}">`;
     window.replayPlayerName=player=>player.name;window.combatExplanation=()=>'';window.combatValue=()=>180;window.formatCombat=()=> '180';
     window.renderLibrary=()=>{document.getElementById('content').innerHTML='<p class="muted">UI preview · sample account ratings</p>'+replayMatchDetails(fixtureMatch);};
     window.api=async(route,body)=>{fixtureCalls.push({route,body});if(route==='mark/list')return {...state.library.marks.find(mark=>mark.id===body.id),...body};return body;};
     window.refresh=async()=>renderLibrary();renderLibrary();translateInterface(document.getElementById('content'));
    },portraits);
    await settle(page);
    assert.equal(await page.locator('.match-player .replay-compact-ratings').count(),6,'Every replay player has compact ratings next to their name');
    const replayEstimate=page.locator('.match-player').filter({has:page.locator('[data-player="2-S2-1-5"]')}).locator('.replay-rating-evidence .replay-name-rating');
    assert.ok((await replayEstimate.textContent()).includes('3968'));
    assert.equal(await replayEstimate.locator('.site-rating-estimated').textContent(),language==='ru'?'Оценка':'Estimated');
    item.checks.push('Replay cards show BlackJoker estimate beside the name in English and Russian');
    assert.equal(await page.locator('.match-player [data-quick-player-list="friends"]').count(),5,'All other players have a direct Friends button');
    assert.equal(await page.locator('.match-player [data-quick-player-list="losers"]').count(),5,'All other players have a direct Losers button');
    assert.equal(await page.locator('.match-player [data-quick-player-list="blocked"]').count(),0);
    await page.locator('[data-quick-player-id="2-S2-1-1"][data-quick-player-list="losers"]').click();
    await page.waitForFunction(()=>state.library.marks[0].list==='losers');
    assert.equal(await page.evaluate(()=>state.library.marks[0].note),'Newest server note');
    const request=await page.evaluate(()=>fixtureCalls.find(call=>call.route==='mark/list'));
    assert.deepEqual(request.body,{id:'2-S2-1-1',name:'Vanea',list:'losers'},'Direct action sends only list/identity, no stale private note');
    assert.ok(await page.locator('[data-quick-player-id="2-S2-1-1"][data-quick-player-list="losers"]').getAttribute('aria-pressed')==='true');
    await page.evaluate(()=>{document.getElementById('content').innerHTML='<p class="muted">UI preview · sample account ratings</p>'+replayTeams(fixtureMatch);translateInterface(document.getElementById('content'));});
    assert.equal(await page.locator('.replay-player .replay-name-rating').count(),6,'Replay table teams place ratings beside all six names');
    item.checks.push('Replay cards/table place all six ratings beside names; direct Friends/Losers saves once and keeps the server note');
    const replayOverflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(replayOverflow.scroll<=replayOverflow.client+1,JSON.stringify(replayOverflow));
    if(width===1440&&language==='en'){
     await page.evaluate(()=>renderLibrary());const screenshot=path.join(__dirname,'replay-ratings-actions-preview.png');
     await page.locator('#content').screenshot({path:screenshot});item.replayScreenshot=screenshot;
    }
    delete item.activeCheck;
   }catch(error){
    item.failureDebug=await page.evaluate(()=>({
     settings:state.library.settings,options:liveGameSoundOptions(),draft:liveGameSoundDraft,confirmed:liveGameSoundConfirmed,
     saving:liveGameSoundSaving,revision:liveGameSoundRevision,pending:notificationSoundRefreshPending,queued:notificationSoundRefreshQueued,pointerActive:notificationSoundPointerActive,
     customSounds:liveCustomSounds,customReading:liveCustomSoundReading,customBusy:liveCustomSoundBusy,
     volume:document.querySelector('[data-live-preference="volume"]')?.value,
     active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,data:{...document.activeElement?.dataset}},
     calls:fixtureCalls,events:fixtureEvents,continuity:fixtureProtected?fixtureContinuity():null
    })).catch(debugError=>({snapshotError:debugError.message}));
    throw error;
   }finally{await page.close();}
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');if(report.success)fs.writeFileSync(path.join(__dirname,'sound-menu-continuity-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,report:reportPath,cases:report.cases.length,baseline:report.baseline,error:report.error}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
