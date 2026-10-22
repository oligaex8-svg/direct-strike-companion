'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const context=vm.createContext({document:{addEventListener(){}},state:{busy:false},num:n=>String(n),
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 empty:(title,copy)=>`${title}: ${copy}`,mostPlayedCell:id=>`portrait-${id}`,statCell:s=>String(s.winRate),ratingCell:()=>'<button data-rating="resolve" data-region="EU">Resolve profile</button>',listName:id=>id,markList:mark=>mark.list,
 sortPlayers:rows=>[...rows].sort((a,b)=>a.name.localeCompare(b.name)),mode:'Commanders',markedOnly:false,query:'',playerRows:[]});
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/player-names.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'wwwroot/players-view.js'),'utf8'),context);
const app=fs.readFileSync(path.join(root,'wwwroot/app.js'),'utf8');
vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('function visiblePlayers(')),context);
const run=code=>vm.runInContext(code,context),check=(name,body)=>{body();checks.push(name);};
context.players=Array.from({length:123},(_,i)=>({id:'2-S2-1-'+i,name:'Player '+String(i).padStart(3,'0'),aliases:['Alias '+i],encounters:1,against:{winRate:50},together:{winRate:null}}));
check('Fifty rows per page cover each player once without mutating the full directory',()=>{
 const before=JSON.stringify(context.players),ids=[];
 for(let i=1;i<=3;i++){context.requested=i;const result=run('playerDirectoryPage(players,requested)');ids.push(...result.rows.map(row=>row.id));assert.equal(result.current,i);assert.equal(result.pages,3);assert.equal(result.rows.length,i===3?23:50);}
 assert.equal(ids.length,123);assert.equal(new Set(ids).size,123);assert.equal(JSON.stringify(context.players),before);
});
check('Removed results and invalid requests clamp to an existing page',()=>{
 for(const requested of [-20,0,1.8,999,NaN,Infinity]){context.requested=requested;const p=run('playerDirectoryPage(players.slice(0,2),requested)');assert.equal(p.current,1);assert.equal(p.rows.length,2);}
 const empty=run('playerDirectoryPage([],999)');assert.equal(empty.current,1);assert.equal(empty.pages,1);assert.equal(empty.rows.length,0);
});
check('Global name and alias search happens before pagination',()=>{
 context.playerRows=context.players;context.query='player 120';assert.equal(run('visiblePlayers()[0].id'),'2-S2-1-120');
 context.query='alias 122';assert.equal(run('visiblePlayers()[0].id'),'2-S2-1-122');context.query='';
});
check('Saved-only and eligible-encounter filters preserve undecided/missing cases',()=>{
 context.playerRows=[{...context.players[0],mark:{list:'friends'}},{...context.players[1],encounters:0},{...context.players[2],aliases:null}];
 assert.equal(run('visiblePlayers().length'),2);context.markedOnly=true;assert.equal(run('visiblePlayers().length'),1);context.markedOnly=false;context.mode='';assert.equal(run('visiblePlayers().length'),3);context.mode='Commanders';
});
check('Rendered page has bounded rows, all column semantics, and honest range/count',()=>{
 run('playerPage=2');const html=run('renderPlayerDirectory(players)');assert.equal((html.match(/<tr>/g)||[]).length,51);assert.ok(html.includes('51–100'));assert.ok(html.includes('/ 123'));assert.equal((html.match(/scope="col"/g)||[]).length,7);assert.ok(html.includes('aria-label="Player directory" tabindex="0"'));assert.equal((html.match(/role="status"/g)||[]).length,1);
});
check('Pagination disables boundaries and retains empty/busy recovery guidance',()=>{
 run('playerPage=1');assert.match(run('renderPlayerDirectory(players)'),/data-page-action="previous"[^>]+ disabled/);
 run('playerPage=3');assert.match(run('renderPlayerDirectory(players)'),/data-page-action="next"[^>]+ disabled/);
 assert.ok(run('renderPlayerDirectory([])').includes('No players found'));context.state.busy=true;assert.ok(run('renderPlayerDirectory([])').includes('Reading your replays'));context.state.busy=false;
});
check('Names and identities remain escaped in player and list actions',()=>{
 context.unsafe=[{...context.players[0],id:'a" onclick="bad',name:'<script>bad</script>',mark:{list:'friends'}}];const html=run('renderPlayerDirectory(unsafe)');assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('a&quot; onclick=&quot;bad'));assert.ok(!html.includes('<script>bad'));
});

// Exercise reading/focus preservation against replaced controls rather than
// checking source strings. Replacement nodes always begin with zero scroll.
const element=(kind,dataset={})=>({kind,dataset,isConnected:true,scrollTop:0,scrollLeft:0,matches:selector=>kind==='table'&&selector==='.player-table-scroll',focus(options){assert.equal(options.preventScroll,true);context.document.activeElement=this;},closest(){return {dataset:{directoryPager:'top'}};}});
let oldTable,newTable,oldButtons,newButtons;
const content={contains:node=>node===oldTable||oldButtons.includes(node),querySelector(selector){if(selector==='.player-table-scroll')return newTable||oldTable;if(selector.includes('data-page-action'))return newButtons.find(button=>button.dataset.pageAction==='next')||null;return null;},set innerHTML(value){
 assert.ok(value.includes('<table'));oldTable.isConnected=false;oldButtons.forEach(button=>button.isConnected=false);newTable=element('table');newButtons=oldButtons.map(button=>element('button',{...button.dataset}));newTable.querySelectorAll=()=>newButtons;
}};
function setupFocus(dataset,tableFocus=false){
 oldTable=element('table',{page:'2',filterKey:'same'});oldTable.scrollTop=180;oldTable.scrollLeft=100;oldButtons=[element('button',dataset)];newTable=null;newButtons=[];context.document.activeElement=tableFocus?oldTable:oldButtons[0];context.content=content;run('playerPage=2');
}
check('Same-page refresh keeps horizontal and vertical reading position',()=>{
 setupFocus({},true);run('updatePlayerDirectory(content,players,"same")');assert.equal(newTable.scrollTop,180);assert.equal(newTable.scrollLeft,100);assert.equal(context.document.activeElement,newTable);
});
check('Page and filter changes start at the top while preserving horizontal position',()=>{
 for(const change of ['playerPage=3;updatePlayerDirectory(content,players,"same")','updatePlayerDirectory(content,players,"different")']){setupFocus({},true);run(change);assert.equal(newTable.scrollTop,0);assert.equal(newTable.scrollLeft,100);}
});
check('Player, list, regional rating and pager focus survive node replacement',()=>{
 for(const dataset of [{player:'2-S2-1-51'},{mark:'2-S2-1-51'},{rating:'resolve',region:'EU'},{pageAction:'next'}]){setupFocus(dataset);run('updatePlayerDirectory(content,players,"same")');assert.equal(context.document.activeElement,newButtons[0]);}
});
check('Focus outside the table is left alone',()=>{
 setupFocus({});const external=element('button');context.document.activeElement=external;run('updatePlayerDirectory(content,players,"same")');assert.equal(context.document.activeElement,external);
});
const report={created:new Date().toISOString(),passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'player-directory-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
