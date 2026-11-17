'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'shared/china-marathon-feature.json'),OUT=path.join(ROOT,'web/public/images/athlete-feature');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const seconds=v=>/^\d+:[0-5]\d:[0-5]\d$/.test(v||'')?String(v).split(':').reduce((n,p)=>n*60+Number(p),0):NaN;
function graphic(p){
 const seen=new Set();let all=(p.seasonProgression||[]).filter(r=>r.date<='2026-11-17'&&Number.isFinite(seconds(r.mark))).sort((a,b)=>Number(a.year)-Number(b.year)).filter(r=>!seen.has(Number(r.year))&&seen.add(Number(r.year)));
 let rows=all.length<=8?all:[all[0],...all.slice(-7)];const pb=all.find(r=>r.mark===p.personalBest);if(pb&&!rows.includes(pb))rows=[rows[0],pb,...rows.slice(-6)].sort((a,b)=>Number(a.year)-Number(b.year));
 if(!rows.length)rows=[{year:p.eventDate.slice(0,4),mark:p.personalBest}];
 const height=240+rows.length*58,max=Math.ceil(Math.max(...rows.map(r=>seconds(r.mark)))/1800)*1800,scale=385/max;
 let body=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" role="img"><rect width="720" height="${height}" rx="24" fill="#f5f2ed"/><g font-family="PingFang SC,Noto Sans CJK SC,Arial,sans-serif"><text x="34" y="44" fill="#a22b37" font-size="24" letter-spacing="2">赛道人物 / 生涯的刻度</text><text x="34" y="96" fill="#22232b" font-size="36" font-weight="600">${escape(p.name)}</text><text x="686" y="96" fill="#a22b37" text-anchor="end" font-size="36" font-weight="600">${escape(p.personalBest)} PB</text><text x="34" y="136" fill="#62636c" font-size="24">全马年度最佳 · 条长从零表示总用时</text>`;
 for(let n=0;n<=max;n+=3600){const x=145+n*scale;body+=`<line x1="${x}" y1="183" x2="${x}" y2="${183+rows.length*58}" stroke="#dedbd7"/><text x="${x}" y="174" fill="#6d6c73" font-size="22" text-anchor="middle">${n/60}分</text>`;}
 rows.forEach((r,i)=>{const y=210+i*58,isPB=r.mark===p.personalBest;body+=`<text x="34" y="${y+8}" fill="#44444e" font-size="28">${escape(r.year)}</text><rect x="145" y="${y-17}" height="26" width="${(seconds(r.mark)*scale).toFixed(2)}" rx="4" fill="${isPB?'#a22b37':'#85818c'}"/><text x="686" y="${y+8}" text-anchor="end" fill="${isPB?'#a22b37':'#44444e'}" font-size="30">${escape(r.mark)}</text>`;});
 body+=`<text x="34" y="${height-35}" fill="#6d6c73" font-size="22">World Athletics · 截止2026-11-17</text></g></svg>`;
 return {svg:body,height,rows};
}
async function main(){fs.mkdirSync(OUT,{recursive:true});const data=JSON.parse(fs.readFileSync(DATA));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{const page=await browser.newPage({deviceScaleFactor:1});for(const p of data.athletes){const g=graphic(p);fs.writeFileSync(path.join(OUT,p.worldAthleticsId+'.svg'),g.svg);await page.setViewportSize({width:720,height:g.height});await page.setContent(g.svg);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(OUT,p.worldAthleticsId+'.png')});}console.log('Rendered '+data.athletes.length+' original source-linked career graphics.');}finally{await browser.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={graphic};
