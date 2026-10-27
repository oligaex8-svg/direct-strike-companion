'use strict';
// The Purifier chat atlas authors the upper and lower turns separately.
// Preserve those turns in their original orientation; join only quiet rails.
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
async function compose(bytes){
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const width=108,top=40,bottom=24,bridge=16,height=top+bridge+bottom,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const lower=y>=top+bridge,sy=lower?y-top-bridge:y<top?y:39,sx=x+(lower?108:0);
  // The amber scan surface belongs to the original chat text well. Clear that
  // surface geometrically, retaining every metallic bevel and corner light.
  let clear=lower?sy<7&&x>=20&&x<88:sy>=16&&x>=20&&x<88;
  if(!lower&&sy>=20&&x>=18&&x<90)clear=true;
  if(lower&&sy<3&&x>=18&&x<90)clear=true;
  const s=(sy*info.width+sx)*4,d=(y*width+x)*4;
  data.copy(pixels,d,s,s+4);if(clear)pixels[d+3]=0;
 }
 return {pixels,width,height,slices:[top,32,bottom,32],sourceRegion:[0,0,216,40],
  sourceKind:'authored-native-chat-frame',adaptation:'Original Purifier upper and lower corner assemblies, no reflected ornaments; quiet vertical wall extended from source row 39',iris:null};
}
module.exports={compose};
