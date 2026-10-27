'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const scene=require('./Test-NativeScene37.cjs'),root=path.resolve(__dirname,'..'),out=path.join(__dirname,'local37-native-scenes');
(async()=>{
 const result={success:false,compactSidebar:[],screenshots:[]},catalog=require('../wwwroot/themes/motion37/well-catalog.json');
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});try{
  for(const id of ['nova','dehaka','mecha']){const page=await scene.open(browser,id);await scene.seek(page,2800);assert.deepEqual(await scene.checks(page,id),[]);
   const c=catalog.find(e=>e.id===id),b=await page.locator('.sidebar nav').boundingBox(),factor=c.compact.factor,scale=c.scale*factor,[l,t,r,bb]=c.sourceOpaqueBounds.map(n=>n-c.uniformTrim),[w,h]=c.dimensions;
   const opaque={left:b.x-c.compact.outset[3]+l*scale,right:b.x+b.width+c.compact.outset[1]-(w-1-r)*scale};assert.ok(opaque.left>=0&&opaque.right<=204,id+' complete compact ornaments fit sidebar');result.compactSidebar.push({id,opaque});
   const name=id+'-final.png';await page.screenshot({path:path.join(out,name),animations:'allow'});result.screenshots.push(name);await page.close();
  }
 }finally{await browser.close();}
 const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1','-i',path.join(out,'nova.mp4'),'-vf','fps=10,scale=1100:-1:flags=lanczos','-loop','0',path.join(out,'nova-motion.gif')],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||String(r.error));
 result.success=true;fs.writeFileSync(path.join(out,'final-clearance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
