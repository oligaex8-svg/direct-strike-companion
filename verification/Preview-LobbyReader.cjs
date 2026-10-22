'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),output=path.join(root,'release/test-output');
const performance=JSON.parse(fs.readFileSync(path.join(output,'lobby-reader-performance.json'),'utf8'));
const frame=JSON.parse(fs.readFileSync(path.join(output,'lobby-reader-fixture.json'),'utf8'));
assert.ok(performance.success);assert.equal(frame.capture.live,false);
assert.deepEqual(performance.names,['Ваня Кузьмич','Константин Юсупов','TKnight','bombplay','jejo','ChudoNapas']);
assert.deepEqual(frame.rosterTeams,[1,1,1,2,2,2]);
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const cold=median(performance.coldReads.map(read=>read.milliseconds)),warm=performance.warmedMedianMs;
const png=fs.readFileSync(path.join(__dirname,'fixtures/nicknames/six-player-lobby.png'));
const width=png.readUInt32BE(16),height=png.readUInt32BE(20),scale=.70;
const esc=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
(async()=>{
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:900},deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  const teams=[1,2].map(team=>`<section class="team team-${team}"><header>Team ${team}<span>3 / 3 detected</span></header>${frame.rosterNames.filter((_,i)=>frame.rosterTeams[i]===team).map(name=>`<p>${esc(name)}</p>`).join('')}</section>`).join('');
  await page.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#0b121b;color:#dceafa;font:16px "Segoe UI",sans-serif}h1{font-size:27px;margin:0 0 8px}h2{font-size:17px;margin:0 0 16px}.intro,footer{color:#aec2d5;line-height:1.55}.intro{margin:0 0 25px}.timings{display:flex;gap:18px;margin-bottom:28px}.timings>div{flex:1;border:1px solid #304459;background:#111e2b;padding:18px;border-radius:5px}.timings strong{display:block;font-size:30px;margin:5px 0}.warm strong{color:#77e5bf}.timings small{color:#aec2d5}.comparison{display:grid;grid-template-columns:490px 1fr;gap:28px}.original{width:480px;height:478px;background:url(data:image/png;base64,${png.toString('base64')}) no-repeat;background-size:${width*scale}px ${height*scale}px;background-position:-${85*scale}px -${185*scale}px;border:1px solid #304459;border-radius:5px}.team{border:1px solid #79dcb4;border-radius:5px;margin-bottom:18px;overflow:hidden;background:#111e2b}.team-2{border-color:#ed7c90}.team header{font-weight:600;padding:12px;color:#79dcb4;background:#152435}.team-2 header{color:#ed7c90}.team header span{float:right;font-size:13px}.team p{padding:20px 14px;margin:0;border-top:1px solid #304459;font-weight:600}footer{font-size:13px;margin-top:23px}.passed{color:#77e5bf}</style></head><body><h1>Lobby reader · verified screenshot</h1><p class="intro">All six observed names match your game pixels. The short name “jejo” is included.</p><div class="timings"><div>Fresh process each read<strong>${(cold/1000).toFixed(2)} s</strong><small>Median of 3 reads</small></div><div class="warm">Reader stays initialized<strong>${(warm/1000).toFixed(2)} s</strong><small>Median of 4 warm reads · ${Math.round((1-warm/cold)*100)}% less time</small></div></div><div class="comparison"><div><h2>Your screenshot</h2><div class="original"></div></div><div><h2>Actual bundled reader output <span class="passed">6 / 6</span></h2>${teams}</div></div><footer>Offline screenshot verification with native Windows PowerShell ${esc(performance.coldReads[0].runtime.version)}.<br>Timings cover recognition and reader transport; live capture, polling and public statistics requests add time.<br>The screenshot has no live-input authority. New joins in a running lobby still need verification after restarting the updated app.</footer></body></html>`);
  assert.equal(await page.locator('.team p').count(),6);
  assert.equal(await page.locator('.team-2 p').nth(1).innerText(),'jejo');
  await page.screenshot({path:path.join(__dirname,'lobby-reader-preview.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,'lobby-reader-preview.json'),JSON.stringify({success:true,names:frame.rosterNames,teams:frame.rosterTeams,coldMedianMs:cold,warmMedianMs:warm,live:false},null,2));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
