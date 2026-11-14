const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-radar-live-'));
process.env.MARATHON_DB = path.join(temporary, 'app.sqlite');
process.env.MARATHON_MEDIA = path.join(temporary, 'media');
process.env.BASE_PATH = '/marathon';
process.env.NODE_ENV = 'test';
const { app } = require('../server/src/index');
const { getDb } = require('../server/src/db');
const { seedRadarDemo } = require('./seed-radar-demo.cjs');
const directory = path.resolve(__dirname, '../design/previews/radar-20261114');
const report = { checks: [], errors: [], screenshots: [], passed: false };
let server, browser;
async function check(name, fn) { await fn(); report.checks.push(name); }
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits viewport'); }
async function main() {
  fs.mkdirSync(directory, {recursive:true});
  const db = getDb(); seedRadarDemo(db);
  const { loadRadarConfig, saveRadarConfig } = require('../server/src/radar-engine');
  db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES('radar-auth-check','匿名阵容验收赛','测试市','测试省','full','2027-06-01','','','road','offline')").run();
  const liveConfig=loadRadarConfig(db,'radar-demo-lakeside');liveConfig.demo=false;liveConfig.groups=liveConfig.groups.filter(item=>item.id==='full-men');saveRadarConfig(db,'radar-auth-check',liveConfig);
  const token = 'radar-live-private-token';
  db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('拿奖雷达验收跑者',token,new Date().toISOString());
  server = await new Promise(resolve => { const listener = app.listen(0,'127.0.0.1',()=>resolve(listener)); });
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  for (const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    await context.addInitScript(value=>localStorage.setItem('marathon_token',value),token);
    const page=await context.newPage(); page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto(origin+'/marathon/radar');
    await page.getByRole('button',{name:'寻找拿奖机会'}).waitFor();
    await check('target search and responsive list '+width,async()=>{
      await page.getByRole('button',{name:'男子组',exact:true}).click();
      await page.getByLabel('目标完赛时间',{exact:true}).fill('2:20:00');
      await page.getByRole('button',{name:'寻找拿奖机会'}).click();
      await page.getByText('滨湖马拉松 · 模拟赛事',{exact:true}).waitFor();
      await noOverflow(page);
      await page.screenshot({path:path.join(directory,'web-list-'+width+'.png'),fullPage:true});report.screenshots.push('web-list-'+width+'.png');
    });
    await check('race detail, complete top eight, year switch and entrants '+width,async()=>{
      await page.getByRole('button',{name:'查看滨湖马拉松 · 模拟赛事的拿奖分析'}).click();
      await page.getByRole('heading',{name:'历年前八',exact:true}).waitFor();
      assert.equal(await page.locator('.rank-table tbody tr').count(),8);
      assert.match(await page.locator('.entrant').first().innerText(),/模拟跑者A/);
      assert.match(await page.locator('.entrant').first().innerText(),/2:16:00/);
      const currentYear=Number(new Date(Date.now()+8*3600000).toISOString().slice(0,4));
      await page.getByRole('button',{name:String(currentYear-1),exact:true}).click();
      assert.match(await page.locator('.rank-table tbody tr').first().innerText(),/2:17:45/);
      assert.match(page.url(),/raceId=radar-demo-lakeside/);
      await noOverflow(page);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(directory,'web-detail-'+width+'.png'),fullPage:true});report.screenshots.push('web-detail-'+width+'.png');
      await page.reload();await page.getByRole('heading',{name:'历年前八',exact:true}).waitFor();assert.equal(await page.locator('.rank-table tbody tr').count(),8);
    });
    if(width===390)await check('gender search and unavailable distance retain honest empty states',async()=>{
      await page.getByRole('button',{name:'‹ 返回比赛列表',exact:true}).click();
      await page.getByRole('button',{name:'女子组',exact:true}).click();
      await page.getByLabel('目标完赛时间',{exact:true}).fill('2:40:00');
      await page.getByRole('button',{name:'寻找拿奖机会'}).click();
      await page.getByText('滨湖马拉松 · 模拟赛事',{exact:true}).waitFor();
      assert.ok(await page.locator('.radar-race-card').count() >= 1);
      for(const card of await page.locator('.radar-race-card').all())assert.match(await card.innerText(),/女子全马/);
      await page.getByRole('button',{name:'10 公里',exact:true}).click();
      await page.getByRole('button',{name:'全部参考',exact:true}).click();
      await page.getByRole('heading',{name:'这个项目还没有收录资料',exact:true}).waitFor();
      await page.getByRole('button',{name:'全马',exact:true}).click();
      await page.getByRole('button',{name:'男子组',exact:true}).click();
      await page.getByLabel('目标完赛时间',{exact:true}).fill('2:20:00');
      await page.getByRole('button',{name:'寻找拿奖机会'}).click();
      await page.getByText('滨湖马拉松 · 模拟赛事',{exact:true}).waitFor();
    });
    if(width===390)await check('explicit anonymous PB contribution and withdrawal through real API',async()=>{
      await page.goto(origin+'/marathon/radar?raceId=radar-auth-check&groupId=full-men');
      await page.getByRole('button',{name:'我已中签，补充阵容',exact:true}).click();
      assert.equal(await page.getByRole('checkbox').isChecked(),false);
      await page.getByLabel('本人 PB',{exact:true}).fill('2:12:30');
      await page.getByLabel('PB 日期',{exact:true}).fill('2025-04-12');
      await page.getByRole('checkbox').check();
      await page.getByRole('button',{name:'保存参赛线索',exact:true}).click();
      await page.getByRole('button',{name:'管理我的参赛线索',exact:true}).waitFor();
      await page.getByRole('button',{name:'管理我的参赛线索',exact:true}).click();
      assert.equal(await page.getByLabel('本人 PB',{exact:true}).inputValue(),'2:12:30');
      assert.equal(await page.getByRole('checkbox').isChecked(),false);
      await page.getByRole('button',{name:'撤回雷达授权',exact:true}).click();
      await page.getByRole('button',{name:'我已中签，补充阵容',exact:true}).waitFor();
    });
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}
main().catch(error=>{report.errors.push(error.stack||error.message);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  try{getDb().close();}catch(_){}
  fs.rmSync(temporary,{recursive:true,force:true});fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'web-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
});
