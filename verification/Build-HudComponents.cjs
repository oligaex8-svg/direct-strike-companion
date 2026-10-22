'use strict';
// Adapt original in-game texture regions, preserving the authored contours.
// Only image pixels receive palette/well treatment; live text never does.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
const roles={
 'nav-normal':['menubutton_normal',[0,0,40,40],.38],
 'nav-hover':['menubutton_hover',[0,0,40,40],.38],
 'nav-pressed':['menubutton_pressed',[0,0,40,40],.45],
 'nav-selected':['menubutton_selected',[0,0,40,40],.4],
 'command-normal':['commandbutton_normal',[0,0,76,76],.48],
 'command-hover':['commandbutton_highlighted',[0,0,76,76],.48],
 'command-pressed':['commandbutton_superhighlighted',[0,0,76,76],.58],
 'group-normal':['controlgroupbutton_normal',[0,0,82,58],.38],
 'group-hover':['controlgroupbutton_hover',[0,0,82,58],.38],
 'group-pressed':['controlgroupbutton_pressed',[0,0,82,58],.45],
 'field':['chatbar_background',[0,0,104,44],.38],
 'toolbar':['chatbar_background',[0,126,216,64],.55],
 'panel-head':['menubar_background',[154,0,87,56],.4],
 'helper':['helperbutton_background',[0,0,92,62],.45],
 'timer':['timer_background',[0,0,88,42],.4],
 'tooltip':['tooltip_background',[0,0,64,30],0],
 'small-normal':['minimapbutton_normal',[0,0,42,42],.4],
 'small-hover':['minimapbutton_hover',[0,0,42,42],.4]
};
const modern={protoss:'nerazim',terran:'defaultterran',zerg:'defaultzerg',fenix:'purifier'};
const classic={
 'classic-terran':{panel:[207,199,471,117],minimap:[0,110,202,206],borders:[56,30,12,12],sample:[72,242],crown:[520,175,115,24],button:[785,223,40,40]},
 'classic-protoss':{panel:[207,199,471,117],minimap:[0,108,208,208],borders:[54,38,12,10],sample:[94,240],crown:[480,176,110,24],button:[785,223,40,40]},
 'classic-zerg':{panel:[208,198,470,118],minimap:[0,106,201,210],borders:[54,34,12,12],sample:[90,240],crown:[480,172,110,30],button:[785,223,40,40]}
};
const palette='<filter id="palette" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values=".68 .12 .12 0 .012 .04 .65 .10 0 .005 .42 .32 .75 0 .018 0 0 0 1 0"/></filter>';
// Console previews contain an opaque black world/viewing matte. Key only exact
// black; retain the original alpha and all non-black material/shadow pixels.
const matte='<filter id="matte" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 100 100 100 0 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
const png=file=>{const bytes=fs.readFileSync(path.join(source,file));return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),href:'data:image/png;base64,'+bytes.toString('base64')};};
function crop(file,rect,tint=false,wash=0,light=1){
 const p=png(file),[x,y,w,h]=rect;
 if(x<0||y<0||x+w>p.width||y+h>p.height)throw Error('Invalid native region: '+file+' '+rect);
 const keyed=file.startsWith('console-');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><defs>${tint?palette:''}${keyed?matte:''}${light!==1?`<filter id="light"><feComponentTransfer><feFuncR type="linear" slope="${light}"/><feFuncG type="linear" slope="${light}"/><feFuncB type="linear" slope="${light}"/></feComponentTransfer></filter>`:''}</defs><g${light!==1?' filter="url(#light)"':''}><image width="${p.width}" height="${p.height}" href="${p.href}"${tint?' filter="url(#palette)"':keyed?' filter="url(#matte)"':''}/></g>${wash?`<rect x="${x+8}" y="${y+8}" width="${Math.max(1,w-16)}" height="${Math.max(1,h-16)}" rx="2" fill="black" opacity="${wash}"/>`:''}</svg>\n`;
}
function frame(file,rect,borders=[28,28,28,28],sample){
 const p=png(file),[x,y,w,h]=rect,[t,r,b,l]=borders;
 const sx=sample?.[0]??x+l+8,sy=sample?.[1]??y+t+8;
 const piece=(dx,dy,dw,dh,sx,sy,sw,sh)=>`<svg x="${dx}" y="${dy}" width="${dw}" height="${dh}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#native"/></svg>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs>${matte}<image id="native" width="${p.width}" height="${p.height}" href="${p.href}" filter="url(#matte)"/></defs>${[
 piece(0,0,32,32,x,y,l,t),piece(96,0,32,32,x+w-r,y,r,t),piece(0,96,32,32,x,y+h-b,l,b),piece(96,96,32,32,x+w-r,y+h-b,r,b),
 piece(32,0,64,32,sx,y,4,t),piece(32,96,64,32,sx,y+h-b,4,b),piece(0,32,32,64,x,sy,l,4),piece(96,32,32,64,x+w-r,sy,r,4)
 ].join('')}</svg>\n`;
}
const tokens=[];
for(const style of [...Object.keys(modern),...Object.keys(classic)]){
 const values=[];
 for(const [role,[native,rect,wash]] of Object.entries(roles)){
  let svg;
  if(modern[style])svg=crop('ui_console_'+native+'_'+modern[style]+'.png',rect,style==='zerg',wash);
  else{
   const cfg=classic[style],file='console-'+style+'.png';
   const region=role==='tooltip'?cfg.crown:cfg.button;
   const light=role.includes('hover')?1.25:role.includes('pressed')?.8:role.includes('selected')?1.15:1;
   // Race-matched 2-D control textures keep thin strips readable. Sculpted
   // model ornaments belong on the full minimap frame, never stretched into
   // a short panel label. Classic command slots retain their original pixels.
   svg=['panel-head','helper','field','toolbar','timer','tooltip'].includes(role)
    ?crop('ui_console_'+native+'_default'+style.slice(8)+'.png',rect,false,wash)
    :crop(file,region,false,wash,light);
  }
  const name=style+'-hud-'+role+'.svg';fs.writeFileSync(path.join(out,name),svg);values.push('--hud-'+role+':url(\'/themes/'+name+'\')');
 }
 if(style==='fenix'||classic[style]){
  const file='console-'+style+'.png',cfg=classic[style]||{panel:[218,184,450,132],minimap:[0,124,206,192],crown:[470,185,110,24]};
  fs.writeFileSync(path.join(out,style+'.svg'),classic[style]?frame(file,cfg.minimap,cfg.borders,cfg.sample):frame(file,cfg.panel));
  fs.writeFileSync(path.join(out,style+'-crest.svg'),crop(file,cfg.crown));
  fs.writeFileSync(path.join(out,style+'-surface.svg'),crop(file,cfg.panel,false,.7));
  fs.copyFileSync(path.join(out,style+'-hud-command-normal.svg'),path.join(out,style+'-command.svg'));
  fs.copyFileSync(path.join(out,style+'-hud-group-normal.svg'),path.join(out,style+'-control.svg'));
  fs.writeFileSync(path.join(out,style+'-minimap.svg'),frame(file,cfg.minimap));
 }
 tokens.push(':root[data-graphical-style='+style+']{'+values.join(';')+'}');
}
fs.writeFileSync(path.join(root,'wwwroot/hud-assets.css'),'/* Generated by Build-HudComponents.cjs from original in-game texture regions. */\n'+tokens.join('\n')+'\n');
require('./Build-PurifierDetails.cjs').build();
require('./Build-NerazimConsole.cjs').build();
console.log(JSON.stringify({success:true,styles:7,componentRoles:Object.keys(roles).length,newConsoleFamilies:5}));
