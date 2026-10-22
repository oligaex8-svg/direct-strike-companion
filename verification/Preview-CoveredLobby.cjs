'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
const result=JSON.parse(fs.readFileSync(path.join(__dirname,'covered-lobby-regression.json'),'utf8').replace(/^\uFEFF/,''));
assert.ok(result.Success);assert.equal(result.ModeVerified,false);
const png=fs.readFileSync(path.join(__dirname,'fixtures/nicknames/covered-lobby.png'));
const sourceWidth=png.readUInt32BE(16),sourceHeight=png.readUInt32BE(20),scale=.68;
const escape=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let browser;
(async()=>{
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1060,height:860},deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  const groups=[1,2].map(team=>`<section class="team team-${team}"><header>Team ${team}<span>${result.Teams.filter(x=>x===team).length} detected</span></header>${result.Names.filter((_,i)=>result.Teams[i]===team).map(name=>`<p>${escape(name)}</p>`).join('')}</section>`).join('');
  await page.setContent(`<html><head><meta charset="utf-8"><style>:root{--bg:#0b121b;--text:#dbeafa;--muted:#aec2d5;--accent:#61d8ed;--amber:#edb95f;--border:#304459}*{box-sizing:border-box}body{margin:0;padding:30px;background:var(--bg);color:var(--text);font:16px "Segoe UI",sans-serif}h1{font-size:25px;margin:0 0 10px}h2{font-size:17px;margin:0 0 15px}.intro{color:var(--muted);margin:0 0 25px}.passed{float:right;color:#77e5bf;font-size:16px}.comparison{display:grid;grid-template-columns:490px 1fr;gap:25px}.original{width:470px;height:455px;background-image:url(data:image/png;base64,${png.toString('base64')});background-size:${sourceWidth*scale}px ${sourceHeight*scale}px;background-position:-${75*scale}px -${180*scale}px;background-repeat:no-repeat;border:1px solid var(--border);border-radius:5px}.team{border:1px solid #79dcb4;border-radius:5px;margin-bottom:17px;overflow:hidden;background:#111e2b}.team-2{border-color:#ed7c90}.team header{font-weight:600;padding:12px;color:#79dcb4;background:#152435}.team-2 header{color:#ed7c90}.team header span{float:right;font-size:13px}.team p{padding:19px 14px;margin:0;border-top:1px solid #304459;font-weight:600}.live-overview{padding:15px;background:#111e2b;border:1px solid var(--border);border-radius:5px;margin-top:20px}.live-overview details{font-size:12px;color:var(--muted);margin-top:10px}.live-status-line{display:flex;gap:15px;align-items:center}.live-status-line h3{font-size:15px;margin:0}.live-status-line span{font-size:12px;color:var(--accent)}footer{color:var(--muted);font-size:12px;line-height:1.6;margin-top:20px}@media(max-width:600px){body{padding:16px}.comparison{display:block}.original{max-width:100%;margin-bottom:20px}.live-status-line{flex-wrap:wrap}.passed{float:none;display:block;margin-top:8px}}</style></head><body><h1>Covered lobby · screenshot regression <span class="passed">4 names detected</span></h1><p class="intro">Readable team panels now work with the mode setting covered.</p><div class="comparison"><div><h2>Your game pixels</h2><div class="original"></div></div><div><h2>Bundled reader output</h2>${groups}</div></div><div class="live-lobby"><section class="live-overview"><div class="live-status-line"><h3>Empty-roster status test</h3><span>No roster source</span></div><div id="actual-status"></div><details class="live-monitor-details"><summary>Detection details</summary></details></section></div><footer>Screenshot test: exact names and panel teams passed. Mode and region remain unconfirmed.<br>The status below an empty roster is rendered by the actual dashboard code; this is an offline test, not a live lobby claim.</footer></body></html>`);
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'wwwroot/lobby.css'),'utf8')});
  await page.evaluate(()=>{window.esc=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));});
  for(const file of ['sound-library.js','lobby.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'wwwroot',file),'utf8')});
  await page.evaluate(()=>{document.getElementById('actual-status').innerHTML=renderLobbyDetectionStatus({ocrStatus:'Checking visible SC2 window…'},[]);});
  assert.equal(await page.locator('.live-detection-status').innerText(),'Checking visible SC2 window…');
  assert.equal(await page.locator('.live-monitor-details').getAttribute('open'),null);
  await page.screenshot({path:path.join(__dirname,'covered-lobby-preview.png'),fullPage:true});
  await page.setViewportSize({width:375,height:900});
  assert.ok(await page.locator('.live-detection-status').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  fs.writeFileSync(path.join(__dirname,'covered-lobby-preview.json'),JSON.stringify({success:true,names:result.Names,modeVerified:false,desktopStatusVisible:true,mobileStatusVisible:true,detailsClosed:true},null,2));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
