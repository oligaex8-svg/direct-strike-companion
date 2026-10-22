'use strict';
// Nerazim is the gold / emerald / violet in-game Protoss console. Keep the
// sweeping shoulders as fixed ornaments, separate from straight scalable rails.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
function read(name){const b=fs.readFileSync(path.join(source,name+'.png'));return {name,width:b.readUInt32BE(16),height:b.readUInt32BE(20),href:'data:image/png;base64,'+b.toString('base64'),sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function build(){
 const art=read('console-protoss-nerazim'),rule=read('ui_console_panel_unitinfo_nerazim');
 // The console catalog render has a black viewing matte. Key exact black only;
 // the native armour, jewel light, contour alpha and shadow pixels are retained.
 const matte='<filter id="matte" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 100 100 100 0 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
 const defs=matte+`<image id="native" width="${art.width}" height="${art.height}" href="${art.href}" filter="url(#matte)"/>`;
 const piece=([sx,sy,sw,sh],[x,y,w,h])=>`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#native"/></svg>`;
 const save=(name,body,w=128,h=128)=>fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>\n`);
 // The header's native shoulders own the entire top contour. There is no
 // rectangular top rail behind their transparent corners.
 save('protoss',[
  piece([0,280,48,36],[0,96,32,32]),piece([960,280,32,36],[96,96,32,32]),
  piece([100,280,4,36],[32,96,64,32]),
  piece([0,240,48,4],[0,32,32,64]),piece([960,240,32,4],[96,32,32,64])
 ].join(''));
 save('protoss-nerazim-rack',[
  piece([0,128,40,32],[0,0,32,32]),piece([168,128,44,32],[96,0,32,32]),
  piece([0,280,40,36],[0,96,32,32]),piece([168,280,44,36],[96,96,32,32]),
  piece([80,128,4,32],[32,0,64,32]),piece([80,280,4,36],[32,96,64,32]),
  piece([0,240,40,4],[0,32,32,64]),piece([168,240,44,4],[96,32,32,64])
 ].join(''));
 // Trace only the inner edge of the authored casing to exclude the actual
 // game-command icons and empty minimap/portrait wells from this header.
 const shoulder=(name,x,width,edge)=>{
  const mask=`<clipPath id="casing"><path d="M${x} 106H${x+width}V${edge[0][1]}${edge.map(([px,py])=>'L'+px+' '+py).join('')}Z"/></clipPath>`;
  fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="112" viewBox="${x} 106 ${width} 112"><defs>${defs}${mask}</defs><use href="#native" clip-path="url(#casing)"/></svg>\n`);
 };
 shoulder('protoss-nerazim-left',0,310,[[310,208],[220,202],[204,194],[204,163],[166,158],[0,158]]);
 shoulder('protoss-nerazim-right',650,342,[[992,218],[984,218],[984,174],[775,174],[766,174],[766,194],[744,199],[706,207],[700,218],[650,218]]);
 fs.writeFileSync(path.join(out,'protoss-nerazim-header-rail.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="112" viewBox="430 106 4 112" preserveAspectRatio="none"><defs>${defs}</defs><use href="#native"/></svg>\n`);
 save('protoss-crest',piece([310,178,30,32],[0,0,30,32]),30,32);
 fs.writeFileSync(path.join(out,'protoss-nerazim-rule.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="26" viewBox="0 48 96 26" preserveAspectRatio="none"><image width="96" height="300" href="${rule.href}"/></svg>\n`);
 const textures=fs.readdirSync(source).filter(n=>/^ui_console_.*_nerazim\.png$/.test(n)).map(n=>read(n.slice(0,-4)));
 fs.writeFileSync(path.join(source,'nerazim-console-sources.json'),JSON.stringify({scope:'Original Nerazim Protoss console and controls matching the user reference; source pixels preserved',sources:[art,...textures].map(({name,width,height,sha256})=>({name,width,height,sha256,url:name===art.name?'https://dist.sc2arcade.com/star-assets/consoles-png/sc2_ui_collection_huds_large_consoleprotoss_nerazim.png':'https://dist.sc2arcade.com/star-assets/ui-png/'+name+'.png'}))},null,2)+'\n');
 return {success:true,assets:7,originalTextures:textures.length+1};
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build()));
