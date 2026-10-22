'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const report=JSON.parse(fs.readFileSync(path.join(__dirname,'nickname-ocr-readings.json'),'utf8').replace(/^\uFEFF/,''));
const regression=JSON.parse(fs.readFileSync(path.join(__dirname,'nickname-regression.json'),'utf8').replace(/^\uFEFF/,''));
assert.ok(report.Success && regression.Success);
const cases=report.Cases.filter(x=>x.Variant==='Production');
assert.equal(cases.length,4);assert.ok(cases.every(x=>x.Passed));
const image=fs.readFileSync(path.join(__dirname,'fixtures/nicknames/combined-lobby.png')).toString('base64');
const escape=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let browser;
(async()=>{
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:655},deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  const rows=cases.map(item=>`<section><div class="captured"><div class="crop" style="width:${item.Crop.Width*2}px;height:${item.Crop.Height*2}px;background-position:-${item.Crop.Left*2}px -${item.Crop.Top*2}px"></div></div><div><small>Previous reading</small><p class="old">${escape(item.Raw)}</p></div><div><small>Verified reading</small><p class="correct">${escape(item.Selected)}</p></div></section>`).join('');
  await page.setContent(`<html lang="en"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#0b121b;color:#dce8f6;font:16px "Segoe UI",sans-serif}h1{font-size:26px;margin:0 0 10px}header p{margin:0 0 25px;color:#9cb3cb}.status{float:right;font-size:16px;color:#77e5bf}section{display:grid;grid-template-columns:390px 210px 1fr;align-items:center;border:1px solid #30445a;background:#111e2b;border-radius:5px;margin:12px 0;padding:17px;min-height:100px;gap:16px}small{color:#9cb3cb;font-size:12px}p{margin:7px 0 0}.old{color:#b9c6d5}.correct{font-size:20px;font-weight:600;color:#77e5bf}.crop{background-image:url(data:image/png;base64,${image});background-size:2124px 1946px;background-repeat:no-repeat}.captured{overflow:hidden}footer{font-size:13px;color:#9cb3cb;line-height:1.6;margin-top:22px}</style></head><body><header><h1>Nickname OCR · screenshot check <span class="status">4 / 4 passed</span></h1><p>Original game pixels beside the corrected recognition results.</p></header>${rows}<footer>Full SC2 lobby test also passed: Ваня Кузьмич, TKnight, Dagasman · Team 1 · Americas.<br>Offline screenshot verification. The host crop uses its known host label; the full lobby tests label detection.</footer></body></html>`);
  await page.screenshot({path:path.join(__dirname,'nickname-ocr-preview.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,'nickname-ocr-preview.json'),JSON.stringify({success:true,source:'Supplied game pixels and bundled screen-reader regression output',cases:cases.map(({Expected,Selected,Passed})=>({Expected,Selected,Passed})),fullLobby:regression},null,2));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
