const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),relative=path.relative(ROOT,__dirname);
const steps=[
  ['VM',path.join(relative,'mini-vm-audit.cjs'),{},'mini-vm.log'],
  ['Native','design/previews/mini-native-check.cjs',{MINI_NATIVE_REPORT:path.join(relative,'native-report.json')},'mini-native.log'],
  ['Mirror','design/previews/mini-ui-source-audit.cjs',{MINI_AUDIT_ROUTES:'pages/member-profile/member-profile,pages/mileage/mileage',MINI_AUDIT_FIXTURE:path.join(relative,'fixture.cjs'),UI_AUDIT_OUT:path.join(relative,'mini'),UI_AUDIT_REPORT:path.join(relative,'mini-report.json')},'mini-mirror.log'],
  ['Contacts',path.join(relative,'mini-contacts.cjs'),{},'mini-contacts.log']
];
for(const [name,file,env,log]of steps){const run=spawnSync(process.execPath,[file],{cwd:ROOT,env:{...process.env,...env},encoding:'utf8',maxBuffer:12*1024*1024});fs.writeFileSync(path.join(__dirname,log),(run.stdout||'')+(run.stderr||''));console.log(name,run.status===0?'PASS':'FAIL');if(run.status!==0){console.error((run.stdout||'')+(run.stderr||''));process.exit(run.status||1);}}
const files=['pages/member-profile/member-profile','pages/mileage/mileage','pages/club/club','components/mileage-board/mileage-board'].flatMap(file=>['.js','.wxml','.wxss','.json'].map(ext=>'miniprogram/'+file+ext)).concat(['miniprogram/utils/member-profile.js','miniprogram/utils/mileage-board.js','miniprogram/utils/mileage-pages.wxss']);
fs.writeFileSync(path.join(__dirname,'mini-source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:files.filter(file=>fs.existsSync(path.join(ROOT,file))).map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex')}))},null,2));
