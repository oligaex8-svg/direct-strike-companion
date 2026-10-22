'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),live=JSON.parse(fs.readFileSync(path.join(__dirname,'site-profile-priority-live.json'),'utf8'));
let data=live.success?live:JSON.parse(fs.readFileSync(path.join(__dirname,'site-profile-priority-cached.json'),'utf8'));
const report={success:false,source:data.scope,liveRequestsSucceeded:live.success,checkedAt:data.checkedAt,checks:[],cases:[]};
let browser;
(async()=>{
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  if(!live.success){
   const sourcePage=await browser.newPage();
   const parsed=await sourcePage.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const identity=doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if(identity!=='https://ds-rating.com/player/3128')throw new Error('Saved source identity mismatch');
    const number=label=>{const heading=[...doc.querySelectorAll('h6')].find(node=>node.textContent.trim()===label),value=heading?.nextElementSibling?.firstChild?.textContent?.trim();return value?Number(value.replaceAll(',','').replace('%','')):null;};
    const heading=doc.querySelector('a[href="/player/3128/commanders"]')?.parentElement;
    const commanderStats=[...heading.nextElementSibling.querySelectorAll('tbody tr')].map(row=>({commander:row.querySelector('a[href^="/player/3128/commander/"]').textContent.trim(),games:Number(row.children[1].textContent.trim()),winRate:Number(row.children[2].textContent.trim().replace('%',''))}));
    const lastPlayed=[...doc.querySelectorAll('a[href^="/game/"]')].map(a=>a.textContent.trim()).filter(text=>/^\d{4}-\d{2}-\d{2}/.test(text)).sort().at(-1);
    return {estimatedRating:number('Estimated rating'),discoveredGames:number('Discovered games'),winRate:number('Winrate'),commanderStats,lastPlayed};
   },fs.readFileSync(path.join(__dirname,'fixtures/site-profile-3128-current.html'),'utf8'));
   const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'blackjoker-main-profile-evidence.json'),'utf8'));
   const profile=data.lookups[0].profiles.find(profile=>profile.profileId==='3128');
   assert.ok(profile,'Installed cache contains the verified BlackJoker account');
   Object.assign(profile,parsed,{profileStatsVersion:1,profileChecked:evidence.checkedAt,detailsPending:false});
   report.sourceCapturedAt=evidence.checkedAt;await sourcePage.close();
  }
  const names=data.names||['BlackJoker','ZEUS','Ronin'];
  for(const width of [960,1440])for(const language of ['en','ru']){
   const page=await browser.newPage({viewport:{width,height:1080}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar"><div class="brand">DIRECT STRIKE<br>COMPANION</div><p class="muted">Site-data preview</p></aside><main id="content"></main></div></body></html>');
   for(const file of ['style.css','ui.css','lobby.css','replays.css','i18n.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.addStyleTag({content:'.live-site-cards{display:grid;gap:16px}.live-site-card{padding:20px;border:1px solid var(--line);border-radius:5px;background:var(--surface)}.live-site-card h3{margin:0 0 8px}.live-site-card .site-account-ratings{font-size:1rem}.live-site-card .site-profile-summary{font-size:.8rem}.live-site-card .site-account-action{font-size:.75rem}.live-site-card .site-account-panel{max-width:460px}.live-site-card .site-commander-stat{font-size:.8rem}.live-site-card .site-commander-stat>span:nth-last-child(-n+2){font-size:.75rem}.live-site-card .site-stats-heading{font-size:.8rem}'});
   await page.evaluate(data=>{
    window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    window.num=n=>n==null?'—':new Intl.NumberFormat('en-GB').format(n);
    window.state={library:{settings:{language:'en',selfIds:[]},siteLookups:Object.fromEntries(data.lookups.map(lookup=>[lookup.playerId,lookup]))}};
    window.calls=[];window.api=async(route,body)=>{calls.push({route,body});return {};};
   },data);
   for(const file of ['commanders.js','site-data.js','ru-ui.js','i18n.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   const portraits={};for(const name of ['artanis','mengsk','raynor','nova','karax'])portraits['/images/commanders/'+name+'.png']='data:image/png;base64,'+fs.readFileSync(path.join(root,'wwwroot','images','commanders',name+'.png')).toString('base64');
   await page.evaluate(({language,portraits,names,live})=>{
    window.renderPreview=()=>{document.getElementById('content').innerHTML='<h1>'+(live?'Live site data':'Saved site data')+'</h1><p class="muted">'+(live?'New EXE live-site probe':'Verified BlackJoker page captured 9 Oct 2026 · live requests currently unavailable')+'</p><p class="muted">Most recently active first · name and region matches</p><div class="live-site-cards">'+names.map(name=>{const lookup=siteLookupForName(name,'EU');return '<article class="live-site-card" data-name="'+name+'"><h3 data-i18n-skip>'+name+'</h3>'+siteAccountRatingList(lookup.profiles,lookup)+'</article>';}).join('')+'</div>';for(const img of document.querySelectorAll('img'))if(portraits[img.getAttribute('src')])img.src=portraits[img.getAttribute('src')];translateInterface(document.getElementById('content'));};
    setInterfaceLanguage(language);renderPreview();
   },{language,portraits,names,live:live.success});
   for(const name of names){
    const card=page.locator('[data-name="'+name+'"]');
    assert.equal(await card.locator('.site-account-rating:visible').count(),1,'One priority account visible for '+name);
    const expected=[...data.lookups.find(lookup=>lookup.playerId.endsWith(name.toLowerCase())).profiles].sort((a,b)=>Date.parse(b.lastPlayed)-Date.parse(a.lastPlayed)||(b.searchGames-a.searchGames)||Number(a.profileId)-Number(b.profileId))[0];
    assert.equal(await card.locator('.site-account-primary a').getAttribute('href'),'https://ds-rating.com/player/'+expected.profileId+(expected.rating!=null?'/ratings':''),'Latest activity selects the expected public account');
   }
   const black=page.locator('[data-name="BlackJoker"]');
   assert.ok((await black.locator('.site-account-primary').textContent()).includes('3,968'));
   assert.ok((await black.locator('.site-profile-summary').first().textContent()).includes('1,048'));
   assert.ok((await black.locator('.site-profile-summary').first().textContent()).includes('45.1%'));
   await black.locator('[data-site-disclosure^="stats:"]').first().click();
   assert.equal(await black.locator('.site-commander-stat:visible').count(),5,'Stats control opens the five verified commander rows');
   const toggle=black.locator('[data-site-disclosure^="accounts:"]');
   await toggle.click();assert.equal(await black.locator('.site-account-rating:visible').count(),3);
   assert.equal(await black.locator('.site-account-alternatives .site-account-action[data-site-profile-id]').count(),2,'Deferred accounts offer explicit loading');
   await black.locator('[data-site-profile-id="12473"]').click();
   await page.waitForFunction(()=>calls.length===1);
   assert.deepEqual(await page.evaluate(()=>calls[0]),{route:'rating/site-profile',body:{profileId:'12473',region:'EU'}},'One click requests only its chosen alternate');
   await page.evaluate(()=>renderPreview());
   assert.equal(await black.locator('.site-commander-stat:visible').count(),5,'Commander disclosure survives re-render');
   assert.equal(await toggle.getAttribute('aria-expanded'),'true','Alternatives survive re-render');
   await toggle.click();
   const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
   assert.deepEqual(errors,[],'Stats and account disclosures produce no browser exceptions');
   report.cases.push({width,language,overflow,checks:11});
   if(width===1440&&language==='en'){report.screenshot=path.join(__dirname,'site-profile-priority-preview.png');const main=await page.locator('#content').boundingBox(),card=await page.locator('.live-site-card').last().boundingBox();await page.screenshot({path:report.screenshot,clip:{x:main.x,y:main.y,width:main.width,height:Math.ceil(card.y+card.height-main.y+24)}});}
   await page.close();
  }
  report.success=true;
 }catch(error){report.error=error.stack;throw error;}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(__dirname,'site-profile-priority-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
