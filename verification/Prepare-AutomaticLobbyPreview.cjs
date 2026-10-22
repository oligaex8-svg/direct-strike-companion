'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const live=read(path.join(__dirname,'lobby-ratings-live-empty-store.json'));
// Inspect only public-source caches. Do not copy settings, notes, marks or replay contents.
const saved=read(path.resolve(root,'../../data/library.json'));
const context=vm.createContext({state:{library:{siteLookups:saved.siteLookups}},document:{addEventListener(){},createElement(){return {innerHTML:'',value:''};}}});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/site-data.js'),'utf8'),context);
const dsRating={};
for(const name of live.names){
 context.requestedName=name;
 const lookup=vm.runInContext("siteLookupForName(requestedName,'EU')",context),key='name:EU:'+name.toLowerCase();
 assert.ok(lookup?.profiles?.length,name+' has saved public DSR evidence');
 dsRating[key]={...lookup,playerId:key,status:'Error: ds-rating.com unavailable; cached results'};
}
assert.equal(live.timings.filter(item=>item.source==='dsstats'&&item.numericRatings>0).length,6);
const fixture={success:true,scope:'Live dsstats ratings and saved ds-rating.com public cache during verified source timeouts',
 networkProbeSuccess:live.success,checkedAt:live.checkedAt,names:live.names,dsRating,dsstats:live.dsstats};
fs.writeFileSync(path.join(__dirname,'automatic-lobby-rating-preview-data.json'),JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify({success:true,networkProbeSuccess:live.success,players:live.names.length,scope:fixture.scope}));
