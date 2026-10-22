'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const players=[
 {id:'a',name:'SameName',against:{games:4,winRate:0},together:{games:2,winRate:100}},
 {id:'b',name:'SameName',against:{games:1,winRate:100},together:{games:0,winRate:null}},
 {id:'undecided',name:'Undecided',against:{},together:{}}
];
const group={key:'own',canAutoLink:true,evidence:'Local account fixture',warnings:[],profiles:[
 {id:'eu',name:'MyEuropeName',region:'EU',nameSource:'Imported replay'},
 {id:'us',name:'MyAmericaName',region:'Americas',nameSource:'Imported replay'}
]};
const context=vm.createContext({document:{addEventListener(){}},state:{library:{players,marks:[],ownAccountGroups:[group],settings:{},ratings:{}}},
 esc:s=>String(s??''),num:n=>n??'—',rate:n=>n===null||n===undefined?'—':`${Math.round(n)}%`,
 findPlayer:id=>players.find(p=>p.id===id),regionRating:()=>null,listBadge:()=>'',mostPlayedCell:()=>'<span>Portrait</span>',date:s=>s,time:s=>s});
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('function playerOutcome(')),context);
for(const file of ['sound-library.js','player-names.js','commanders.js','picks.js','picks-view.js','site-data.js','combat.js','own-accounts.js','replays.js','lobby.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=code=>vm.runInContext(code,context);
const check=(code,name)=>{assert.equal(run(code),true,name);checks.push(name);};
const player=(id,team,result='Unknown')=>({id,team,result});
context.matches=[
 {hash:'a-win',winner:2,players:[player('a',2,'Loss'),player('self',1)]},
 {hash:'a-loss',winner:1,players:[player('a',2,'Win')]},
 {hash:'a-fallback',winner:0,players:[player('a',1,'Win')]},
 {hash:'a-unknown',winner:0,players:[player('a',1)]},
 {hash:'b-zero',winner:0,players:[player('b',1,'Loss')]},
 {hash:'own-eu',winner:1,players:[player('eu',1)]},
 {hash:'own-us',winner:2,players:[player('us',1)]},
 {hash:'own-shared',winner:1,players:[player('eu',1),player('us',1)]},
 {hash:'undecided',winner:0,players:[player('undecided',1)]}
];
context.group=group;
run('buildCombatCache(matches,["eu","us"]);');
check('livePlayerResults(["a"]).wins===2 && livePlayerResults(["a"]).losses===1 && livePlayerResults(["a"]).games===4 && livePlayerResults(["a"]).unknown===1','Player perspective uses recorded winner, result fallback, and games without your account');
check('Math.abs(livePlayerResults(["a"]).winRate-200/3)<1e-9','Undecided games do not dilute player win rate');
check('livePlayerResults(["b"]).winRate===0','A recorded zero win rate remains zero');
check('livePlayerResults(["undecided"]).winRate===null && livePlayerResults(["missing"]).winRate===null','Undecided-only and missing histories remain unavailable');
check('livePlayerResults(["a","a"]).games===4','Duplicate lookup IDs do not duplicate games');
check('livePlayerResults(["eu","us"]).games===3 && livePlayerResults(["eu","us"]).wins===2 && livePlayerResults(["eu","us"]).losses===1','Linked regional accounts combine distinct replays and count a shared replay once');
check('liveLobbyCandidate({id:"a",name:"SameName"},true).includes("67%") && liveLobbyCandidate({id:"b",name:"SameName"},true).includes("Player win rate</span><strong>0%")','Same-name identities display independent player win rates');
check('liveLobbyCandidate({id:"a"},false).includes("2W / 1L · 4 games · 1 undecided") && liveLobbyCandidate({id:"a"},false).includes("Imported 3v3 Commanders replays") && liveLobbyCandidate({id:"a"},false).includes("Your win rate against</span><strong>0%")','Lobby labels show sample counts and distinguish player rate from your matchup rate');
check('!liveLobbyCandidate({id:"name:Unknown",nameOnly:true},false).includes("live-player-results")','Name-only entries do not invent a win rate');
check('ownLobbyCandidate(group).includes("Your linked-account win rate") && ownLobbyCandidate(group).includes("2W / 1L · 3 games")','Linked local account lobby cards show the combined replay rate');
check('liveLobbyCandidate({id:"a"},false).includes(\'data-lobby-pick="a"\') && liveLobbyCandidate({id:"a"},false).includes(\'data-lobby-pick-toggle="a"\')','A stable replay candidate exposes the accessible hover preview');
check('!liveLobbyCandidate({id:"a",nameOnly:true},false).includes("data-lobby-pick")','A name-only mark cannot inherit a stable candidate preview');
run('state.library.settings.selfIds=["a"]');
check(`!liveLobbyCandidate({id:"a"},false).includes('data-lobby-pick="a"') && !liveLobbyCandidate({id:"a"},false).includes('data-lobby-pick-kind="player"')`,'A selected own account is excluded from opponent hover advice while game tooltips remain available');
run('state.library.settings.selfIds=[]');
check('liveLobbyCard({name:"SameName",candidates:[{id:"a"},{id:"b"}]},0).includes(\'data-lobby-pick="a"\') && liveLobbyCard({name:"SameName",candidates:[{id:"a"},{id:"b"}]},0).includes(\'data-lobby-pick="b"\')','Ambiguous lobby names expose separate previews for each regional identity');
const result={success:true,checks};
fs.writeFileSync(path.join(__dirname,'lobby-winrates-ui-tests.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
