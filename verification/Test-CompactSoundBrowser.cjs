'use strict';
// Run under the parent's resource guard. Offline UI fixture; no sound or game input.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:960,height:900},reducedMotion:'reduce'});
  await page.setContent('<select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div class="app"><aside class="sidebar">Direct Strike Companion</aside><main id="content" data-view="lobby" style="width:100%;min-width:0"></main></div>');
  for(const file of ['style.css','lobby.css','ui.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
  await page.evaluate(()=>{
   window.state={library:{settings:{language:'en',sound:true,autoAcceptMatch:true,autoPickCommander:'Random',notificationSoundPreset:'sc2-nuclear',notificationSoundVolume:80,notificationSoundStyles:{}}}};
   window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
   window.automationCommanderOptions=s=>['','Random','Raynor'].map(v=>`<option value="${v}"${v===s?' selected':''}>${v||'Off'}</option>`).join('');
   window.commanderName=s=>s;window.toast=()=>{};
   window.api=async(_route,body)=>body;
  });
  for(const file of ['sound-library.js','ru-ui.js','i18n.js','lobby.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
  await page.evaluate(()=>{
   window.renderLiveLobby=()=>`<div class="live-lobby"><section class="live-overview"><div class="live-status-line"><h3>Pregame lobby</h3><span>3 names detected · partial roster</span></div>${renderLiveGameSounds()}<details class="live-monitor-details"><summary>Detection details</summary></details></section><div class="live-roster-heading"><h3>Detected names</h3></div><div class="live-roster-grid"><section class="live-team-group live-team-1"><header class="live-team-head"><h3>Horde</h3></header><div class="live-slot">TKnight</div><div class="live-slot">Dagasman</div></section><section class="live-team-group live-team-2"><header class="live-team-head"><h3>Alliance</h3></header><div class="live-slot">Waiting for names</div></section></div><form id="live-lobby-form"></form><div class="live-footer"></div></div>`;
   window.renderLibrary=()=>updateLiveLobby(document.getElementById('content'));
   window.refresh=async()=>renderLibrary();renderLibrary();
  });
  const controls=page.locator('.live-control-details');
  assert.equal(await controls.evaluate(node=>node.open),false);
  const closedHeight=await page.locator('.live-overview').evaluate(node=>node.getBoundingClientRect().height);
  assert.ok(closedHeight<140,`Collapsed status panel is ${closedHeight}px`);
  await controls.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await controls.evaluate(node=>node.open),true);
  const library=await page.evaluate(()=>starcraftSoundLibrary);
  const globalMenu=page.locator('[data-live-preference="preset"]');
  assert.equal(await globalMenu.locator('optgroup').count(),library.categories.length);
  assert.equal(await globalMenu.locator('option').count(),library.sounds.length);
  for(const category of library.categories)assert.equal(await globalMenu.locator(`optgroup[label="${category.en}"]`).count(),1);
  await page.locator('[data-sound-style="accept"]').focus();
  await page.locator('[data-sound-style="accept"]').selectOption('sc1-nuclear');
  await page.waitForFunction(()=>!liveGameSoundSaving);
  assert.equal(await controls.evaluate(node=>node.open),true);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.soundStyle),'accept');
  await page.evaluate(()=>updateLiveLobby(document.getElementById('content')));
  assert.equal(await controls.evaluate(node=>node.open),true);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.soundStyle),'accept');
  await page.locator('[data-live-preference="volume"]').focus();
  await page.evaluate(()=>updateLiveLobby(document.getElementById('content')));
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.livePreference),'volume');
  const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.client,JSON.stringify(dimensions));
  await page.evaluate(()=>setInterfaceLanguage('ru'));
  for(const category of library.categories)assert.equal(await globalMenu.locator(`optgroup[label="${category.ru}"]`).count(),1);
  for(const sound of library.sounds)assert.equal(await globalMenu.locator(`option[value="${sound.preset}"]`).textContent(),sound.ru);
  assert.equal(await page.locator('[data-sound-style="accept"]').inputValue(),'sc1-nuclear');
  await page.evaluate(()=>setInterfaceLanguage('en'));
  for(const category of library.categories)assert.equal(await globalMenu.locator(`optgroup[label="${category.en}"]`).count(),1);
  for(const sound of library.sounds)assert.equal(await globalMenu.locator(`option[value="${sound.preset}"]`).textContent(),sound.en);
  await page.evaluate(()=>setInterfaceLanguage('ru'));
  const ruDimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(ruDimensions.scroll<=ruDimensions.client,JSON.stringify(ruDimensions));
  await page.screenshot({path:path.join(__dirname,'compact-sounds-960-ru.png'),fullPage:true});
  await controls.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  await page.evaluate(()=>updateLiveLobby(document.getElementById('content')));
  assert.equal(await controls.evaluate(node=>node.open),false);
  const report={success:true,closedHeight,dimensions,ruDimensions,checks:['default collapsed height','keyboard expand/collapse','expanded state through save and polling','event dropdown focus through save and polling','volume focus through polling','960px EN/RU no horizontal overflow','complete library in native category groups','EN/RU category and recording labels switch back without changing selection']};
  fs.writeFileSync(path.join(__dirname,'compact-sound-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
