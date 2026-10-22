'use strict';

// Custom combat contribution within each team, not a rating or HP-damage metric.
function replayImpactScores(match){
 const scores=new Map(),players=match?.players;
 if(!Array.isArray(players))return scores;
 for(const player of players){if(typeof player?.id==='string')scores.set(player.id,{value:null,status:'unsupported',components:[]});}
 if(players.length!==6||players.some(player=>typeof player?.id!=='string'||!player.id.trim())||scores.size!==6)return scores;
 const teams=[players.filter(player=>player.team===1),players.filter(player=>player.team===2)];
 if(teams.some(team=>team.length!==3))return scores;
 const metrics=[{key:'MineralsKilledArmy',weight:0.75},{key:'UnitKills',weight:0.25}];
 for(const team of teams){
  const channels=metrics.map(metric=>{
   const values=team.map(player=>player.combat?.values?.[metric.key]);
   const complete=values.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0);
   const total=complete?values.reduce((sum,value)=>sum+value,0):null;
   // Scaling also keeps shares finite if unusually large finite inputs overflow their sum.
   const scale=complete?Math.max(...values):0;
   const denominator=scale>0?values.reduce((sum,value)=>sum+value/scale,0):0;
   return{...metric,values,complete,total,scale,denominator};
  });
  const usable=channels.filter(channel=>channel.complete&&channel.total>0);
  const weight=usable.reduce((sum,channel)=>sum+channel.weight,0);
  const status=usable.length?'ready':channels.every(channel=>channel.complete&&channel.total===0)?'no-combat':'missing';
  team.forEach((player,index)=>{
   const components=usable.map(channel=>({key:channel.key,weight:channel.weight/weight,share:(channel.values[index]/channel.scale)/channel.denominator*100,value:channel.values[index],total:channel.total}));
   scores.set(player.id,{value:components.length?components.reduce((sum,component)=>sum+component.weight*component.share,0):null,status,components});
  });
 }
 return scores;
}
