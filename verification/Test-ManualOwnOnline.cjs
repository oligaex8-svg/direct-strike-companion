'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],failures=[];
const source=fs.readFileSync(path.join(root,'wwwroot/own-accounts.js'),'utf8');
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'wwwroot/index.html'),'utf8');
function harness(){
 const library={settings:{selfIds:['2-S2-1-99'],replayFolders:['keep-folder'],sound:true},matches:[
  {time:'2026-09-01',players:[{id:'2-S2-1-10',name:'OldNick'}]},
  {time:'2026-10-01',players:[{id:'2-S2-1-10',name:'CurrentNick'}]}
 ],ownAccountGroups:[{profiles:[
  {id:'2-S2-1-10',name:'CurrentNick',nameSource:'Imported replay',region:'EU',aliases:['LocalAlias','OldLocalAlias']},
  {id:'1-S2-1-20',name:'Mustang',region:'Americas',aliases:['EarlierMustang']},
  {id:'2-S2-1-21',name:'Mustang',region:'EU',aliases:[]}
 ]}]};
 const elements=new Map();
 for(const id of ['own-account-name','own-account-region','own-account-status','own-account-results','own-account-site-status','own-account-site-results','self-ids','own-account-find','settings-dialog','folders','player-note'])elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,listeners:{},attributes:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(name,value){this.attributes[name]=value;}});
 elements.get('self-ids').value=' 2-S2-1-99 \n1-S2-1-98\n';elements.get('folders').value='unsaved-folder';elements.get('player-note').value='unsaved-note';
 const calls=[],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({state:{library},$:id=>elements.get(id),esc,api:(endpoint,data)=>new Promise((resolve,reject)=>calls.push({endpoint,data,resolve,reject}))});
 const run=code=>vm.runInContext(code,context);
 run(source);
 run(app.split('\n').filter(line=>/^\$\('(own-account-find|own-account-name|own-account-region|own-account-results|self-ids)'\)\.addEventListener/.test(line)||/^\$\('settings-dialog'\)\.addEventListener\('close'/.test(line)).join('\n'));
 const element=id=>elements.get(id),fire=(id,type,event={})=>element(id).listeners[type](event);
 const query=(name,region='')=>{element('own-account-name').value=name;element('own-account-region').value=region;fire('own-account-name','input');};
 const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 return {library,elements,calls,run,element,fire,query,settle};
}
async function check(name,fn){try{await fn();checks.push(name);}catch(error){failures.push({check:name,message:error.message});}}
async function main(){
 await check('Typing stays local; Find and Enter send explicit online name/region searches',async()=>{
  const h=harness();h.query(' Mustang ','EU');assert.equal(h.calls.length,0);assert.match(h.element('own-account-results').innerHTML,/2-S2-1-21/);
  const pending=h.fire('own-account-find','click');assert.equal(h.calls.length,1);assert.equal(h.calls[0].endpoint,'rating/search');assert.equal(h.calls[0].data.id,'');assert.equal(h.calls[0].data.name,'Mustang');assert.equal(h.calls[0].data.region,'EU');
  assert.equal(h.element('own-account-find').disabled,true);assert.equal(h.element('own-account-site-status').attributes['aria-busy'],'true');assert.match(h.element('own-account-site-status').textContent,/Searching/);
  h.fire('own-account-find','click');assert.equal(h.calls.length,1,'same pending query must not duplicate requests');h.calls[0].resolve([]);await pending;
  assert.equal(h.element('own-account-find').disabled,false);assert.equal(h.element('own-account-site-status').attributes['aria-busy'],'false');
  let prevented=false;h.fire('own-account-name','keydown',{key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.calls.length,2);h.calls[1].resolve([]);await h.settle();
  h.fire('own-account-name','keydown',{key:'a',preventDefault(){throw Error('ordinary key prevented');}});assert.equal(h.calls.length,2);
 });
 await check('Fresh local shortcuts, replay aliases and folder aliases share stable identities without duplication',()=>{
  const h=harness();assert.equal(h.run('manualOwnMatches(state.library,"Mustang").length'),2);assert.equal(h.run('manualOwnMatches(state.library,"EarlierMustang","Americas")[0].id'),'1-S2-1-20');
  for(const alias of ['OldNick','LocalAlias','OldLocalAlias','CurrentNick']){assert.equal(h.run(`manualOwnMatches(state.library,${JSON.stringify(alias)})[0].id`),'2-S2-1-10');assert.equal(h.run(`manualOwnMatches(state.library,${JSON.stringify(alias)})[0].name`),'CurrentNick');}
  assert.equal(h.run('manualOwnProfiles(state.library).length'),3);assert.equal(h.run('manualOwnMatches(state.library,"Must").length'),0);
 });
 await check('Newer server-projected shortcut nickname replaces old replay display name while both aliases retain the native identity',()=>{
  const h=harness();h.library.matches=[{time:'2026-09-01',players:[{id:'2-S2-1-10',name:'OldNick'}]}];
  h.library.ownAccountGroups=[{profiles:[{id:'2-S2-1-10',name:'NewNick',nameSource:'SC2 profile shortcut',region:'EU',aliases:[]}]}];
  for(const name of ['OldNick','NewNick']){
   h.query(name,'EU');const matches=JSON.parse(h.run(`JSON.stringify(manualOwnMatches(state.library,${JSON.stringify(name)},"EU"))`));
   assert.equal(matches.length,1);assert.equal(matches[0].name,'NewNick');assert.equal(matches[0].source,'Local SC2 account');assert.equal(matches[0].id,'2-S2-1-10');assert.equal(matches[0].region,'EU');
   assert.match(h.element('own-account-results').innerHTML,/<strong data-i18n-skip>NewNick<\/strong>/);assert.match(h.element('own-account-results').innerHTML,/Local SC2 account/);
  }
  assert.equal(h.run('manualOwnProfiles(state.library).length'),1);assert.equal(h.calls.length,0);
 });
 await check('Site-only results cannot add identity, stats or ratings; every unsaved draft and saved setting survives',async()=>{
  const h=harness(),before=JSON.stringify(h.library),draft=h.element('self-ids').value;h.query('SiteOnly');const p=h.fire('own-account-find','click');h.calls[0].resolve([{profileId:'730',name:'SiteOnly',region:'eu',rating:9000,games:123,url:'javascript:alert(1)'}]);await p;
  const rendered=h.element('own-account-site-results').innerHTML;assert.match(rendered,/https:\/\/ds-rating.com\/player\/730/);assert.match(rendered,/Site profile ID/);assert.match(rendered,/target="_blank" rel="noreferrer"/);assert.doesNotMatch(rendered,/data-own-account|<button|9000|123|javascript:/);
  h.run('selectManualOwnAccount("730")');assert.equal(h.element('self-ids').value,draft);assert.equal(JSON.stringify(h.library),before);assert.equal(h.element('folders').value,'unsaved-folder');assert.equal(h.element('player-note').value,'unsaved-note');assert.equal(h.element('own-account-results').innerHTML,'');
 });
 await check('Same-name site profiles remain distinct; native region filtering and profile-ID deduplication apply',async()=>{
  const candidates=[{profileId:'10',name:'Mustang',region:'EU'},{profileId:'11',name:'Mustang',region:'na'},{profileId:'10',name:'Duplicate',region:'eu'},{profileId:'12',name:'Mustang',region:'Korea'}];
  for(const [region,expected] of [['', ['10','11']],['EU',['10']],['Americas',['11']]]){
   const h=harness();h.query('Mustang',region);const p=h.fire('own-account-find','click');h.calls[0].resolve(candidates);await p;
   const rendered=h.element('own-account-site-results').innerHTML;for(const id of ['10','11','12'])assert.equal(rendered.includes('/player/'+id+'"'),expected.includes(id));assert.equal((rendered.match(/<li>/g)||[]).length,expected.length);assert.doesNotMatch(rendered,/Duplicate/);
  }
 });
 await check('Untrusted names are escaped; malformed IDs, names, regions and rows never become links',async()=>{
  const h=harness();h.query('Mustang');const p=h.fire('own-account-find','click');h.calls[0].resolve([
   {profileId:'40',name:'<img src=x onerror="alert(1)">&\'Mustang',region:'EU'},
   ...['0','-1','1.5','1e3',' 41','41" onclick="alert(1)','https://bad','2-S2-1-40'].map(profileId=>({profileId,name:'Bad',region:'EU'})),
   {profileId:'42',name:'',region:'EU'},{profileId:'43',name:'Name',region:'unknown'},null,{profileId:'44',name:42,region:'EU'}
  ]);await p;const rendered=h.element('own-account-site-results').innerHTML;assert.match(rendered,/&lt;img/);assert.doesNotMatch(rendered,/<img|onclick=|\/player\/(?!40")/);assert.equal((rendered.match(/<li>/g)||[]).length,1);assert.match(h.element('own-account-site-status').textContent,/Site profiles found/);
 });
 await check('Offline and empty searches retain local selection and distinguish recoverable results',async()=>{
  const h=harness();h.query('Mustang','EU');let p=h.fire('own-account-find','click');h.calls[0].reject(Error('offline'));await p;assert.match(h.element('own-account-site-status').textContent,/Online search failed/);assert.match(h.element('own-account-results').innerHTML,/Use this account/);assert.equal(h.element('own-account-find').disabled,false);
  h.run('selectManualOwnAccount("2-S2-1-21")');assert.match(h.element('self-ids').value,/2-S2-1-21/);assert.deepEqual(h.library.settings.selfIds,['2-S2-1-99']);p=h.fire('own-account-find','click');h.calls[1].resolve([]);await p;assert.match(h.element('own-account-site-status').textContent,/No site profile found/);
 });
 await check('Empty, overlong and unsupported queries make no network calls; exact SC2 ID stays local',async()=>{
  const h=harness();for(const [name,region,message] of [['','',/1 to 32/],['x'.repeat(33),'EU',/1 to 32/],['Mustang','Korea',/supports EU and Americas/]]){h.query(name,region);await h.fire('own-account-find','click');assert.equal(h.calls.length,0);assert.match(h.element('own-account-site-status').textContent,message);assert.equal(h.element('own-account-find').disabled,false);}
  h.query('2-S2-1-10','EU');await h.fire('own-account-find','click');assert.equal(h.calls.length,0);assert.match(h.element('own-account-results').innerHTML,/CurrentNick/);
 });
 await check('Older responses cannot replace newer name or native-region searches',async()=>{
  for(const change of ['name','region']){const h=harness();h.query('Mustang','EU');const old=h.fire('own-account-find','click');if(change==='name')h.query('NewName','EU');else{h.element('own-account-region').value='Americas';h.fire('own-account-region','change');}assert.equal(h.element('own-account-find').disabled,false);const fresh=h.fire('own-account-find','click');h.calls[1].resolve([{profileId:'51',name:'Fresh',region:change==='name'?'EU':'Americas'}]);await fresh;h.calls[0].resolve([{profileId:'50',name:'Stale',region:'EU'}]);await old;assert.match(h.element('own-account-site-results').innerHTML,/Fresh/);assert.doesNotMatch(h.element('own-account-site-results').innerHTML,/Stale/);}
 });
 await check('Name cycle and dialog close/reopen invalidate same-name in-flight results',async()=>{
  for(const cycle of ['name','close']){const h=harness();h.query('Mustang','EU');const old=h.fire('own-account-find','click');if(cycle==='name'){h.query('Other','EU');h.query('Mustang','EU');}else{h.fire('settings-dialog','close');h.query('Mustang','EU');}const fresh=h.fire('own-account-find','click');h.calls[0].resolve([{profileId:'60',name:'Stale',region:'EU'}]);await old;assert.equal(h.element('own-account-site-results').innerHTML,'');assert.equal(h.element('own-account-find').disabled,true);h.calls[1].resolve([{profileId:'61',name:'Fresh',region:'EU'}]);await fresh;assert.match(h.element('own-account-site-results').innerHTML,/Fresh/);}
 });
 await check('Site lookup has accessible live status and all new static/runtime labels have Russian translations',()=>{
  assert.match(html,/id="own-account-site-status"[^>]*role="status"[^>]*aria-live="polite"/);assert.match(html,/id="own-account-site-results"/);
  const h=harness();h.run(fs.readFileSync(path.join(root,'wwwroot/ru-ui.js'),'utf8'));
  const labels=['Enter your SC2 name or account ID.','No local account found. Click Find account to search ds-rating.com, or import a replay to connect your SC2 account.','Several local accounts match. Check the region and account ID, then choose yours.','Local SC2 account','Imported replay','Find account checks local SC2 names and ds-rating.com. Only a local SC2 identity can be added to your account IDs.','Searching ds-rating.com…','Site profiles found. Their site IDs are not SC2 account IDs. Import one of your replays to connect your account.','No site profile found for this name and region. Import a replay to connect your SC2 account.','Online search failed. Try Find account again; local account results still work.','Online account search supports EU and Americas. Local account search works in every region.','Enter a player name from 1 to 32 characters.','Searching…','Site profile ID','Inspect profile'];
  for(const text of labels)assert.ok(h.run(`RU_UI_TEXT[${JSON.stringify(text)}]`),text);
 });
 const result={success:failures.length===0,checks,failures,limitations:['Mock API and DOM exercise actual lookup functions and app handlers; live ds-rating service, browser layout and persisted Save settings were not exercised.']};fs.writeFileSync(path.join(__dirname,'manual-own-online-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
