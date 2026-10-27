'use strict';
// Shared drawing mechanics only. Theme anatomy and choreography live in scenes.
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
function gradient(c,x,y,w,h,stops){const g=c.createLinearGradient(x,y,x+w,y+h);for(const [at,color]of stops)g.addColorStop(at,color);return g;}
function polygon(c,points,fill){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}}
function rounded(c,x,y,w,h,r,fill){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();if(fill){c.fillStyle=fill;c.fill();}}
function ellipse(c,x,y,rx,ry,fill,angle=0){c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);if(fill){c.fillStyle=fill;c.fill();}}
function radial(c,x,y,r,stops){const g=c.createRadialGradient(x,y,0,x,y,r);for(const [at,color]of stops)g.addColorStop(at,color);return g;}
function glow(c,color,radius,draw){c.save();c.shadowColor=color;c.shadowBlur=radius;draw();c.restore();}
function seeded(i){let n=Math.imul(i+1531,374761393);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function texture(c,x,y,w,h,seed=0,amount=90){c.save();for(let i=0;i<amount;i++){const a=seeded(i*3+seed),b=seeded(i*3+seed+1);c.fillStyle=i%3?'#ffffff09':'#00000020';c.fillRect(x+a*w,y+b*h,seeded(i+seed+7)*1.3+.35,.5);}c.restore();}
function metal(c,x,y,w,h,color='#58646a'){return gradient(c,x,y,w*.1,h,[[0,'#acb5b9'],[.08,color],[.24,'#293239'],[.66,'#10171c'],[.89,color],[1,'#060b10']]);}
function base(c,w,h,kind,shape,colors){const y=kind==='header'?h:h-9;polygon(c,shape(y),gradient(c,0,y-10,0,12,colors));if(kind==='inset'){c.fillStyle=gradient(c,w-45,y-11,0,11,colors);c.fillRect(w-45,y-11,45,11);}return y;}
function surface(kind){const width=kind==='header'?512:256,height=kind==='header'?64:128,canvas=createCanvas(width,height),c=canvas.getContext('2d');return {canvas,c,width,height,base:kind==='header'?height:height-9};}
function raw(canvas){const c=canvas.getContext('2d'),pixels=c.getImageData(0,0,canvas.width,canvas.height);return {data:Buffer.from(pixels.data),width:canvas.width,height:canvas.height,channels:4};}
module.exports={TAU,clamp,gradient,polygon,rounded,ellipse,radial,glow,seeded,texture,metal,base,surface,raw};
