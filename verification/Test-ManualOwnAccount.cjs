'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const ids=['2-S2-1-10','1-S2-1-11','2-S2-1-12'];
const library={settings:{selfIds:['2-S2-1-99']},matches:[
 {time:'2026-09-01',players:[{id:ids[0],name:'OldNick'}]},
 {time:'2026-10-01',players:[{id:ids[0],name:'SameNick'},{id:ids[1],name:'SameNick'},{id:ids[2],name:'SameNick'},{id:'name:SameNick',name:'SameNick'}]}
]};
const elements=new Map();
for(const id of ['own-account-name','own-account-region','own-account-status','own-account-results','self-ids','own-account-find'])elements.set(id,{value:'',textContent:'',innerHTML:'',listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}});
const context=vm.createContext({state:{library},$:id=>elements.get(id),api:async()=>[],esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),ids});
for(const file of ['player-names.js','own-accounts.js','ru-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=code=>vm.runInContext(code,context),check=(name,fn)=>{fn();checks.push(name);};
check('Case-insensitive exact aliases resolve stable ID and latest canonical name',()=>{assert.equal(run('manualOwnMatches(state.library," oldnick ")[0].id'),ids[0]);assert.equal(run('manualOwnMatches(state.library,"oldnick")[0].name'),'SameNick');assert.equal(run('manualOwnMatches(state.library,"Same").length'),0);});
check('Duplicate names retain separate IDs; region filters without collapsing ambiguous accounts',()=>{assert.equal(run('manualOwnMatches(state.library,"SameNick").length'),3);assert.equal(run('manualOwnMatches(state.library,"SameNick","EU").length'),2);assert.equal(run('manualOwnMatches(state.library,"SameNick","Americas")[0].id'),ids[1]);});
check('Unknown and empty names create no fabricated matches',()=>{assert.equal(run('manualOwnMatches(state.library,"unknown").length'),0);assert.equal(run('manualOwnMatches(state.library,"").length'),0);});
check('Selecting an account preserves all draft IDs and never mutates saved settings',()=>{
 elements.get('self-ids').value=' 2-S2-1-99 \n1-S2-1-98\n';elements.get('own-account-name').value='OldNick';
 run('renderManualOwnLookup()');assert.match(elements.get('own-account-results').innerHTML,/Use this account/);
 run('selectManualOwnAccount(ids[0])');assert.equal(elements.get('self-ids').value,' 2-S2-1-99 \n1-S2-1-98\n'+ids[0]);assert.deepEqual(library.settings.selfIds,['2-S2-1-99']);assert.match(elements.get('own-account-status').textContent,/Save settings/);
 const draft=elements.get('self-ids').value;run('selectManualOwnAccount(ids[0])');assert.equal(elements.get('self-ids').value,draft);run('selectManualOwnAccount("name:OldNick")');assert.equal(elements.get('self-ids').value,draft);
});
check('Unknown lookup gives online/import guidance and no account selection',()=>{elements.get('own-account-name').value='Unknown';run('renderManualOwnLookup()');assert.equal(elements.get('own-account-results').innerHTML,'');assert.match(elements.get('own-account-status').textContent,/Find account.*import a replay/);});
check('Ambiguous lookup requires explicit candidate choice and exposes stable identity',()=>{elements.get('own-account-name').value='SameNick';run('renderManualOwnLookup()');assert.match(elements.get('own-account-status').textContent,/Several local accounts/);for(const id of ids)assert.ok(elements.get('own-account-results').innerHTML.includes(id));assert.match(elements.get('own-account-results').innerHTML,/aria-describedby="own-account-candidate-1"/);assert.match(elements.get('own-account-results').innerHTML,/data-i18n-skip/);assert.ok(!/<button(?![^>]*type="button")/.test(elements.get('own-account-results').innerHTML));});
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
vm.runInContext(app.split('\n').filter(line=>/^\$\('(own-account-find|own-account-name|own-account-region|own-account-results|self-ids)'\)\.addEventListener/.test(line)).join('\n'),context);
check('Enter in name lookup prevents submitting the settings form',()=>{let prevented=false;elements.get('own-account-name').listeners.keydown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,true);});
check('Delegated selection handler adds only a selected enabled candidate',()=>{elements.get('own-account-results').listeners.click({target:{closest(){return{disabled:false,dataset:{ownAccount:ids[1]}};}}});assert.ok(elements.get('self-ids').value.includes(ids[1]));});
check('Accessible labels and status plus non-submitting lookup button are present',()=>{const html=fs.readFileSync(path.join(root,'wwwroot/index.html'),'utf8');for(const id of ['own-account-name','own-account-region'])assert.ok(html.includes('for="'+id+'"'));assert.match(html,/<button type="button"[^>]*id="own-account-find"/);assert.match(html,/id="own-account-status"[^>]*role="status"[^>]*aria-live="polite"/);assert.match(app,/selfIds:lines\('self-ids'\)/);});
check('Every new manual account UI label has a Russian translation',()=>{for(const text of ['Connect your account by name','Your player name','Region','All regions','Find account','Use this account','Added to account IDs','Account added. Save settings to apply.','Enter your player name as it appears in a replay.','Several replay accounts match. Check the region and account ID, then choose yours.','Check the region and account ID, then choose your account.','No replay account found. Add your replay folder above, save settings, then Scan replays and try again.','Find your account in imported replays. Selecting it declares it as yours on this PC.'])assert.ok(run('RU_UI_TEXT['+JSON.stringify(text)+']'),text);});
const result={success:true,checks,limitations:['Browser layout and live replay import not exercised; selection/save tested through local handlers and existing form wiring.']};fs.writeFileSync(path.join(__dirname,'manual-own-account-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
