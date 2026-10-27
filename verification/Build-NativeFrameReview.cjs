'use strict';
// Contact sheet made only from actual browser screenshots, never mockups.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const ids=['default',...require('../wwwroot/native-console-catalog.json').map(x=>x.id)];
(async()=>{
 await require('./Test-NativeFrameAssets.cjs').run();
 sharp.concurrency(1);sharp.cache(false);
 const tiles=[];
 for(const [i,id] of ids.entries()){
  const file=path.join(__dirname,`native-local-${id}-profile-1000.png`),left=i%4*400,top=Math.floor(i/4)*260;
  const title=Buffer.from(`<svg width="400" height="22"><rect width="400" height="22" fill="#18212b"/><text x="10" y="16" fill="white" font-family="sans-serif" font-size="14">${id}</text></svg>`);
  tiles.push({input:title,left,top});
  const header=await sharp(file).extract({left:180,top:0,width:820,height:190}).resize({width:400}).png().toBuffer();
  const body=await sharp(file).extract({left:200,top:180,width:780,height:280}).resize({width:400}).png().toBuffer();
  tiles.push({input:header,left,top:top+22},{input:body,left,top:top+115});
 }
 await sharp({create:{width:1600,height:1300,channels:4,background:'#080c12'}}).composite(tiles).png().toFile(path.join(__dirname,'native-frame-review-all-styles.png'));
 console.log(JSON.stringify({success:true,styles:ids.length,source:'Actual 1000px production UI screenshots'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
