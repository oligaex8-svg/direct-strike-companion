'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baselinePath=path.join(__dirname,'site-sounds-private-baseline.json');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const settings=value=>({...value,pingOnGameLoading:value.pingOnGameLoading??false,pingOnGameLoaded:value.pingOnGameLoaded??false});
if(process.argv.includes('--normalize-baseline')){
 const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8').replace(/^\uFEFF/,''));
 fs.writeFileSync(baselinePath,JSON.stringify({matches:baseline.Matches,marks:hash(baseline.Marks),settings:hash(settings(baseline.Settings)),regionalLinks:hash(baseline.RegionalProfileLinks)},null,2)+'\n');
 console.log('Baseline normalized to hashes only.');
}else{
 const library=JSON.parse(fs.readFileSync(path.join(root,'data/library.json'),'utf8'));
 const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 const links=Object.entries(library.regionalRatings).map(([id,value])=>({Id:id,Eu:value.eu?.profileId??null,Americas:value.americas?.profileId??null}));
 const checks={marksPreserved:hash(library.marks)===baseline.marks,settingsPreserved:hash(settings(library.settings))===baseline.settings,regionalProfileLinksPreserved:hash(links)===baseline.regionalLinks,siteHistories:Object.keys(library.siteHistories||{}).length,siteGames:Object.keys(library.siteGames||{}).length,matchesBefore:baseline.matches,matchesNow:library.matches.length};
 fs.writeFileSync(path.join(__dirname,'site-sounds-private-checks.json'),JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
 if(!checks.marksPreserved||!checks.settingsPreserved||!checks.regionalProfileLinksPreserved)process.exitCode=1;
}
