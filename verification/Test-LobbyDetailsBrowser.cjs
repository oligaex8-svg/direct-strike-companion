'use strict';
// Run through Run-ImportRecoveryRelease.ps1 -Stage DetailsBrowser for the resource guard.
// Real lobby rendering and polling, with offline replay/site data and unrelated actions stubbed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
const prefix=path.join(__dirname,'lobby-details-'+runId);
const report={success:false,runId,fixture:'Actual renderLiveLobby / renderLiveLobbyRoster / liveLobbyCard / updateLiveLobby',cases:[],screenshots:[]};
const tolerance=0.6;
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} versus ${expected}`);}
function stable(actual,expected,label){
 for(const key of ['x','y','width','height'])near(actual.summary[key],expected.summary[key],`${label} summary ${key}`);
 for(let i=0;i<expected.cells.length;i++)for(const key of ['x','y','width','height'])near(actual.cells[i][key],expected.cells[i][key],`${label} stats ${i} ${key}`);
 near(actual.row.width,expected.row.width,`${label} row width`);
}
async function measure(details){
 return details.evaluate(node=>{
  const profile=node.parentElement,row=profile.querySelector(':scope > .live-row'),base=profile.getBoundingClientRect();
  const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height,right:r.right-base.x,bottom:r.bottom-base.y};};
  const summary=node.querySelector(':scope > summary');
  const occupiedNodes=[...row.querySelectorAll('button,h3,.live-name-status,.live-row-ratings>span,.live-history-label,.live-history-empty')].filter(n=>n.getClientRects().length);
  const occupied=occupiedNodes.map(node=>({...rect(node),contains:occupiedNodes.flatMap((other,index)=>node!==other&&node.contains(other)?[index]:[])}));
  return {open:node.open,summary:rect(summary),profile:{width:base.width,height:base.height},row:rect(row),cells:[...row.children].map(rect),body:node.open?rect(node):null,bodyChildren:node.open?[...node.children].filter(n=>n!==summary&&n.getClientRects().length).map(rect):[],occupied,scroll:profile.scrollWidth,client:profile.clientWidth};
 });
}
function layout(value,label){
 const s=value.summary;
 assert.ok(s.width>0&&s.height>0,`${label} summary is visible`);
 assert.ok(s.x>=-tolerance&&s.y>=-tolerance&&s.right<=value.profile.width+tolerance,`${label} summary inside its own profile`);
 near(s.right,value.profile.width,`${label} summary right anchor`);
 assert.ok(s.y<40,`${label} summary at profile top`);
 for(const r of value.occupied){
  const overlap=Math.min(s.right,r.right)-Math.max(s.x,r.x)>tolerance&&Math.min(s.bottom,r.bottom)-Math.max(s.y,r.y)>tolerance;
  assert.ok(!overlap,`${label} summary overlaps header/stat content: ${JSON.stringify(r)}`);
 }
 for(let i=0;i<value.occupied.length;i++)for(let j=i+1;j<value.occupied.length;j++){
  const a=value.occupied[i],b=value.occupied[j];
  // A rating container can intentionally contain its own profile action.
  // Retain its full bounds for summary/content checks without counting that
  // parent-child relationship as two overlapping independent cells.
  if(a.contains.includes(j)||b.contains.includes(i))continue;
  assert.ok(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>tolerance&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>tolerance),`${label} header/stat items overlap: ${JSON.stringify([a,b])}`);
 }
 assert.ok(value.scroll<=value.client+1,`${label} profile overflows horizontally`);
 if(value.open){
  near(value.body.x,0,`${label} body left`);near(value.body.width,value.profile.width,`${label} expanded body width`);
  assert.ok(value.body.y>=value.row.bottom-tolerance,`${label} expanded body below header`);
  for(const child of value.bodyChildren)assert.ok(child.y>=value.row.bottom-tolerance,`${label} body child above header bottom`);
 }
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const width of [1440,960,375])for(const language of ['en','ru']){
   const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   // All requests are local fixtures. Portraits use the installed assets; no server or external site is contacted.
   await page.route('**/*',route=>{
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname).replace(/^\//,'');
    const file=path.resolve(root,'wwwroot',relative);
    if(url.hostname==='fixture.invalid'&&file.startsWith(path.join(root,'wwwroot')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:relative.endsWith('.png')?'image/png':'text/plain'});
    if(url.hostname==='fixture.invalid'&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar">Direct Strike Companion</aside><main id="content" data-view="lobby" style="min-width:0"></main></div></body></html>'});
    return route.abort();
   });
   await page.goto('https://fixture.invalid/');
   for(const file of ['style.css','i18n.css','combat.css','lobby.css','player-lists.css','own-accounts.css','replays.css','profile.css','picks.css','picks-hover.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(()=>{
    window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    window.num=n=>n==null?'—':String(Math.round(n));window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=()=> '08 Oct';window.time=()=> '12:00';
    const own='2-S2-1-100',enemy='2-S2-1-200',other='1-S2-1-300';
    window.fixturePlayers=new Map([own,enemy,other].map((id,index)=>[id,{id,name:['Own account','Opponent','Other candidate'][index],against:{games:12,winRate:67},together:{games:10,wins:6,losses:4,winRate:60}}]));
    window.state={library:{settings:{language:'en',selfIds:[own],autoDetectSelf:true,sound:false},ratings:{},siteHistories:{501:{status:'Cached regional profile'}},ownAccountGroups:[{key:'local-100',canAutoLink:true,profiles:[{id:own,name:'Own account',region:'EU',nameSource:'SC2 local folder'}],warnings:[],evidence:'Local folders agree'}]},lobby:{source:'manual',phase:'pregame',rosterUpdatedAt:'2026-10-08T12:00:00Z',rosterEntries:[{name:'Own account',team:1,candidates:[{id:own}]},{name:'Opponent',team:1,candidates:[{id:enemy}]},{name:'Unknown player',team:1,candidates:[]},{name:'Site player',team:2,candidates:[]},{name:'Shared nickname',team:2,candidates:[{id:enemy},{id:other}]}]}};
    window.findPlayer=id=>fixturePlayers.get(id);window.displayPlayerName=(_id,name)=>name;
    window.regionRating=()=>({value:2345});window.siteRating=()=>({value:2345});window.siteRatingStatus=()=> 'Cached regional profile';
    window.siteNameKey=name=>name;window.siteIdentityKey=p=>'site:'+p.profileId;
    window.siteLookup=name=>({profiles:name==='Site player'?[{profileId:501,name,region:'EU',rating:2345}]:[]});
    window.siteLobbyUnknown=()=>'<p class="live-guidance">Battle.net identity unavailable · confirm the name in SC2</p>';
    window.siteHistoryRows=ids=>ids.flatMap(id=>[0,1,2].map((n)=>({match:{hash:id+'-'+n,time:'2026-10-08T12:00:00Z'},player:{id,commander:['Raynor','Kerrigan','Artanis'][n]},outcome:n!==1})));
    window.siteHistorySource=()=> 'Imported replays';window.playerOutcome=(_match,player)=>player.commander!=='Kerrigan';
    window.listBadge=()=>'';window.renderLikelyPicks=()=>'<p class="live-guidance">More history needed</p>';
    window.automationCommanderOptions=()=>'<option value="">Off</option>';window.automaticDataError='';window.toast=()=>{};
    window.api=async()=>({});window.renderLibrary=()=>updateLiveLobby(document.getElementById('content'));window.refresh=async()=>renderLibrary();
   });
   for(const file of ['sound-library.js','ru-ui.js','i18n.js','player-names.js','site-data.js','commanders.js','own-accounts.js','picks.js','replays.js','lobby.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(language=>{siteLookupForName=name=>({profiles:name==='Site player'?[{profileId:501,name,region:'EU',rating:2345}]:[]});liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();renderLibrary();setInterfaceLanguage(language);},language);
   await settle(page);
   // Expand the outer candidate wrapper so both independently anchored child cards are measurable.
   await page.locator('[data-lobby-details-id="candidates:Shared nickname"] > summary').click();await settle(page);
   const ids=await page.locator('.live-profile-details').evaluateAll(nodes=>nodes.map(node=>node.dataset.lobbyDetailsId));
   assert.equal(ids.length,7,'own, opponent, unknown, site, ambiguous parent and two nested cards');
   const result={width,language,profiles:[]};report.cases.push(result);
   for(const id of ids){
    // Identity filtering avoids depending on candidate display order or translated text.
    const target=page.locator(`[data-lobby-details-id=${JSON.stringify(id)}]`),summary=target.locator(':scope > summary');
    await target.evaluate(node=>node.open=false);await settle(page);
    const baseline=await measure(target),label=`${width}/${language}/${id}`;layout(baseline,label);
    const item={id,closed:baseline,transitions:[]};result.profiles.push(item);
    for(const action of ['click-open','click-close','click-open-repeat','click-close-repeat','Enter-open','Space-close','Space-open']){
     if(action.startsWith('click'))await summary.click();else{await summary.focus();await page.keyboard.press(action.startsWith('Enter')?'Enter':'Space');}
     await settle(page);
     const current=await measure(target),expectedOpen=action.endsWith('open')||action==='click-open-repeat';
     assert.equal(current.open,expectedOpen,`${label} ${action} native toggle`);stable(current,baseline,`${label} ${action}`);layout(current,`${label} ${action}`);item.transitions.push({action,summary:current.summary,open:current.open});
    }
    const picks=target.locator(':scope > .live-pick-details');
    if(await picks.count()){
     await picks.locator(':scope > summary').click();await settle(page);
     assert.equal(await picks.evaluate(node=>node.open),true,`${label} native nested pick details opens`);
     stable(await measure(target),baseline,`${label} nested pick expansion`);
    }
    await summary.focus();
    for(let poll=0;poll<3;poll++){
     const retained=await target.evaluate(node=>{window.fixtureOldDetails=node;const states=[...document.querySelectorAll('[data-lobby-details-id]')].map(n=>[n.dataset.lobbyDetailsId,n.open]);state.lobby.detectionStatus='Offline poll '+(state.lobby.fixturePoll=(state.lobby.fixturePoll||0)+1);updateLiveLobby(document.getElementById('content'));return states;});
     await settle(page);
     const pollState=await target.evaluate(node=>({replaced:node!==window.fixtureOldDetails,focused:document.activeElement===node.querySelector(':scope > summary'),open:node.open,states:[...document.querySelectorAll('[data-lobby-details-id]')].map(n=>[n.dataset.lobbyDetailsId,n.open])}));
     assert.ok(pollState.replaced,`${label} polling replaced actual card node`);assert.ok(pollState.focused,`${label} polling retains summary focus`);assert.ok(pollState.open,`${label} polling retains expanded state`);assert.deepEqual(pollState.states,retained,`${label} polling retains all detail states including nested pick history`);
     const current=await measure(target);stable(current,baseline,`${label} poll ${poll}`);layout(current,`${label} poll ${poll}`);
    }
    item.polls=3;
    await page.keyboard.press('Enter');await settle(page);assert.equal(await target.evaluate(node=>node.open),false,`${label} close after poll`);stable(await measure(target),baseline,`${label} final close`);
    // Keep the wrapper open while checking its nested candidates.
    if(id==='candidates:Shared nickname')await summary.click();
   }
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(overflow.scroll<=overflow.client+1,`${width}/${language} document horizontal overflow ${JSON.stringify(overflow)}`);result.overflow=overflow;
   assert.deepEqual(errors,[],`${width}/${language} uncaught browser errors`);
   if(width===960&&language==='ru'){
    await page.evaluate(()=>document.querySelectorAll('.live-profile-details').forEach(n=>n.open=false));await settle(page);
    for(const [label,open] of [['before-closed',false],['after-open',true]]){
     if(open)await page.evaluate(()=>document.querySelectorAll('.live-profile-details').forEach(n=>n.open=true));await settle(page);
     const screenshot=prefix+'-'+label+'.png';await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);
    }
   }
   await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,report:prefix+'.json',cases:report.cases.length,screenshots:report.screenshots,error:report.error}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
