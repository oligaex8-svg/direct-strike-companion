'use strict';
// A separate source and rating scale. Never feeds the ds-rating.com estimates.
function dsstatsNativeRegion(id){return /^2-S2-\d+-\d+$/.test(id||'')?'EU':/^1-S2-\d+-\d+$/.test(id||'')?'Americas':null;}
function dsstatsHasRatingState(profile){return ['consistency','confidence'].every(key=>typeof profile?.[key]==='number'&&Number.isFinite(profile[key])&&profile[key]>=0&&profile[key]<=1);}
function dsstatsLookup(id,name,region){
 const cache=state?.library?.dsstatsLookups||{},nativeRegion=dsstatsNativeRegion(id);
 const key=typeof siteNameKey==='function'?siteNameKey(name,region):'';
 const named=cache[key]||cache[typeof siteNameKey==='function'?siteNameKey(name):'']||null;
 let selected=named;
 if(nativeRegion){
  if(region&&region!==nativeRegion)return null;
  const exact=(named?.profiles||[]).filter(profile=>profile.nativeId===id),native=cache[id];
  // The search payload includes the full native ID; reuse only that exact ID.
  selected=exact.length&&(!native||Date.parse(named.checked)>Date.parse(native.checked))?{...named,profiles:exact}:native||null;
 }
 if(!selected?.profiles?.length)return selected;
 let changed=false;
 const profiles=selected.profiles.map(profile=>{
  if(dsstatsHasRatingState(profile))return profile;
  const native=cache[profile.nativeId],evidence=native?.profiles?.find(other=>other.nativeId===profile.nativeId&&other.region===profile.region&&dsstatsNativeRegion(other.nativeId)===other.region&&dsstatsHasRatingState(other));
  if(!evidence)return profile;
  changed=true;
  return {...profile,consistency:evidence.consistency,confidence:evidence.confidence,stateEvidenceAt:native.checked};
 });
 return changed?{...selected,profiles}:selected;
}
function dsstatsProfileHtml(profile,lookup,detail){
 const numeric=typeof profile.rating==='number'&&Number.isFinite(profile.rating),cached=lookup.status==='Unavailable';
 const winRate=profile.games>0&&profile.wins>=0&&profile.wins<=profile.games?100*profile.wins/profile.games:null;
 const identity=profile.nativeId||'',native=dsstatsNativeRegion(identity);
 // Construct the link from the native identity, never from returned remote HTML.
 const parts=/^([12])-S2-(\d+)-(\d+)$/.exec(identity);
 const url=parts?'https://dsstats.pax77.org/ratings?Rt=2&Player='+parts[3]+'x'+parts[1]+'x'+parts[2]:null;
 const label=`dsstats · ${profile.region||native||''}`;
 const title=[profile.name,identity,'3v3 Commanders · dsstats rating scale',lookup.checked?'Checked '+date(lookup.checked):'',profile.lastPlayed?'Last played '+date(profile.lastPlayed):'',cached?'Cached · source temporarily unavailable':''].filter(Boolean).join(' · ');
 const source=url?`<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`:`<span>${esc(label)}</span>`;
 const summary=[`${num(profile.games)} <span>games</span>`,winRate===null?'':`${Number(winRate.toFixed(1))}% <span>wins</span>`,cached?'<span>Cached</span>':''].filter(Boolean).join(' · ');
 return `<span class="dsstats-profile" title="${esc(title)}"><span class="dsstats-value">${source} <strong>${numeric?num(profile.rating):'Unrated'}</strong></span><span class="dsstats-summary">${summary}</span>${detail?`<span class="dsstats-identity" data-i18n-skip>${esc(profile.name)} · ${esc(identity)}</span>${profile.lastPlayed?`<span class="dsstats-summary"><span>Last played</span> <span data-i18n-skip>${esc(date(profile.lastPlayed))}</span></span>`:''}`:''}</span>`;
}
function dsstatsRating(id,name='',region=null,detail=false){
 if(dsstatsNativeRegion(id)&&region&&region!==dsstatsNativeRegion(id))return '';
 const lookup=dsstatsLookup(id,name,region);
 if(!lookup)return '';
 const profiles=(lookup.profiles||[]).filter(profile=>!region||profile.region===region);
 if(!profiles.length){
  const status=lookup.status==='Unavailable'?'Temporarily unavailable':lookup.status==='Not found'?'Player not found':lookup.status==='Loading'||lookup.status==='Pending'?'Loading…':lookup.status==='Unrated'?'No Commanders rating':lookup.status;
  return `<span class="dsstats-rating dsstats-status">dsstats · <span>${esc(status)}</span></span>`;
 }
 if(!region&&new Set(profiles.map(profile=>profile.region)).size>1)return ['EU','Americas'].map(server=>dsstatsRating(id,name,server,detail)).join('');
 const activity=profile=>Number.isFinite(Date.parse(profile.lastPlayed))?Date.parse(profile.lastPlayed):-Infinity;
 const native=!!dsstatsNativeRegion(id),sorted=[...profiles].sort((a,b)=>activity(b)-activity(a)||b.games-a.games||String(a.nativeId).localeCompare(String(b.nativeId)));
 const primary=sorted[0];
 return `<span class="dsstats-rating${detail?' dsstats-detail':''}">${dsstatsProfileHtml(primary,lookup,detail)}${!native?`<span class="dsstats-summary"><span>Name / region match</span>${sorted.length>1?' · <span>most games</span>':''}</span>`:''}${detail&&sorted.length>1?`<span class="dsstats-alternatives">${sorted.slice(1).map(profile=>dsstatsProfileHtml(profile,lookup,true)).join('')}</span>`:sorted.length>1?`<span class="dsstats-summary">${num(sorted.length-1)} <span>other matching accounts</span></span>`:''}</span>`;
}
