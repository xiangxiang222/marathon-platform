/* Review screenshots use local synthetic API replies and never write business data. */
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const { careerOf, trainingOf } = require('../../server/src/runner-center');
const out = path.join(__dirname, 'mine-visual-v3-20261111/web');
const origin = process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5174/marathon';
const raw = require('./achievement-poster-mini-fixture.cjs').runnerPayload(4).results;
const clock = value => [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':');
const results = raw.map(item => ({ ...item, clock: clock(item.seconds), distanceLabel: ({full:'全马',half:'半马','10k':'10公里','5k':'5公里'})[item.distance], hasProof: false }));
const career = careerOf(results, '2026-11-11');
const runs = [8.2, 0, 12.4, 0, 6.2, 0, 0].flatMap((km, i) => km ? [{ id: i + 1, type: 'run', started_at: `2026-11-${String(9 + i).padStart(2, '0')}T06:30`, distance_km: km, duration_sec: Math.round(km * 330), city: '杭州', source: 'manual' }] : []);
const training = trainingOf(runs, 'week', 0, new Date('2026-11-11T08:00:00Z'));
const runner = { asOf:'2026-11-11', overview:{weekKm:training.km,weekCount:training.count,weekDurationSec:training.durationSec,monthKm:26.8,totalKm:1260,totalCount:116}, training, career, results, media:[], devices:[] };
const account = { user:{id:1,nickname:'一路向前的跑者',avatar:'',leader:false,hasPassword:true}, clubs:[{id:1,name:'城市晨跑团',role:'member',roleLabel:'成员'}], plans:[{status:'已中签',race:{id:'next',name:'城市马拉松',raceDate:'2026-11-29',city:'杭州'}}], results, career:{finished:career.finished,provinces:career.provinces,cities:career.cities,pb:{full:career.pb.find(p=>p.distance==='full')?.clock,half:career.pb.find(p=>p.distance==='half')?.clock},yearKm:68.3},reminders:[],conflicts:[] };
(async () => {
  fs.mkdirSync(out, { recursive:true });
  const browser = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
  const report = {kind:'Mine visual review with synthetic local API replies',scenes:[],errors:[]};
  try {
    for (const width of [320,390]) for (const guest of [false,true]) {
      const context = await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
      await context.addInitScript(auth => {localStorage.clear();if(auth){localStorage.setItem('marathon_token','visual-fixture');localStorage.setItem('marathon_name','一路向前的跑者');}}, !guest);
      const page = await context.newPage();page.on('pageerror',err=>report.errors.push(err.message));
      await page.route('**/marathon/api/**', route => { const p = new URL(route.request().url()).pathname.replace('/marathon/api',''); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p==='/me'?account:p==='/me/runner'?runner:p==='/legal'?require('../../shared/legal-documents.json'):p==='/meta'?{company:'北京华创科技有限公司',icp:'京ICP备2026060284号-2'}:p==='/me/feedback/summary'?{unread:0}:{})}); });
      await page.goto(origin + '/mine');await page.waitForLoadState('networkidle');
      for (const scene of guest ? ['guest','settings'] : ['overview','results','profile','settings']) {
        if (scene==='settings') await page.getByRole('button',{name:'设置',exact:true}).click();
        if (scene==='results') await page.getByRole('button',{name:'完赛记录',exact:true}).click();
        if (scene==='profile') await page.getByRole('button',{name:'个人资料',exact:true}).click();
        const name = `mine-${guest?'guest-':''}${scene}-${width}.png`;
        await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});
        const metrics = await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,broken:[...document.images].filter(i=>i.getBoundingClientRect().width&&!i.naturalWidth).map(i=>i.src)}));
        report.scenes.push({scene,width,guest,file:name,...metrics,passed:metrics.scroll<=metrics.width&&!metrics.broken.length});
      }
      await context.close();
    }
  } finally { await browser.close(); }
  report.passed = !report.errors.length && report.scenes.every(s=>s.passed);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,out}));
  if(!report.passed)process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1});
