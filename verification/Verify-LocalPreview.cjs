'use strict';
// Verify the local package without opening the app or touching its private data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),build=JSON.parse(fs.readFileSync(path.join(__dirname,'native-local-build.json'))),testFile=path.join(path.dirname(build.Path),'test-output/sound-tests.json'),tests=JSON.parse(fs.readFileSync(testFile));
assert.equal(tests.success,true,'Packaged dashboard checks must pass');
const entries=Object.entries(tests.assets).filter(([name])=>!name.startsWith('Dsc'));
const differences=entries.filter(([name,sha])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'wwwroot',name))).digest('hex').toLowerCase()!==sha.toLowerCase()).map(([name])=>name);
const report={success:differences.length===0,scope:'Packaged local-preview UI versus current source, exact SHA-256',checks:tests.checks.length,assets:entries.length,differences};
fs.writeFileSync(path.join(__dirname,'native-local-assets.json'),JSON.stringify(report,null,2)+'\n');
fs.copyFileSync(testFile,path.join(__dirname,'self-tests-native-local.json'));
assert.deepEqual(differences,[],'Local package must contain the current UI');
console.log(JSON.stringify(report));
