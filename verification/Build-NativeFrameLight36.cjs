'use strict';
// Registered source-pixel light, never replacement sculpture or procedural lamps.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/native-motion36');
const profiles={
 protoss:{hue:[175,255],mode:'refraction',duration:6400},nerazim:{hue:[95,175],mode:'refraction',duration:7200},
 alarak:{hue:[345,45],minValue:.055,minSaturation:.16,mode:'ember',duration:5100},ihanrii:{hue:[125,190],mode:'indicators',duration:4800},
 terran:{hue:[85,165],mode:'indicators',duration:4400},nova:{hue:[140,235],mode:'indicators',duration:5700},
 mira:{hue:[15,65],minValue:.07,minSaturation:.16,mode:'ember',duration:6300},machined:{hue:[20,65],minValue:.06,minSaturation:.16,mode:'ember',duration:6100},
 tyrador:{hue:[170,235],mode:'indicators',duration:5900},zerg:{hue:[300,40],mode:'tissue',duration:8200},
 abathur:{hue:[55,115],mode:'tissue',duration:7500},dehaka:{hue:[15,75],mode:'tissue',duration:9100},
 cerberus:{hue:[50,180],mode:'tissue',duration:7900},mecha:{hue:[20,65],mode:'indicators',duration:5600},
 arcade:{hue:[265,335],mode:'indicators',duration:4600},'classic-terran':{hue:[345,35],mode:'indicators',duration:5200},
 'classic-protoss':{hue:[165,240],mode:'refraction',duration:7100},'classic-zerg':{hue:[340,45],mode:'tissue',duration:8800}
};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function hsv(r,g,b){const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=d?(max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60:0;if(h<0)h+=360;return [h,max?d/max:0,max/255];}
function strength(r,g,b,a,p){
 const [h,s,v]=hsv(r,g,b),[lo,hi]=p.hue,match=lo>hi?h>=lo||h<=hi:h>=lo&&h<=hi;
 if(!match||a<24)return 0;
 const bio=p.mode==='tissue',sat=p.minSaturation??(bio?.15:.28),light=p.minValue??(bio?.17:.30);
 return Math.max(0,Math.min(1,(s-sat)/.35))*Math.max(0,Math.min(1,(v-light)/(p.minValue?.18:.34)))*a/255;
}
function masks(data,width,height,p){
 const count=width*height,weights=new Float32Array(count),seen=new Uint8Array(count),components=[];
 for(let n=0;n<count;n++)weights[n]=strength(...data.subarray(n*4,n*4+4),p);
 function connected(){
 seen.fill(0);components.length=0;
 // Keep real connected luminous/material islands, never synthesize a shape.
 for(let start=0;start<count;start++){
  if(seen[start]||weights[start]<.08)continue;
  const queue=[start],pixels=[];seen[start]=1;let sum=0,cx=0;
  for(let i=0;i<queue.length;i++){const n=queue[i],x=n%width,y=Math.floor(n/width);pixels.push(n);sum+=weights[n];cx+=x;
   for(const m of [x?n-1:-1,x+1<width?n+1:-1,y?n-width:-1,y+1<height?n+width:-1])if(m>=0&&!seen[m]&&weights[m]>=.08){seen[m]=1;queue.push(m);}
  }
  if(pixels.length>=3&&pixels.length<count*(p.mode==='tissue'?.10:.035))components.push({pixels,sum,cx:cx/pixels.length});
 }
 return components.sort((a,b)=>b.sum-a.sum).slice(0,p.mode==='tissue'?7:10);
 }
 let selected=connected(),selection='chromatic-source-inset';
 if(!selected.length){
  // Several actual shell crops contain no coloured lamps: their original source
  // LEDs were outside the retained sculpture. Reflect existing metal highlights,
  // selected by local source luminance contrast, rather than inventing a lamp.
  selection='material-reflection';weights.fill(0);
  const luminance=n=>(data[n*4]*.2126+data[n*4+1]*.7152+data[n*4+2]*.0722)/255;
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
   const n=y*width+x,i=n*4,[,s,v]=hsv(data[i],data[i+1],data[i+2]);
   if(data[i+3]<128||v<.24||s>.55)continue;
   let sum=0;for(const dy of [-2,0,2])for(const dx of [-2,0,2])sum+=luminance(n+dy*width+dx);
   const contrast=Math.max(0,luminance(n)-sum/9-.012);
   weights[n]=Math.min(1,contrast/.10)*Math.min(1,(v-.20)/.28)*data[i+3]/255;
  }
  selected=connected();
 }
 const layers=[Buffer.alloc(count*4),Buffer.alloc(count*4),Buffer.alloc(count*4)];
 for(const c of selected){const band=c.cx<width*.36?0:c.cx>width*.64?2:1,dst=layers[band];for(const n of c.pixels){const i=n*4;dst[i]=data[i];dst[i+1]=data[i+1];dst[i+2]=data[i+2];dst[i+3]=Math.round(weights[n]*255);}}
 return {layers,selection,components:selected.map(c=>({pixels:c.pixels.length,centerX:c.cx,energy:c.sum}))};
}
async function build(){
 const sharp=require(require.resolve('sharp',{paths:[root,'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);fs.mkdirSync(out,{recursive:true});
 const requested=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(','),ids=requested||Object.keys(profiles),entries={};
 for(const id of ids){const p=profiles[id];if(!p)throw Error('Unknown native light theme '+id);
  const source='wwwroot/themes/'+id+'-console-shell-frame.png',bytes=fs.readFileSync(path.join(root,source)),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),result=masks(data,info.width,info.height,p),layers=[];
  for(let i=0;i<3;i++){if(!result.layers[i].some((v,n)=>n%4===3&&v))continue;const filename=id+'-'+['left','center','right'][i]+'.png';await sharp(result.layers[i],{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(path.join(out,filename));layers.push({src:'/themes/native-motion36/'+filename,sha256:hash(fs.readFileSync(path.join(out,filename))),phase:i/3});}
  entries[id]={...p,mode:result.selection==='material-reflection'?'refraction':p.mode,selection:result.selection,source:'/'+source.slice(8),sourceSha256:hash(bytes),width:info.width,height:info.height,layers,components:result.components};
  if(!layers.length)entries[id].warning='No authentic source emitters passed selection; runtime skips this theme.';
 }
 const file=path.join(out,'catalog.json'),prior=requested&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).themes:{};
 const catalog={version:1,generatorSha256:hash(fs.readFileSync(__filename)),provenance:'Registered coloured/luminous pixels copied from existing companion console shell artwork; no invented light geometry; not a new native export.',themes:{...prior,...entries}};
 fs.writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');console.log(JSON.stringify({themes:ids.length,layers:Object.values(entries).reduce((n,p)=>n+p.layers.length,0),warnings:Object.entries(entries).filter(([,p])=>p.warning).map(([id])=>id)}));
}
module.exports={profiles,hsv,strength,masks};if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
