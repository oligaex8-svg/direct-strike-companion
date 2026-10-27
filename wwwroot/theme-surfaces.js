/* Authored material fields. Physical landmarks stay fixed; their own glass,
   heat and tissue respond to light. No additional interface objects. */
(()=>{
 'use strict';
 const root=document.documentElement,records=new Map(),cache=new Map();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
 const modes=['terran','nova','mira','machined','tyrador','classic-terran','protoss','nerazim','alarak','ihanrii','classic-protoss','arcade','zerg','abathur','dehaka','cerberus','mecha','classic-zerg'];
 let catalog=null,theme='',focused=document.hasFocus(),queued=false,raf=0,last=0,held=false;
 const vertex=`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=vec2((aPosition.x+1.)*.5,(1.-aPosition.y)*.5);gl_Position=vec4(aPosition,0.,1.);}`;
 const fragment=`precision highp float;
 varying vec2 vUV;uniform sampler2D uColor,uNormal,uMaterial,uReadable;
 uniform vec2 uOrigin,uSpan;uniform float uPhase,uMode,uStrength;
 const float TAU=6.28318530718;
 // A cached periodic flow field replaces per-pixel procedural hashing.
 float field(vec2 p){return texture2D(uMaterial,fract(p*.071)).b;}
 void main(){
  vec2 uv=uOrigin+vUV*uSpan;float t=uPhase*TAU;
  vec4 material=texture2D(uMaterial,uv);float emission=material.r,soft=material.g;
  vec2 orbit=vec2(cos(t),sin(t)),flow=vec2(field(uv*8.+orbit*1.4),field(uv.yx*9.-orbit));
  vec2 warp=vec2(0.);float power=1.,gloss=.08;vec3 tint=vec3(1.);
  // Each branch expresses a different material process in the painted anatomy.
  if(uMode<.5){power=.60+.80*field(uv*13.+orbit);gloss=.12;}
  else if(uMode<1.5){warp=(flow-.5)*.007*soft;power=.72+.65*field(uv*19.+orbit*2.);gloss=.40;}
  else if(uMode<2.5){power=.65+.95*field(uv*17.+orbit*3.);warp=(flow-.5)*.004*soft;gloss=.15;}
  else if(uMode<3.5){power=.78+.70*field(uv*8.+vec2(sin(t),cos(t))*2.);warp=vec2((flow.x-.5)*.006,0.)*soft;gloss=.16;}
  else if(uMode<4.5){warp=(flow-.5)*.008*soft;power=.95+.28*sin(t+uv.y*6.);gloss=.48;tint=vec3(1.+.05*sin(t),1.,1.+.04*cos(t));}
  else if(uMode<5.5){power=.96+.15*field(uv*65.+orbit*4.);gloss=.12;}
  else if(uMode<6.5){warp=(flow-.5)*.014*soft;power=.70+.75*field(uv*11.+orbit*2.);gloss=.33;}
  else if(uMode<7.5){warp=(flow-.5)*.012*soft;power=.60+.72*field(uv*6.+orbit);gloss=.25;}
  else if(uMode<8.5){warp=(flow-.5)*.012*soft;power=.58+1.05*field(uv*16.+orbit*2.6);gloss=.24;}
  else if(uMode<9.5){warp=(flow-.5)*.006*soft;power=.80+.56*field(uv*23.+orbit);gloss=.29;}
  else if(uMode<10.5){warp=(flow-.5)*.009*soft;power=.78+.63*field(uv*9.+orbit);gloss=.31;}
  else if(uMode<11.5){power=.92+.22*field(uv*92.+orbit*6.);warp=vec2(.0012*sin(t+uv.y*4.),0.)*soft;gloss=.23;}
  else if(uMode<12.5){warp=vec2(sin(uv.y*16.+t),cos(uv.x*13.-t))*.0035*soft;power=.84+.36*field(uv*12.+orbit);gloss=.36;}
  else if(uMode<13.5){warp=(flow-.5)*.008*soft;power=.58+.86*field(uv*22.+orbit*2.);gloss=.40;}
  else if(uMode<14.5){warp=vec2(sin(uv.y*21.+t)*.002,cos(uv.x*9.+t)*.003)*soft;power=.86+.40*field(uv*17.+orbit);gloss=.27;}
  else if(uMode<15.5){warp=(flow-.5)*.006*soft;power=.72+.62*field(uv*20.+orbit*1.6);gloss=.28;}
  else if(uMode<16.5){warp=vec2(sin(uv.y*12.+t)*.003,0.)*soft;power=.78+.58*field(uv*18.+orbit*2.);gloss=.34;}
  else{warp=vec2(sin(uv.y*19.+t)*.0045,cos(uv.x*8.+t)*.0015)*soft;power=.87+.30*field(uv*10.+orbit);gloss=.43;}
  vec3 base=texture2D(uColor,uv).rgb,inside=texture2D(uColor,uv+warp).rgb;
  inside=texture2D(uColor,uv+warp*2.).rgb;
  vec3 color=inside;
  if((uMode>11.5&&uMode<12.5)||uMode>16.5)color*=1.+soft*.22*sin(t+uv.x*5.+uv.y*8.);
  vec3 n=normalize(texture2D(uNormal,uv).xyz*2.-1.);
  vec3 light=normalize(vec3(.50*sin(t),.34*cos(t),1.));
  float reflectance=pow(max(dot(n,normalize(light+vec3(0.,0.,1.))),0.),18.);
  float fixedReflectance=pow(max(dot(n,normalize(vec3(0.,.34,2.))),0.),18.);
  // Relief follows the source normal field. No line or circle sweeps across it.
  color+=base*gloss*(reflectance-fixedReflectance);
  color+=base*emission*((power-1.)*2.6+.20+.32*sin(t+uv.y*6.+uv.x*10.));
  color*=tint;
  float edge=smoothstep(0.,.04,vUV.x)*smoothstep(0.,.04,1.-vUV.x)*smoothstep(0.,.10,vUV.y)*smoothstep(0.,.10,1.-vUV.y);
  float readable=texture2D(uReadable,vUV).r;
  gl_FragColor=vec4(max(color,vec3(0.)),edge*readable*uStrength);
 }`;
 const io=new IntersectionObserver(es=>{for(const e of es){const r=[...records.values()].find(r=>r.layer===e.target);if(r)r.inside=e.isIntersecting;}activity();});
 const resize=new ResizeObserver(schedule);
 function load(url){if(!cache.has(url)){const img=new Image();img.src=url;cache.set(url,img.decode().then(()=>img));}return cache.get(url);}
 function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(msg);}return s;}
 function texture(gl,unit,image,owned){const t=gl.createTexture();owned.push(t);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);return t;}
 function renderer(r,images){
  const gl=r.canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!gl)throw Error('WebGL unavailable');
  r.gl={gl,program:null,buffer:null,textures:[],uniforms:{},shaders:[]};
  const program=gl.createProgram();r.gl.program=program;const vs=shader(gl,gl.VERTEX_SHADER,vertex);r.gl.shaders.push(vs);const fs=shader(gl,gl.FRAGMENT_SHADER,fragment);r.gl.shaders.push(fs);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);r.gl.shaders=[];if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();r.gl.buffer=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);const textures=r.gl.textures,uniforms={};images.forEach((image,i)=>texture(gl,i,image,textures));for(const name of ['uColor','uNormal','uMaterial','uReadable','uOrigin','uSpan','uPhase','uMode','uStrength'])uniforms[name]=gl.getUniformLocation(program,name);
  ['uColor','uNormal','uMaterial','uReadable'].forEach((name,i)=>gl.uniform1i(uniforms[name],i));gl.uniform1f(uniforms.uMode,modes.indexOf(r.id));
  Object.assign(r.gl,{buffer,textures,uniforms});r.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!r.closingGL&&records.get(r.key)===r)fallback(r,'context lost');});
 }
 function disposeGL(r){if(!r.gl)return;const {gl,program,buffer,textures,shaders}=r.gl;r.closingGL=true;textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));gl.deleteBuffer(buffer);gl.deleteProgram(program);r.gl=null;gl.getExtension('WEBGL_lose_context')?.loseContext();}
 function fallback(r,error){r.error=String(error);r.ready=true;r.canvas.hidden=true;r.layer.style.backgroundImage=`url("${r.entry.field.url}")`;r.layer.style.opacity=r.kind==='well'?'.52':r.kind==='header'?'.68':'.92';if(r.mask.width>1){r.layer.style.maskImage=`url("${r.mask.toDataURL('image/png')}")`;r.layer.style.maskSize='100% 100%';}disposeGL(r);activity();}
 function readable(r){
  const c=r.mask.getContext('2d'),w=r.layer.clientWidth,h=r.layer.clientHeight,b=r.layer.getBoundingClientRect();r.mask.width=Math.max(1,Math.round(w));r.mask.height=Math.max(1,Math.round(h));c.fillStyle='white';c.fillRect(0,0,w,h);c.fillStyle='#151515';c.shadowColor='#151515';c.shadowBlur=7;
  const walker=document.createTreeWalker(r.host,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){if(!node.textContent.trim()||node.parentElement.closest('.theme-surface41,.protoss-pylon42,.material-motion38,.inplace-surface,.inplace-object'))continue;const range=document.createRange();range.selectNodeContents(node);for(const box of range.getClientRects()){if(box.right<b.left||box.left>b.right||box.bottom<b.top||box.top>b.bottom)continue;c.fillRect(box.left-b.left-7,box.top-b.top-5,box.width+14,box.height+10);}}
  for(const el of r.host.querySelectorAll('button,input,select,img:not(.surface41-poster),.button')){if(el.closest('.theme-surface41,.protoss-pylon42,.material-motion38,.inplace-object'))continue;const q=el.getBoundingClientRect();if(q.right>b.left&&q.left<b.right&&q.bottom>b.top&&q.top<b.bottom)c.fillRect(q.left-b.left-4,q.top-b.top-4,q.width+8,q.height+8);}
  if(r.gl){const {gl,textures}=r.gl;gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textures[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,r.mask);}
 }
 function layout(r){
  const b=r.host.getBoundingClientRect();let x=0,y=0,w=r.host.clientWidth,h=r.host.clientHeight;r.visible=!!r.host.getClientRects().length;
  if(r.kind==='sidebar'){const nav=r.host.querySelector('nav')?.getBoundingClientRect(),dock=r.host.querySelector('.sidebar-bottom')?.getBoundingClientRect();if(!nav||!dock||innerWidth<=750){r.visible=false;return;}x=5;w-=10;y=nav.bottom-b.top-r.host.clientTop+10;h=dock.top-nav.bottom-20;if(h<110){r.visible=false;return;}}
  else if(r.kind==='well'){x=y=9;w-=18;h-=18;}
  if(w<10||h<10){r.visible=false;return;}
  const signature=[Math.round(w),Math.round(h),r.host.textContent].join('|');Object.assign(r.layer.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
  if(signature!==r.geometry){r.geometry=signature;r.dirty=true;const factor=Math.min(devicePixelRatio||1,1.25,Math.sqrt(280000/(w*h)));r.canvas.width=Math.max(1,Math.round(w*factor));r.canvas.height=Math.max(1,Math.round(h*factor));readable(r);}
  if(r.gl){const scale=Math.max(w/r.entry.width,h/r.entry.height),sx=w/(r.entry.width*scale),sy=h/(r.entry.height*scale),{gl,uniforms}=r.gl;gl.uniform2f(uniforms.uSpan,sx,sy);gl.uniform2f(uniforms.uOrigin,1.-sx,(1.-sy)*.5);}
 }
 function draw(r){if(!r.gl||r.error)return;const {gl,program,uniforms}=r.gl;gl.useProgram(program);gl.viewport(0,0,r.canvas.width,r.canvas.height);gl.uniform1f(uniforms.uPhase,(r.time%12000)/12000);gl.uniform1f(uniforms.uStrength,r.kind==='preview'?.98:r.kind==='sidebar'?.92:r.kind==='header'?.68:.52);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);r.draws++;r.painted=true;r.dirty=false;}
 function tick(now){raf=0;const delta=last?Math.min(80,now-last):0;last=now;for(const r of records.values())if(r.active){r.pending+=delta;if(r.pending>=1000/24){r.time+=r.pending;r.pending=0;draw(r);}}if([...records.values()].some(r=>r.active))raf=requestAnimationFrame(tick);else last=0;}
 function nativeFocusBlocked(){return !focused&&!!window.chrome?.webview&&!(typeof state!=='undefined'&&state.libraryVersion==='local-ui-preview');}
 function activity(){const modal=document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1),blocked=held||document.hidden||nativeFocusBlocked()||reduced.matches||forced.matches;for(const r of records.values()){const hidden=!r.visible||forced.matches;if(r.layer.hidden!==hidden)r.layer.hidden=hidden;r.active=!blocked&&r.ready&&!r.error&&r.visible&&r.inside&&(!modal||modal.contains(r.host));r.layer.dataset.surfaceActive=String(r.active);if(r.dirty&&r.visible&&(r.active||(!r.painted&&!forced.matches)))draw(r);}if([...records.values()].some(r=>r.active)){if(!raf){last=0;raf=requestAnimationFrame(tick);}}else if(raf){cancelAnimationFrame(raf);raf=0;last=0;}}
 function mount(r){const kids=[...r.host.children].filter(e=>e!==r.layer);r.host.insertBefore(r.layer,kids.length>1?kids[1]:kids[0]||null);r.host.dataset.surface41Host=r.kind;}
 function create(id,kind,host,entry){
  const layer=document.createElement('i'),canvas=document.createElement('canvas'),mask=document.createElement('canvas');layer.className='theme-surface41';layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');layer.dataset.surfaceScope=kind;layer.style.backgroundImage=`url("${entry.field.url}")`;canvas.className='surface41-canvas';layer.append(canvas);
  const r={key:kind,id,kind,host,entry,layer,canvas,mask,ready:false,visible:false,inside:false,active:false,time:0,pending:0,draws:0,error:null};records.set(kind,r);mount(r);io.observe(layer);resize.observe(host);layout(r);
  Promise.all([load(entry.field.url),load(entry.normal.url),load(entry.mask.url)]).then(images=>{if(records.get(kind)!==r)return;try{mask.width=mask.height=1;mask.getContext('2d').fillStyle='white';mask.getContext('2d').fillRect(0,0,1,1);renderer(r,[...images,mask]);r.ready=true;r.layer.style.backgroundImage='none';r.geometry=null;layout(r);}catch(error){fallback(r,error.message);}activity();}).catch(error=>{if(records.get(kind)===r)fallback(r,error.message);});return r;
 }
 function drop(r){io.unobserve(r.layer);resize.unobserve(r.host);delete r.host.dataset.surface41Host;r.layer.remove();records.delete(r.key);disposeGL(r);}
 function reconcile(){
  queued=false;if(!catalog)return;const id=root.dataset.graphicalStyle,entry=catalog.themes[id],objectTheme=['protoss','terran','zerg'].includes(id)||root.dataset.character54===id;if(theme!==id){theme=id;cache.clear();for(const r of [...records.values()])drop(r);if(entry){root.dataset.surface41=id;root.style.setProperty('--identity-field','none');root.style.setProperty('--interior-pattern-size',entry.width+'px '+entry.height+'px');}else{delete root.dataset.surface41;root.style.removeProperty('--identity-field');root.style.removeProperty('--interior-pattern-size');}}
  const stage=document.querySelector('#settings-dialog .appearance-effects-stage');if(stage){if(entry&&!objectTheme)stage.dataset.surface41Preview=id;else delete stage.dataset.surface41Preview;}
  const wants=[];if(entry&&!objectTheme){const header=document.querySelector('.work-console>.page-head'),side=document.querySelector('.sidebar');if(header)wants.push(['header',header]);if(side)wants.push(['sidebar',side]);if(stage?.closest('dialog[open]'))wants.push(['preview',stage]);}
  for(const r of [...records.values()])if(!wants.some(([kind])=>kind===r.kind))drop(r);
  for(const [kind,host]of wants){let r=records.get(kind);if(!r)r=create(id,kind,host,entry);if(r.host!==host||r.layer.parentElement!==host){resize.unobserve(r.host);delete r.host.dataset.surface41Host;r.host=host;mount(r);resize.observe(host);r.geometry=null;}layout(r);}activity();
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(reconcile);}}
 new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.('.theme-surface41,.protoss-pylon42,.material-motion38,.inplace-surface,.inplace-object')&&!(c.type==='childList'&&[...c.addedNodes,...c.removedNodes].every(n=>n.nodeType===1&&n.matches('.theme-surface41,.protoss-pylon42,.material-motion38,.inplace-surface,.inplace-object')))))schedule();}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','hidden']});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-graphical-style','data-character54']});
 window.addEventListener('resize',schedule);window.addEventListener('blur',()=>{focused=false;activity();});window.addEventListener('focus',()=>{focused=true;activity();});document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();activity();});reduced.addEventListener('change',activity);forced.addEventListener('change',activity);document.fonts.ready.then(schedule);
 function seek(ms){held=true;activity();const modal=document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1);for(const r of records.values()){r.time=ms;if(!modal||modal.contains(r.host))draw(r);}}
 function preview(){held=false;reconcile();if(reduced.matches||forced.matches||nativeFocusBlocked()||document.hidden)return false;const r=records.get('preview');if(!r)return false;r.time+=4200;draw(r);activity();return true;}
 window.DSThemeSurfaces=Object.freeze({refresh:reconcile,preview,seek,resume:()=>{held=false;activity();},diagnostics:()=>[...records.values()].map(r=>({id:r.id,scope:r.kind,ready:r.ready,active:r.active,visible:r.visible,error:r.error,time:r.time,draws:r.draws,pixels:r.canvas.width*r.canvas.height,mode:modes.indexOf(r.id)}))});
 fetch('/themes/surfaces41/catalog.json').then(r=>r.json()).then(value=>{catalog=value;schedule();}).catch(()=>{});
})();
