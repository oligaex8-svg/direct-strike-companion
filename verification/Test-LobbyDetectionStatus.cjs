'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const context=vm.createContext({document:{addEventListener(){}},state:{lobby:{}},automaticDataError:'',
 num:value=>String(value),date:value=>value,time:()=>''});
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('const esc=')),context);
for(const file of ['sound-library.js','ru-ui.js','lobby.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
vm.runInContext(`requestCustomNotificationSounds=()=>{};syncLiveTeammates=()=>{};lobbyTeammateCount=()=>0;
 renderLiveGameSounds=()=>'<details class="live-control-details"><summary>Game controls &amp; sounds</summary></details>';
 liveLobbyCard=entry=>'<article>'+esc(entry.name)+'</article>';`,context);
const run=source=>vm.runInContext(source,context),check=(name,fn)=>{fn();checks.push(name);};
function render(ocrStatus,entries=[],extra={}){
 context.state.lobby={source:entries.length?'screen':'none',phase:'pregame',ocrStatus,rosterEntries:entries,...extra};
 return run('renderLiveLobby()');
}
function visibleStatus(html){return html.match(/<p class="live-detection-status[^\"]*">([\s\S]*?)<\/p>/)?.[1]||'';}

check('Empty roster exposes Checking before the closed Detection details and controls',()=>{
 const html=render('Checking visible SC2 window…');
 assert.equal(visibleStatus(html),'Checking visible SC2 window…');
 assert.ok(html.indexOf('live-detection-status')<html.indexOf('live-control-details'));
 assert.ok(html.indexOf('live-detection-status')<html.indexOf('live-monitor-details'));
 assert.match(html,/<details class="live-monitor-details"><summary>Detection details<\/summary>/);
});
check('An empty roster exposes and escapes an arbitrary capture error',()=>{
 const html=render('SC2 background capture unavailable - <img src=x onerror="bad()">');
 assert.match(visibleStatus(html),/capture unavailable - &lt;img/);
 assert.doesNotMatch(html,/<img src=x/);
});
check('An empty roster exposes non-capture reading failures and startup fallback',()=>{
 assert.equal(visibleStatus(render('Screen reader unavailable · check Windows OCR support')),'Screen reader unavailable · check Windows OCR support');
 assert.equal(visibleStatus(render('')),'Starting SC2 screen reader…');
});
check('A populated roster keeps ordinary or paused OCR status inside Details',()=>{
 for(const status of ['Screen reader paused during match / replay','SC2 screen reader active - player rows detected; verify names and identity']){
  const html=render(status,[{name:'DetectedPlayer'}],{phase:'match'});
  assert.equal(visibleStatus(html),'');assert.match(html,/DetectedPlayer/);
  assert.ok(html.indexOf(status)>html.indexOf('live-monitor-details'));
 }
});
check('A retained roster still exposes capture failure while keeping its names',()=>{
 const html=render('SC2 window capture unavailable - restore the game to read the lobby',[{name:'LastPlayer'}],{held:true});
 assert.match(visibleStatus(html),/capture unavailable/);assert.match(html,/Last detected lobby/);assert.match(html,/LastPlayer/);
});
check('A retained roster exposes escaped worker startup and frame diagnostics',()=>{
 for(const status of ['Screen reader startup: exited. Stderr: <failure>','Screen reader frame: invalid response.']){
  const html=render(status,[{name:'LastPlayer'}],{held:true});
  assert.ok(visibleStatus(html));assert.match(html,/LastPlayer/);assert.doesNotMatch(html,/<failure>/);
 }
});
check('Repeated renders expose readable status without recreating a live announcement',()=>{
 const first=render('Checking visible SC2 window…'),second=render('Checking visible SC2 window…');
 assert.equal(visibleStatus(first),visibleStatus(second));
 assert.doesNotMatch(first.match(/<p class="live-detection-status[^>]*>/)[0],/role="(?:status|alert)"|aria-live/);
});
check('Visible fixed status copy and capture-error pattern already support Russian',()=>{
 assert.equal(run('RU_UI_TEXT["Checking visible SC2 window…"]'),'Проверка видимого окна SC2…');
 assert.equal(run('RU_UI_TEXT["Starting SC2 screen reader…"]'),'Запуск распознавания экрана SC2…');
 assert.ok(run('RU_UI_RULES.some(item=>item.pattern.test("SC2 background capture unavailable - failed"))'));
});
console.log(JSON.stringify({success:true,checks},null,2));
