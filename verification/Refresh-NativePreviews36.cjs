'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps})),sharp=require(require.resolve('sharp',{paths:deps}));sharp.concurrency(1);
const scene=require('./Test-NativeMotion36.cjs'),root=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const ids=['default',...require('../wwwroot/native-console-catalog.json').map(x=>x.id)],assets=[];
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{for(const id of ids){const page=await scene.open(browser,id,1000);await scene.seek(page,3200);const box=await page.locator('.work-console').boundingBox(),left=Math.max(0,Math.floor(box.x)-4),top=Math.max(0,Math.floor(box.y)-16);const raw=await page.screenshot({clip:{x:left,y:top,width:Math.min(1000-left,Math.ceil(box.width)+8),height:420},animations:'allow'});const bytes=await sharp(raw).resize({width:600}).webp({quality:92}).toBuffer(),meta=await sharp(bytes).metadata();const file='wwwroot/themes/previews/'+id+'.webp';fs.writeFileSync(path.join(root,file),bytes);assets.push({theme:id,path:file,width:meta.width,height:meta.height,sha256:hash(bytes)});await page.close();console.log(JSON.stringify({id,complete:true}));}}finally{await browser.close();}
 if(scene.errors.length)throw Error(scene.errors.join('\n'));
 fs.writeFileSync(path.join(root,'assets/themes/preview-sources.json'),JSON.stringify({scope:'Actual UI; synthetic data; native art in place; no decorative equipment placements',version:'1.1.7-local.36',viewport:{width:1000,height:1000},generator:'verification/Refresh-NativePreviews36.cjs',assets},null,2));console.log(JSON.stringify({success:true,previews:assets.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
