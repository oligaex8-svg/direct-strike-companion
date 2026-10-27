'use strict';
// Original asymmetric Purifier armour; native caps close the screen ends.
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
async function compose(chatBytes,consoleBytes){
 const chat=await sharp(chatBytes).ensureAlpha().raw().toBuffer(),original=await sharp(consoleBytes).ensureAlpha().raw().toBuffer();
 const width=758,height=192,left=278,right=464,top=128,bottom=48,pixels=Buffer.alloc(width*height*4);
 const crop=(data,stride,x,y,w,h)=>{const result=Buffer.alloc(w*h*4);for(let row=0;row<h;row++)data.copy(result,row*w*4,((y+row)*stride+x)*4,((y+row)*stride+x+w)*4);return result;};
 const layer=async(data,w,h,x,y,scale=1)=>{
  const out=await sharp(data,{raw:{width:w,height:h,channels:4}}).resize(Math.round(w*scale),Math.round(h*scale),{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  for(let py=0;py<out.info.height;py++)for(let px=0;px<out.info.width;px++){
   const dx=x+px,dy=y+py;if(dx<0||dy<0||dx>=width||dy>=height)continue;
   const s=(py*out.info.width+px)*4,d=(dy*width+dx)*4,a=out.data[s+3]/255,old=pixels[d+3]/255,total=a+old*(1-a);if(!total)continue;
   for(let c=0;c<3;c++)pixels[d+c]=Math.round((out.data[s+c]*a+pixels[d+c]*old*(1-a))/total);pixels[d+3]=Math.round(total*255);
  }
 };
 const clean=Buffer.from(chat);
 for(let y=0;y<40;y++)for(let x=0;x<216;x++){
  const lower=x>=108,cx=x%108;
  if(lower?(y<7&&cx>=20&&cx<88)||(y<3&&cx>=18&&cx<90):(y>=16&&cx>=20&&cx<88)||(y>=20&&cx>=18&&cx<90))clean[(y*216+x)*4+3]=0;
 }
 for(let y=52;y<156;y++){
  await layer(crop(clean,216,0,39,24,1),24,1,0,y,1.5);
  await layer(crop(clean,216,84,39,24,1),24,1,width-36,y,1.5);
 }
 await layer(crop(clean,216,108,0,24,24),24,24,0,156,1.5);
 await layer(crop(clean,216,192,0,24,24),24,24,width-36,156,1.5);
 const lowerRail=await sharp(crop(clean,216,156,0,1,24),{raw:{width:1,height:24,channels:4}}).resize(width-72,36,{fit:'fill'}).raw().toBuffer();
 await layer(lowerRail,width-72,36,36,156);
 // Casing underlap is restricted to the cap attachment, never a second top rail.
 for(const c of [{sx:112,sy:117,h:42,x:24,y:17},{sx:990,sy:106,h:68,x:width-39,y:9}]){
  const strip=crop(original,992,c.sx,c.sy,2,c.h);for(let i=0;i<strip.length;i+=4)if(!(strip[i]||strip[i+1]||strip[i+2]))strip[i+3]=0;
  const scaled=await sharp(strip,{raw:{width:2,height:c.h,channels:4}}).resize(15,Math.round(c.h*.76),{fit:'fill'}).raw().toBuffer({resolveWithObject:true});await layer(scaled.data,scaled.info.width,scaled.info.height,c.x,c.y);
 }
 // The game's vertical control wells are not usable shoulder joints. Rebuild
 // their inner edge as a continuous contour using the native quiet rail's
 // bevel profile, leaving the sculpted upper armour and iris in place.
 const contour=[[112,158],[166,158],[194,164],[220,180],[258,204],[286,208],[610,208],[646,205],[678,198],[726,198],[754,192],[784,177],[824,174],[992,174]];
 const limit=x=>{
  let n=0;while(n<contour.length-2&&x>contour[n+1][0])n++;
  const [x0,y0]=contour[n],[x1,y1]=contour[n+1],t=Math.max(0,Math.min(1,(x-x0)/(x1-x0)));
  const slope=(a,b)=>(contour[b][1]-contour[a][1])/(contour[b][0]-contour[a][0]);
  const d=slope(n,n+1),m0=n&&slope(n-1,n)*d>0?Math.sign(d)*Math.min(Math.abs(slope(n-1,n+1)),3*Math.abs(d)):0;
  const m1=n<contour.length-2&&slope(n+1,n+2)*d>0?Math.sign(d)*Math.min(Math.abs(slope(n,n+2)),3*Math.abs(d)):0;
  return (2*t*t*t-3*t*t+1)*y0+(t*t*t-2*t*t+t)*(x1-x0)*m0+(-2*t*t*t+3*t*t)*y1+(t*t*t-t*t)*(x1-x0)*m1;
 };
 for(const c of [{sx:112,w:318,x:36},{sx:430,w:562,x:left+16}]){
  const art=crop(original,992,c.sx,106,c.w,118);
  for(let y=0;y<118;y++)for(let x=0;x<c.w;x++){
   const i=(y*c.w+x)*4,sx=c.sx+x,sy=y+106,edge=limit(sx),distance=edge-sy;
   if(distance<=0||!(art[i]||art[i+1]||art[i+2]))art[i+3]=0;
   // Replace only the well-derived inner lip. At quiet rail endpoints the
   // sample lands on the exact original pixels, avoiding a visible seam.
   if((sx>=166&&sx<286||sx>=610&&sx<824)&&distance>0&&distance<=10){
    const sampleY=Math.min(207,Math.max(198,Math.floor(208-distance))),sample=(sampleY*992+430)*4;
    original.copy(art,i,sample,sample+4);art[i+3]=Math.round(255*Math.min(1,distance));
   }
  }
  await layer(art,c.w,118,c.x,9,.76);
 }
 await layer(crop(clean,216,0,0,24,40),24,40,0,8,1.5);
 await layer(crop(clean,216,84,0,24,40),24,40,width-36,0,1.5);
 for(let y=0;y<top;y++)for(let x=left;x<=left+16;x++)pixels.copy(pixels,(y*width+x)*4,(y*width+left-1)*4,(y*width+left)*4);
 // Follow the assembled roof instead of showing a rectangular backing above it.
 const points=[];
 for(let x=8;x<width-7;x+=4){if(x>left&&x<width-right)continue;let y=0;while(y<top){const i=(y*width+x)*4;if(pixels[i+3]>128&&Math.max(pixels[i],pixels[i+1],pixels[i+2])>30)break;y++;}if(y<top)points.push([x,y+2]);}
 const pos=n=>`calc(${n} * var(--skin-shell-scale) * 1px)`;
 const roof=points.map(([x,y])=>`${x<=left?pos(x):`calc(100% - ${width-x} * var(--skin-shell-scale) * 1px)`} ${pos(y)}`);
 const outline='polygon('+[...roof,`calc(100% - 9 * var(--skin-shell-scale) * 1px) calc(100% - 20 * var(--skin-shell-scale) * 1px)`,`calc(100% - 22 * var(--skin-shell-scale) * 1px) calc(100% - 10 * var(--skin-shell-scale) * 1px)`,`${pos(22)} calc(100% - 10 * var(--skin-shell-scale) * 1px)`,`${pos(9)} calc(100% - 20 * var(--skin-shell-scale) * 1px)`].join(',')+')';
 return {pixels,width,height,slices:[top,right,bottom,left],outline,sourceRegion:[112,106,880,118],sourceKind:'original-purifier-shoulders-native-caps',adaptation:'Original asymmetric shoulders and single embedded iris; native bevel follows continuous inner shoulder contours instead of square game-control wells; authored Purifier end caps and lower turns',iris:{mode:'unaltered original right shoulder'}};
}
module.exports={compose};
