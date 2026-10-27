'use strict';
// Authentic source detail only: no guessed skin colours or control-icon crops.
// Run build() under the parent's resource guard. --fetch downloads exact catalog
// originals only; generation is deliberately a separate operation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
const catalog=require('../wwwroot/native-console-catalog.json'),uiCatalog=require('./ui-asset-catalog.json').items,layouts=require('./native-console-layouts.json');
const manifestFile=path.join(source,'theme-detail-sources.json');
const bands={nerazim:['nerazim',48,28],ihanrii:['ihanrii',61,16],tyrador:['tyrador',56,20],cerberus:['cerberus',60,20],mecha:['simulant',57,24]};
const fenixNames=['sc2_ui_coop_fenix_topbar_filigree_topcorner','sc2_ui_coop_fenix_topbar_filigree_bottomcorner','sc2_ui_coop_fenix_topbar_filigree_top','sc2_ui_ingame_storymode_panel_faction_purifier_underline'];
const extraNames=['ui_console_panel_unitinfo_forged','ui_console_panel_unitinfo_arcadecabinetpurple','sc2_ui_ingame_storymode_panel_faction_taldarim_outline'];
const requiredNames=[...new Set([...Object.values(bands).map(([family])=>'ui_console_panel_unitinfo_'+family),...fenixNames,'sc2_ui_ingame_storymode_panel_faction_taldarim_underline',...extraNames])];
function record(name){
 const filename=name+'.png',file=path.join(source,filename),bytes=fs.readFileSync(file),item=uiCatalog.find(x=>x.name===name);
 const hud=name.startsWith('console-')?require('../assets/themes/hud-sources.json').sources.find(x=>x.file===filename):null;
 const url=item?'https://dist.sc2arcade.com/star-assets/'+item.image:hud?.url;
 if(!url)throw Error('No authoritative source provenance for '+name);
 return {name,file:filename,url,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
function provenance(names){
 const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')).sources.map(x=>x.name):[];
 const sources=[...new Set([...previous,...names])].sort().map(record);
 fs.writeFileSync(manifestFile,JSON.stringify({scope:'Original SC2 per-skin decorative sources; catalog identities and source hashes retained; no recoloured substitutes',sources},null,2)+'\n');
 return sources;
}
async function fetchSources(){
 for(const name of requiredNames){
  const file=path.join(source,name+'.png');if(fs.existsSync(file))continue;
  const entry=uiCatalog.find(x=>x.name===name);if(!entry)throw Error('No exact catalog entry: '+name);
  const url='https://dist.sc2arcade.com/star-assets/'+entry.image,response=await fetch(url);
  if(!response.ok)throw Error('Source download '+response.status+' '+name);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid original PNG: '+name);
  fs.writeFileSync(file,bytes);
 }
 return {success:true,scope:'Source acquisition only; no generated images',sources:provenance(requiredNames)};
}
async function fit(input){
 const {data,info}=await sharp(input).resize({width:240,height:20,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
 return {data,width:info.width,height:info.height};
}
function boundary(points,x){
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];if(x<a[0]||x>b[0]||b[0]===a[0])continue;
  return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
 }
 return points.at(-1)[1];
}
async function wholeConsoleTrim(skin){
 const name='console-'+skin.id,layout=layouts[skin.id];if(!layout)throw Error('No authored inner boundary for '+skin.id);
 const {data,info}=await sharp(path.join(source,name+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const split=layout.railX||430,centerY=skin.id==='classic-zerg'?236:210;
 const left=[...layout.left,[split,centerY]],right=[[split,centerY],...(skin.id==='abathur'?[[540,210],[560,248]]:[]),...layout.right];
 let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let x=0;x<info.width;x++){
  const bottom=boundary(x<=split?left:right,x),solid=layout.solidTop?boundary(layout.solidTop,x):64;
  for(let y=0;y<info.height;y++){
   const index=(y*info.width+x)*4;
   // Exact black is the console render's viewing matte, not visible artwork.
   if(y<64||y<solid||y>bottom||!(data[index]||data[index+1]||data[index+2]))data[index+3]=0;
   if(data[index+3]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
 }
 if(maxX<minX)throw Error('No native console trim: '+skin.id);
 const crop={left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1};
 const original=await sharp(data,{raw:info}).extract(crop).png().toBuffer();
 return {...await fit(original),sources:[name],kind:'own-console-upper-trim',region:crop,adaptation:'Complete upper console ornament, native inner-boundary mask; uniformly reduced, never stretched; no baked controls.'};
}
async function purifier(){
 const composites=[],width=240,height=20;
 const add=async(name,rect,target,x,y,mirror=false,coverage=false)=>{
  let image=sharp(path.join(source,name+'.png'));if(rect)image=image.extract(rect);if(mirror)image=image.flop();
  const resized=await image.resize(target.width,target.height,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Original co-op filigree uses low alpha for additive game compositing.
  // Lift coverage only, retaining original RGB; no colour approximation.
  if(coverage)for(let i=3;i<resized.data.length;i+=4)resized.data[i]=Math.min(255,resized.data[i]*5);
  composites.push({input:await sharp(resized.data,{raw:resized.info}).png().toBuffer(),left:x,top:y});
 };
 const top='sc2_ui_coop_fenix_topbar_filigree_topcorner',line='sc2_ui_ingame_storymode_panel_faction_purifier_underline';
 await add(top,null,{width:11,height:20},0,0,true,true);await add(top,null,{width:11,height:20},229,0,false,true);
 await add(line,null,{width:210,height:17},15,1);
 const data=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();
 return {data,width,height,sources:[top,line],kind:'own-coop-faction-decoration',adaptation:'Whole uniformly scaled co-op corners and complete faction underline; filigree alpha coverage x5 for normal compositing, RGB unchanged.'};
}
async function build(){
 sharp.concurrency(1);sharp.cache(false);fs.mkdirSync(out,{recursive:true});
 const tokens=[],styles=[],used=[];
 for(const skin of catalog){
  let detail;
  if(skin.id==='fenix')detail=await purifier();
  else if(skin.id==='alarak'){
   const name='sc2_ui_ingame_storymode_panel_faction_taldarim_underline';detail={...await fit(path.join(source,name+'.png')),sources:[name],kind:'own-faction-decoration',adaptation:'Complete Tal’darim underline, native RGB/alpha, uniform scale.'};
  }else if(bands[skin.id]){
   const [family,y,height]=bands[skin.id],name='ui_console_panel_unitinfo_'+family,file=path.join(source,name+'.png'),metadata=await sharp(file).metadata();
   const region={left:0,top:y,width:metadata.width,height},crop=await sharp(file).extract(region).png().toBuffer();
   detail={...await fit(crop),sources:[name],kind:'own-family-unitinfo-divider',region,adaptation:'Complete original top divider band; native RGB/alpha and uniformly scaled proportions.'};
  }else detail=await wholeConsoleTrim(skin);
  const filename=skin.id+'-section-detail.png';await sharp(detail.data).png().toFile(path.join(out,filename));used.push(...detail.sources);
  tokens.push(':root[data-graphical-style='+skin.id+"]{--theme-section-detail:url('/themes/"+filename+"');--theme-section-detail-size:"+detail.width+'px '+detail.height+'px}');
  const {data,...evidence}=detail;styles.push({id:skin.id,filename,...evidence,sharedFallback:false});
 }
 fs.writeFileSync(path.join(root,'wwwroot/theme-detail-tokens.css'),'/* Generated original per-skin section details. Render whole with contain; never stretch. Source mapping/provenance: theme-detail-sources.json and generator report. */\n'+tokens.join('\n')+'\n');
 const sources=provenance(used);
 return {success:true,styles,maxSize:[240,20],ownSourceStyles:styles.length,sharedFallbackStyles:0,sources};
}
module.exports={build,fetchSources,wholeConsoleTrim};
if(require.main===module)(process.argv.includes('--fetch')?fetchSources():build()).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
