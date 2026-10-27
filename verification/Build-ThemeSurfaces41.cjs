'use strict';
// New surface-atlas import only. No equipment, focal-scene or rejected assets.
// Parent runs this through the resource guard after supplying the three atlases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const ROOT=path.resolve(__dirname,'..'),SOURCE=path.join(ROOT,'assets/themes/surfaces41'),OUT=path.join(ROOT,'wwwroot/themes/surfaces41');
const families={
 terran:['terran','nova','mira','machined','tyrador','classic-terran'],
 protoss:['protoss','nerazim','alarak','ihanrii','classic-protoss','arcade'],
 organic:['zerg','abathur','dehaka','cerberus','mecha','classic-zerg']
};
const profile=(type,effect,palette,hues,extra={})=>({type,effect,palette,hues,minValue:.68,minSaturation:.3,normalStrength:2.2,...extra});
const profiles={
 terran:profile('metal','recessed-power-and-thermal-light',['#5f766d','#72bd98','#c49a4a'],[[65,170],[28,60]],{normalStrength:2.8}),
 nova:profile('glass-metal','cyan-glass-refraction',['#172b3b','#42c7e8','#9de4ed'],[[170,215]],{normalStrength:1.8}),
 mira:profile('salvage-metal','warm-recess-convection',['#75534c','#c98241','#bd6488'],[[22,55],[315,345]],{normalStrength:3}),
 machined:profile('metal','vent-heat-refraction',['#52646c','#be8741','#e9b55e'],[[24,58]],{normalStrength:3,minValue:.73}),
 tyrador:profile('ceramic-glass','violet-glass-depth',['#69597e','#b47be0','#cdd8eb'],[[262,305]],{normalStrength:1.6}),
 'classic-terran':profile('metal','phosphor-and-amber-status-depth',['#58645e','#72cb89','#ddb34a'],[[78,155],[32,60]],{normalStrength:2.8}),
 protoss:profile('crystal-metal','blue-crystal-caustics',['#8b713f','#42b4eb','#bbecff'],[[175,235]],{normalStrength:1.7}),
 nerazim:profile('void-glass','green-void-refraction',['#4d3c64','#43bf8f','#8bebc3'],[[100,172]],{normalStrength:1.5}),
 alarak:profile('plasma-metal','sealed-red-plasma',['#2e2026','#cc3f32','#fc7650'],[[345,360],[0,25]],{normalStrength:2,minValue:.72,minSaturation:.48}),
 ihanrii:profile('crystal-stone','jade-inset-refraction',['#607777','#40b697','#acf0d3'],[[125,185]],{normalStrength:2}),
 'classic-protoss':profile('crystal-metal','cyan-crystal-depth',['#ad913b','#39b9dc','#b7f4ff'],[[170,230]],{normalStrength:2}),
 arcade:profile('glass-metal','violet-phosphor-depth',['#594a70','#b748e4','#e4a4fa'],[[215,325]],{normalStrength:1.6}),
 zerg:profile('organic','subsurface-violet-fluid',['#4d263c','#82458d','#c57bd4'],[[270,322]],{minValue:.76,minSaturation:.42,normalStrength:2.3}),
 abathur:profile('organic','green-gland-diffusion',['#354332','#769b39','#c8e168'],[[65,130]],{minValue:.76,minSaturation:.42,normalStrength:2.2}),
 dehaka:profile('organic-bone','primal-wet-tissue',['#4e5041','#779057','#b8cc79'],[[60,135]],{minValue:.8,minSaturation:.42,normalStrength:2.6}),
 cerberus:profile('organic-metal','contained-biological-fluid',['#5b6e65','#975b55','#63bdbb'],[[160,205]],{minValue:.79,minSaturation:.4,normalStrength:2.5}),
 mecha:profile('metal','amber-recess-refraction',['#536c7e','#b8cbd5','#edaa46'],[[26,58]],{normalStrength:2.8,minValue:.74}),
 'classic-zerg':profile('organic','wet-muscle-and-amber-inclusions',['#783b31','#bd7750','#e0b561'],[[35,68]],{minValue:.84,minSaturation:.5,normalStrength:2.4})
};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const clamp=(x,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
function smooth(lo,hi,x){x=clamp((x-lo)/(hi-lo));return x*x*(3-2*x);}
function tileCrop(index,width=1536,height=1024){
 assert(Number.isInteger(index)&&index>=0&&index<6,'Tile index must be 0–5');
 const col=index%2,row=Math.floor(index/2),left=Math.round(col*width/2),right=Math.round((col+1)*width/2),top=Math.round(row*height/3),bottom=Math.round((row+1)*height/3);
 return {cell:[col,row],cellBounds:[left,top,right,bottom],crop:{left:left+2,top:top+2,width:right-left-4,height:bottom-top-4}};
}
function hsv(r,g,b){const high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low;let hue=0;if(delta)hue=(high===r?(g-b)/delta:high===g?(b-r)/delta+2:(r-g)/delta+4)*60;if(hue<0)hue+=360;return [hue,high?delta/high:0,high/255];}
function hueWeight(hue,ranges){let best=0;for(const [low,high]of ranges){const distance=hue<low?low-hue:hue>high?hue-high:0;best=Math.max(best,1-smooth(0,10,distance));}return best;}
// Bounded separable averaging, no canvas or model. Radius is in source pixels.
function blur(input,w,h,radius){
 const horizontal=new Float32Array(input.length),result=new Float32Array(input.length),span=radius*2+1;
 for(let y=0;y<h;y++){
  const base=y*w;let sum=0;for(let k=-radius;k<=radius;k++)sum+=input[base+clamp(k,0,w-1)];
  for(let x=0;x<w;x++){horizontal[base+x]=sum/span;sum+=input[base+clamp(x+radius+1,0,w-1)]-input[base+clamp(x-radius,0,w-1)];}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=horizontal[clamp(k,0,h-1)*w+x];
  for(let y=0;y<h;y++){result[y*w+x]=sum/span;sum+=horizontal[clamp(y+radius+1,0,h-1)*w+x]-horizontal[clamp(y-radius,0,h-1)*w+x];}
 }
 return result;
}
function periodicNoise(w,h,theme){
 assert(w>1&&h>1,'Periodic noise needs at least two pixels per axis');
 let seed=2166136261;for(const char of String(theme))seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
 const values=new Float32Array(w*h),periods=[4,8,16,32],weights=[.55,.25,.13,.07];
 const fade=t=>t*t*t*(t*(t*6-15)+10);
 for(let octave=0;octave<periods.length;octave++){
  const size=periods[octave],grid=new Float32Array(size*size),xs=[],ys=[];
  for(let i=0;i<grid.length;i++){let n=(seed^Math.imul(i+1,374761393)^Math.imul(octave+1,668265263))>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;grid[i]=(n^(n>>>16))>>>0;grid[i]/=4294967295;}
  for(let x=0;x<w;x++){const q=x/(w-1)*size,j=Math.floor(q);xs.push([j%size,(j+1)%size,fade(q-j)]);}
  for(let y=0;y<h;y++){const q=y/(h-1)*size,j=Math.floor(q);ys.push([j%size,(j+1)%size,fade(q-j)]);}
  for(let y=0;y<h;y++){
   const [y0,y1,fy]=ys[y];
   for(let x=0;x<w;x++){const [x0,x1,fx]=xs[x],a=grid[y0*size+x0]*(1-fx)+grid[y0*size+x1]*fx,b=grid[y1*size+x0]*(1-fx)+grid[y1*size+x1]*fx;values[y*w+x]+=((1-fy)*a+fy*b)*weights[octave];}
  }
 }
 let low=Infinity,high=-Infinity;for(const value of values){low=Math.min(low,value);high=Math.max(high,value);}
 const data=Buffer.alloc(w*h),range=high-low;for(let i=0;i<data.length;i++)data[i]=Math.round(clamp(range?(values[i]-low)/range:.5)*255);
 // Opposite edge texels are identical; quintic lattice interpolation also
 // makes the underlying periodic field smooth through the wrap boundary.
 for(let y=0;y<h;y++)assert.equal(data[y*w],data[y*w+w-1],'Noise horizontal seam');
 for(let x=0;x<w;x++)assert.equal(data[x],data[(h-1)*w+x],'Noise vertical seam');
 return {data,metadata:{seed,octaves:4,periods,weights,interpolation:'quintic periodic value noise',normalization:'per-theme min/max to 0–255',oppositeEdgeMaxDifference:0}};
}
function deriveMaps(rgba,w,h,p,theme='surface41'){
 assert.equal(rgba.length,w*h*4);const n=w*h,luma=new Float32Array(n),values=new Float32Array(n),saturations=new Float32Array(n),accents=new Float32Array(n);
 const linear=Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 for(let i=0;i<n;i++){
  const j=i*4,[r,g,b,a]=rgba.subarray(j,j+4),[hue,saturation,value]=hsv(r,g,b);
  luma[i]=(.2126*linear[r]+.7152*linear[g]+.0722*linear[b])*(a/255);values[i]=value*(a/255);saturations[i]=saturation;accents[i]=hueWeight(hue,p.hues);
 }
 const fine=blur(luma,w,h,1),local=blur(luma,w,h,7),normal=Buffer.alloc(n*4),mask=Buffer.alloc(n*4),noise=periodicNoise(w,h,theme);
 let emissionPixels=0,softPixels=0,normalPixels=0,emissionSum=0,softSum=0,leftSum=0,rightSum=0,leftCount=0,rightCount=0;
 const bio=p.type.startsWith('organic'),glass=/glass|crystal|plasma/.test(p.type);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,alpha=rgba[j+3]/255,value=values[i],sat=saturations[i],accent=accents[i];
  const occupancy=smooth(.025,.16,value)*alpha;
  // Bright hue-specific inclusions emit. Ordinary red flesh is deliberately
  // outside every biological emission hue range, including Classic Zerg.
  const bright=smooth(p.minValue,.99,value),chromatic=smooth(p.minSaturation,.75,sat),contrast=.55+.45*smooth(0,.13,luma[i]-local[i]);
  const emission=accent*bright*chromatic*contrast*alpha;
  const dx=(fine[y*w+Math.min(x+1,w-1)]-fine[y*w+Math.max(x-1,0)])/2,dy=(fine[Math.min(y+1,h-1)*w+x]-fine[Math.max(y-1,0)*w+x])/2;
  const gradient=Math.hypot(dx,dy),smoothMaterial=1-.65*smooth(.035,.16,gradient);
  // Eligibility is a visual heuristic, not a semantic segmentation claim.
  // Dark void, bright metal highlights and opaque sharp edges stay quiet.
  let softness;
  if(bio){const tissue=smooth(.12,.5,sat),notBone=1-.65*smooth(.65,.95,value)*(1-smooth(.2,.45,sat));softness=occupancy*tissue*smoothMaterial*notBone*(p.type==='organic-metal'?.65:.95);if(p.type==='organic-bone')softness*=.12+.88*accent;}
  else if(glass)softness=occupancy*accent*smooth(.16,.62,sat)*smoothMaterial*.9;
  else softness=occupancy*accent*smooth(.3,.7,sat)*smooth(.28,.8,value)*smoothMaterial*.52;
  const strength=p.normalStrength*occupancy*(1-.65*emission),nx=clamp(-dx*strength,-.45,.45),ny=clamp(dy*strength,-.45,.45),length=Math.hypot(nx,ny,1);
  normal[j]=Math.round((nx/length*.5+.5)*255);normal[j+1]=Math.round((ny/length*.5+.5)*255);normal[j+2]=Math.round((1/length*.5+.5)*255);normal[j+3]=255;
  mask[j]=Math.round(clamp(emission)*255);mask[j+1]=Math.round(clamp(softness)*255);mask[j+2]=noise.data[i];mask[j+3]=255;
  emissionSum+=emission;softSum+=softness;if(mask[j]>=32)emissionPixels++;if(mask[j+1]>=32)softPixels++;if(Math.abs(normal[j]-128)+Math.abs(normal[j+1]-128)>3)normalPixels++;
  if(x<w*.6){leftSum+=luma[i];leftCount++;}else{rightSum+=luma[i];rightCount++;}
 }
 return {normal,mask,statistics:{emissionCoverageAt32:emissionPixels/n,softnessCoverageAt32:softPixels/n,normalDetailCoverage:normalPixels/n,meanEmission:emissionSum/n,meanSoftness:softSum/n,left60MeanLinearLuminance:leftSum/leftCount,right40MeanLinearLuminance:rightSum/rightCount,noise:noise.metadata}};
}
async function write(bytes,name){const file=path.join(OUT,name);fs.writeFileSync(file,bytes);return {url:'/themes/surfaces41/'+name,sha256:hash(bytes)};}
async function build(selected){
 const ids=selected||Object.values(families).flat();assert(ids.length&&new Set(ids).size===ids.length,'Select unique theme IDs');for(const id of ids)assert(profiles[id],'Unknown theme '+id);
 sharp.concurrency(1);sharp.cache({memory:24,files:0});
 const generatorHash=hash(fs.readFileSync(__filename)),inputs={};
 for(const [family,members]of Object.entries(families)){
  const filename=path.join(SOURCE,family+'-atlas.png');if(!fs.existsSync(filename)){assert(!ids.some(id=>members.includes(id)),'Missing new surface atlas: '+filename);continue;}
  const bytes=fs.readFileSync(filename);inputs[family]={bytes,sha256:hash(bytes),relative:'assets/themes/surfaces41/'+family+'-atlas.png'};
 }
 fs.mkdirSync(OUT,{recursive:true});const destination=path.join(OUT,'catalog.json');let old=fs.existsSync(destination)?JSON.parse(fs.readFileSync(destination,'utf8')):null;
 const themes=old?.generatorHash===generatorHash?old.themes:{};
 // A pilot rebuild never silently retains entries from a changed source atlas.
 for(const [id,entry]of Object.entries(themes))if(!inputs[entry.source.family]||inputs[entry.source.family].sha256!==entry.source.sha256)delete themes[id];
 const catalog={version:41,generatorHash,provenance:'New image-generated surface artwork; shading-derived heuristic normal and material maps. Not native game animation exports or recovered geometric normals.',atlasLayout:{expectedDimensions:[1536,1024],dimensions:'Read actual image metadata; each theme records its source dimensions.',columns:2,rows:3,order:'row-major',tileMarginPixels:2,bounds:'round(column*actualWidth/2), round(row*actualHeight/3); inset 2 pixels on all four tile edges'},channels:{normal:{format:'linear RGBA8 PNG',R:'tangent normal X encoded [-1,1] to [0,1]',G:'tangent normal Y encoded [-1,1] to [0,1]',B:'positive tangent normal Z encoded [-1,1] to [0,1]',A:'255',axes:'+X right; +Y up; input image row coordinates increase down',decode:'normalize(texture.rgb*2.0-1.0)'},mask:{format:'linear RGBA8 PNG',R:'emission confidence, 0–255',G:'soft/translucent material motion eligibility, 0–255',B:'seamless smooth four-octave turbulent value noise, unique theme seed, normalized 0–255',A:'255'},sampling:'Normal/mask are data, not sRGB colour. Do not apply colour-space conversion. Clamp edges; use linear filtering. Colour field uses sRGB. Sample mask.rg at fixed source UV; only mask.b may use fract(animatedUv) for periodic noise. Opposite noise edge texels match exactly.'},themes};
 for(const [family,members]of Object.entries(families)){
  const wanted=members.filter(id=>ids.includes(id));if(!wanted.length)continue;const input=inputs[family],metadata=await sharp(input.bytes).metadata();
  assert(Number.isInteger(metadata.width)&&metadata.width>=1000&&Number.isInteger(metadata.height)&&metadata.height>=600,family+' atlas must retain the supplied high-resolution source');
  for(const id of wanted){
   const tile=tileCrop(members.indexOf(id),metadata.width,metadata.height),decoded=await sharp(input.bytes).extract(tile.crop).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width,height}=decoded.info;
   const {normal,mask,statistics}=deriveMaps(decoded.data,width,height,profiles[id],id);
   const fieldBytes=await sharp(decoded.data,{raw:{width,height,channels:4}}).webp({quality:97,alphaQuality:100,smartSubsample:true,effort:3}).toBuffer();
   const normalBytes=await sharp(normal,{raw:{width,height,channels:4}}).png({compressionLevel:7}).toBuffer(),maskBytes=await sharp(mask,{raw:{width,height,channels:4}}).png({compressionLevel:7}).toBuffer();
   const field=await write(fieldBytes,id+'-field.webp'),normalFile=await write(normalBytes,id+'-normal.png'),maskFile=await write(maskBytes,id+'-mask.png');
   const warnings=[];if(statistics.emissionCoverageAt32>.16)warnings.push('Broad emission coverage: inspect artwork and hue mask before increasing light gain.');if(statistics.left60MeanLinearLuminance>statistics.right40MeanLinearLuminance*.8)warnings.push('Left field is not substantially darker: inspect source composition.');
   themes[id]={id,source:{family,atlas:input.relative,sha256:input.sha256,dimensions:[metadata.width,metadata.height],...tile},width,height,aspectRatio:width/height,field,normal:normalFile,mask:maskFile,material:{...profiles[id],classification:'heuristic; inspect RGB artwork and channel previews before treating masks as material truth',suggestedUvDisplacementMax:.003,suggestedRelightGain:.18},statistics,warnings};
   console.log(JSON.stringify({id,width,height,emissionCoverage:statistics.emissionCoverageAt32,softnessCoverage:statistics.softnessCoverageAt32,warnings}));
  }
 }
 fs.writeFileSync(destination,JSON.stringify(catalog,null,2)+'\n');console.log(JSON.stringify({success:true,themes:Object.keys(themes).length,catalog:'wwwroot/themes/surfaces41/catalog.json'}));return catalog;
}
if(require.main===module){const flag=process.argv.find(arg=>arg.startsWith('--ids='));build(flag?flag.slice(6).split(','):undefined).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={families,profiles,tileCrop,periodicNoise,deriveMaps,build};
