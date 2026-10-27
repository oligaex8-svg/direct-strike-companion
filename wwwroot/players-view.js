'use strict';

const PLAYERS_PER_PAGE=50;
let playerPage=1;

function playerDirectoryPage(players,page=playerPage){
 const pages=Math.max(1,Math.ceil(players.length/PLAYERS_PER_PAGE));
 const current=Math.max(1,Math.min(Number.isFinite(page)?Math.floor(page):1,pages));
 const start=(current-1)*PLAYERS_PER_PAGE;
 return {current,pages,start,total:players.length,rows:players.slice(start,start+PLAYERS_PER_PAGE)};
}

function renderPlayerDirectory(players){
 if(!players.length)return empty(state.busy?'Reading your replays…':'No players found',state.busy?'Your results will appear as each replay is analysed.':'Scan your replay folders, or change the search and filters.');
 const page=playerDirectoryPage(players);playerPage=page.current;
 const pager=location=>`<div class="directory-pager" data-directory-pager="${location}"><span${location==='top'?' role="status"':''}><span>Players shown</span>: <strong>${num(page.start+1)}–${num(page.start+page.rows.length)}</strong> / ${num(page.total)}</span><div aria-label="Player pages"><button type="button" class="filter" data-player-page="${page.current-1}" data-page-action="previous" aria-label="Previous player page"${page.current===1?' disabled':''}>Previous</button><span>${num(page.current)} / ${num(page.pages)}</span><button type="button" class="filter" data-player-page="${page.current+1}" data-page-action="next" aria-label="Next player page"${page.current===page.pages?' disabled':''}>Next</button></div></div>`;
 const rows=page.rows.map(p=>`<tr><td><button class="player-name" data-player="${esc(p.id)}">${esc(displayPlayerName(p.id,p.name))}</button><span class="meta">${p.id.startsWith('2-')?'EU':p.id.startsWith('1-')?'US':'Region '+esc(p.id.split('-')[0])} · ${num(p.encounters)} encounters</span></td><td>${mostPlayedCell(p.id)}</td><td>${statCell(p.against)}</td><td>${statCell(p.together)}</td><td><div class="directory-rating">${ratingCell(p,'EU')}</div></td><td><div class="directory-rating">${ratingCell(p,'Americas')}</div></td><td><button class="mark-button ${p.mark?'marked':''}" data-mark="${esc(p.id)}" data-list="${p.mark?esc(markList(p.mark)):''}">${p.mark?esc(listName(markList(p.mark))):'Add to list'}</button></td></tr>`).join('');
 return `${pager('top')}<div class="table-wrap player-table-scroll" role="region" aria-label="Player directory" tabindex="0"><table class="player-table"><thead><tr><th scope="col">PLAYER</th><th scope="col">MOST PLAYED</th><th scope="col" title="Your win rate against">AGAINST</th><th scope="col" title="Your win rate together">TOGETHER</th><th scope="col">EU RATING</th><th scope="col">AMERICAS RATING</th><th scope="col">LIST</th></tr></thead><tbody>${rows}</tbody></table></div>${pager('bottom')}`;
}

const directorySnapshots=new WeakMap();
function updatePlayerDirectory(content,players,filterKey){
 const previous=content.querySelector('.player-table-scroll'),active=document.activeElement;
 const oldPage=previous?.dataset.page,oldFilter=previous?.dataset.filterKey;
 const focus=content.contains(active)?active.matches('.player-table-scroll')?{table:true}
  :active.dataset.player?{player:active.dataset.player}:active.dataset.mark?{mark:active.dataset.mark}:active.dataset.rating?{rating:active.dataset.rating,region:active.dataset.region}
  :active.dataset.pageAction?{action:active.dataset.pageAction,location:active.closest('.directory-pager').dataset.directoryPager}:null:null;
 const scroll=previous?{top:previous.scrollTop,left:previous.scrollLeft}:null;
 const html=renderPlayerDirectory(players),snapshot=directorySnapshots.get(content);
 if(snapshot?.html===html&&snapshot.filterKey===filterKey&&snapshot.table?.parentNode===content)return;
 content.innerHTML=html;
 const table=content.querySelector('.player-table-scroll');if(!table)return;
 table.dataset.page=String(playerPage);table.dataset.filterKey=filterKey;
 directorySnapshots.set(content,{html,filterKey,table});
 if(scroll){table.scrollLeft=scroll.left;if(oldPage===String(playerPage)&&oldFilter===filterKey)table.scrollTop=scroll.top;}
 if(focus){
  const replacement=focus.table?table:focus.action?content.querySelector(`[data-directory-pager="${focus.location}"] [data-page-action="${focus.action}"]:not(:disabled)`)
   :[...table.querySelectorAll('button')].find(button=>focus.player?button.dataset.player===focus.player:focus.mark?button.dataset.mark===focus.mark:button.dataset.rating===focus.rating&&button.dataset.region===focus.region);
  (replacement||table).focus({preventScroll:true});
 }
}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-player-page]');if(!button||button.disabled)return;
 playerPage=Number(button.dataset.playerPage);renderLibrary();void maintainAutomaticData();
});
