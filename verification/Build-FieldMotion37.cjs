'use strict';
// Source-preserving field decomposition. No source art is rewritten.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes/motion37');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
function parse(s){const top={children:[]},stack=[top];for(const t of s.match(/<[^>]+>|[^<]+/g)){if(t.startsWith('</')){stack.pop();continue;}const n={raw:t,children:[]};stack.at(-1).children.push(n);if(t.startsWith('<')&&!t.endsWith('/>')&&!t.startsWith('<?'))stack.push(n);}return top.children.find(n=>n.raw.startsWith('<svg'));}
function render(n,mode,selected){if(n.raw.startsWith('<defs'))return full(n);if(!n.raw.startsWith('<'))return mode==='base'?n.raw:'';if(!n.children.length)return selected.has(n)?(mode==='base'?'':n.raw):(mode==='base'?n.raw:'');const body=n.children.map(c=>render(c,mode,selected)).join('');return n.raw+body+'</'+n.raw.match(/^<(\w+)/)[1]+'>';}
function full(n){return n.raw+(n.children.length?n.children.map(full).join('')+'</'+n.raw.match(/^<(\w+)/)[1]+'>':'');}
const pulse=[{opacity:.34},{opacity:.95,offset:.42},{opacity:.56,offset:.7},{opacity:.34}];
function group(name,body,x,y,duration,phase=0,frames=pulse){return `<g data-motion-name="${name}" data-keyframes="${esc(JSON.stringify(frames))}" data-duration="${duration}" data-phase="${phase}" style="transform-origin:${x}px ${y}px;transform-box:view-box">${body}</g>`;}
const fill=(d,c,opacity=.75)=>`<path d="${d}" fill="${c}" opacity="${opacity}"/>`;
const ellipse=(x,y,rx,ry,c)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
// Depth belongs to the new interior fill only; source material and fixed contours stay exact.
function depthFill(body,name){
 const match=body.match(/fill="(#[0-9a-f]{6})"/i);if(!match)return body;
 const c=match[1],rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 const mix=(target,t)=>'#'+rgb.map(v=>Math.round(v+(target-v)*t).toString(16).padStart(2,'0')).join('');
 const gid='field-depth-'+name,organic=/sac-fluid|living-junction/.test(name),soft=organic||/optical|heated-joint|amber-joint|void/.test(name);
 const gradient=soft
  ?`<radialGradient id="${gid}" cx=".42" cy=".35" r=".68"><stop stop-color="${mix(255,.6)}" stop-opacity=".9"/><stop offset=".23" stop-color="${c}" stop-opacity=".82"/><stop offset=".67" stop-color="${mix(0,.4)}" stop-opacity=".42"/><stop offset="1" stop-color="${mix(0,.78)}" stop-opacity="${organic?0:.08}"/></radialGradient>`
  :`<linearGradient id="${gid}" x1="0" y1=".15" x2="1" y2=".85"><stop stop-color="${mix(0,.66)}" stop-opacity=".38"/><stop offset=".38" stop-color="${c}" stop-opacity=".82"/><stop offset=".55" stop-color="${mix(255,.42)}"/><stop offset="1" stop-color="${mix(0,.65)}" stop-opacity=".35"/></linearGradient>`;
 return `<defs>${gradient}</defs>`+body.replace(match[0],`fill="url(#${gid})"`);
}
const contract=(sx,sy)=>[{transform:'scale(1,1)'},{transform:`scale(${sx},${sy})`,offset:.42},{transform:'scale(1,1)'}];
const ids=['protoss','nerazim','alarak','ihanrii','terran','nova','mira','machined','tyrador','zerg','abathur','dehaka','cerberus','mecha','arcade','classic-terran','classic-protoss','classic-zerg'];
fs.mkdirSync(out,{recursive:true});const catalog=[];
for(const id of ids){const sourceUrl=`/themes/${id}-identity-field.svg`,source=fs.readFileSync(path.join(root,'wwwroot',sourceUrl),'utf8'),tree=parse(source);let leaves=[];function walk(n){if(/^<(path|ellipse|rect)\b/.test(n.raw))leaves.push(n);if(!n.raw.startsWith('<defs'))n.children.forEach(walk);}walk(tree);const selected=new Set(),motions=[];let additions='';const dynamicOriginals=[];
 const add=(name,body,x,y,d,p=0,f=pulse)=>{if(leaves.some(n=>n.raw===body)){dynamicOriginals.push(body);const inherited=source.match(/mask="url\(#v\)" opacity="([^"]+)"/);body=`<g opacity="${Number(inherited[1])/.55}">${body}</g>`;}else body=depthFill(body,name);motions.push({name,feature: name.replaceAll('-',' '),duration:d,phase:p,origin:[x,y]});additions+=group(name,body,x,y,d,p,f);};
 const choose=re=>{const a=leaves.filter(n=>re.test(n.raw));a.forEach(n=>selected.add(n));return a;};
 if(id==='protoss'||id==='classic-protoss'){choose(/M307 155/);const c=id==='protoss'?'#62bfe7':'#62c9ed';add('crystal-left-refraction',fill('M309 155L352 112V198Z',c),352,155,id==='protoss'?6700:8100);add('crystal-right-refraction',fill('M352 112L395 155L352 198Z',c,.55),352,155,5300,1900);}
 else if(id==='nerazim'){choose(/M382 105/);add('void-glaive-resonance',fill('M382 107L402 126L382 145L362 126Z','#65d5bd'),382,126,7800);add('crescent-inner-void',fill('M480 20Q345 31 282 159Q354 89 480 85Z','#65d5bd',.32),420,88,9700,2300);}
 else if(id==='alarak'){choose(/M334 179/);add('blade-hot-facet',fill('M334 179L346 46L367 179Z','#ed4d33'),346,179,4700);add('secondary-blade-facet',fill('M436 147L441 126L450 177Z','#ff9b52'),441,177,6300,2400);}
 else if(id==='ihanrii'){choose(/M357 146/);for(const [i,x,y]of [[0,357,146],[1,420,59]])add('square-inlay-'+i,`<rect x="${x+1}" y="${y+1}" width="15" height="15" fill="#63c7b0"/>`,x+8.5,y+8.5,5400+i*1700,i*1700);}
 else if(id==='terran'||id==='classic-terran'){const tracks=choose(/^<path/);tracks.forEach((n,i)=>{const d=n.raw.match(/d="([^"]+)"/)[1],c=n.raw.match(/stroke="([^"]+)"/)[1],m=d.match(/M([\d.]+) 240V([\d.]+)L([\d.]+) ([\d.]+)/);if(!m)throw Error('Track shape changed '+id);const [x,y,xx,yy]=m.slice(1).map(Number);add('embedded-bend-'+i,fill(`M${x-.45} ${y+9}V${y}L${xx} ${yy}V${yy-13}H${xx+.45}V${yy+.2}L${x+.45} ${y+.2}V${y+9}Z`,c),xx,yy,3900+i*610,i*670);});}
 else if(id==='nova'){choose(/M397 47/);add('optical-lens-focus',ellipse(397,94,44,44,'#54cdf1'),397,94,8900,0,[{opacity:.18},{opacity:.5},{opacity:.18}]);add('optical-pupil-track',ellipse(397,94,13,20,'#b4f2ff'),397,94,6100,0,[{transform:'translate(-9px, 0px)',opacity:.6},{transform:'translate(7px, 3px)',opacity:.85},{transform:'translate(-9px, 0px)',opacity:.6}]);}
 else if(id==='mira'){choose(/M422 109/);add('patched-slot-ember',fill('M422 109Q446 128 436 154L430 167L433 145Q436 129 415 118Z','#f27ba7'),430,145,6500,0,[{opacity:.25},{opacity:.9,offset:.27},{opacity:.5,offset:.42},{opacity:.74,offset:.61},{opacity:.25}]);}
 else if(id==='machined'){choose(/<ellipse cx="434"/);add('heated-joint-convection',ellipse(434,133,16,29,'#d9a652'),434,133,7200,0,[{opacity:.32,transform:'scale(1, .92)'},{opacity:.9,transform:'scale(.94, 1)'},{opacity:.32,transform:'scale(1, .92)'}]);}
 else if(id==='tyrador'){choose(/M310 0/);add('upper-conduit-refraction',fill('M310 0Q250 100 350 160L380 160Q280 100 340 0Z','#c082e3',.35),340,80,9100);add('lower-conduit-refraction',fill('M350 160Q400 190 440 240H470Q430 190 380 160Z','#c082e3',.35),410,200,7100,2600);}
 else if(id==='abathur'){const sacs=choose(/^<ellipse/);sacs.forEach((n,i)=>{const x=+n.raw.match(/cx="([^"]+)"/)[1],y=+n.raw.match(/cy="([^"]+)"/)[1];add('sac-compression-'+i,n.raw,x,y,7200+i*370,i*950,contract(.975,1));add('sac-fluid-'+i,ellipse(x,y+5,13,18,'#a4dc4e'),x,y,6100+i*410,i*1100,[{opacity:.22,transform:'scale(1,.97)'},{opacity:.65,transform:'scale(.98,1)'},{opacity:.22,transform:'scale(1,.97)'}]);});}
 else if(id==='zerg'||id==='classic-zerg'||id==='cerberus'){const centers=id==='zerg'?[[415,119,27,15,'#b36aca']]:id==='cerberus'?[[438,123,17,28,'#64b7ab']]:[[346,109,18,9,'#b36aca'],[450,132,10,20,'#b36aca']];choose(/<ellipse[^>]*fill="url\(#local-energy\)"/);centers.forEach(([x,y,rx,ry,c],i)=>add('living-junction-'+i,ellipse(x,y,rx,ry,c),x,y,8300+i*1400,i*1700,[{opacity:.4,transform:'scale(1,1)'},{opacity:.85,transform:'scale(.97,.98)'},{opacity:.4,transform:'scale(1,1)'}]));}
 else if(id==='dehaka'){choose(/M325 112/);add('root-flexure',fill('M325 112C367 134 405 126 431 96L439 109C410 142 365 145 329 126Z','#65af8d',.5),325,112,11300,0,[{transform:'skewY(0deg)',opacity:.4},{transform:'skewY(.8deg)',opacity:.8},{transform:'skewY(0deg)',opacity:.4}]);}
 else if(id==='mecha'){const inserts=choose(/M320 55|M339 168|<ellipse cx="409"/);inserts.filter(n=>n.raw.startsWith('<path')).forEach((n,i)=>add('recessed-insert-'+i,n.raw,i?360:341,i?178:62,4300+i*1300,i*1300,[{transform:'translate(0px,0px)'},{transform:`translate(${i?'-1':'1'}px,1px)`,offset:.25},{transform:'translate(0px,0px)',offset:.6},{transform:'translate(0px,0px)'}]));add('amber-joint-pressure',ellipse(409,132,11,22,'#ed9b39'),409,132,7600,2100);}
 else if(id==='arcade'){choose(/<rect x="315"/);for(const [i,x,y]of [[0,339,67],[1,390,91],[2,390,139],[3,339,163]])add('matrix-cell-charge-'+i,`<rect x="${x}" y="${y}" width="49" height="22" fill="#cf5cf4"/>`,x+24,y+11,3400+i*430,i*870,[{opacity:.12},{opacity:.72,offset:.3},{opacity:.3,offset:.55},{opacity:.12}]);}
 if(!motions.length||!selected.size)throw Error('Missing decomposition '+id);
 // Fixed extracted outlines are drawn before the interior animation, retaining all original ancestors.
 let base=render(tree,'base',selected),foreground=render(tree,'foreground',selected);for(const raw of dynamicOriginals)foreground=foreground.replace(raw,'');foreground=foreground.replace('</g></g></svg>','</g><g mask="url(#v)" opacity=".55">'+additions+'</g></g></svg>');
 const baseUrl=`/themes/motion37/field-${id}-base.svg`,foregroundUrl=`/themes/motion37/field-${id}-foreground.svg`;fs.writeFileSync(path.join(root,'wwwroot',baseUrl),base);fs.writeFileSync(path.join(root,'wwwroot',foregroundUrl),foreground);
 const focus=id==='mecha'?motions.at(-1).origin:motions[0].origin;catalog.push({id,focusX:Math.min(420,Math.max(300,focus[0])),focusY:focus[1],sourceUrl,sourceHash:hash(source),baseUrl,baseHash:hash(base),foregroundUrl,foregroundHash:hash(foreground),names:motions.map(m=>m.name),features:motions,extractedShapes:selected.size});
}
fs.writeFileSync(path.join(out,'field-catalog.json'),JSON.stringify(catalog,null,2)+'\n');console.log(JSON.stringify({themes:catalog.length,groups:catalog.reduce((s,c)=>s+c.names.length,0),extracted:catalog.reduce((s,c)=>s+c.extractedShapes,0)}));
