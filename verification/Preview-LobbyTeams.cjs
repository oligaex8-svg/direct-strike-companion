'use strict';
// Read-only layout fixture using the production roster renderer and styles.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
const context=vm.createContext({document:{addEventListener(){}},state:{library:{settings:{selfIds:[]}},lobby:{}},esc:s=>String(s??'')});
vm.runInContext(fs.readFileSync(path.join(web,'lobby.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(web,'ru-ui.js'),'utf8'),context);
const roster=vm.runInContext('renderLiveLobbyRoster([])',context);
const translate=html=>vm.runInContext('RU_UI_TEXT',context)?html.replace(/Team [12]|No name detected|Waiting for an observation/g,label=>vm.runInContext('RU_UI_TEXT',context)[label]||label):html;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){
  const ru=url.searchParams.get('language')==='ru';
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="${ru?'ru':'en'}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui.css"><link rel="stylesheet" href="/lobby.css"><style>body{display:block}main{margin:0 auto;max-width:1100px;padding:28px}p{color:var(--muted);font-size:.8rem}</style><main><h1>${ru?'Текущее лобби':'Live lobby'}</h1><p>${ru?'Проверка макета · ожидание обнаружения игроков':'Layout check · waiting for player detection'}</p><div class="live-lobby"><div class="live-roster-grid">${ru?translate(roster):roster}</div></div></main></html>`);
 }else if(['/style.css','/ui.css','/lobby.css'].includes(url.pathname)){
  res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(web,url.pathname.slice(1))));
 }else{res.statusCode=404;res.end();}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,pid:process.pid,fixture:'production empty-roster renderer; no live player data'})));
