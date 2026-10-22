'use strict';
// Run serially through Run-ImportRecoveryRelease.ps1 -Stage LobbyQuickLists.
// Actual lobby rendering, delegated click handler and quick-list helper; HTTP fixtures never touch private data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),reportPath=path.join(__dirname,'lobby-quick-lists.json');
const report={success:false,fixture:'Real replays.js click handler and quickPlayerList; real lobby.js render and polling; offline durable HTTP marks',cases:[],screenshots:[]};
const self='2-S2-1-100',native='2-S2-1-200',candidateA='2-S2-1-300',candidateB='1-S2-1-400';
const names={self:'TKnight',native:'<Current> Opponent',unknown:'[Clan] Новичок',site:'<Expend> Pangu',ambiguous:'[Tag] Shared nickname',saved:'[Saved] Returning'};
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function button(page,id,list){return page.locator(`[data-quick-player-id=${JSON.stringify(id)}][data-quick-player-list=${JSON.stringify(list)}]`).first();}
async function anchor(details){return details.evaluate(node=>{
 const profile=node.parentElement,row=profile.querySelector(':scope > .live-row'),base=profile.getBoundingClientRect();
 const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height,right:r.right-base.x,bottom:r.bottom-base.y};};
 const summary=rect(node.querySelector(':scope > summary'));
 const occupied=[...row.querySelectorAll('button,h3,.live-name-status,.live-row-ratings>span,.live-history-label,.live-history-empty')].filter(n=>n.getClientRects().length).map(rect);
 return {summary,occupied,row:rect(row),width:base.width,scroll:profile.scrollWidth,client:profile.clientWidth,open:node.open};
});}
function checkAnchor(actual,baseline,label){
 for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual.summary[key]-baseline.summary[key])<.7,`${label}: anchored summary ${key}`);
 assert.ok(Math.abs(actual.summary.right-actual.width)<.7,`${label}: summary at row right`);
 assert.ok(actual.summary.y<40,`${label}: summary at row top`);
 for(const item of actual.occupied)assert.ok(!(Math.min(actual.summary.right,item.right)-Math.max(actual.summary.x,item.x)>.7&&Math.min(actual.summary.bottom,item.bottom)-Math.max(actual.summary.y,item.y)>.7),`${label}: Details overlaps row content`);
 for(let i=0;i<actual.occupied.length;i++)for(let j=i+1;j<actual.occupied.length;j++){
  const a=actual.occupied[i],b=actual.occupied[j];
  assert.ok(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>.7&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.7),`${label}: row content overlaps`);
 }
 assert.ok(actual.scroll<=actual.client+1,`${label}: row fits horizontally`);
}
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const width of [1440,375]){
   const page=await browser.newPage({viewport:{width,height:1050},reducedMotion:'reduce'}),errors=[],requests=[];
   const durable=new Map([[native,{id:native,name:'Opponent',list:'losers',note:'Latest durable private note'}],['name:<old>returning',{id:'name:<old>returning',name:'<Old> Returning',list:'friends',note:'Existing name-only private note'}]]);
   let hold=false,releaseResponse,responseHeld,failNext=false;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname).replace(/^\//,'');
    if(url.hostname!=='fixture.invalid')return route.abort();
    if(url.pathname==='/api/mark/list'){
     const payload=route.request().postDataJSON();requests.push(payload);
     if(hold)await new Promise(resolve=>{releaseResponse=resolve;responseHeld();});
     if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Offline fixture'})});}
     const previous=durable.get(payload.id),saved={...previous,...payload,note:previous?.note||'',updated:'2026-10-10T12:00:00Z'};durable.set(payload.id,saved);
     return route.fulfill({contentType:'application/json',body:JSON.stringify(saved)});
    }
    if(url.pathname==='/api/state')return route.fulfill({contentType:'application/json',body:JSON.stringify({marks:[...durable.values()]})});
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div class="app"><aside class="sidebar">Direct Strike Companion</aside><main id="content" data-view="lobby" style="min-width:0"></main></div><dialog id="match-dialog"></dialog><dialog id="detail-dialog"></dialog></body></html>'});
    const file=path.resolve(root,'wwwroot',relative);
    if(file.startsWith(path.join(root,'wwwroot')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:relative.endsWith('.png')?'image/png':'text/plain'});
    return route.abort();
   });
   await page.goto('https://fixture.invalid/');
   for(const file of ['style.css','combat.css','lobby.css','player-lists.css','own-accounts.css','replays.css','profile.css','picks.css','picks-hover.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(({self,native,candidateA,candidateB,names})=>{
    window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    window.num=n=>n==null?'—':String(Math.round(n));window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=()=> '10 Oct';window.time=()=> '12:00';
    window.fixturePlayers=new Map([self,native,candidateA,candidateB].map((id,index)=>[id,{id,name:['TKnight','Old nickname','Shared nickname','Shared nickname'][index],against:{games:12,winRate:67},together:{games:10,wins:6,losses:4,winRate:60}}]));
    window.state={library:{settings:{language:'en',selfIds:[self],autoDetectSelf:true,sound:false},matches:[],marks:[{id:native,name:'Old nickname',list:'losers',note:'Stale snapshot note'},{id:'name:<old>returning',name:'<Old> Returning',list:'friends',note:'Existing name-only private note'}],ratings:{},siteHistories:{501:{status:'Cached regional profile'}},ownAccountGroups:[{key:'local-100',canAutoLink:true,profiles:[{id:self,name:'TKnight',region:'EU',nameSource:'SC2 local folder'}],warnings:[],evidence:'Local folders agree'}]},lobby:{region:'EU',source:'manual',phase:'pregame',rosterUpdatedAt:'2026-10-10T12:00:00Z',rosterEntries:[{name:names.self,team:1,candidates:[{id:self}]},{name:names.native,team:1,candidates:[{id:native}]},{name:names.unknown,team:1,candidates:[]},{name:names.site,team:2,candidates:[]},{name:names.ambiguous,team:2,candidates:[{id:candidateA},{id:candidateB}]},{name:names.saved,team:2,candidates:[{id:'name:<old>returning',name:'Returning',nameOnly:true}]}]}};
    window.findPlayer=id=>{const player=fixturePlayers.get(id),mark=state.library.marks.find(mark=>mark.id===id);return player?{...player,mark}:mark?{id,name:mark.name,mark}:null;};
    window.regionRating=()=>({value:2345});window.siteRating=()=>({value:2345});window.siteRatingStatus=()=> 'Cached regional profile';
    window.siteIdentityKey=p=>'site:'+p.region+':'+p.profileId;
    window.siteLobbyUnknown=()=>'<p class="live-guidance">Battle.net identity unavailable · confirm the name in SC2</p>';
    window.siteHistoryRows=ids=>ids.flatMap(id=>[0,1,2].map(n=>({match:{hash:id+'-'+n,time:'2026-10-10T12:00:00Z'},player:{id,commander:['Raynor','Kerrigan','Artanis'][n]},outcome:n!==1})));
    window.siteHistorySource=()=> 'Imported replays';window.playerOutcome=(_match,player)=>player.commander!=='Kerrigan';
    window.listBadge=()=>'';window.renderLikelyPicks=()=>'<p class="live-guidance">More history needed</p>';
    window.automationCommanderOptions=()=>'<option value="">Off</option>';window.automaticDataError='';window.fixtureToasts=[];window.toast=message=>fixtureToasts.push(message);
    window.api=async(url,data)=>{const response=await fetch('/api/'+url,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const result=await response.json();if(!response.ok)throw Error(result.error);return result;};
    window.renderLibrary=()=>updateLiveLobby(document.getElementById('content'));
    window.refresh=async()=>{const result=await api('state');state.library.marks=result.marks;renderLibrary();};
   },{self,native,candidateA,candidateB,names});
   for(const file of ['sound-library.js','player-names.js','site-data.js','commanders.js','own-accounts.js','picks.js','replays.js','lobby.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(names=>{siteLookupForName=name=>({profiles:name===names.site?[{profileId:501,name:'Pangu',region:'EU',rating:2345}]:[]});liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();renderLibrary();},names);
   await settle(page);
   const result={width,checks:[]};report.cases.push(result);
   assert.equal(await page.locator('[data-lobby-entry="TKnight"] [data-quick-player-list]').count(),0,'known self has no mark buttons');
   assert.equal(await page.locator('.live-slot > .live-profile > .live-row .live-quick-lists').count(),5,'every visible non-self row has direct actions');
   assert.equal(await page.locator('[data-quick-player-list="blocked"]').count(),0,'no Blocked action');
   assert.equal(await button(page,'name:<old>returning','friends').getAttribute('aria-pressed'),'true','existing name-only mark selected despite observed clan');
   result.checks.push('Visible non-self actions, no self/Blocked actions, existing name-only selection');
   const details=page.locator(`[data-lobby-details-id=${JSON.stringify('profile:'+native+':'+names.native)}]`),baseline=await anchor(details);checkAnchor(baseline,baseline,String(width));
   hold=true;const heldResponse=new Promise(resolve=>{responseHeld=resolve;}),pendingRequest=page.waitForRequest('**/api/mark/list');await button(page,native,'friends').click();await pendingRequest;await heldResponse;
   assert.equal(await button(page,native,'friends').getAttribute('aria-pressed'),'true','selected immediately before server acknowledgement');
   assert.equal(await button(page,native,'friends').isDisabled(),true,'pending action disabled');
   await page.evaluate(({native})=>{document.querySelector(`[data-quick-player-id="${native}"][data-quick-player-list="friends"]`).click();void quickPlayerList(native,'losers','Opponent');state.lobby.detectionStatus='Pending refresh';updateLiveLobby(document.getElementById('content'));},{native});
   assert.equal(await button(page,native,'friends').getAttribute('aria-pressed'),'true','poll retains pending selection');
   assert.equal(requests.length,1,'repeated and competing clicks cannot duplicate a pending request');
   assert.deepEqual(requests[0],{id:native,name:'Opponent',list:'friends'},'native account uses native ID and current observed name without clan');
   assert.ok(releaseResponse,'HTTP request is held');hold=false;releaseResponse();
   await page.waitForFunction(id=>!quickPlayerListPending.has(id),native);
   assert.equal(durable.get(native).note,'Latest durable private note','list-only payload preserves latest server note');
   assert.equal(await page.evaluate(id=>state.library.marks.find(mark=>mark.id===id).note,native),'Latest durable private note','client receives durable note');
   const count=requests.length;await button(page,native,'friends').click();assert.equal(requests.length,count,'selected list does not request again');
   result.checks.push('Native ID/current name, immediate selection, pending polling, request deduplication, durable notes');
   for(const [id,list,expectedName] of [['name:новичок','losers','Новичок'],['name:pangu','friends','Pangu'],['name:shared nickname','losers','Shared nickname']]){
    await button(page,id,list).click();await page.waitForFunction(id=>!quickPlayerListPending.has(id),id);
    assert.equal(await button(page,id,list).getAttribute('aria-pressed'),'true');assert.deepEqual(requests.at(-1),{id,name:expectedName,list});
   }
   assert.equal(durable.has('site:EU:501'),false,'site ID never becomes a saved player ID');
   assert.equal(durable.has(candidateA)||durable.has(candidateB),false,'ambiguity never marks a possible native account');
   result.checks.push('Unknown Unicode, site-only and ambiguous rows save clan-stripped names with safe name keys');
   failNext=true;hold=true;const heldFailure=new Promise(resolve=>{responseHeld=resolve;}),failureRequest=page.waitForRequest('**/api/mark/list');await button(page,'name:новичок','friends').click();await failureRequest;await heldFailure;
   assert.equal(await button(page,'name:новичок','friends').getAttribute('aria-pressed'),'true','failure test observes optimistic selection');
   assert.ok(releaseResponse);hold=false;releaseResponse();await page.waitForFunction(()=>!quickPlayerListPending.has('name:новичок'));
   assert.equal(await button(page,'name:новичок','friends').getAttribute('aria-pressed'),'false','rejection restores unselected button');
   assert.equal(await button(page,'name:новичок','losers').getAttribute('aria-pressed'),'true','rejection restores saved selection');
   assert.equal(await button(page,'name:новичок','friends').isDisabled(),false,'rejection re-enables action');
   assert.deepEqual(await page.evaluate(()=>fixtureToasts),['Offline fixture']);
   assert.equal(durable.get('name:новичок').list,'losers','rejected change never persists');result.checks.push('Rejected request restores both buttons and saved state');
   await button(page,'name:<old>returning','losers').click();await page.waitForFunction(()=>!quickPlayerListPending.has('name:<old>returning'));
   assert.equal(durable.get('name:<old>returning').note,'Existing name-only private note','name-only move preserves private note');
   assert.equal(durable.has('name:returning'),false,'legacy clan key is reused rather than creating a duplicate');
   assert.equal(durable.get('name:<old>returning').name,'Returning','legacy entry now stores current clan-stripped name');
   const inheritedNative='2-S2-1-500';
   durable.set('name:namematch',{id:'name:namematch',name:'NameMatch',list:'losers',note:'Name match private note'});
   await page.evaluate(id=>{fixturePlayers.set(id,{id,name:'NameMatch'});state.lobby.rosterEntries.push({name:'[Current] NameMatch',candidates:[{id}]});},inheritedNative);
   await page.evaluate(()=>refresh());
   assert.equal(await button(page,'name:namematch','losers').getAttribute('aria-pressed'),'true','native row inherits existing name entry');
   await button(page,'name:namematch','friends').click();await page.waitForFunction(()=>!quickPlayerListPending.has('name:namematch'));
   assert.deepEqual(requests.at(-1),{id:'name:namematch',name:'NameMatch',list:'friends'},'native row moves existing name entry until explicit identity linking');
   assert.equal(durable.has(inheritedNative),false,'native name match does not duplicate an existing entry');
   assert.equal(durable.get('name:namematch').note,'Name match private note','inherited name entry keeps private note');
   result.checks.push('Legacy clan-key name mark and native inherited name mark each move one existing entry with its private note');
   await page.evaluate(()=>refresh());await settle(page);
   for(const [id,list] of [[native,'friends'],['name:новичок','losers'],['name:pangu','friends'],['name:shared nickname','losers'],['name:<old>returning','losers']])assert.equal(await button(page,id,list).getAttribute('aria-pressed'),'true','HTTP refresh retains saved selection');
   assert.equal(await page.locator('dialog[open]').count(),0,'quick actions never open a modal');
   assert.equal(await page.locator('.live-profile-details[open]').count(),0,'quick actions do not require or open Details');
   checkAnchor(await anchor(details),baseline,width+' after save');
   await details.locator(':scope > summary').click();await settle(page);checkAnchor(await anchor(details),baseline,width+' open');
   await details.locator(':scope > summary').focus();await page.evaluate(()=>refresh());await settle(page);checkAnchor(await anchor(details),baseline,width+' polling');
   assert.equal(await details.evaluate(node=>node.open&&document.activeElement===node.querySelector(':scope > summary')),true,'refresh retains Details and focus');
   await page.keyboard.press('Enter');await settle(page);checkAnchor(await anchor(details),baseline,width+' closed');
   const ambiguous=page.locator(`[data-lobby-details-id=${JSON.stringify('candidates:'+names.ambiguous)}]`),ambiguousBase=await anchor(ambiguous);checkAnchor(ambiguousBase,ambiguousBase,width+' ambiguous');
   await ambiguous.locator(':scope > summary').click();await settle(page);checkAnchor(await anchor(ambiguous),ambiguousBase,width+' ambiguous open');
   assert.equal(await ambiguous.locator('[data-quick-player-id="name:shared nickname"]').count(),4,'each possible non-self profile remains safely name-only');
   await ambiguous.locator(':scope > summary').click();
   await page.evaluate(({self,candidateA})=>{state.lobby.rosterEntries.push({name:'[Mixed] TKnight',candidates:[{id:self},{id:candidateA}]});}, {self,candidateA});
   await page.evaluate(()=>refresh());await settle(page);
   const mixed=page.locator('[data-lobby-entry="[Mixed] TKnight"]');
   assert.equal(await mixed.locator('[data-quick-player-list]').count(),0,'a nickname that includes known self has no collapsed or nested list action');
   await mixed.locator(':scope > .live-profile > .live-profile-details > summary').click();await settle(page);
   assert.equal(await mixed.locator('[data-quick-player-list]').count(),0,'opening mixed self/non-self candidates cannot mark the shared self nickname');
   result.checks.push('Mixed self/non-self nickname excludes collapsed and expanded name-only actions');
   await page.evaluate(()=>{state.lobby.rosterEntries=state.lobby.rosterEntries.filter(entry=>entry.name!=='[Mixed] TKnight');});
   await page.evaluate(()=>refresh());await settle(page);
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,'document fits viewport');
   result.checks.push('HTTP refresh retention, anchored native and ambiguous Details, keyboard focus, no modal, viewport fit');
   assert.deepEqual(errors,[],'no uncaught browser errors');result.requests=requests;result.overflow=overflow;
   const screenshot=path.join(__dirname,width===1440?'lobby-quick-lists-preview.png':'lobby-quick-lists-mobile-preview.png');await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);
   await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,report:reportPath,cases:report.cases.length,screenshots:report.screenshots,error:report.error}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
