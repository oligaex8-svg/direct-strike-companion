'use strict';

// Approximation from current exact-native Commanders ratings/state, never site history.
// Missing state uses K168 * neutral consistency .75 * equal-confidence .5 = K63.
// Assumes no departures; combat Impact%, DSR and profile-name matches are irrelevant.
function dsstatsReplayChanges(match,ratingsById,statesById){
 const changes=new Map(),players=match?.players;
 if(!Array.isArray(players))return changes;
 for(const player of players){if(typeof player?.id==='string')changes.set(player.id,{delta:null,status:'unsupported'});}
 const nativeParts=id=>{
  const parts=/^([12])-S2-([1-9]\d*)-([1-9]\d*)$/.exec(id||'');
  const within=(value,maximum)=>value.length<maximum.length||(value.length===maximum.length&&value<=maximum);
  return parts&&within(parts[2],'2147483647')&&within(parts[3],'9223372036854775807')?parts:null;
 };
 if(match.mode!=='Commanders'||players.length!==6||changes.size!==6
  ||players.some(player=>typeof player?.id!=='string'||!nativeParts(player.id))
  ||(match.winner!==1&&match.winner!==2))return changes;
 const region=nativeParts(players[0].id)[1];
 const teams=[players.filter(player=>player.team===1),players.filter(player=>player.team===2)];
 if(teams.some(team=>team.length!==3)||players.some(player=>nativeParts(player.id)[1]!==region))return changes;
 const unavailable=(status,extra={})=>{
  for(const player of players)changes.set(player.id,{delta:null,status,...extra});
  return changes;
 };
 // A recorded Loss on the winning team may be a leaver. That affects both teams.
 if(players.some(player=>player.result!==undefined
  &&(player.result!==(player.team===match.winner?'Win':'Loss'))))return unavailable('unsupported-result');
 const ratings=players.map(player=>ratingsById?.get?.(player.id));
 const missingRatings=ratings.filter(value=>typeof value!=='number'||!Number.isFinite(value)).length;
 if(missingRatings)return unavailable('missing-ratings',{missingRatings});
 // Normalize before averaging to keep both same-sign sums and opposing extremes finite.
 const scale=Math.max(...ratings.map(Math.abs));
 const mean=team=>scale===0?0:team.reduce((sum,player)=>sum+ratings[players.indexOf(player)]/scale,0)/3;
 const exponent=(mean(teams[1])-mean(teams[0]))*(scale/800);
 const probability=power=>{
  if(power>=0){const inverse=10**(-power);return inverse/(1+inverse);}
  return 1/(1+10**power);
 };
 const expected=[probability(exponent),probability(-exponent)];
 // The winner's complementary probability avoids cancellation for strong favourites.
 const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
 const states=players.map(player=>statesById?.get?.(player.id));
 const hasState=states.every(state=>valid(state?.consistency)&&valid(state?.confidence));
 const basis=hasState?'site-state':'baseline';
 const confidenceFactor=value=>1/(Math.sqrt(2*Math.PI)*(1.4-value));
 const teamConfidence=hasState?teams.map(team=>team.reduce((sum,player)=>sum+states[players.indexOf(player)].confidence,0)/3):[];
 const reward=168*expected[match.winner===1?1:0];
 for(const [index,player] of players.entries()){
  const state=states[index];
  const impact=hasState?(1-.5*state.consistency)*(.5*(1-confidenceFactor(state.confidence))+.5*confidenceFactor(teamConfidence[player.team-1])):.375;
  const delta=reward*impact;
  changes.set(player.id,{delta:player.team===match.winner?delta:-delta,status:'ready',expectedWin:expected[player.team-1],basis});
 }
 return changes;
}
