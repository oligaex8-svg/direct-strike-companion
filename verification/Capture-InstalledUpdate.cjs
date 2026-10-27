'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const [url,version,output]=process.argv.slice(2);
assert.equal(new URL(url).hostname,'127.0.0.1');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  // First-run dialogs belong to the isolated empty library, not the updater.
  await page.locator('#sidebar-updates').waitFor();
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()));
  await page.locator('#sidebar-updates').click();
  await page.locator('#updates-dialog').waitFor({state:'visible'});
  await page.waitForFunction(version=>document.querySelector('#updates-version')?.textContent.includes(version),version);
  await page.locator('#updates-dialog').screenshot({path:output,animations:'disabled'});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
