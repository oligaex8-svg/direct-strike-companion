'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const fixture=require('./LocalPreviewFixture.cjs'),root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),report={success:false,cases:[]};
 try{
  for(const [width,language] of [[1600,'en'],[375,'ru']]){
   const sample=fixture('machined',language),lib=sample.library,own=lib.settings.selfIds[0],ally='2-S2-1-7001',enemy='2-S2-1-7002',totals='2-S2-1-7003';
   const single='2-S2-1-7004';
   lib.settings.selfIds=[own];lib.ownAccountGroups=[];lib.players=[lib.players[0],...[[ally,'Shared ally'],[enemy,'Shared opponent'],[totals,'Totals only'],[single,'One replay']].map(([id,name])=>({id,name,aliases:[]}))];
   for(const [id,profileId] of [[ally,'201'],[enemy,'203'],[totals,'299']])lib.siteLookups[id]={status:'Name match',profiles:[{profileId,name:lib.players.find(p=>p.id===id).name,region:'EU',rating:3000,winRate:99,discoveredGames:9000}]};
   for(const [id,profileId] of [[ally,'201'],[enemy,'203']])lib.ratings[id]={eu:{profileId,profileName:lib.players.find(p=>p.id===id).name,region:'EU',value:3000}};
   const game=(gameId,hour,win=true)=>({gameId:String(gameId),mode:'3v3 commanders',time:new Date(Date.UTC(2026,9,22,hour)).toISOString(),seconds:600,players:Array.from({length:6},(_,i)=>({profileId:i?'20'+i:'8713',name:i===1?'Shared ally':i===3?'Shared opponent':'Other '+i,team:i<3?0:1,commander:'raynor',result:(i<3)===win?'Win':'Loss'}))});
   const overlap=game(100,17);lib.matches=[{...overlap,hash:'local-overlap',mode:'Commanders',winner:1,players:overlap.players.map((p,i)=>({...p,id:[own,ally,'2-S2-1-7010',enemy,'2-S2-1-7011','2-S2-1-7012'][i],team:p.team+1,commander:'Raynor'}))}];
   lib.matches.push({...lib.matches[0],hash:'local-other',time:new Date(Date.UTC(2026,9,22,16)).toISOString(),players:lib.matches[0].players.map((player,i)=>({...player,id:i===0?own:i===1?single:'2-S2-1-'+(7020+i)}))});
   lib.siteGames={100:overlap,101:game(101,18),102:game(102,19,false)};
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(name==='/api/state')return json({...sample,libraryVersion:'encounter-fixture',busy:false,replayStatus:'Synthetic shared-game verification'});
    if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:lib.dsstatsLookups}});
    if(name.startsWith('/api/'))return json({});
    const file=path.resolve(web,'.'+decodeURIComponent(name==='/'?'/index.html':name));
    if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.addInitScript(()=>{window.setInterval=()=>0;});
   await page.goto('http://encounters.test/');await page.waitForFunction(()=>playerRows.length===5);await page.locator('nav [data-view=players]').click();
   const result=await page.evaluate(ally=>{const p=playerRows.find(p=>p.id===ally);return {games:p.together.games,rate:p.together.winRate,site:p.together.site.games,source:encounterSourceLabel(p.together)};},ally);
   assert.equal(result.games,3);assert.equal(result.site,2);assert.equal(Math.round(result.rate),67);
   assert.equal(await page.evaluate(id=>playerRows.find(p=>p.id===id).encounters,totals),0,'Overall website totals never create encounters');
   const row=page.locator('.player-table tbody tr').filter({has:page.locator(`[data-player="${ally}"]`)});
   assert.match(await row.locator('td').nth(3).textContent(),/67%/);assert.equal(await row.locator('.encounter-source').count(),1);
   await page.evaluate(()=>{sortPreferences.players={key:'encounters',direction:'desc'};renderLibrary();});
   assert.deepEqual(await page.locator('.player-table tbody tr').evaluateAll(rows=>rows.map(row=>row.querySelector('[data-player]').dataset.player)),[own,ally,enemy,single],'Encounter sorting orders combined 4/3/3 totals ahead of the one-replay sample');
   await page.locator(`[data-player="${ally}"]`).first().click();assert.match(await page.locator('.detail-stats').textContent(),/67%/);
   await page.locator('#player-dialog [data-close=player-dialog]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.mouse.move(0,0);
   await page.screenshot({path:path.join(__dirname,'local27-shared-encounters-'+width+'.png'),animations:'disabled'});
   lib.siteGames[103]=game(103,20,false);await page.evaluate(()=>refresh());await page.waitForFunction(id=>playerRows.find(p=>p.id===id).together.games===4,ally);
   assert.equal(await page.evaluate(id=>playerRows.find(p=>p.id===id).together.winRate,ally),50,'Fresh library snapshots recompute shared results');
   assert.deepEqual(errors,[]);report.cases.push({width,language,...result,refresh:true});await page.close();
  }
  report.success=true;console.log(JSON.stringify(report));
 }finally{await browser.close();fs.writeFileSync(path.join(__dirname,'local27-encounters-browser.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
