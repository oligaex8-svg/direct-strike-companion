'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const races=['default','protoss','zerg','terran'],titles=['SC2 menu','Protoss','Zerg','Terran'];
const html=path.join(__dirname,'sidebar-preview.html'),screenshot=path.join(__dirname,'sidebar-preview.png');
for(const race of races)if(!fs.existsSync(path.join(__dirname,`sidebar-${race}-1000-en.png`)))throw Error('Missing tested sidebar '+race);
fs.writeFileSync(html,`<!doctype html><meta charset="utf-8"><title>Companion sidebar</title><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#060d17;color:#e8f2ff;font:13px 'Segoe UI',sans-serif}header{display:flex;justify-content:space-between;margin-bottom:12px}header span{color:#a9bfd0}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;border:1px solid #365f7f}figcaption{padding:8px;background:#0a1929}img{display:block;width:100%;height:auto}</style><header><strong>SC2 navigation</strong><span>Actual UI · sample data</span></header><main>${races.map((race,i)=>`<figure><figcaption>${titles[i]}</figcaption><a href="sidebar-${race}-1000-en.png"><img alt="${titles[i]} sidebar" src="sidebar-${race}-1000-en.png"></a></figure>`).join('')}</main>`);
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 const page=await browser.newPage({viewport:{width:788,height:800}});await page.goto(pathToFileURL(html).href);
 await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(node=>node.decode())));
 await page.screenshot({path:screenshot,fullPage:true});console.log(JSON.stringify({success:true,html,screenshot}));
}finally{await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
