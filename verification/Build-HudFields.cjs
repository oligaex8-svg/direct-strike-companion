'use strict';
// Reassemble the chat atlas's authored caps around an empty live-text well.
// The horizontal/vertical edges contain straight rail pixels only and repeat;
// the game field's ribbed interior never enters a scalable region.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
const cssPath=path.join(root,'wwwroot/hud-fields.css');
const defaultFamilies={protoss:'defaultprotoss',nerazim:'nerazim',terran:'defaultterran',zerg:'defaultzerg',fenix:'purifier','classic-protoss':'defaultprotoss','classic-terran':'defaultterran','classic-zerg':'defaultzerg'};
const start='/* BEGIN GENERATED FIELD FAMILIES */',end='/* END GENERATED FIELD FAMILIES */';
function read(family){
 const filename='ui_console_chatbar_background_'+family+'.png',bytes=fs.readFileSync(path.join(source,filename));
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Not a PNG: '+filename);
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 if(width<216||height<104)throw Error('Chat atlas is too small: '+filename);
 return {width,height,href:'data:image/png;base64,'+bytes.toString('base64')};
}
function frame(image){
 const piece=([sx,sy,sw,sh],[x,y,w,h])=>`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#native"/></svg>`;
 // Each corner keeps a 24x24 native sample at 24x24. The lower cap is the
 // atlas's separate upward-facing assembly, rather than a mirrored invention.
 const pieces=[
  piece([0,0,24,24],[0,0,24,24]),piece([80,0,24,24],[104,0,24,24]),
  piece([112,0,24,24],[0,104,24,24]),piece([184,0,24,24],[104,104,24,24]),
  // Only the small edge thickness is resampled into the common atlas band.
  // CSS repeat keeps the length of these four-pixel straight rail tiles fixed.
  piece([48,0,4,24],[24,0,4,24]),piece([152,0,4,24],[24,104,4,24]),
  piece([0,26,24,4],[0,24,24,4]),piece([80,26,24,4],[104,24,24,4])
 ];
 // Tile across the atlas's middle bands before border-image repeats those
 // bands at runtime. The repeated source regions have no jewels or ribs.
 const horizontal=[];for(let x=28;x<104;x+=4)horizontal.push(piece([48,0,4,24],[x,0,4,24]),piece([152,0,4,24],[x,104,4,24]));
 const vertical=[];for(let y=28;y<104;y+=4)vertical.push(piece([0,26,24,4],[0,y,24,4]),piece([80,26,24,4],[104,y,24,4]));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><image id="native" width="${image.width}" height="${image.height}" href="${image.href}"/></defs>${pieces.join('')}${horizontal.join('')}${vertical.join('')}</svg>\n`;
}
function build(styleFamilyMap=defaultFamilies){
 const entries=Object.entries(styleFamilyMap);
 if(!entries.length)throw Error('At least one HUD field family is required');
 const images=new Map();
 for(const [style,family] of entries){
  if(!/^[a-z][a-z0-9-]*$/.test(style)||typeof family!=='string'||!/^[a-z][a-z0-9-]*$/.test(family))throw Error('Invalid HUD style/family mapping');
  if(style==='default')throw Error('Default menu does not use game HUD fields');
  if(!images.has(family))images.set(family,read(family));
 }
 const css=fs.readFileSync(cssPath,'utf8'),from=css.indexOf(start),to=css.indexOf(end);
 if(from<0||to<from)throw Error('HUD field CSS token markers missing');
 const tokens=entries.map(([style])=>`:root[data-graphical-style=${style}]{--hud-field-frame:url('/themes/${style}-hud-field-frame.svg')}`).join('\n');
 fs.mkdirSync(out,{recursive:true});
 for(const [style,family] of entries)fs.writeFileSync(path.join(out,style+'-hud-field-frame.svg'),frame(images.get(family)));
 fs.writeFileSync(cssPath,css.slice(0,from+start.length)+'\n'+tokens+'\n'+css.slice(to));
 return {success:true,styles:entries.length,families:images.size,assets:entries.map(([style])=>style+'-hud-field-frame.svg')};
}
module.exports={build,defaultFamilies};
if(require.main===module)console.log(JSON.stringify(build()));
