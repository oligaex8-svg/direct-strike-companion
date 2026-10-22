'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
const detections=JSON.parse(fs.readFileSync(path.join(root,'release/test-output/invite-screenshot-detection.json'),'utf8'));
const fixtures=[['sc2-latest-party','Party invitation','C:/Users/Admin/AppData/Local/Temp/codex-clipboard-e148f36a-1c3e-47d4-93ac-563bfb96aeab.png'],['sc2-latest-game','Direct Strike game invitation','C:/Users/Admin/AppData/Local/Temp/codex-clipboard-81f520ec-78fe-4b92-9d97-cc78da742c8c.png']];
let browser;
(async()=>{
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1050,height:1040},deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  const rows=fixtures.map(([key,title,file])=>{
   const detection=detections.find(x=>x.key===key);assert.ok(detection.accept && detection.kind);
   const {x,y,width,height}=detection.accept;
   const scale=Math.min(900/detection.width,320/detection.height);
   return `<section><h2>${title} <span>Accept detected</span></h2><div class="frame" style="width:${Math.round(detection.width*scale)}px;height:${Math.round(detection.height*scale)}px"><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"/><b style="left:${x*scale-5}px;top:${y*scale-5}px;width:${width*scale+10}px;height:${height*scale+10}px"></b></div><p>${detection.kind} · exact invitation text and Accept/Decline layout recognized</p></section>`;
  }).join('');
  await page.setContent(`<html><head><style>body{margin:0;background:#0b121b;color:#dbeafa;font:16px Segoe UI;padding:28px}h1{font-size:25px;margin:0 0 10px}p{color:#a7bed1;margin:12px 0}section{padding:18px;background:#121e2c;border:1px solid #304259;margin:20px 0;border-radius:6px}h2{font-size:18px;margin:0 0 16px}h2 span{float:right;color:#75e3b7;font-size:14px}.frame{position:relative;margin:auto}img{width:100%;height:100%}b{position:absolute;display:block;box-sizing:border-box;border:2px solid #75e3b7;border-radius:4px;box-shadow:0 0 8px #75e3b7}</style></head><body><h1>Invite detection verification</h1><p>Your two latest screenshots processed by the built tool.</p>${rows}<p>Offline detection verified. A real SC2 acceptance is still unconfirmed.</p></body></html>`);
  await page.screenshot({path:path.join(__dirname,'invite-detection-preview.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,'invite-detection-preview.json'),JSON.stringify({success:true,source:'Built EXE screenshot recognizer output',fixtures:fixtures.map(([key])=>detections.find(x=>x.key===key))},null,2));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
