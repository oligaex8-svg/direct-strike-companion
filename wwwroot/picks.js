'use strict';

// Replay-only estimates. The caller selects one stable player identity for history.
// Unknown choices remain in the history denominator; names never link identities.
function buildPickHistory(rows,limit=30) {
 const summary = {total:0,known:0,unknown:0,lastSeen:null,items:[]};
 const maximum = Number.isFinite(limit) ? Math.min(30,Math.max(0,Math.floor(limit))) : 30;
 if (!Array.isArray(rows) || !maximum) return summary;
 const timestamp = value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
 };
 const ordered = rows.filter(row=>row?.match && typeof row.match==='object' && row.player && typeof row.player==='object')
  .map((row,position)=>({row,position,time:timestamp(row.match.time)}))
  .sort((a,b)=>(a.time===b.time ? 0 : a.time>b.time ? -1 : 1) || a.position-b.position);
 const seen = new Set(), counts = new Map();
 for (const {row,time} of ordered) {
  const {match,player} = row, key = pickMatchKey(match);
  if (seen.has(key)) continue;
  seen.add(key);
  if (!summary.total) summary.lastSeen = match.time ?? null;
  summary.total++;
  if (commanderPortraits.has(player.commander)) {
   summary.known++;
   let item = counts.get(player.commander);
   if (!item) {
    item = {commander:player.commander,games:0,time};
    counts.set(player.commander,item);
   }
   item.games++;
  } else summary.unknown++;
  if (summary.total===maximum) break;
 }
 summary.items = [...counts.values()]
  .sort((a,b)=>b.games-a.games || (a.time===b.time ? 0 : a.time>b.time ? -1 : 1) || a.commander.localeCompare(b.commander))
  .map(({commander,games})=>({commander,games,probability:100*games/summary.total}));
 return summary;
}

// Nonempty hashes identify replays; unhashed replays deduplicate only by identity.
function pickMatchKey(match) {
 return typeof match.hash==='string' && match.hash.trim() ? match.hash : match;
}

function pickEligibleMatch(match) {
 if (!match || match.mode!=='Commanders' || !Array.isArray(match.players) || match.players.length!==6) return false;
 const teams = new Map();
 for (const player of match.players) {
  if (!player || !Number.isInteger(player.team) || player.team<=0) return false;
  teams.set(player.team,(teams.get(player.team)||0)+1);
 }
 return teams.size===2 && [...teams.values()].every(count=>count===3);
}

// Index contract: commanders maps all recognized choices to decided overall games
// and pairs. Each pair stores a Set of unique match keys for union support.
// info counts accepted games and why other inputs could not contribute evidence.
function buildPickMatchups(matches,selfIds) {
 const commanders = new Map([...commanderPortraits.keys()].map(commander=>
  [commander,{commander,games:0,wins:0,losses:0,pairs:new Map()}]));
 const info = {input:0,eligible:0,duplicates:0,noSelf:0,conflictingSelf:0,unknownOutcome:0,invalidSelfCommander:0,accepted:0,unknownEnemies:0};
 const index = {commanders,info};
 if (!Array.isArray(matches)) return index;
 const ownIds = new Set((Array.isArray(selfIds) ? selfIds : []).filter(id=>typeof id==='string' && id.trim()));
 const seen = new Set();
 for (const match of matches) {
  info.input++;
  if (!pickEligibleMatch(match)) continue;
  info.eligible++;
  const key = pickMatchKey(match);
  if (seen.has(key)) {info.duplicates++;continue;}
  seen.add(key);
  const selected = match.players.filter(player=>ownIds.has(player.id));
  if (!selected.length) {info.noSelf++;continue;}
  if (selected.length!==1) {info.conflictingSelf++;continue;}
  const own = selected[0], candidate = commanders.get(own.commander);
  if (!candidate) {info.invalidSelfCommander++;continue;}
  const outcome = playerOutcome(match,own);
  if (outcome!==true && outcome!==false) {info.unknownOutcome++;continue;}
  const result = outcome ? 'wins' : 'losses';
  candidate.games++;
  candidate[result]++;
  info.accepted++;
  const enemies = new Set();
  for (const enemy of match.players) {
   if (enemy.team===own.team) continue;
   if (commanderPortraits.has(enemy.commander)) enemies.add(enemy.commander);
   else info.unknownEnemies++;
  }
  for (const enemyCommander of enemies) {
   let pair = candidate.pairs.get(enemyCommander);
   if (!pair) {
    pair = {games:0,wins:0,losses:0,matchKeys:new Set()};
    candidate.pairs.set(enemyCommander,pair);
   }
   pair.games++;
   pair[result]++;
   pair.matchKeys.add(key);
  }
 }
 return index;
}

// Historical team-outcome score, not a causal 1v1 counter or future win chance.
// Pair rates shrink toward that candidate's own baseline using five prior games.
function rankCounterPicks(index,distribution) {
 if (!index?.commanders || typeof index.commanders.get!=='function' || !Array.isArray(distribution)) return [];
 const weights = new Map();
 for (const item of distribution) {
  if (!item || !commanderPortraits.has(item.commander) || !Number.isFinite(item.probability) || item.probability<=0) continue;
  weights.set(item.commander,(weights.get(item.commander)||0)+item.probability);
 }
 const totalWeight = [...weights.values()].reduce((sum,weight)=>sum+weight,0);
 if (!totalWeight || !Number.isFinite(totalWeight)) return [];
 const recommendations = [];
 for (const commander of commanderPortraits.keys()) {
  const candidate = index.commanders.get(commander);
  if (!candidate || !Number.isFinite(candidate.games) || candidate.games<5 || !candidate.pairs || typeof candidate.pairs.get!=='function') continue;
  const overallWinFraction = candidate.wins/candidate.games;
  if (!Number.isFinite(overallWinFraction)) continue;
  let coveredWeight = 0, weightedRate = 0;
  const matchKeys = new Set(), evidence = [];
  // Iterating recognized names keeps evidence and floating-point summation stable.
  for (const enemyCommander of commanderPortraits.keys()) {
   const weight = weights.get(enemyCommander), pair = candidate.pairs.get(enemyCommander);
   if (!weight || !pair || !Number.isFinite(pair.games) || pair.games<5 || !pair.matchKeys || typeof pair.matchKeys[Symbol.iterator]!=='function') continue;
   const winRate = 100*pair.wins/pair.games;
   const adjustedWinRate = 100*(pair.wins+5*overallWinFraction)/(pair.games+5);
   if (!Number.isFinite(adjustedWinRate) || !Number.isFinite(winRate)) continue;
   coveredWeight += weight;
   weightedRate += weight*adjustedWinRate;
   for (const key of pair.matchKeys) matchKeys.add(key);
   evidence.push({enemyCommander,games:pair.games,wins:pair.wins,losses:pair.losses,winRate,weight,adjustedWinRate});
  }
  const coverage = 100*coveredWeight/totalWeight, support = matchKeys.size;
  if (coverage<60 || support<5) continue;
  recommendations.push({commander,score:weightedRate/coveredWeight,coverage,support,
   wins:candidate.wins,losses:candidate.losses,games:candidate.games,overallWinRate:100*overallWinFraction,evidence});
 }
 return recommendations.sort((a,b)=>b.score-a.score || b.support-a.support || b.games-a.games || a.commander.localeCompare(b.commander)).slice(0,3);
}
