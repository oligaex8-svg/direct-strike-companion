'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
const report={success:false,scope:'Production lobby with synthetic ratings and isolated APIs; match-loaded phase, absent region/teams and AM-first linked own accounts; no native game input',cases:[]};
function fixture(language){
 const now=new Date().toISOString(),names=['Self','Ally A','Ally B','Enemy A','Enemy B','Enemy C'],ids=names.map((_,i)=>'2-S2-1-'+(101+i)),am='1-S2-1-101';
 const settings={language,selfIds:[am,ids[0]],replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,sortPreferences:{}};
 const players=names.map((name,i)=>({id:ids[i],name,aliases:[name]}));players.push({id:am,name:names[0],aliases:[names[0]]});
 const ratings={},siteLookups={},dsstatsLookups={};
 for(const [i,player] of players.entries()){
  const region=i===6?'Americas':'EU',value=[8000,5500,7000,1000,2500,1500,1200][i],ds=[2500,2200,2300,1000,1300,2000,1000][i],profileId=String(101+i),key=region==='EU'?'eu':'americas';
  ratings[player.id]={[key]:{value,profileId,profileName:player.name,region,url:'https://ds-rating.com/player/'+profileId+'/ratings'}};player.ratings=ratings[player.id];
  const profile={profileId,name:player.name,region,rating:value,mainRating:value,searchRating:value,searchGames:500,discoveredGames:500,searchWinRate:60,winRate:60,profileChecked:now,searchChecked:now,checked:now,url:'https://ds-rating.com/player/'+profileId};
  const dsprofile={nativeId:player.id,name:player.name,region,rating:ds,games:500,wins:300,lastPlayed:now,consistency:.5,confidence:.5,ratingStateVersion:1};
  siteLookups[player.id]={key:player.id,status:'Ready',checked:now,profiles:[profile]};siteLookups['name:'+region+':'+player.name.toLowerCase()]=structuredClone(siteLookups[player.id]);
  dsstatsLookups[player.id]={key:player.id,status:'Ready',checked:now,profiles:[dsprofile]};dsstatsLookups['name:'+region+':'+player.name.toLowerCase()]=structuredClone(dsstatsLookups[player.id]);
 }
 const profiles=[players[6],players[0]].map(p=>({...p,region:p.id===am?'Americas':'EU',ratings:ratings[p.id]}));
 const matches=[{hash:'synthetic',mode:'Commanders',map:'Direct Strike',time:now,seconds:1000,winner:1,players:players.slice(0,6).map((p,i)=>({...p,team:i<3?1:2,commander:['Artanis','Dehaka','Karax','Alarak','Fenix','Abathur'][i],result:i<3?'Win':'Loss'}))}];
 const library={settings,players,matches,marks:[],ratings,playerNicknames:{},accounts:players,errors:[],ownAccountGroups:[{key:'sample-own',canAutoLink:true,profiles,warnings:[],evidence:'Synthetic regional link'}],siteLookups,dsstatsLookups,siteHistories:{},siteGames:{}};
 const lobby={phase:'match',source:'client',roster:names,rosterEntries:names.map((name,i)=>({name,team:0,candidates:(i===0?[players[6],players[0]]:[players[i]]).map(p=>({id:p.id,name:p.name,nameOnly:false}))})),alerts:[],automation:{status:'Ready'},observedAt:now,rosterUpdatedAt:now};
 return {library,lobby,ids};
}
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1000,375])for(const language of ['en','ru']){
  const sample=fixture(language),page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name.startsWith('/api/')){
    if(name==='/api/state')return json({...sample,libraryVersion:'sample',busy:false,replayStatus:'Up to date'});
    if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
    if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
    return json({});
   }
   const file=name==='/'?'index.html':decodeURIComponent(name.slice(1)),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'image/png',body:fs.readFileSync(target)});
  });
  await page.goto('http://forecast.test/');await page.waitForFunction(()=>!!state?.library);await page.locator('nav [data-view="lobby"]').click();
  const forecast=page.locator('.live-rating-forecast');await forecast.waitFor({state:'visible'});
  assert.equal(await forecast.locator('strong').count(),4,'Both sites show approximate Win/Loss in match-loaded phase');
  assert.match(await forecast.textContent(),language==='en'?/Estimated teams/:/Предполагаемые команды/);
  assert.match(await forecast.textContent(),language==='en'?/Region inferred/:/Регион определён косвенно/);
  assert.equal(await page.locator('.live-profile-own .live-profile-link').getAttribute('data-player'),sample.ids[0],'EU peers resolve the EU own account despite AM-first ordering');
  const labels=await page.locator('.live-profile-own .live-rating-label').allTextContents();assert.ok(labels.every(label=>label.includes('EU')));
  const colors=await forecast.locator('.live-forecast-source').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n.querySelector('strong')).color));assert.notEqual(colors[0],colors[1]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  const screenshot=path.join(__dirname,`lobby-forecast-ready-${width}-${language}.png`);await page.screenshot({path:screenshot});
  const complete=structuredClone(sample.library.dsstatsLookups);
  for(const lookup of Object.values(sample.library.dsstatsLookups))for(const p of lookup.profiles)if(p.nativeId===sample.ids[3])delete p.confidence;
  await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.locator('[data-rating-source="dsr"] strong').count(),2);assert.equal(await forecast.locator('[data-rating-source="dsstats"] strong').count(),0);assert.match(await forecast.textContent(),language==='en'?/Loading rating data/:/Загрузка данных рейтинга/);
  sample.library.dsstatsLookups=complete;await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.locator('strong').count(),4);
  sample.lobby.rosterEntries[1].team=1;await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.locator('strong').count(),0);assert.match(await forecast.textContent(),language==='en'?/complete lobby teams/:/полного состава команд/);sample.lobby.rosterEntries[1].team=0;
  sample.lobby.rosterEntries[3].candidates=[{id:'1-S2-1-104',nameOnly:false}];await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.locator('strong').count(),0);assert.match(await forecast.textContent(),language==='en'?/lobby region/:/региона лобби/);sample.lobby.rosterEntries[3].candidates=[{id:sample.ids[3],nameOnly:false}];
  sample.lobby.held=true;await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.locator('strong').count(),0);assert.match(await forecast.textContent(),language==='en'?/fresh lobby roster/:/свежего состава/);sample.lobby.held=false;
  for(const phase of ['replay','finished']){sample.lobby.phase=phase;await page.evaluate(()=>refreshLiveData());assert.equal(await forecast.isVisible(),false);}
  assert.deepEqual(errors,[]);report.cases.push({width,language,screenshot,matchLoaded:true,bothSources:true,regionalOwnAccount:true,independentLoading:true,partialTeamsPending:true,conflictingRegionsPending:true,staleRosterPending:true});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'lobby-forecast-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(e=>{console.error(e);process.exitCode=1;});
