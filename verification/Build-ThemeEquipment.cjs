'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const art=require('./ThemeEquipmentRaster.cjs'),root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/equipment');
const FPS=24,DURATION=6,FRAMES=144,POSTER_FRAME=36,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const SOURCE_HASH=art.sourceHash();
const parts=Object.keys(art.PARTS),ids=Object.keys(art.profiles);
function entry(id,part){const g=art.PARTS[part];return {src:`/themes/equipment/${id}-${part}.webp`,poster:`/themes/equipment/${id}-${part}-poster.webp`,...g,fps:FPS,duration:DURATION,frames:FRAMES,atlasWidth:g.width*g.columns,atlasHeight:g.height*g.rows,object:art.profiles[id].objects[parts.indexOf(part)]};}
function atlas(id,part){const g=art.PARTS[part],width=g.width*g.columns,height=g.height*g.rows,data=Buffer.alloc(width*height*4);let poster;
 for(let f=0;f<FRAMES;f++){const image=art.render(id,part,f/FRAMES),col=f%g.columns,row=Math.floor(f/g.columns);for(let y=0;y<g.height;y++)image.data.copy(data,((row*g.height+y)*width+col*g.width)*4,y*g.width*4,(y+1)*g.width*4);if(f===POSTER_FRAME)poster=image;}
 return {data,width,height,channels:4,poster};}
async function generate(selected){
 if(!selected.length||selected.some(id=>!ids.includes(id)))throw Error('Unknown equipment theme');
 const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);fs.mkdirSync(out,{recursive:true});
 for(const id of selected){await art.prepare(id);const assets=[];for(const part of parts){const raw=atlas(id,part),a=entry(id,part),encode=image=>sharp(image.data,{raw:{width:image.width,height:image.height,channels:4}}).webp({quality:94,alphaQuality:100,effort:2}).toBuffer();const bytes=await encode(raw),poster=await encode(raw.poster);fs.writeFileSync(path.join(webRoot(),a.src),bytes);fs.writeFileSync(path.join(webRoot(),a.poster),poster);assets.push({...a,id,part,sha256:hash(bytes),posterSha256:hash(poster),sourceSha256:SOURCE_HASH});}
  fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({id,revision:1,assets},null,2));console.log(JSON.stringify({success:true,id,logicalObjects:4}));
 }
}
function webRoot(){return path.join(root,'wwwroot');}
function finalize(){const catalog={},assets=[];if(art.sourceHash()!==SOURCE_HASH)throw Error('Raster sources changed during generation; restart the guarded job');
 for(const id of ids){const record=JSON.parse(fs.readFileSync(path.join(out,id+'.json'),'utf8'));catalog[id]={};for(const part of parts){const a=record.assets.find(x=>x.part===part);if(!a||a.sourceSha256!==SOURCE_HASH)throw Error('Stale equipment: '+id+'/'+part);for(const [key,expected]of Object.entries(entry(id,part)))if(a[key]!==expected)throw Error('Invalid equipment contract: '+id+'/'+key);if(hash(fs.readFileSync(path.join(webRoot(),a.src)))!==a.sha256||hash(fs.readFileSync(path.join(webRoot(),a.poster)))!==a.posterSha256)throw Error('Equipment hash mismatch');catalog[id][part]=entry(id,part);assets.push(a);}}
 const manifest={revision:1,sourceSha256:SOURCE_HASH,provenance:'Eighty physical image-generated raster equipment modules based on recorded native console references; not native animation exports',runtime:'Original high-resolution imported bitmap sculpture; offline interior motion only, cached WebP playback',time:{fps:FPS,duration:DURATION,frames:FRAMES,posterFrame:POSTER_FRAME},assets};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(root,'wwwroot/theme-equipment-catalog.js'),'/* Generated logical equipment atlas catalog. */\nwindow.DSThemeEquipmentCatalog=Object.freeze('+JSON.stringify(catalog)+');\n');console.log(JSON.stringify({success:true,themes:ids.length,logicalObjects:assets.length}));return manifest;}
async function main(){const arg=process.argv[2];if(arg==='--finalize')return finalize();if(!arg?.startsWith('--ids='))throw Error('Use --ids=terran,nova,... or --finalize');await generate(arg.slice(6).split(','));}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={art,ids,parts,FPS,DURATION,FRAMES,POSTER_FRAME,SOURCE_HASH,entry,atlas,generate,finalize};
