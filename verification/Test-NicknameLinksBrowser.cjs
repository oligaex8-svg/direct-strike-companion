'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),report={success:false,scope:'Production lobby/profile controls with isolated nickname API and sample replay accounts; no Battle.net access or private library writes',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  const friend='2-S2-1-101',own='2-S2-1-102',alias='Ваня Кузьмич';let fail=false;
  const marks=[{id:friend,name:'Vanea',list:'friends',note:'Keep private note'}];
  const players=[{id:friend,name:'Vanea',aliases:['Vanea'],mark:marks[0]},{id:own,name:'TKnight',aliases:['TKnight']},{id:'1-S2-1-101',name:'AmericaFriend',aliases:['AmericaFriend']}];
  const settings={language,selfIds:[own],replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,sortPreferences:{}};
  const rating=(value,id)=>({value,profileId:String(id),region:'EU',profileName:id===1?'Vanea':'TKnight',url:'https://ds-rating.com/player/'+id+'/ratings'});
  const ratings={[friend]:{eu:rating(5461,1)},[own]:{eu:rating(7921,2)}};
  for(const player of players)player.ratings=ratings[player.id]||{};
  const matches=Array.from({length:8},(_,i)=>({hash:'sample-'+i,map:'Direct Strike',mode:'Commanders',time:new Date(Date.UTC(2026,9,21,20,i)).toISOString(),seconds:1000,winner:1,players:[{...players[0],team:1,commander:'Dehaka',result:'Win'},{...players[1],team:1,commander:'Artanis',result:'Win'},...Array.from({length:4},(_,j)=>({id:'2-S2-1-'+(200+j),name:'Other '+j,team:j===0?1:2,commander:'Karax',result:j===0?'Win':'Loss'}))]}));
  const library={settings,players,matches,marks,ratings,playerNicknames:{},accounts:[],errors:[],ownAccountGroups:[],siteLookups:{},dsstatsLookups:{[friend]:{key:friend,status:'Ready',checked:new Date().toISOString(),profiles:[{nativeId:friend,name:'Vanea',region:'EU',rating:2243,games:699,wins:573}]}},siteHistories:{},siteGames:{}};
  const lobby={phase:'pregame',source:'screen',region:'EU',roster:[alias,'TKnight'],rosterEntries:[],alerts:[],automation:{acceptNeeded:false,status:'Ready'},liveStatus:'Pregame',ocrStatus:'Sample party roster',observedAt:new Date().toISOString(),rosterUpdatedAt:new Date().toISOString()};
  function rebuild(){
   for(const player of players)player.aliases=[player.name,...(library.playerNicknames[player.id]||[])];
   lobby.rosterEntries=lobby.roster.map(name=>{const matched=players.filter(p=>p.aliases.includes(name)&&p.id.startsWith('2-'));return {name,team:1,marked:false,nameOnly:!matched.length,ambiguous:matched.length>1,candidates:matched.map(p=>({id:p.id,name:p.name,aliases:p.aliases,marked:false,nameOnly:false,list:p.mark?.list}))};});
  }rebuild();
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname,json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(name.startsWith('/api/')){
    const api=name.slice(5);let body;try{body=route.request().postDataJSON();}catch{}calls.push({api,body});
    if(api==='state')return json({library,lobby,libraryVersion:'sample',busy:false,replayStatus:'Up to date'});
    if(api==='live-state')return json({lobby,site:{}});
    if(api==='updates')return route.fulfill({status:503,body:'{}'});
    if(api==='player-nicknames'){
     if(fail){fail=false;return json({error:'A nickname already belongs to another account in this region.'},400);}
     const names=body.append?[...(library.playerNicknames[body.id]||[]),...body.nicknames]:body.nicknames;
     if(names.length)library.playerNicknames[body.id]=[...new Set(names)];else delete library.playerNicknames[body.id];rebuild();return json({});
    }return json({});
   }
   const file=name==='/'?'index.html':decodeURIComponent(name.slice(1)),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png',body:fs.readFileSync(target)});
  });
  await page.goto('http://nicknames.test/');await page.waitForFunction(()=>!!state?.library);
  await page.locator('nav [data-view="lobby"]').click();
  const unknown=page.locator('[data-lobby-details-id]').filter({has:page.locator('[data-link-nickname]')}).first();
  await unknown.locator('summary').click();await unknown.locator('[data-link-nickname]').click();
  const dialog=page.locator('#nickname-link-dialog');assert.equal(await page.locator('#nickname-link-name').inputValue(),alias);
  const options=await page.locator('#nickname-link-account option').allTextContents();assert.ok(options.some(text=>text.includes('Vanea')));assert.ok(!options.some(text=>text.includes('AmericaFriend')),'Known lobby region excludes a different regional account');
  await page.locator('#nickname-account-search').fill('missing-person');assert.equal(await page.locator('#nickname-link-account option').count(),1);
  await page.locator('#nickname-account-search').fill('Van');await page.evaluate(()=>refreshLiveData());assert.equal(await page.locator('#nickname-account-search').inputValue(),'Van','Refresh preserves the link draft');
  await page.locator('#nickname-link-account').selectOption(friend);
  assert.ok(await page.locator('#nickname-link-account').evaluate(el=>el.getBoundingClientRect().width>=el.form.getBoundingClientRect().width-2),'Account picker uses the available width');
  const dialogShot=path.join(__dirname,`nickname-link-${width}-${language}.png`);await page.screenshot({path:dialogShot});
  await dialog.locator('[data-close]').first().click();assert.equal(calls.filter(call=>call.api==='player-nicknames').length,0,'Cancel never creates a link');
  await unknown.locator('[data-link-nickname]').click();await page.locator('#nickname-link-account').selectOption(friend);
  fail=true;await page.locator('#nickname-link-form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#nickname-link-form button[type=submit]').disabled);
  assert.ok(await dialog.isVisible());assert.equal(await page.locator('#nickname-link-name').inputValue(),alias);assert.ok((await page.locator('#nickname-link-status').textContent()).length>0);
  await page.locator('#nickname-link-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('nickname-link-dialog').open);
  const account=page.locator('.live-nickname-account').first();assert.equal(await account.textContent(),'Vanea · EU');
  const linkedRow=page.locator('.live-profile').filter({has:account});
  assert.ok((await linkedRow.textContent()).includes(alias));
  assert.equal(Number((await linkedRow.locator('[data-rating-source="dsr"] .live-rating-value').textContent()).replace(/\D/g,'')),5461,'DSR uses the linked replay account rating');
  assert.equal(Number((await linkedRow.locator('[data-rating-source="dsstats"] .live-rating-value').textContent()).replace(/\D/g,'')),2243,'dsstats uses the linked native account rating');
  assert.equal(library.playerNicknames[friend][0],alias);assert.equal(players[0].name,'Vanea');assert.equal(marks[0].note,'Keep private note');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const lobbyShot=path.join(__dirname,`nickname-lobby-${width}-${language}.png`);await page.screenshot({path:lobbyShot});
  await page.evaluate(id=>showPlayer(id),friend);const editor=page.locator('[data-nickname-editor]');await page.locator('.player-nickname-editor>summary').click();
  await page.locator('#player-note').fill('Unsaved note draft');await editor.locator('textarea').fill(alias+'\nFriendly nickname');
  await page.evaluate(()=>refreshLiveData());assert.equal(await editor.locator('textarea').inputValue(),alias+'\nFriendly nickname');
  await editor.locator('button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-nickname-editor] button').disabled);
  assert.equal(library.playerNicknames[friend].length,2);assert.equal(await page.locator('#player-note').inputValue(),'Unsaved note draft');
  await editor.locator('textarea').fill('');await editor.locator('button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-nickname-editor] button').disabled);
  assert.ok(!library.playerNicknames[friend]);assert.equal(await page.locator('.live-nickname-account').count(),0,'Removing the link stops native-account attribution');
  assert.equal(calls.filter(call=>call.api==='mark').length,0,'Nickname saves do not overwrite lists or private notes');
  assert.deepEqual(errors,[]);report.cases.push({width,language,dialogShot,lobbyShot,explicitLink:true,cancel:true,regionFilter:true,errorRecovery:true,draftPreserved:true,realAccountShown:true,remove:true});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'nickname-links-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(e=>{console.error(e);process.exitCode=1;});
