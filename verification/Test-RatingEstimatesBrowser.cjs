'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const fixture=read(path.join(__dirname,'automatic-lobby-rating-preview-data.json')),tests=read(path.join(root,'release/test-output/sound-tests.json'));
assert.ok(tests.success&&fixture.success);
for(const file of ['impact-detail.js','impact-detail.css','dsstats-changes.js','replay-impact.js','replays.js','replays.css','combat.js','ru-ui.js','site-data.js','dsstats.js','ui.css','index.html'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',file))).digest('hex').toUpperCase(),tests.assets[file],file+' embedded in tested EXE');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report={success:false,scope:'Actual replay list, match detail and refresh controllers; recorded public rating fixtures with sample matches; no network or live latency claims',cases:[],screenshots:[]};
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of [1440,960,375]){
   const page=await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname).replace(/^\//,''),file=path.resolve(root,'wwwroot',relative);
    if(url.hostname==='fixture.invalid'&&file.startsWith(path.join(root,'wwwroot')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:relative.endsWith('.png')?'image/png':'text/plain'});
    return route.abort();
   });
   await page.setContent('<!doctype html><html><head><base href="https://fixture.invalid/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p>Replays</p></aside><main id="content" style="min-width:0"></main></div><dialog id="match-dialog"><div class="dialog-head"><h2 id="match-title"></h2><button id="close-match" type="button" aria-label="Close">×</button></div><div class="dialog-body" id="match-content"></div></dialog></body></html>');
   for(const file of ['style.css','i18n.css','combat.css','lobby.css','player-lists.css','own-accounts.css','replays.css','profile.css','dialogs.css','impact-detail.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(fixture=>{
    window.fixture=fixture;window.$=id=>document.getElementById(id);window.query='';window.matchSelection=null;window.calls=[];
    window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(n);window.rate=n=>n==null?'—':Math.round(n)+'%';window.date=s=>new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});window.time=s=>new Date(s).toISOString().slice(11,16);window.empty=(title,copy)=>'<p>'+esc(title)+' · '+esc(copy)+'</p>';
    const commanders=['Fenix','Dehaka','Artanis','Kerrigan','Abathur','Alarak'];
    const players=fixture.names.map((name,index)=>({id:fixture.dsstats['name:EU:'+name.toLowerCase()].profiles[0].nativeId,name,clanTag:index===1?'Expend':'',team:index<3?1:2,commander:commanders[index],combat:{values:{UnitKills:200+index*37,CombatDeaths:150+index*40,MineralsKilledArmy:40000+index*2000,ScanCount:index}}}));
    const make=(hash,time,seconds,winner)=>({hash,time,seconds,winner,title:'Direct Strike',mode:'Commanders',players:players.map(p=>({...p})),economy:{middleAvailable:true,middleIncomeRate:1,middleIntervals:[{team:1,startSeconds:20,endSeconds:Math.min(300,seconds)},{team:2,startSeconds:Math.min(300,seconds),endSeconds:seconds}],players:players.map((p,index)=>({id:p.id,gasTimes:index===4?null:index===5?[]:[20,155,Math.min(445,seconds)],middleHeldSeconds:p.team===1?280:seconds-300,estimatedMiddleMinerals:p.team===1?280:seconds-300}))}});
    window.sampleMatches=[make('preview-a','2026-10-15T20:54:00Z',1167,1),make('preview-b','2026-10-15T20:33:00Z',455,2)];
    sampleMatches[1].players[0].combat={values:{...players[0].combat.values,MineralsKilledArmy:75000,UnitKills:500}};
    window.state={library:{settings:{selfIds:[players[0].id],sortPreferences:{}},players,marks:[],matches:sampleMatches,ownAccountGroups:[],siteLookups:fixture.dsRating,dsstatsLookups:fixture.dsstats,siteHistories:{},siteGames:{},ratingChanges:Object.fromEntries(sampleMatches.map(match=>[match.hash,players.map(p=>({playerId:p.id,kind:match.hash==='preview-a'?'confirmed':'estimated',scope:'main_current',delta:match.winner===p.team?(match.hash==='preview-a'?17:61):-(match.hash==='preview-a'?17:61),detail:match.hash==='preview-a'?'Verified main DSR · synthetic evidence fixture':'Main DSR projection · synthetic fixture'}))]))}};
    window.findPlayer=id=>state.library.players.find(p=>p.id===id);window.displayPlayerName=(_id,name)=>name;window.regionRating=(player,region)=>player.ratings?.[region==='EU'?'eu':'americas']||null;
    window.visibleMatches=()=>state.library.matches;window.playerOutcome=(match,player)=>match.winner?match.winner===player.team:null;
    window.api=async(route,body)=>{calls.push({route,body});return body;};window.toast=()=>{};
    document.getElementById('close-match').onclick=()=>document.getElementById('match-dialog').close();
   },fixture);
   for(const file of ['dsstats.js','dsstats-changes.js','site-data.js','player-names.js','own-accounts.js','commanders.js','player-lists.js','replay-impact.js','replays.js','combat.js','dialogs.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.evaluate(()=>{
    window.renderLibrary=()=>{$('content').innerHTML='<h1>Replays</h1>'+renderReplayHistory();};window.refresh=async()=>renderLibrary();
    // Same delegated data hooks as app.js, with unrelated navigation omitted.
    document.addEventListener('click',event=>{const match=event.target.closest('[data-match]');if(match)showMatch(match.dataset.match);});
    renderLibrary();
    const player=state.library.players[0],key=siteNameKey(player.name,'EU'),original=state.library.dsstatsLookups;
    state.library.dsstatsLookups={[key]:{status:'Candidates',profiles:[{nativeId:'2-S2-1-9999999',region:'EU',rating:99999}]}};
    const isolated=replayPlayerRating(player,true);if(isolated.includes('99,999'))throw Error('Replay borrowed a different native account');state.library.dsstatsLookups=original;
    const ready=replayDsstatsChanges(sampleMatches[0]);if([...ready.values()].some(change=>change.status!=='ready'))throw Error('Complete exact-source ratings must produce dsstats estimates');
    state.library.dsstatsLookups=Object.fromEntries(Object.entries(original).map(([key,lookup])=>[key,{...lookup,profiles:lookup.profiles.map(profile=>({...profile,consistency:.9,confidence:.8}))}]));
    const precise=replayDsstatsChanges(sampleMatches[0]);if([...precise.values()].some(change=>change.basis!=='site-state')||precise.get(player.id).delta===ready.get(player.id).delta)throw Error('Published rating state must reach replay estimates');state.library.dsstatsLookups=original;
    state.library.dsstatsLookups=Object.fromEntries(Object.entries(original).map(([key,lookup])=>[key,{...lookup,profiles:(lookup.profiles||[]).filter(profile=>profile.nativeId!==player.id)}]));
    const missingEstimate=replayDsstatsChanges(sampleMatches[0]);if([...missingEstimate.values()].some(change=>change.delta!==null||change.missingRatings!==1))throw Error('One missing exact rating must suppress every dsstats estimate');
    state.library.dsstatsLookups={[key]:{status:'Candidates',profiles:[{nativeId:'2-S2-1-9999999',region:'EU',rating:99999}]}};
    if([...replayDsstatsChanges(sampleMatches[0]).values()].some(change=>change.delta!==null))throw Error('Another same-name account cannot supply an estimate');state.library.dsstatsLookups=original;
    if(!replayPlayerRating(state.library.players[2],true).includes('~'))throw Error('Estimated DSR lost its visible marker');
    const missing=replayCompactRating('dsstats',null,'Unavailable');if(!missing.includes('Unavailable'))throw Error('Source failure became pending');
    const partial=structuredClone(sampleMatches[0]);delete partial.players[1].combat.values.MineralsKilledArmy;
    if(!replayImpactCell(partial.players[0],replayImpactScores(partial)).includes('<sup>*</sup>'))throw Error('Single-metric impact lost its visible marker');
    delete partial.players[1].combat.values.UnitKills;
    const incomplete=replayImpactScores(partial);
    if(partial.players.slice(0,3).some(player=>incomplete.get(player.id).value!==null)||partial.players.slice(3).some(player=>incomplete.get(player.id).value===null))throw Error('Missing impact data affected the other team or invented a score');
   });
   assert.equal(await page.locator('.replay-history tbody tr').count(),2);assert.equal(await page.locator('.replay-player').count(),12);
   for(const match of await page.locator('.replay-history tbody tr').all()){
    assert.equal(await match.locator('.replay-middle-preview svg').count(),1,'One timeline spans both teams');
    assert.equal(await match.locator('.replay-middle-preview rect.middle-neutral').count(),1,'Initial neutral period remains visible');
    assert.equal(await match.locator('.replay-middle-preview rect.team-1').count(),1);assert.equal(await match.locator('.replay-middle-preview rect.team-2').count(),1);
    assert.match(await match.locator('.replay-middle-preview rect.team-1 title').textContent(),/0:20–5:00/);
   }
   for(const row of await page.locator('.replay-player').all()){
    assert.equal(await row.locator('.replay-rating-cell').count(),2);assert.equal(await row.locator('[data-player]').count(),1);
    assert.equal(await row.locator('.replay-impact-score').count(),1);assert.match(await row.locator('.replay-impact-score strong').textContent(),/^\d+\.\d%$/);
    assert.doesNotMatch(await row.textContent(),/Site games|Last played|Cached|Load profile|Other accounts|Name \/ region|retrying/);
   }
   for(const team of await page.locator('.replay-team').all()){
    const values=await team.locator('.replay-impact-score strong').allTextContents(),total=values.reduce((sum,value)=>sum+parseFloat(value),0);
    assert.ok(Math.abs(total-100)<=0.2,'Each team has 100% impact before display rounding');
   }
   const impactA=await page.locator('.replay-history tbody tr').first().locator('.replay-impact-score strong').first().textContent(),impactB=await page.locator('.replay-history tbody tr').nth(1).locator('.replay-impact-score strong').first().textContent();
   assert.notEqual(impactA,impactB,'Impact uses each game\'s replay metrics, not a cached player rating');
   assert.equal(await page.locator('.replay-history .rating-current').count(),0,'Own rating is no longer duplicated in a separate column');
   assert.equal(await page.locator('.replay-match-summary .replay-compact-change').count(),2);assert.equal(await page.locator('.replay-duration').first().textContent(),'19:27');
   for(const source of ['dsr','dsstats']){
    const summaries=page.locator(`.replay-match-summary .replay-source-change[data-rating-source="${source}"]`);
    assert.equal(await summaries.count(),2,'Separate left-summary categories for '+source);
    assert.match(await summaries.first().locator('strong').textContent(),source==='dsr'?/^\+17$/:/^~\+\d+/,'Published DSR is exact; dsstats remains approximate');
    assert.match(await summaries.nth(1).locator('strong').textContent(),/^~-\d+/,'Losing game has negative approximate '+source+' change');
   }
   await page.locator('.replay-details-link').first().click();
   assert.equal(await page.locator('#match-dialog').evaluate(n=>n.open),true);assert.equal(await page.locator('#match-content .match-player').count(),6);
   assert.equal(await page.locator('#match-content .replay-compact-ratings').count(),6);
   assert.equal(await page.locator('#match-content .replay-impact-score').count(),6);assert.equal(await page.locator('#match-content .replay-impact-score strong').first().textContent(),impactA);
   await page.locator('[data-replay-impact-guide] > summary').click();assert.match(await page.locator('[data-replay-impact-guide]').textContent(),/75%.*25%/s);
   await page.locator('[data-replay-change-guide] > summary').click();assert.match(await page.locator('[data-replay-change-guide]').textContent(),/neutral consistency.*equal confidence.*no leavers/s);
   assert.equal(await page.locator('#match-content .replay-source-change[data-rating-source="dsstats"]').count(),6,'Both sites also appear per player in Details');
   assert.equal(await page.locator('#match-content [data-quick-player-list="friends"]').count(),5);assert.equal(await page.locator('#match-content [data-quick-player-list="losers"]').count(),5);assert.equal(await page.locator('#match-content [data-quick-player-list="blocked"]').count(),0);
   const evidence=page.locator('#match-content [data-replay-rating-details]').first();await evidence.locator('summary').click();assert.ok(await evidence.locator('.site-profile-summary').isVisible(),'Useful source statistics remain in rating details');
   await page.locator('.middle-periods').evaluate(n=>n.open=true);await page.evaluate(()=>showMatch('preview-a'));
   assert.equal(await evidence.evaluate(n=>n.open),true,'Rating evidence stays expanded on refresh');assert.equal(await page.locator('.middle-periods').evaluate(n=>n.open),true,'Middle periods stay expanded on refresh');
   assert.equal(await page.locator('[data-replay-impact-guide]').evaluate(n=>n.open),true,'Impact calculation stays expanded on refresh');
   assert.equal(await page.locator('[data-replay-change-guide]').evaluate(n=>n.open),true,'Rating assumptions stay expanded on refresh');
   const target=page.locator('#match-content [data-quick-player-list="losers"]').first();await target.click();await page.waitForFunction(()=>state.library.marks.length===1);
   assert.equal(await target.getAttribute('aria-pressed'),'true','Direct list actions remain usable');
   await page.evaluate(()=>{$('match-dialog').close();state.library.matches=Array.from({length:81},(_,index)=>({...sampleMatches[0],hash:'page-'+index}));replayPage=1;renderLibrary();});
   assert.equal(await page.locator('.replay-history tbody tr').count(),40);await page.locator('[data-replay-page="2"]').first().click();assert.equal(await page.evaluate(()=>replayPage),2);assert.equal(await page.locator('.replay-history tbody tr').count(),40);
   await page.evaluate(()=>{query='no matching name';renderLibrary();});assert.equal(await page.locator('.replay-history').count(),0,'Filtering empty result is stable');
   await page.evaluate(()=>{query='';state.library.matches=sampleMatches;replayPage=1;renderLibrary();});
   for(const language of ['en','ru']){
    if(language==='ru')await page.evaluate(()=>{interfaceLanguage='ru';translateInterface(document.body);});
    if(language==='ru')assert.equal(await page.locator('.replay-middle-preview svg').first().getAttribute('aria-label'),'Шкала контроля центра');
    const bounds=await page.locator('.replay-player').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),cells=[...node.querySelectorAll('.replay-rating-cell,.replay-impact-score')].map(n=>{const b=n.getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,bottom:b.bottom};});return{height:r.height,right:r.right,cells};}));
    assert.ok(Math.max(...bounds.map(n=>n.height))<=(width===375?80:50),`${width}/${language}: replay players must stay shorter than the previous 58px rows`);
    const identities=await page.locator('.replay-player-identity').evaluateAll(nodes=>nodes.map(node=>{const name=node.querySelector('[data-player]').getBoundingClientRect(),commander=node.querySelector('.meta').getBoundingClientRect();return{commanderTop:commander.top,nameBottom:name.bottom};}));
    for(const identity of identities)assert.ok(identity.commanderTop>=identity.nameBottom-1,'Commander stays underneath the player name');
    const timelines=await page.locator('.replay-match-teams').evaluateAll(nodes=>nodes.map(node=>{const teams=node.querySelector('.replay-teams').getBoundingClientRect(),bar=node.querySelector('.middle-timeline').getBoundingClientRect();return{teamsLeft:teams.left,teamsRight:teams.right,barLeft:bar.left,barRight:bar.right,barHeight:bar.height};}));
    for(const line of timelines)assert.ok(Math.abs(line.teamsLeft-line.barLeft)<1&&Math.abs(line.teamsRight-line.barRight)<1&&line.barHeight===6,'Thin control timeline spans the full team area');
    const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
    for(const b of bounds){assert.ok(b.cells[0].right<=b.cells[1].x+1&&b.cells[1].right<=b.cells[2].x+1,'Rating and impact columns do not overlap');assert.ok(b.cells[2].right<=b.right+1,'Scores remain in their player row');}
    if(language==='ru')assert.ok((await page.locator('.replay-team-heading').first().textContent()).includes('Вклад'),'Impact label is translated');
    const colors=await page.evaluate(()=>{
     const cell=source=>document.querySelector(`.replay-player .replay-rating-cell[data-rating-source="${source}"] strong`),delta=source=>document.querySelector(`.replay-match-summary .replay-source-change[data-rating-source="${source}"] strong`);
     const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),luma=rgb=>rgb.map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
     const ratio=node=>{let parent=node,bg;while(parent){bg=getComputedStyle(parent).backgroundColor;if(!bg.includes('rgba')&&bg!=='transparent')break;parent=parent.parentElement;}const values=[luma(rgb(getComputedStyle(node).color)),luma(rgb(bg))];return (Math.max(...values)+0.05)/(Math.min(...values)+0.05);};
     return {dsr:getComputedStyle(cell('dsr')).color,dsstats:getComputedStyle(cell('dsstats')).color,dsrDelta:getComputedStyle(delta('dsr')).color,dsstatsDelta:getComputedStyle(delta('dsstats')).color,contrast:['dsr','dsstats'].flatMap(source=>[ratio(cell(source)),ratio(delta(source))])};
    });
    assert.notEqual(colors.dsr,colors.dsstats,'Each source has a distinct color');assert.equal(colors.dsr,colors.dsrDelta);assert.equal(colors.dsstats,colors.dsstatsDelta);assert.ok(colors.contrast.every(ratio=>ratio>=4.5),'Source values and deltas meet 4.5:1 contrast');
    if(language==='ru')assert.equal(await page.locator('.replay-change-heading').first().textContent(),'Изменение рейтинга');
    if((width===1440||width===375)&&language==='en'){await page.evaluate(()=>document.activeElement?.blur());const file=path.join(__dirname,width===1440?'rating-estimates-preview.png':'rating-estimates-mobile.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);}
    await page.locator('.replay-open').first().click();assert.equal(await page.evaluate(()=>matchSelection),'preview-a');
    const dialogOverflow=await page.locator('#match-dialog').evaluate(n=>({scroll:n.scrollWidth,client:n.clientWidth}));assert.ok(dialogOverflow.scroll<=dialogOverflow.client+1,JSON.stringify(dialogOverflow));
    if(width===1440&&language==='en'){const file=path.join(__dirname,'rating-estimates-details.png');await page.locator('#match-dialog').screenshot({path:file});report.screenshots.push(file);}
    await page.locator('#close-match').click();
    report.cases.push({width,language,playersPerMatch:6,sourceColumns:2,sourceChanges:true,colors,impact:true,teamPercentTotal:true,perGameValues:true,partialDataMarked:true,compact:true,commanderUnderName:true,fullWidthTimeline:true,timelineHeight:6,matchDetails:true,ratingsExpandedRetained:true,lists:true,pagination:true,maxPlayerHeight:Math.max(...bounds.map(n=>n.height)),overflow,dialogOverflow});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'rating-estimates-ui-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
