'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
sharp.concurrency(1);sharp.cache({memory:16,files:0});
(async()=>{
 const out=path.join(__dirname,'local54-character-ui'),report=JSON.parse(fs.readFileSync(path.join(out,'report.json')));assert.ok(report.success);
 const layers=[];
 for(const [i,c] of report.cases.entries()){
  // Actual sidebar capture, including its real nav/dock boundaries, not concept art.
  const crop=await sharp(path.join(out,c.profile)).extract({left:0,top:535,width:205,height:330}).png().toBuffer();
  const x=(i%5)*240,y=Math.floor(i/5)*370;
  layers.push({input:crop,left:x+17,top:y+30});
  layers.push({input:Buffer.from('<svg width="240" height="30"><text x="17" y="22" fill="#dbe6ed" font-family="Segoe UI" font-size="16">'+c.id+'</text></svg>'),left:x,top:y});
 }
 await sharp({create:{width:1200,height:1110,channels:4,background:'#10161e'}}).composite(layers).png().toFile(path.join(out,'all-themes.png'));
 const items=report.cases.map(c=>`<section><h2>${c.id}</h2><a href="${c.profile}"><img loading="lazy" src="${c.profile}" alt="${c.id} actual interface"></a><p><a href="${c.settings}">Settings preview</a>${['nerazim','nova','dehaka'].includes(c.id)?` · <a href="${c.id}-native.gif">Native loop recording</a>`:''}</p></section>`).join('');
 fs.writeFileSync(path.join(out,'gallery.html'),'<!doctype html><meta charset="utf-8"><title>Local 54 — actual theme captures</title><style>body{background:#080d13;color:#dbe6ed;font:16px Segoe UI;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:24px}img{width:100%}a{color:#8cd8ee}h2{text-transform:capitalize}</style><h1>Local 54 — fifteen original SC2 theme objects</h1><p>Actual application captures with synthetic replay data. Select an image for full resolution.</p><main>'+items+'</main>');
 console.log('Actual UI gallery and fifteen-theme contact sheet saved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
