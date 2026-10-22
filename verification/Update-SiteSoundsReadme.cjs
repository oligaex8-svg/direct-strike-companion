'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../README.md');let source=fs.readFileSync(file,'utf8');
const replacements=[
 ['Last/most-played commander refers to **your imported library**, not the player’s complete online history.','Profile last/most-played commander refers to **your imported library**. Live lobby and pick advice also use bounded cached site history, rather than claiming a player’s complete online history.'],
 ['the three latest imported games','the three latest replay/site games'],
 ['three all-library favourite commanders with recent pick-frequency estimates','three favourite commanders from available replay/site history with recent pick-frequency estimates'],
 ['Unresolved screen names stay local and do not trigger public-name site searches.','Unknown visible-screen names also trigger the requested public-name search on ds-rating.com. A site name match remains unconfirmed; no Battle.net ID is invented.'],
 ["counts that player's decided results in your imported 3v3 Commanders replays","counts that player's decided results in available 3v3 Commanders replay/site history"],
 ["These are local replay samples, not a site's complete account history.",'Local and site samples are combined conservatively; they are not the site’s complete account history.'],
 ['DirectStrikeCompanion-2026-10-07-lobby-teams-portable.zip','DirectStrikeCompanion-2026-10-07-site-sounds-portable.zip'],
 ['All 533 archive entries','All 536 archive entries'],
 ['(68.1 MB)','(68.2 MB)'],
 ['This changes the application packaging, not its features. ',''],
 ['verification/lobby-teams-archive.json','verification/site-sounds-archive.json'],
 ['verification/lobby-teams-defender.json','verification/site-sounds-defender.json'],
 ['the lobby-teams ZIP for the current features','the site-sounds ZIP for the current features']
];
for(const [old,value] of replacements)source=source.replaceAll(old,value);
const resume=`## Resume — 7 October 2026

Status: game-transition sound options and online lobby identities/history are shipped. Acceptance: independent persistent loading/loaded toggles; regional site identities kept separate; site games contribute to compact hero history, pick estimates and supported counterpick samples without duplicate replay observations. Prior team/account/Friends/economy work remains implemented; [earlier milestone evidence](verification/lobby-teams-release.json) is retained.

Changed owners: GameSounds.cs/LobbyService.cs consume fresh transitions; Program.cs dispatches native sounds and strict sound/candidate routes. SiteSyncService.cs/SiteHistory.cs cache bounded public history and complete own-profile games. Models.cs exposes caches. site-history.js merges sources and excludes conflicting own identities; lobby.js/site-data.js wire candidate selection and automatic requests. picks-view.js/app.js include online evidence; ru-ui.js translates controls.

Checks: [304 standalone](verification/self-tests-site-sounds-standalone.json) and [304 portable assertions](verification/self-tests-site-sounds-portable.json) passed. [16 source/dedup checks](verification/site-history-ui-tests.json), [seven sound controls](verification/lobby-sound-ui-tests.json), [34 lookup checks](verification/automatic-site-ui-tests.json), and existing pick/hover/team/language checks passed. [Browser evidence](verification/site-sounds-browser.json) verifies persistence, EN/RU and real online histories (efen 66; selected Plumtch 63 games). [Runtime assets](verification/site-sounds-release.json), [private-field preservation](verification/site-sounds-private-checks.json), [536 package entries](verification/site-sounds-archive.json) and [targeted Defender scans](verification/site-sounds-defender.json) passed. Review’s three identity/dedup defects were fixed.

Unresolved: next real loading/loaded audibility, native pregame capture/marked alerts and Discord acceptance remain unverified. Site names cannot prove Battle.net identity; habits/combat stay replay-based. Next bounded step, already authorized: observe the next visible pregame-to-match transition and sound delivery without interrupting SC2.
`;
const position=source.indexOf('## Resume —');if(position<0)throw Error('Resume section missing');source=source.slice(0,position)+resume;
fs.writeFileSync(file,source);
