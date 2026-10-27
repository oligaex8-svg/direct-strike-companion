'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'assets/themes');
const read=async(name,list)=>{const file=path.join(__dirname,name+'.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));const response=await fetch('https://asset-explorer.sc2arcade.com/list/'+list+'.json');if(!response.ok)throw Error('Catalog unavailable: '+list);const data=await response.json();if(!Array.isArray(data.items))throw Error('Invalid catalog');fs.writeFileSync(file,JSON.stringify(data));return data;};
(async()=>{
const ui=(await read('ui-asset-catalog','ui')).items,consoles=(await read('console-asset-catalog','consoles')).items;
const roles=['menubar_background','menubutton_normal','menubutton_hover','menubutton_pressed','menubutton_selected','chatbar_background','commandbutton_normal','commandbutton_highlighted','commandbutton_superhighlighted','controlgroupbutton_normal','controlgroupbutton_hover','controlgroupbutton_pressed','timer_background','helperbutton_background','tooltip_background','minimapbutton_normal','minimapbutton_hover','minimapbutton_selected'];
const jobs=[];
for(const family of new Set(require('../wwwroot/native-console-catalog.json').map(x=>x.family)))for(const role of roles){
 const name='ui_console_'+role+'_'+family,item=ui.find(x=>x.name.toLowerCase()===name);
 if(!item)throw Error('Archive lacks '+name);
 jobs.push({file:item.name+'.png',image:item.image,role,family});
}
const unitInfo=ui.find(x=>x.name==='ui_console_panel_unitinfo_nerazim');if(!unitInfo)throw Error('Archive lacks Nerazim unit-info rail');jobs.push({file:unitInfo.name+'.png',image:unitInfo.image,role:'unit-info panel rails',family:'nerazim'});
for(const {id:style,preview} of require('../wwwroot/native-console-catalog.json')){
 const name='sc2_ui_collection_huds_large_'+preview;
 const item=consoles.find(x=>x.name===name);
 jobs.push({file:'console-'+style+'.png',image:item.image,role:'original HUD console render',family:style});
}
 const sources=[];let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<jobs.length){
  const job=jobs[next++];
  if(!/^[a-z0-9_-]+\.png$/i.test(job.file)||!/^[-a-z0-9_/]+\.png$/i.test(job.image))throw Error('Unsafe archive name');
  const url='https://dist.sc2arcade.com/star-assets/'+job.image;
  let bytes;
  if(fs.existsSync(path.join(folder,job.file)))bytes=fs.readFileSync(path.join(folder,job.file));
  else{
   const response=await fetch(url);if(!response.ok)throw Error('Asset download '+response.status+' '+job.file);
   bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>8*1024*1024||bytes.subarray(1,4).toString()!=='PNG')throw Error('Invalid PNG '+job.file);
   fs.writeFileSync(path.join(folder,job.file),bytes);
  }
  sources.push({...job,url,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
 }}));
 sources.sort((a,b)=>a.file.localeCompare(b.file));
 fs.writeFileSync(path.join(folder,'hud-sources.json'),JSON.stringify({source:'Blizzard Entertainment / StarCraft II in-game console textures and console render previews',archive:'https://asset-explorer.sc2arcade.com/',sources},null,2)+'\n');
 console.log(JSON.stringify({success:true,assets:sources.length,sample:sources.filter(x=>x.family==='purifier').map(x=>({role:x.role,width:x.width,height:x.height}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
