const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'shared/radar-preview.cjs'),'utf8');
let failed=false;
for(const [file,content] of [['miniprogram/utils/radar-preview.js',source],['web/src/radar-preview.js',source.replace('module.exports={previewRadar};','export {previewRadar};')]]) {
  const target=path.join(root,file);
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content){failed=true;console.error('Preview module needs sync: '+file);}}
  else fs.writeFileSync(target,content);
}
if(failed)process.exitCode=1;
