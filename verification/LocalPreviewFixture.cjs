'use strict';
// Synthetic local-only UI demonstration. Never reads the private replay library.
module.exports=function(theme='nerazim',language='en'){
  const ids=['2-S2-1-123','1-S2-1-456'];
  const players=ids.map((id,i)=>({id,name:'TKnight',clanTag:i?'IPVGI':'Expend',region:i?'Americas':'EU',race:'Protoss',aliases:[]}));
  const settings={language,graphicalStyle:theme,selfIds:ids,replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,sortPreferences:{}};
  const ratings=Object.fromEntries(players.map((p,i)=>[p.id,{[i?'americas':'eu']:{value:i?7000:7921,profileId:String(8713+i),region:p.region,profileName:p.name,url:'https://ds-rating.com/player/'+(8713+i)+'/ratings'}}]));
  const siteLookups=Object.fromEntries(players.map((p,i)=>[p.id,{playerId:p.id,status:'Ready',profiles:[{profileId:String(8713+i),name:p.name,region:p.region,rating:i?7000:7921,discoveredGames:i?720:2883,winRate:i?80.3:77.1,lastPlayed:'2026-10-21T20:00:00Z'}]}]));
  const dsstatsLookups=Object.fromEntries(players.map((p,i)=>[p.id,{status:'Ready',profiles:[{nativeId:p.id,name:p.name,region:p.region,rating:i?2683:2557,games:i?498:1990,wins:i?393:1546,lastPlayed:'2026-10-21T20:00:00Z'}]}]));
  const matches=Array.from({length:22},(_,i)=>({hash:'sample-'+i,map:'Direct Strike',mode:'Commanders',time:new Date(Date.UTC(2026,9,21,20,i)).toISOString(),seconds:1000,winner:i<19?1:2,players:[{...players[i%2],team:1,commander:i<10?'Artanis':i<16?'Fenix':'Karax',result:i<19?'Win':'Loss',combat:{values:{UnitKills:550,MineralsKilledArmy:40000,CombatDeaths:250,APM:80}}},...Array.from({length:5},(_,j)=>({id:'2-S2-1-'+(900+j),name:'Player '+j,team:j<2?1:2,commander:'Dehaka',result:'Unknown'}))]}));
  const library={settings,players,matches,marks:[],ratings,accounts:[],errors:[],ownAccountGroups:[{key:'own',canAutoLink:true,profiles:players,warnings:[],evidence:'Sample local account group'}],siteLookups,dsstatsLookups,siteHistories:{},siteGames:{}};
  const lobby={phase:'unavailable',roster:[],rosterEntries:[],alerts:[],automation:{acceptNeeded:false},liveStatus:'Client unavailable',ocrStatus:'Screen reader off'};
  for(const match of matches)match.title='Direct Strike';
  library.ownAccountGroups[0].profiles=players.slice();
  const opponents=matches[0].players.slice(1).map((player,index)=>({...player,name:['Vanea','BlackJoker','aumka','Kthulhu','BlueMage'][index],region:'EU',aliases:[]}));
  players.push(...opponents);
  for(const [index,player] of opponents.entries()){
   const value=5400-index*700,profileId=String(20000+index);
   ratings[player.id]={eu:{value,profileId,region:'EU',profileName:player.name}};
   siteLookups[player.id]={status:'Ready',profiles:[{profileId,name:player.name,region:'EU',rating:value,discoveredGames:600+index*100,winRate:55+index,lastPlayed:'2026-10-21T20:00:00Z'}]};
   dsstatsLookups[player.id]={status:'Ready',profiles:[{nativeId:player.id,name:player.name,region:'EU',rating:2300-index*120,games:600+index*100,wins:330+index*50}]};
  }
  for(const player of players)player.ratings=ratings[player.id];
  library.marks=[{id:opponents[0].id,name:opponents[0].name,list:'friends',note:''},{id:opponents[1].id,name:opponents[1].name,list:'losers',note:'Sample note: compare player history.'}];
  for(const player of players)player.mark=library.marks.find(mark=>mark.id===player.id);
  for(const match of matches)for(const player of match.players){
   const source=players.find(item=>item.id===player.id);player.name=source.name;player.apm=80;
   player.combat={values:{UnitKills:550,MineralsKilledArmy:40000,CombatDeaths:250,FirstGasSeconds:35,SecondGasSeconds:400}};
   player.result=player.team===match.winner?'Win':'Loss';
  }
  for(const match of matches)match.economy={middleAvailable:true,middleIncomeRate:1,middleIntervals:[{team:1,startSeconds:20,endSeconds:300},{team:2,startSeconds:300,endSeconds:650},{team:1,startSeconds:650,endSeconds:match.seconds}],players:match.players.map(p=>({id:p.id,gasTimes:[30,300],middleHeldSeconds:p.team===1?630:350,estimatedMiddleMinerals:p.team===1?630:350}))};
  library.combatGames=matches.length;library.combatTotal=matches.length;
  Object.assign(lobby,{phase:'pregame',source:'screen',region:'EU',observedAt:new Date().toISOString(),rosterUpdatedAt:new Date().toISOString(),roster:matches[0].players.map(p=>p.name),rosterEntries:matches[0].players.map(p=>({name:p.name,team:p.team,nameOnly:false,candidates:[{id:p.id,name:p.name,nameOnly:false,marked:!!library.marks.find(m=>m.id===p.id)}]}))});

for(const v of Object.values(library.dsstatsLookups))for(const p of v.profiles||[])Object.assign(p,{consistency:.5,confidence:.5,ratingStateVersion:1});
return {library,lobby};
};
