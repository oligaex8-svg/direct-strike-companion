'use strict';
// Reconstructed closed perimeter made from a skin's own information-well turn.
// Reflection closes the other three turns; only straight intervals stretch.
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const TOP=128,BOTTOM=256;
function inside(points,x,y){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++)if((points[i][1]>y)!==(points[j][1]>y)&&x<(points[j][0]-points[i][0])*(y-points[i][1])/(points[j][1]-points[i][1])+points[i][0])hit=!hit;return hit;}
async function compose(bytes,id,railX=430){
 const {data}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const wallEnd=id==='nova'?695:id==='classic-zerg'?698:690;
 const end=id==='nerazim'?720:wallEnd,width=end-railX+2,height=BOTTOM-TOP,corner=Buffer.alloc(width*height*4);
 for(let y=TOP;y<BOTTOM;y++)for(let x=railX;x<end;x++){
  const s=(y*992+x)*4,d=((y-TOP)*width+x-railX)*4;
  // Clear the viewing matte and the neighbouring portrait's right-hand arm.
  // The Nerazim mask retains the complete native mask/crest over its thin stem.
  if(x>=wallEnd&&!(id==='nerazim'&&inside([[660,150],[686,143],[702,152],[716,169],[719,187],[704,206],[689,225],[667,205]],x,y)))continue;
  let coverage=data[s+3];if(!(data[s]||data[s+1]||data[s+2]))coverage=0;
  // Source render edges terminate in another HUD panel. Finish that cut inside
  // the last two pixels of the same casing, instead of exposing a hard slice.
  if(x>=wallEnd-2&&id!=='nerazim')coverage*=Math.max(0,(wallEnd-x)/2);
  data.copy(corner,d,s,s+3);corner[d+3]=Math.round(coverage);
 }
 const lowerCorner=Buffer.from(corner);
 // One-pixel source-adjacent cross-sections are repeated only along their
 // direction. Corners never stretch or use another family's helper material.
 const bridge=16,atlasWidth=width*2+bridge,atlasHeight=height*2+bridge,atlas=Buffer.alloc(atlasWidth*atlasHeight*4);
 for(let y=0;y<atlasHeight;y++)for(let x=0;x<atlasWidth;x++){
  const sy=y<height?y:y>=height+bridge?atlasHeight-1-y:height-1;
  const sx=x<width?width-1-x:x>=width+bridge?x-width-bridge:0;
  if(x>=width&&x<width+bridge&&y>=height&&y<height+bridge)continue;
  const s=(sy*width+sx)*4,d=(y*atlasWidth+x)*4;(y>=height+bridge?lowerCorner:corner).copy(atlas,d,s,s+4);
 }
 return {pixels:atlas,width:atlasWidth,height:atlasHeight,slices:[height,width,height,width],sourceRegion:[railX,TOP,end-railX,height],wallEnd,corner,cornerWidth:width,cornerHeight:height,adaptation:'Own native information-well upper-right turn; reflected to close the remaining three turns; source-adjacent horizontal and vertical profiles; no helper perimeter',iris:null};
}
module.exports={compose};
