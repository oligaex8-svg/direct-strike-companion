'use strict';
// Skin-specific outer sculpture with native family frames on smaller controls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function hashes(data){const alpha=Buffer.alloc(data.length/4);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];return {pixelSHA256:hash(data),alphaSHA256:hash(alpha)};}
function removeInteriorMatte(data,width,height){
 const result=Buffer.from(data),visited=new Uint8Array(width*height),queue=[Math.floor(height/2)*width+Math.floor(width/2)];let removed=0;
 // Clear only the connected viewing well; preserve the rim and outside shadow.
 for(let cursor=0;cursor<queue.length;cursor++){
  const index=queue[cursor];if(visited[index])continue;visited[index]=1;
  const x=index%width,y=Math.floor(index/width),i=index*4;
  if(x<5||x>=width-5||y<5||y>=height-5||Math.max(result[i],result[i+1],result[i+2])>16)continue;
  if(result[i+3])removed++;result[i+3]=0;queue.push(index-1,index+1,index-width,index+width);
 }
 return {pixels:result,removed};
}
async function build(options={}){
 const sourceRoot=path.resolve(options.sourceRoot||process.env.DSC_SOURCE_ROOT||root),outputRoot=path.resolve(options.outputRoot||process.env.DSC_WEB_OUTPUT||path.join(sourceRoot,'wwwroot'));
 const catalog=JSON.parse(fs.readFileSync(path.join(sourceRoot,'wwwroot/native-console-catalog.json'))),layouts=JSON.parse(fs.readFileSync(path.join(sourceRoot,'verification/native-console-layouts.json')));
 sharp.concurrency(1);sharp.cache(false);const out=path.join(outputRoot,'themes');fs.mkdirSync(out,{recursive:true});const skins=[],tokens=[];
 for(const skin of catalog){
  const parts=[];
  async function frame(role,source,sourceRegion){
   const bytes=fs.readFileSync(path.join(sourceRoot,'assets/themes',source));
   const {data,info}=await sharp(bytes).extract({left:sourceRegion[0],top:sourceRegion[1],width:sourceRegion[2],height:sourceRegion[3]}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const cleaned=removeInteriorMatte(data,info.width,info.height),filename=skin.id+'-console-'+role+'.png';
   await sharp(cleaned.pixels,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(path.join(out,filename));
   parts.push({role,filename,dimensions:[info.width,info.height],source,sourceSHA256:hash(bytes),sourceRegion,slice:16,removedInteriorMattePixels:cleaned.removed,...hashes(cleaned.pixels)});return filename;
  }
  const helperSource='ui_console_helperbutton_background_'+skin.family+'.png';
  const panelFile=await frame('panel-frame',helperSource,[0,0,92,62]);
  const source='console-'+skin.id+'.png',bytes=fs.readFileSync(path.join(sourceRoot,'assets/themes',source)),{data}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const shellSource=skin.id==='fenix'?'authored-fenix-frame-v2.png':source,shellBytes=skin.id==='fenix'?fs.readFileSync(path.join(sourceRoot,'assets/themes',shellSource)):bytes;
  const assembly=skin.id==='fenix'?await require('./Compose-AuthoredPurifierFrame.cjs').compose(shellBytes):await require('./Compose-ConsolePerimeter.cjs').compose(bytes,skin.id,layouts[skin.id].railX||430),shellFile=skin.id+'-console-shell-frame.png';
  await sharp(assembly.pixels,{raw:{width:assembly.width,height:assembly.height,channels:4}}).png().toFile(path.join(out,shellFile));
  parts.push({role:'shell-frame',filename:shellFile,dimensions:[assembly.width,assembly.height],source:shellSource,sourceSHA256:hash(shellBytes),referenceSource:skin.id==='fenix'?source:undefined,referenceSHA256:skin.id==='fenix'?hash(bytes):undefined,sourceRegion:assembly.sourceRegion,slices:assembly.slices,wallEnd:assembly.wallEnd,adaptation:assembly.adaptation,iris:assembly.iris,...hashes(assembly.pixels)});
  const split=layouts[skin.id].railX||430;let bandTop=316,bandBottom=0;
  for(let y=64;y<250;y++)for(let x=split-2;x<split;x++){const i=(y*992+x)*4;if(data[i+3]&&Math.max(data[i],data[i+1],data[i+2])>16){bandTop=Math.min(bandTop,y);bandBottom=Math.max(bandBottom,y);}}
  if(bandTop>=bandBottom)throw Error('Missing native information-well rail '+skin.id);
  const band=await sharp(data,{raw:{width:992,height:316,channels:4}}).extract({left:split-2,top:bandTop,width:2,height:bandBottom-bandTop+1}).raw().toBuffer();
  for(let i=0;i<band.length;i+=4)if(band[i]===0&&band[i+1]===0&&band[i+2]===0)band[i+3]=0;
  const bandFile=skin.id+'-console-header-band.png';await sharp(band,{raw:{width:2,height:bandBottom-bandTop+1,channels:4}}).png().toFile(path.join(out,bandFile));
  parts.push({role:'header-band',filename:bandFile,dimensions:[2,bandBottom-bandTop+1],source,sourceSHA256:hash(bytes),sourceRegion:[split-2,bandTop,2,bandBottom-bandTop+1],...hashes(band)});
  // These screen-edge preview fragments cannot supply closed outer corners.
  for(const role of ['crown-left','crown-right','crown-rail']){const stale=path.join(out,skin.id+'-console-'+role+'.png');if(fs.existsSync(stale))fs.unlinkSync(stale);}
  tokens.push(':root[data-graphical-style='+skin.id+']{'+Object.entries({'skin-panel-frame':panelFile,'skin-shell-frame':shellFile,'skin-header-band':bandFile}).map(([key,file])=>'--'+key+":url('/themes/"+file+"')").join(';')+';--skin-shell-slice:'+assembly.slices.join(' ')+';--skin-shell-x:'+assembly.slices[1]+';--skin-shell-y:'+assembly.slices[0]+';--skin-shell-bottom:'+assembly.slices[2]+';--skin-shell-left:'+assembly.slices[3]+(assembly.outline?';--skin-shell-outline:'+assembly.outline:'')+'}');
  skins.push({id:skin.id,sourceKind:assembly.sourceKind||'reconstructed-own-console-perimeter',parts});
 }
 fs.writeFileSync(path.join(outputRoot,'native-skin-frame-tokens.css'),'/* Own-console sculpted perimeter; native small-frame controls. */\n'+tokens.join('\n')+'\n');
 return {success:true,sourceRoot,outputRoot,styles:skins.length,assets:skins.length*3,bezel:{slice:16,panelPaint:26},shell:{scale:.40,compactScale:.23,scaleOverrides:{abathur:.34,fenix:.5},compactScaleOverrides:{fenix:.32}},skins};
}
module.exports={build,removeInteriorMatte};
