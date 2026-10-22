'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[],listeners={},elements=new Map();
const element=id=>elements.get(id)||elements.set(id,{id,value:'',dataset:{},hidden:false,innerHTML:'',textContent:'',addEventListener(type,handler){this[type]=handler;},setAttribute(key,value){this[key]=value;},classList:{toggle(){}},querySelector(){return null;},contains(){return false;}}).get(id);
const navigation=['players','friends','marks'].map(view=>({...element('nav-'+view),dataset:{view}}));
const document={hidden:false,activeElement:null,getElementById:element,querySelector:element,querySelectorAll:()=>navigation,addEventListener(type,handler){(listeners[type]??=[]).push(handler);}};
const context=vm.createContext({document,console,setTimeout(){},clearTimeout(){},setInterval(){},interfaceLocale:()=> 'en-GB',commanderName:name=>name,commanderPortrait:()=>'',ownGroupFor:()=>null,ownProfileFor:()=>null,siteRating:()=>null,automaticRatingCell:(p,region)=>`rating-${region}-${p.ratings?.[region==='EU'?'eu':'americas']?.value??'missing'}`,maintainAutomaticData:()=>Promise.resolve()});
const load=name=>vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',name),'utf8'),context);
load('player-names.js');load('own-accounts.js');load('player-lists.js');load('players-view.js');
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8').replace('refresh();setInterval(refresh,4000);',''),context);
const run=code=>vm.runInContext(code,context),check=(name,body)=>{body();checks.push(name);};
const player=(id,name,list,encounters=1)=>({id,name,aliases:[name+' alias'],encounters,mark:list?{id,name,list}:undefined,against:{games:3,wins:2,losses:1,unknown:0,winRate:200/3},together:{games:1,wins:0,losses:0,unknown:1,winRate:null},ratings:{eu:{value:2300},americas:{value:2200}}});
context.fixturePlayers=Array.from({length:105},(_,i)=>player('2-S2-1-'+i,'Friend '+String(i).padStart(3,'0'),'friends'));
context.fixturePlayers.push(player('blocked','Blocked','blocked'),player('loser','Loser','losers'),player('plain','Unmarked'),player('legacy','Legacy',''));
context.fixtureMarks=context.fixturePlayers.filter(p=>p.mark).map(p=>p.mark).concat([{id:'name:new friend',name:'New Friend',list:'friends',note:'Private'}]);
run(`state={busy:false,library:{players:fixturePlayers,marks:fixtureMarks,matches:[],errors:[],settings:{selfIds:[],sortPreferences:{players:{key:'name',direction:'asc'}}}},lobby:{roster:[],alerts:[]}};playerRows=fixturePlayers;playerIndex=new Map(playerRows.map(p=>[p.id,p]));view='friends';`);
const original=JSON.stringify(context.fixturePlayers),originalMarks=JSON.stringify(context.fixtureMarks);
check('Friends scope includes only current friends marks, including name-only friends',()=>{
 const rows=run('friendPlayers()');assert.equal(rows.length,106);assert.ok(rows.every(p=>p.mark.list==='friends'));assert.equal(rows.find(p=>p.id==='name:new friend').encounters,0);assert.equal(run('findPlayer("blocked").name'),'Blocked');
});
check('Friends search includes names, aliases and IDs before paging, regardless of Saved only',()=>{
 run('markedOnly=true;query="friend 104 alias"');assert.equal(run('visibleFriends()[0].id'),'2-S2-1-104');
 run('query="name:new friend"');assert.equal(run('visibleFriends()[0].id'),'name:new friend');run('query=""');
});
check('Full friend pages cover every friend once and retain encounter statistics',()=>{
 const ids=[];for(let page=1;page<=3;page++){context.requested=page;const result=run('playerDirectoryPage(visibleFriends(),requested)');ids.push(...result.rows.map(p=>p.id));assert.equal(result.rows.length,page===3?6:50);}
 assert.equal(new Set(ids).size,106);assert.equal(run('visibleFriends()[0].against.winRate'),200/3);
});
check('Friends uses directory columns, profile/list actions and regional ratings',()=>{
 run('playerPage=1;renderLibraryContent()');const html=element('library-content').innerHTML;
 for(const text of ['MOST PLAYED','AGAINST','TOGETHER','EU RATING','AMERICAS RATING','data-player="2-S2-1-0"','data-mark="2-S2-1-0"','rating-EU-2300','rating-Americas-2200'])assert.ok(html.includes(text),text);
 assert.equal(element('marked-only').hidden,true);assert.equal(element('.toolbar').hidden,false);assert.equal(element('sort-controls').hidden,false);
});
check('Friends sorts with existing Players preference, while other scope defaults remain intact',()=>{
 run('sortPreferences.players={key:"eu",direction:"desc"}');assert.equal(run('currentSort("friends").key'),'eu');assert.equal(run('currentSort("marks").key'),'name');assert.equal(run('currentSort("matches").key'),'date');
 run('sortPreferences.players={key:"name",direction:"desc"}');assert.equal(run('visibleFriends()[0].id'),'name:new friend');run('sortPreferences.players={key:"name",direction:"asc"}');
});
check('Friend count remains total before search and moving a friend removes only their Friends row',()=>{
 run('query="friend 104";render()');assert.equal(element('friend-count').textContent,106);assert.equal(run('visibleFriends().length'),1);
 run('state.library.marks[104]={...state.library.marks[104],list:"blocked"}');assert.equal(run('visibleFriends().length'),0);assert.equal(run('findPlayer("2-S2-1-104").against.winRate'),200/3);run('state.library.marks[104]=fixturePlayers[104].mark;query=""');
});
check('Display filtering and paging do not mutate the full player index, rows or marks',()=>{
 assert.equal(JSON.stringify(context.fixturePlayers),original);assert.equal(JSON.stringify(context.fixtureMarks),originalMarks);assert.equal(run('playerIndex.size'),109);assert.equal(run('playerRows.length'),109);
});
async function dispatch(type,target){for(const listener of listeners[type]||[])await listener({target});}
(async()=>{
 context.calls=[];run('api=async(path,data)=>{calls.push({path,data});return {}}');await run('setSort("friends","against","desc")');assert.equal(context.calls[0].data.scope,'players');assert.equal(run('state.library.settings.sortPreferences.players.key'),'against');checks.push('Friends sort persistence uses the supported Players API scope');
 run('playerPage=3;replayPage=4;query="stale"');await dispatch('click',{closest:selector=>selector==='button'?{dataset:{view:'friends'}}:null});assert.equal(run('playerPage'),1);assert.equal(run('replayPage'),1);assert.equal(run('query'),'');checks.push('Navigation transitions clear search and reset both directory and replay pagination');
 run('playerPage=3');element('search').input({target:{value:'friend 104'}});assert.equal(run('playerPage'),1);assert.equal(run('visibleFriends().length'),1);checks.push('Search input resets directory pagination before rendering');
 run('showPlayer=id=>{calls.push({profile:id})}');await dispatch('click',{closest:selector=>selector==='button'?{dataset:{player:'2-S2-1-104'}}:null});assert.ok(context.calls.some(call=>call.profile==='2-S2-1-104'));checks.push('Directory profile clicks reach the existing player profile handler');
 const html=fs.readFileSync(path.join(root,'wwwroot/index.html'),'utf8');assert.match(html,/data-view="friends">Friends <span id="friend-count">/);assert.match(html,/data-view="marks">Player lists/);checks.push('Friends sidebar navigation coexists with Player lists');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
