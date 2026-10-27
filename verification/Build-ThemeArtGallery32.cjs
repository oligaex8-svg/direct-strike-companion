'use strict';
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const skins=require('../assets/themes/art32/sources.json').profiles,labels=Object.fromEntries(require('../wwwroot/native-console-catalog.json').map(s=>[s.id,s.label]));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const heading=(text,width)=>Buffer.from('<svg width="'+width+'" height="30"><rect width="100%" height="100%" fill="#0b1118"/><text x="12" y="21" fill="#e1e8ed" font-family="Arial" font-size="16">'+esc(text)+'</text></svg>');
async function build(){
 sharp.concurrency(1);sharp.cache({memory:32});const comparisons=[];let rowHeight;
 for(const id of ['mecha','mira','classic-zerg'])for(const [column,version] of ['local31','local32'].entries()){
  const raw=await sharp(path.join(__dirname,version+'-theme-'+id+'.png')).extract({left:240,top:148,width:1310,height:498}).resize({width:900}).extend({top:30,bottom:0,left:0,right:0,background:'#0b1118'}).composite([{input:heading(labels[id]+' · '+(column?'After local.32':'Before local.31'),900),top:0,left:0}]).png().toBuffer({resolveWithObject:true});
  rowHeight=raw.info.height;comparisons.push({input:raw.data,left:column*900,top:Math.floor(comparisons.length/2)*rowHeight});
 }
 await sharp({create:{width:1800,height:rowHeight*3,channels:4,background:'#0b1118'}}).composite(comparisons).webp({quality:92}).toFile(path.join(__dirname,'local32-art-comparison.webp'));
 const tiles=[];let tileHeight;
 for(const [i,p] of skins.entries()){
  const image=await sharp(path.join(__dirname,'local32-theme-'+p.id+'.png')).resize({width:760}).extend({top:30,bottom:0,left:0,right:0,background:'#0b1118'}).composite([{input:heading(labels[p.id],760),top:0,left:0}]).png().toBuffer({resolveWithObject:true});
  tileHeight=image.info.height;tiles.push({input:image.data,left:i%2*760,top:Math.floor(i/2)*tileHeight});
 }
 await sharp({create:{width:1520,height:tileHeight*4,channels:4,background:'#0b1118'}}).composite(tiles).webp({quality:90}).toFile(path.join(__dirname,'local32-art-gallery.webp'));
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local.32 · theme artwork</title><style>body{background:#080e15;color:#dbe5ed;font:16px/1.55 system-ui;max-width:1500px;margin:32px auto;padding:0 20px}a{color:#82cfee}img{max-width:100%;height:auto}section{margin:32px 0 50px}h1,h2{font-weight:600}summary{cursor:pointer}</style><h1>Local.32 · seven theme art reworks</h1><p>Actual interface captures with synthetic data. Default layout and native outer shells remain intact.</p><a href="local32-art-comparison.webp"><img src="local32-art-comparison.webp" alt="Before and after: Mecha, Mira and classic Zerg"></a>'+skins.map(p=>'<section><h2>'+esc(labels[p.id])+'</h2><a href="local32-theme-'+p.id+'.png"><img src="local32-theme-'+p.id+'.png" alt="'+esc(labels[p.id])+' interface"></a><details><summary>Authored inset artwork</summary><img src="../assets/themes/art32/'+p.id+'-inset-source-v1.png" alt="Complete source frame"></details></section>').join('');
 fs.writeFileSync(path.join(__dirname,'local32-art-gallery.html'),html);console.log(JSON.stringify({success:true,themes:skins.length,comparisons:3}));
}
build().catch(e=>{console.error(e);process.exitCode=1;});
