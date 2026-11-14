const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'shared/radar-preview.cjs'),'utf8');
// Vite already pins esbuild in web/package-lock.json. Keep the shared fixture
// readable, and package only its compact runtime form in the mini program.
const {transformSync}=require('../web/node_modules/esbuild');
const mini=transformSync(source,{minify:true,charset:'utf8',target:'es2020'}).code;
let failed=false;
for(const [file,content] of [['miniprogram/utils/radar-preview.js',mini],['web/src/radar-preview.js',source.replace('module.exports={previewRadar};','export {previewRadar};')]]) {
  const target=path.join(root,file);
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content){failed=true;console.error('Preview module needs sync: '+file);}}
  else fs.writeFileSync(target,content);
}
if(failed)process.exitCode=1;
