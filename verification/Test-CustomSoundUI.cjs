'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],requests=[],messages=[],listeners={};
let getResolve,getReject,nextResponse={ok:true,value:{}},fetchGate=null;
const settings={sound:false,notificationSoundPreset:'protoss',notificationSoundVolume:35,selfIds:['2-S2-1-99']};
const context=vm.createContext({AbortController,setTimeout,clearTimeout,document:{addEventListener(kind,fn){(listeners[kind]??=[]).push(fn);},getElementById(){return null;}},state:{library:{settings}},esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),renderLibrary(){},refresh:async()=>{},toast:s=>messages.push(s),api:async route=>{assert.equal(route,'sounds/custom');return new Promise((resolve,reject)=>{getResolve=resolve;getReject=reject;});},fetch:async(url,options)=>{requests.push({url,options});if(fetchGate)await fetchGate;const response=nextResponse;return {ok:response.ok,json:async()=>response.value};}});
for(const file of ['sound-library.js','lobby.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=s=>vm.runInContext(s,context),plain=s=>JSON.parse(run(`JSON.stringify(${s})`));
const clip=(name='Ready.wav',size=100)=>({name,size,arrayBuffer:async()=>new ArrayBuffer(size)});
async function check(name,fn){await fn();checks.push(name);}
(async()=>{
 await check('Malformed metadata is excluded and filenames are escaped without exposing paths',()=>{
  context.info={accept:{name:'<alert>.wav',seconds:1.2},loading:{name:'long.wav',seconds:99},loaded:{name:'zero.wav',seconds:0},unknown:{name:'ignored.wav',seconds:1}};
  run('liveCustomSounds=normalizeCustomSoundInfo(info);liveCustomSoundLoaded=true');assert.deepEqual(Object.keys(plain('liveCustomSounds')),['accept']);
  const html=run('renderCustomSoundControls()');assert.match(html,/&lt;alert&gt;\.wav/);assert.doesNotMatch(html,/<alert>/);assert.match(html,/data-sound-remove="accept"/);
 });
 await check('Valid uploads use bounded raw bytes and a URI-encoded display name, leaving all preferences intact',async()=>{
  const before=JSON.stringify(settings);context.file=clip('Battle #1.wav');nextResponse={ok:true,value:{accept:{name:'Battle #1.wav',seconds:1.5}}};
  await run('saveCustomNotificationSound("accept",file)');const request=requests.at(-1);
  assert.equal(request.url,'/api/sounds/custom/accept?name=Battle%20%231.wav');assert.equal(request.options.method,'POST');assert.equal(request.options.headers['X-DS-Companion'],'1');assert.equal(request.options.headers['Content-Type'],'audio/wav');assert.equal(request.options.body.byteLength,100);
  assert.deepEqual(plain('liveCustomSounds'),nextResponse.value);assert.equal(JSON.stringify(settings),before);assert.equal(run('liveCustomSoundBusy'),'');
 });
 await check('Invalid extensions and oversized files fail before a request, preserving the prior clip',async()=>{
  const count=requests.length,before=plain('liveCustomSounds');for(const file of [clip('oops.mp3'),clip('large.wav',2097153),clip('tiny.wav',10)]){context.file=file;await run('saveCustomNotificationSound("accept",file)');assert.equal(requests.length,count);assert.match(run('liveCustomSoundError'),/Choose a WAV/);assert.deepEqual(plain('liveCustomSounds'),before);}
 });
 await check('Server validation failure is visible and keeps the saved assignment',async()=>{
  const before=plain('liveCustomSounds');context.file=clip();nextResponse={ok:false,value:{error:'WAV is longer than 5 seconds.'}};await run('saveCustomNotificationSound("accept",file)');assert.deepEqual(plain('liveCustomSounds'),before);assert.match(run('renderCustomSoundControls()'),/WAV is longer than 5 seconds/);assert.equal(run('liveCustomSoundBusy'),'');
 });
 await check('Removing an assignment restores built-in and never sends a filesystem path',async()=>{
  nextResponse={ok:true,value:{}};await run('saveCustomNotificationSound("accept",null)');assert.equal(requests.at(-1).url,'/api/sounds/custom/accept');assert.equal(requests.at(-1).options.method,'DELETE');assert.equal(requests.at(-1).options.body,undefined);assert.deepEqual(plain('liveCustomSounds'),{});assert.ok(messages.includes('Built-in sound restored.'));
 });
 await check('An old metadata request cannot replace a newer saved clip, and duplicate writes are suppressed',async()=>{
  const pendingRead=run('requestCustomNotificationSounds(true)');let release;fetchGate=new Promise(resolve=>{release=resolve;});context.file=clip();nextResponse={ok:true,value:{loaded:{name:'Ready.wav',seconds:1}}};const write=run('saveCustomNotificationSound("loaded",file)');await new Promise(resolve=>setImmediate(resolve));
  const count=requests.length;await run('saveCustomNotificationSound("marked",file)');assert.equal(requests.length,count);
  getResolve({accept:{name:'Old.wav',seconds:1}});await pendingRead;assert.equal(run('liveCustomSounds.accept'),undefined);release();await write;fetchGate=null;assert.deepEqual(plain('liveCustomSounds'),nextResponse.value);
 });
 await check('Failed inventory refresh shows retry and a later retry clears its error',async()=>{
  const pending=run('requestCustomNotificationSounds(true)');getReject(new Error('Companion disconnected'));await pending;assert.match(run('renderCustomSoundControls()'),/data-sounds-retry/);
  const retry=run('requestCustomNotificationSounds(true)');getResolve({marked:{name:'Alert.wav',seconds:2}});await retry;assert.equal(run('liveCustomSoundError'),'');assert.deepEqual(plain('liveCustomSounds'),{marked:{name:'Alert.wav',seconds:2}});
 });
 await check('Focus stays in the correct custom panel and removal falls back to that panel’s Choose clip button',()=>{
  const controls=[];const element=(attribute,value,context,scope)=>{const node={dataset:{soundContext:context,...(attribute==='data-sound-import'?{soundImport:value}:{})},hasAttribute:key=>key===attribute,getAttribute:key=>key===attribute?value:null,matches:()=>false,closest:()=>scope?{dataset:{lobbyDetailsId:scope}}:null,focus(){contextDoc.activeElement=node;}};controls.push(node);return node;};
  const contextDoc={contains:node=>controls.includes(node),querySelectorAll:selector=>controls.filter(node=>node.hasAttribute(selector.slice(1,-1)))};
  const mainPreview=element('data-sound-preview','loaded','live',''),rowPreview=element('data-sound-preview','loaded','live','custom-sounds:live');
  contextDoc.activeElement=rowPreview;context.document=contextDoc;const remembered=run('notificationSoundFocus(document)');context.remembered=remembered;contextDoc.activeElement=mainPreview;run('restoreNotificationSoundFocus(document,remembered)');assert.equal(contextDoc.activeElement,rowPreview);
  const liveImport=element('data-sound-import','accept','live','custom-sounds:live'),settingsImport=element('data-sound-import','accept','settings','custom-sounds:settings'),settingsRemove=element('data-sound-remove','accept','settings','custom-sounds:settings');
  contextDoc.activeElement=settingsRemove;context.remembered=run('notificationSoundFocus(document)');controls.splice(controls.indexOf(settingsRemove),1);contextDoc.activeElement=liveImport;run('restoreNotificationSoundFocus(document,remembered)');assert.equal(contextDoc.activeElement,settingsImport);
  const liveStyle=element('data-sound-style','loading','live','custom-sounds:live'),settingsStyle=element('data-sound-style','loading','settings','custom-sounds:settings');
  contextDoc.activeElement=settingsStyle;context.remembered=run('notificationSoundFocus(document)');contextDoc.activeElement=liveStyle;run('restoreNotificationSoundFocus(document,remembered)');assert.equal(contextDoc.activeElement,settingsStyle);
 });
 const result={success:true,checks};fs.writeFileSync(path.join(__dirname,'custom-sound-ui-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
