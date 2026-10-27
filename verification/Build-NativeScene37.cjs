'use strict';
// Registered cutouts from existing scenery. Architecture, silhouettes and source
// files stay fixed; only the identified interior material receives motion.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/motion37');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const profiles={
 protoss:{scene:'artanis',name:'planet-cloud-refraction',box:[0,75,230,262],color:'cyan',move:['translate(-2px,0)','translate(3px,1px)','translate(-2px,0)'],duration:12800},
 nerazim:{scene:'vorazun',name:'void-atmosphere',box:[20,6,230,246],color:'violet',move:['translate(0,0)','translate(-2px,2px)','translate(0,0)'],duration:15100},
 alarak:{scene:'alarak',name:'fortress-embers',box:[0,0,230,282],color:'ember',move:['translate(0,1px)','translate(2px,-9px)','translate(0,1px)'],duration:7300},
 terran:{scene:'raynor',name:'hangar-engine-interior',box:[53,128,94,166],color:'blue',move:['rotate(0deg)','rotate(360deg)'],origin:[74,146],duration:6800},
 nova:{scene:'nova',name:'bulkhead-service-light',box:[0,174,105,282],color:'cyan',move:[null,null,null],duration:7100},
 mira:{scene:'hanandhorner',name:'orbital-cloud-convection',box:[17,3,230,276],color:'amber',move:['translate(-1px,0)','translate(2px,-2px)','translate(-1px,0)'],duration:13700},
 machined:{scene:'swann',name:'vent-heat-refraction',box:[133,119,230,233],color:'steel',move:['translate(0,.3px)','translate(.8px,-1.1px)','translate(0,.3px)'],duration:4400},
 zerg:{scene:'kerrigan',name:'swarm-nebula-interference',box:[1,15,230,274],color:'violet',move:['translate(0,0)','translate(1px,-2px)','translate(0,0)'],duration:16900},
 abathur:{scene:'abathur',name:'root-biochemical-luminescence',box:[27,20,229,270],color:'green',move:[null,null,null],duration:10900},
 dehaka:{scene:'dehaka',name:'rooted-primal-tendril',box:[79,111,175,181],color:'green',move:['rotate(-.6deg)','rotate(1.1deg)','rotate(-.6deg)'],origin:[86,177],duration:11700}
};
function weight(r,g,b,a,color){
 if(a<8)return 0;
 const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min;
 if(color==='cyan')return Math.max(0,Math.min(1,(g-r+ b-r-8)/95))*Math.min(1,max/80);
 if(color==='blue')return Math.max(0,Math.min(1,(b-r-2)/40))*Math.min(1,b/50);
 if(color==='violet')return Math.max(0,Math.min(1,(r+b-2*g-5)/100))*Math.min(1,max/90);
 if(color==='ember')return Math.max(0,Math.min(1,(r-g-17)/65))*Math.max(0,Math.min(1,(r-40)/90));
 if(color==='amber')return Math.max(0,Math.min(1,(r-b-8)/105))*Math.min(1,max/110);
 if(color==='green')return Math.max(0,Math.min(1,(g-r+g-b-3)/60))*Math.min(1,max/70);
 return Math.max(0,Math.min(1,(max-13)/65))*(sat<60?1:.3);
}
(async()=>{
 const sharp=require(require.resolve('sharp',{paths:[root,'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);fs.mkdirSync(out,{recursive:true});const catalog={};
 for(const [id,p]of Object.entries(profiles)){
  const source='/themes/identity-native-sc2_ui_coop_detail_background_'+p.scene+'.png',bytes=fs.readFileSync(path.join(root,'wwwroot',source)),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),pixels=Buffer.alloc(data.length);let selected=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*4,[l,t,r,b]=p.box;if(x<l||y<t||x>r||y>b)continue;
   const edge=Math.min(1,(x-l)/6,(r-x)/6,(y-t)/6,(b-y)/6),w=weight(...data.subarray(i,i+4),p.color)*Math.max(0,edge);if(w<.02)continue;
   pixels[i]=data[i];pixels[i+1]=data[i+1];pixels[i+2]=data[i+2];pixels[i+3]=Math.round(data[i+3]*w);selected++;
  }
  if(selected<8)throw Error('Missing actual material '+id);const url='/themes/motion37/scene-'+id+'.png';await sharp(pixels,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(path.join(root,'wwwroot',url));
  const frames=p.move.map((transform,i)=>({...transform&&{transform},opacity:p.move.length===2?.8:i===1?.95:.4}));catalog[id]={source,sourceHash:hash(bytes),url,hash:hash(fs.readFileSync(path.join(root,'wwwroot',url))),width:info.width,height:info.height,selectedPixels:selected,name:p.name,frames,duration:p.duration,origin:p.origin||[info.width/2,info.height/2]};
 }
 fs.writeFileSync(path.join(out,'scene-catalog.json'),JSON.stringify(catalog,null,2));console.log(JSON.stringify({success:true,scenes:Object.keys(catalog).length,pixels:Object.values(catalog).reduce((s,x)=>s+x.selectedPixels,0)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
