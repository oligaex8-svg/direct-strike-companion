'use strict';

const commanderPortraits = new Map([
 ['Raynor','raynor'], ['Kerrigan','kerrigan'], ['Artanis','artanis'],
 ['Swann','swann'], ['Zagara','zagara'], ['Vorazun','vorazun'],
 ['Karax','karax'], ['Abathur','abathur'], ['Alarak','alarak'],
 ['Nova','nova'], ['Stukov','stukov'], ['Fenix','fenix'],
 ['Dehaka','dehaka'], ['Horner','horner'], ['Tychus','tychus'],
 ['Zeratul','zeratul'], ['Stetmann','stetmann'], ['Mengsk','mengsk']
]);

function commanderName(commander) {
 if(typeof interfaceLanguage==='string'&&interfaceLanguage==='ru'&&typeof RU_COMMANDERS!=='undefined'&&RU_COMMANDERS[commander])return RU_COMMANDERS[commander];
 return commander === 'Horner' ? 'Han & Horner' : commander || 'Unknown';
}

// The adjacent commander name labels the portrait for screen readers.
function commanderPortrait(commander, size='small') {
 const file = commanderPortraits.get(commander);
 const className = `commander-portrait commander-portrait-${size}`;
 return file
  ? `<img class="${className}" src="/images/commanders/${file}.png" width="50" height="50" alt="" loading="lazy" decoding="async">`
  : `<span class="${className} commander-portrait-unknown" aria-hidden="true">?</span>`;
}

function commanderBadge(commander, size='small') {
 return `<span class="commander-badge">${commanderPortrait(commander,size)}<span>${esc(commanderName(commander))}</span></span>`;
}

// Input is the same filtered 3v3 Commanders library used by the player profile.
// Tied favourites use the commander played most recently.
function buildCommanderProfiles(matches) {
 const profiles = new Map();
 const latestFirst = [...matches].sort((a,b)=>new Date(b.time)-new Date(a.time));
 for (const match of latestFirst) {
  for (const player of match.players) {
   let profile = profiles.get(player.id);
   if (!profile) {
    profile = {total:0, counts:new Map(), mostPlayed:null};
    profiles.set(player.id,profile);
   }
   const commander = player.commander || 'Unknown';
   profile.total++;
   profile.counts.set(commander,(profile.counts.get(commander)||0)+1);
  }
 }
 for (const profile of profiles.values()) {
  for (const [commander,games] of profile.counts) {
   if (!profile.mostPlayed || games > profile.mostPlayed.games) {
    profile.mostPlayed = {commander,games};
   }
  }
 }
 return profiles;
}
