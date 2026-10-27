'use strict';
// Resume completed UI captures after a later thumbnail job was interrupted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const deps=['C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium}=require(require.resolve('playwright',{paths:deps}));
const capture=require('./Capture-ThemeEquipment.cjs'),out=path.join(__dirname,'local35-equipment-capture');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function encode(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1',...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||String(r.error));}
(async()=>{
 const log=fs.readFileSync(path.join(__dirname,'russian-sound-equipment-capture-output.txt'));
 const events=log.toString().split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
 const motion=events.filter(x=>x.phase==='ui-motion-captured'),stills=events.filter(x=>x.phase==='ui-still-captured');
 if(motion.length!==5||stills.length!==20)throw Error('Only completed full capture logs can be resumed');
 const report={success:false,version:'1.1.7-local.35',source:'Actual UI through LocalPreviewFixture; completed capture log resumed for thumbnails/encoding',recoveredCompletedCaptures:true,captureLogSha256:digest(log),viewport:{width:1600,height:1000},fps:24,captureDuration:6,largeLoopDuration:4,equipmentLoopDuration:6,commonElapsedClock:true,combinedLoop:false,rasterSourceHashes:capture.verifyRasterSet(),motion:[],stills:[]};
 for(const item of motion){for(let f=0;f<144;f++)if(!fs.existsSync(path.join(out,'frames',item.id+'-'+String(f).padStart(3,'0')+'.jpg')))throw Error('Incomplete actual UI frame set '+item.id);report.motion.push({id:item.id,frames:144,duration:6,atomicAddressValidation:'All captured frames passed the source capture assertions before its completed log event',video:item.id+'-full-ui.mp4'});}
 for(const item of stills){const file=item.id+'-full-ui.png';report.stills.push({id:item.id,file,sha256:digest(fs.readFileSync(path.join(out,file))),visibleDevices:item.visibleDevices,categories:item.categories,parts:item.parts});}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
 try{await capture.capturePreviews(browser,report);}finally{await browser.close();}
 for(const item of report.motion){encode(['-framerate','24','-i',path.join(out,'frames',item.id+'-%03d.jpg'),'-frames:v','144','-c:v','libx264','-threads','1','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,item.video)]);console.log(JSON.stringify({phase:'video-complete',id:item.id}));}
 const list=path.join(out,'videos.txt');fs.writeFileSync(list,report.motion.map(x=>"file '"+x.video+"'").join('\n')+'\n');
 const movie=path.join(out,'local35-full-ui-equipment.mp4');encode(['-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',movie]);
 encode(['-i',movie,'-filter_complex_threads','1','-filter_complex','fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','-1',path.join(out,'local35-equipment-overview.gif')]);
 report.success=true;report.gif=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'index.html'),capture.html(report));console.log(JSON.stringify({success:true,stills:20,motionThemes:5,previews:report.previews.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
