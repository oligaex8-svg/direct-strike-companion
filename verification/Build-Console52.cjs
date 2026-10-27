'use strict';
throw new Error('Console52 artwork was owner-rejected; this historical script is disabled. Preserve the restored native SC2 interface.');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
sharp.concurrency(1);sharp.cache({memory:24,files:0});
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes/console52'),out=path.join(root,'wwwroot/themes/console52');
const inputs={terran:'exec-7172ffdf-8de4-4d6f-9731-a3a768805081.png',protoss:'exec-7416f807-0497-41bc-bb08-d09de7698520.png',zerg:'exec-3eec4cb0-745d-485d-b894-7053f20f91bd.png'};
const generated='C:/Users/Admin/.codex/generated_images/01a11248-d9fc-79e1-a16a-73b9633f8190';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{fs.mkdirSync(source,{recursive:true});fs.mkdirSync(out,{recursive:true});const catalog={version:52,provenance:'New image-generated architectural support artwork in SC2 campaign style; not extracted game assets. Native animated equipment and control/frame art are unchanged.',layout:'Single nine-slice bay and exterior surround per base race; fixed corner proportions, straight center spans extend. Never used behind information.',themes:{}};for(const[id,file]of Object.entries(inputs)){const bytes=fs.readFileSync(fs.existsSync(path.join(source,id+'.png'))?path.join(source,id+'.png'):path.join(generated,file));fs.writeFileSync(path.join(source,id+'.png'),bytes);const result=await sharp(bytes).resize(512,768,{fit:'inside'}).webp({quality:91}).toBuffer();fs.writeFileSync(path.join(out,id+'.webp'),result);catalog.themes[id]={source:'assets/themes/console52/'+id+'.png',sourceHash:hash(bytes),url:'/themes/console52/'+id+'.webp',hash:hash(result),size:[512,768],slice:[100,110,100,110]};}fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2));console.log(JSON.stringify({success:true,themes:Object.keys(catalog.themes)}));})();

