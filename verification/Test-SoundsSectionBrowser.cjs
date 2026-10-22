'use strict';
// Full production app and navigation, isolated API/settings and no real playback.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/catalog.json'),'utf8'));
const report={success:false,scope:'Full production navigation and Sounds page; isolated API, no private changes or audible playback',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  let settings={language,selfIds:[],replayFolders:['D:/Example replays'],autoDetectSelf:false,screenWatch:false,liveWatch:false,autoAcceptMatch:false,autoPickCommander:'',sound:true,pingOnMatchAccept:false,pingOnGameLoading:false,pingOnGameLoaded:true,notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:55,notificationSoundStyles:{loading:'sc1-research'},listAlerts:{friends:false,losers:false,blocked:false}};
  let clips={accept:{name:'Example custom.wav',seconds:1.2}},rejectNext=false,holdNext=false,release,holdSettings=false,releaseSettings;
  const audioKeys=['pingOnMatchAccept','pingOnGameLoading','pingOnGameLoaded','sound','notificationSoundPreset','notificationSoundVolume','notificationSoundStyles'];
  const preferences=()=>({accept:settings.pingOnMatchAccept,loading:settings.pingOnGameLoading,loaded:settings.pingOnGameLoaded,sound:settings.sound,autoAcceptMatch:settings.autoAcceptMatch,autoPickCommander:settings.autoPickCommander,preset:settings.notificationSoundPreset,volume:settings.notificationSoundVolume,styles:settings.notificationSoundStyles});
  const state=()=>({library:{settings,matches:[],players:[],marks:[],ratings:{},regionalRatings:{},accounts:[],ownAccountGroups:[],errors:[]},lobby:{state:'Menu',roster:[],rosterEntries:[],alerts:[],liveStatus:'Waiting for SC2',ocrStatus:'Screen reader off'},lobbyPreferences:preferences(),libraryVersion:'fixture',busy:false,replayStatus:'Up to date',dataPath:'Isolated fixture'});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),name=decodeURIComponent(url.pathname);
   const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(name.startsWith('/api/')){
    const api=name.slice(5),method=route.request().method();let body;try{body=route.request().postDataJSON();}catch{}
    requests.push({api,method,body});
    if(api==='updates')return json({},503);
    if(api==='state')return json(state());
    if(api==='live-state')return json({lobby:state().lobby,site:{},lobbyPreferences:preferences()});
    if(api==='sounds/custom')return json(clips);
    if(api.startsWith('sounds/custom/')){const cue=api.split('/').at(-1);if(method==='DELETE')delete clips[cue];else clips[cue]={name:url.searchParams.get('name'),seconds:1};return json(clips);}
    if(api==='lobby/preferences'){
     if(holdNext){holdNext=false;await new Promise(resolve=>release=resolve);}
     if(rejectNext){rejectNext=false;return json({error:'Fixture rejected save'},400);}
     Object.assign(settings,{pingOnMatchAccept:body.accept,pingOnGameLoading:body.loading,pingOnGameLoaded:body.loaded,sound:body.sound,autoAcceptMatch:body.autoAcceptMatch,autoPickCommander:body.autoPickCommander,notificationSoundPreset:body.preset,notificationSoundVolume:body.volume,notificationSoundStyles:body.styles});return json(body);
    }
    if(api==='settings'){
     if(holdSettings){holdSettings=false;await new Promise(resolve=>releaseSettings=resolve);}
     // General settings preserve the audio-owned fields at commit time, as the API does.
     settings={...body,...Object.fromEntries(audioKeys.map(key=>[key,settings[key]]))};return json(settings);
    }
    if(api==='language'){settings.language=body.language;return json({language:body.language});}
    return json({});
   }
   const file=name==='/'?'index.html':name.slice(1),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png',body:fs.readFileSync(target)});
  });
  await page.goto('http://sounds.test/');await page.locator('button.nav[data-view="sounds"]').click();
  await page.waitForFunction(()=>!!document.querySelector('.sounds-page')&&liveCustomSoundLoaded);
  assert.equal(await page.locator('#main').getAttribute('data-view'),'sounds');
  assert.equal(await page.locator('.metrics').isVisible(),false);assert.equal(await page.locator('#sound-preset').count(),0);
  const preferenceCalls=()=>requests.filter(request=>request.api==='lobby/preferences');
  const before=preferenceCalls().length;
  await page.locator('[data-sounds-language="ru"]').click();
  assert.equal(await page.locator('[data-sounds-row]').count(),48);assert.equal(preferenceCalls().length,before);
  await page.locator('[data-sounds-category]').selectOption('sc2-ru-terran-alerts');
  const presets=await page.locator('[data-sounds-row]').evaluateAll(nodes=>nodes.map(node=>node.dataset.soundsRow));
  assert.ok(presets.length>3);assert.ok(presets.every(preset=>catalog.sounds.find(sound=>sound.preset===preset)?.language==='ru'));
  assert.equal(preferenceCalls().length,before);
  await page.locator('[data-sounds-target="accept"]').click();
  holdNext=true;await page.locator(`[data-sounds-assign="${presets[0]}"]`).click();
  await page.waitForFunction(()=>liveGameSoundSaving);
  const search=page.locator('[data-sounds-search]');await search.fill('research');await search.focus();
  await page.evaluate(()=>{window.savedSearch=document.querySelector('[data-sounds-search]');window.savedCategory=document.querySelector('[data-sounds-category]');window.savedFile=document.querySelector('[data-sounds-custom="accept"] input[type=file]');});
  await page.evaluate(()=>refresh());
  assert.equal(await search.inputValue(),'research');assert.equal(await page.evaluate(()=>document.activeElement===savedSearch&&savedSearch===document.querySelector('[data-sounds-search]')&&savedCategory===document.querySelector('[data-sounds-category]')&&savedFile.isConnected),true);
  release();await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.equal(settings.notificationSoundStyles.accept,presets[0]);assert.equal(settings.pingOnMatchAccept,false);
  assert.equal(settings.notificationSoundStyles.loading,'sc1-research');assert.equal(settings.notificationSoundPreset,'sc2-nuclear');
  await search.fill('');const list=page.locator('.sounds-recordings');await list.evaluate(node=>node.scrollTop=120);
  const scroll=await list.evaluate(node=>node.scrollTop);await page.locator('[data-sounds-category]').focus();await page.evaluate(()=>refresh());
  assert.equal(await list.evaluate(node=>node.scrollTop),scroll);assert.equal(await page.evaluate(()=>document.activeElement===savedCategory),true);
  const previewPreset=presets.find(preset=>preset!==presets[0]),previewButton=page.locator(`[data-sounds-recording-preview="${previewPreset}"]`);
  await previewButton.focus();await previewButton.press('Enter');await page.waitForFunction(()=>!soundsPageState.previewing);
  assert.equal(await previewButton.evaluate(node=>document.activeElement===node),true,'Keyboard preview retains focus');
  assert.equal(requests.filter(request=>request.api==='sounds/preview').at(-1).body.builtIn,true);assert.equal(settings.notificationSoundStyles.accept,presets[0]);
  await page.locator('[data-sounds-effective-preview]').click();
  assert.equal(requests.filter(request=>request.api==='sounds/preview').at(-1).body.builtIn,undefined,'Effective preview retains custom WAV priority');
  await page.locator('[data-sounds-custom="accept"] [data-sound-remove]').click();await page.waitForFunction(()=>!liveCustomSoundBusy);
  assert.equal(clips.accept,undefined);assert.equal(settings.notificationSoundStyles.accept,presets[0]);
  await page.locator('[data-sounds-use-default]').focus();await page.locator('[data-sounds-use-default]').press('Enter');await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.equal(await page.locator('[data-sounds-effective-preview]').evaluate(node=>document.activeElement===node),true,'Inherited default moves focus to its usable preview');
  assert.equal(settings.notificationSoundStyles.accept,undefined);assert.equal(settings.notificationSoundStyles.loading,'sc1-research');
  rejectNext=true;await page.locator(`[data-sounds-assign="${previewPreset}"]`).click();await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.ok((await page.locator('.sounds-status').textContent()).includes('Fixture rejected save'));assert.equal(settings.notificationSoundStyles.accept,undefined);
  const choice=page.locator(`[data-sounds-assign="${presets[0]}"]`);await choice.focus();await choice.press('Enter');await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.equal(await choice.evaluate(node=>document.activeElement===node),true,'Keyboard assignment retains focus');
  await search.fill('no-result-xyz');assert.equal(await page.locator('.sounds-empty').isVisible(),true);
  await page.locator('.sounds-empty [data-sounds-clear]').click();assert.ok(await page.locator('[data-sounds-row]').count()>0);
  await page.locator('#sounds-volume').evaluate(node=>{node.value='35';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>!liveGameSoundSaving);assert.equal(settings.notificationSoundVolume,35);
  await page.locator('#settings-open').click();await page.locator('[data-view="sounds"][data-close="settings-dialog"]').click();assert.equal(await page.locator('#settings-dialog').evaluate(node=>node.open),false);
  await page.locator('#settings-open').click();await page.locator('#settings-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('settings-dialog').open);assert.equal(settings.notificationSoundVolume,35);assert.equal(settings.notificationSoundStyles.accept,presets[0]);
  // Exercise the real overlapping handlers with general Settings committing last.
  holdNext=true;holdSettings=true;
  await page.locator(`[data-sounds-assign="${previewPreset}"]`).click();await page.waitForFunction(()=>liveGameSoundSaving);
  await page.locator('#settings-open').click();await page.locator('#live-watch').check();
  const settingsRequest=page.waitForRequest('**/api/settings');await page.locator('#settings-form button[type=submit]').click();await settingsRequest;
  release();await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.equal(settings.notificationSoundStyles.accept,previewPreset);
  assert.equal(typeof releaseSettings,'function');releaseSettings();await page.waitForFunction(()=>!document.getElementById('settings-dialog').open);
  assert.equal(settings.notificationSoundStyles.accept,previewPreset,'A stale general settings save cannot roll back the new sound');assert.equal(settings.liveWatch,true);
  await choice.click();await page.waitForFunction(()=>!liveGameSoundSaving);
  await page.locator('button.nav[data-view="lobby"]').click();await page.locator('.live-control-details summary').click();assert.equal(await page.locator('.live-control-details [data-live-preference="preset"]').count(),0);await page.locator('.live-control-details [data-view="sounds"]').click();
  await page.locator('#ui-language').selectOption(language==='en'?'ru':'en');await page.waitForFunction(()=>!languageSaving);
  assert.equal(await page.locator('[data-sounds-language="ru"]').getAttribute('aria-pressed'),'true');assert.equal(settings.notificationSoundStyles.accept,presets[0]);
  await page.locator('#ui-language').selectOption(language);await page.waitForFunction(()=>!languageSaving);
  await page.locator('[data-sounds-target="accept"]').click();await page.locator('[data-sounds-category]').selectOption('sc2-ru-terran-alerts');
  const geometry=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(geometry.scroll<=geometry.client,JSON.stringify({width,language,...geometry}));assert.deepEqual(errors,[]);
  await page.locator('#toast').waitFor({state:'hidden'});
  const screenshot=path.join(__dirname,`sounds-section-${width}-${language}.png`);await page.screenshot({path:screenshot,fullPage:true});
  report.cases.push({width,language,filterPurity:true,assignment:true,previewIsolation:true,customPriority:true,pollingContinuity:true,keyboardFocus:true,settingsPreservation:true,overlappingSaves:true,errorRecovery:true,geometry,screenshot});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'sounds-section-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
