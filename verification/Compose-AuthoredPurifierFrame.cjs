'use strict';
// Import one purpose-drawn frame. Sculpture scales uniformly; only quiet rail
// intervals repeat. No game-control recesses or unrelated corner fittings.
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
async function compose(bytes){
 const sourceRegion=[15,107,2142,506],width=758,top=128,bottom=36,left=200,right=256;
 const {data:pixels,info}=await sharp(bytes).extract({left:sourceRegion[0],top:sourceRegion[1],width:sourceRegion[2],height:sourceRegion[3]}).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const height=info.height,pixel=(x,y)=>(y*width+x)*4;
 // Freeze the common straight cross-section at each nine-slice boundary.
 for(let y=0;y<height;y++){
  const quiet=Buffer.from(pixels.subarray(pixel(350,y),pixel(350,y)+4));
  for(let x=left-1;x<=width-right;x++)quiet.copy(pixels,pixel(x,y));
 }
 const sideRow=Buffer.from(pixels.subarray(pixel(0,135),pixel(0,136)));
 for(let y=top-1;y<=height-bottom;y++)sideRow.copy(pixels,pixel(0,y));
 const pos=n=>`calc(${n} * var(--skin-shell-scale) * 1px)`,roof=[];
 for(let x=8;x<width-7;x+=3){
  if(x>left&&x<width-right)continue;
  let y=0;while(y<top&&pixels[pixel(x,y)+3]<128)y++;
  if(y<top)roof.push(`${x<=left?pos(x):`calc(100% - ${width-x} * var(--skin-shell-scale) * 1px)`} ${pos(y+2)}`);
 }
 const outline='polygon('+[...roof,`calc(100% - 9 * var(--skin-shell-scale) * 1px) calc(100% - 20 * var(--skin-shell-scale) * 1px)`,`calc(100% - 22 * var(--skin-shell-scale) * 1px) calc(100% - 10 * var(--skin-shell-scale) * 1px)`,`${pos(22)} calc(100% - 10 * var(--skin-shell-scale) * 1px)`,`${pos(9)} calc(100% - 20 * var(--skin-shell-scale) * 1px)`].join(',')+')';
 return {pixels,width,height,slices:[top,right,bottom,left],outline,sourceRegion,sourceKind:'authored-style-matched-purifier',adaptation:'Purpose-drawn Purifier frame with level energy rail, compact integrated corners and iris; uniformly scaled sculpture and matching quiet rail profiles',iris:{mode:'single authored Purifier iris'}};
}
module.exports={compose};
