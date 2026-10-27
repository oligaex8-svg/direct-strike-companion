'use strict';
const path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
sharp.concurrency(1);
(async()=>{
 const pieces=[];
 for(const [column,file] of ['local24-before-alarak.png','skin-alarak-profile-1600.png'].entries()){
  for(const [row,rect] of [{left:249,top:154,width:718,height:140},{left:249,top:800,width:718,height:150}].entries()){
   pieces.push({input:await sharp(path.join(__dirname,file)).extract(rect).toBuffer(),left:12+column*734,top:38+row*152});
  }
 }
 const label=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="38"><style>text{font:17px sans-serif;fill:#e8edef}</style><text x="12" y="25">Before</text><text x="746" y="25">After — local.24</text></svg>');
 await sharp({create:{width:1480,height:350,channels:4,background:'#070d12'}}).composite([{input:label,left:0,top:0},...pieces]).png().toFile(path.join(__dirname,'local24-double-lining-comparison.png'));
})().catch(error=>{console.error(error);process.exitCode=1;});
