'use strict';
// Production controls and styles with simulated alerts; never touches private data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const web=path.resolve(__dirname,'../wwwroot');
let clips={accept:{name:'SC2 alert (example).wav',seconds:1.2}};
const assets=new Set(['style.css','ui.css','i18n.css','commanders.js','sc2-automation.js','sound-library.js','lobby.js','ru-ui.js','i18n.js']);
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1');
 if(url.pathname==='/'){
  const language=url.searchParams.get('language')==='ru'?'ru':'en';
  response.setHeader('Content-Type','text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui.css"><link rel="stylesheet" href="/i18n.css"><style>body{display:block}main{max-width:1260px;margin:auto;padding:24px}.fixture-note{color:var(--muted);font-size:.85rem}#settings-custom-sounds{max-width:620px}#fixture-controls{border:1px solid var(--line);padding:20px;background:var(--panel)}</style><main><h1>Live lobby</h1><p class="fixture-note">Layout preview · simulated alerts and example clips · no game input or sound playback</p><select id="ui-language" hidden><option value="en">English</option><option value="ru">Русский</option></select><div id="fixture-controls"></div><section><h2>Settings</h2><label for="sound-preset">Sound style</label><select id="sound-preset"></select><label for="sound-volume">Notification volume</label><input id="sound-volume" type="range" min="0" max="100" value="55"><div id="settings-custom-sounds"></div></section><p role="status" id="fixture-toast"></p></main><script>
 let state={library:{settings:{sound:true,notificationSoundPreset:'soft',notificationSoundVolume:55,language:'${language}'}},lobby:{}};
 const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 async function api(route,data){const response=await fetch('/api/'+route,{method:data===undefined?'GET':'POST',headers:{'X-DS-Companion':'1','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
 async function refresh(){}function toast(message){document.getElementById('fixture-toast').textContent=message;}
 function renderLibrary(){const host=document.getElementById('fixture-controls'),open=host.querySelector('.custom-sound-details')?.open,focus=notificationSoundFocus(host);host.innerHTML=renderLiveGameSounds();if(open)host.querySelector('.custom-sound-details').open=true;restoreNotificationSoundFocus(host,focus);}
 </script><script src="/commanders.js"></script><script src="/sc2-automation.js"></script><script src="/sound-library.js"></script><script src="/lobby.js"></script><script src="/ru-ui.js"></script><script src="/i18n.js"></script><script>
 renderLibrary();document.getElementById('sound-preset').innerHTML=notificationSoundStyleOptions('soft');updateCustomSoundControls();setInterfaceLanguage('${language}');void requestCustomNotificationSounds(true);setInterval(()=>{void requestCustomNotificationSounds(true);},5000);
 </script></html>`);
 }else if(assets.has(url.pathname.slice(1))){
  response.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');response.end(fs.readFileSync(path.join(web,url.pathname.slice(1))));
 }else if(url.pathname==='/api/sounds/custom'){
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify(clips));
 }else if(url.pathname.startsWith('/api/sounds/custom/')&&request.method==='DELETE'){
  delete clips[url.pathname.split('/').at(-1)];response.setHeader('Content-Type','application/json');response.end(JSON.stringify(clips));
 }else if(url.pathname==='/api/lobby/preferences'){
  let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{response.setHeader('Content-Type','application/json');response.end(body);});
 }else if(url.pathname==='/api/sounds/preview'){
  response.setHeader('Content-Type','application/json');response.end('{}');
 }else{response.statusCode=404;response.end('{}');}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,pid:process.pid,fixture:'Production notification UI with simulated cues; no private data or audio playback'})));
