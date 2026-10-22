'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^\uFEFF/,''));
const packaged=read('compiled-reader-package-tests.json'),temp=read('compiled-reader-unusable-temp.json'),repair=read('compiled-reader-runtime-repair.json'),proof=read('reader-proof-lifetime.json');
const state=read('compiled-reader-live-state.json'),latest=state.Lobby;
const recovered=!!latest?.reader?.lastRead||state.LastSuccessfulObservation?.LastError===null;
const full=read('self-tests-compiled-reader-startup.json');
assert.ok(packaged.success&&temp.success&&temp.unusableTemp&&proof.Success&&repair.ProcessesPreserved);
const esc=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1000,height:710},deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#0b121b;color:#dfebf6;font:16px "Segoe UI",sans-serif}h1{margin:0 0 12px;font-size:27px}p{line-height:1.5;color:#b4c9da}.issue{background:#191e29;border-left:3px solid #ec9b9b;padding:15px;margin:20px 0}.checks{display:grid;grid-template-columns:1fr 1fr;gap:16px}.check{background:#122330;border:1px solid #2c4b5c;border-radius:5px;padding:18px}.check strong{display:block;color:#78e2be;margin-bottom:8px}.names{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.names span{padding:9px 12px;background:#172738;border:1px solid #30465c;border-radius:4px}.pending{color:#ecc476}footer{color:#b4c9da;font-size:13px;margin-top:22px;line-height:1.6}</style></head><body><h1>Reader startup repair · verified checks</h1><p>The installed reader was failing before it could read a frame.</p><div class="issue">Recorded failure: runtime C# compiler could not find its temporary source file.</div><div class="checks"><div class="check"><strong>Compiled helper bundled</strong>${packaged.checks.length} checks passed, including Windows PowerShell CLR compatibility and file restoration.</div><div class="check"><strong>Unusable TEMP / TMP</strong>${temp.coldReads.length} fresh reads and ${temp.warmReads.length} reused-worker reads returned all six screenshot names.</div><div class="check"><strong>Fresh frame proofs</strong>${proof.Checks.length} checks passed. Previous-frame pixel evidence is released, including after an error.</div><div class="check"><strong>Applied without closing the game</strong>Reader files replaced in place. Existing game and companion processes preserved.</div></div><div class="names">${temp.names.map(name=>`<span>${esc(name)}</span>`).join('')}</div><footer>${recovered?'Startup recovered in the running app. SC2 and the companion are now closed; live join timing is unverified.':'<span class="pending">Live reader recovery remains unverified.</span>'}<br>Name results above come from the supplied lobby screenshot, not a claim of live join timing.<br>${full.results?.length?`${full.results.length} complete app assertions passed.`:'The full regression run was stopped at the system resource limit; the focused startup checks passed.'}</footer></body></html>`);
  assert.equal(await page.locator('.names span').count(),6);
  await page.screenshot({path:path.join(__dirname,'compiled-reader-preview.png'),fullPage:true});
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
