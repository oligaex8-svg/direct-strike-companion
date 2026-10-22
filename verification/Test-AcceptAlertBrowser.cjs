'use strict';
// Production page/scripts with an isolated API: never changes private data or clicks SC2.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const web=path.resolve(__dirname,'../wwwroot'),report={success:false,cases:[],scope:'Production UI; isolated recognized invitations; native notification delivery unverified'};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let automation={acceptNeeded:false,status:'No recognized match-accept popup'};
  const settings={language,selfIds:[],replayFolders:[],autoDetectSelf:false,liveWatch:true,screenWatch:true,sound:false,pingOnMatchAccept:false,pingOnGameLoading:false,pingOnGameLoaded:false,autoAcceptMatch:false,autoPickCommander:'',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:55,notificationSoundStyles:{}};
  const lobby=()=>({phase:'pregame',roster:[],rosterEntries:[],alerts:[],automation,liveStatus:'SC2 connected',ocrStatus:'Screen reader ready'});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),name=url.pathname;
   if(name.startsWith('/api/')){
    const api=name.slice(5),body=api==='state'?{library:{settings,matches:[],players:[],marks:[],ratings:{},regionalRatings:{},accounts:[],ownAccountGroups:[],errors:[]},lobby:lobby(),libraryVersion:'fixture',busy:false,replayStatus:'Up to date'}:api==='live-state'?{lobby:lobby(),site:{}}:{};
    return route.fulfill({status:api==='updates'?503:200,contentType:'application/json',body:JSON.stringify(body)});
   }
   const file=name==='/'?'index.html':decodeURIComponent(name.slice(1)),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png',body:fs.readFileSync(target)});
  });
  await page.goto('http://accept.test/');await page.waitForFunction(()=>!!state?.library);
  assert.equal(await page.locator('#accept-alert').isVisible(),false);
  automation={acceptNeeded:true,acceptKind:'game-invite',status:'Accept needed · automatic acceptance off',observedAt:new Date().toISOString()};
  // Exercise the fast live update while the user is on an unrelated page.
  await page.evaluate(()=>refreshLiveData());
  for(const view of ['players','lobby','sounds','matches']){
   await page.locator(`button.nav[data-view="${view}"]`).click();
   assert.equal(await page.locator('#accept-alert .live-accept-needed').isVisible(),true,view);
   assert.equal(await page.locator('.live-accept-needed').count(),1,'Exactly one prompt across every page');
  }
  const prompt=await page.locator('#accept-alert strong').textContent();assert.ok(prompt.includes(language==='ru'?'приглашение':'invite'),prompt);
  await page.evaluate(()=>{window.acceptNode=document.querySelector('#accept-alert .live-accept-needed');});
  await page.evaluate(()=>refreshLiveData());assert.equal(await page.evaluate(()=>acceptNode===document.querySelector('#accept-alert .live-accept-needed')),true,'Unchanged polling preserves the alert node');
  automation={...automation,acceptNeeded:false};await page.evaluate(()=>refreshLiveData());assert.equal(await page.locator('#accept-alert').isVisible(),false,'Closed invitation clears the prompt');
  automation={...automation,acceptNeeded:true,acceptKind:'party-invite'};await page.evaluate(()=>refreshLiveData());assert.equal(await page.locator('#accept-alert').isVisible(),true);
  await page.locator('button.nav[data-view="lobby"]').click();
  const box=await page.locator('#accept-alert').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y<900);
  assert.deepEqual(errors,[]);
  const screenshot=path.join(__dirname,`accept-alert-${width}-${language}.png`);await page.screenshot({path:screenshot});
  report.cases.push({width,language,audioDisabled:true,automaticAcceptanceDisabled:true,allPages:true,liveRefresh:true,dismissal:true,nodeContinuity:true,screenshot});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'accept-alert-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
