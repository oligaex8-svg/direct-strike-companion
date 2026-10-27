'use strict';
// Preserve complete, uniformly scaled sculpture. Only quiet rail cross-sections
// are extended; premultiplied transitions connect them to the corner artwork.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sharp=require(require.resolve('sharp',{paths:['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'wwwroot'),sources=require('../assets/themes/art32/sources.json');
const W=1600,H=1000,C=320,T=60,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function clean(buffer){for(let i=0;i<buffer.length;i+=4)if(buffer[i+3]<=2)buffer.fill(0,i,i+4);return buffer;}
function blend(dst,at,profile,weight){
 if(weight>=1){profile.copy(dst,at);return;}
 const a=dst[at+3]/255,b=profile[3]/255,q=a*(1-weight)+b*weight;
 for(let k=0;k<3;k++)dst[at+k]=q?Math.round((dst[at+k]*a*(1-weight)+profile[k]*b*weight)/q):0;
 dst[at+3]=Math.round(q*255);
}
const smooth=t=>t*t*(3-2*t);
async function compose(p){
 const bytes=fs.readFileSync(path.join(root,p.source)),meta=await sharp(bytes).metadata();
 const raw=await sharp(bytes).ensureAlpha().raw().toBuffer();clean(raw);
 const scaled=await sharp(raw,{raw:{width:meta.width,height:meta.height,channels:4}}).resize({width:Math.round(meta.width*p.scale)}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const src=clean(scaled.data),sw=scaled.info.width,sh=scaled.info.height;
 assert.ok(sw>=C*2&&sh>C,'Sculpture must accommodate complete corner patches');
 const qx=Math.round(sw*p.qx),qy=Math.round(sh*p.qy),pixel=(x,y)=>src.subarray((y*sw+x)*4,(y*sw+x)*4+4),at=(x,y)=>(y*W+x)*4,out=Buffer.alloc(W*H*4);
 const top=Array.from({length:C},(_,y)=>Buffer.from(pixel(qx,y))),bottom=Array.from({length:C},(_,y)=>Buffer.from(pixel(qx,sh-C+y)));
 const left=Array.from({length:C},(_,x)=>Buffer.from(pixel(x,qy))),right=Array.from({length:C},(_,x)=>Buffer.from(pixel(sw-C+x,qy)));
 const corners=[[0,0,0,0],[sw-C,0,W-C,0],[0,sh-C,0,H-C],[sw-C,sh-C,W-C,H-C]];
 for(const [sx,sy,dx,dy] of corners)for(let y=0;y<C;y++)src.copy(out,at(dx,dy+y),((sy+y)*sw+sx)*4,((sy+y)*sw+sx+C)*4);
 for(let x=C;x<W-C;x++)for(let y=0;y<C;y++){top[y].copy(out,at(x,y));bottom[y].copy(out,at(x,H-C+y));}
 for(let y=C;y<H-C;y++)for(let x=0;x<C;x++){left[x].copy(out,at(x,y));right[x].copy(out,at(W-C+x,y));}
 for(let i=0;i<T;i++){
  const weight=smooth((i+1)/T),lx=C-T+i,rx=W-C+T-1-i,ty=C-T+i,by=H-C+T-1-i;
  for(let y=0;y<C;y++){
   blend(out,at(lx,y),top[y],weight);blend(out,at(rx,y),top[y],weight);
   blend(out,at(lx,H-C+y),bottom[y],weight);blend(out,at(rx,H-C+y),bottom[y],weight);
  }
  for(let x=0;x<C;x++){
   blend(out,at(x,ty),left[x],weight);blend(out,at(x,by),left[x],weight);
   blend(out,at(W-C+x,ty),right[x],weight);blend(out,at(W-C+x,by),right[x],weight);
  }
 }
 // Lock both sides of all cuts to the same samples, including interpolation neighbours.
 for(const x0 of [C,W-C])for(let x=x0-2;x<=x0+2;x++)for(let y=0;y<C;y++){top[y].copy(out,at(x,y));bottom[y].copy(out,at(x,H-C+y));}
 for(const y0 of [C,H-C])for(let y=y0-2;y<=y0+2;y++)for(let x=0;x<C;x++){left[x].copy(out,at(x,y));right[x].copy(out,at(W-C+x,y));}
 for(let y=C;y<H-C;y++)out.fill(0,at(C,y),at(W-C,y));clean(out);
 const cores=[];
 for(const [sx,sy,dx,dy] of corners){
  const rightSide=dx>0,bottomSide=dy>0,ox=rightSide?C-240:0,oy=bottomSide?C-240:0,a=[],b=[];
  for(let y=0;y<240;y++){a.push(src.subarray(((sy+oy+y)*sw+sx+ox)*4,((sy+oy+y)*sw+sx+ox+240)*4));b.push(out.subarray(at(dx+ox,dy+oy+y),at(dx+ox+240,dy+oy+y)));}
  const before=hash(Buffer.concat(a)),after=hash(Buffer.concat(b));assert.equal(after,before,p.id+': corner core preserves uniform source scale');cores.push(after);
 }
 let mismatches=0;
 for(const x of [C,W-C])for(let y=0;y<C;y++)for(const yy of [y,H-C+y])if(!out.subarray(at(x-1,yy),at(x-1,yy)+4).equals(out.subarray(at(x,yy),at(x,yy)+4)))mismatches++;
 for(const y of [C,H-C])for(let x=0;x<C;x++)for(const xx of [x,W-C+x])if(!out.subarray(at(xx,y-1),at(xx,y-1)+4).equals(out.subarray(at(xx,y),at(xx,y)+4)))mismatches++;
 assert.equal(mismatches,0,p.id+': exact rail joins');
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png({compressionLevel:7}).toBuffer();
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><title>Authored '+p.kind+' inset frame; SC2 style reference, not a game export</title><image width="160" height="100" href="data:image/png;base64,'+png.toString('base64')+'"/></svg>\n');
 fs.writeFileSync(path.join(web,'themes',p.id+'-identity-frame.svg'),svg);
 const fieldPath=path.join(web,'themes',p.id+'-identity-field.svg');
 fs.writeFileSync(fieldPath,fs.readFileSync(fieldPath,'utf8').replace('opacity=".22" stroke-width="1.1"','opacity=".13" stroke-width="1.1"'));
 fs.writeFileSync(path.join(root,'assets/themes/art32',p.id+'-inset-atlas-v1.png'),png);
 return {id:p.id,kind:p.kind,source:p.source,reference:p.reference,authoring:p.authoring,sourceSize:[meta.width,meta.height],sourceSHA256:hash(bytes),scale:scaled.info.width/meta.width,scaledSize:[sw,sh],quietPixel:[qx,qy],logical:[160,100],raster:[W,H],slice:32,transition:6,cornerCores:cores,cornerCoreUnchanged:true,joinMismatches:mismatches,transparentCenter:true,svgSHA256:hash(svg),pngSHA256:hash(png)};
}
async function build(){
 sharp.concurrency(1);sharp.cache({memory:32});
 // The base generator owns all fields/native copies. Imported frames replace only seven outputs.
 require('./Build-ThemeIdentity.cjs');
 const frames=[];for(const p of sources.profiles)frames.push(await compose(p));
 const report={success:true,scope:'Authored SC2-matched inset artwork; no native outer-frame/control replacement',frames};
 fs.writeFileSync(path.join(root,'assets/themes/art32/imported-frames.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(__dirname,'local32-art-assets.json'),JSON.stringify(report,null,2)+'\n');
 const indexPath=path.join(root,'assets/themes/identity-sources.json'),index=JSON.parse(fs.readFileSync(indexPath));
 index.authored.importedFrames={source:'assets/themes/art32/imported-frames.json',ids:frames.map(p=>p.id),scope:report.scope};fs.writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
 console.log(JSON.stringify({success:true,importedFrames:frames.length,exactJoins:true,preservedCornerCores:true}));
}
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={compose,build};
