'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot');
const themesRun=process.argv.includes('--themes');
const selectedCase=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
if(selectedCase&&!/^(default|protoss|zerg|terran)-(1000-en|375-ru)$/.test(selectedCase))throw Error('Unsupported theme test case');
const baselineReport=selectedCase?JSON.parse(fs.readFileSync(path.join(__dirname,'graphical-styles-browser.json'),'utf8')):null;
const report={success:false,themeSourceHash:crypto.createHash('sha256').update(['themes.css','console-layout.css','compact-ui.js','profile-view.js','replays.css','sidebar.css','app.js','index.html','factions.css','controls.css'].map(name=>fs.readFileSync(path.join(web,name))).join('\n')).digest('hex'),scope:'All nine production categories and dialogs, isolated sample data; no private library or external requests',cases:[]};
const luminance=color=>{const hex=color.replace('#',''),rgb=color.startsWith('#')?[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)):color.match(/[\d.]+/g).slice(0,3).map(Number);const channels=rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
const contrast=(a,b)=>{const A=luminance(a),B=luminance(b);return (Math.max(A,B)+.05)/(Math.min(A,B)+.05);};
(async()=>{let browser;try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 for(const width of (themesRun?[1000,375]:[1280,1000,820,375]))for(const language of (themesRun?[width===1000?'en':'ru']:['en','ru']))for(const theme of (themesRun?['default','protoss','zerg','terran']:['default'])){
  if(selectedCase&&selectedCase!==`${theme}-${width}-${language}`)continue;
  const page=await browser.newPage({viewport:{width,height:width===1000?700:width===820?650:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ids=['2-S2-1-123','1-S2-1-456'];
  const players=ids.map((id,i)=>({id,name:'TKnight',clanTag:i?'IPVGI':'Expend',region:i?'Americas':'EU',race:'Protoss',aliases:[]}));
  const settings={language,graphicalStyle:theme,selfIds:ids,replayFolders:[],autoDetectSelf:false,liveWatch:false,screenWatch:false,sound:false,sortPreferences:{}};
  const ratings=Object.fromEntries(players.map((p,i)=>[p.id,{[i?'americas':'eu']:{value:i?7000:7921,profileId:String(8713+i),region:p.region,profileName:p.name,url:'https://ds-rating.com/player/'+(8713+i)+'/ratings'}}]));
  const siteLookups=Object.fromEntries(players.map((p,i)=>[p.id,{playerId:p.id,status:'Ready',profiles:[{profileId:String(8713+i),name:p.name,region:p.region,rating:i?7000:7921,discoveredGames:i?720:2883,winRate:i?80.3:77.1,lastPlayed:'2026-10-21T20:00:00Z'}]}]));
  const dsstatsLookups=Object.fromEntries(players.map((p,i)=>[p.id,{status:'Ready',profiles:[{nativeId:p.id,name:p.name,region:p.region,rating:i?2683:2557,games:i?498:1990,wins:i?393:1546,lastPlayed:'2026-10-21T20:00:00Z'}]}]));
  const matches=Array.from({length:22},(_,i)=>({hash:'sample-'+i,map:'Direct Strike',mode:'Commanders',time:new Date(Date.UTC(2026,9,21,20,i)).toISOString(),seconds:1000,winner:i<19?1:2,players:[{...players[i%2],team:1,commander:i<10?'Artanis':i<16?'Fenix':'Karax',result:i<19?'Win':'Loss',combat:{values:{UnitKills:550,MineralsKilledArmy:40000,CombatDeaths:250,APM:80}}},...Array.from({length:5},(_,j)=>({id:'2-S2-1-'+(900+j),name:'Player '+j,team:j<2?1:2,commander:'Dehaka',result:'Unknown'}))]}));
  const library={settings,players,matches,marks:[],ratings,accounts:[],errors:[],ownAccountGroups:[{key:'own',canAutoLink:true,profiles:players,warnings:[],evidence:'Sample local account group'}],siteLookups,dsstatsLookups,siteHistories:{},siteGames:{}};
  const lobby={phase:'unavailable',roster:[],rosterEntries:[],alerts:[],automation:{acceptNeeded:false},liveStatus:'Client unavailable',ocrStatus:'Screen reader off'};
  let failAppearance=false;const appearanceCalls=[],appearanceStateRequests=[];
  await page.route('**/*',route=>{
   const name=new URL(route.request().url()).pathname;
   const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(name==='/api/state'){appearanceStateRequests.push(new URL(route.request().url()).search);return json({library,lobby,libraryVersion:'sample',busy:false,replayStatus:'Up to date'});}
   if(name==='/api/live-state')return json({lobby,site:{}});
   if(name==='/api/updates')return route.fulfill({status:503,body:'{}'});
   if(name==='/api/appearance'){
    const body=route.request().postDataJSON();appearanceCalls.push(body);
    if(failAppearance){if(failAppearance==='after-commit')settings.graphicalStyle=body.style;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Appearance write failed'})});}
    settings.graphicalStyle=body.style;return json({style:body.style});
   }
   if(name.startsWith('/api/'))return json({});
   const file=name==='/'?'index.html':decodeURIComponent(name.slice(1)),target=path.resolve(web,file);
   if(!target.startsWith(web+path.sep)||!fs.existsSync(target))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'image/png',body:fs.readFileSync(target)});
  });
  for(const match of matches)match.title='Direct Strike';
  library.ownAccountGroups[0].profiles=players.slice();
  const opponents=matches[0].players.slice(1).map((player,index)=>({...player,name:['Vanea','BlackJoker','aumka','Kthulhu','BlueMage'][index],region:'EU',aliases:[]}));
  players.push(...opponents);
  for(const [index,player] of opponents.entries()){
   const value=5400-index*700,profileId=String(20000+index);
   ratings[player.id]={eu:{value,profileId,region:'EU',profileName:player.name}};
   siteLookups[player.id]={status:'Ready',profiles:[{profileId,name:player.name,region:'EU',rating:value,discoveredGames:600+index*100,winRate:55+index,lastPlayed:'2026-10-21T20:00:00Z'}]};
   dsstatsLookups[player.id]={status:'Ready',profiles:[{nativeId:player.id,name:player.name,region:'EU',rating:2300-index*120,games:600+index*100,wins:330+index*50}]};
  }
  for(const player of players)player.ratings=ratings[player.id];
  library.marks=[{id:opponents[0].id,name:opponents[0].name,list:'friends',note:''},{id:opponents[1].id,name:opponents[1].name,list:'losers',note:'Sample note: compare player history.'}];
  for(const player of players)player.mark=library.marks.find(mark=>mark.id===player.id);
  for(const match of matches)for(const player of match.players){
   const source=players.find(item=>item.id===player.id);player.name=source.name;player.apm=80;
   player.combat={values:{UnitKills:550,MineralsKilledArmy:40000,CombatDeaths:250,FirstGasSeconds:35,SecondGasSeconds:400}};
   player.result=player.team===match.winner?'Win':'Loss';
  }
  for(const match of matches)match.economy={middleAvailable:true,middleIncomeRate:1,middleIntervals:[{team:1,startSeconds:20,endSeconds:300},{team:2,startSeconds:300,endSeconds:650},{team:1,startSeconds:650,endSeconds:match.seconds}],players:match.players.map(p=>({id:p.id,gasTimes:[30,300],middleHeldSeconds:p.team===1?630:350,estimatedMiddleMinerals:p.team===1?630:350}))};
  library.combatGames=matches.length;library.combatTotal=matches.length;
  Object.assign(lobby,{phase:'pregame',source:'screen',region:'EU',observedAt:new Date().toISOString(),rosterUpdatedAt:new Date().toISOString(),roster:matches[0].players.map(p=>p.name),rosterEntries:matches[0].players.map(p=>({name:p.name,team:p.team,nameOnly:false,candidates:[{id:p.id,name:p.name,nameOnly:false,marked:!!library.marks.find(m=>m.id===p.id)}]}))});
  await page.goto('http://profile.test/');await page.waitForFunction(()=>!!state?.library);
  const entry={width,language,theme,views:[],screenshots:[],shellLayouts:[]};
  const capture=async name=>{
   if(process.argv.includes('--assertions-only'))return;
   if(name==='players')await page.locator('.player-table-scroll').evaluate(el=>{el.scrollTop=0;});
   if(themesRun){
    if(!['lobby','profile','players','picks','matches','settings'].includes(name))return;
    const file=path.join(__dirname,`graphical-style-${theme}-${name}-${width}-${language}.png`);await page.screenshot({path:file,animations:'disabled'});entry.screenshots.push(file);
    if(name==='profile'){const aside=path.join(__dirname,`sidebar-${theme}-${width}-${language}.png`);await page.locator('.sidebar').screenshot({path:aside,animations:'disabled'});entry.screenshots.push(aside);}
    return;
   }
   if(process.argv.includes('--profile-replay')){
    if(!['profile','matches'].includes(name)||![1280,1000,375].includes(width))return;
    const file=path.join(__dirname,`profile-replay-${name}-${width}-${language}.png`);await page.screenshot({path:file,animations:'disabled'});entry.screenshots.push(file);return;
   }
   if(process.argv.includes('--assertions-only')||width!==1000&&!(width===820&&name==='lobby')&&!(width===375&&language==='ru'&&['profile','sounds'].includes(name)))return;
   const file=path.join(__dirname,`category-layout-${name}-${width}-${language}.png`);await page.screenshot({path:file,animations:'disabled'});entry.screenshots.push(file);
  };
  for(const category of ['lobby','profile','players','friends','picks','stats','matches','marks','sounds']){
   try{
   await page.locator(`nav [data-view="${category}"]`).click();
   await page.waitForFunction(value=>document.querySelector('main').dataset.view===value,category);
   await page.evaluate(()=>renderLibrary());
   assert.equal(await page.locator('.page-help').count(),0,'About this view is removed from every category');
   assert.equal(await page.locator('.page-tools').count(),0,'Obsolete Tools menu is removed from every category');
   assert.equal(await page.locator('.sidebar .nav[aria-current="page"]').count(),1,'Exactly one navigation destination is current');
   assert.equal(await page.locator('.sidebar .nav[aria-current="page"]').getAttribute('data-view'),category,'Current destination follows real navigation');
   if(category==='profile'){
    const navState=await page.locator('.sidebar').evaluate(el=>({width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+1,labels:[...el.querySelectorAll('.nav')].map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),icon:getComputedStyle(n,'::before').maskImage})),footer:el.querySelector('.sidebar-bottom').getBoundingClientRect().bottom,bottom:el.getBoundingClientRect().bottom}));
    assert.equal(navState.overflow,false,'Sidebar has no unintended horizontal overflow');
    assert.ok(navState.labels.every(n=>n.font>=13&&n.height>=(width<=750?44:34)&&n.icon.includes('/themes/nav-')),'Labels remain readable with usable framed targets and drawn glyphs');
    if(width>=1000){assert.ok(navState.width<=204,'Navigation does not widen the app');assert.ok(navState.footer<=navState.bottom+1,'Utilities fit in the small desktop sidebar');}
    await page.locator('.sidebar .nav[data-view="profile"]').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').getAttribute('data-view'),'profile','Navigation remains keyboard operable');
    await page.locator('.page-head h1').click();
    const glyphs=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.sidebar .nav')].map(async el=>{const name=el.dataset.view,img=new Image();img.src='/themes/nav-'+name+'.svg';await img.decode();return img.naturalWidth>0;})));
    assert.ok(glyphs.every(Boolean),'Bundled navigation glyphs decode offline');
   }
   assert.equal(await page.locator('.page-head p.muted').isVisible(),false,'Removed page help stays hidden after refresh');
   const headingState=await page.locator('.page-head h1').evaluate(el=>({text:el.textContent,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,height:el.getBoundingClientRect().height,parent:el.parentElement.outerHTML}));
   assert.ok(headingState.text&&headingState.height>0&&headingState.visibility==='visible',`Page title remains visible: ${JSON.stringify(headingState)}`);
   const shell=await page.evaluate(()=>{
    const head=document.querySelector('.page-head'),body=document.querySelector('.workspace'),frame=document.querySelector('.work-console'),h=head.getBoundingClientRect(),b=body.getBoundingClientRect(),css=getComputedStyle(frame);
    return {x:h.x,width:h.width,height:h.height,bodyX:b.x,bodyWidth:b.width,gap:b.top-h.bottom,gutter:getComputedStyle(document.documentElement).scrollbarGutter,frame:css.borderImageSource,paint:parseFloat(css.borderImageWidth),reserve:parseFloat(css.borderLeftWidth),headFrame:getComputedStyle(head).borderImageSource,bodyFrame:getComputedStyle(body).borderImageSource,shared:head.parentElement===frame&&body.parentElement===frame};
   });
   assert.equal(shell.gutter,'stable','Scrollbar space stays reserved between short and long pages');
   assert.ok(Math.abs(shell.x-shell.bodyX)<1&&Math.abs(shell.width-shell.bodyWidth)<1&&Math.abs(shell.gap)<1,'Header and content share uninterrupted side rails');
   assert.ok(shell.shared&&shell.frame.includes('/themes/'),'One assembly owns the complete decorative frame');
   assert.equal(shell.paint,shell.reserve,'No unpainted black shoulder between frame and header');
   assert.equal(shell.headFrame,'none','Header cannot restart the shaped outer corners');
   assert.equal(await page.locator('.page-head').evaluate(el=>parseFloat(getComputedStyle(el).borderBottomWidth)),0,'No old straight plate separator crosses the shared header');
   assert.equal(shell.bodyFrame,'none','Data well cannot restart or cover the outer rails');
   const headerSurface=await page.locator('.page-head').evaluate(el=>({clip:getComputedStyle(el).backgroundClip,overlay:getComputedStyle(el,'::before').content}));
   assert.equal(await page.locator('.work-console').evaluate(el=>getComputedStyle(el).backgroundClip),'padding-box','The surface cannot paint rectangular lines behind transparent outer corners');
   assert.equal(headerSurface.overlay,'none','No oversized texture panel intersects the header rails');
   if(width>=1000&&entry.shellLayouts.length){const first=entry.shellLayouts[0];assert.ok(Math.abs(shell.x-first.x)<1&&Math.abs(shell.width-first.width)<1&&Math.abs(shell.height-first.height)<1,`${category}: page switches do not move the header (${JSON.stringify(shell)} vs ${JSON.stringify(first)})`);}
   entry.shellLayouts.push({category,...shell});
   const frameClearance=await page.evaluate(()=>{
    const result=[],visible=el=>!!el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
    const inspect=(frame,children,top)=>{
     const r=frame.getBoundingClientRect(),css=getComputedStyle(frame),paint=css.borderImageWidth.split(' ').map(parseFloat);
     const edges={top:paint[0],right:paint[1]??paint[0],left:paint[3]??paint[1]??paint[0]};
     for(const el of children.filter(visible)){const b=el.getBoundingClientRect();result.push({target:el.id||el.className||el.tagName,left:b.left-r.left-edges.left,right:r.right-b.right-edges.right,top:top?b.top-r.top-edges.top:null});}
    };
    const head=document.querySelector('.page-head'),workspace=document.querySelector('.workspace');
    const frame=document.querySelector('.work-console');
    inspect(frame,[head.querySelector('h1'),...head.querySelectorAll('.header-actions>.button')],true);
    inspect(frame,[document.querySelector('.library'),...workspace.querySelectorAll('.table-wrap,.player-table-scroll')],false);
    if(innerWidth>750)inspect(document.querySelector('.sidebar nav'),[...document.querySelectorAll('.sidebar nav>.nav')],true);
    return result;
   });
   assert.ok(frameClearance.every(item=>item.left>=3.5&&item.right>=3.5&&(item.top===null||item.top>=3.5)),`${category}: controls stay clear of painted rails: ${JSON.stringify(frameClearance.filter(item=>item.left<3.5||item.right<3.5||item.top!==null&&item.top<3.5))}`);
   entry.frameClearance=frameClearance;
   assert.equal(await page.locator('#toast:not([hidden])').count(),0,`${category}: no caught rendering error`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${category}: no horizontal document overflow at ${width}/${language}`);
   if(category==='lobby'){
    assert.equal(await page.locator('.live-team-group').count(),2);
    if(themesRun&&theme!=='default'){
     const rails=await page.locator('.live-team-group').evaluateAll(nodes=>nodes.map(el=>({border:getComputedStyle(el).borderColor,art:getComputedStyle(el,'::before').borderImageSource,pointer:getComputedStyle(el,'::before').pointerEvents})));
     assert.equal(rails[0].border,'rgb(132, 220, 186)');assert.equal(rails[1].border,'rgb(251, 142, 148)');
     assert.ok(rails.every(rail=>rail.art.includes(`/themes/${theme}.svg`)&&rail.pointer==='none'),'Decorative faction rails preserve team identity and input');
     if(width<=750)assert.equal(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).position),'relative','Mobile console art stays within its sidebar');
    }
    assert.equal(await page.locator('.live-overview').getAttribute('open'),null);
    await page.locator('.live-overview>summary').click();await page.evaluate(()=>renderLibrary());assert.ok(await page.locator('.live-overview').getAttribute('open')!==null);
    await page.locator('.live-overview>summary').click();
    if(width>=820){const box=await page.locator('.live-roster-grid').boundingBox();assert.ok(box.height<(width===820?680:620),'Six-player roster stays compact with localized quick actions');}
   }
   if(category==='profile'){
    if(themesRun){
     assert.equal(await page.locator('html').getAttribute('data-graphical-style'),theme);
     const palette=await page.evaluate(()=>{
      const css=getComputedStyle(document.documentElement),names=['--bg','--surface','--shell-panel','--shell-header','--row-hover','--text','--muted','--rating-dsr','--rating-dsstats','--green','--red'];
      return Object.fromEntries(names.map(name=>[name,css.getPropertyValue(name).trim()]));
     });
     for(const name of ['--text','--muted','--rating-dsr','--rating-dsstats','--green','--red'])assert.ok(contrast(palette[name],palette['--surface'])>=4.5,`${theme}: readable ${name}`);
     for(const surface of ['--bg','--shell-panel','--shell-header','--row-hover'])for(const text of ['--text','--muted'])assert.ok(contrast(palette[text],palette[surface])>=4.5,`${theme}: readable ${text} on ${surface}`);
     assert.equal(palette['--rating-dsr'],'#59d6ea');assert.equal(palette['--rating-dsstats'],'#c4a7ff');
     if(theme==='default')assert.ok(contrast(palette['--text'],palette['--bg'])>=12,'Default preserves a clear SC2 menu well');
     const button=await page.locator('#import').evaluate(el=>{const c=getComputedStyle(el);return {text:c.color,background:c.backgroundColor,border:c.borderColor};});
     assert.ok(contrast(button.text,button.background)>=4.5,`${theme}: primary button text contrast`);
     if(theme!=='default'){
      assert.ok(contrast(button.border,palette['--surface'])>=3,`${theme}: control frame contrast`);
      const consoleFrame=await page.locator('.work-console').evaluate(el=>getComputedStyle(el).borderImageSource);
      assert.ok(consoleFrame.includes(`/themes/${theme}.svg`),'The game frame is painted on the actual panel');
      assert.equal(await page.locator('.profile-favourite').evaluate(el=>getComputedStyle(el).borderImageSource),'none','Commander details do not repeat the outer console frame');
      const construction=await page.evaluate(()=>({control:getComputedStyle(document.querySelector('#import')).borderImageSource,selection:getComputedStyle(document.querySelector('.nav.active')).borderImageSource,crest:getComputedStyle(document.querySelector('.page-head'),'::after').backgroundImage,radius:getComputedStyle(document.querySelector('.profile-commanders')).borderRadius}));
       assert.ok(construction.control.includes(`/themes/${theme}-command.${theme==='zerg'?'svg':'png'}`),'Faction controls use their native command atlas with the assigned material palette');
      assert.ok(construction.selection.includes(`/themes/${theme}.svg`)&&construction.crest.includes(`/themes/${theme}-crest.svg`),'Selection and header retain native faction construction');
      entry.factionConstruction=construction;
       const assets=await page.evaluate(async race=>Promise.all([`${race}.svg`,`${race}-surface.svg`,`${race}-control.${race==='zerg'?'svg':'png'}`,`${race}-command.${race==='zerg'?'svg':'png'}`,`${race}-crest.svg`].map(async name=>{const image=new Image();image.src='/themes/'+name;await image.decode();return {name,width:image.naturalWidth,height:image.naturalHeight};})),theme);
      assert.ok(assets.every(image=>image.width>0&&image.height>0),'Embedded atlas frames and materials decode in the browser');
      entry.consoleAssets=assets;
     }
    }
    const recent=page.locator('.personal-profile .table-wrap tbody tr').first();
    const rowBefore=await recent.boundingBox();
    await recent.locator('td').first().hover();
    const hoverState=await recent.evaluate(el=>{
     const well=el.closest('.table-wrap'),r=well.getBoundingClientRect(),frame=document.querySelector('.work-console'),f=frame.getBoundingClientRect(),css=getComputedStyle(frame),paint=parseFloat(css.borderImageWidth);
     const probe=document.createElement('i');probe.style.background='var(--row-hover)';el.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();
     return {left:r.left-f.left-paint,right:f.right-r.right-paint,expected,cells:[...el.cells].map(cell=>getComputedStyle(cell).backgroundColor),header:[...well.querySelectorAll('thead th')].map(th=>{const c=getComputedStyle(th);return {background:c.backgroundColor,text:c.color,divider:c.borderBottomColor,border:parseFloat(c.borderBottomWidth)};}),art:getComputedStyle(well).borderImageSource,clip:getComputedStyle(well).overflowX,shadow:css.boxShadow};
    });
    assert.ok(hoverState.cells.every(color=>color===hoverState.expected),'Replay hover visibly uses each theme dedicated subdued surface across every cell');
    assert.ok(hoverState.left>=3.5&&hoverState.right>=3.5&&hoverState.art==='none'&&['auto','scroll','hidden','clip'].includes(hoverState.clip),'Hovered rows and their well cannot paint across the outer rails: '+JSON.stringify(hoverState));
    const rowAfter=await recent.boundingBox();assert.ok(Math.abs(rowAfter.width-rowBefore.width)<1&&Math.abs(rowAfter.height-rowBefore.height)<1,'Hover adds no layout movement');
    assert.notEqual(hoverState.shadow,'none','Outer assembly has an offset depth shadow');
    assert.ok(hoverState.header.every(head=>contrast(head.background,hoverState.expected)>=1.6),'Table header remains visibly separate from hovered data, including every gradient-free column');
    assert.ok(hoverState.header.every(head=>contrast(head.text,head.background)>=4.5&&head.border>=1),'Neutral table labels and divider stay readable');
    entry.replayHover=hoverState;
    if(themesRun&&width===1000&&!process.argv.includes('--assertions-only')){const file=path.join(__dirname,`frame-states-${theme}-hover.png`);await page.screenshot({path:file,animations:'disabled'});entry.screenshots.push(file);}
    if(themesRun&&theme==='zerg'&&width===1000&&!process.argv.includes('--assertions-only')){const r=await page.locator('.personal-profile .table-wrap').first().boundingBox();const file=path.join(__dirname,'table-contrast-zerg.png');await page.screenshot({path:file,animations:'disabled',clip:{x:r.x,y:Math.max(0,r.y),width:r.width,height:Math.min(260,700-Math.max(0,r.y))}});entry.screenshots.push(file);}
    await page.mouse.move(0,0);await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.locator('.profile-region').count(),2);assert.equal(await page.locator('.profile-region .dsstats-value strong').count(),2);
    if(width>=1000){const boxes=await page.locator('.profile-main-grid').evaluate(el=>[el.querySelector('.profile-commanders'),el.querySelector('.profile-overview')].map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert.ok(boxes[0].x<boxes[1].x&&Math.abs(boxes[0].y-boxes[1].y)<1,'Commander and account columns share one composed panel');}
    const main=await page.locator('.profile-favourite').boundingBox(),best=await page.locator('.profile-best-grid').boundingBox();
    assert.ok(best.y>=main.y+main.height,'Secondary commanders stay below the favourite at every width');
    const colors=await page.locator('.personal-profile').evaluate(el=>{
     const green=getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),red=getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
     const probe=document.createElement('span');el.append(probe);probe.style.color=green;const expectedWin=getComputedStyle(probe).color;probe.style.color=red;const expectedLoss=getComputedStyle(probe).color;probe.remove();
     return {wins:[...el.querySelectorAll('.profile-wins')].every(n=>getComputedStyle(n).color===expectedWin),losses:[...el.querySelectorAll('.profile-losses')].every(n=>getComputedStyle(n).color===expectedLoss),count:el.querySelectorAll('.profile-wins').length};
    });assert.ok(colors.wins&&colors.losses&&colors.count>=4,'Wins are green and losses red throughout the profile');
   }
   if(category==='players'||category==='friends'){
    assert.ok(await page.locator('.player-table tbody tr').count()>0);
    const heads=await page.locator('.player-table thead th').evaluateAll(nodes=>nodes.map(th=>getComputedStyle(th).backgroundColor));
    const hoverToken=await page.evaluate(()=>{const p=document.createElement('i');p.style.background='var(--row-hover)';document.body.append(p);const c=getComputedStyle(p).backgroundColor;p.remove();return c;});
    assert.ok(heads.every(color=>color===heads[0]&&contrast(color,hoverToken)>=1.6),'Pinned and scrolling directory headers share the same distinct steel surface');
    if(width>=1000)assert.ok(await page.locator('.player-table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Directory fits a normal small desktop window');
    assert.ok(await page.locator('.player-table .most-played-cell').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1&&el.getBoundingClientRect().right<=el.closest('td').getBoundingClientRect().right)),'Commander summaries fit their own cells without running into the adjacent win rate');
    const membership=await page.locator('.player-table .mark-button').evaluateAll(nodes=>nodes.map(el=>{
     const s=getComputedStyle(el),rgb=value=>{const n=value.match(/[\d.]+/g).slice(0,3).map(Number);return value.startsWith('color(srgb')?n.map(v=>v*255):n;},luminance=value=>rgb(value).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
     return {list:el.dataset.list,frame:s.borderImageSource,fill:s.backgroundImage,text:rgb(s.color),edge:rgb(s.borderTopColor),textContrast:contrast(s.color,s.backgroundColor),edgeContrast:contrast(s.borderTopColor,s.backgroundColor),fits:el.scrollWidth<=el.clientWidth+1,height:el.getBoundingClientRect().height,singleLineHeight:Math.max(parseFloat(s.minHeight)||0,parseFloat(s.lineHeight)+parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)+parseFloat(s.borderTopWidth)+parseFloat(s.borderBottomWidth))};
    }));
    assert.ok(membership.every(s=>s.frame==='none'&&s.fill==='none'&&s.textContrast>=4.5&&s.edgeContrast>=3),`List actions have readable flat surfaces and visible single borders, without theme artwork: ${JSON.stringify(membership)}`);
    assert.ok(membership.every(s=>s.fits&&(!s.list||s.height<=s.singleLineHeight+1)),'List labels fit without clipping or splitting membership names across lines');
    const friend=membership.find(s=>s.list==='friends');assert.ok(friend&&friend.text[1]>friend.text[0]&&friend.edge[1]>friend.edge[0]&&friend.edge[1]>friend.edge[2],'Friends text and border share the green membership role');
    if(category==='players'){
     assert.ok(membership.some(s=>s.list==='')&&membership.some(s=>s.list==='losers'),'Directory covers unmarked and Losers controls');
     const control=page.locator('.player-table .mark-button[data-list=friends]').first();
     const before=await control.boundingBox();await control.hover();await control.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
     const focus=await control.evaluate(el=>({frame:getComputedStyle(el).borderImageSource,ring:getComputedStyle(el).outlineColor,text:getComputedStyle(el).color}));
     assert.equal(focus.frame,'none');assert.equal(focus.ring,focus.text,'Friends keyboard focus uses the same semantic colour');
     const after=await control.boundingBox();assert.equal(after.width,before.width);assert.equal(after.height,before.height,'Hover and focus never change button dimensions');
     await page.locator('.page-head h1').click();
     entry.listControls=membership;
    }
   }
   if(category==='picks'){
    await page.locator('#pick-enemy-commander').selectOption('Dehaka');
    assert.ok(await page.locator('.pick-known-enemy').isVisible());assert.ok(await page.locator('.pick-recommendation').count()>0);
    await page.locator('.pick-controls-help>summary').click();const select=await page.locator('#pick-enemy-commander').elementHandle();
    await page.evaluate(()=>renderLibrary());assert.ok(await select.evaluate(el=>el.isConnected),'Pick selectors stay attached through refresh');
    assert.ok(await page.locator('.pick-controls-help').getAttribute('open')!==null);await page.locator('.pick-controls-help>summary').click();
   }
   if(category==='stats'){
    const box=await page.locator('.combat-cards').boundingBox(),content=await page.locator('#library-content').boundingBox();assert.ok(box.y-content.y<100,'Stats start above account management');
    assert.equal(await page.locator('.stats-accounts').getAttribute('open'),null);
    await page.locator('.stats-accounts>summary').click();await page.evaluate(()=>renderLibrary());assert.ok(await page.locator('.stats-accounts').getAttribute('open')!==null);
    await page.locator('.stats-accounts>summary').click();
    await page.locator('[data-stats-scope="all"]').click();assert.equal(await page.locator('.stats-accounts').count(),0);
    await page.locator('[data-stats-scope="own"]').click();
   }
   if(category==='matches'){
    const line=page.locator('.replay-middle-preview').first(),svg=line.locator('svg');
    assert.ok(await svg.isVisible(),'Middle-control timeline is visible in each compact layout');
    assert.equal(await line.locator('rect.team-1').count(),2);assert.equal(await line.locator('rect.team-2').count(),1);
    const lineBox=await svg.boundingBox(),teamsBox=await page.locator('.replay-teams').first().boundingBox();
    assert.ok(lineBox.height===4&&lineBox.width>=teamsBox.width-2&&lineBox.y>=teamsBox.y+teamsBox.height,'Quiet 4px timeline spans both teams beneath the player rows');
    await page.evaluate(()=>renderLibrary());assert.ok(await page.locator('.replay-middle-preview svg').first().isVisible(),'Timeline survives scheduled refresh');
    const boxes=await page.locator('.replay-teams').first().locator('.replay-team').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
    if(width>=1000)assert.ok(boxes[0].x<boxes[1].x&&Math.abs(boxes[0].y-boxes[1].y)<1,'Both teams stay beside each other in a small desktop replay');
   }
   if(category==='marks'){
    await page.locator('[data-list-filter="all"]').click();
    assert.equal(await page.locator('.mark-card').count(),2);assert.ok(!(await page.locator('.list-cards').textContent()).includes('No note added.'));
    await page.locator('.list-options>summary').click();await page.evaluate(()=>renderLibrary());assert.ok(await page.locator('.list-options').getAttribute('open')!==null);
    await page.locator('.list-options>summary').click();
    await page.locator('#quick-mark-name').fill('Unsent sample');await page.evaluate(()=>renderLibrary());assert.equal(await page.locator('#quick-mark-name').inputValue(),'Unsent sample');
   }
   if(category==='sounds'){
    assert.ok(await page.locator('.sounds-target').count()>=5);
    const select=await page.locator('[data-sounds-category]').elementHandle();
    await page.locator('[data-sounds-language="ru"]').click();await page.evaluate(()=>renderLibrary());assert.ok(await select.evaluate(el=>el.isConnected),'Sound selectors stay attached through refresh');
    assert.ok(await page.locator('.sounds-recording-choice').count()>0);
   }
   const measure=await page.locator('#library-content').evaluate(el=>({height:Math.round(el.getBoundingClientRect().height),top:Math.round(el.getBoundingClientRect().top)}));
   if(themesRun&&theme!=='default'){
    const baseline=[...report.cases,...(baselineReport?.cases||[])].find(item=>item.width===width&&item.language===language&&item.theme==='default')?.views.find(item=>item.category===category);
    if(baseline)assert.ok(Math.abs(measure.height-baseline.height)<=16,`${theme}: ${category} frames retain compact content height (${measure.height} vs ${baseline.height})`);
   }
   entry.views.push({category,...measure});
   }catch(error){(report.failures??=[]).push({width,language,category,error:error.message});}
   await page.evaluate(()=>scrollTo(0,0));await capture(category);
  }
  await page.locator('#settings-open').click();assert.equal(await page.locator('#settings-form>.settings-group').count(),4);
  assert.ok(await page.locator('#settings-language').isVisible());assert.ok(await page.locator('#updates-open').isVisible());
  assert.equal(await page.locator('#folders').isVisible(),false);
  const folderGroup=page.locator('.settings-group').filter({has:page.locator('#folders')});await folderGroup.locator('summary').click();
  await page.locator('#folders').fill('Unsent sample folder');await page.evaluate(()=>renderLibrary());assert.equal(await page.locator('#folders').inputValue(),'Unsent sample folder');
  await folderGroup.locator('summary').click();await capture('settings');await page.keyboard.press('Escape');
  if(themesRun){
   await page.locator('#settings-open').click();assert.equal(await page.locator('[name="graphical-style"]').count(),4);
   const next=theme==='terran'?'protoss':'terran';
   await page.locator(`[name="graphical-style"][value="${next}"]`).check();
   await page.waitForFunction(()=>!graphicalStyleBusy&&!graphicalStyleRefreshNeeded&&!refreshPending);assert.equal(settings.graphicalStyle,next);assert.equal(appearanceCalls.at(-1).style,next);
   assert.equal(appearanceStateRequests.at(-1),'','Appearance save is reconciled with an unconditional library refresh');
   assert.equal(await page.evaluate(()=>localStorage.getItem(graphicalStyleStorageKey)),next);
   const stale=await page.evaluate(()=>{const stale={graphicalStyle:'zerg'};mergeGraphicalStyleSettings(stale,graphicalStyleRevision-1);return {value:stale.graphicalStyle,actual:graphicalStyle};});
   assert.equal(stale.value,next);assert.equal(stale.actual,next,'Late state responses cannot undo a recent choice');
   failAppearance=true;
   const rejected=next==='protoss'?'zerg':'protoss';await page.locator(`[name="graphical-style"][value="${rejected}"]`).click();await page.waitForFunction(()=>!graphicalStyleBusy&&!graphicalStyleRefreshNeeded&&!refreshPending);
   assert.equal(await page.locator('html').getAttribute('data-graphical-style'),next,'Failed save restores the previous style');assert.ok(await page.locator('#appearance-status').textContent());
   failAppearance='after-commit';await page.locator(`[name="graphical-style"][value="${rejected}"]`).click();await page.waitForFunction(()=>!graphicalStyleBusy&&!graphicalStyleRefreshNeeded&&!refreshPending);
   assert.equal(await page.locator('html').getAttribute('data-graphical-style'),rejected,'A committed write with a failed response reconciles to the saved style');assert.equal(await page.locator('#appearance-status').textContent(),'');
   failAppearance=false;await page.keyboard.press('Escape');await page.reload();await page.waitForFunction(()=>!!state?.library);
   assert.equal(await page.locator('html').getAttribute('data-graphical-style'),rejected,'Saved style restores on reload');
  }
  await page.locator('nav [data-view="friends"]').click();await page.locator('.player-table .player-name').first().click();
  assert.ok(await page.locator('#player-dialog').isVisible());const close=await page.locator('#player-dialog .close').boundingBox();assert.ok(close.y>=0&&close.y+close.height<(width===1000?700:width===820?650:800),'Player dialog close remains visible');
  await capture('player-dialog');await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);report.cases.push(entry);await page.close();
 }
 report.success=!report.failures?.length;if(!report.success)throw new Error(JSON.stringify(report.failures));
}catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(__dirname,selectedCase?`faction-console-${selectedCase}.json`:themesRun?'graphical-styles-browser.json':process.argv.includes('--profile-replay')?'profile-replay-browser.json':'all-category-layout-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,cases:report.cases.length,error:report.error}));}})().catch(e=>{console.error(e);process.exitCode=1;});
