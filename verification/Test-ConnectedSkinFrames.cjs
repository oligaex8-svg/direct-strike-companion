'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 sharp.concurrency(1);sharp.cache(false);
 const report=JSON.parse(fs.readFileSync(path.join(__dirname,'native-skin-frame-assets.json'))),checks=[];
 assert.equal(report.styles,19);assert.equal(report.assets,57);
 for(const skin of report.skins){
  const parts={};
  for(const part of skin.parts){
   const {data,info}=await sharp(path.join(root,'wwwroot/themes',part.filename)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   assert.deepEqual([info.width,info.height],part.dimensions);assert.equal(hash(data),part.pixelSHA256);parts[part.role]={data,info};
   if(part.role==='header-band')continue;
   if(part.role==='shell-frame'){
    if(skin.id==='fenix'){
     assert.equal(part.source,'authored-fenix-frame-v2.png');assert.equal(part.referenceSource,'console-fenix.png');
     assert.equal(hash(fs.readFileSync(path.join(root,'assets/themes',part.source))),part.sourceSHA256);
     assert.equal(part.iris.mode,'single authored Purifier iris');assert.deepEqual(part.slices,[128,256,36,200]);assert.deepEqual(part.dimensions,[758,179]);
     const pixel=(x,y)=>data.subarray((y*758+x)*4,(y*758+x+1)*4);
     for(let y=0;y<179;y++){assert.deepEqual(pixel(199,y),pixel(200,y));assert.deepEqual(pixel(501,y),pixel(502,y));}
     for(let x=0;x<758;x++){assert.deepEqual(pixel(x,127),pixel(x,128));assert.deepEqual(pixel(x,142),pixel(x,143));}
     for(let x=16;x<742;x++)assert.ok(Array.from({length:96},(_,y)=>pixel(x,y)[3]).some(alpha=>alpha>200),'Upper armour stays connected at '+x);
     for(let x=16;x<742;x++)assert.ok(Array.from({length:36},(_,y)=>pixel(x,143+y)[3]).some(alpha=>alpha>200),'Lower rail stays connected at '+x);
     for(let y=68;y<145;y++){assert.ok(pixel(12,y)[3]>200);assert.ok(pixel(745,y)[3]>200);}
     // The source game's square control wells must not survive as downward
     // steps in the inner shoulder edge. Both rebuilt joins are gradual.
     for(const [name,from,to] of [['left',78,170],['right',430,620]]){
      let previous;
      for(let x=from;x<=to;x++){
       let edge=95;while(edge>=0&&pixel(x,edge)[3]<128)edge--;
       assert.ok(edge>=0,name+': shoulder remains connected');
       if(previous!==undefined)assert.ok(Math.abs(edge-previous)<=2,name+': no square recess at '+x);
       previous=edge;
      }
     }
     assert.equal(pixel(378,110)[3],0);assert.equal(pixel(378,140)[3],0);
     continue;
    }
    assert.equal(part.source,'console-'+skin.id+'.png');
    assert.ok(part.adaptation.includes('reflected'));assert.equal(part.slices[0],128);
    const [h,w]=part.slices,W=info.width,H=info.height,pixel=(x,y)=>data.subarray((y*W+x)*4,(y*W+x+1)*4);
    assert.equal(W,2*w+16);assert.equal(H,2*h+16);
    // Adjacent native profiles join exactly on all four straight intervals.
    for(let y=0;y<h;y++)assert.deepEqual(pixel(w-1,y),pixel(w,y));
    for(let y=H-h;y<H;y++)assert.deepEqual(pixel(w-1,y),pixel(w,y));
    for(let x=0;x<w;x++)assert.deepEqual(pixel(x,h-1),pixel(x,h));
    for(let x=W-w;x<W;x++)assert.deepEqual(pixel(x,h-1),pixel(x,h));
    assert.equal(pixel(W>>1,H>>1)[3],0,'Content well is clear');
    assert.ok([...data].some((v,i)=>i%4===3&&v>200),'Native material exists');
    if(skin.id==='abathur'){
     const original=await sharp(path.join(root,'assets/themes',part.source)).ensureAlpha().raw().toBuffer();
     for(const x of [669,672,674,675,677,679])assert.deepEqual(pixel(W-w+x-part.sourceRegion[0],127),original.subarray((255*992+x)*4,(255*992+x+1)*4),'Dark chitin remains original material, not viewing matte');
    }
    continue;
   }
   assert.deepEqual(part.sourceRegion,[0,0,92,62],skin.id+': complete native frame, no corner crop');
   const original=await sharp(path.join(root,'assets/themes',part.source)).ensureAlpha().raw().toBuffer();
   assert.equal(data[(31*92+46)*4+3],0,skin.id+': viewing matte cleared');
   for(let y=0;y<62;y++)for(let x=0;x<92;x++){
    const i=(y*92+x)*4;for(let c=0;c<3;c++)assert.equal(data[i+c],original[i+c],skin.id+': original material RGB');
    if(data[i+3])assert.equal(data[i+3],original[i+3],skin.id+': original painted alpha');
    if(x<5||x>=87||y<5||y>=57)assert.equal(data[i+3],original[i+3],skin.id+': exterior shadow retained');
   }
   const material=(x,y)=>{const i=(y*92+x)*4;return data[i+3]>=64&&Math.max(data[i],data[i+1],data[i+2])>32;};
   // All four adjoining straight intervals must remain painted. Deleting the
   // top interval (the previous hybrid) leaves orphaned corner arms.
   for(let x=16;x<76;x++)for(const [name,from,to] of [['top',0,16],['bottom',46,62]])assert.ok(Array.from({length:to-from},(_,y)=>material(x,from+y)).some(Boolean),skin.id+': continuous '+name+' rail at '+x);
   for(let y=16;y<46;y++)for(const [name,from,to] of [['left',0,16],['right',76,92]])assert.ok(Array.from({length:to-from},(_,x)=>material(from+x,y)).some(Boolean),skin.id+': continuous '+name+' rail at '+y);
  }
  assert.notDeepEqual(parts['shell-frame'].data,parts['panel-frame'].data,skin.id+': own console art rather than helper perimeter');
  assert.equal(skin.sourceKind,skin.id==='fenix'?'authored-style-matched-purifier':'reconstructed-own-console-perimeter');
  for(const role of ['crown-left','crown-right','crown-rail'])assert.ok(!fs.existsSync(path.join(root,'wwwroot/themes',skin.id+'-console-'+role+'.png')),skin.id+': obsolete open-ended crown removed');
  checks.push({id:skin.id,frame:skin.id==='fenix'?'Purpose-drawn Purifier frame matched to native reference':'own console turn and reflected reconstruction; helper only for small panels',viewingWell:'transparent',rails:'matching quiet profiles at all slice boundaries',screenEdgeCrown:'absent'});
 }
 assert.equal(new Set(report.skins.map(skin=>skin.parts.find(p=>p.role==='shell-frame').pixelSHA256)).size,19,'All nineteen use distinct own-console artwork');
 fs.writeFileSync(path.join(__dirname,'connected-skin-assets-checks.json'),JSON.stringify({success:true,skins:19,assets:57,distinctConsolePerimeters:19,checks},null,2)+'\n');
 console.log(JSON.stringify({success:true,skins:19,assets:57}));
})().catch(error=>{console.error(error);process.exitCode=1;});
