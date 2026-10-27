'use strict';
// Guard the actual defects: missing central art, clipped top silhouettes,
// and using perspective console corners in closed information-panel frames.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),catalog=require('../wwwroot/native-console-catalog.json');
const layouts=require('./native-console-layouts.json');
async function run(){
 sharp.concurrency(1);sharp.cache(false);const cases=[],issues=[];
 for(const skin of catalog){
  const prefix=path.join(root,'wwwroot/themes',skin.id+'-native-');
  const boxes=['left','right'].map(role=>{const svg=fs.readFileSync(prefix+role+'.svg','utf8');return svg.match(/viewBox="([\d ]+)"/)[1].split(' ').map(Number);});
  assert.equal(boxes[0][0],0);assert.equal(boxes[1][0],boxes[0][2],'Header source ranges meet on the same rail');
  assert.equal(boxes[0][2]+boxes[1][2],992,'No original centre ornaments are discarded');assert.equal(boxes[0][1],boxes[1][1]);assert.equal(boxes[0][3],boxes[1][3]);
  const parts=await Promise.all(['left','right'].map(role=>sharp(prefix+role+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  for(const [side,role] of ['left','right'].entries()){
   const svg=fs.readFileSync(prefix+role+'.svg','utf8'),encoded=svg.match(/id="panel-backing"[^>]+base64,([^" ]+)/)?.[1];
   assert.ok(encoded,'Each original silhouette owns an interior backing');
   const plate=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let filledColumns=0;
   for(let x=0;x<plate.info.width;x++){
    let first=0;while(first<192&&plate.data[(first*plate.info.width+x)*4+3]===0)first++;
    if(first===192)continue;
    assert.ok(first>0,'Air above the native contour remains transparent');
    for(let y=first;y<192;y++)assert.equal(plate.data[(y*plate.info.width+x)*4+3],255,'The interior extends continuously to the page join');
    filledColumns++;
   }
   assert.ok(filledColumns>plate.info.width*.95,'Backing spans the complete header shoulder');
  }
  const source=await sharp(path.join(root,'assets/themes/console-'+skin.id+'.png')).ensureAlpha().raw().toBuffer();
  let apexColumns=0;
  for(let x=0;x<992;x++){
   const boundary=layouts[skin.id].solidTop;let lower=0;
   if(boundary){const j=boundary.findIndex(p=>p[0]>x+.5),a=boundary[j-1],b=boundary[j];lower=Math.ceil(a[1]+(b[1]-a[1])*(x+.5-a[0])/(b[0]-a[0]));}
   let y=lower;
   for(;y<220;y++){const i=(y*992+x)*4;if(source[i+3]>127&&Math.max(source[i],source[i+1],source[i+2])>8)break;}
   if(y===220)continue;
   if(y<boxes[0][1]){issues.push({id:skin.id,x,y,reason:'apex above crop'});continue;}
   const side=x<boxes[1][0]?0:1,p=parts[side],px=x-boxes[side][0],py=y-boxes[side][1],i=(py*p.info.width+px)*4;
   if(p.data[i+3]<=64)issues.push({id:skin.id,x,y,reason:'apex omitted'});apexColumns++;
  }
  const well=fs.readFileSync(prefix+'well.svg','utf8'),embedded=well.match(/id="helper"[^>]+base64,([^" ]+)/)?.[1];
  assert.ok(embedded,'Information well uses a complete closed panel texture');
  assert.deepEqual(Buffer.from(embedded,'base64'),fs.readFileSync(path.join(root,'assets/themes/ui_console_helperbutton_background_'+skin.family+'.png')));
  cases.push({id:skin.id,fullSourceWidth:992,apexColumns,closedFrameFamily:skin.family});
 }
 const report={success:issues.length===0,scope:'All original header columns, authored silhouette apexes and native closed panel source identity',cases,issues};
 fs.writeFileSync(path.join(__dirname,'native-frame-assets.json'),JSON.stringify(report,null,2)+'\n');assert.deepEqual(issues,[],'Original outer silhouette apexes survive the header assembly');console.log(JSON.stringify({success:true,styles:cases.length}));return report;
}
module.exports={run};if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
