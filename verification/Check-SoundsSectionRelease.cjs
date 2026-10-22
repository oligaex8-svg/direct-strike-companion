'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tests=JSON.parse(fs.readFileSync(path.join(root,'release/test-output/sound-tests.json'),'utf8'));
assert.equal(tests.success,true);
const required=['sounds-page.js','sounds-page.css','index.html','app.js','lobby.js','ru-ui.js'];
if(process.argv[2]==='github-updater')required.push('software-updates.js','software-updates.css','sc2-automation.js');
for(const name of required)assert.ok(tests.assets[name],`Missing embedded ${name}`);
for(const [name,expected] of Object.entries(tests.assets)){
 const file=name==='DscSoundCatalog'?'assets/audio/catalog.json':name.startsWith('DscSound:')?`assets/audio/${name.slice(9)}.wav`:`wwwroot/${name}`;
 const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').toUpperCase();
 assert.equal(actual,expected,`Release differs from tested source: ${file}`);
}
const result={success:true,sourceChecks:tests.checks.length,embeddedAssets:Object.keys(tests.assets).length,required,checkedAt:new Date().toISOString()};
const milestone=process.argv[2]||'organized-sounds';assert.match(milestone,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
fs.writeFileSync(path.join(__dirname,milestone+'-assets.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
