'use strict';
// Unpack SC2's UI atlas coordinates into scalable, transparent nine-slice frames.
// Texture pixels are retained; only their placement changes. No runtime canvas,
// filters, network requests or animation are needed by the dashboard.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),output=path.join(root,'wwwroot/themes');
const hashes={};
// The front-end uses Battle.net menu construction, distinct from the HUD atlas.
for(const [name,filename] of Object.entries({
 'menu-frame.png':'ui_battlenet_glues_pageassets_dialogstandardborder_noglow.png',
 'menu-hex.png':'ui_battlenet_glues_pageassets_dialog_hexpattern.png',
 'nav-selected.png':'ui_battlenet_glues_topnav_buttonselected.png',
 'Michroma-Regular.ttf':'Michroma-Regular.ttf',
 'Michroma-OFL.txt':'Michroma-OFL.txt'
})){const bytes=fs.readFileSync(path.join(source,filename));fs.writeFileSync(path.join(output,name),bytes);hashes[filename]=crypto.createHash('sha256').update(bytes).digest('hex');}
// SC2 tints this neutral button atlas blue in its layout. Apply the tint to the
// image itself so text and focus indicators never inherit an opacity/filter.
const menuButton=fs.readFileSync(path.join(source,'ui_battlenet_glues_standardbuttons_small_border_outer.png'));
hashes['ui_battlenet_glues_standardbuttons_small_border_outer.png']=crypto.createHash('sha256').update(menuButton).digest('hex');
fs.writeFileSync(path.join(output,'menu-button.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${menuButton.readUInt32BE(16)}" height="${menuButton.readUInt32BE(20)}"><defs><filter id="blue" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".4 0 0 0 0 0 .68 0 0 0 0 0 .88 0 0 0 0 0 1 0"/></filter></defs><image width="100%" height="100%" filter="url(#blue)" href="data:image/png;base64,${menuButton.toString('base64')}"/></svg>\n`);
// Authored interface glyphs share one stroke system; they are not game artwork.
const navGlyphs={
 lobby:'<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M6 3v10M3 7.5h10M9 5h2M9 10h2"/>',
 profile:'<circle cx="8" cy="5" r="2.5"/><path d="M3 14v-1a5 5 0 0 1 10 0v1Z"/>',
 players:'<circle cx="6" cy="5" r="2"/><path d="M2 13v-1a4 4 0 0 1 8 0v1M11 3a2 2 0 0 1 0 4M12 9a3 3 0 0 1 2 3v1"/>',
 friends:'<circle cx="6" cy="5" r="2"/><path d="M2 13v-1a4 4 0 0 1 8 0v1M12 5v6M9 8h6"/>',
 picks:'<circle cx="8" cy="8" r="4.5"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4"/>',
 stats:'<path d="M2 2v12h12M5 11V8M8.5 11V5M12 11V3"/>',
 matches:'<rect x="2" y="3" width="12" height="10" rx="1"/><path d="m6 5 5 3-5 3Z"/>',
 marks:'<path d="M3 14V2h10l-2 3 2 3H3"/>',
 sounds:'<path d="M2 6h3l4-3v10l-4-3H2ZM11 5a4 4 0 0 1 0 6M13 3a7 7 0 0 1 0 10"/>',
 settings:'<path d="M3 2v12M8 2v12M13 2v12M1 5h4M6 10h4M11 6h4"/>',
 updates:'<path d="M13 6A5.5 5.5 0 0 0 3 4L1.5 6M1.5 2v4H6M3 10a5.5 5.5 0 0 0 10 2l1.5-2M10 10h4.5v4"/>'
};
for(const [name,geometry] of Object.entries(navGlyphs))fs.writeFileSync(path.join(output,`nav-${name}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${geometry}</svg>\n`);
for(const race of ['protoss','terran','zerg']){
 const filename=`ui_frame_default_${race}.png`,bytes=fs.readFileSync(path.join(source,filename));
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 if(width!==300||height!==496)throw Error(`Unexpected ${filename} atlas dimensions: ${width}x${height}`);
 hashes[filename]=crypto.createHash('sha256').update(bytes).digest('hex');
 const texture=`data:image/png;base64,${bytes.toString('base64')}`;
 // Keep the original sculpted Zerg material, but light it in amethyst rather
 // than the menu atlas's brown/amber. Alpha and geometric detail are unchanged.
 const paletteFilter=race==='zerg'?'<filter id="palette" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values=".68 .12 .12 0 .012 .04 .65 .10 0 .005 .42 .32 .75 0 .018 0 0 0 1 0"/></filter>':'';
 const paletteDefs=paletteFilter?`<defs>${paletteFilter}</defs>`:'';
 const paletteAttribute=paletteFilter?' filter="url(#palette)"':'';
 const tintedControl=(name,imageBytes)=>{
  const w=imageBytes.readUInt32BE(16),h=imageBytes.readUInt32BE(20);
  fs.writeFileSync(path.join(output,name),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${paletteDefs}<image width="${w}" height="${h}"${paletteAttribute} href="data:image/png;base64,${imageBytes.toString('base64')}"/></svg>\n`);
 };
 const commandName=`ui_console_commandbutton_normal_default${race}.png`,commandBytes=fs.readFileSync(path.join(source,commandName));
 hashes[commandName]=crypto.createHash('sha256').update(commandBytes).digest('hex');
 fs.writeFileSync(path.join(output,`${race}-command.png`),commandBytes);
 if(race==='zerg')tintedControl('zerg-command.svg',commandBytes);
 // The atlas's central crown is deliberately retained, rather than replacing
 // all its character with a stretched straight edge.
 fs.writeFileSync(path.join(output,`${race}-crest.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="18" viewBox="42 0 64 12">${paletteDefs}<image width="300" height="496"${paletteAttribute} href="${texture}"/></svg>\n`);
 const piece=(x,y,w,h,sx,sy,sw,sh)=>`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#atlas"/></svg>`;
 const frame=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs>${paletteFilter}<image id="atlas" width="300" height="${height}"${paletteAttribute} href="${texture}"/></defs>${[
  // Corners keep the sculpted plate / carapace contours and inner light track.
  piece(0,0,32,32,0,0,32,32),piece(96,0,32,32,116,0,32,32),
  piece(0,96,32,32,150,32,32,32),piece(96,96,32,32,266,32,32,32),
  // Straight portions sample the matching outer, bevel and inner atlas rails.
  piece(32,0,64,32,32,0,20,32),piece(32,96,64,32,182,32,20,32),
  piece(0,32,32,64,0,32,32,20),piece(96,32,32,64,116,32,32,20)
 ].join('')}</svg>`;
 fs.writeFileSync(path.join(output,`${race}.svg`),frame+'\n');
 // The atlas glass has fine vertical scoring, kept behind a dark CSS wash.
 fs.writeFileSync(path.join(output,`${race}-surface.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="22 218 256 64">${paletteDefs}<image width="300" height="${height}"${paletteAttribute} href="${texture}"/></svg>\n`);
 const controlBytes=fs.readFileSync(path.join(source,`ui_console_controlgroupbutton_normal_default${race}.png`));
 fs.writeFileSync(path.join(output,`${race}-control.png`),controlBytes);
 if(race==='zerg')tintedControl('zerg-control.svg',controlBytes);
}
fs.writeFileSync(path.join(__dirname,'faction-texture-sources.json'),JSON.stringify({source:'Blizzard Entertainment / StarCraft II',archive:'https://asset-explorer.sc2arcade.com/ui.html',hashes},null,2)+'\n');
console.log(JSON.stringify({success:true,races:3,outputs:34,source:'Original SC2 HUD/menu/command atlases; amethyst Zerg palette tint; authored navigation glyphs; OFL Michroma title font'}));
