'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),report={success:false,scope:'Production UI, isolated private release API; no real credentials/download/restart',cases:[]};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of [1440,375])for(const language of ['en','ru']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));
  const settings={language,selfIds:[],replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,autoAcceptMatch:false,autoPickCommander:'',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:55,notificationSoundStyles:{}};
  let update={currentVersion:'1.0.0',repository:'private-owner/direct-strike-companion',connected:false,state:'idle',message:'Connect GitHub to check private releases.'},fail=false;
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
  await page.locator('#sidebar-updates').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.equal(await page.locator('#updates-dialog').isVisible(),true,'Sidebar opens update checks directly');
  await page.keyboard.press('Escape');
  await page.locator('#settings-open').click();await page.locator('#updates-open').click();
  const dialog=page.locator('#updates-dialog'),token=page.locator('#updates-token');await page.waitForFunction(()=>!softwareUpdateUiBusy);
  assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('#updates-check').isDisabled(),true);assert.equal(await page.locator('#updates-install').isVisible(),false);
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
  await token.fill('test-only-token-not-real-12345');await page.locator('#updates-connect button[type=submit]').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);await page.locator('#updates-check').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);
  await page.locator('#updates-access summary').click();
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);assert.deepEqual(errors,[]);
  const screenshot=path.join(__dirname,`auto-software-updates-${width}-${language}.png`);await page.screenshot({path:screenshot});
  await page.locator('#updates-install').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);assert.equal(installs(),1,'Installation requires the explicit Update & restart action');
  assert.equal(calls.filter(call=>call.api==='software-updates/install').at(-1).body.version,'1.1.0','Manual install binds approval to the displayed version');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  update={...update,connected:true,state:'available',availableVersion:'1.2.0',message:'An update is available.'};
  await page.evaluate(()=>refreshLiveData());
  const prompt=page.locator('#update-prompt-dialog');
  await page.waitForFunction(()=>document.getElementById('update-prompt-dialog').open);
  assert.equal(installs(),1,'An automatic update discovery never installs without a choice');
  assert.match(await page.locator('#update-prompt-version').textContent(),/1\.2\.0/);
  assert.equal(await page.locator('#update-prompt-title').textContent(),language==='ru'?'Доступно обновление':'Update available');
  const promptShot=path.join(__dirname,`auto-update-prompt-${width}-${language}.png`);await page.screenshot({path:promptShot});
  await page.locator('#update-prompt-later').click();await page.evaluate(()=>refreshLiveData());assert.equal(await prompt.isVisible(),false,'Later suppresses the same version');
  lobby.phase='match';update={...update,availableVersion:'1.3.0'};await page.evaluate(()=>refreshLiveData());assert.equal(await prompt.isVisible(),false,'No update interruption during a match');
  lobby.phase='pregame';await page.evaluate(()=>refreshLiveData());await page.waitForFunction(()=>document.getElementById('update-prompt-dialog').open);
  await page.locator('#update-prompt-now').click();await page.waitForFunction(()=>!softwareUpdateUiBusy);assert.equal(installs(),2,'Update now is the sole automatic-prompt install trigger');
  assert.equal(calls.filter(call=>call.api==='software-updates/install').at(-1).body.version,'1.3.0','Automatic prompt binds approval to the displayed version');
  await page.keyboard.press('Escape');await page.locator('#settings-open').click();
  update={...update,state:'available',availableVersion:'1.4.0'};await page.evaluate(()=>refreshLiveData());assert.equal(await prompt.isVisible(),false,'Other dialogs keep their focus and drafts');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('update-prompt-dialog').open);
  update={...update,availableVersion:'1.5.0'};await page.evaluate(()=>refreshLiveData());assert.match(await page.locator('#update-prompt-version').textContent(),/1\.5\.0/,'An open prompt always names the version offered for installation');
  update={...update,state:'checking',availableVersion:null};await page.evaluate(()=>refreshLiveData());assert.equal(await page.locator('#update-prompt-now').isDisabled(),true);
  update={...update,state:'available',availableVersion:'1.5.0'};await page.evaluate(()=>refreshLiveData());await page.locator('#update-prompt-later').click();
  await page.reload();await page.waitForFunction(()=>!!state?.library);assert.equal(await prompt.isVisible(),false,'Same-tab reload remembers Later for this version');
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));
  update={...update,availableVersion:'1.6.0'};await page.evaluate(()=>refreshLiveData());assert.equal(await prompt.isVisible(),false,'Hidden UI never prompts');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.getElementById('update-prompt-dialog').open);await page.locator('#update-prompt-later').click();
  assert.ok(await page.locator('#sidebar-updates').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  const sidebarShot=path.join(__dirname,`update-sidebar-${width}-${language}.png`);await page.screenshot({path:sidebarShot});
  assert.deepEqual(errors,[]);
  report.cases.push({width,language,credentialsCleared:true,accessRecovery:true,explicitInstall:true,nestedFocus:true,automaticPrompt:true,oncePerVersion:true,deferredInMatch:true,deferredWhenHidden:true,sidebar:true,promptShot,sidebarShot,screenshot});await page.close();
 }
 report.success=true;
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,'auto-software-updates-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
