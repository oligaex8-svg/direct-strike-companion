'use strict';
// Temporary UI review server: GETs mirror the running app, all writes stay here.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const upstream=process.argv[2],root=path.resolve(__dirname,'../wwwroot');
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(upstream))throw Error('Loopback app required');
let preferences=null;
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/__close'){res.end('Closed');server.close();return;}
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.method!=='GET'){
    if(req.url==='/api/lobby/preferences'){let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Body too large');}preferences=JSON.parse(body);res.end(JSON.stringify(preferences));return;}
    res.end('{}');return;
   }
   const response=await fetch(upstream+req.url,{headers:{'X-DS-Companion':'1'}}),json=await response.json();
   if(req.url==='/api/state'&&preferences){json.lobby.preferences=preferences;json.lobbyPreferences=preferences;Object.assign(json.library.settings,{notificationSoundPreset:preferences.preset,notificationSoundVolume:preferences.volume});}
   res.end(JSON.stringify(json));return;
  }
  const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');
  fs.createReadStream(target).on('error',()=>res.writeHead(404).end()).pipe(res);
 }catch(error){res.writeHead(500).end(JSON.stringify({error:error.message}));}
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
setTimeout(()=>server.close(),300000).unref();
