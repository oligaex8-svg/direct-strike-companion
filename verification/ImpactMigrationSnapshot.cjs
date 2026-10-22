'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const install=path.resolve(__dirname,'../../..'),file=path.join(install,'data/library.json'),data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const eligible=match=>match.mode==='Commanders'&&match.players?.length===6&&[1,2].every(team=>match.players.filter(player=>player.team===team).length===3);
const identity=match=>({hash:match.hash,title:match.title,mode:match.mode,time:match.time,seconds:match.seconds,winner:match.winner,players:match.players.map(player=>({id:player.id,name:player.name,clanTag:player.clanTag,team:player.team,commander:player.commander,result:player.result}))});
const bindings=ratings=>Object.fromEntries(Object.entries(ratings||{}).map(([key,rating])=>[key,{profileId:rating.profileId,region:rating.region,mode:rating.mode,url:rating.url}]));
const snapshot={at:new Date().toISOString(),matches:data.matches.length,eligible:data.matches.filter(eligible).length,
 upgraded:data.matches.filter(match=>eligible(match)&&match.statsVersion>=2).length,marksDigest:digest(data.marks),settingsDigest:digest(data.settings),bindingsDigest:digest(bindings(data.regionalRatings)),
 originals:Object.fromEntries(data.matches.map(match=>[match.hash,digest(identity(match))])),
 files:Object.fromEntries(data.matches.filter(match=>fs.existsSync(match.path)).map(match=>[match.path,fs.statSync(match.path).mtimeMs]))};
const beforeFile=path.join(__dirname,'impact-migration-before.json');
if(process.argv[2]==='before'){
 if(fs.existsSync(beforeFile))throw Error('Existing migration baseline must be preserved');
 fs.writeFileSync(beforeFile,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({matches:snapshot.matches,eligible:snapshot.eligible,upgraded:snapshot.upgraded,availableFiles:Object.keys(snapshot.files).length}));
}else{
 const before=JSON.parse(fs.readFileSync(beforeFile,'utf8')),remaining=data.matches.filter(match=>eligible(match)&&match.statsVersion<2);
 const report={success:remaining.length===0,checkedAt:snapshot.at,originalMatches:before.matches,totalMatches:snapshot.matches,eligible:snapshot.eligible,upgraded:snapshot.upgraded,
  originalIdentitiesAndResultsPreserved:Object.entries(before.originals).every(([hash,expected])=>snapshot.originals[hash]===expected),
  marksPreserved:before.marksDigest===snapshot.marksDigest,settingsPreserved:before.settingsDigest===snapshot.settingsDigest,regionalBindingsPreserved:before.bindingsDigest===snapshot.bindingsDigest,
  originalReplayFilesUntouched:Object.entries(before.files).every(([name,mtime])=>fs.existsSync(name)&&fs.statSync(name).mtimeMs===mtime),
  detailedPlayers:data.matches.filter(eligible).flatMap(match=>match.players).filter(player=>player.combat?.impact?.version===1).length,
  remaining:remaining.map(match=>({hash:match.hash,fileAvailable:fs.existsSync(match.path)}))};
 report.success&&=report.originalIdentitiesAndResultsPreserved&&report.marksPreserved&&report.regionalBindingsPreserved&&report.originalReplayFilesUntouched;
 fs.writeFileSync(path.join(__dirname,'impact-migration-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
