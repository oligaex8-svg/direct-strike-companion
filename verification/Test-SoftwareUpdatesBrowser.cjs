'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),report={success:false,scope:'Production UI, isolated public release API; no real credentials/download/restart',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));
  const settings={language,selfIds:[],replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,autoAcceptMatch:false,autoPickCommander:'',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:55,notificationSoundStyles:{}};
  let update={currentVersion:'1.0.0',repository:'oligaex8-svg/direct-strike-companion',connected:false,state:'idle',message:'Check for updates from GitHub.'},fail=false;
  const lobby={phase:'pregame',roster:[],rosterEntries:[],alerts:[],automation:{acceptNeeded:false,status:'Ready'},liveStatus:'SC2 ready',ocrStatus:'Screen reader off'};
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname;
   if(name.startsWith('/api/')){
    const api=name.slice(5),method=route.request().method();let body;try{body=route.request().postDataJSON();}catch{}calls.push({api,method,body});
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(api==='state')return json({library:{settings,matches:[],players:[],marks:[],ratings:{},regionalRatings:{},accounts:[],ownAccountGroups:[],errors:[]},lobby,softwareUpdate:update,libraryVersion:'fixture',busy:false,replayStatus:'Up to date'});
    if(api==='live-state')return json({lobby,site:{},softwareUpdate:update});
    if(api==='updates')return json({},503);
    if(api==='software-updates/status')return json(update);
    if(api==='software-updates/access'){
     if(fail){fail=false;return json({error:'Fixture access denied'},400);}
     update={...update,availableVersion:null,connected:method!=='DELETE',state:'idle',message:method==='DELETE'?'GitHub disconnected.':'GitHub connected. Check for updates.'};return json(update);
    }
    if(api==='software-updates/check'){update={...update,state:'available',availableVersion:'1.1.0',message:'An update is available.'};return json(update);}
    if(api==='software-updates/install')return json({restarting:true});
    return json({});
   }
   const file=name==='/'?'index.html':decodeURIComponent(name.slice(1)),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png',body:fs.readFileSync(target)});
  });
  await page.goto('http://updates.test/');await page.waitForFunction(()=>!!state?.library);
  await page.locator('#settings-open').click();await page.locator('#updates-open').click();
  const dialog=page.locator('#updates-dialog'),token=page.locator('#updates-token');await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('#updates-check').isDisabled(),false,'Public checks need no token');assert.equal(await page.locator('#updates-install').isVisible(),true,'Public release can be installed without connecting');
  assert.equal(update.connected,false);assert.equal(calls.filter(call=>call.api==='software-updates/install').length,0,'Public discovery never downloads or restarts automatically');
  assert.equal(await page.locator('#updates-access').evaluate(node=>node.open),false,'Optional access starts collapsed');await page.locator('#updates-access summary').click();
  assert.equal(await token.getAttribute('type'),'password');await token.fill('test-only-token-not-real-12345');fail=true;
  await page.locator('#updates-connect button[type=submit]').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.match(await page.locator('#updates-status').textContent(),/Fixture access denied/);assert.equal(await token.inputValue(),'');
  await token.fill('test-only-token-not-real-12345');await page.locator('#updates-connect button[type=submit]').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.equal(await token.inputValue(),'');assert.equal(await page.locator('#updates-check').isDisabled(),false);
  await page.locator('#updates-check').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.equal(await page.locator('#updates-install').isVisible(),true);assert.equal(await page.locator('#update-available').isVisible(),true);
  assert.match(await page.locator('#updates-version').textContent(),/1\.1\.0/);
  const installs=()=>calls.filter(call=>call.api==='software-updates/install').length;
  assert.equal(installs(),0,'Checking and connecting never restart the application');
  await token.fill('unsaved-secret');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('updates-dialog').open&&document.getElementById('updates-token').value==='');assert.equal(await token.inputValue(),'');
  assert.equal(await page.locator('#settings-dialog').evaluate(node=>node.open),true,'Closing Updates retains its parent Settings dialog');
  await page.locator('#updates-open').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);await page.locator('#updates-access summary').click();
  await page.locator('#updates-disconnect').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);assert.equal(update.connected,false);
  assert.equal(await page.locator('#updates-check').isDisabled(),false,'Disconnect preserves public checks');
  await page.locator('#updates-check').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);assert.equal(await page.locator('#updates-install').isVisible(),true,'Disconnected users retain public install');
  await page.locator('#updates-access summary').click();
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);assert.deepEqual(errors,[]);
  const screenshot=path.join(__dirname,`software-updates-${width}-${language}.png`);await page.screenshot({path:screenshot});
  await page.locator('#updates-install').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);assert.equal(installs(),1,'Installation requires the explicit Update & restart action');
  report.cases.push({width,language,publicWithoutToken:true,credentialsCleared:true,accessRecovery:true,explicitInstall:true,nestedFocus:true,screenshot});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'software-updates-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
