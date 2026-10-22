const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname,'..');
const context = vm.createContext({esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/commanders.js'),'utf8'),context);
const run = code => vm.runInContext(code,context);
const results = [];
function check(name, body) { body(); results.push(`PASS: ${name}`); }
function match(day, players) { return {time:`2026-10-${day}T10:00:00Z`,players}; }

context.matches = [
 match('01',[{id:'2-S2-1-1',name:'SameName',commander:'Tychus'},{id:'1-S2-1-1',name:'SameName',commander:'Raynor'}]),
 match('03',[{id:'2-S2-1-1',name:'SameName',commander:'Nova'},{id:'1-S2-1-1',name:'SameName',commander:'Swann'}]),
 match('02',[{id:'2-S2-1-1',name:'SameName',commander:'Tychus'},{id:'1-S2-1-1',name:'SameName',commander:'Raynor'}])
];
check('Favourite is chosen by game count, rather than the last commander',()=>{
 assert.equal(run("buildCommanderProfiles(matches).get('2-S2-1-1').mostPlayed.commander"),'Tychus');
 assert.equal(run("buildCommanderProfiles(matches).get('2-S2-1-1').mostPlayed.games"),2);
 assert.equal(run("buildCommanderProfiles(matches).get('2-S2-1-1').total"),3);
});
check('Same-named players on different servers keep separate favourites',()=>{
 assert.equal(run('buildCommanderProfiles(matches).size'),2);
 assert.equal(run("buildCommanderProfiles(matches).get('1-S2-1-1').mostPlayed.commander"),'Raynor');
});
check('A tied favourite uses the most recent commander even with unordered replays',()=>{
 assert.equal(run("buildCommanderProfiles(matches.slice(0,2)).get('2-S2-1-1').mostPlayed.commander"),'Nova');
});
check('Missing commander and missing replay data have safe fallbacks',()=>{
 assert.equal(run('buildCommanderProfiles([]).size'),0);
 assert.equal(run("buildCommanderProfiles([{time:'2026-10-01',players:[{id:'missing',commander:''}]}]).get('missing').mostPlayed.commander"),'Unknown');
 assert.match(run("commanderBadge('Terran')"),/commander-portrait-unknown/);
 assert.doesNotMatch(run("commanderBadge('Terran')"),/<img/);
});
check('Han & Horner uses the parser identity and preserves the combined display name',()=>{
 assert.match(run("commanderBadge('Horner')"),/\/images\/commanders\/horner\.png/);
 assert.match(run("commanderBadge('Horner')"),/Han &amp; Horner/);
});
check('Commander names are escaped and cannot inject image paths or markup',()=>{
 const html = run("commanderBadge('<img src=x onerror=alert(1)>')");
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
});
check('Every known commander resolves to a packaged 50x50 PNG',()=>{
 const files = Array.from(run('commanderPortraits.values()'));
 assert.equal(files.length,18);
 assert.equal(new Set(files).size,18);
 for (const file of files) {
  const image = fs.readFileSync(path.join(root,'wwwroot/images/commanders',file+'.png'));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),50);
  assert.equal(image.readUInt32BE(20),50);
 }
});
fs.writeFileSync(path.join(__dirname,'commander-profile-tests.json'),JSON.stringify({success:true,checkedAt:new Date().toISOString(),results},null,2)+'\n');
process.stdout.write(results.join('\n')+'\n');
