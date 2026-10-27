'use strict';
// Assemble actual browser captures; no mockups or private replay data.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const catalog=require('../wwwroot/native-console-catalog.json').filter(skin=>skin.id!=='fenix');
const reviewId=process.env.DSC_INTERIOR_REVIEW_ID||'local21';
if(!/^local\d+$/.test(reviewId))throw new Error('Expected a local review identifier');
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function build(){
 sharp.concurrency(1);sharp.cache(false);
 const pieces=[],items=[];
 for(const [i,skin] of catalog.entries()){
  const name=reviewId+'-'+skin.id+'-interior.png',file=path.join(__dirname,name);
  fs.copyFileSync(path.join(__dirname,'skin-'+skin.id+'-profile-1600.png'),file);
  const x=(i%3)*540,y=Math.floor(i/3)*364;
  pieces.push({input:await sharp(file).resize({width:540}).png().toBuffer(),left:x,top:y+26});
  const label=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="26"><text x="10" y="19" fill="#e4eaf0" font-family="sans-serif" font-size="15">'+escape(skin.label)+'</text></svg>');
  pieces.push({input:label,left:x,top:y});
  items.push('<a href="'+name+'"><figure><img loading="lazy" src="'+name+'" alt="'+escape(skin.label)+' profile screenshot"><figcaption>'+escape(skin.label)+'</figcaption></figure></a>');
 }
 await sharp({create:{width:1620,height:2184,channels:4,background:'#101820'}}).composite(pieces).png().toFile(path.join(__dirname,reviewId+'-theme-overview.png'));
 fs.writeFileSync(path.join(__dirname,reviewId+'-theme-gallery.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+reviewId+' theme interiors</title><style>body{margin:24px;background:#0a1016;color:#e4eaf0;font:16px system-ui}h1{font-size:24px}p{color:#adbdca}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:20px}a{color:inherit;text-decoration:none}figure{margin:0;border:1px solid #405264;border-radius:6px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:10px;background:#17232f}a:hover,a:focus-visible{outline:2px solid #87c6e6}</style><h1>'+reviewId+' · 18 theme interiors</h1><p>Actual local browser screenshots with synthetic data. Select a theme for the full-resolution capture. Default layout and approved Fenix styling are unchanged.</p><main>'+items.join('')+'</main></html>');
 console.log(JSON.stringify({success:true,themes:catalog.length,gallery:'verification/'+reviewId+'-theme-gallery.html',overview:'verification/'+reviewId+'-theme-overview.png'}));
}
build().catch(error=>{console.error(error);process.exitCode=1;});
