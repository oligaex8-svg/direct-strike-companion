'use strict';
// Application-authored connected bezels and engraved surfaces. Original SC2
// scenery/flavour textures are copied byte-for-byte and recorded separately.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'wwwroot/themes');
const profiles=[
 ['protoss','temple','#8c713d','#403a29','#ddc68d','#62bfe7','artanis'],
 ['nerazim','glaive','#64516f','#211c2b','#b49ac5','#65d5bd','vorazun'],
 ['alarak','blade','#51434a','#20171d','#947f84','#ed4d33','alarak'],
 ['ihanrii','stone','#697d83','#283e43','#bed3cd','#63c7b0'],
 ['terran','military','#5b6c66','#25322e','#b3c2ac','#67c195','raynor'],
 ['nova','covert','#425969','#172a37','#88b5ce','#54cdf1','nova'],
 ['mira','scrap','#84606b','#412631','#d5aaa6','#f27ba7','hanandhorner'],
 ['machined','foundry','#6b7880','#293238','#b9bfc1','#d9a652','swann'],
 ['tyrador','ceramic','#877c97','#3c334d','#e2d8e6','#c082e3'],
 ['zerg','hive','#745441','#30202b','#b59068','#b36aca','kerrigan'],
 ['abathur','evolution','#5c7146','#20332b','#adbf80','#a4dc4e','abathur'],
 ['dehaka','primal','#6b6c51','#2a352b','#aeb691','#65af8d','dehaka'],
 ['cerberus','infested','#8b6650','#302b2a','#caa687','#64b7ab'],
 ['mecha','simulant','#627983','#25343e','#bbd3db','#ed9b39'],
 ['arcade','cabinet','#77638e','#30213e','#c9b6dd','#cf5cf4'],
 ['classic-terran','classic-steel','#697777','#2b3535','#a5b8ab','#7bcc99'],
 ['classic-protoss','classic-gold','#927e44','#393523','#e2cd82','#62c9ed'],
 ['classic-zerg','classic-chitin','#885139','#3e2425','#c58b60','#e8a153']
].map(([id,kind,metal,dark,light,energy,scene])=>({id,kind,metal,dark,light,energy,scene}));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const native=[];
function original(name){
 const source=path.join(root,'assets/themes/identity-native',name+'.png'),bytes=fs.readFileSync(source),filename='identity-native-'+name+'.png';
 fs.copyFileSync(source,path.join(out,filename));
 if(!native.some(a=>a.name===name))native.push({name,source:path.relative(root,source).replaceAll('\\','/'),runtime:'themes/'+filename,url:'https://dist.sc2arcade.com/star-assets/ui-png/'+name+'.png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:hash(bytes)});
 return {filename,bytes};
}
function contours(kind){
 if(kind==='evolution')return {outer:'M28 3C47 6 60 0 80 3C100 0 113 6 132 3Q157 2 157 26C151 45 163 60 156 78Q154 98 132 97C110 94 102 100 80 97C58 99 42 93 28 97Q2 98 3 81C-3 52 8 45 3 25Q2 2 28 3Z',inner:'M27 14C49 16 63 11 80 14C102 11 115 16 133 14Q146 14 146 27C141 47 150 60 145 77Q145 86 133 86C110 83 100 89 80 86C59 89 43 83 27 86Q14 87 14 77C10 53 19 46 14 27Q14 14 27 14Z'};
 if(['temple','glaive','ceramic','cabinet'].includes(kind))return {
  outer:kind==='glaive'?'M23 2H137Q153 2 158 18V82Q153 98 137 98H23Q7 98 2 82V18Q7 2 23 2Z':'M18 2H142Q158 2 158 18V82Q158 98 142 98H18Q2 98 2 82V18Q2 2 18 2Z',
  inner:'M20 12H140Q148 12 148 20V80Q148 88 140 88H20Q12 88 12 80V20Q12 12 20 12Z'};
 if(['hive','evolution','classic-chitin'].includes(kind))return {
  outer:'M22 3C41 0 54 4 80 2C110 0 124 4 139 3C150 3 159 12 157 25C155 41 160 63 157 78C159 91 148 99 136 97C118 95 102 100 80 98C56 96 40 100 22 97C8 99 0 88 3 76C5 59 0 40 3 24C1 10 9 1 22 3Z',
  inner:'M23 14C45 12 58 15 80 13C103 11 122 15 137 14Q147 14 146 24C144 41 148 62 146 77Q147 87 137 86C118 84 102 89 80 87C56 85 43 89 23 86Q13 87 14 77C16 58 12 42 14 24Q13 14 23 14Z'};
 if(['stone','classic-steel','classic-gold'].includes(kind))return {
  outer:'M12 2H148V6H154V12H158V88H154V94H148V98H12V94H6V88H2V12H6V6H12Z',
  inner:'M19 12H141V16H148V84H141V88H19V84H12V16H19Z'};
 if(kind==='primal')return {outer:'M27 3L41 1L52 5L69 2L91 3L109 1L126 5L137 2Q151 5 157 22L153 34L158 46L155 63L159 77Q151 92 135 98L122 94L107 99L92 96H69L50 99L37 95L24 98Q8 92 2 77L6 64L1 48L5 33L2 23Q7 8 27 3Z',inner:'M27 15L52 14L70 15H92L110 13L134 15Q145 19 145 27L144 48L146 74Q142 84 133 85L108 87L90 85H70L51 87L27 85Q16 81 15 73L16 49L14 27Q18 18 27 15Z'};
 const bevel=kind==='blade'?19:kind==='scrap'?15:10;
 return {outer:`M${bevel} 2H${160-bevel}L158 ${bevel}V${100-bevel}L${160-bevel} 98H${bevel}L2 ${100-bevel}V${bevel}Z`,inner:'M21 12H139L148 21V79L139 88H21L12 79V21Z'};
}
function fittings(p){
 const {kind,energy:e,light:l}=p;
 const bolts=[['military','foundry','scrap','classic-steel'].includes(kind),[10,150].flatMap(x=>[10,90].map(y=>`<circle cx="${x}" cy="${y}" r="3.3" fill="#10191b" stroke="${l}" stroke-opacity=".6"/><path d="M${x-2} ${y}h4" stroke="${l}" stroke-opacity=".7"/>`)).join('')];
 if(bolts[0])return bolts[1]+`<path d="M31 6h20m58 0h20M31 94h20m58 0h20" stroke="${e}" stroke-width="2" opacity=".65"/>`;
 if(['hive','evolution','classic-chitin'].includes(kind))return [0,1,2,3].map(i=>`<path d="M${23+i*5} 3q-13 5-18 20M${137-i*5} 3q13 5 18 20M${23+i*5} 97q-13-5-18-20M${137-i*5} 97q13-5 18-20" fill="none" stroke="${l}" stroke-opacity="${.38-i*.06}" stroke-width="1.6"/>`).join('')+`<path d="M5 37q8 12 0 26M155 37q-8 12 0 26" fill="none" stroke="${e}" stroke-width="2" opacity=".65"/>`;
 if(kind==='primal')return ['','translate(160 0) scale(-1 1)','translate(0 100) scale(1 -1)','translate(160 100) scale(-1 -1)'].map(t=>`<g transform="${t}"><path d="M3 31Q6 9 31 3L27 9Q15 12 10 29L8 37Z" fill="${l}" opacity=".72"/><path d="M8 25L16 13M13 19L23 8M19 12L29 7" stroke="${p.dark}" stroke-width="1.8"/><path d="M4 40L8 34M3 52L7 49" stroke="${e}"/></g>`).join('');
 if(kind==='blade')return `<path d="M4 28L27 5H48M156 28L133 5H112M4 72L27 95H48M156 72L133 95H112" stroke="${e}" fill="none" stroke-width="2"/>`+['','translate(160 0) scale(-1 1)','translate(0 100) scale(1 -1)','translate(160 100) scale(-1 -1)'].map(t=>`<g transform="${t}"><path d="M2 25L22 2H36L26 9L20 9L9 20L8 30Z" fill="${p.dark}" stroke="${l}" stroke-width=".7"/><path d="M6 23L23 6H29" fill="none" stroke="${e}" stroke-width="2"/></g>`).join('');
 if(kind==='glaive')return ['','translate(160 0) scale(-1 1)','translate(0 100) scale(1 -1)','translate(160 100) scale(-1 -1)'].map(t=>`<g transform="${t}"><path d="M4 29Q4 6 31 3L21 10L27 12Q11 15 11 31L7 26Z" fill="${p.dark}" stroke="${l}" stroke-opacity=".7"/><path d="M6 24Q8 9 24 6L19 11" fill="none" stroke="${e}" stroke-width="1.6"/></g>`).join('');
 if(['stone','classic-gold'].includes(kind))return `<path d="M7 24V12H13V7H29M153 24V12H147V7H131M7 76V88H13V93H29M153 76V88H147V93H131" fill="none" stroke="${l}" stroke-width="2"/><path d="M34 6h8m76 0h8M34 94h8m76 0h8" stroke="${e}" stroke-width="2"/>`;
 if(kind==='infested')return `<path d="M8 25q12-3 13-17M152 25q-12-3-13-17M8 75q12 3 13 17M152 75q-12 3-13 17" fill="none" stroke="${e}" stroke-width="2.5"/><path d="M37 5l5 4m5-4l5 4M108 91l5 4m5-4l5 4" stroke="${l}"/>`;
 if(kind==='simulant')return `<path d="M6 28V12L12 6H30M154 28V12L148 6H130M6 72V88L12 94H30M154 72V88L148 94H130" fill="none" stroke="${l}" stroke-width="2"/>`;
 if(kind==='cabinet')return `<path d="M20 6H140M20 94H140M6 23V77M154 23V77" stroke="${e}" stroke-width="2" opacity=".8"/><circle cx="10" cy="13" r="2" fill="${e}"/><circle cx="150" cy="87" r="2" fill="${e}"/>`;
 return `<path d="M6 29V18Q6 6 18 6H29M154 29V18Q154 6 142 6H131M6 71V82Q6 94 18 94H29M154 71V82Q154 94 142 94H131" fill="none" stroke="${e}" stroke-width="1.5" opacity=".8"/>`;
}
function frame(p){
 const c=contours(p.kind),nativeFittings=[];
 const organic=['hive','evolution','primal','infested','classic-chitin'].includes(p.kind);
 const highlights=organic?{edge:.34,rim:.45,lip:.6}:p.kind==='covert'?{edge:.4,rim:.52,lip:.65}:{edge:.65,rim:1,lip:1};
 const grain=organic?Array.from({length:10},(_,i)=>`<path d="M${25+i*12} 0q-8 7-3 15M${25+i*12} 100q7-7 2-15" stroke="${i%2?p.dark:p.light}" stroke-opacity=".25" stroke-width="1.4" fill="none"/>`).join(''):'';
 if(p.id==='alarak'||p.id==='mecha'){
  const name=p.id==='alarak'?'ui_console_flavor_crystal_forged':'ui_console_flavor_ringlight_simulant',a=original(name);
  nativeFittings.push(`<image href="data:image/png;base64,${a.bytes.toString('base64')}" x="143" y="3" width="13" height="13"/>`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><defs><linearGradient id="m" x2="0" y2="1"><stop stop-color="${p.light}" stop-opacity="${highlights.rim}"/><stop offset=".06" stop-color="${p.metal}"/><stop offset=".2" stop-color="${p.dark}"/><stop offset=".68" stop-color="${p.dark}"/><stop offset=".9" stop-color="${p.metal}"/><stop offset=".97" stop-color="${p.light}" stop-opacity="${highlights.rim}"/><stop offset="1" stop-color="${p.metal}"/></linearGradient><linearGradient id="lip" x2="0" y2="1"><stop stop-color="#010608"/><stop offset=".55" stop-color="${p.dark}"/><stop offset="1" stop-color="${p.light}" stop-opacity="${highlights.lip}"/></linearGradient><clipPath id="rim"><path d="${c.outer} ${c.inner}" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><path d="${c.outer} ${c.inner}" fill="url(#m)" fill-rule="evenodd"/><g clip-path="url(#rim)">${grain}</g><path d="${c.outer}" fill="none" stroke="${p.light}" stroke-opacity="${highlights.edge}"/><path d="${c.inner}" fill="none" stroke="url(#lip)" stroke-width="2.4"/><g clip-path="url(#rim)">${fittings(p)}</g>${nativeFittings.join('')}</svg>\n`;
}
function surface(p){
 const {kind,energy:e}=p;let art='';
 const line=d=>`<path d="${d}" fill="none" stroke="${e}"/>`;
 const materialIds=['mecha','machined','zerg','dehaka','classic-zerg','cerberus','mira'];
 if(materialIds.includes(p.id)){
  // Companion-authored shallow material relief. Filled shading carries identity;
  // sparse scratches/fibres remain subordinate to the existing masks and data.
  const fill=(d,color='url(#material)',opacity=1)=>`<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
  const spot=(x,y,rx,ry,color,opacity)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}"/>`;
  const scuff=(d,color=p.light,opacity=.24,width=.7)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round"/>`;
  const base=p.id==='mira'?'#736653':p.id==='cerberus'?'#665e53':p.metal;
  art=`<defs><linearGradient id="material" x1=".1" y1="0" x2=".85" y2="1"><stop stop-color="${p.light}" stop-opacity=".72"/><stop offset=".23" stop-color="${base}"/><stop offset=".7" stop-color="${p.dark}"/><stop offset="1" stop-color="${base}" stop-opacity=".65"/></linearGradient><linearGradient id="recess" x2=".4" y2="1"><stop stop-color="#020609"/><stop offset=".7" stop-color="${p.dark}"/><stop offset="1" stop-color="${base}" stop-opacity=".4"/></linearGradient><radialGradient id="local-energy"><stop stop-color="${e}" stop-opacity=".85"/><stop offset=".3" stop-color="${e}" stop-opacity=".3"/><stop offset="1" stop-color="${e}" stop-opacity="0"/></radialGradient><radialGradient id="heat-stain"><stop stop-color="#d69045" stop-opacity=".6"/><stop offset=".45" stop-color="#7f482f" stop-opacity=".5"/><stop offset="1" stop-color="#211e25" stop-opacity="0"/></radialGradient></defs>`;
  if(p.id==='dehaka'){
   art+=fill('M284 8C328 21 359 8 384 0L405 42C379 64 332 69 292 49Z')+fill('M315 64C359 77 401 59 431 35L451 91C426 119 376 130 329 111Z')+fill('M301 124C339 115 381 144 409 130L433 174C395 203 352 198 313 172Z')+fill('M414 112C443 112 465 92 480 69V202C453 211 430 190 426 168Z');
   art+=fill('M291 51C333 72 377 65 405 44L412 52C379 77 335 83 299 63Z','url(#recess)')+fill('M325 112C367 134 405 126 431 96L439 109C410 142 365 145 329 126Z','url(#recess)');
   art+=scuff('M305 22q32 15 58 4M338 81q32 9 54-8M325 141q29-3 53 13',p.light,.28,2)+scuff('M307 53l5 9m7-7 4 10m8-6 2 9M374 129l1 10m9-13 3 10m8-14 2 9',p.light,.22,1.2);
  }else if(p.id==='classic-zerg'){
   art+=fill('M289 34C321 3 365 9 385 41C397 65 378 95 350 103C313 111 280 81 289 34Z')+fill('M349 102C388 74 437 94 443 133C452 171 415 194 381 178C349 164 332 129 349 102Z')+fill('M431 13C456 0 479 17 489 47V118C453 123 425 90 423 63Z')+fill('M286 137C320 114 352 142 358 169C366 201 333 226 303 213Z');
   art+=fill('M311 111C340 119 348 104 372 98C356 119 360 139 349 154C332 141 313 143 297 153Z','url(#recess)')+fill('M418 82C441 106 441 128 452 151L461 136C451 113 451 87 433 68Z','url(#recess)');
   art+=scuff('M303 43C315 25 346 23 362 39M365 122C384 106 410 114 419 133',p.light,.26,3)+spot(346,109,23,13,'url(#local-energy)',.32)+spot(450,132,15,26,'url(#local-energy)',.23);
  }else if(p.id==='zerg'){
   art+=fill('M286 17C339 3 363 34 393 49C432 67 453 29 480 36V125C444 147 412 121 379 135C342 150 307 119 289 93Z',p.dark,.85)+fill('M310 122C344 106 376 152 410 141C448 125 468 157 480 178V240H351C329 214 295 163 310 122Z');
   art+=fill('M480 56C439 64 449 101 416 110C386 118 367 100 346 106C371 113 384 129 413 123C454 115 449 79 480 74Z',p.metal,.88)+fill('M416 116C403 151 433 170 437 209L425 234C431 195 407 170 404 146L390 167L375 173C389 155 394 136 402 119Z',p.metal,.75)+fill('M346 106C330 87 340 64 320 50C350 58 340 90 359 109Z',p.metal,.7);
   art+=spot(415,119,35,24,'url(#local-energy)',.62)+spot(430,198,15,29,'url(#local-energy)',.27)+spot(365,72,25,9,p.light,.09)+scuff('M411 105q19-2 24-17M405 146q-2 18 10 31',p.light,.25,2.3);
  }else if(p.id==='cerberus'){
   art+=fill('M286 15H392L414 42V116L377 137H294Z')+fill('M302 148L384 135L428 163V234H314Z')+fill('M421 18L480 33V240H442L431 166L449 108Z',base,.7);
   art+=fill('M387 35L408 52V111L385 126L390 145L426 167L432 216L418 232L416 180L372 153L367 128L392 105Z','url(#recess)');
   art+=fill('M480 58C450 55 461 88 432 107C411 122 431 137 418 152C404 166 430 180 442 190L452 180C429 166 449 155 435 137C427 121 452 113 457 95C469 79 480 91 480 58Z',p.dark,.95)+fill('M480 67C456 69 466 93 439 113C428 124 447 138 430 157C425 166 437 172 447 176C431 158 457 151 447 130C443 116 466 109 468 94C470 84 478 84 480 85Z',p.metal,.8);
   art+=fill('M323 47h38v9h-38ZM327 65h29v7h-29ZM331 81h20v6h-20Z','url(#recess)')+spot(438,123,26,43,'url(#local-energy)',.63)+scuff('M309 28l45 4m-30 126 38-7',p.light,.22,1);
  }else if(p.id==='mecha'){
   art+=fill('M284 12L375 5L404 41L385 102L301 115L282 83Z')+fill('M309 129L381 115L420 144L409 222L324 238L300 203Z')+fill('M416 9L480 28V123L439 138L401 100Z',p.light,.28)+fill('M435 155L480 140V240H424Z',p.metal,.74);
   art+=fill('M302 45L362 28L380 48L367 78L313 92Z','url(#recess)')+fill('M328 158L378 144L396 162L384 202L339 212Z','url(#recess)')+fill('M388 104L415 109L431 145L421 165L404 144L384 133Z',p.dark,.93);
   art+=fill('M320 55L351 47L363 58L355 68L323 77Z',p.light,.22)+fill('M339 168L372 159L383 171L377 187L347 196Z',p.light,.19)+spot(409,132,15,29,'url(#local-energy)',.32)+scuff('M295 27l26-4m64 174 8-29M448 37l13 5',p.light,.32,1.2);
  }else if(p.id==='machined'){
   art+=fill('M277 15L384 0L415 46L395 105L290 124Z')+fill('M303 143L396 119L436 153L411 236H322Z')+fill('M423 13L480 0V240H438L453 160L415 107Z',base,.85);
   art+=fill('M304 53L369 33L389 51L376 84L311 105Z','url(#recess)')+fill('M326 166L387 147L411 163L394 210L339 221Z','url(#recess)')+fill('M401 85L426 82L442 117L430 163L410 151L422 118Z',p.dark,.9);
   art+=spot(431,133,46,64,'url(#heat-stain)',.9)+spot(434,133,19,33,'url(#local-energy)',.4)+fill('M424 99l8-2 8 20-4 10-5-12ZM421 142l5-7 6 4-3 20-8 2Z',p.metal,.85)+scuff('M299 28l52-9m-24 166 38-11m-31 19 25-7',p.light,.28,1.1);
  }else if(p.id==='mira'){
   art+=fill('M279 21L381 8L404 74L367 106L295 116Z')+fill('M304 137L371 111L416 147L401 231H320Z')+fill('M417 18L480 5V240H427L442 168L404 111Z','#6d6359',.86);
   art+=fill('M361 17L381 13L401 70L379 91L371 80L388 66Z','#5c4546',.85)+fill('M367 108L397 102L430 146L423 179L411 172L417 148L391 120L371 123Z','url(#recess)')+fill('M306 151L344 135L355 164L318 178Z','#85715b',.8);
   art+=fill('M426 43l24-8 8 27-9 4-5-15-13 5ZM339 191l32-9 4 12-18 5-7 13-9-3Z','#b8954e',.6)+fill('M422 109Q446 128 436 154L430 167L433 145Q436 129 415 118Z','#a47a51',.72);
   art+=scuff('M302 38l31-7m-25 13 14-4M332 158l11-4m-16 10 20-7M455 188l15-16m-19 22 11-12',p.light,.42,1.3)+spot(385,61,3,3,'#c5b8a1',.65)+spot(320,143,2.5,2.5,'#c5b8a1',.55)+spot(408,202,3,3,'#c5b8a1',.5);
  }
 }
 else if(['temple','classic-gold'].includes(kind))art=line('M266 240V120Q266 27 352 27Q438 27 438 120V240M278 240V120Q278 43 352 43Q426 43 426 120V240M244 240V124Q244 7 352 7Q460 7 460 124V240')+line('M307 155L352 110L397 155L352 200ZM352 72V100M352 211V240');
 else if(kind==='glaive')art=line('M480 18Q345 29 280 161Q354 89 480 87M480 40Q354 51 303 137M480 224Q372 225 325 158Q382 201 480 183')+line('M382 105L404 126L382 147L360 126ZM420 109l11 17-11 17');
 else if(kind==='blade')art=line('M273 240L305 109L323 205L346 26L379 240M285 240L307 142L324 223L347 81L367 240M398 240L441 78L472 240M412 240L441 125L459 240')+`<path d="M334 179L346 46L367 179Z" fill="${e}" opacity=".12"/>`;
 else if(kind==='stone')art=line('M260 240V191H289V147H322V101H351V58H384V16H480M282 240V210H313V165H345V121H375V79H408V36H480M391 240V199H420V154H452V110H480')+line('M357 146h17v17h-17ZM420 59h17v17h-17Z');
 else if(kind==='hive'){
  // Authored companion artwork: uneven membranes and forked vascular ridges,
  // rather than a repeated lattice. Existing masks keep the reading area quiet.
  const membranes=[
   'M480 9C452 24 439 41 424 70C407 91 380 87 366 72C352 55 357 34 378 21C405 6 443 13 480 9Z',
   'M480 91C457 81 429 92 415 117C406 136 414 156 434 164C450 171 467 160 480 150Z',
   'M480 187C455 170 428 172 410 193C396 209 375 214 357 207C379 237 432 247 480 229Z'
  ];
  const veins=[
   'M487 42C463 45 447 56 429 77C411 100 391 105 367 99C345 93 329 77 307 75',
   'M429 77C427 50 413 34 389 25C378 20 371 10 368-6',
   'M367 99C355 114 348 133 352 154C354 166 346 180 328 192',
   'M487 214C463 199 447 180 437 153C428 131 411 119 391 116',
   'M437 153C414 160 399 179 394 202C391 221 377 236 359 246',
   'M391 116C384 132 371 141 352 154'
  ];
  const branches=[
   'M464 50C457 34 460 19 469 4M447 59C442 75 448 86 461 91',
   'M414 40C427 32 432 22 429 10M389 25C376 32 373 43 379 53',
   'M407 96C399 81 388 73 375 75M340 88C333 103 323 108 311 106',
   'M350 138C333 137 321 145 313 160M343 179C358 184 365 194 363 208',
   'M452 182C468 176 476 169 482 157M424 136C437 125 448 124 460 131',
   'M407 177C395 170 384 170 372 177M390 216C407 220 417 230 420 243'
  ];
  art=membranes.map(d=>`<path d="${d}" fill="${e}" opacity=".07"/>`).join('')+
   `<g fill="none" stroke="${p.dark}" stroke-width="6" stroke-linecap="round">${veins.map(d=>`<path d="${d}"/>`).join('')}</g>`+
   `<g fill="none" stroke="${e}" stroke-width="1.8" stroke-linecap="round" opacity=".65">${veins.map(d=>`<path d="${d}"/>`).join('')}</g>`+
   `<g fill="none" stroke="${p.light}" stroke-width=".8" stroke-linecap="round" opacity=".33">${branches.map(d=>`<path d="${d}"/>`).join('')}</g>`;
 }
 else if(['evolution','primal','infested','classic-chitin'].includes(kind)){
  const primal=kind==='primal';
  art=Array.from({length:7},(_,i)=>line(primal?`M${286+i*28} 240L${260+i*28} 161L${302+i*23} 97L${282+i*28} 0`:`M${260+i*31} 240C${200+i*37} 160 ${355+i*17} 110 ${282+i*30} 0`)).join('');
  if(kind==='evolution')art+=Array.from({length:7},(_,i)=>`<ellipse cx="${306+(i%3)*57}" cy="${35+Math.floor(i/3)*73}" rx="20" ry="29" fill="${e}" fill-opacity=".07" stroke="${e}"/><path d="M${306+(i%3)*57} ${22+Math.floor(i/3)*73}v25" stroke="${e}"/>`).join('');
  if(kind==='hive'||kind==='classic-chitin')art+=line('M286 53Q354 82 471 52M277 128Q370 99 480 132M302 207Q394 169 480 206');
  if(kind==='infested')art+=line('M290 42H402L437 77V192H480M303 50H396L429 83V192')+`<circle cx="429" cy="154" r="16" fill="${e}" fill-opacity=".12"/>`;
 }else if(kind==='cabinet')art=Array.from({length:9},(_,i)=>line(`M250 ${18+i*24}H480`)).join('')+line('M287 0V240M338 0V240M389 0V240M440 0V240')+`<rect x="315" y="40" width="131" height="150" rx="18" fill="${e}" fill-opacity=".08" stroke="${e}"/>`;
 else {
  const shift={covert:19,scrap:34,foundry:12,ceramic:8,simulant:28,military:42,'classic-steel':23}[kind]||20;
  art=Array.from({length:5},(_,i)=>line(`M${270+i*38} 240V${175-i*shift/3}L${288+i*38} ${157-i*shift/3}V${25+i*12}H480`)).join('');
  if(kind==='covert')art+=line('M397 47a47 47 0 1 0 0 94a47 47 0 1 0 0-94M397 32v24M397 132v24M335 94h24M435 94h24');
  if(kind==='scrap')art+=line('M255 18L355 58L480 22M265 206L361 172L480 204')+`<path d="M420 159l18-18m-8 27l18-18m-8 27l18-18" stroke="${e}" stroke-width="5"/>`;
  if(kind==='foundry'||kind==='simulant')art+=`<circle cx="407" cy="119" r="43" fill="${e}" fill-opacity=".06" stroke="${e}"/><circle cx="407" cy="119" r="32" fill="none" stroke="${e}" stroke-dasharray="8 5"/>`;
  if(kind==='ceramic')art+=`<path d="M310 0Q250 100 350 160T440 240M340 0Q280 100 380 160T470 240" fill="none" stroke="${e}" stroke-width="2"/>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><defs><linearGradient id="fade"><stop offset=".25" stop-color="white" stop-opacity="0"/><stop offset=".7" stop-color="white" stop-opacity=".6"/><stop offset="1" stop-color="white"/></linearGradient><linearGradient id="vertical" x2="0" y2="1"><stop stop-color="white"/><stop offset=".65" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="f"><rect width="480" height="240" fill="url(#fade)"/></mask><mask id="v"><rect width="480" height="240" fill="url(#vertical)"/></mask></defs><g mask="url(#f)"><g mask="url(#v)" opacity=".22" stroke-width="1.1">${art}</g></g></svg>\n`;
}
function build(){
 const tokens=[];
 for(const p of profiles){
  fs.writeFileSync(path.join(out,p.id+'-identity-frame.svg'),frame(p));
  fs.writeFileSync(path.join(out,p.id+'-identity-field.svg'),surface(p));
  const scene=p.scene?original('sc2_ui_coop_detail_background_'+p.scene):null;
  tokens.push(`:root[data-graphical-style=${p.id}]{--identity-frame:url('/themes/${p.id}-identity-frame.svg');--identity-field:url('/themes/${p.id}-identity-field.svg');--identity-scene:${scene?`url('/themes/${scene.filename}')`:'none'};--identity-energy:${p.energy};--identity-metal:${p.metal};--identity-dark:${p.dark};--identity-light:${p.light};--interior-pattern:var(--identity-field);--interior-pattern-size:480px 240px;--interior-light:${p.energy}19}`);
  tokens.push(`.appearance-choice[data-style-preview=${p.id}]{--identity-preview-frame:url('/themes/${p.id}-identity-frame.svg');--identity-preview-field:url('/themes/${p.id}-identity-field.svg');--identity-preview-dark:${p.dark}}`);
 }
 for(const name of ['ui_console_flavor_joystick_base_arcadecabinetpurple','ui_console_flavor_joystick_stick_arcadecabinetpurple','ui_console_flavor_joystick_ball_arcadecabinetpurple'])original(name);
 fs.writeFileSync(path.join(root,'wwwroot/theme-identity-tokens.css'),'/* Authored faction bezels and diagrams; unmodified native scenery. */\n'+tokens.join('\n')+'\n');
 const report={success:true,authored:{scope:'New code-native artwork; not SC2 exports',frameDimensions:[160,100],frameSlice:32,profiles:profiles.map(p=>({id:p.id,kind:p.kind,scene:p.scene||null,frame:'themes/'+p.id+'-identity-frame.svg',field:'themes/'+p.id+'-identity-field.svg'}))},native:{scope:'Original SC2 PNGs, copied byte-for-byte',index:'https://raw.githubusercontent.com/sc2-arcade-watcher/asset-explorer/main/site/list/ui.json',assets:native}};
 fs.writeFileSync(path.join(root,'assets/themes/identity-sources.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({success:true,themes:profiles.length,nativeAssets:native.length,authoredAssets:profiles.length*2}));
}
build();
