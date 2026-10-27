'use strict';
// Loopback-only UI preview. Settings are in-memory synthetic data; no updater,
// game integration, private library, credentials or file mutations are exposed.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../wwwroot'),sample=require('./LocalPreviewFixture.cjs')('terran');
const catalog=require('../wwwroot/native-console-catalog.json'),ids=new Set(['default',...catalog.map(x=>x.id)]);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(url.pathname==='/api/state')return json({...sample,libraryVersion:'local-ui-preview',busy:false,replayStatus:'Local preview · sample data'});
 if(url.pathname==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
 if(url.pathname==='/api/updates')return json({error:'Updates disabled in local preview'},503);
 if(url.pathname==='/api/appearance'&&req.method==='POST'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return json({error:'Too large'},413);}
  try{const {style}=JSON.parse(body);if(!ids.has(style))return json({error:'Unknown style'},400);sample.library.settings.graphicalStyle=style;return json({style});}catch{return json({error:'Invalid request'},400);}
 }
 if(url.pathname.startsWith('/api/'))return json({});
 const file=path.resolve(web,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
server.listen(58081,'127.0.0.1',()=>console.log('Local UI preview: http://127.0.0.1:58081 (synthetic data, no production changes)'));
