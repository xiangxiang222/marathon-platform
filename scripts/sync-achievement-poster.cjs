// Keep Canvas 2D implementation identical in Mini CommonJS and Web ESM.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'miniprogram/utils/achievement-poster.js'),target=path.join(root,'web/src/achievement-poster.js');
const expected=fs.readFileSync(source,'utf8').replace("const { paginateAchievement, STYLES } = require('./achievement-model');", "import { paginateAchievement, STYLES } from './achievement-model';").replace('module.exports={renderAchievementPoster};','export { renderAchievementPoster };');
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==expected){console.error('Achievement poster mirror differs. Run node scripts/sync-achievement-poster.cjs');process.exitCode=1;}}
else fs.writeFileSync(target,expected);
