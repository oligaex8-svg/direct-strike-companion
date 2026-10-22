'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8'),checks=[];
const eu='2-S2-1-1',us='1-S2-1-2',other='2-S2-1-3';
const players=[{id:eu,name:'EU <Nick>',aliases:[]},{id:us,name:'NA Nick',aliases:[]},{id:other,name:'EU <Nick>',aliases:[]}];
const group={key:'own',canAutoLink:true,warnings:[],evidence:'Fixture',profiles:[{...players[0],region:'EU'},{...players[1],region:'Americas'}]};
const library={settings:{selfIds:[eu,us]},players,matches:[],marks:[],ownAccountGroups:[group],ratings:{[eu]:{eu:{value:2800}},[us]:{americas:{value:2400}}},siteLookups:{}};
let opened=[],sequence=0;
const deltaIds=[];
const context=vm.createContext({state:{library},document:{querySelectorAll:()=>opened},
 ratingChangeCell:(match,id)=>{deltaIds.push(id);return `delta-${id}`;}});
for(const prefix of ['const esc=','const rate=','const num=','const date=','const time=','function playerOutcome(','function visibleMatches(','function empty(','function regionRating(']){
 const line=app.split(/\r?\n/).find(line=>line.startsWith(prefix));assert.ok(line,prefix);vm.runInContext(line,context);
}
vm.runInContext('function findPlayer(id){const p=state.library.players.find(p=>p.id===id);return p?{...p,ratings:state.library.ratings[id]}:null;}',context);
for(const file of ['player-names.js','commanders.js','combat.js','own-accounts.js','site-data.js','profile.js','profile-view.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
context.ratingChangeCell=(match,id)=>{deltaIds.push(id);return `delta-${id}`;};
const run=expression=>vm.runInContext(expression,context);
function check(name,body){body();checks.push(name);}
function game(id,commander,win=true,values={UnitKills:0}){
 const selected={id,name:id===us?'NA Nick':'EU <Nick>',team:1,commander,result:win?'Win':'Loss',apm:0,combat:{values}};
 return {hash:'game-'+(++sequence),time:new Date(Date.UTC(2026,9,1,0,sequence)).toISOString(),mode:'Commanders',winner:win?1:2,players:[selected,...Array.from({length:5},(_,i)=>({id:'other-'+i,name:'Opponent',team:i<2?1:2,commander:'Swann',result:'Unknown'}))]};
}
library.matches=[...Array.from({length:7},(_,i)=>game(eu,'Raynor',i<5,i===0?{}:{UnitKills:i===1?12:0})),
 ...Array.from({length:5},()=>game(eu,'Nova')), ...Array.from({length:6},(_,i)=>game(us,'Tychus',i<5)),game(other,'Kerrigan')];
const excluded=[{...game(eu,'Swann'),mode:'Brawl'}, {...game(eu,'Swann'),players:[]}];
library.matches.push(...excluded);
run('buildCombatCache(visibleMatches(),state.library.settings.selfIds)');
check('Own profile combines only selected identities and excludes other modes or team sizes',()=>{
 assert.equal(run('profileRows("@own").length'),18);assert.equal(run('profileRows("2-S2-1-3").length'),1);
 assert.equal(run('profileRows("2-S2-1-1").length'),12);
});
check('Own history is newest first and duplicate replay hashes count once',()=>{
 assert.equal(run('profileRows("@own")[0].player.id'),us);
 run('combatOwnRows.push(combatOwnRows[0])');assert.equal(run('profileRows("@own").length'),18);
});
let html=run('renderMyProfile()');
check('The largest card uses the real favourite; three frames rank eligible commanders',()=>{
 assert.equal(run('buildPlayerShowcase(profileRows("@own")).mostPlayed.commander'),'Raynor');
 assert.equal((html.match(/class="profile-best-card"/g)||[]).length,3);
 assert.match(html,/Most played commander/);assert.match(html,/at least 5 decided games/);
 assert.deepEqual(Array.from(run('buildPlayerShowcase(profileRows("@own")).bestPlayed'),x=>x.commander),['Nova','Tychus','Raynor']);
});
check('Commander actions target combined own data and individual profiles keep their identity',()=>{
 assert.match(html,/data-combat-id="@own" data-commander="Raynor"/);
 const individual=run('profileCommanderShowcase(profileRows("2-S2-1-1"),"2-S2-1-1")');
 assert.match(individual,/data-combat-id="2-S2-1-1" data-commander="Raynor"/);assert.ok(!individual.includes('Tychus'));
});
check('Favourite, best commander and overall records label wins and losses independently',()=>{
 assert.equal((html.match(/class="profile-wins"/g)||[]).length,5);
 assert.equal((html.match(/class="profile-losses"/g)||[]).length,5);
 assert.match(html,/<span class="profile-wins">15 wins<\/span> <span>·<\/span> <span class="profile-losses">3 losses<\/span>/);
 assert.match(html,/<span class="profile-wins">5 wins<\/span> \/ <span class="profile-losses">2 losses<\/span>/);
 const undecided=run('profileSample({wins:0,losses:0,unknown:2})');
 assert.equal(undecided,'<span class="profile-wins">0 wins</span> / <span class="profile-losses">0 losses</span> · 2 undecided');
});
check('Missing averages remain unavailable and genuine zero observations count',()=>{
 assert.equal(run('averageCombat(profileRows("2-S2-1-1").filter(r=>r.player.commander==="Raynor"),"UnitKills").count'),6);
 assert.equal(run('averageCombat(profileRows("2-S2-1-1").filter(r=>r.player.commander==="Raynor"),"UnitKills").value'),2);
 assert.match(html,/6 games available/);assert.match(html,/0<\/strong><small>18 games available/);
});
check('Regional values retain independent selected ratings and different nicknames',()=>{
 assert.match(html,/>2,800<\/strong>/);assert.match(html,/>2,400<\/strong>/);
 assert.match(html,/EU &lt;Nick&gt;/);assert.match(html,/NA Nick/);
 assert.match(html,/data-site-player="2-S2-1-1"/);assert.match(html,/data-site-player="1-S2-1-2"/);
});
check('Multiple selected accounts in one region remain separate and a zero rating is valid',()=>{
 library.settings.selfIds.push(other);library.ratings[other]={eu:{value:0}};
 const region=run('profileRegionCard("EU")');assert.equal((region.match(/data-site-player=/g)||[]).length,2);assert.match(region,/<strong>0<\/strong>/);
 library.settings.selfIds.pop();delete library.ratings[other];
});
check('Account names are escaped before rendering HTML',()=>{
 assert.ok(!html.includes('EU <Nick>'));assert.match(html,/EU &lt;Nick&gt;/);
});
check('Each recent game uses the actual regional player identity for its rating change',()=>{
 deltaIds.length=0;run('profileRecentGames(profileRows("@own"))');assert.equal(deltaIds.length,6);assert.ok(deltaIds.every(id=>id===us));
 assert.match(html,/data-match="game-18"/);
});
check('One unfilled summary explains the minimum sample without repeated empty cards',()=>{
 const small=run('profileCommanderShowcase(profileRows("2-S2-1-3"),"2-S2-1-3")');
 assert.equal((small.match(/profile-best-empty/g)||[]).length,1);assert.ok(!small.includes('profile-best-rate'));
});
check('Expanded profile disclosures survive scheduled refresh rendering',()=>{
 opened=[{dataset:{profileDetail:'commanders'}}];html=run('renderMyProfile()');
 assert.match(html,/data-profile-detail="commanders" open/);assert.ok(!html.includes('data-profile-detail="metrics" open'));
});
check('Empty accounts and libraries show honest placeholders',()=>{
 library.settings.selfIds=[];run('buildCombatCache([],[])');opened=[];html=run('renderMyProfile()');
 assert.match(html,/No regional account detected/);assert.match(html,/Your first game starts here/);
 assert.equal((html.match(/profile-best-empty/g)||[]).length,1);assert.ok(!html.includes('NaN'));
});
const report={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'profile-view-tests.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
