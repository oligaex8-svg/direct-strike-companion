'use strict';

// Own-team hypothetical Win/Loss, using current published commanders_3v3 bases.
// Numerical rules match RatingChanges.cs and verification/ds-main_current.php.
// basisById: Map<id,{value:number|null,games:number|null}>. Games must be
// completed mode games, never a profile's generic total. No forfeit is assumed.
function dsrMainBasis(profile){
 const valid=value=>typeof value==='number'&&Number.isFinite(value);
 const card=profile?.mainRating??profile?.estimatedRating,estimated=valid(card),searched=valid(profile?.searchRating);
 const newer=estimated&&(!searched||(Date.parse(profile.profileChecked)||0)>=(Date.parse(profile.searchChecked)||0));
 return {value:newer?card:searched?profile.searchRating:null,games:newer?(profile?.discoveredGames??profile?.searchGames??null):(profile?.searchGames??profile?.discoveredGames??null)};
}
function dsrProjectedChanges(players,basisById,scope='commanders_3v3'){
 const results=new Map();
 if(!Array.isArray(players))return results;
 const empty=(status,missingRatings=0,mirrorAssumed=true)=>{
  for(const player of players)if(typeof player?.id==='string')results.set(player.id,{win:null,loss:null,status,scope,missingRatings,experienceAssumed:true,mirrorAssumed});
  return results;
 };
 empty('unsupported');
 if(players.length!==6||results.size!==6||players.some(player=>typeof player?.id!=='string'||!player.id.trim()))return results;
 const teams=[players.filter(player=>player.team===1),players.filter(player=>player.team===2)];
 if(teams.some(team=>team.length!==3))return results;
 const bases=players.map(player=>basisById?.get?.(player.id));
 const missingRatings=bases.filter(basis=>basis?.value==null).length;
 const commanders=new Set(['Raynor','Kerrigan','Artanis','Swann','Zagara','Vorazun','Karax','Abathur','Alarak','Nova','Stukov','Fenix','Dehaka','Horner','Tychus','Zeratul','Stetmann','Mengsk']);
 const knownCommanders=players.every(player=>commanders.has(player.commander));
 const mirror=knownCommanders&&teams[0].every((player,index)=>player.commander===teams[1][index].commander);
 if(bases.some(basis=>basis!=null&&(typeof basis!=='object'||(basis.value!=null&&(typeof basis.value!=='number'||!Number.isFinite(basis.value))))))return empty('invalid-basis',missingRatings,!knownCommanders);
 if(missingRatings)return empty('missing-ratings',missingRatings,!knownCommanders);
 const original=bases.map(basis=>basis.value);
 const expanded=original.map(rating=>rating>1000?rating+9000:Math.trunc(rating*10));
 // An otherwise finite input can overflow expansion; never publish NaN/Infinity.
 if(expanded.some(rating=>!Number.isFinite(rating)))return empty('invalid-basis',missingRatings,!knownCommanders);
 const strengths=teams.map(team=>Math.max(...team.map(player=>expanded[players.indexOf(player)])));
 const difference=strengths[0]-strengths[1];
 const lowerReward=Math.floor(100/(1+10**(Math.abs(difference)/4000)));
 const firstReward=difference<0?100-lowerReward:lowerReward;
 const rewards=[firstReward,100-firstReward];
 const compress=rating=>rating>10000?rating-9000:Math.trunc(rating/10);
 for(const [index,player] of players.entries()){
  const games=bases[index]?.games,experienceAssumed=games==null;
  const output={win:null,loss:null,status:'invalid-basis',scope,missingRatings,experienceAssumed,mirrorAssumed:!knownCommanders};
  if(games!=null&&(typeof games!=='number'||!Number.isInteger(games)||games<0)){results.set(player.id,output);continue;}
  const mirrorMultiplier=mirror?2:1;
  const gamesMultiplier=games!=null&&games<25?10.36-.36*(games+1):1;
  const delta=(winner,status)=>{
   const reward=rewards[winner];
   let change=reward*mirrorMultiplier*gamesMultiplier*status;
   if(expanded[index]+change<10000)change=Math.ceil(reward*mirrorMultiplier*gamesMultiplier/10)*10*status;
   return compress(Math.max(10,expanded[index]+Math.trunc(change)))-original[index];
  };
  output.win=delta(player.team-1,1);
  output.loss=delta(2-player.team,-1);
  if(Number.isFinite(output.win)&&Number.isFinite(output.loss))output.status='ready';
  else output.win=output.loss=null;
  results.set(player.id,output);
 }
 return results;
}
