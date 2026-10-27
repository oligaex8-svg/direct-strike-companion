'use strict';
// Guarded, synthetic actual-UI evidence. Never loads the user's private library.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const {routeApp,ready}=require('./Test-ThemeLoops.cjs'),fixture=require('./LocalPreviewFixture.cjs'),{themes}=require('./Build-ThemeVfx.cjs');
const output=path.join(__dirname,'local35-equipment-capture'),framesDir=path.join(output,'frames'),FPS=24,SECONDS=6,FRAMES=FPS*SECONDS;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function seek(page,elapsed){
 await page.evaluate(t=>{
  for(const a of document.getAnimations()){
   if(a.effect.getTiming().iterations===Infinity){a.playbackRate=0;a.currentTime=t;}else if(a.playState!=='finished')a.finish();
  }
 },elapsed);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 return page.evaluate(t=>{
  let checked=0;
  const check=(layer,selector,widthName,heightName)=>{
   const target=layer.querySelector(selector),animation=target?.getAnimations()[0];if(!animation)return;
   const timing=animation.effect.getTiming(),frames=animation.effect.getKeyframes().length-1,frame=Math.floor((t%timing.duration)/timing.duration*frames),s=getComputedStyle(layer);
   const width=parseFloat(s.getPropertyValue(widthName)),height=parseFloat(s.getPropertyValue(heightName));
   const cols=layer.classList.contains('theme-equipment-layer')?window.DSThemeEquipmentCatalog[layer.dataset.equipmentTheme][layer.dataset.equipmentPart].columns:Number(s.getPropertyValue('--loop-cols'));
   const matrix=new DOMMatrixReadOnly(getComputedStyle(target).transform);
   if(Math.abs(matrix.m41+width*(frame%cols))>.1||Math.abs(matrix.m42+height*Math.floor(frame/cols))>.1)throw Error('Atomic atlas seek failed: '+(layer.dataset.equipmentKey||layer.dataset.vfxKey));checked++;
  };
  for(const el of document.querySelectorAll('.theme-vfx-layer[data-vfx-ready=true]:not([hidden])'))check(el,'.vfx-loop-x','--loop-width','--loop-height');
  for(const el of document.querySelectorAll('.theme-equipment-layer[data-equipment-ready=true]:not([hidden])'))check(el,'.equipment-clock','--equipment-width','--equipment-height');
  return checked;
 },elapsed);
}
async function themeReady(page,id){
 await ready(page,id);await page.evaluate(()=>window.DSThemeEquipment?.refresh());
 await page.waitForFunction(id=>window.DSThemeEquipment&&[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].every(el=>el.dataset.equipmentTheme===id&&el.dataset.equipmentReady==='true'),id);
 await page.locator('img').evaluateAll(els=>Promise.race([Promise.all(els.map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,2500))]));
}
function ffmpeg(args){const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1',...args],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||String(result.error)||'ffmpeg failed');}
function verifyRasterSet(){
 const root=path.resolve(__dirname,'..'),large=require('./Build-ThemeLoops.cjs'),small=require('./Build-ThemeEquipment.cjs');
 const loops=JSON.parse(fs.readFileSync(path.join(root,'wwwroot/themes/loops/manifest.json'),'utf8')),equipment=JSON.parse(fs.readFileSync(path.join(root,'wwwroot/themes/equipment/manifest.json'),'utf8'));
 if(loops.revision!==4||loops.generatorSha256!==large.GENERATOR_HASH||loops.assets.length!==40||loops.assets.some(a=>a.composition?.renderer!=='ThemeEquipmentRaster.cjs'||a.composition.codePaintedFallback!==false))throw Error('Complete the forty .35 raster inlays before capture; CG history is not a visible fallback');
 if(equipment.assets.length!==80||equipment.sourceSha256!==small.SOURCE_HASH||equipment.assets.some(a=>a.sourceSha256!==small.SOURCE_HASH))throw Error('Complete the eighty .35 raster equipment atlases before capture');
 return {large:large.GENERATOR_HASH,small:small.SOURCE_HASH};
}
function html(report){
 const movies=report.motion.map(item=>`<section><h2>${escape(item.id)} · six seconds at 24 fps</h2><video controls preload="metadata" width="100%" poster="${item.id}-full-ui.png"><source src="${item.id}-full-ui.mp4" type="video/mp4"></video></section>`).join('');
 const stills=report.stills.map(item=>`<figure><a href="${item.file}"><img loading="lazy" src="${item.file}" alt="${escape(item.id)} actual interface with raster equipment"></a><figcaption>${escape(item.id)} · ${item.visibleDevices} visible devices · ${item.categories.length} categories</figcaption></figure>`).join('');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local.35 raster equipment · actual UI evidence</title><style>body{margin:24px;background:#0b1017;color:#d8e3ed;font:15px/1.55 system-ui}main{max-width:1600px;margin:auto}h1{font-size:25px}section{margin:32px 0}video,img{max-width:100%;height:auto;display:block}figure{margin:0}figcaption{padding:8px 0}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}a{color:#9bd4e9}@media(max-width:800px){.gallery{grid-template-columns:1fr}}</style><main><h1>Local.35 · physical raster equipment</h1><p>Actual 1600×1000 UI with synthetic data. Original component pixels form the housings; interior mechanisms animate independently. No live account data or game connection.</p><p>Videos use a common elapsed clock: large inlays repeat every four seconds and small equipment every six seconds. These six-second recordings are intentionally not presented as a seamless combined loop.</p>${movies}${report.gif?'<p><a href="local35-equipment-overview.gif">Open the one-shot GIF overview</a> · <a href="local35-full-ui-equipment.mp4">Open the full-resolution video</a></p>':''}<h2>All twenty themes</h2><div class="gallery">${stills}</div></main></html>`;
}
async function capturePreviews(browser,report){
 const sharp=require(require.resolve('sharp',{paths:deps}));sharp.concurrency(1);
 const previewRoot=path.resolve(__dirname,'../wwwroot/themes/previews'),previews=[];
 for(const {id} of themes){
  const page=await browser.newPage({viewport:{width:1000,height:1000}});page.setDefaultTimeout(20000);
  try{
   await routeApp(page,fixture(id,'en'));await page.goto('http://equipment35-preview.test/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>state?.library&&window.DSThemeVfx&&window.DSThemeEquipment);await page.bringToFront();
   await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});await page.locator('nav [data-view=profile]').click();
   await themeReady(page,id);await seek(page,32*1000/FPS+.5);
   const box=await page.locator('.work-console').boundingBox(),left=Math.max(0,Math.floor(box.x)-4),top=Math.max(0,Math.floor(box.y)-16);
   const raw=await page.screenshot({clip:{x:left,y:top,width:Math.min(1000-left,Math.ceil(box.width)+8),height:420},animations:'allow'});
   const bytes=await sharp(raw).resize({width:600}).webp({quality:92}).toBuffer(),meta=await sharp(bytes).metadata();
   fs.writeFileSync(path.join(previewRoot,id+'.webp'),bytes);previews.push({theme:id,path:'wwwroot/themes/previews/'+id+'.webp',width:meta.width,height:meta.height,sha256:digest(bytes)});
   console.log(JSON.stringify({phase:'preview-complete',id}));
  }finally{await page.close();}
 }
 fs.writeFileSync(path.resolve(__dirname,'../assets/themes/preview-sources.json'),JSON.stringify({scope:'Actual interface with synthetic LocalPreviewFixture data; no live accounts',version:report.version,viewport:{width:1000,height:1000},generator:'verification/Capture-ThemeEquipment.cjs; isolated theme page, common elapsed clock at frame32',resize:'Uniform width600 from real console upper420px; aspect preserved',assets:previews},null,2)+'\n');
 report.previews=previews;return previews;
}
async function capture({stillsOnly=false,ids=['terran','nova','fenix','classic-terran','zerg'],gif=true}={}){
 if(ids.some(id=>!themes.some(p=>p.id===id)))throw Error('Unsupported capture theme');
 fs.mkdirSync(framesDir,{recursive:true});
 const report={success:false,version:'1.1.7-local.35',source:'Actual interface through LocalPreviewFixture; all requests locally routed',viewport:{width:1600,height:1000},fps:FPS,captureDuration:SECONDS,largeLoopDuration:4,equipmentLoopDuration:6,commonElapsedClock:true,combinedLoop:false,stills:[],motion:[]};
 report.rasterSourceHashes=verifyRasterSet();
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:report.viewport}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await routeApp(page,fixture('terran','en'));await page.goto('http://equipment35-capture.test/',{waitUntil:'domcontentloaded',timeout:10000});await page.waitForFunction(()=>state?.library&&window.DSThemeVfx&&window.DSThemeEquipment);
  await page.bringToFront();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return document.fonts.ready;});await page.locator('nav [data-view=profile]').click();
  if(!stillsOnly)for(const id of ids){
   await themeReady(page,id);let addressed=0;
   for(let frame=0;frame<FRAMES;frame++){
    addressed=Math.max(addressed,await seek(page,frame*1000/FPS+.5));
    const bytes=await page.screenshot({type:'jpeg',quality:91,animations:'allow'});fs.writeFileSync(path.join(framesDir,id+'-'+String(frame).padStart(3,'0')+'.jpg'),bytes);
    if(frame===32)await page.screenshot({path:path.join(output,id+'-full-ui.png'),animations:'allow'});
   }
   report.motion.push({id,frames:FRAMES,duration:SECONDS,atomicAddressesChecked:addressed,video:id+'-full-ui.mp4'});console.log(JSON.stringify({phase:'ui-motion-captured',id,frames:FRAMES}));
  }
  // Production previews are untouched; these full-size QA captures stay local.
  for(const {id} of themes){
   await themeReady(page,id);await seek(page,32*1000/FPS+.5);const file=id+'-full-ui.png',bytes=await page.screenshot({path:path.join(output,file),animations:'allow'});
   const placement=await page.evaluate(()=>{const els=[...document.querySelectorAll('.theme-equipment-layer:not([hidden])')].filter(el=>{const b=el.getBoundingClientRect();return b.right>0&&b.left<innerWidth&&b.bottom>0&&b.top<innerHeight;});return {visibleDevices:els.length,categories:[...new Set(els.map(el=>el.dataset.equipmentRole))],parts:[...new Set(els.map(el=>el.dataset.equipmentPart))]};});
   report.stills.push({id,file,sha256:digest(bytes),...placement});console.log(JSON.stringify({phase:'ui-still-captured',id,...placement}));
  }
  await capturePreviews(browser,report);
  if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
 if(!stillsOnly){
  for(const {id} of report.motion)ffmpeg(['-framerate',String(FPS),'-i',path.join(framesDir,id+'-%03d.jpg'),'-frames:v',String(FRAMES),'-c:v','libx264','-threads','1','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,id+'-full-ui.mp4')]);
  const list=path.join(output,'videos.txt');fs.writeFileSync(list,report.motion.map(({id})=>"file '"+id+"-full-ui.mp4'").join('\n')+'\n');
  const movie=path.join(output,'local35-full-ui-equipment.mp4');ffmpeg(['-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',movie]);
  if(gif){ffmpeg(['-i',movie,'-filter_complex_threads','1','-filter_complex','fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','-1',path.join(output,'local35-equipment-overview.gif')]);report.gif=true;}
 }
 report.success=true;fs.writeFileSync(path.join(output,'index.html'),html(report));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({success:true,stills:report.stills.length,motionThemes:report.motion.length,path:output}));return report;
}
if(require.main===module){const args=process.argv.slice(2),ids=args.find(arg=>arg.startsWith('--ids='))?.slice(6).split(',');capture({stillsOnly:args.includes('--stills')||process.env.DSC_EQUIPMENT_STILL==='1',...(ids?{ids}:{}),gif:!args.includes('--no-gif')}).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={capture,seek,themeReady,html,verifyRasterSet,capturePreviews};
