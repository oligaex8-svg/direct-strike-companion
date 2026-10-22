'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(ordered(x))).digest('hex');
async function main(){
 const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'clan-invariants-before.json'),'utf8'));
 const data=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
 const matches=data.matches.map(({clanVersion,...match})=>({...match,players:match.players.map(({clanTag,...player})=>player)}));
 const {autoAcceptMatch,autoPickCommander,...oldSettings}=data.settings;
 const invariants={matches:data.matches.length,matchesHash:hash(matches),settingsHash:hash(oldSettings),marksHash:hash(data.marks),zipHash:hash(fs.readFileSync(path.join(root,'share/DirectStrikeCompanion-2026-10-07-hover-teams-portable.zip')))};
 assert.deepEqual(invariants,prior,'Existing matches, settings, private marks and prior ZIP must survive');
 assert.equal(autoAcceptMatch,false);assert.equal(autoPickCommander,'');
 const friendlyHash=hash(fs.readFileSync(path.join(root,'Direct Strike Companion.exe'))),releaseHash=hash(fs.readFileSync(path.join(root,'release/DirectStrikeCompanion.exe')));
 assert.equal(friendlyHash,releaseHash,'Delivered EXE must match the checked release');
 const url=fs.readFileSync(path.join(root,'data/running-url.txt'),'utf8').trim();
 const read=async(relative)=>{const start=performance.now(),response=await fetch(new URL(relative,url+'/'),{headers:{'X-DS-Companion':'1'}});assert.equal(response.status,200);const text=await response.text();return {text,bytes:Buffer.byteLength(text),milliseconds:performance.now()-start};};
 const full=await read('api/state'),state=JSON.parse(full.text);
 assert.equal(state.library.matches.length,536);assert.ok(state.libraryVersion);assert.equal(state.busy,false,'Read only after enrichment finishes');
 const changes=Object.values(state.library.ratingChanges).flat();
 assert.ok(changes.length>0);assert.ok(changes.every(change=>['estimated','unavailable'].includes(change.kind)),'Generic main DSR changes must not appear beside Commanders ratings');
 assert.ok(state.lobby.automation);assert.equal(state.library.settings.autoAcceptMatch,false);assert.equal(state.library.settings.autoPickCommander,'');
 const unchanged=await read('api/state?libraryVersion='+encodeURIComponent(state.libraryVersion)),conditional=JSON.parse(unchanged.text);
 assert.equal(conditional.libraryVersion,state.libraryVersion);assert.equal(conditional.library,null);
 const assets=[];
 for(const file of ['index.html','app.js','player-names.js','sc2-automation.js','picks-view.js','picks.css','players-view.js','site-data.js','ru-ui.js']){
  const served=await read(file);assert.equal(hash(served.text),hash(fs.readFileSync(path.join(root,'wwwroot',file))));assets.push(file);
 }
 const clans={enrichedMatches:data.matches.filter(m=>m.clanVersion>=1).length,playersWithClan:data.matches.flatMap(m=>m.players).filter(p=>p.clanTag).length,unavailable:data.matches.flatMap(m=>m.players).filter(p=>p.clanTag===null||p.clanTag===undefined).length};
 const report={success:true,invariants,clans,standaloneHash:friendlyHash,bundledAssets:assets,modeChanges:{estimated:changes.filter(c=>c.kind==='estimated').length,unavailable:changes.filter(c=>c.kind==='unavailable').length,confirmed:0},shortcutsDefaultOff:true,runtime:{url,full:{bytes:full.bytes,milliseconds:full.milliseconds},unchanged:{bytes:unchanged.bytes,milliseconds:unchanged.milliseconds}},limitations:['Synthetic performance probe does not measure the friend PC or decode 4,000 real replays.','Actual SC2 acceptance popup and commander selection layout are not verified; no live clicks were attempted.']};
 fs.writeFileSync(path.join(__dirname,'clan-library-release.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
