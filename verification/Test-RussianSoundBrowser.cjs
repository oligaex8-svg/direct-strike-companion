'use strict';
// Production sound controls; isolated settings/preview API, no audible playback.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const cases=[];
 try{
  for(const width of [960,375]){
   const page=await browser.newPage({viewport:{width,height:920},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.setContent('<html lang="en"><meta charset="utf-8"><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><main style="max-width:900px;margin:auto;padding:16px"><h1>Notification sounds</h1><div id="controls"></div></main></html>');
   for(const file of ['style.css','ui.css','lobby.css','i18n.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   await page.addStyleTag({content:'body{display:block}main{width:100%;min-width:0}.live-control-details{width:100%}'});
   await page.evaluate(()=>{
    window.state={library:{settings:{language:'en',sound:true,notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:55,notificationSoundStyles:{loading:'sc1-research'}}}};
    window.esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    window.commanderName=value=>value;window.automationCommanderOptions=()=>'<option value="">Off</option>';window.toast=()=>{};window.refresh=async()=>{};window.renderLibrary=()=>{};
    window.requests=[];window.api=async(route,body)=>{requests.push({route,body});return route==='sounds/custom'?{}:body||{};};
   });
   for(const file of ['sound-library.js','ru-ui.js','i18n.js','lobby.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
   const library=await page.evaluate(()=>starcraftSoundLibrary),russian=library.sounds.filter(sound=>sound.language==='ru');
   assert.ok(russian.length>=12);
   await page.evaluate(()=>{liveCustomSoundLoaded=true;liveCustomSoundCheckedAt=Date.now();document.getElementById('controls').innerHTML=renderLiveGameSounds();document.querySelector('.live-control-details').open=true;});
   const menu=page.locator('[data-live-preference="preset"]'),eventMenu=page.locator('[data-sound-style="accept"]');
   await menu.selectOption(russian[0].preset);await page.waitForFunction(()=>!liveGameSoundSaving);
   await eventMenu.selectOption(russian[1].preset);await page.waitForFunction(()=>!liveGameSoundSaving);
   assert.equal(await menu.inputValue(),russian[0].preset);assert.equal(await eventMenu.inputValue(),russian[1].preset);
   await page.locator('.custom-sound-row [data-sound-preview="accept"]').click();
   const preview=await page.evaluate(()=>requests.filter(request=>request.route==='sounds/preview').at(-1));
   assert.equal(preview.body.preset,russian[1].preset);assert.equal(preview.body.volume,55);
   for(const language of ['ru','en']){
    await page.evaluate(language=>setInterfaceLanguage(language),language);
    assert.equal(await menu.inputValue(),russian[0].preset);assert.equal(await eventMenu.inputValue(),russian[1].preset);
    for(const sound of russian)assert.equal(await menu.locator(`option[value="${sound.preset}"]`).textContent(),sound[language]);
    const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scroll<=dimensions.client,JSON.stringify({width,language,...dimensions}));
    assert.ok((await page.locator('.live-sound-style-preview').innerText()).includes(language==='ru'?'на английском и русском':'English and Russian'));
    cases.push({width,language,russianPresets:russian.length,selectionPreserved:true,previewPreset:preview.body.preset,dimensions});
   }
   await page.evaluate(()=>setInterfaceLanguage('ru'));
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(__dirname,width===960?'russian-sounds-preview.png':'russian-sounds-mobile.png'),fullPage:true});
   await page.close();
  }
  const report={success:true,scope:'Production controls and catalog; isolated API; no private changes or audible playback',cases};
  fs.writeFileSync(path.join(__dirname,'russian-sound-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
