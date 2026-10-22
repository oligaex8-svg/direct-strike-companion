'use strict';
// Lightweight VM checks: no browser, local server, native audio or build required.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const web=path.join(__dirname,'..','wwwroot'),checks=[],requests=[],listeners={},stored=new Map();
const settings={language:'en',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:35,notificationSoundStyles:{accept:'sc1-research',loaded:'sc1-nuclear'},sound:false,pingOnMatchAccept:false,selfIds:['2-S2-1-99']};
let rejectRequest='',pauseRequest=null;
const document={activeElement:null,body:{},documentElement:{},contains:()=>false,querySelector:()=>null,getElementById:id=>id==='ui-language'?{addEventListener(){}}:null,addEventListener(kind,fn){(listeners[kind]??=[]).push(fn);}};
const context=vm.createContext({document,AbortController,setTimeout,clearTimeout,MutationObserver:class{observe(){}disconnect(){}},state:{library:{settings}},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),renderLibrary(){},refresh:async()=>{},toast(){},api:async(route,body)=>{requests.push({route,body:body===undefined?null:JSON.parse(JSON.stringify(body))});if(pauseRequest)await pauseRequest;if(rejectRequest)throw new Error(rejectRequest);return {};},fetch:async()=>({ok:true,json:async()=>({})})});
for(const file of ['sound-library.js','ru-ui.js','i18n.js','lobby.js','sounds-page.js'])vm.runInContext(fs.readFileSync(path.join(web,file),'utf8'),context,{filename:file});
const run=code=>vm.runInContext(code,context),plain=code=>JSON.parse(run('JSON.stringify('+code+')'));
async function check(name,fn){await fn();checks.push(name);}
async function clickLegacyPreview(dataset){
 const button={dataset,disabled:false},target={closest:selector=>selector==='[data-sound-preview]'?button:null};
 for(const listener of listeners.click)await listener({target});
 return button;
}
(async()=>{
 await check('Spoken-language membership is complete, disjoint and independent of interface language',()=>{
  assert.equal(run('soundsPageRecordings("en","","").length'),103);assert.equal(run('soundsPageRecordings("ru","","").length'),48);
  const english=plain('soundsPageRecordings("en","","").map(sound=>sound.preset)'),russian=plain('soundsPageRecordings("ru","","").map(sound=>sound.preset)');
  assert.equal(new Set([...english,...russian]).size,151);assert.equal(english.some(preset=>russian.includes(preset)),false);
  run('interfaceLanguage="ru"');assert.equal(run('soundsPageRecordings("en","","").length'),103);assert.equal(run('soundsPageText("Audio language")'),'Язык озвучки');
  run('interfaceLanguage="en"');
 });
 await check('Categories contain real recordings only and retain SC1/SC2 distinctions',()=>{
  assert.equal(run('starcraftSoundLibrary.categories.length'),13);
  for(const language of ['en','ru'])for(const category of plain(`soundsPageCategories("${language}")`)){
   assert.ok(run(`soundsPageRecordings("${language}","${category.key}","").length`)>0);
   context.category=category;assert.match(run('soundsPageCategoryName(category)'),/^SC[12] · /);
  }
 });
 await check('Language initializes from assigned audio and storage preference survives interface changes',()=>{
  run('soundsPageState.target="accept";state.library.settings.notificationSoundStyles.accept=starcraftSoundLibrary.sounds.find(sound=>sound.language==="ru").preset;initializeSoundsPage()');
  assert.equal(run('soundsPageState.language'),'ru');run('setSoundsPageFilter("language","en")');
  assert.equal(JSON.parse(stored.get('ds-companion:sounds-browser')).language,'en');
  run('soundsPageState.initialized=false;interfaceLanguage="ru";initializeSoundsPage()');assert.equal(run('soundsPageState.language'),'en');
  context.localStorage={getItem(){throw new Error('Disabled');},setItem(){throw new Error('Disabled');}};
  run('soundsPageState.initialized=false;initializeSoundsPage();setSoundsPageFilter("language","en")');assert.equal(run('soundsPageState.language'),'en');
 });
 await check('Filters and searches never save, enable an alert or change its assigned recording',()=>{
  const before=JSON.stringify(settings),count=requests.length;
  run('setSoundsPageFilter("language","en");setSoundsPageFilter("category","sc1-alerts");setSoundsPageFilter("search","NUCLEAR")');
  assert.ok(run('soundsPageRecordings().every(sound=>sound.category==="sc1-alerts"&&sound.en.toLowerCase().includes("nuclear"))'));
  run('setSoundsPageFilter("language","ru")');assert.equal(run('soundsPageState.category'),'');
  assert.equal(JSON.stringify(settings),before);assert.equal(requests.length,count);
  run('setSoundsPageFilter("search","unmatched recording 747")');assert.equal(run('soundsPageRecordings().length'),0);assert.ok(run('soundsPageRecording(soundsPageAssigned())'));
 });
 await check('Choosing a recording updates only the target override and preserves alert enablement and a custom WAV',async()=>{
  run('soundsPageState.target="accept";liveCustomSounds={accept:{name:"Personal.wav",seconds:1}};liveCustomSoundLoaded=true');
  const originalLoaded=settings.notificationSoundStyles.loaded;
  await run('assignSoundsPageRecording("sc1-upgrade")');assert.equal(settings.notificationSoundStyles.accept,'sc1-upgrade');assert.equal(settings.notificationSoundStyles.loaded,originalLoaded);
  assert.equal(settings.pingOnMatchAccept,false);assert.equal(settings.sound,false);assert.equal(run('liveCustomSounds.accept.name'),'Personal.wav');
  assert.equal(requests.at(-1).route,'lobby/preferences');
 });
 await check('Use default removes only the selected alert override and preserves the custom WAV',async()=>{
  await run('useSoundsPageDefault()');assert.equal(settings.notificationSoundStyles.accept,undefined);assert.equal(settings.notificationSoundStyles.loaded,'sc1-nuclear');
  assert.equal(run('liveCustomSounds.accept.name'),'Personal.wav');assert.equal(run('soundsPageAssigned()'),settings.notificationSoundPreset);
  run('soundsPageState.target="default"');const count=requests.length;await run('useSoundsPageDefault()');assert.equal(requests.length,count);
  await run('assignSoundsPageRecording("sc1-research")');assert.equal(settings.notificationSoundPreset,'sc1-research');assert.equal(settings.notificationSoundStyles.loaded,'sc1-nuclear');
 });
 await check('Recording previews explicitly bypass custom clips, use current volume, and never select or enable',async()=>{
  run('soundsPageState.target="accept"');const before=JSON.stringify(settings);
  await run('previewSoundsPageRecording("sc1-upgrade")');assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'accept',preset:'sc1-upgrade',volume:35,builtIn:true}});assert.equal(JSON.stringify(settings),before);
  const count=requests.length;await run('previewSoundsPageRecording("not-a-recording")');assert.equal(requests.length,count);
 });
 await check('The existing effective-preview handler keeps custom priority while default preview is built-in',async()=>{
  const before=JSON.stringify(settings);
  await clickLegacyPreview({soundPreview:'accept',soundContext:'sounds',soundGlobal:'false'});
  assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'accept',preset:'sc1-research',volume:35}});assert.equal(Object.hasOwn(requests.at(-1).body,'builtIn'),false);
  await clickLegacyPreview({soundPreview:'loaded',soundContext:'sounds',soundGlobal:'true',soundBuiltIn:'true'});
  assert.deepEqual(requests.at(-1),{route:'sounds/preview',body:{cue:'loaded',preset:'sc1-research',volume:35,builtIn:true}});assert.equal(JSON.stringify(settings),before);
 });
 await check('Pending previews and pending writes suppress duplicate actions; failures preserve saved choices',async()=>{
  let release;pauseRequest=new Promise(resolve=>{release=resolve;});const pending=run('previewSoundsPageRecording("sc1-upgrade")');const count=requests.length;
  await run('previewSoundsPageRecording("sc1-nuclear")');assert.equal(requests.length,count);release();await pending;pauseRequest=null;
  run('liveGameSoundSaving=true');await run('assignSoundsPageRecording("sc1-nuclear");useSoundsPageDefault();previewSoundsPageRecording("sc1-nuclear")');assert.equal(requests.length,count);run('liveGameSoundSaving=false');
  const before=JSON.stringify(settings);rejectRequest='Companion disconnected';await run('assignSoundsPageRecording("sc1-upgrade")');assert.equal(JSON.stringify(settings),before);assert.equal(run('liveGameSoundError'),'Companion disconnected');
  await run('previewSoundsPageRecording("sc1-upgrade")');assert.equal(run('soundsPageState.previewError'),'Companion disconnected');assert.equal(run('soundsPageState.previewing'),'');rejectRequest='';
 });
 console.log(JSON.stringify({success:true,checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
