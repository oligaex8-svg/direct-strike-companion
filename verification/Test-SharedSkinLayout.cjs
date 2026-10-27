'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
async function run({sourceRoot,overrideRoot,outputRoot,outerFramesOnly=false,lobbyOnly=false}){
 const settingsOnly=process.env.DSC_SKIN_REVIEW_SCOPE==='settings',captureStills=process.env.DSC_SKIP_SKIN_SCREENSHOTS!=='1';
 const web=path.join(sourceRoot,'wwwroot'),fixture=require(path.join(sourceRoot,'verification/LocalPreviewFixture.cjs')),catalog=require(path.join(web,'native-console-catalog.json'));
 const requestedStyles=process.env.DSC_SKIN_REVIEW_STYLES?.split(','),styles=catalog.filter(skin=>!requestedStyles||requestedStyles.includes(skin.id));
 const widths=(process.env.DSC_SKIN_REVIEW_WIDTHS?.split(',').map(Number))||(lobbyOnly?[1920,1600,1000,375]:[1600,1000,375]);
 assert.ok(widths.length&&widths.every(width=>[1920,1600,1000,375].includes(width)),'Known review viewport widths');
 const report={success:false,scope:'Each skin compared directly with unchanged Default; same viewport, synthetic data, language, view and scroll. Elements plus text ranges; software rendering.',outerFramesOnly,styles:styles.map(s=>s.id),cases:[],screenshots:[]};let browser;
 const reportName=lobbyOnly?'lobby-theme-layout-browser.json':outerFramesOnly?'outer-frame-joins-browser.json':'shared-skin-layout-browser.json';
 const measure=()=>{
  const boxes=[],text=[],round=rect=>[rect.x+scrollX,rect.y+scrollY,rect.width,rect.height].map(n=>Math.round(n*64)/64);
  for(const el of document.querySelectorAll('.sidebar,.sidebar *,main,main *,dialog[open],dialog[open] *')){
   if(el.matches('script,style,option')||el.closest('dialog:not([open]),.theme-vfx-layer,.theme-equipment-layer'))continue;
   const rect=el.getBoundingClientRect();if(!rect.width&&!rect.height)continue;
   boxes.push([el.tagName,el.id||el.getAttribute('data-view')||String(el.className||''),...round(rect)]);
   for(const node of el.childNodes)if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){
    const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())text.push([node.textContent.trim().slice(0,45),...round(rect)]);
   }
  }
  return {boxes,text,overflow:document.documentElement.scrollWidth>innerWidth+1};
 };
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  for(const width of widths){
   const sample=fixture('default',width===375?'ru':'en'),page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   // Compare settled layout, independently from deliberate motion tested in
   // Test-ToolMotion. Transient entry transforms are not layout differences.
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.route('**/*',route=>{
    const name=new URL(route.request().url()).pathname,json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(name==='/api/state')return json({...sample,libraryVersion:'shared-skin-layout',busy:false,replayStatus:'Local preview · sample data'});
    if(name==='/api/live-state')return json({lobby:sample.lobby,site:{dsstatsLookups:sample.library.dsstatsLookups}});
    if(name==='/api/appearance'){const style=route.request().postDataJSON().style;sample.library.settings.graphicalStyle=style;return json({style});}
    if(name.startsWith('/api/'))return json({});
    const relative='.'+decodeURIComponent(name==='/'?'/index.html':name),staged=overrideRoot&&path.resolve(overrideRoot,relative),file=staged&&fs.existsSync(staged)?staged:path.resolve(web,relative);
    if(![web,overrideRoot].filter(Boolean).some(root=>file.startsWith(root+path.sep))||!fs.existsSync(file))return route.abort();
    const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.addInitScript(now=>{
    const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    // This is a static fixture/layout test. Live polling is tested separately;
    // it must not replace a status wrapper between Default and skin samples.
    window.setInterval=()=>0;
   },Date.now());
   await page.goto('http://skin-layout.test/',{waitUntil:'domcontentloaded',timeout:10000});await page.waitForFunction(()=>!!state?.library);await page.evaluate(()=>document.fonts.ready);
   const apply=async id=>{sample.library.settings.graphicalStyle=id;await page.evaluate(async id=>{
    state.library.settings.graphicalStyle=id;applyGraphicalStyle(id);scrollTo(0,0);await document.fonts.ready;
    const root=getComputedStyle(document.documentElement),properties=['skin-panel-frame','skin-shell-frame','skin-header-band','identity-frame','identity-field','identity-scene'];
    await Promise.all(properties.map(property=>{const match=root.getPropertyValue('--'+property).match(/url\(['"]?([^'")]+)/);if(!match)return;const img=new Image();img.src=match[1];return img.decode();}));
    await new Promise(requestAnimationFrame);
   },id);};
   for(const view of settingsOnly?[]:lobbyOnly?['lobby','lobby-mixed','lobby-details']:outerFramesOnly?['profile','picks']:['profile','players','friends','picks','lobby','stats','matches','marks','sounds']){
    await apply('default');await page.locator('nav [data-view="'+(view.startsWith('lobby-')?'lobby':view)+'"]').click();
    if(view==='lobby-mixed'){
     // Real lobbies mix linked players and unresolved names with no history.
     for(const [offset,name] of ['Новый игрок','NewOpponent'].entries())sample.lobby.rosterEntries[3+offset]={name,team:2,nameOnly:true,candidates:[]};
     sample.lobby.roster=sample.lobby.rosterEntries.map(entry=>entry.name);
     await page.evaluate(lobby=>{state.lobby=lobby;renderLibrary();},sample.lobby);
     assert.ok(await page.locator('.live-history-empty').count()>=4,'Mixed lobby includes missing histories');
    }
    if(view==='lobby-details'){
     await page.locator('.live-profile-details>summary').first().click();
     assert.ok(await page.locator('.live-profile-details[open]').count(),'Expanded player details are exercised');
    }
    await page.evaluate(()=>scrollTo(0,0));
    const baseline=await page.evaluate(measure);assert.ok(!baseline.overflow,'Default '+width+'/'+view+' contained');
    for(const id of ['default',...styles.map(skin=>skin.id)]){
     await apply(id);const current=await page.evaluate(measure),differences=[];
     if(id!=='default'){
      const paint=await page.evaluate(()=>{const panel=document.querySelector('.work-console'),box=panel.getBoundingClientRect(),style=getComputedStyle(panel),frame=getComputedStyle(panel,'::before'),cap=getComputedStyle(panel,'::after');return {slice:frame.borderImageSlice,frame:frame.borderImageSource,frameTop:box.top+parseFloat(style.borderTopWidth)+parseFloat(frame.top),cap:cap.content,capImage:cap.backgroundImage,pointerEvents:frame.pointerEvents};});
      assert.ok(paint.slice.startsWith('128 '),'Complete native turn envelope');assert.ok(paint.frame.includes(id+'-console-shell-frame.png'));assert.ok(paint.frameTop>=-1,'Complete frame stays within window');assert.equal(paint.cap,id==='fenix'?'""':'none','Only Purifier has a material backing; no second crown');if(id!=='fenix')assert.equal(paint.capImage,'none');else assert.ok(paint.capImage.startsWith('linear-gradient'),'Purifier backing is material, not another art fragment');assert.equal(paint.pointerEvents,'none');
      if(width===1600&&view==='profile'){
       const overlaps=await page.evaluate(async()=>{
        const panel=document.querySelector('.work-console'),box=panel.getBoundingClientRect(),s=getComputedStyle(panel),f=getComputedStyle(panel,'::before'),img=new Image();img.src=f.borderImageSource.match(/url\(["']?([^"')]+)/)[1];await img.decode();
        const slice=f.borderImageSlice.split(' ').map(Number),paint=f.borderImageWidth.split(' ').map(parseFloat),t=slice[0],r=slice[1],b=slice[2]||t,l=slice[3]||r,pt=paint[0],pr=paint[1]||pt,pl=paint[3]||pr;
        const fw=parseFloat(f.width)+2,canvas=document.createElement('canvas');canvas.width=Math.ceil(fw);canvas.height=Math.ceil(pt);const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,l,t,0,0,pl,pt);ctx.drawImage(img,l,0,img.width-l-r,t,pl,0,fw-pl-pr,pt);ctx.drawImage(img,img.width-r,0,r,t,fw-pr,0,pr,pt);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,x0=box.left+parseFloat(s.borderLeftWidth)+parseFloat(f.left),y0=box.top+parseFloat(s.borderTopWidth)+parseFloat(f.top),hits=[];
        for(const el of panel.querySelectorAll('.page-head h1,.page-head button,.page-head .button')){
         const r=el.getBoundingClientRect();let count=0;
         for(let y=Math.max(0,Math.ceil(r.top-y0));y<Math.min(canvas.height,Math.floor(r.bottom-y0));y++)for(let x=Math.max(0,Math.ceil(r.left-x0));x<Math.min(canvas.width,Math.floor(r.right-x0));x++)if(pixels[(y*canvas.width+x)*4+3]>64)count++;
         if(count)hits.push({control:el.textContent.trim(),pixels:count});
        }return hits;
       });assert.deepEqual(overlaps,[],id+': native upper artwork clears header controls');
      }
     }
     for(const category of ['boxes','text']){
      if(current[category].length!==baseline[category].length)differences.push({category,count:[baseline[category].length,current[category].length]});
      for(let i=0;i<Math.min(current[category].length,baseline[category].length);i++){
       const original=baseline[category][i],decorated=current[category][i],offset=category==='boxes'?2:1;
       if(original.slice(0,offset).join('|')!==decorated.slice(0,offset).join('|')||original.slice(offset).some((n,j)=>Math.abs(n-decorated[j+offset])>.05)){
        differences.push({category,index:i,default:original,skin:decorated});if(differences.length>=8)break;
       }
      }
     }
     const ornaments=id==='default'?[]:await page.evaluate(()=>[...document.querySelectorAll('.page-head,.profile-favourite-top,.profile-best-heading,.profile-region h3,.profile-section-heading,.live-team-head')].filter(el=>!['none','normal'].includes(getComputedStyle(el,'::after').content)).map(el=>el.className));
     if(captureStills&&process.env.DSC_THEME_PREVIEW_CAPTURE==='1'&&width===1000&&view==='profile'){
      // Capture the real shared layout with synthetic fixture data. This is a
      // static bundled thumbnail, never a capture of the owner's live accounts.
      const box=await page.locator('.work-console').boundingBox(),left=Math.max(0,Math.floor(box.x)-4),top=Math.max(0,Math.floor(box.y)-16);
      const raw=await page.screenshot({clip:{x:left,y:top,width:Math.min(width-left,Math.ceil(box.width)+8),height:420},animations:'disabled'});
      const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));sharp.concurrency(1);
      const directory=path.join(web,'themes','previews');fs.mkdirSync(directory,{recursive:true});
      await sharp(raw).resize({width:600}).webp({quality:90}).toFile(path.join(directory,id+'.webp'));
     }
     report.cases.push({width,view,id,elements:current.boxes.length,textRanges:current.text.length,overflow:current.overflow,differences,detachedOrnaments:ornaments});
     if(view==='profile'){
      const clearance=await page.evaluate(()=>{
       const bar=document.querySelector('.profile-section-heading'),b=bar.getBoundingClientRect(),heading=bar.querySelector('h3').getBoundingClientRect(),caption=bar.querySelector('span').getBoundingClientRect();
       const table=document.querySelector('.table-wrap'),cells=[...table.querySelectorAll('thead th')],visible=cells.filter(el=>el.getBoundingClientRect().width);
       const footers=[...document.querySelectorAll('.profile-average-grid section')].map(section=>{const s=section.getBoundingClientRect(),footer=section.querySelector('small').getBoundingClientRect();return s.bottom-footer.bottom;});
       return {headingLeft:heading.left-b.left,headingTop:heading.top-b.top,captionRight:b.right-caption.right,footers,table:visible.map(el=>{const s=getComputedStyle(el);return {left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),top:parseFloat(s.paddingTop)};})};
      });
      assert.ok(clearance.headingLeft>=12&&clearance.headingTop>=7&&clearance.captionRight>=12,id+': section labels sit inside their bar');
      assert.ok(clearance.footers.every(gap=>gap>=12),id+': metric footnotes clear the lower frame');
      if(clearance.table.length){assert.ok(clearance.table.every(cell=>cell.left>=14&&cell.right>=14&&cell.top>=12));assert.ok(clearance.table[0].left>=18&&clearance.table.at(-1).right>=18,id+': outer table text clears the sculpted corners');}
      report.cases.at(-1).readingClearance=clearance;
     }
     if(id!=='default'){
      const rims=await page.evaluate(()=>{
       const selectors='.profile-commanders,.profile-results,.profile-region,.live-lobby .live-team-group,.table-wrap,.profile-average-grid,.pick-opponent,.sounds-assigned,.sounds-recordings,.combat-card,.mark-card,.profile-portrait-frame,.profile-portrait-frame .commander-portrait,.profile-best-identity .commander-portrait,.live-lobby .native-command-deck .commander-portrait';
       return [...document.querySelectorAll(selectors)].filter(el=>el.getBoundingClientRect().width).map(el=>{const s=getComputedStyle(el);return {element:el.className,colors:[s.borderTopColor,s.borderRightColor,s.borderBottomColor,s.borderLeftColor]};});
      });
      assert.ok(rims.every(rim=>rim.colors.every(color=>color==='rgba(0, 0, 0, 0)')),id+'/'+view+': native artwork owns the rim without a second solid rectangle');
      report.cases.at(-1).singleRimElements=rims.length;
     }
     if(width===1600&&view==='profile'&&id!=='default'&&id!=='fenix'){
      const interior=await page.evaluate(()=>{
       const card=document.querySelector('.profile-commanders'),summary=document.querySelector('.profile-results'),frame=getComputedStyle(card,'::before'),small=getComputedStyle(summary,'::before');
       const table=document.querySelector('.table-wrap'),tableFrame=getComputedStyle(table,'::before');
       const side=document.querySelector('.sidebar'),sideBox=side.getBoundingClientRect(),art=getComputedStyle(side,'::after'),artTop=sideBox.bottom-parseFloat(art.bottom)-parseFloat(art.height);
       const layers=Object.fromEntries(['.table-wrap','.profile-portrait-frame','.profile-portrait-frame .commander-portrait','.profile-favourite-top'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return [selector,{border:s.border,borderColor:s.borderColor,borderImage:s.borderImageSource,outline:s.outline,shadow:s.boxShadow}];}));
       return {source:frame.borderImageSource,width:parseFloat(frame.borderImageWidth),secondaryWidth:parseFloat(small.borderImageWidth),pointer:frame.pointerEvents,shadow:getComputedStyle(card).boxShadow,tableInsets:[tableFrame.top,tableFrame.right,tableFrame.bottom,tableFrame.left].map(parseFloat),layers,sidebar:{background:art.backgroundImage,pointer:art.pointerEvents,navClearance:artTop-side.querySelector('nav').getBoundingClientRect().bottom,dockClearance:side.querySelector('.sidebar-bottom').getBoundingClientRect().top-artTop-parseFloat(art.height)}};
      });
      assert.ok(interior.source.includes(id+'-identity-frame.svg'),'Interior has its own connected faction contour');
      assert.ok(interior.width>interior.secondaryWidth&&interior.secondaryWidth>=14,'Main and subordinate wells have distinct complete bezels');
      assert.equal(interior.pointer,'none');assert.ok(interior.shadow.includes('inset'),'Information well has recessed lighting');
      assert.ok(interior.tableInsets.every(value=>value>=0),'Scrollable table frame stays inside its clipping box');
      assert.ok(!interior.layers['.profile-favourite-top'].shadow.includes(' -1px '),'Heading has one bottom divider, without a second inset rail');
      assert.equal(interior.sidebar.pointer,'none');assert.ok(interior.sidebar.navClearance>=8&&interior.sidebar.dockClearance>=8,'Native art stays inside unused sidebar space');
      if(id==='arcade')assert.ok(interior.sidebar.background.includes('joystick_ball_arcadecabinetpurple'),'Arcade native joystick is painted');
      await page.emulateMedia({forcedColors:'active'});
      const contrast=await page.evaluate(()=>{const card=document.querySelector('.profile-commanders');return {background:getComputedStyle(card).backgroundImage,shadow:getComputedStyle(card).boxShadow,frame:getComputedStyle(card,'::before').display};});
      assert.deepEqual(contrast,{background:'none',shadow:'none',frame:'none'},'Forced colours removes decorative layers');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar'),'::after').display),'none','Native sidebar scenery is decorative in forced colours');
      assert.notEqual(await page.locator('.table-wrap').first().evaluate(el=>getComputedStyle(el).borderTopColor),'rgba(0, 0, 0, 0)','Forced colours restores a visible table boundary');
      await page.emulateMedia({forcedColors:'none'});report.cases.at(-1).interior={...interior,forcedColors:true};
     }
     if(width===1600&&view==='profile'&&id==='fenix'){
      await page.emulateMedia({reducedMotion:'no-preference'});
      const card=page.locator('.profile-commanders');
      const effect=()=>{
       const card=document.querySelector('.profile-commanders'),s=getComputedStyle(card),p=getComputedStyle(card,'::after');
       return {background:s.backgroundImage,opacity:+p.opacity,pointer:p.pointerEvents,duration:p.transitionDuration,shadow:s.boxShadow};
      };
      const idle=await page.evaluate(effect);assert.ok(idle.background.includes('fenix-matrix.svg'));assert.equal(idle.pointer,'none');
      const commandSocket=await page.evaluate(()=>{const s=getComputedStyle(document.querySelector('.profile-portrait-frame'),'::after');return {pointer:s.pointerEvents,slice:s.borderImageSlice};});assert.equal(commandSocket.pointer,'none');assert.ok(!commandSocket.slice.includes('fill'),'Command socket leaves portrait centre clear');
      await card.hover({position:{x:200,y:100}});
      await page.waitForFunction(()=>+getComputedStyle(document.querySelector('.profile-commanders'),'::after').opacity>.98);
      const hover=await page.evaluate(effect);assert.equal(hover.duration,'0.16s');
      assert.ok(await page.evaluate(()=>getComputedStyle(document.querySelector('.profile-commanders'),'::after').backgroundImage.includes('fenix-circuit-light.svg')),'Projected routes stay on the card feedback layer');
      if(captureStills){await card.screenshot({path:path.join(outputRoot,'skin-fenix-matrix-hover.png'),animations:'disabled'});report.screenshots.push('skin-fenix-matrix-hover.png');}
      await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await page.evaluate(effect)).duration,'0s');
      await page.emulateMedia({forcedColors:'active'});
      const contrast=await page.evaluate(effect);assert.equal(contrast.background,'none');assert.equal(contrast.shadow,'none');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar'),'::after').display),'none');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.profile-portrait-frame'),'::after').display),'none');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.page-head')).backgroundImage),'none');
      await page.emulateMedia({reducedMotion:'reduce',forcedColors:'none'});await page.mouse.move(0,0);
      const sigil=await page.evaluate(()=>{
       const side=document.querySelector('.sidebar'),r=side.getBoundingClientRect(),s=getComputedStyle(side,'::after');
       const y=r.bottom-parseFloat(s.bottom)-parseFloat(s.height),nav=side.querySelector('nav').getBoundingClientRect(),dock=side.querySelector('.sidebar-bottom').getBoundingClientRect();
       return {visible:s.content==='""'&&s.display!=='none',navigationClearance:y-nav.bottom,dockClearance:dock.top-y-parseFloat(s.height),border:s.borderImageSource,pointer:s.pointerEvents};
      });
      assert.ok(sigil.visible&&sigil.navigationClearance>=8&&sigil.dockClearance>=8,'Purifier sigil stays in unused sidebar space: '+JSON.stringify(sigil));
      assert.equal(sigil.border,'none');assert.equal(sigil.pointer,'none');
      report.purifierEffects={matrixVisible:true,hoverFeedback:true,reducedMotion:true,forcedColors:true,sigil};
     }
     if(captureStills&&(lobbyOnly||width===1600&&view==='profile'||width===375&&view==='picks'&&id==='fenix')){
      const filename='skin-'+id+'-'+view+'-'+width+'.png';await page.screenshot({path:path.join(outputRoot,filename),animations:'disabled',fullPage:width===1600&&id==='fenix'});report.screenshots.push(filename);
     }
     if(lobbyOnly&&id!=='default'){
      const paint=await page.evaluate(()=>({
       decks:[...document.querySelectorAll('.live-hero-strip')].map(el=>{const s=getComputedStyle(el);return {image:s.borderImageSource,background:s.backgroundImage,color:s.backgroundColor,shadow:s.boxShadow};}),
       slots:[...document.querySelectorAll('.live-slot')].map(el=>getComputedStyle(el).backgroundImage),
       frames:[...document.querySelectorAll('.live-team-group')].map(el=>({overflow:getComputedStyle(el).overflow,art:getComputedStyle(el,'::before').borderImageSource})),
       portraits:[...document.querySelectorAll('.live-hero-strip .commander-portrait')].map(el=>{const b=el.getBoundingClientRect();return [b.width,b.height];})
      }));
      report.cases.at(-1).lobbyPaint=paint;
      assert.ok(paint.decks.length>=12,'Both history columns exist for six players');
      assert.ok(paint.decks.every(s=>s.image==='none'&&s.background==='none'&&s.color==='rgba(0, 0, 0, 0)'&&s.shadow==='none'),'History strips have no full-column command casing');
      assert.ok(paint.slots.every(s=>s==='none'),'Player separators contain no stretched console rails');
      const frameFile=id==='fenix'?'fenix-inset-frame.svg':id+'-identity-frame.svg';
      assert.ok(paint.frames.every(s=>s.overflow==='visible'&&s.art.includes(frameFile)),'Complete themed inset team corners remain visible');
      assert.ok(paint.portraits.every(([w,h])=>w===24&&h===24),'Commander portraits retain Default dimensions');
     }
    }
    console.log(JSON.stringify({width,view,cases:styles.length+1,failures:report.cases.filter(item=>item.width===width&&item.view===view&&(item.differences.length||item.overflow||item.detachedOrnaments.length)).length}));
    // Preserve completed case evidence if the resource guard stops a long run.
    fs.writeFileSync(path.join(outputRoot,reportName),JSON.stringify({...report,inProgress:true},null,2));
   }
   if(!outerFramesOnly&&!lobbyOnly){
   await apply('default');await page.locator('#settings-open').click();const baseline=await page.evaluate(measure);
   await page.locator('.appearance-thumbnail img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
   const previews=await page.evaluate(()=>[...document.querySelectorAll('.appearance-choice')].map(el=>{const thumb=el.querySelector('.appearance-thumbnail'),img=thumb.querySelector('img'),s=getComputedStyle(thumb);return {id:el.dataset.stylePreview,src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth===600,frame:s.borderImageSource,width:img.clientWidth,height:img.clientHeight,ratio:img.naturalWidth/img.naturalHeight,labelFits:el.scrollWidth<=el.clientWidth+1};}));
   assert.equal(previews.length,20);assert.ok(previews.every(p=>p.src==='/themes/previews/'+p.id+'.webp'&&p.loaded&&p.frame==='none'&&p.labelFits),'Every theme, including Default and Fenix, shows its own loaded interface capture without a legacy frame overlay');
   report.previews=previews;
   for(const id of styles.map(skin=>skin.id)){
    await apply(id);const current=await page.evaluate(measure);report.cases.push({width,view:'settings',id,elements:current.boxes.length,textRanges:current.text.length,differences:JSON.stringify(current)===JSON.stringify(baseline)?[]:[{message:'Settings geometry differs'}]});
    if(captureStills&&width===1000&&['fenix','arcade','alarak'].includes(id)){const filename='skin-'+id+'-settings-'+width+'.png';await page.screenshot({path:path.join(outputRoot,filename),animations:'disabled'});report.screenshots.push(filename);}
   }
   if(settingsOnly){
    // The image stays inside its existing label: selecting it must still save
    // the radio choice, with no separate decorative click target intercepting it.
    await page.locator('.appearance-choice[data-style-preview="default"] img').click();
    await page.waitForFunction(()=>graphicalStyle==='default'&&!graphicalStyleBusy);
    await page.locator('.appearance-choice[data-style-preview="alarak"] img').click();
    await page.waitForFunction(()=>graphicalStyle==='alarak'&&!graphicalStyleBusy);
    assert.equal(await page.locator('input[name="graphical-style"]:checked').inputValue(),'alarak');
    await page.locator('input[name="graphical-style"][value="alarak"]').focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>graphicalStyle==='ihanrii'&&!graphicalStyleBusy);
    report.previewSelection={imageClick:true,keyboard:true};
   }
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  report.failures=report.cases.filter(item=>item.differences.length||item.overflow||item.detachedOrnaments?.length);report.success=report.failures.length===0;
  console.log(JSON.stringify({success:report.success,cases:report.cases.length,failures:report.failures.length}));
  assert.ok(report.success,JSON.stringify(report.failures.slice(0,2)));
 }catch(error){report.error=error.stack;throw error;}finally{await browser?.close();fs.writeFileSync(path.join(outputRoot,reportName),JSON.stringify(report,null,2));}
}
module.exports=run;
if(require.main===module)run({sourceRoot:process.env.DSC_SOURCE_ROOT||path.resolve(__dirname,'..'),overrideRoot:process.env.DSC_WEB_OVERRIDE,outputRoot:__dirname,outerFramesOnly:process.env.DSC_SKIN_REVIEW_SCOPE==='outer-frames',lobbyOnly:process.env.DSC_SKIN_REVIEW_SCOPE==='lobby'}).catch(error=>{console.error(error);process.exitCode=1;});
