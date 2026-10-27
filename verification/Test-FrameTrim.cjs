'use strict';
// Compatibility entry point. The acceptance baseline is Default itself,
// not a same-theme comparison with one decorative stylesheet disabled.
require('./Test-SharedSkinLayout.cjs')({sourceRoot:require('node:path').resolve(__dirname,'..'),outputRoot:__dirname}).catch(error=>{console.error(error);process.exitCode=1;});
