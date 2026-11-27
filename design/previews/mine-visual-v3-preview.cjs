/* Review screenshots use local synthetic API replies and never write business data. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { careerOf, trainingOf } = require('../../server/src/runner-center');
const { sceneTone } = require('./mine-visual-v3-fixture.cjs');
const out = process.env.MINE_VISUAL_OUT || path.join(__dirname, 'mine-visual-v3-20261111/web');
const origin = process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5174/marathon';
const raw = require('./achievement-poster-mini-fixture.cjs').runnerPayload(4).results;
const clock = value => [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':');
const results = raw.map(item => ({ ...item, clock: clock(item.seconds), distanceLabel: ({full:'全马',half:'半马','10k':'10公里','5k':'5公里'})[item.distance], hasProof: false }));
const career = careerOf(results, '2026-11-11');
const runs = [8.2, 0, 12.4, 0, 6.2, 0, 0].flatMap((km, i) => km ? [{ id: i + 1, type: 'run', started_at: `2026-11-${String(9 + i).padStart(2, '0')}T06:30`, distance_km: km, duration_sec: Math.round(km * 330), city: '杭州', source: 'manual' }] : []);
const training = trainingOf(runs, 'week', 0, new Date('2026-11-11T08:00:00Z'));
const runner = { asOf:'2026-11-11', overview:{weekKm:training.km,weekCount:training.count,weekDurationSec:training.durationSec,monthKm:26.8,totalKm:1260,totalCount:116}, training, career, results, media:[], devices:[] };
const account = { user:{id:1,nickname:'参加城市马拉松与周末跑团训练的跑者',avatar:'',leader:false,hasPassword:true}, clubs:[{id:1,name:'城市晨跑团',role:'member',roleLabel:'成员'}], plans:[{status:'已中签',race:{id:'next',name:'城市马拉松',raceDate:'2026-11-29',city:'杭州'}}], results, career:{finished:career.finished,provinces:career.provinces,cities:career.cities,pb:{full:career.pb.find(p=>p.distance==='full')?.clock,half:career.pb.find(p=>p.distance==='half')?.clock},yearKm:68.3},reminders:[],conflicts:[] };
(async () => {
  fs.mkdirSync(out, { recursive:true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
  const report = {kind:'Mine visual review with synthetic local API replies',scenes:[],errors:[]};
  try {
    for (const width of [320,390]) for (const guest of [false,true]) {
      const context = await browser.newContext({viewport:{width,height:width === 320 ? 568 : 844},reducedMotion:'reduce'});
      await context.addInitScript(nickname => {localStorage.clear();if(nickname){localStorage.setItem('marathon_token','visual-fixture');localStorage.setItem('marathon_name',nickname);}}, guest ? '' : account.user.nickname);
      const page = await context.newPage();page.on('pageerror',err=>report.errors.push(err.message));
      await page.route('**/marathon/api/**', route => { const p = new URL(route.request().url()).pathname.replace('/marathon/api',''); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p==='/me'?account:p==='/me/runner'?runner:p==='/legal'?require('../../shared/legal-documents.json'):p==='/meta'?{company:'北京华创科技有限公司',icp:'京ICP备2026060284号-2'}:p==='/me/feedback/summary'?{unread:0}:{})}); });
      await page.goto(origin + '/mine');await page.waitForLoadState('networkidle');
      const membership = guest ? '.guest-hero' : '.account-hero .nick';
      await page.locator(membership).waitFor();
      const check = async (label, verify) => {
        try { await verify(); }
        catch (error) { report.errors.push(width + 'px ' + label + ': ' + error.message); }
      };
      await check('bright identity and legible text', async () => {
        const tone = await sceneTone(page, guest ? '.guest-scene' : '.identity-panel', guest ? '.guest-scene h2' : '.identity-panel .nick');
        assert.ok(tone.luminance >= 0.50 && tone.contrast >= 4.5, JSON.stringify(tone));
        if (guest) {
          const cta = await sceneTone(page, '.guest-login-row .hero-login', '.guest-login-row .hero-login');
          assert.ok(cta.contrast >= 4.5, JSON.stringify(cta));
        }
      });
      if (guest) await check('public-only guest workspace', async () => {
        assert.equal(await page.locator('.guest-hero .guest-scene h2').textContent({ timeout: 1500 }), '欢迎来到赛历');
        assert.equal(await page.getByRole('navigation', { name: '个人中心' }).count(), 0);
        assert.equal(await page.locator('.guest-public-links a[href$="/calendar"]').count(), 1);
        assert.equal(await page.locator('.account-stats').count(), 0);
        await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
        await page.getByRole('button', { name: '账号登录', exact: true }).waitFor({ timeout: 1500 });
        await page.getByRole('button', { name: '收起登录', exact: true }).click();
      });
      else await check('member identity and contextual service card', async () => {
        assert.equal(await page.locator('.member-services').count(), 1);
        assert.equal(await page.locator('.member-services .account-stats > *').count(), 3);
        const service = page.locator('.member-services');
        const profile = page.locator('.identity-panel');
        assert.ok((await service.boundingBox()).y < (await profile.boundingBox()).y + (await profile.boundingBox()).height);
        assert.equal(await page.locator('.nick').textContent(), account.user.nickname);
        assert.ok(await service.locator('.account-stats > *').evaluateAll(nodes => nodes.every(node => {
          const box = node.getBoundingClientRect();
          return box.height >= 44 && box.width >= 44 && node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })));
        await service.getByRole('button', { name: /已标记赛事/ }).click();
        await page.locator('.plan-list').waitFor({ timeout: 1500 });
        await page.getByRole('button', { name: '总览', exact: true }).click();
        await page.getByRole('heading', { name: '本周运动' }).first().waitFor({ timeout: 1500 });
      });
      for (const scene of guest ? ['guest','settings'] : ['overview','results','profile','settings']) {
        if (scene==='settings') await page.getByRole('button',{name:'设置',exact:true}).click();
        if (scene==='results') {
          await page.getByRole('button',{name:'完赛记录',exact:true}).click();
          await check('complete-records summary offers existing history destination', async () => {
            const summary = page.locator('.results-overview');
            assert.equal(await summary.getByRole('heading',{name:'完赛概览'}).count(), 1);
            const history = summary.getByRole('link',{name:'我的跑史'});
            assert.match(await history.getAttribute('href'), /\/history$/);
            assert.ok((await history.boundingBox()).height >= 44);
            assert.equal(await summary.locator('.career-summary > :not(.compact-poster)').count(), 3);
          });
        }
        if (scene==='profile') await page.getByRole('button',{name:'个人资料',exact:true}).click();
        const name = `mine-${guest?'guest-':''}${scene}-${width}.png`;
        await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});
        const metrics = await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,broken:[...document.images].filter(i=>i.getBoundingClientRect().width&&!i.naturalWidth).map(i=>i.src)}));
        report.scenes.push({scene,width,guest,file:name,...metrics,passed:metrics.scroll<=metrics.width&&!metrics.broken.length});
      }
      if (!guest) await check('career summary has a light scene, accurate totals and visible services', async () => {
        await page.goto(origin + '/runner?view=career');
        await page.locator('.career-count').waitFor();
        const tone = await sceneTone(page, '.runner-header', '.runner-header h1');
        assert.ok(tone.luminance >= 0.50 && tone.contrast >= 4.5, JSON.stringify(tone));
        assert.equal(await page.locator('.career-hero .career-count').innerText(), career.finished + '场');
        const history = page.locator('.career-hero .history-entry');
        assert.match(await history.getAttribute('href', { timeout: 1500 }), /\/history$/);
        assert.ok((await history.boundingBox()).height >= 44);
        assert.equal(await page.locator('.runner-achievement-entry a[href*="achievement-poster"]').count(), 1);
        const name = `runner-career-${width}.png`;
        await page.screenshot({ path: path.join(out, name), fullPage: true, animations: 'disabled' });
        report.scenes.push({ scene: 'career', width, guest, file: name, passed: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) });
      });
      await context.close();
    }
  } finally { await browser.close(); }
  report.passed = !report.errors.length && report.scenes.every(s=>s.passed);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,out}));
  if(!report.passed)process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1});
