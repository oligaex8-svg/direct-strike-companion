'use strict';
// Original Fenix console armour plus co-op top-bar filigree. Keep ornaments
// fixed in the corners; only plain rail samples stretch. No live text is baked.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/themes'),out=path.join(root,'wwwroot/themes');
const names=['sc2_ui_coop_fenix_topbar_filigree_bottom','sc2_ui_coop_fenix_topbar_filigree_bottomcorner','sc2_ui_coop_fenix_topbar_filigree_top','sc2_ui_coop_fenix_topbar_filigree_topcorner','sc2_ui_coop_fenix_topbar_bar_full_underlay','sc2_ui_ingame_storymode_panel_faction_purifier_underline'];
const matte='<filter id="matte" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 100 100 100 0 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
function image(name){const b=fs.readFileSync(path.join(source,name+'.png'));return {name,width:b.readUInt32BE(16),height:b.readUInt32BE(20),href:'data:image/png;base64,'+b.toString('base64'),sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function build(){
 const console=image('console-fenix'),pictures=names.map(image),ids=new Map(pictures.map((p,i)=>[p.name,'native'+i]));
 const native=(p,id,filter='')=>`<image id="${id}" width="${p.width}" height="${p.height}" href="${p.href}" ${filter}/>`;
 const slice=(id,[sx,sy,sw,sh],[x,y,w,h],mirror=false)=>`<g${mirror?` transform="translate(${2*x+w} 0) scale(-1 1)"`:''}><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none" overflow="hidden"><use href="#${id}"/></svg></g>`;
 const save=(name,defs,body,width=128,height=128)=>fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>\n`);
 const def=matte+native(console,'console','filter="url(#matte)"');
 // Matching native bounds keep all eight rail joins continuous. Wide source
 // insets retain the dark recess beside the ivory rim instead of stretching
 // a solid strip of armour across the whole painted edge.
 const armour=(rack=false)=>[
  slice('console',[164,184,62,28],[0,0,32,32]),slice('console',[608,184,62,28],[96,0,32,32]),
  slice('console',[164,258,62,58],[0,96,32,32]),slice('console',[608,258,62,58],[96,96,32,32]),
  slice('console',[340,184,4,28],[32,0,64,32]),slice('console',[340,258,4,58],[32,96,64,32]),
  slice('console',[164,rack?202:224,62,4],[0,32,32,64]),slice('console',[608,224,62,4],[96,32,32,64])
 ].join('');
 save('fenix',def,armour());save('fenix-rack',def,armour(true));
 save('fenix-iris',def,slice('console',[898,105,94,44],[0,0,94,44]),94,44);
 const allDefs=pictures.map(p=>native(p,ids.get(p.name))).join(''),id=suffix=>ids.get('sc2_ui_coop_fenix_topbar_'+suffix);
 save('fenix-filigree',allDefs,[
  slice(id('filigree_topcorner'),[0,0,35,32],[0,0,32,32],true),slice(id('filigree_topcorner'),[0,0,35,32],[96,0,32,32]),
  slice(id('filigree_bottomcorner'),[53,16,32,32],[0,96,32,32],true),slice(id('filigree_bottomcorner'),[53,16,32,32],[96,96,32,32]),
  slice(id('filigree_top'),[40,0,8,4],[32,0,64,4]),slice(id('filigree_bottom'),[40,0,8,5],[32,123,64,5]),
  slice(id('filigree_topcorner'),[33,26,2,6],[0,32,2,64]),slice(id('filigree_topcorner'),[33,26,2,6],[126,32,2,64])
 ].join(''));
 // A single central nexus and the game's paired thin lines, never a stretched icon.
 const underline=ids.get('sc2_ui_ingame_storymode_panel_faction_purifier_underline');
 save('fenix-divider',allDefs,[slice(id('filigree_topcorner'),[0,0,35,32],[0,0,18,16],true),slice(id('filigree_topcorner'),[0,0,35,32],[494,0,18,16]),slice(id('filigree_top'),[40,0,8,4],[18,0,476,2]),slice(underline,[132,7,94,20],[209,0,94,16])].join(''),512,16);
 save('fenix-rule',allDefs,[slice(id('filigree_bottom'),[0,0,128,5],[0,0,128,5]),slice(id('bar_full_underlay'),[0,0,72,5],[128,0,256,5]),slice(id('filigree_bottom'),[0,0,128,5],[384,0,128,5],true)].join(''),512,5);
 fs.writeFileSync(path.join(source,'purifier-detail-sources.json'),JSON.stringify({scope:'Fenix/Purifier SC2 console and co-op top-bar decorative regions; original images preserved',sources:[console,...pictures].map(({name,width,height,sha256})=>({name,width,height,sha256,url:name==='console-fenix'?'https://dist.sc2arcade.com/star-assets/consoles-png/sc2_ui_collection_huds_large_fenix_consoleprotoss.png':'https://dist.sc2arcade.com/star-assets/ui-png/'+name+'.png'}))},null,2)+'\n');
 return {success:true,assets:6,originalTextures:pictures.length+1};
}
module.exports={build};
if(require.main===module)(async()=>{
 if(process.argv.includes('--fetch'))for(const name of names){const file=path.join(source,name+'.png');if(fs.existsSync(file))continue;const r=await fetch('https://dist.sc2arcade.com/star-assets/ui-png/'+name+'.png');if(!r.ok)throw Error('Asset download '+r.status+' '+name);const b=Buffer.from(await r.arrayBuffer());if(b.length>1024*1024||b.subarray(1,4).toString()!=='PNG')throw Error('Invalid asset '+name);fs.writeFileSync(file,b);}
 console.log(JSON.stringify(build()));
})().catch(e=>{console.error(e);process.exitCode=1;});
