'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(__dirname,'automatic-lobby-state-preview-data.json'),'utf8').replace(/^\uFEFF/,''));
const checks=[];
function fixture(){
 const saved=structuredClone(data),name=saved.names[0],id=saved.dsstats['name:EU:'+name.toLowerCase()].profiles[0].nativeId;
 const state={library:{settings:{selfIds:[id]},accounts:[{id,name}],players:[],marks:[],ownAccountGroups:[],siteLookups:saved.dsRating,dsstatsLookups:saved.dsstats},lobby:{region:'EU',phase:'pregame',source:'screen',rosterEntries:saved.names.map((name,index)=>({name,team:index<3?1:2,candidates:[]}))}};
 const context=vm.createContext({state,document:{addEventListener(){}},findPlayer:()=>null,regionRating:()=>null,siteIdentityKey:profile=>'site:'+profile.region+':'+profile.profileId,
  esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),num:value=>String(Math.round(value)),date:value=>value,time:()=>'',automaticDataError:''});
 for(const file of ['dsstats.js','dsstats-changes.js','dsr-projections.js','site-data.js','own-accounts.js','sound-library.js','lobby.js','lobby-forecast.js'])vm.runInContext(fs.readFileSync(path.join(root,'wwwroot',file),'utf8'),context);
 return {context,state,id,name,run:code=>vm.runInContext(code,context),forecast:()=>vm.runInContext('liveLobbyForecast(state.lobby.rosterEntries)',context)};
}
function check(name,action){action(fixture());checks.push(name);}
check('A complete observed lobby finds the configured own account by name and projects both outcomes per source',f=>{
 const value=f.forecast();assert.ok(value.dsr.win>0&&value.dsr.loss<0);assert.ok(value.dsstats.win>0&&value.dsstats.loss<0);assert.equal(value.dsstats.basis,'site-state');
 const html=f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)');assert.match(html,/data-rating-source="dsr"/);assert.match(html,/data-rating-source="dsstats"/);assert.match(html,/>Win</);assert.match(html,/>Loss</);assert.doesNotMatch(html,/Baseline/);
});
check('Incomplete cached state remains loading until automatic public data supplies actual factors',f=>{
 const complete=structuredClone(f.state.library.dsstatsLookups);
 for(const lookup of Object.values(f.state.library.dsstatsLookups))for(const profile of lookup.profiles||[]){delete profile.consistency;delete profile.confidence;}
 const pending=f.forecast();assert.equal(pending.dsstats,null);assert.equal(pending.dsstatsPendingState,true);assert.ok(pending.dsr.win>0);
 assert.match(f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)'),/Loading rating data/);assert.doesNotMatch(f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)'),/Baseline/);
 f.state.library.dsstatsLookups=complete;const value=f.forecast();assert.equal(value.dsstats.basis,'site-state');assert.ok(value.dsstats.win>0);
});
check('A newer incomplete name copy reuses complete native state for the exact account and region',f=>{
 const key='name:EU:'+f.name.toLowerCase(),named=f.state.library.dsstatsLookups[key],profile=named.profiles.find(profile=>profile.nativeId===f.id);
 f.state.library.dsstatsLookups[f.id]={key:f.id,status:'Ready',checked:named.checked,profiles:[structuredClone(profile)]};
 named.checked='2099-01-01T00:00:00Z';delete profile.consistency;delete profile.confidence;
 const before=JSON.stringify(f.state);assert.equal(f.forecast().dsstats.basis,'site-state');assert.equal(JSON.stringify(f.state),before);
});
check('State from another native identity or region cannot repair an incomplete own profile',f=>{
 const key='name:EU:'+f.name.toLowerCase(),named=f.state.library.dsstatsLookups[key],profile=named.profiles.find(profile=>profile.nativeId===f.id),complete=structuredClone(profile);
 delete profile.consistency;delete profile.confidence;
 f.state.library.dsstatsLookups[f.id]={key:f.id,status:'Ready',checked:named.checked,profiles:[{...complete,region:'Americas'}]};
 assert.equal(f.forecast().dsstats,null);
 f.state.library.dsstatsLookups[f.id].profiles=[{...complete,nativeId:'2-S2-1-999999999'}];assert.equal(f.forecast().dsstats,null);
});
check('A non-primary exact opponent uses its own automatically completed state',f=>{
 const entry=f.state.lobby.rosterEntries[1],named=f.state.library.dsstatsLookups['name:EU:'+entry.name.toLowerCase()],original=named.profiles[0];
 const complete={...original,nativeId:'2-S2-1-999999998',lastPlayed:'2020-01-01T00:00:00Z'},partial={...complete,consistency:null,confidence:null};
 named.profiles.push(partial);entry.candidates=[{id:complete.nativeId,nameOnly:false}];
 f.state.library.dsstatsLookups[complete.nativeId]={key:complete.nativeId,status:'Ready',checked:named.checked,profiles:[partial]};
 assert.equal(f.forecast().dsstats,null,'The other same-name account cannot supply this account state');
 f.state.library.dsstatsLookups[complete.nativeId].profiles=[complete];assert.equal(f.forecast().dsstats.basis,'site-state');
});
check('Missing one dsstats rating leaves DSR available without fabricating the second forecast',f=>{
 const native=data.dsstats['name:EU:'+data.names[4].toLowerCase()].profiles[0].nativeId;
 for(const lookup of Object.values(f.state.library.dsstatsLookups))lookup.profiles=(lookup.profiles||[]).filter(profile=>profile.nativeId!==native);
 const value=f.forecast();assert.ok(value.dsr.win>0);assert.equal(value.dsstats,null);
});
check('General DSR values create a separately labelled main projection instead of mixing into Commanders',f=>{
 const key='name:EU:'+f.name.toLowerCase();const ids=new Set(f.state.library.siteLookups[key].profiles.map(profile=>profile.profileId));
 for(const lookup of Object.values(f.state.library.siteLookups))for(const profile of lookup.profiles||[])if(ids.has(profile.profileId))profile.rating=null;
 f.state.library={...f.state.library};const value=f.forecast();assert.equal(value.dsr.scope,'main_current');assert.ok(value.dsstats.win>0);
});
check('Missing one DSR player cannot produce a tiny default-2000 forecast',f=>{
 const name=f.state.lobby.rosterEntries[4].name,ids=new Set(f.state.library.siteLookups['name:EU:'+name.toLowerCase()].profiles.map(p=>p.profileId));
 for(const lookup of Object.values(f.state.library.siteLookups))for(const profile of lookup.profiles||[])if(ids.has(profile.profileId)){profile.rating=null;profile.estimatedRating=null;profile.searchRating=null;}
 f.state.library={...f.state.library};const value=f.forecast();assert.equal(value.dsr.win,null);assert.equal(value.dsr.status,'missing-ratings');assert.ok(value.dsstats.win>0);
});
check('Five-player lobbies wait; six unconfirmed display groups produce a labelled scenario without assigning teams',f=>{
 f.state.lobby.rosterEntries.pop();assert.match(f.forecast().reason,/six/);
 f=fixture();f.state.lobby.rosterEntries.forEach(entry=>entry.team=0);const before=JSON.stringify(f.state);assert.ok(f.forecast().dsstats.win>0);assert.equal(f.forecast().estimatedTeams,true);assert.equal(JSON.stringify(f.state),before);assert.match(f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)'),/Estimated teams/);
 f.run('state.lobby.rosterEntries.forEach((entry,index)=>liveLobbyTeamChoices.set(index,index<3?1:2))');assert.ok(f.forecast().dsstats.win>0);
});
check('Own aliases strip the displayed clan tag without changing saved identities',f=>{
 f.state.lobby.rosterEntries[0].name='<NewClan> '+f.name.toLowerCase();assert.ok(f.forecast().dsr.win>0);assert.equal(f.state.library.settings.selfIds[0],f.id);
});
check('A duplicate own-name row or an unresolved regional account is not guessed',f=>{
 f.state.lobby.rosterEntries[1].name=f.name;assert.match(f.forecast().reason,/account/);
 f=fixture();const second=f.id.replace(/^2-/,'1-');f.state.library.settings.selfIds.push(second);f.state.library.accounts.push({id:second,name:f.name});delete f.state.lobby.region;
 assert.match(f.forecast().reason,/region/);f.state.lobby.region='EU';assert.ok(f.forecast().dsr.win>0);
});
check('A new nickname can identify the unique exact own candidate without alias guessing',f=>{
 f.state.lobby.rosterEntries[0]={name:'NewOwnName',team:1,candidates:[{id:f.id,nameOnly:false}]};assert.equal(f.run('liveForecastOwnEntry(state.lobby.rosterEntries,"EU").id'),f.id);
});
check('Retained rosters show a reason, match-loaded keeps estimates, replay/disconnected/empty rosters suppress numbers',f=>{
 f.state.lobby.held=true;assert.match(f.forecast().reason,/fresh/);f.state.lobby.held=false;
 f.state.lobby.phase='match';assert.ok(f.forecast().dsr.win>0);
 for(const phase of ['replay','disconnected','finished']){f.state.lobby.phase=phase;assert.equal(f.forecast().hidden,true);}
 f.state.lobby.phase='pregame';f.state.lobby.rosterEntries=[];assert.equal(f.forecast().hidden,true);
});
check('Non-self live candidates may reuse the displayed name/region primary while own accounts stay exact-native',f=>{
 const other=f.state.lobby.rosterEntries[1],lookup=f.state.library.dsstatsLookups['name:EU:'+other.name.toLowerCase()];
 assert.equal(f.run(`liveForecastDsstatsProfile('2-S2-1-999999999',${JSON.stringify(other.name)},'EU',true).nativeId`),lookup.profiles[0].nativeId);
 assert.equal(f.run(`liveForecastDsstatsProfile('2-S2-1-999999999',${JSON.stringify(other.name)},'EU',false)`),null);
 const ownLookup=f.state.library.dsstatsLookups['name:EU:'+f.name.toLowerCase()];ownLookup.profiles=ownLookup.profiles.map(profile=>({...profile,nativeId:'2-S2-1-999999999'}));
 assert.equal(f.forecast().dsstats,null);
});
check('A transient selected DSR account drives both displayed rating and the forecast',f=>{
 const name=f.state.lobby.rosterEntries[1].name,key='name:EU:'+name.toLowerCase(),lookup=f.state.library.siteLookups[key];
 lookup.profiles.push({...lookup.profiles[0],profileId:'alternate',rating:20000,searchRating:20000,estimatedRating:20000});f.state.library={...f.state.library};
 f.context.targetName=name;f.run('liveSiteProfileChoices.set(targetName,"site:EU:alternate")');
 assert.equal(f.run('liveLobbyRatingProfile(siteLookupForName(targetName,"EU").profiles,null,targetName).profileId'),'alternate');
 const before=f.forecast().dsr.loss;f.run('liveSiteProfileChoices.clear()');assert.notEqual(f.forecast().dsr.loss,before);
});
check('Forecast calculation leaves team assignments, sources, own IDs and profiles unchanged',f=>{
 const before=JSON.stringify(f.state);f.forecast();f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)');assert.equal(JSON.stringify(f.state),before);
});
check('Two agreeing native peers resolve same-name EU/AM own accounts without choosing the first saved profile',f=>{
 const second=f.id.replace(/^2-/,'1-');f.state.library.settings.selfIds.unshift(second);f.state.library.accounts.unshift({id:second,name:f.name});delete f.state.lobby.region;
 f.state.lobby.phase='match';f.state.lobby.rosterEntries.forEach((entry,index)=>{entry.team=0;const profile=f.state.library.dsstatsLookups['name:EU:'+entry.name.toLowerCase()].profiles[0];entry.candidates=index===0?[{id:second,nameOnly:false},{id:f.id,nameOnly:false}]:[{id:profile.nativeId,nameOnly:false}];});
 const before=JSON.stringify(f.state),value=f.forecast();assert.equal(value.region,'EU');assert.equal(value.inferredRegion,true);assert.equal(value.estimatedTeams,true);assert.ok(value.dsr.win>0&&value.dsstats.win>0);assert.equal(JSON.stringify(f.state),before);
 assert.match(f.run('renderLiveLobbyForecast(state.lobby.rosterEntries)'),/Region inferred/);
});
check('Contradictory or insufficient peer regions never decide an ambiguous own account by majority',f=>{
 const second=f.id.replace(/^2-/,'1-');f.state.library.settings.selfIds.unshift(second);f.state.library.accounts.unshift({id:second,name:f.name});delete f.state.lobby.region;
 f.state.lobby.rosterEntries[1].candidates=[{id:'2-S2-1-99999991',nameOnly:false}];assert.match(f.forecast().reason,/region/);
 f.state.lobby.rosterEntries[2].candidates=[{id:'1-S2-1-99999992',nameOnly:false}];assert.match(f.forecast().reason,/region/);
 f.state.lobby.rosterEntries[3].candidates=[{id:'2-S2-1-99999993',nameOnly:false}];assert.match(f.forecast().reason,/region/);
 f.state.lobby.region='EU';assert.ok(f.forecast().dsr.win>0,'Observed region takes precedence over peer history');
});
check('Partly assigned teams do not get silently filled from display order',f=>{
 f.state.lobby.rosterEntries.forEach(entry=>entry.team=0);f.state.lobby.rosterEntries[0].team=1;assert.match(f.forecast().reason,/complete/);
});
const report={success:true,checks};fs.writeFileSync(path.join(__dirname,'live-lobby-forecast-model-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
