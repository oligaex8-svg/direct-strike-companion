'use strict';
const fs=require('node:fs'),path=require('node:path');
const assembly=require('./Build-ConnectedSkinFrames.cjs');
module.exports=assembly;
if(require.main===module)assembly.build().then(result=>{fs.writeFileSync(path.join(result.sourceRoot,'verification/native-skin-frame-assets.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({success:true,styles:result.styles,assets:result.assets}));}).catch(error=>{console.error(error);process.exitCode=1;});
