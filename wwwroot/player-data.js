'use strict';

// The caller supplies eligible matches. Keep replay identity, input order and
// metadata intact; display filtering and sorting belong to the caller.
function buildPlayerEncounterRows(matches,players,selfIds) {
 const ownIds=new Set(selfIds),counts=new Map();
 const empty=()=>({games:0,wins:0,losses:0,unknown:0,winRate:null});
 for (const match of matches) {
  const me=match.players.find(player=>ownIds.has(player.id));
  if (!me) continue;
  const outcome=match.winner>0&&me.team>0 ? match.winner===me.team
   : me.result==='Win' ? true : me.result==='Loss' ? false : null;
  const seen=new Set();
  for (const player of match.players) {
   // Legacy Array.find uses strict equality: NaN cannot match an identity.
   if (player.id!==player.id || seen.has(player.id)) continue;
   seen.add(player.id);
   let row=counts.get(player.id);
   if (!row) {row={against:empty(),together:empty(),encounters:0};counts.set(player.id,row);}
   const stats=player.team===me.team ? row.together : row.against;
   row.encounters++;stats.games++;
   const result=outcome===null?'unknown':outcome?'wins':'losses';
   stats[result]++;
   if(match.source==='site'){
    stats.site??={games:0,wins:0,losses:0,unknown:0};
    stats.site.games++;stats.site[result]++;
   }
  }
 }
 return players.map(player=>{
  const row=counts.get(player.id);
  // Copy stats as well, so duplicate metadata rows do not share mutable totals.
  const finish=stats=>({...stats,...(stats.site?{site:{...stats.site}}:{}),winRate:stats.wins+stats.losses ? 100*stats.wins/(stats.wins+stats.losses) : null});
  return {...player,against:finish(row?.against||empty()),together:finish(row?.together||empty()),encounters:row?.encounters||0};
 });
}

// Teammate-risk comparisons retain their replay-only baseline and sample.
function replayEncounterStats(stats){
 if(!stats?.site)return stats;
 const games=stats.games-stats.site.games,wins=stats.wins-stats.site.wins,losses=stats.losses-stats.site.losses,unknown=stats.unknown-stats.site.unknown;
 return {games,wins,losses,unknown,winRate:wins+losses?100*wins/(wins+losses):null};
}
