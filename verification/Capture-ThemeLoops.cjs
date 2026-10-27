'use strict';
// Actual UI captures, synthetic data, no game or private account connection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps})),sharp=require(require.resolve('sharp',{paths:deps}));sharp.concurrency(1);
const {routeApp,ready}=require('./Test-ThemeLoops.cjs'),fixture=require('./LocalPreviewFixture.cjs'),{themes}=require('./Build-ThemeVfx.cjs');
const ids=['fenix','nova','zerg','abathur','cerberus','arcade'],out=__dirname,web=path.join(__dirname,'../wwwroot'),framesDir=path.join(out,'local34-loop-frames');
async function seek(page,time){
 await page.evaluate(t=>{
  for(const a of document.getAnimations())if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t;}else a.finish();
  const frame=Math.floor(t/(1000/24))%96;
  for(const layer of document.querySelectorAll('.theme-vfx-layer[data-vfx-ready=true]')){
   const s=getComputedStyle(layer),cols=Number(s.getPropertyValue('--loop-cols')),w=parseFloat(s.getPropertyValue('--loop-width')),h=parseFloat(s.getPropertyValue('--loop-height'));
   const m=new DOMMatrixReadOnly(getComputedStyle(layer.querySelector('.vfx-loop-x')).transform);
   if(Math.abs(m.m41+w*(frame%cols))>.1||Math.abs(m.m42+h*Math.floor(frame/cols))>.1)throw Error('Atomic atlas frame failed: '+frame+'/'+layer.dataset.vfxRole);
  }
 },time);await page.evaluate(()=>new Promise(requestAnimationFrame));
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),still=process.env.DSC_LOOP_STILL==='1',strips=[],report={success:false,source:'Actual UI with synthetic fixture data',fps:24,framesPerTheme:96,loopsPerTheme:2,themes:ids};fs.mkdirSync(framesDir,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}});await routeApp(page,fixture('fenix','en'));await page.goto('http://loop34-capture.test/',{waitUntil:'domcontentloaded',timeout:10000});await page.waitForFunction(()=>state?.library&&window.DSThemeVfx);await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});await page.locator('nav [data-view=profile]').click();
  for(const id of ids){
   await ready(page,id);await page.locator('img').evaluateAll(els=>Promise.race([Promise.all(els.map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,2500))]));
   const box=await page.locator('.work-console>.page-head').boundingBox(),header=[];
   for(let frame=0;frame<(still?1:96);frame++){
    await seek(page,frame*1000/24+.5);const jpg=await page.screenshot({type:'jpeg',quality:90,animations:'allow'});fs.writeFileSync(path.join(framesDir,id+'-'+String(frame).padStart(3,'0')+'.jpg'),jpg);
    if(frame===32||still)await page.screenshot({path:path.join(out,'local34-theme-'+id+'.png'),animations:'allow'});
    header.push(await sharp(jpg).extract({left:Math.floor(box.x),top:Math.floor(box.y),width:Math.floor(box.width),height:Math.floor(box.height)}).resize(960,88,{fit:'contain',background:'#080d14'}).extend({top:22,bottom:0,left:0,right:0,background:'#080d14'}).composite([{input:Buffer.from('<svg width="960" height="22"><text x="12" y="16" fill="#d8e7ef" font-family="Arial" font-size="13">'+id+' · actual interface</text></svg>'),top:0,left:0}]).ensureAlpha().raw().toBuffer());
   }
   strips.push(header);console.log(JSON.stringify({phase:'captured',id,frames:header.length}));
  }
  if(!still){
   const film=[];for(let f=0;f<96;f++)film.push(Buffer.concat(strips.map(theme=>theme[f])));const height=110*ids.length;
   await sharp(Buffer.concat(film),{raw:{width:960,height:height*96,channels:4,pageHeight:height}}).gif({delay:Array.from({length:96},(_,i)=>i%6===2?50:40),loop:0,effort:2}).toFile(path.join(out,'local34-interface-loops.gif'));
   const list=[];for(const id of ids)for(let loop=0;loop<2;loop++)for(let f=0;f<96;f++)list.push("file '"+id+'-'+String(f).padStart(3,'0')+".jpg'\nduration 0.041666667");list.push("file 'arcade-095.jpg'");fs.writeFileSync(path.join(framesDir,'frames.txt'),list.join('\n'));
   const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1','-f','concat','-safe','0','-i',path.join(framesDir,'frames.txt'),'-r','24','-c:v','libx264','-threads','1','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'local34-interface-loops.mp4')],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.error);
  }
  await page.setViewportSize({width:1000,height:1000});const tiles=[],previewAssets=[];
  for(const {id,label} of themes){
   await ready(page,id);await seek(page,32*1000/24+.5);const full=await page.screenshot({path:path.join(out,'local34-theme-'+id+'.png'),animations:'allow'});
   const box=await page.locator('.work-console').boundingBox(),left=Math.max(0,Math.floor(box.x)-4),top=Math.max(0,Math.floor(box.y)-16);
   const thumbnail=await sharp(await page.screenshot({clip:{x:left,y:top,width:Math.min(1000-left,Math.ceil(box.width)+8),height:420},animations:'allow'})).resize({width:600}).webp({quality:92}).toBuffer();
   const relative='wwwroot/themes/previews/'+id+'.webp';fs.writeFileSync(path.join(__dirname,'..',relative),thumbnail);const m=await sharp(thumbnail).metadata();previewAssets.push({theme:id,path:relative,width:m.width,height:m.height,bytes:thumbnail.length,sha256:crypto.createHash('sha256').update(thumbnail).digest('hex')});
   const title=Buffer.from('<svg width="400" height="24"><text x="8" y="17" font-family="Arial" font-size="12" fill="#e1e9ef">'+id+' · '+label.replaceAll('&','&amp;')+'</text></svg>');
   tiles.push(await sharp(full).resize({width:400}).extend({top:24,bottom:0,left:0,right:0,background:'#0b1017'}).composite([{input:title,left:0,top:0}]).png().toBuffer());
  }
  await sharp({create:{width:1600,height:424*5,channels:4,background:'#0b1017'}}).composite(tiles.map((input,i)=>({input,left:i%4*400,top:Math.floor(i/4)*424}))).webp({quality:91}).toFile(path.join(out,'local34-interface-gallery.webp'));
  fs.writeFileSync(path.join(__dirname,'../assets/themes/preview-sources.json'),JSON.stringify({scope:'Actual interface with synthetic LocalPreviewFixture data; no live accounts',version:'1.1.7-local.34',viewport:{width:1000,height:1000},generator:'verification/Capture-ThemeLoops.cjs; authored frame32, no page opacity transitions',resize:'Uniform width600 from real console upper420px; aspect preserved',assets:previewAssets},null,2));
  report.success=true;report.frameAddressing={success:true,framesPerTheme:96,themes:6,atomicClock:true};report.previewAssets=20;fs.writeFileSync(path.join(out,'local34-motion-capture.json'),JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
