'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const context=vm.createContext({document:{addEventListener(){}},state:{library:{settings:{selfIds:[]}},lobby:{}},esc:s=>String(s??'')});
for(const file of ['sound-library.js','lobby.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
vm.runInContext('liveLobbyCard=(entry,index)=>`<article data-row="${index}">${entry.name}</article>`',context);
const run=source=>vm.runInContext(source,context),check=(name,fn)=>{fn();checks.push(name);};
function load(entries){context.entries=entries;context.state.lobby={source:'screen',phase:'pregame',rosterUpdatedAt:'first',rosterEntries:entries};run('syncLiveTeammates(state.lobby)');}
check('Visible panel metadata groups rows independently of display order, with one red Team 2 wrapper',()=>{
 load([{name:'opponent-a',team:2},{name:'ally-a',team:1},{name:'opponent-b',team:2},{name:'ally-b',team:1},{name:'ally-c',team:1},{name:'opponent-c',team:2}]);
 const html=run('renderLiveLobbyRoster(entries)');
 assert.match(html,/live-team-1[\s\S]*ally-a[\s\S]*ally-b[\s\S]*ally-c[\s\S]*live-team-2[\s\S]*opponent-a[\s\S]*opponent-b[\s\S]*opponent-c/);
 assert.equal((html.match(/live-team-2/g)||[]).length,1);assert.equal((html.match(/<article/g)||[]).length,6);
 const css=fs.readFileSync(path.join(root,'wwwroot/lobby.css'),'utf8');assert.match(css,/\.live-team-2\{border:2px solid var\(--red\)/);
});
check('Names without team evidence show two provisional groups without implying confirmed membership',()=>{
 load(['a','b','c','d','e','f'].map(name=>({name})));
 const html=run('renderLiveLobbyRoster(entries)');assert.equal((html.match(/live-team-provisional/g)||[]).length,2);assert.equal((html.match(/<span>Unconfirmed<\/span>/g)||[]).length,2);assert.equal((html.match(/<article/g)||[]).length,6);
 assert.equal(run('entries.every((entry,index)=>liveLobbyTeam(entry,index)===0)'),true);assert.equal(run('liveLobbyTeamChoices.size'),0);
 assert.match(html,/live-team-1[\s\S]*>a<\/article>[\s\S]*>b<\/article>[\s\S]*>c<\/article>[\s\S]*live-team-2[\s\S]*>d<\/article>[\s\S]*>e<\/article>[\s\S]*>f<\/article>/);
});
check('Provisional groups preserve extra names and confirmed metadata overrides display order',()=>{
 load(['a','b','c','d','e','f','g'].map(name=>({name})));let html=run('renderLiveLobbyRoster(entries)');assert.match(html,/live-team-unknown[\s\S]*>g<\/article>/);assert.equal((html.match(/<article/g)||[]).length,7);
 context.entries[5].team=1;context.entries[0].team=2;html=run('renderLiveLobbyRoster(entries)');assert.doesNotMatch(html,/live-team-provisional/);assert.match(html,/live-team-1[\s\S]*>f<\/article>[\s\S]*live-team-2[\s\S]*>a<\/article>/);
});
check('Waiting roster reserves exactly three placeholders in green Team 1 and red Team 2',()=>{
 load([]);const html=run('renderLiveLobbyRoster(entries)');
 const sections=[...html.matchAll(/<section[^>]*aria-label="Team ([12])"[\s\S]*?<\/section>/g)];
 assert.equal(sections.length,2);assert.equal(sections[0][1],'1');assert.equal(sections[1][1],'2');
 for(const section of sections){assert.equal((section[0].match(/<article/g)||[]).length,3);assert.match(section[0],/0 \/ 3/);}
 assert.doesNotMatch(html,/live-team-unknown/);
 const css=fs.readFileSync(path.join(root,'wwwroot/lobby.css'),'utf8');assert.match(css,/\.live-team-1\{border:2px solid var\(--green\)/);
});
check('Partial detected teams each retain three rows and counts exclude waiting placeholders',()=>{
 load([{name:'one',team:1},{name:'two',team:2},{name:'three',team:2}]);const html=run('renderLiveLobbyRoster(entries)');
 const sections=[...html.matchAll(/<section[^>]*aria-label="Team ([12])"[\s\S]*?<\/section>/g)];
 assert.equal(sections.length,2);for(const section of sections)assert.equal((section[0].match(/<article/g)||[]).length,3);
 assert.match(sections[0][0],/1 \/ 3/);assert.match(sections[1][0],/2 \/ 3/);
 assert.equal((html.match(/No name detected<\/h3>/g)||[]).length,3);
});
check('Partial screen groups keep unknown players in a separate unconfirmed section',()=>{
 load([{name:'known',team:2},{name:'unknown'},{name:'invalid',team:3}]);const html=run('renderLiveLobbyRoster(entries)');
 assert.match(html,/live-team-2[\s\S]*known[\s\S]*live-team-unknown[\s\S]*unknown[\s\S]*invalid/);
});
check('Manual team choices distinguish duplicate names by row and cannot exceed three players',()=>{
 load([{name:'same'},{name:'same'},{name:'c'},{name:'d'}]);
 assert.equal(run('setLiveLobbyTeam(entries,0,1)'),true);assert.equal(run('setLiveLobbyTeam(entries,1,2)'),true);
 assert.equal(run('liveLobbyTeam(entries[0],0)'),1);assert.equal(run('liveLobbyTeam(entries[1],1)'),2);
 assert.equal(run('setLiveLobbyTeam(entries,2,1)'),true);assert.equal(run('setLiveLobbyTeam(entries,3,1)'),true);
 assert.equal(run('setLiveLobbyTeam(entries,1,1)'),false);assert.equal(run('liveLobbyTeam(entries[1],1)'),2);
 assert.equal(run('setLiveLobbyTeam(entries,0,0)'),true);assert.equal(run('setLiveLobbyTeam(entries,1,1)'),true);
});
check('Automatic refresh retains manual choices, while changed roster generation clears them',()=>{
 run('syncLiveTeammates(state.lobby)');assert.equal(run('liveLobbyTeam(entries[1],1)'),1);
 context.entries[1].candidates=[{id:'2-S2-1-42',nameOnly:false}];context.state.library.settings.selfIds=['2-S2-1-99'];run('syncLiveTeammates(state.lobby)');assert.equal(run('liveLobbyTeam(entries[1],1)'),1);
 context.state.lobby.rosterUpdatedAt='new';run('syncLiveTeammates(state.lobby)');assert.equal(run('liveLobbyTeamChoices.size'),0);
});
check('Changed source or reordered duplicate rows resets manual assignments safely',()=>{
 run('setLiveLobbyTeam(entries,0,1)');context.state.lobby.source='client';run('syncLiveTeammates(state.lobby)');assert.equal(run('liveLobbyTeamChoices.size'),0);
 run('setLiveLobbyTeam(entries,0,1)');const rows=context.entries;context.state.lobby.rosterEntries=[rows[2],rows[1],rows[0],rows[3]];run('syncLiveTeammates(state.lobby)');assert.equal(run('liveLobbyTeamChoices.size'),0);
});
check('Team controls are accessible and explain observed versus manual evidence',()=>{
 load([{name:'Test',team:2}]);const html=run('renderLobbyTeamChoice(entries[0],0)');assert.match(html,/aria-label="Team for Test"/);assert.match(html,/value="2" selected/);assert.match(html,/Visible lobby panel/);
 run('setLiveLobbyTeam(entries,0,1)');assert.match(run('renderLobbyTeamChoice(entries[0],0)'),/Manual team selection/);
});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/ru-ui.js'),'utf8'),context);
check('Compact team labels and grouping explanations have Russian translations',()=>{
 for(const label of ['Team','Team 1','Team 2','Unconfirmed','Team unconfirmed','Team groups · verify in SC2','Teams unconfirmed · choose a team in Details','Waiting for lobby teams','Manual team selection','Visible lobby panel · verify in SC2','Choose from the visible lobby','Team already has three players.'])assert.ok(run(`RU_UI_TEXT[${JSON.stringify(label)}]`),label);
});
const result={success:true,checks};fs.writeFileSync(path.join(__dirname,'lobby-team-ui-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
