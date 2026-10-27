'use strict';
// Nerazim is the gold / emerald / violet in-game Protoss console. Keep the
// sweeping shoulders as fixed ornaments, separate from straight scalable rails.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
function read(name){const b=fs.readFileSync(path.join(source,name+'.png'));return {name,width:b.readUInt32BE(16),height:b.readUInt32BE(20),href:'data:image/png;base64,'+b.toString('base64'),sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function build(){
 const art=read('console-nerazim'),rule=read('ui_console_panel_unitinfo_nerazim');
 // The console catalog render has a black viewing matte. Key exact black only;
 // the native armour, jewel light, contour alpha and shadow pixels are retained.
 const matte='<filter id="matte" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 100 100 100 0 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
 const defs=matte+`<image id="native" width="${art.width}" height="${art.height}" href="${art.href}" filter="url(#matte)"/>`;
 const piece=([sx,sy,sw,sh],[x,y,w,h])=>`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#native"/></svg>`;
 const save=(name,body,w=128,h=128)=>fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>\n`);
 // The header's native shoulders own the entire top contour. There is no
 // rectangular top rail behind their transparent corners.
 save('nerazim',[
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
 save('nerazim-crest',piece([310,178,30,32],[0,0,30,32]),30,32);
 // The information well uses the console's lower gold lip and side uprights.
 // Reflecting the lower corners supplies a clean top without the upper horns,
 // portrait housing or the central crest; only the plain rail is stretched.
 save('protoss-nerazim-well',[
  `<g transform="translate(0 32) scale(1 -1)">${piece([205,296,44,24],[0,0,32,32])}${piece([646,296,44,24],[96,0,32,32])}${piece([350,304,4,16],[32,0,64,32])}</g>`,
  piece([205,296,44,24],[0,96,32,32]),piece([646,296,44,24],[96,96,32,32]),piece([350,304,4,16],[32,96,64,32]),
  piece([205,238,16,4],[0,32,12,64]),piece([675,238,16,4],[116,32,12,64])
 ].join(''));
 // The right command-bank rim is sampled outside the baked command glyphs.
 // It encloses live portraits, whose individual square slots use native states.
 save('protoss-nerazim-deck',[
  piece([764,174,12,12],[0,0,24,24]),piece([978,174,14,12],[104,0,24,24]),
  `<g transform="translate(0 128) scale(1 -1)">${piece([764,174,12,12],[0,0,24,24])}${piece([978,174,14,12],[104,0,24,24])}${piece([864,174,4,6],[24,0,80,12])}</g>`,
  piece([864,174,4,6],[24,0,80,12]),
  piece([764,238,12,4],[0,24,16,80]),piece([980,238,12,4],[112,24,16,80])
 ].join(''));
 fs.writeFileSync(path.join(out,'protoss-nerazim-rule.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="26" viewBox="0 48 96 26" preserveAspectRatio="none"><image width="96" height="300" href="${rule.href}"/></svg>\n`);
 const textures=fs.readdirSync(source).filter(n=>/^ui_console_.*_nerazim\.png$/.test(n)).map(n=>read(n.slice(0,-4)));
 fs.writeFileSync(path.join(source,'nerazim-console-sources.json'),JSON.stringify({scope:'Original Nerazim Protoss console and controls matching the user reference; source pixels preserved',sources:[art,...textures].map(({name,width,height,sha256})=>({name,width,height,sha256,url:name===art.name?'https://dist.sc2arcade.com/star-assets/consoles-png/sc2_ui_collection_huds_large_consoleprotoss_nerazim.png':'https://dist.sc2arcade.com/star-assets/ui-png/'+name+'.png'}))},null,2)+'\n');
 return {success:true,assets:9,originalTextures:textures.length+1};
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build()));
