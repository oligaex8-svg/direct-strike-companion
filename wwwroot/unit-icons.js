'use strict';
// Tracker names are looked up exactly; an absent or failed asset keeps the neutral silhouette.
const failedUnitIcons=new Set();
function unitIcon(name,size='small'){
 const catalog=window.sc2UnitIcons,raw=typeof name==='string'?name:'',path=catalog&&Object.prototype.hasOwnProperty.call(catalog,raw)?catalog[raw]:null;
 const source=!/^(unknown|other)$/i.test(raw.trim())&&typeof path==='string'&&/^\/images\/units\/[a-z0-9_.-]+\.png$/i.test(path)&&!failedUnitIcons.has(path)?path:null;
 const image=source?`<img src="${esc(source)}" alt="" loading="lazy" decoding="async">`:'';
 return `<span class="unit-icon${size==='large'?' unit-icon-large':''}" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M16 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-9 20c.5-5.1 3.8-8 9-8s8.5 2.9 9 8l-2 2H9Z"/></svg>${image}</span>`;
}
function unitBadge(name,size='small'){
 return `<span class="unit-badge">${unitIcon(name,size)}<span data-i18n-skip>${esc(impactUnitLabel(name))}</span></span>`;
}
document.addEventListener('error',event=>{
 const image=event.target;if(!image?.matches?.('.unit-icon img'))return;
 const path=image.getAttribute('src');if(path)failedUnitIcons.add(path);image.remove();
},true);
