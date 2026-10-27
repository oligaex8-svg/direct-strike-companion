'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const value=name=>process.argv.slice(2).find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3),id=value('id'),source=value('source'),motion=value('motion'),reference=value('reference');
if(!/^[a-z][a-z-]*$/.test(id)||!source||!['fan','optic','hologram','plasma','crystal','membrane','servo','pixel'].includes(motion))throw Error('Invalid raster registration');
const root=path.resolve(__dirname,'..'),target='assets/themes/equipment35/'+id+'-kit-v1.png',file=path.join(root,'assets/themes/equipment35/sources.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));fs.copyFileSync(source,path.join(root,target));
const record={id,source:target,reference:'assets/themes/'+reference,motion,sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),generatedSource:source};
data.profiles=data.profiles.filter(p=>p.id!==id);data.profiles.push(record);fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({id,registered:true,themes:data.profiles.length}));
