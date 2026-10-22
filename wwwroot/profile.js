'use strict';

// Rows belong to one selected player or an explicitly linked regional group.
// The caller filters the library to regular 3v3 Commanders matches.
function buildPlayerShowcase(rows) {
 const bestMinimum = 5;
 const summary = {total:0,wins:0,losses:0,unknown:0,winRate:null,mostPlayed:null,lastPlayed:null,bestPlayed:[],bestMinimum};
 const commanders = new Map(), seen = new Set();
 const timestamp = item => {
  const value = Date.parse(item.lastSeen);
  return Number.isFinite(value) ? value : -Infinity;
 };
 const recentFirst = (a,b) => {
  const aTime = timestamp(a), bTime = timestamp(b);
  return (aTime===bTime ? 0 : aTime>bTime ? -1 : 1) || a.commander.localeCompare(b.commander);
 };
 for (const {match,player} of rows) {
  // A missing hash is not evidence that two different games are duplicates.
  if (match.hash) {
   if (seen.has(match.hash)) continue;
   seen.add(match.hash);
  }
  summary.total++;
  const result = playerOutcome(match,player);
  const outcome = result===true ? 'wins' : result===false ? 'losses' : 'unknown';
  summary[outcome]++;
  const commander = player.commander;
  if (!commanderPortraits.has(commander)) continue;
  let item = commanders.get(commander);
  if (!item) {
   item = {commander,games:0,wins:0,losses:0,unknown:0,decided:0,winRate:null,lastSeen:match.time,share:0};
   commanders.set(commander,item);
  }
  item.games++;
  item[outcome]++;
  const candidate = {commander,lastSeen:match.time};
  if (timestamp(candidate)>timestamp(item)) item.lastSeen = match.time;
 }
 const decided = summary.wins+summary.losses;
 summary.winRate = decided ? 100*summary.wins/decided : null;
 const items = [...commanders.values()];
 for (const item of items) {
  item.decided = item.wins+item.losses;
  item.winRate = item.decided ? 100*item.wins/item.decided : null;
  item.share = 100*item.games/summary.total;
 }
 // Sorting is bounded by the eighteen recognized commanders, not replay count.
 summary.mostPlayed = [...items].sort((a,b)=>b.games-a.games || recentFirst(a,b))[0] || null;
 summary.lastPlayed = [...items].sort(recentFirst)[0] || null;
 summary.bestPlayed = items.filter(item=>item.decided>=bestMinimum)
  .sort((a,b)=>b.winRate-a.winRate || b.decided-a.decided || recentFirst(a,b)).slice(0,3);
 return summary;
}
