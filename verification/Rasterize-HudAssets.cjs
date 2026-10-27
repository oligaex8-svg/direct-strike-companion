'use strict';
// Bake the assembled, source-pixel frames once. Runtime controls still use
// fixed corners and repeating rails, without recursively rendering SVG uses.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),folder=path.join(root,'wwwroot/themes');
async function build(){
 sharp.concurrency(1);sharp.cache(false);
 const files=fs.readdirSync(folder).filter(n=>/-native-(left|right|rail|rule|well|shell)\.svg$|-hud-field-frame\.svg$/.test(n));
 for(const name of files){
  const file=path.join(folder,name),output=file.replace(/\.svg$/,'.png');
  await sharp(file,{density:72}).png().toFile(output);
  const stats=await sharp(output).stats(),meta=await sharp(output).metadata();
  if(!meta.width||!meta.height||stats.channels.every(c=>c.max===0))throw Error('Empty raster frame: '+name);
 }
 for(const name of ['native-console-tokens.css','hud-fields.css']){
  const file=path.join(root,'wwwroot',name),css=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,css.replace(/(-native-(?:left|right|rail|rule|well|shell)|-hud-field-frame)\.svg/g,'$1.png'));
 }
 return {success:true,assets:files.length,scope:'Offline rasterization of original source-pixel assemblies; no shape or layout change'};
}
module.exports={build};if(require.main===module)build().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
