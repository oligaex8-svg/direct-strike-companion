'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],requests=[],messages=[],listeners={};
let finishRequest,failRequest,refreshes=0;
const settings={selfIds:['2-S2-1-99'],sound:false,liveWatch:false,screenWatch:false,language:'ru',listAlerts:{friends:true},replayFolders:['D:/Replays']};
const context=vm.createContext({document:{addEventListener(kind,fn){(listeners[kind]??=[]).push(fn);}},state:{library:{settings},lobby:{}},esc:s=>String(s??'').replaceAll('"','&quot;'),commanderName:s=>s,renderLibrary(){},refresh:async()=>{refreshes++;},toast:s=>messages.push(s),api:async(route,body)=>{requests.push({route,body:JSON.parse(JSON.stringify(body))});return await new Promise((resolve,reject)=>{finishRequest=resolve;failRequest=reject;});}});
for(const file of ['sound-library.js','commanders.js','sc2-automation.js','lobby.js','ru-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=source=>vm.runInContext(source,context),check=async(name,fn)=>{await fn();checks.push(name);};
const options=()=>JSON.parse(run('JSON.stringify(liveGameSoundOptions())'));
(async()=>{
 await check('Live Lobby keeps game shortcuts separate from the dedicated Sounds section',()=>{
  const html=run('renderLiveGameSounds()');
  for(const label of ['Game controls','Game shortcuts','Auto-accept matches and invites','Preferred commander','Open sound settings'])assert.ok(html.includes(label));
  assert.equal((html.match(/type="checkbox"/g)||[]).length,1);assert.equal((html.match(/data-sound-preview=/g)||[]).length,0);
  assert.match(html,/data-view="sounds"/);assert.doesNotMatch(html,/data-live-preference="(?:preset|volume|loading|loaded|accept|sound)"/);
 });
 await check('A live change sends the narrow preference payload and preserves account/replay settings',async()=>{
  const before=JSON.stringify(settings),expected={...options(),loading:true},pending=run('saveLiveGameSound("loading",true)');
  assert.deepEqual(requests.at(-1),{route:'lobby/preferences',body:expected});assert.equal(options().loading,true);assert.match(run('renderLiveGameSounds()'),/ disabled/);
  assert.equal(JSON.stringify(settings),before);finishRequest();await pending;
  assert.equal(settings.pingOnGameLoading,true);assert.equal(settings.pingOnGameLoaded,false);assert.deepEqual(settings.selfIds,['2-S2-1-99']);assert.deepEqual(settings.replayFolders,['D:/Replays']);assert.equal(settings.language,'ru');assert.equal(settings.liveWatch,false);assert.equal(refreshes,1);
 });
 await check('Pending saves retain drafts through stale polling and block duplicate requests',async()=>{
  const pending=run('saveLiveGameSound("loaded",true)'),count=requests.length;
  settings.pingOnGameLoaded=false;assert.equal(options().loaded,true);assert.match(run('renderLiveGameSounds()'),/ disabled/);
  await run('saveLiveGameSound("loading",false)');assert.equal(requests.length,count);finishRequest();await pending;
  assert.equal(settings.pingOnGameLoaded,true);assert.doesNotMatch(run('renderLiveGameSounds()'),/ disabled/);
 });
 await check('A pre-save poll and throttled library cannot undo an acknowledged save or the next edit',()=>{
  const saved=options();context.stale={...saved,loading:false,loaded:false,autoPickCommander:'Nova'};
  settings.pingOnGameLoading=false;settings.pingOnGameLoaded=false;run('mergeLiveGamePreferences(stale,liveGameSoundRevision-1)');
  assert.deepEqual(options(),saved);assert.equal(settings.pingOnGameLoading,true);assert.equal(settings.pingOnGameLoaded,true);
  context.confirmed=saved;run('mergeLiveGamePreferences(confirmed,liveGameSoundRevision)');assert.deepEqual(options(),saved);assert.equal(run('liveGameSoundConfirmed'),null);
  context.changed={...saved,preset:'sc1-research',volume:45};run('mergeLiveGamePreferences(changed,liveGameSoundRevision)');assert.equal(settings.notificationSoundPreset,'sc1-research');assert.equal(settings.notificationSoundVolume,45);
  run('mergeLiveGamePreferences(confirmed,liveGameSoundRevision)');
 });
 await check('Rejected saves restore confirmed settings and show an inline actionable error',async()=>{
  const pending=run('saveLiveGameSound("loading",false)');failRequest(new Error('Companion disconnected'));await pending;
  assert.equal(settings.pingOnGameLoading,true);assert.match(run('renderLiveGameSounds()'),/live-controls-error/);assert.match(run('renderLiveGameSounds()'),/Companion disconnected/);assert.doesNotMatch(run('renderLiveGameSounds()'),/ disabled/);
 });
 await check('Unknown preference names never issue requests',async()=>{const count=requests.length;await run('saveLiveGameSound("selfIds",false)');assert.equal(requests.length,count);});
 await check('Checkboxes, commander selections and volume changes keep their correct value types',async()=>{
  for(const [kind,type,value,expected] of [['accept','checkbox',true,true],['autoPickCommander','select-one','Nova','Nova'],['volume','range','30',30]]){
   listeners.change[0]({target:{dataset:{livePreference:kind},type,value,checked:value}});assert.equal(requests.at(-1).body[kind],expected);
   finishRequest();await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(settings.pingOnMatchAccept,true);assert.equal(settings.autoPickCommander,'Nova');assert.equal(settings.notificationSoundVolume,30);
 });
 await check('Preview plays the selected event/tone/volume without changing preferences or enabling an event',async()=>{
  const before=JSON.stringify(settings),button={dataset:{soundPreview:'marked'},disabled:false};
  const pending=listeners.click[0]({target:{closest:selector=>selector==='[data-sound-preview]'?button:null}});assert.equal(button.disabled,true);
  assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'marked',preset:'sc2-nuclear',volume:30}});
  finishRequest();await pending;assert.equal(button.disabled,false);assert.equal(JSON.stringify(settings),before);
 });
 await check('Every new visible label and preview description has a reviewed Russian translation',()=>{
  for(const label of ['Notification sounds','Auto-accept match','Preferred commander','Accept needed','Loading starts','Game loaded','Marked player','Sound style','Soft chime','Clear bell','Classic tones','Volume','Notification volume','Saved automatically · runs while the tray app is open','Preview accept needed sound','Preview loading starts sound','Preview game loaded sound','Preview marked player sound'])assert.ok(run(`RU_UI_TEXT[${JSON.stringify(label)}]`),label);
 });
 await check('Language changes replace retained controls so commander labels are rebuilt in the selected language',()=>{
  context.interfaceLanguage='en';const before=run('renderLiveGameSounds()').match(/data-controls-signature="([^"]*)"/)[1];
  context.interfaceLanguage='ru';const after=run('renderLiveGameSounds()').match(/data-controls-signature="([^"]*)"/)[1];assert.notEqual(before,after);
 });
 await check('All twelve existing recordings retain their preset keys',()=>{
  for(const preset of ['sc1-nuclear','sc1-research','sc1-upgrade','sc1-pylons','sc1-warp','sc1-evolution','sc2-nuclear','sc2-research','sc2-upgrade','sc2-pylons','sc2-warp','sc2-evolution']){
   const menu=run(`notificationSoundStyleOptions(${JSON.stringify(preset)})`);assert.match(menu,new RegExp(`value="${preset}" selected`));
   context.nextStyle={...options(),preset};run('mergeLiveGamePreferences(nextStyle,liveGameSoundRevision)');assert.equal(options().preset,preset);
  }
  for(const label of ['Terran comms','Protoss chime','Zerg pulse','Orbital signal','Warp arrival','Battle ready','StarCraft / custom sound clips','Preview style','Choose clip','Replace clip'])assert.ok(run(`RU_UI_TEXT[${JSON.stringify(label)}]`),label);
 });
 await check('The expanded recording library is categorized, translated and available in both menus',()=>{
  const library=JSON.parse(run('JSON.stringify(starcraftSoundLibrary)'));
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/catalog.json'),'utf8').replace(/^\uFEFF/,''));
  assert.deepEqual(library,catalog,'Browser registry must match the canonical audio catalog');
  assert.ok(library.sounds.length>=75,'Expanded library must offer at least 75 actual recordings');
  const marine=library.sounds.find(sound=>sound.en==='SC2 · Marine — Ready');assert.ok(marine,'Marine ready label must retain its UTF-8 punctuation');
  assert.equal(marine.ru,'SC2 · Морпех — Готов');
  assert.ok(library.categories.length>=6&&library.categories.length<=16,'Keep the library in a bounded set of game/race/type categories');
  const keys=new Set(library.categories.map(category=>category.key));assert.equal(keys.size,library.categories.length);
  assert.equal(new Set(library.sounds.map(sound=>sound.preset)).size,library.sounds.length);
  for(const menu of [run('notificationSoundStyleOptions("sc2-nuclear")'),run('notificationSoundStyleOptions("",true)')]){
   assert.equal((menu.match(/<optgroup /g)||[]).length,library.categories.length);
   assert.equal((menu.match(/<option /g)||[]).length,library.sounds.length+(menu.includes('Use default sound')?1:0));
   for(const category of library.categories){assert.ok(library.sounds.some(sound=>sound.category===category.key),category.key);assert.ok(menu.includes(`label="${category.en}"`));}
   for(const sound of library.sounds){assert.ok(keys.has(sound.category),sound.preset);assert.match(sound.preset,/^sc[12]-/);assert.ok(menu.includes(`value="${sound.preset}"`));}
  }
  for(const item of [...library.categories,...library.sounds]){assert.ok(item.en&&item.ru);assert.equal(run(`RU_UI_TEXT[${JSON.stringify(item.en)}]`),item.ru);}
  const html=fs.readFileSync(path.join(root,'wwwroot/index.html'),'utf8');
  assert.ok(html.indexOf('/sound-library.js')<html.indexOf('/ru-ui.js'));assert.ok(html.indexOf('/sound-library.js')<html.indexOf('/lobby.js'));
 });
 await check('Every library recording preserves selection through normalization and fresh server projections',()=>{
  const saved=options(),custom=run('JSON.stringify(liveCustomSounds)');
  for(const preset of JSON.parse(run('JSON.stringify(starcraftSoundLibrary.sounds.map(sound=>sound.preset))'))){
   for(const eventDefault of [false,true]){const menu=run(`notificationSoundStyleOptions(${JSON.stringify(preset)},${eventDefault})`);assert.equal((menu.match(/ selected/g)||[]).length,1);assert.ok(menu.includes(`value="${preset}" selected`));}
   context.nextLibraryStyle={...saved,preset,styles:{accept:preset,loading:'sc1-research'}};
   run('mergeLiveGamePreferences(nextLibraryStyle,liveGameSoundRevision)');assert.equal(options().preset,preset);assert.deepEqual(options().styles,{accept:preset,loading:'sc1-research'});
  }
  context.restoreLibraryStyle=saved;run('mergeLiveGamePreferences(restoreLibraryStyle,liveGameSoundRevision)');assert.deepEqual(options(),saved);assert.equal(run('JSON.stringify(liveCustomSounds)'),custom);
  assert.deepEqual(JSON.parse(run('JSON.stringify(normalizeNotificationSoundStyles({accept:"missing",loading:"sc1-research"}))')),{loading:'sc1-research'});
 });
 await check('Preview style explicitly bypasses custom clips without changing any saved setting',async()=>{
  const before=JSON.stringify(settings),button={dataset:{soundPreview:'loaded',soundBuiltIn:'true'},disabled:false};
  const pending=listeners.click[0]({target:{closest:selector=>selector==='[data-sound-preview]'?button:null}});
  assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'loaded',preset:'sc2-evolution',volume:30,builtIn:true}});
  finishRequest();await pending;assert.equal(JSON.stringify(settings),before);
 });
 await check('Game controls stay collapsed and Settings link to the separate Sounds section',()=>{
  const html=run('renderLiveGameSounds()');assert.match(html,/^<details class="live-control-details" data-lobby-details-id="game-controls">/);
  assert.match(html,/Game controls/);assert.match(html,/Auto-accept/);assert.match(html,/Commander/);
  const settingsHtml=fs.readFileSync(path.join(root,'wwwroot/index.html'),'utf8');
  assert.match(settingsHtml,/data-view="sounds" data-close="settings-dialog"/);
  assert.doesNotMatch(settingsHtml,/id="(?:sound-preset|sound-volume|sound-accept|settings-custom-sounds)"/);
  assert.doesNotMatch(html,/value="(?:soft|clear|classic|terran|protoss|zerg|orbital|warp|ready)"/);
 });
 await check('Legacy global display uses SC2 nuclear without writing settings during render',()=>{
  settings.notificationSoundPreset='soft';run('liveGameSoundConfirmed=null');const before=JSON.stringify(settings);
  assert.match(run('notificationSoundStyleOptions("soft")'),/value="sc2-nuclear" selected/);
  assert.equal(options().preset,'sc2-nuclear');assert.equal(JSON.stringify(settings),before);
 });
 await check('Per-alert recording changes save a narrow dictionary, preserve other overrides and retain custom WAVs',async()=>{
  settings.notificationSoundStyles={loading:'sc1-research'};run('liveCustomSounds={accept:{name:"Custom.wav",seconds:1}}');
  const custom=run('JSON.stringify(liveCustomSounds)');const pending=run('saveLiveGameSound("styles",{loading:"sc1-research",accept:"sc2-pylons"})');
  assert.deepEqual(requests.at(-1).body.styles,{loading:'sc1-research',accept:'sc2-pylons'});assert.equal(requests.at(-1).body.preset,'sc2-nuclear');
  assert.match(run('renderCustomSoundControls()'),/value="sc2-pylons" selected/);finishRequest();await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(settings.notificationSoundStyles)),{accept:'sc2-pylons',loading:'sc1-research'});assert.equal(run('JSON.stringify(liveCustomSounds)'),custom);
  const saved=options();context.staleStyles={...saved,styles:{}};run('mergeLiveGamePreferences(staleStyles,liveGameSoundRevision-1)');assert.deepEqual(options().styles,saved.styles);
 });
 await check('Row preview uses its own recording and built-in preview explicitly bypasses the custom WAV',async()=>{
  for(const builtIn of [false,true]){
   const before=JSON.stringify(settings),button={dataset:{soundPreview:'accept',...(builtIn?{soundBuiltIn:'true'}:{})},disabled:false};
   const pending=listeners.click[0]({target:{closest:selector=>selector==='[data-sound-preview]'?button:null}});
   assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'accept',preset:'sc2-pylons',volume:30,...(builtIn?{builtIn:true}:{})}});
   finishRequest();await pending;assert.equal(JSON.stringify(settings),before);
  }
 });
 await check('Use default sound removes only that event override and legacy projections preserve the others',async()=>{
  listeners.change[0]({target:{dataset:{soundStyle:'accept',soundContext:'settings'},value:''}});
  assert.deepEqual(requests.at(-1).body.styles,{loading:'sc1-research'});finishRequest();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(settings.notificationSoundStyles)),{loading:'sc1-research'});
  context.legacyProjection={...options()};delete context.legacyProjection.styles;run('mergeLiveGamePreferences(legacyProjection,liveGameSoundRevision)');assert.deepEqual(options().styles,{loading:'sc1-research'});
  const count=requests.length;listeners.change[0]({target:{dataset:{soundStyle:'loaded'},value:'terran'}});assert.equal(requests.length,count);
 });
 await check('New sound selectors and disclosure text have Russian labels',()=>{
  for(const label of ['Game controls & sounds','Auto-accept','Sounds for each alert','Game sound','Use default sound','Built-in preview','StarCraft I · game voices','SC1 · Nuclear launch','English and Russian game voices · available offline.',
    'Custom WAV clips take priority. Remove a clip to use the selected game sound.','Choose a game recording for each alert, or use the default sound.',
    ...['Accept needed','Loading starts','Game loaded','Marked player'].flatMap(label=>['Game sound: '+label,'Built-in preview: '+label])])assert.ok(run(`RU_UI_TEXT[${JSON.stringify(label)}]`),label);
 });
 await check('A newly added recording saves and previews through the existing event override controls',async()=>{
  const original=new Set(['sc1-nuclear','sc1-research','sc1-upgrade','sc1-pylons','sc1-warp','sc1-evolution','sc2-nuclear','sc2-research','sc2-upgrade','sc2-pylons','sc2-warp','sc2-evolution']);
  const preset=JSON.parse(run('JSON.stringify(starcraftSoundLibrary.sounds)')).find(sound=>!original.has(sound.preset)).preset;
  const custom=run('JSON.stringify(liveCustomSounds)');
  listeners.change[0]({target:{dataset:{soundStyle:'loaded',soundContext:'settings'},value:preset}});
  assert.equal(requests.at(-1).body.styles.loaded,preset);assert.equal(requests.at(-1).body.styles.loading,'sc1-research');finishRequest();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(options().styles.loaded,preset);assert.equal(run('JSON.stringify(liveCustomSounds)'),custom);
  const before=JSON.stringify(settings),button={dataset:{soundPreview:'loaded'},disabled:false};
  const pending=listeners.click[0]({target:{closest:selector=>selector==='[data-sound-preview]'?button:null}});
  assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'loaded',preset,volume:30}});finishRequest();await pending;assert.equal(JSON.stringify(settings),before);
 });
 await check('Russian presets save and preview through existing controls and survive interface language changes',async()=>{
  const russian=JSON.parse(run('JSON.stringify(starcraftSoundLibrary.sounds)')).filter(sound=>sound.language==='ru');
  assert.ok(russian.length>0,'The library must include actual Russian recordings');
  const preset=russian[0].preset;assert.match(preset,/^sc2-ru-/);
  const custom=run('JSON.stringify(liveCustomSounds)'),preservedLoading=options().styles.loading;
  listeners.change[0]({target:{dataset:{livePreference:'preset'},type:'select-one',value:preset}});
  assert.equal(requests.at(-1).route,'lobby/preferences');assert.equal(requests.at(-1).body.preset,preset);
  finishRequest();await new Promise(resolve=>setImmediate(resolve));assert.equal(settings.notificationSoundPreset,preset);
  listeners.change[0]({target:{dataset:{soundStyle:'loaded',soundContext:'settings'},value:preset}});
  assert.equal(requests.at(-1).body.styles.loaded,preset);assert.equal(requests.at(-1).body.styles.loading,preservedLoading);
  finishRequest();await new Promise(resolve=>setImmediate(resolve));assert.equal(settings.notificationSoundStyles.loaded,preset);
  const count=requests.length,saved=options();
  for(const language of ['en','ru','en']){
   context.interfaceLanguage=language;settings.language=language;
   assert.equal(options().preset,preset);
   assert.ok(run('renderCustomSoundControls("settings")').includes(`value="${preset}" selected`));
   assert.deepEqual(options(),saved);assert.equal(requests.length,count);
  }
  assert.equal(run('JSON.stringify(liveCustomSounds)'),custom);
  for(const builtIn of [false,true]){
   const before=JSON.stringify(settings),button={dataset:{soundPreview:'loaded',...(builtIn?{soundBuiltIn:'true'}:{})},disabled:false};
   const pending=listeners.click[0]({target:{closest:selector=>selector==='[data-sound-preview]'?button:null}});
   assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'loaded',preset,volume:30,...(builtIn?{builtIn:true}:{})}});
   finishRequest();await pending;assert.equal(JSON.stringify(settings),before);
  }
 });
 const result={success:true,checks};fs.writeFileSync(path.join(__dirname,'lobby-sound-ui-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
