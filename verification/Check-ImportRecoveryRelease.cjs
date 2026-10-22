'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex').toUpperCase();
const before=read('verification/import-recovery-library-hashes-before.json'),release=read('verification/import-recovery-deployment.json'),old=read('verification/import-recovery-invariants-before.json');
const checks=[];function check(name,fn){fn();checks.push(name);}
const verifyPrivate=()=>{const db=read('data/library.json');check('All saved matches, settings and private marks remain unchanged',()=>{assert.equal(hash(db.matches),before.matchHash);assert.equal(hash(db.settings),before.settingsHash);assert.equal(hash(db.marks),before.marksHash);});return db;};
const request=async(endpoint,data)=>{const response=await fetch(release.Url+'/api/'+endpoint,{method:data===undefined?'GET':'POST',headers:{'X-DS-Companion':'1',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(8000)});assert(response.ok);return response.json();};
(async()=>{
 const db=verifyPrivate();check('Delivered executable is the tested release',()=>{assert.equal(fileHash('Direct Strike Companion.exe'),release.NewHash);assert.equal(fileHash('release/DirectStrikeCompanion.exe'),release.NewHash);});
 check('Prior portable ZIP is unchanged',()=>assert.equal(fileHash('share/DirectStrikeCompanion-2026-10-07-hover-teams-portable.zip'),old.ZipHash));
 const state=await request('state');check('Live API opens saved games without stale analysing status',()=>{assert.equal(state.busy,false);assert.equal(state.importProgress.busy,false);assert(state.library.matches.length>0);assert(state.library.players.length>0);assert.equal(db.matches.length,before.matches);});
 const partial=await request('state?libraryVersion='+encodeURIComponent(state.libraryVersion));
 check('Unchanged progress polling retains library and sends only a partial response',()=>{assert.equal(partial.library,null);assert.equal(partial.libraryVersion,state.libraryVersion);assert.equal(partial.importProgress.busy,false);});
 const asset=await fetch(release.Url+'/app.js');assert(asset.ok);const js=await asset.text();
 check('Running EXE serves its new timeout and recovery controls',()=>{assert(js.includes('new AbortController()'));assert(js.includes('Resume analysis'));assert(js.includes("api('import/pause'"));});
 const paused=await request('import/pause',{});check('Live pause endpoint records a durable paused state without hiding saved games',()=>{assert.equal(paused.paused,true);assert.equal(paused.busy,false);assert.equal(paused.phase,'Paused');const progress=read('data/import-state.json');assert.equal(progress.paused,true);});
 const pauseState=await request('state?libraryVersion='+encodeURIComponent(state.libraryVersion));check('Pausing leaves the frozen library intact',()=>{assert.equal(pauseState.library,null);assert.equal(pauseState.importProgress.paused,true);});
 verifyPrivate();
 fs.writeFileSync(path.join(__dirname,'import-recovery-runtime-checks.json'),JSON.stringify({success:true,matches:db.matches.length,visibleGames:state.library.matches.length,players:state.library.players.length,url:release.Url,exeHash:release.NewHash,checks,pauseLeftForBrowserVerification:true},null,2)+'\n');
 console.log(JSON.stringify({success:true,matches:db.matches.length,visibleGames:state.library.matches.length,players:state.library.players.length,checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
