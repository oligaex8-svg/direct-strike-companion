'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8'),checks=[],handlers={};
const own='2-S2-1-1',a='2-S2-1-2',b='1-S2-1-3',players=[{id:own,name:'Me'},{id:a,name:'Same <Name>'},{id:b,name:'Same <Name>'}];
const library={settings:{selfIds:[own]},players,matches:[]};
let oldOpponent=null,opened=[];
const context=vm.createContext({state:{library},document:{addEventListener:(name,handler)=>{handlers[name]=handler;},querySelectorAll:()=>opened,querySelector:()=>oldOpponent},findPlayer:id=>players.find(player=>player.id===id)});
for(const prefix of ['const esc=','const num=','const rate=','const date=','const time=','function playerOutcome(','function empty('])vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith(prefix)),context);
for(const file of ['player-names.js','commanders.js','combat.js','picks.js','player-habits.js','picks-view.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
const run=expression=>vm.runInContext(expression,context),check=(name,body)=>{body();checks.push(name);};
let sequence=0;
function game(id,commander,win=true){return {hash:'game-'+(++sequence),time:new Date(Date.UTC(2026,9,1,0,sequence)).toISOString(),mode:'Commanders',winner:win?1:2,players:[{id,team:1,commander,result:win?'Win':'Loss',name:'Selected'}, {id:'ally1',team:1,commander:'Raynor'},{id:'ally2',team:1,commander:'Swann'},{id:'enemy1',team:2,commander:'Dehaka'},{id:'enemy2',team:2,commander:'Nova'},{id:'enemy3',team:2,commander:'Kerrigan'}]};}
library.matches=[...Array.from({length:8},(_,i)=>game(own,'Raynor',i<4)),...Array.from({length:8},(_,i)=>game(own,'Nova',i<6)),...Array.from({length:8},(_,i)=>game(own,'Artanis',i<7)),...Array.from({length:24},(_,i)=>game(a,i<12?'Dehaka':i<18?'Nova':'Unknown')),...Array.from({length:6},()=>game(b,'Swann'))];
run('buildCombatCache(state.library.matches,state.library.settings.selfIds);pickMatchups=buildPickMatchups(state.library.matches,state.library.settings.selfIds)');
check('The advisor starts without choosing an enemy or inventing recommendations',()=>{
 const html=run('renderPickAdvisor()');assert.match(html,/Pick a player or enemy commander/);assert.ok(!html.includes('class="pick-recommendation"'));
});
check('Player predictions keep unknowns in their denominator and show local sample counts',()=>{
 const html=run(`renderLikelyPicks('${a}',true)`);assert.match(html,/>50%<\/strong>/);assert.match(html,/>25%<\/strong>/);assert.match(html,/12 \/ 24 games/);assert.match(html,/6 unknown picks/);
});
check('Same-name regional identities retain different prediction histories',()=>{
 const first=run(`renderLikelyPicks('${a}')`),second=run(`renderLikelyPicks('${b}')`);
 assert.match(first,/Dehaka/);assert.ok(!second.includes('Dehaka'));assert.match(second,/Swann/);assert.match(second,/100%/);
});
check('The opponent picker excludes selected own IDs and exposes stable separate identities',()=>{
 const html=run('pickOpponentOptions()');assert.ok(!html.includes(`value="${own}"`));assert.match(html,/Same &lt;Name&gt;/);assert.ok(html.includes(`value="${a}"`)&&html.includes(`value="${b}"`));
});
check('Search finds nickname, alias, clan and native identity without merging regions',()=>{
 players[1].clanTag='Expend';players[1].aliases=['OldAlias'];
 for(const text of ['Expend','oldalias',a]){context.searchText=text;run('pickPlayerQuery=searchText');assert.ok(run('pickOpponentOptions()').includes(`value="${a}"`));assert.ok(!run('pickOpponentOptions()').includes(`value="${b}"`));}
 run(`pickPlayerQuery='no such player';pickTargetId='${a}'`);assert.match(run('pickOpponentOptions()'),new RegExp(`value="${a}"[^>]* selected`));assert.match(run('pickSearchStatus()'),/No matching players/);
 run("pickPlayerQuery='';pickTargetId=''");
});
check('Opponent options are bounded for a large library and precise searches find distant rows',()=>{
 const cache=run('combatRowsByPlayer'),added=[];
 for(let n=0;n<4010;n++){const id='2-S2-1-'+(9000+n);cache.set(id,[{player:{name:'Search Player '+n}}]);added.push(id);}
 assert.ok((run('pickOpponentOptions()').match(/<option/g)||[]).length<=201);
 run("pickPlayerQuery='Search Player 4009'");assert.ok(run('pickOpponentOptions()').includes('2-S2-1-13009'));
 for(const id of added)cache.delete(id);run("pickPlayerQuery=''");
});
check('Suggestions use known normalized weights and show supporting team results',()=>{
 run(`pickTargetId='${a}'`);const html=run('renderPickResults()');
 assert.equal((html.match(/class="pick-recommendation"/g)||[]).length,3);assert.match(html,/67% of known expected picks/);assert.match(html,/33% of known expected picks/);
 assert.match(html,/8<\/strong> <span>relevant games/);assert.match(html,/not a predicted win probability/);assert.match(html,/data-combat-id="@own"/);
});
check('A supplied enemy commander overrides estimated picks',()=>{
 run('pickEnemyCommander="Kerrigan"');const html=run('renderPickResults()');assert.match(html,/Against Kerrigan/);assert.match(html,/Known pick supplied by you/);assert.match(html,/100% of known expected picks/);assert.ok(!html.includes('67% of known expected picks'));
});
check('Unsupported matchups show unavailable advice without filler picks',()=>{
 run('pickEnemyCommander="Mengsk"');const html=run('renderPickResults()');assert.match(html,/More matchup history needed/);assert.ok(!html.includes('class="pick-recommendation"'));
});
check('Recommendation evidence and all pick frequencies remain open for the same identity',()=>{
 run('pickEnemyCommander=""');oldOpponent={dataset:{pickHistory:a},querySelector:()=>({open:true})};opened=[{closest:()=>({dataset:{pickCard:'Artanis'}})}];
 const html=run('renderPickResults()');assert.match(html,/class="pick-all-frequencies" open/);assert.match(html,/class="pick-evidence" open/);
 run(`pickTargetId='${b}'`);assert.ok(!run('renderPickResults()').includes('class="pick-all-frequencies" open'));opened=[];oldOpponent=null;
});
check('Fewer than five known player picks cannot create prediction-based recommendations',()=>{
 context.smallId='2-S2-1-small';run('combatRowsByPlayer.set(smallId,combatRowsByPlayer.get("2-S2-1-2").slice(0,4));pickTargetId=smallId');
 assert.match(run('renderPickResults()'),/More opponent pick history needed/);run('pickEnemyCommander="Dehaka"');assert.match(run('renderPickResults()'),/class="pick-recommendation"/);
});
check('The known-pick fraction must reach sixty percent even in a larger history',()=>{
 context.unknownId='2-S2-1-unknown';run('combatRowsByPlayer.set(unknownId,[...combatRowsByPlayer.get("2-S2-1-2").slice(0,5),...combatRowsByPlayer.get("2-S2-1-2").slice(18)]);pickTargetId=unknownId;pickEnemyCommander=""');
 assert.match(run('renderPickResults()'),/More opponent pick history needed/);
});
check('Changing the opponent clears a previously supplied commander override',()=>{
 context.renderLibrary=()=>{};handlers.change({target:{id:'pick-opponent',value:a}});assert.equal(run('pickTargetId'),a);assert.equal(run('pickEnemyCommander'),'');
});
check('Unknown names do not invent probabilities and rendered opponent names are escaped',()=>{
 assert.match(run('renderLikelyPicks("name:unknown")'),/No known commander pick history/);assert.ok(!run('renderLikelyPicks("name:unknown")').includes('<strong>'));
 assert.match(run('renderPickResults()'),/Same &lt;Name&gt;/);assert.ok(!run('renderPickResults()').includes('Same <Name>'));
});
check('The lobby preview reuses likely frequencies and the highest supported advisor result',()=>{
 const html=run(`renderLobbyPickPreview('${a}')`),best=run(`rankCounterPicks(pickMatchups,pickHistoryFor('${a}').items)[0]`);
 assert.match(html,/50%/);assert.match(html,/25%/);assert.match(html.replace(/<[^>]+>/g,''),/6 unknown picks/);
 assert.ok(html.includes(`<strong>${best.commander}</strong>`));assert.match(html,/Suggested counterpick/);assert.match(html,/History score/);assert.match(html,/Relevant games/);
 assert.match(html,/data-i18n-skip>&lt;Expend&gt; Same &lt;Name&gt;/);assert.match(html,/Team composition and builds affect matchups/);
});
check('The lobby preview never suggests an opponent pick against selected own or name-only identities',()=>{
 assert.equal(run(`renderLobbyPickPreview('${own}')`),'');assert.equal(run('renderLobbyPickPreview("name:unknown")'),'');assert.equal(run('renderLobbyPickPreview("missing")'),'');
});
check('An unsupported lobby matchup retains real pick probabilities without inventing a counter',()=>{
 const html=run(`renderLobbyPickPreview('${b}')`);assert.match(html,/Swann/);assert.match(html,/100%/);assert.match(html,/More matchup history needed/);assert.ok(!html.includes('class="lobby-pick-counter"'));
});
check('A small lobby history retains the known choices but does not bypass the opponent threshold',()=>{
 players.push({id:'2-S2-1-small',name:'Small sample'});const html=run('renderLobbyPickPreview("2-S2-1-small")');
 assert.match(html,/More opponent pick history needed/);assert.ok(!html.includes('class="lobby-pick-counter"'));
});
check('A lobby profile without observed picks reports missing history instead of a zero probability',()=>{
 players.push({id:'2-S2-1-empty',name:'No picks'});const html=run('renderLobbyPickPreview("2-S2-1-empty")');
 assert.match(html,/No known commander pick history/);assert.match(html,/More opponent pick history needed/);assert.ok(!html.includes('class="pick-frequency-item"'));
});
check('Compact habits follow the likely commander and preserve observed percentages and medians',()=>{
 for(const match of library.matches){const player=match.players[0];if(player.id!==a)continue;match.seconds=600;const same=player.commander==='Dehaka';match.economy={players:[{id:a,activeSeconds:600,gasTimes:same?[120,300]:[360]}]};player.combat={values:{Tier2Seconds:same?240:420,Tier3Seconds:480}};}
 const html=run(`renderLobbyPickPreview('${a}')`);
 assert.match(html,/class="lobby-habits-meta"><span>Dehaka<\/span>/);assert.match(html,/Last 12 games/);
 assert.match(html,/Gas by 3:00<\/dt><dd><strong>100%/);assert.match(html,/No gas recorded<\/dt><dd><strong>0%/);
 assert.match(html,/>2:00<\/strong>/);assert.match(html,/>5:00<\/strong>/);assert.match(html,/>4:00<\/strong>/);assert.match(html,/>8:00<\/strong>/);assert.match(html,/12 \/ 12/);assert.match(html,/Times are medians/);
});
check('Specific heroes use separate frequencies, counters and commander-scoped habits',()=>{
 const dehaka=run(`renderLobbyPickPreview('${a}',{kind:'commander',commander:'Dehaka'})`),nova=run(`renderLobbyPickPreview('${a}',{kind:'commander',commander:'Nova'})`);
 assert.match(dehaka,/12 \/ 24 games/);assert.match(nova,/6 \/ 24 games/);assert.notEqual(dehaka,nova);
 assert.match(nova,/class="lobby-habits-meta"><span>Nova<\/span>/);assert.match(nova,/>6:00<\/strong>/);
 const best=run("rankCounterPicks(pickMatchups,[{commander:'Nova',probability:100}])[0]");assert.ok(nova.includes(`<strong>${best.commander}</strong>`));
 assert.match(nova,/current commander unknown/);assert.equal((nova.match(/class="pick-frequency-item"/g)||[]).length,1);
});
check('Exact games have their own recorded content and keep own-account history available',()=>{
 const first=library.matches.find(match=>match.players[0].id===a&&match.players[0].commander==='Dehaka'),second=library.matches.find(match=>match.players[0].id===a&&match.players[0].commander==='Nova');
 first.players[0].combat.values.UnitKills=0;first.players[0].apm=125;
 const render=(id,key)=>run(`renderLobbyPickPreview('${id}',{kind:'game',game:'${key}'})`);
 const html=render(a,first.hash),other=render(a,second.hash);
 assert.match(html,/Recorded game/);assert.match(html,/Dehaka/);assert.match(other,/Nova/);assert.notEqual(html,other);
 assert.match(html,/Duration<\/dt><dd>10:00/);assert.match(html,/Enemy kills<\/dt><dd>0/);assert.match(html,/Actions per minute<\/dt><dd>125/);assert.doesNotMatch(html,/Suggested counterpick|Likely picks/);
 assert.match(render(own,library.matches[0].hash),/Recorded game/);assert.match(render(a,'missing-key'),/no longer available/);
 assert.doesNotMatch(render(a,'missing-key'),/Duration<\/dt>/);assert.match(html,/data-i18n-skip>&lt;Expend&gt; Same &lt;Name&gt;/);
});
check('Site games show site evidence and missing stats without fabricated replay metrics',()=>{
 context.siteHistoryRows=()=>[{source:'site',match:{hash:'site:42',time:'2026-10-01T12:00:00Z',seconds:720,winner:0},player:{id:b,team:1,commander:'Swann',result:'Loss'}}];
 const html=run(`renderLobbyPickPreview('${b}',{kind:'game',game:'site:42'})`);
 assert.match(html,/ds-rating.com/);assert.match(html,/Loss/);assert.match(html,/12:00/);assert.match(html,/No recorded replay stats/);assert.doesNotMatch(html,/Enemy kills/);
 delete context.siteHistoryRows;
});
check('Specific heroes without samples report missing history without a zero probability',()=>{
 const html=run('renderLobbyPickPreview("2-S2-1-empty",{kind:"commander",commander:"Nova"})');
 assert.match(html,/No known commander pick history/);assert.match(html,/No replay history for habits/);assert.doesNotMatch(html,/0%|0 \/ 0 games/);
 assert.equal(run(`renderLobbyPickPreview('${a}',{kind:'commander',commander:'<bad>'})`),'');
});
check('Missing gas timelines cannot become no-gas behavior while real upgrade timings remain visible',()=>{
 const match=library.matches.find(match=>match.players[0].id===a);context.habitsRow={match:{...match,hash:'unknown-habits',seconds:600,economy:{players:[{id:a,gasTimes:null}]}},player:{...match.players[0],commander:'Nova',combat:{values:{Tier2Seconds:240}}}};
 run(`combatRowsByPlayer.set('${a}',[habitsRow])`);const html=run(`renderLobbyHabits('${a}','Nova')`);
 assert.match(html,/Gas by 3:00<\/dt><dd><strong>—/);assert.match(html,/No gas recorded<\/dt><dd><strong>—/);assert.match(html,/>4:00<\/strong>/);assert.match(html,/Unknown gas observations/);assert.match(html,/Limited sample/);
});
check('No-history habits stay compact and do not render fabricated timing cells',()=>{
 const html=run('renderLobbyHabits("missing")');assert.match(html,/No replay history for habits/);assert.ok(!html.includes('lobby-habits-grid'));
});
check('Target-specific preview labels translate into Russian and restore English',()=>{
 const language=vm.createContext({console});
 for(const file of ['ru-ui.js','i18n.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),language);
 for(const label of ['Recorded game','Source','Duration','Recorded replay stats','No recorded replay stats for this game.','No recent recorded picks for this commander.',"This game is no longer available in this profile's history."]){
  assert.match(vm.runInContext(`translateInterfaceText(${JSON.stringify(label)},'ru')`,language),/[А-Яа-я]/);
  assert.equal(vm.runInContext(`translateInterfaceText(${JSON.stringify(label)},'en')`,language),label);
 }
});
const result={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'pick-view-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
