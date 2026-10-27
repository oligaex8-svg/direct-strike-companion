'use strict';
// Attach authored HUD shoulders to a plain rail. Ornaments are uniformly scaled;
// nine-slice wells repeat only unadorned edge samples. No baked command glyphs.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes'),source=path.join(root,'assets/themes');
const catalog=require('../wwwroot/native-console-catalog.json');
const layouts=require('./native-console-layouts.json');
const matte='<filter id="matte" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 100 100 100 0 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
const classicPalette={'classic-terran':{surface:'#161d23',accent:'#8bd4ae',edge:'#687e84'},'classic-protoss':{surface:'#151e23',accent:'#80ceef',edge:'#bca45d'},'classic-zerg':{surface:'#1d1815',accent:'#e5ad67',edge:'#a47a50'}};
async function build(){
 sharp.concurrency(1);sharp.cache(false);
 const tokens=[];
 fs.writeFileSync(path.join(root,'wwwroot/native-console-catalog.js'),"'use strict';\nconst nativeConsoleCatalog=Object.freeze("+JSON.stringify(catalog)+");\n");
 const blend=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
 for(const skin of catalog){
  const p={...skin,...classicPalette[skin.id]},headerColour=blend(p.surface,'#000000',.18);
  const b=fs.readFileSync(path.join(source,'console-'+skin.id+'.png')),w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  if(w!==992||h!==316)throw Error('Unexpected console render '+skin.id);
  const rgba=await sharp(b).ensureAlpha().raw().toBuffer();
  const keyed=Buffer.from(rgba);
  for(let i=0;i<keyed.length;i+=4)keyed[i+3]=Math.round(keyed[i+3]*Math.min(1,(keyed[i]+keyed[i+1]+keyed[i+2])*100/255));
  await sharp(keyed,{raw:{width:w,height:h,channels:4}}).extract({left:0,top:64,width:w,height:h-64}).resize({width:496}).png().toFile(path.join(out,skin.id+'-native-preview.png'));
  const defs=matte+`<image id="native" width="992" height="316" href="data:image/png;base64,${b.toString('base64')}" filter="url(#matte)"/>`;
  const part=(r,d,id='native')=>`<svg x="${d[0]}" y="${d[1]}" width="${d[2]}" height="${d[3]}" viewBox="${r.join(' ')}" preserveAspectRatio="none" overflow="hidden"><use href="#${id}"/></svg>`;
  const save=(name,body,view='0 0 128 128',extra='')=>{const [,,width,height]=view.split(' ');fs.writeFileSync(path.join(out,skin.id+'-native-'+name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${view}" ${extra}><defs>${defs}</defs>${body}</svg>\n`);};
  // A real closed helper-panel frame owns the information wells. Console
  // corners contain perspective armour and cannot be interchanged here.
  const helper=fs.readFileSync(path.join(source,'ui_console_helperbutton_background_'+skin.family+'.png')),hw=helper.readUInt32BE(16),hh=helper.readUInt32BE(20);
  const hp=(r,d)=>part(r,d,'helper');
  const frame=`<defs><image id="helper" width="${hw}" height="${hh}" href="data:image/png;base64,${helper.toString('base64')}"/></defs>`+[hp([0,0,16,16],[0,0,32,32]),hp([hw-16,0,16,16],[96,0,32,32]),hp([0,hh-16,16,16],[0,96,32,32]),hp([hw-16,hh-16,16,16],[96,96,32,32]),hp([40,0,2,16],[32,0,64,32]),hp([40,hh-16,2,16],[32,96,64,32]),hp([0,30,16,2],[0,32,32,64]),hp([hw-16,30,16,2],[96,32,32,64])].join('');
  save('well',frame);
  // The sculpted header owns the top contour. A second rectangular top rail
  // behind it would show through its cut-outs, so the outer shell has none.
  // Continue the header's outside walls, not the unrelated inner unit-info
  // corners. Full 32px foot samples retain the complete native turn at 1:1.
  save('shell',[part([0,240,24,2],[0,0,32,96]),part([968,240,24,2],[96,0,32,96]),part([0,284,32,32],[0,96,32,32]),part([960,284,32,32],[96,96,32,32]),part([430,284,2,32],[32,96,64,32])].join(''));
  // Header excludes the minimap/command interiors. These are actual profile
  // silhouettes, not generic rectangles tinted to resemble a different race.
  // Per-console inner-well boundaries exclude controls below the casing.
  // The exterior contour comes entirely from the original source alpha;
  // all spikes/shoulders above these inner boundaries remain untouched.
  const layout=layouts[skin.id];if(!layout)throw Error('Missing console inner boundary '+skin.id);
  const split=layout.railX||430;
  const header=async(name,x,width)=>{
   const edge=name==='left'?[...layout.left,[split,skin.id==='classic-zerg'?236:210]]:[[split,skin.id==='classic-zerg'?236:210],...(skin.id==='abathur'?[[540,210],[560,248]]:[]),...layout.right];
   const shape=`M${x} 64H${x+width}V${edge.at(-1)[1]}${[...edge].reverse().map(p=>'L'+p.join(' ')).join('')}Z`;
   const proxy=layout.solidTop?`<path fill="white" d="M0 316L${layout.solidTop.map(p=>p.join(' ')).join('L')}L992 316Z"/>`:'';
   // Continue the original outer legs to the body's rail. The inner-well
   // exclusion must not cut off the perimeter along with the baked controls.
   const wall=name==='left'?[0,layout.left[0][1],24,256-layout.left[0][1]]:[976,layout.right.at(-1)[1],16,256-layout.right.at(-1)[1]];
   const rim=`<defs><clipPath id="rim"><path d="${shape}"/></clipPath><clipPath id="wall"><rect x="${wall[0]}" y="${wall[1]}" width="${wall[2]}" height="${wall[3]}"/></clipPath>${proxy?`<mask id="solid">${proxy}</mask>`:''}</defs><use href="#native" clip-path="url(#rim)"${proxy?' mask="url(#solid)"':''}/><use href="#native" clip-path="url(#wall)"/>`;
   // Trace the actual rendered outer alpha. The backing continues beneath the
   // original metal/chitin to the panel, while air above its contour stays clear.
   const rendered=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="192" viewBox="${x} 64 ${width} 192"><defs>${defs}</defs>${rim}</svg>`)).ensureAlpha().raw().toBuffer();
   const backing=Buffer.alloc(width*192*4),rgb=[1,3,5].map(i=>parseInt(headerColour.slice(i,i+2),16));
   for(let column=0;column<width;column++){
    let top=0;while(top<192&&rendered[(top*width+column)*4+3]<128)top++;
    for(let y=top;y<192;y++){const i=(y*width+column)*4;backing[i]=rgb[0];backing[i+1]=rgb[1];backing[i+2]=rgb[2];backing[i+3]=255;}
   }
   const plate=await sharp(backing,{raw:{width,height:192,channels:4}}).png().toBuffer();
   save(name,`<image id="panel-backing" x="${x}" y="64" width="${width}" height="192" href="data:image/png;base64,${plate.toString('base64')}"/>${rim}`,`${x} 64 ${width} 192`);
  };
  // Split only on the quiet central rail. The old 340..600 omission cut
  // central crests and fangs in half and discarded entire native ornaments.
  await header('left',0,split);await header('right',split,992-split);
  // The centre has the same backing and lower join as the fixed shoulders.
  const rail=await sharp(path.join(out,skin.id+'-native-left.svg')).extract({left:split-2,top:0,width:2,height:192}).png().toBuffer();
  save('rail',`<image x="${split}" y="64" width="2" height="192" href="data:image/png;base64,${rail.toString('base64')}"/>`,`${split} 64 2 192`,'preserveAspectRatio="none"');
  // The repeating separator uses the same bottom lip, not a foreign faction.
  save('rule','<use href="#native"/>','430 304 2 12','preserveAspectRatio="none"');
  tokens.push(`:root[data-graphical-style=${p.id}]{--bg:#080b10;--surface:${p.surface};--raised:color-mix(in srgb,${p.surface} 75%,${p.accent});--line:${p.edge};--text:#f1f3f5;--muted:#bac4cf;--accent:${p.accent};--shell-title:${p.accent};--shell-edge:${p.edge};--shell-light:${p.accent};--shell-well:#090e14;--shell-panel:${p.surface};--shell-header:${blend(p.surface,"#000000",.18)};--console-shell:#0b1017;--control-neutral-surface:${p.surface};--control-neutral-edge:${p.edge};--row-hover:${blend(p.surface,p.accent,.1)};--native-info-frame:url('/themes/${p.id}-native-well.svg');--native-command-deck:var(--native-info-frame);--native-menu-bank:var(--native-info-frame);--native-panel-rail:url('/themes/${p.id}-native-rule.svg');--native-panel-tab:var(--hud-group-normal);--native-header-left:url('/themes/${p.id}-native-left.svg');--native-header-right:url('/themes/${p.id}-native-right.svg');--native-header-rail:url('/themes/${p.id}-native-rail.svg');--work-frame:url('/themes/${p.id}-native-shell.svg')}`);
  tokens.push(`.appearance-choice[data-style-preview=${p.id}] .appearance-thumbnail{background:${p.surface} url('/themes/${p.id}-native-left.svg') left top/auto 34px no-repeat;border-color:${p.edge}}`);
 }
 fs.writeFileSync(path.join(root,'wwwroot/native-console-tokens.css'),'/* Generated native console source assignments. */\n'+tokens.join('\n')+'\n');
 return {success:true,families:tokens.length/2,assets:tokens.length*3,previews:catalog.length};
}
module.exports={build};if(require.main===module){build().then(async result=>console.log(JSON.stringify({...result,raster:await require('./Rasterize-HudAssets.cjs').build()}))).catch(e=>{console.error(e);process.exitCode=1;});}
