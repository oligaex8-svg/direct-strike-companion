'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const list=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=[...new Set(list)],token=/github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/;
for(const file of files){
 assert.ok(!/(^|\/)(?:data|release|portable|dist|bin|obj|\.sdk|test-output|\.serena)\//i.test(file),`Private/build path in source: ${file}`);
 assert.ok(!/\.SC2Replay$|\.(?:pfx|key|pem)$/i.test(file),`Private file in source: ${file}`);
 if(/\.(?:cs|js|cjs|ps1|vbs|md|json|ya?ml|html|csproj|targets)$/.test(file))assert.ok(!token.test(fs.readFileSync(path.join(root,file),'utf8')),`Potential credential in ${file}; publication stopped`);
}
for(const required of ['ReleaseUpdater.cs','ReleaseUpdaterTests.cs','.github/workflows/release.yml','Publish-Release.ps1','verification/fixtures/sc2-latest-party.json'])assert.ok(files.includes(required),`Missing source: ${required}`);
const result={success:true,sourceFiles:files.length,privateDataExcluded:true,credentialPatternScanPassed:true,remotePublication:false,checkedAt:new Date().toISOString()};
fs.writeFileSync(path.join(__dirname,'github-release-source-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
