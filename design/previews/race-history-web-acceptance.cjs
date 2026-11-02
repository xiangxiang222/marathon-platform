const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-history-web-'));
process.env.MARATHON_DB = path.join(temporary, 'app.sqlite');
process.env.MARATHON_MEDIA = path.join(temporary, 'media');
process.env.BASE_PATH = '/marathon';
process.env.NODE_ENV = 'test';
const { app } = require('../../server/src/index');
const { getDb } = require('../../server/src/db');
const report = { checks: [], errors: [], screenshots: [], passed: false };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=', 'base64');
let server;
const token = 'history-web-private-token';
async function check(name, action) { await action(); report.checks.push(name); }
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page has no horizontal overflow'); }
async function main() {
  const db = getDb();
  const first = db.prepare('INSERT INTO users (nickname,token,created_at) VALUES (?,?,?)').run('跑史验收跑者', token, new Date().toISOString());
  db.prepare('INSERT INTO users (nickname,token,created_at) VALUES (?,?,?)').run('另一个独立跑者', 'history-other-token', new Date().toISOString());
  const oldRace = 'history-web-legacy';
  db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES (?,?,?,?,?,?,'','','road','offline')").run(oldRace, '2022 原有全马', '南京', '江苏', 'full', '2022-11-06');
  db.prepare("INSERT INTO results(user_id,race_id,distance,seconds,story,updated_at) VALUES (?,?,'full',14500,'这是原有成绩',?)").run(Number(first.lastInsertRowid), oldRace, new Date().toISOString());
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = async (suffix, options = {}) => {
    const response = await fetch(origin + '/marathon/api/me/race-history' + suffix, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  await request('', { method: 'POST', body: JSON.stringify({name:'2025 天津马拉松',raceDate:'2025-10-26',city:'天津',province:'天津',distance:'full',kind:'road',meet:'offline',status:'finished',timing:'net',netTime:'03:52:42'}) });
  const latest = await request('', { method: 'POST', body: JSON.stringify({name:'2026 北京马拉松',raceDate:'2026-10-18',city:'北京',province:'北京',distance:'full',kind:'road',meet:'offline',status:'finished',timing:'net',netTime:'03:12:45',story:'最后一公里抬起头，终于看见了自己期待的终点。',tags:['突破']}) });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: {width,height:900},deviceScaleFactor:1 });
      await context.addInitScript(value => localStorage.setItem('marathon_token', value), token);
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(origin + '/marathon/history');
      await page.locator('.growth-highlight').waitFor();
      await check('growth layout and exact PB difference at '+width, async () => {
        assert.match(await page.locator('.improvement').innerText(), /39′57″/);
        assert.ok(Number(await page.locator('.history-counts strong').first().innerText())>=3);
        await noOverflow(page);
        const name = 'race-history-live-' + width + '.png';
        await page.screenshot({path:path.join(__dirname,name),fullPage:true});report.screenshots.push(name);
      });
      if (width === 390) {
        await check('personal review uses actual data and can be edited without changing original result', async () => {
          await page.getByRole('button',{name:'打开这场回顾'}).click();
          await page.locator('.review-insight').waitFor();
          assert.match(await page.locator('.review-score').innerText(), /03:12:45/);
          assert.match(await page.locator('.source-facts').innerText(), /同项目|相同计时口径/);
          assert.match(await page.locator('.personal-story').innerText(), /最后一公里/);
          await page.getByRole('button',{name:'编辑这场经历',exact:true}).click();
          const editor = page.locator('.history-dialog[open]');
          await editor.getByLabel('这场最想记住的是什么？').fill('跑向终点，也跑向了更喜欢的自己。');
          await editor.getByRole('button',{name:'归来',exact:true}).click();
          await editor.getByRole('button',{name:'保存这场经历',exact:true}).click();
          await page.getByText('跑向终点，也跑向了更喜欢的自己。',{exact:true}).waitFor();
          assert.match(await page.locator('.memory-tags').innerText(),/归来/);
          await page.locator('.material-details summary').click();
          await page.getByLabel('保存比赛图片').setInputFiles({name:'finish.png',mimeType:'image/png',buffer:png});
          await page.getByText('图片已保存到这场经历，仅自己可见。',{exact:true}).waitFor();
          if(!(await page.locator('.material-details').evaluate(e=>e.open)))await page.locator('.material-details summary').click();
          await page.getByRole('button',{name:'设为代表照片',exact:true}).click();
          await page.getByText('代表照片已更新。',{exact:true}).waitFor();
          assert.equal(await page.locator('.review-cover').count(),1);
          await noOverflow(page);
          const name = 'race-history-live-390-review.png';await page.screenshot({path:path.join(__dirname,name),fullPage:true});report.screenshots.push(name);
        });
        await check('manual DNF and missing-time finish preserve experiences without false PB', async () => {
          await page.getByRole('button',{name:'我的跑史',exact:true}).click();
          await page.getByRole('button',{name:'记一场 ＋',exact:true}).click();
          const editor = page.locator('.history-dialog[open]');
          await editor.getByLabel('比赛名称',{exact:true}).fill('一次认真跑过的越野');
          await editor.getByLabel('比赛日期',{exact:true}).fill('2024-10-05');
          await editor.getByLabel('赛事类型',{exact:true}).selectOption('trail');
          await editor.getByLabel('项目',{exact:true}).selectOption('other');
          await editor.getByLabel('这场的状态',{exact:true}).selectOption('dnf');
          await editor.getByRole('button',{name:'保存这场经历',exact:true}).click();
          await page.locator('.review-insight').waitFor();
          assert.match(await page.locator('.review-score').innerText(),/未完赛/);
          assert.equal((await request('')).summary.finished,3);
          await page.getByRole('button',{name:'我的跑史',exact:true}).click();
          await page.getByRole('button',{name:'记一场 ＋',exact:true}).click();
          await editor.getByLabel('比赛名称',{exact:true}).fill('没有用时也记得的半马');
          await editor.getByLabel('比赛日期',{exact:true}).fill('2023-03-10');
          await editor.getByLabel('项目',{exact:true}).selectOption('half');
          await editor.getByRole('button',{name:'保存这场经历',exact:true}).click();
          await page.locator('.review-insight').waitFor();
          assert.match(await page.locator('.source-facts').innerText(),/还没有完赛用时/);
        });
        await check('CSV candidate review blocks confirmation until checked and preserves duplicate', async () => {
          await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();
          await page.getByLabel('成绩文字或表格').fill('比赛名称,日期,项目,净计时,枪声时间,城市\n2025 天津马拉松,2025-10-26,全马,03:52:42,,天津\n2024 城市半马,2024-03-24,半马,01:42:30,01:43:00,杭州');
          await page.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
          await page.locator('.candidate').first().waitFor();
          assert.equal(await page.locator('.candidate').count(),2);
          assert.equal(await page.locator('.candidate').first().locator('.candidate-select input').isDisabled(),true);
          const submit = page.getByRole('button',{name:'确认加入 1 场比赛',exact:true});
          assert.equal(await submit.isDisabled(),true);
          await page.locator('.candidate').last().getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).check();
          assert.equal(await submit.isDisabled(),false);
          await submit.click();
          await page.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
          assert.equal((await request('')).entries.filter(x=>x.name==='2025 天津马拉松').length,1);
          await page.getByRole('button',{name:'拾回忆',exact:true}).click();
          assert.ok(await page.locator('.memory-card').count()>=5);
        });
        await check('unknown CSV distances stay unselected and cannot be confirmed until explicitly corrected', async () => {
          const distances=['15公里','25公里','35公里','50公里','100公里','半程/全程'];
          await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();
          await page.getByLabel('成绩文字或表格').fill('比赛名称,日期,项目,净计时\n'+distances.map((distance,index)=>`需核对的项目${index},2024-05-01,${distance},02:00:00`).join('\n'));
          await page.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
          await page.locator('.candidate').first().waitFor();
          assert.equal(await page.locator('.candidate').count(),distances.length);
          let confirms=0;
          const countConfirms=req=>{if(req.method()==='POST'&&req.url().endsWith('/import/confirm'))confirms++;};
          page.on('request',countConfirms);
          const submit=page.getByRole('button',{name:`确认加入 ${distances.length} 场比赛`,exact:true});
          for(let index=0;index<distances.length;index++){
            const candidate=page.locator('.candidate').nth(index);
            assert.equal(await candidate.getByLabel('项目',{exact:true}).inputValue(),'');
            assert.match(await candidate.innerText(),new RegExp(distances[index]));
            assert.match(await candidate.locator('.candidate-validation').innerText(),/请确认比赛项目/);
            await candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).check();
          }
          assert.equal(await submit.isDisabled(),true);
          await submit.evaluate(button=>button.click());
          assert.equal(confirms,0,'checking acknowledgement cannot submit an unidentified project');
          for(let index=0;index<distances.length;index++){
            const candidate=page.locator('.candidate').nth(index);
            await candidate.getByLabel('项目',{exact:true}).selectOption('other');
            assert.equal(await candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).isChecked(),false,'changing project invalidates the old acknowledgement');
            await candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).check();
          }
          assert.equal(await submit.isDisabled(),false);
          await submit.click();
          await page.getByText(`已加入 ${distances.length} 场比赛。`,{exact:true}).waitFor();
          const stored=(await request('')).entries.filter(item=>item.name.startsWith('需核对的项目'));
          assert.equal(stored.length,distances.length);
          assert.ok(stored.every(item=>item.distance==='other'));
          assert.equal(confirms,1);
          page.off('request',countConfirms);
        });
        await check('all separate project evidence remains visible and blocks confirmation while invalid earlier fields do not veto a clear project', async () => {
          const clauseToken='history-project-clause-private-token';
          db.prepare('INSERT INTO users (nickname,token,created_at) VALUES (?,?,?)').run('项目范围核对跑者',clauseToken,new Date().toISOString());
          const clauseContext=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:1});
          await clauseContext.addInitScript(value=>localStorage.setItem('marathon_token',value),clauseToken);
          const clausePage=await clauseContext.newPage();
          clausePage.on('pageerror',error=>report.errors.push(error.message));
          let confirms=0;
          clausePage.on('request',req=>{if(req.method()==='POST'&&req.url().endsWith('/import/confirm'))confirms++;});
          const clauseHistory=()=>request('',{headers:{Authorization:'Bearer '+clauseToken}});
          const makeText=(clue,index)=>'赛事名称：项目范围核对'+index+'\n日期：2024-10-20\n'+clue+'\n净计时：03:12:45';
          try{
            await clausePage.goto(origin+'/marathon/history?import=1');
            const source=clausePage.getByLabel('成绩文字或表格');
            const candidate=clausePage.locator('.candidate');
            const acknowledgement=candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'});
            const submit=clausePage.getByRole('button',{name:'确认加入 1 场比赛',exact:true});
            const previewText=async text=>{
              await source.fill(text);
              const previewed=clausePage.waitForResponse(response=>response.url().endsWith('/import/preview')&&response.request().method()==='POST');
              await clausePage.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
              const preview=await (await previewed).json();
              await candidate.waitFor();assert.equal(preview.candidates.length,1);
              return preview.candidates[0];
            };
            const englishUnitCases = [
              ['距离(m)：5000,项目：半程', ['5000', '半程']],
              ['距离(m)：5000,10000', ['5000', '10000']],
              ...[['5 kilometers', '半程'], ['10 kilometres', '半程'], ['5000 meters', '半程'], ['10000 metres', '全程'], ['26.2mi', '半程'], ['26.2 mile', '半程'], ['26.2miles', '半程'], ['13.1mi', '全程'], ['26.2英哩', '半程'], ['5kms', '半程'], ['10kms', '半程']].flatMap(([project, other]) => [
                ['完赛项目：' + project + '\n项目：' + other, [project, other]],
                ['项目：' + other + '\n完赛项目：' + project, [other, project]]
              ]),
              ...[['距离（米）', '42195', '半程'], ['距离（米）', '5000', '半程'], ['距离（米）', '21097.5', '全程'], ['距离（m）', '5000', '半程']].flatMap(([field, project, other]) => [
                [field + '：' + project + '\n项目：' + other, [project, other]],
                ['项目：' + other + '\n' + field + '：' + project, [other, project]]
              ]),
              ...[['比赛组别', '半程', '全程'], ['参赛组别', '10公里', '半程']].flatMap(([field, project, other]) => [
                [field + '：' + project + '\n完赛项目：' + other, [project, other]],
                ['完赛项目：' + other + '\n' + field + '：' + project, [other, project]]
              ])
            ];
            const metricUnitCases = [
              ...[['5000m', '半程'], ['10000m', '全程'], ['42195m', '半程'], ['21097.5m', '全程'], ['5,000m', '半程'], ['五千m', '半程'], ['5000公尺', '半程'], ['42195公尺', '半程'], ['五千公尺', '半程'], ['26.2英里', '半程']].flatMap(([project, other]) => [
                ['完赛项目：' + project + '\n项目：' + other, [project, other]],
                ['项目：' + other + '\n完赛项目：' + project, [other, project]]
              ]),
              ...[['报名项目', '半程', '全程'], ['竞赛项目', '10公里', '半程'], ['跑程', '全程', '半程']].flatMap(([field, project, other]) => [
                [field + '：' + project + '\n完赛项目：' + other, [project, other]],
                ['完赛项目：' + other + '\n' + field + '：' + project, [other, project]]
              ])
            ];
            const distanceNotationCases = [
              ...[['5000米', '半程'], ['10000米', '半程'], ['21097米', '全程'], ['42195米', '半程'], ['一万米', '半程'], ['42,195米', '半程']].flatMap(([project, other]) => [
                ['完赛项目：' + project + '\n项目：' + other, [project, other]],
                ['项目：' + other + '\n完赛项目：' + project, [other, project]]
              ]),
              ...[['赛程', '全程马拉松', '半程'], ['路程', '全程', '半程'], ['项目类型', '半程', '全程'], ['项目类别', '10公里', '半程'], ['赛项', '半程', '全程']].flatMap(([field, project, other]) => [
                [field + '：' + project + '\n项目：' + other, [project, other]],
                ['项目：' + other + '\n' + field + '：' + project, [other, project]]
              ]),
              ...['伍公里', '拾公里', '壹拾公里', '十公裡', '10公裡', '五km'].flatMap(project => [
                ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n完赛项目：' + project, ['半程', project]],
                [project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n' + project, ['半程', project]]
              ]),
              ['上半程和全程\n项目：5公里', ['上半程和全程', '5公里']],
              ['项目：5公里\n上半程和全程', ['5公里', '上半程和全程']]
            ];
            const standaloneNotationCases = [
              ...['26.2mi', '26.2 mile', '26.2miles', '13.1mi', '26.2英哩'].flatMap(project => [['完赛项目：' + project, [project]], [project, [project]]]),
              ['完赛项目：26.2英里', ['26.2英里']], ['26.2英里', ['26.2英里']],
              ...['十公里', '五公里', '十千米', '伍公里'].map(project => [project, [project]]),
              ['完赛项目：21097米', ['21097米']],
              ['21097米', ['21097米']]
            ];
            const explicitScopeCases = [
              ['完赛项目\n全程：03:12:45\n项目：半程', ['全程：03:12:45', '半程']],
              ['完赛项目：全程（5公里补给）\n项目：半程', ['全程（5公里补给）', '半程']],
              ['完赛项目：全程（分段10公里00:50:00）\n项目：半程', ['全程（分段10公里00:50:00）', '半程']],
              ['完赛项目：半程；全马用时03:12:45', ['半程', '全马用时03:12:45']],
              ['项目：半程\n完赛项目：全程马拉松 03:12:45', ['半程', '全程马拉松 03:12:45']],
              ['完赛项目：半程马拉松 01:35:00\n项目：全程', ['半程马拉松 01:35:00', '全程']],
              ...['全程马拉松 净计时：03:12:45', '全马用时03:12:45'].flatMap(project => [
                ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n完赛项目：' + project, ['半程', project]]
              ]),
              ['完赛项目：全马用时\n03:12:45\n项目：半程', ['全马用时', '03:12:45', '半程']],
              ['项目：半程\n完赛项目：全马用时\n03:12:45', ['半程', '全马用时', '03:12:45']],
              ['完赛项目：全程马拉松\n净计时：03:12:45\n项目：半程', ['全程马拉松', '半程']],
              ['项目：半程\n完赛项目：全程马拉松\n净计时：03:12:45', ['半程', '全程马拉松']],
              ['完赛项目：全程（上半程 01:05:00）\n项目：半程', ['全程（上半程 01:05:00）', '半程']],
              ['距离：42.195公里\n项目：半程', ['42.195公里', '半程']],
              ['项目：半程\n距离：42.195公里', ['半程', '42.195公里']],
              ['距离：半程、全程\n项目：5公里', ['半程、全程', '5公里']],
              ['项目：5公里\n距离：半程、全程', ['5公里', '半程、全程']],
              ['里程：全马\n项目：半程', ['全马', '半程']],
              ['项目名称：半程\n项目：全程', ['半程', '全程']],
              ['项目名：半程\n项目：全程', ['半程', '全程']],
              ...['；', ';', '|', '｜'].map(separator => ['完赛项目：10公里' + separator + '半程：01:35:00', ['10公里', '半程：01:35:00']]),
              ...['全程 03:12:45', '全程：03:12:45', '全程（03:12:45）', '全程3小时12分45秒'].flatMap(project => [
                ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n完赛项目：' + project, ['半程', project]]
              ]),
              ...['全程（上半程01:35:00）', '全程（每5公里补给）'].flatMap(project => [
                ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n完赛项目：' + project, ['半程', project]]
              ]),
              ['完赛项目：上半程和全程\n项目：5公里', ['上半程和全程', '5公里']],
              ['项目：5公里\n完赛项目：上半程和全程', ['5公里', '上半程和全程']],
              ...['距离', '里程', '项目名称', '项目名'].flatMap(field => [
                [field + '：全程\n项目：半程', ['全程', '半程']],
                ['项目：半程\n' + field + '：全程', ['半程', '全程']]
              ]),
              ...['五公里', '十公里', '十千米'].flatMap(project => [
                ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n完赛项目：' + project, ['半程', project]],
                [project + '\n项目：半程', [project, '半程']],
                ['项目：半程\n' + project, ['半程', project]]
              ]),
              ...['；', ';', '|', '｜'].flatMap(separator => [
                ['完赛项目：半程' + separator + '全程：03:12:45', ['半程', '全程：03:12:45']],
                ['完赛项目：全程：03:12:45' + separator + '半程', ['全程：03:12:45', '半程']]
              ])
            ];
            const timedOnlyProjectCases = [
              ...['全程 03:12:45', '全程：03:12:45', '全程（03:12:45）', '全程3小时12分45秒', '全程马拉松 03:12:45', '半程马拉松 01:35:00', '全程马拉松 净计时：03:12:45', '全马用时03:12:45'].map(project => ['完赛项目：' + project, [project]])
            ];
            const latestParallelCases = [
              ['完赛项目：半程、全程 03:12:45', ['半程', '全程 03:12:45']],
              ['完赛项目：全程、半程 01:35:00', ['全程', '半程 01:35:00']],
              ['完赛项目：5公里/10公里 00:48:00', ['5公里', '10公里 00:48:00']],
              ['完赛项目：全程（03:12:45）、半程（大众组）', ['全程（03:12:45）', '半程（大众组）']],
              ['项目：半程，全程 03:12:45', ['半程', '全程 03:12:45']],
              ['项目：半程,全程 03:12:45', ['半程', '全程 03:12:45']],
              ['完赛项目：半程、全程3小时12分', ['半程', '全程3小时12分']],
              ['完赛项目：半程、全程03时12分45秒', ['半程', '全程03时12分45秒']],
              ['完赛项目：全程、半程1小时35分', ['全程', '半程1小时35分']],
              ['完赛项目：半程、全程：03:12:45', ['半程', '全程：03:12:45']],
              ['完赛项目：半程、全程03:12:45', ['半程', '全程03:12:45']],
              ['完赛项目：全程·精英组3小时12分45秒\n项目：半程', ['全程·精英组3小时12分45秒', '半程']],
              ['项目：半程\n全程·精英组03时12分45秒', ['半程', '全程·精英组03时12分45秒']],
              ['完赛项目：半程·大众组 全程·精英组', ['半程·大众组 全程·精英组']],
              ['完赛项目：全程·精英组 半程·大众组', ['全程·精英组 半程·大众组']],
              ['半程·大众组 全程·精英组', ['半程·大众组 全程·精英组']],
              ['全程·精英组 半程·大众组', ['全程·精英组 半程·大众组']],
              ['完赛项目：半程01:35:00、全程03:12:45', ['半程01:35:00', '全程03:12:45']],
              ...['以及', '至', '到', '或者', '～', '~'].flatMap(separator => [
                ['完赛项目：半程' + separator + '全程\n项目：5公里', ['半程' + separator + '全程', '5公里']],
                ['项目：5公里\n完赛项目：全程' + separator + '半程', ['5公里', '全程' + separator + '半程']]
              ]),
              ['精英组～全程\n项目：半程', ['精英组～全程', '半程']],
              ['项目：半程\n精英组~全程', ['半程', '精英组~全程']],
              ['18岁-39岁全程\n项目：半程', ['18岁-39岁全程', '半程']],
              ['18周岁-39周岁全程\n项目：半程', ['18周岁-39周岁全程', '半程']],
              ['18周岁至39周岁半程\n项目：全程', ['18周岁至39周岁半程', '全程']],
              ['项目：半程\n18岁-39岁全程', ['半程', '18岁-39岁全程']],
              ['项目：半程\n18周岁-39周岁全程', ['半程', '18周岁-39周岁全程']],
              ['项目：全程\n18周岁至39周岁半程', ['全程', '18周岁至39周岁半程']]
            ];
            const orderedCategoryCases = [
              ...englishUnitCases, ...metricUnitCases, ...distanceNotationCases, ...standaloneNotationCases,
              ...explicitScopeCases, ...timedOnlyProjectCases,
              ...latestParallelCases,
              ['完赛项目：半程马拉松大众组\n项目：全程', ['半程马拉松大众组']],
              ['完赛项目：全程 精英组\n项目：半程', ['全程 精英组']],
              ['完赛项目：全程马拉松男子精英组\n项目：半程', ['全程马拉松男子精英组']],
              ['项目：半程，全程 精英组', ['全程 精英组']],
              ['项目：10公里\n5公里青年组', ['5公里青年组']],
              ['5公里 青年组\n项目：10公里', ['5公里 青年组']],
              ['完赛项目：精英组·全程马拉松\n项目：半程', ['精英组·全程马拉松']],
              ['完赛项目：男子【全程】\n项目：半程', ['男子【全程】']],
              ['项目：全程\n大众组-半程', ['大众组-半程']],
              ['项目：半程\n男子：全程', ['男子：全程']],
              ['18-39岁全程\n项目：半程', ['18-39岁全程']],
              ['完赛项目：全程·精英组 03:12:45\n项目：半程', ['全程·精英组 03:12:45']],
              ['全程·精英组：03:12:45\n项目：半程', ['全程·精英组：03:12:45']],
              ['半程马拉松 大众组 01:45:22\n全程马拉松 精英组 03:12:45', ['半程马拉松 大众组 01:45:22', '全程马拉松 精英组 03:12:45']],
              ['完赛项目：全程、男子组\n项目：半程', ['全程、男子组']],
              ['全程/男子\n项目：半程', ['全程/男子']],
              ['项目：半程\n完赛项目：精英组·全程马拉松', ['精英组·全程马拉松']],
              ['项目：半程\n完赛项目：男子【全程】', ['男子【全程】']],
              ['青年组5公里\n项目：10公里', ['青年组5公里']],
              ['项目：半程\n40岁以上 全程', ['40岁以上 全程']],
              ['项目：半程\n全程马拉松 追风跑者组', ['全程马拉松 追风跑者组']],
              ['项目：10公里\n15公里青年组', ['15公里青年组']],
              ['35公里精英组\n项目：5公里', ['35公里精英组']],
              ['半程马拉松·大众组\n精英组 全程马拉松', ['半程马拉松·大众组', '精英组 全程马拉松']]
            ];
            const conflicts=[
              ...orderedCategoryCases.map(([clue]) => clue),
              '完赛项目：半程，全程','项目：5公里，10公里','完赛项目：半程马拉松，全程','项目：半程,全程','项目：全程；半程','项目：全程;半程',
              '组别：半程\n完赛项目：全程马拉松','组别：半程/全程\n完赛项目：全程马拉松','组别\n半程\n全程','完赛项目\n全程\n半程','比赛项目\n5 公里\n10 公里','项目：半程、\n全程','项目：全程\n5公里','项目：10公里\n半程',
              '完赛项目：半程\n姓名：张三\n全程','项目：5公里\n城市：北京\n10公里','项目：半程\n号码布：A12345\n全程',
              '项目：全马\n后半程状态不错\n半程','项目：5公里\n这是一行普通说明文字\n10公里',
              '项目：半程\n全程：男子','项目：5公里\n10公里：公开组','项目：半程\n全程:女子组',
              '项目：全程\n每5公里补给\n10公里','项目：全马\n分段\n5公里','项目：全马\n项目介绍\n5公里',
              '10公里\n城市：北京\n项目：5公里','全程：男子\n号码布：A12345\n完赛项目：半程',
              ...['精英组','家庭组','公开男子组','40岁以上','男子40岁以上','18-39岁','40-59岁','追风跑者组','精英选手'].map(group=>'项目：半程\n全程：'+group),
              '项目：全马\n半程：大众组','项目：5公里\n10公里：青年组',
              '完赛项目：半程\n全程（精英组）','项目：半程\n全程马拉松（大众组）','项目：半程\n全程 （大众组）',
              '项目：全程（精英组）\n完赛项目：半程','全程（精英组）\n半程（大众组）','半程（大众组）\n全程（精英组）',
              '项目：5公里\n10公里（青年组）','10公里（青年组）\n城市：北京\n项目：5公里',
              '项目：半程\n全程(男子40岁以上)','项目：半程\n全程（追风跑者组）',
              '比赛项目\n全程（精英组）\n半程（大众组）',
              '项目：半程\n全程（精英组，40岁以上）','项目：半程\n全程（精英组）、5公里（水站组）',
              ...[['【','】'],['[',']'],['「','」']].flatMap(([open,close])=>[
                '完赛项目：半程\n全程'+open+'精英组'+close,
                '完赛项目：全程'+open+'精英组'+close+'\n项目：半程',
                '全程'+open+'精英组'+close+'\n半程'+open+'大众组'+close,
                '项目：5公里'+open+'青年组'+close+'\n10公里'+open+'公开组'+close,
                '项目：半程\n全程'+open+'精英组，03:12:45'+close,
                '项目：半程\n全程'+open+'精英组'+close+open+'03:12:45'+close
              ]),
              '项目：半程\n全程（精英组，03:12:45）','项目：半程\n全程（精英组）（03:12:45）',
              '全程（精英组，03:12:45）\n项目：半程','全程（精英组）（03:12:45）\n项目：半程',
              ...['·','・','-','－'].flatMap(separator=>[
                '完赛项目：全程'+separator+'精英组\n项目：半程',
                '项目：半程\n全程'+separator+'大众组',
                '半程'+separator+'大众组\n全程'+separator+'精英组',
                '项目：5公里'+separator+'青年组\n10公里'+separator+'公开组'
              ]),
              ...[['【','】'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>[
                '完赛项目：半程\n'+open+'全程'+close,
                '完赛项目：'+open+'全程'+close+'\n项目：半程',
                open+'半程'+close+'\n'+open+'全程'+close,
                '项目：半程\n全程'+open+'精英组'+close
              ]),
              '项目：半程\n全程：03:12:45（精英组）','项目：半程\n全程 03:12:45（精英组）',
              '完赛项目：全程：03:12:45（精英组）\n项目：半程','完赛项目：全程 03:12:45（精英组）\n项目：半程'
            ];
            for(const [index,clue] of conflicts.entries()){
              const preview=await previewText(makeText(clue,index));
              assert.equal(preview.distance,'',clue);
              const requiresManualChoice=[...timedOnlyProjectCases,...standaloneNotationCases].some(([text])=>text===clue);
              assert.match(preview.issues.join('；'),requiresManualChoice?/请确认.*项目/:/多个比赛项目或距离.*请确认.*项目/,clue);
              const orderedCategoryEvidence=orderedCategoryCases.find(([text])=>text===clue)?.[1]||[];
              for(const evidence of orderedCategoryEvidence){
                const reviewText=value=>value.normalize('NFKC').replace(/\s+/g,'');
                assert.ok(reviewText(preview.distanceText).includes(reviewText(evidence)),'the complete ordered category and project remain in preview evidence: '+clue);
                assert.ok(reviewText(await candidate.innerText()).includes(reviewText(evidence)),'the complete ordered category and project are visible for review: '+clue);
              }
              if(clue.includes('\n')&&!/^(?:净计时|用时|\d{1,3}[:：])/.test(clue.split('\n').at(-1))){
                const evidenceText=value=>value.normalize('NFKC').replace(/[【\[「《〈〖]/g,'(').replace(/[】\]」》〉〗]/g,')').replace(/\s+/g,'');
                const trailing=evidenceText(clue.split('\n').at(-1)).replace(/^(?:完赛项目|比赛项目|报名项目|竞赛项目|比赛组别|参赛组别|项目名称|项目类型|项目类别|项目名|项目|组别|距离(?:\((?:米|m)\))?|里程|赛程|路程|跑程|赛项)[:：]?/,'').split(/[:：]/)[0];
                assert.ok(evidenceText(preview.distanceText).includes(trailing),'the trailing project remains in preview evidence: '+clue);
                assert.ok(evidenceText(await candidate.innerText()).includes(trailing),'the trailing project is visible for review: '+clue);
                const heading=clue.split('\n').at(-1);
                if(/^(?:全程|半程|10公里)[:：]/.test(heading)){
                  const fullHeading=heading.normalize('NFKC').replace(/\s+/g,'');
                  assert.ok(preview.distanceText.replace(/\s+/g,'').includes(fullHeading),'the complete project and group remain in preview evidence: '+clue);
                  assert.ok((await candidate.innerText()).normalize('NFKC').replace(/\s+/g,'').includes(fullHeading),'the complete project and group are visible for review: '+clue);
                }
              }
              for(const line of clue.split('\n')){
                const evidenceText=value=>value.normalize('NFKC').replace(/[【\[「《〈〖]/g,'(').replace(/[】\]」》〉〗]/g,')').replace(/\s+/g,'');
                const heading=evidenceText(line).replace(/^(?:完赛项目|比赛项目|报名项目|竞赛项目|比赛组别|参赛组别|项目名称|项目类型|项目类别|项目名|项目|组别|距离(?:\((?:米|m)\))?|里程|赛程|路程|跑程|赛项)[:：]?/,'');
                if(/^(?:全程马拉松|半程马拉松|全程|半程|全马|半马|5公里|10公里)(?:\(|[·・-]|\d)|^\((?:全程|半程)/.test(heading)){
                  assert.ok(evidenceText(preview.distanceText).includes(heading),'the complete bracketed project and its annotations remain in preview evidence: '+clue);
                  assert.ok(evidenceText(await candidate.innerText()).includes(heading),'the complete bracketed project and its annotations are visible for review: '+clue);
                }
              }
              assert.equal(await candidate.getByLabel('项目',{exact:true}).inputValue(),'');
              assert.equal(await candidate.getByLabel('净计时',{exact:true}).inputValue(),'03:12:45');
              assert.match(await candidate.locator('.candidate-validation').innerText(),/请确认比赛项目/);
              await acknowledgement.check();assert.equal(await submit.isDisabled(),true);await submit.evaluate(button=>button.click());
              assert.equal(confirms,0);
              const untouched=await clauseHistory();assert.equal(untouched.entries.length,0);assert.deepEqual(untouched.summary.pb,[]);
            }
            await candidate.getByLabel('项目',{exact:true}).selectOption('full');
            assert.equal(await acknowledgement.isChecked(),false);assert.equal(await submit.isDisabled(),true);
            await acknowledgement.check();await submit.click();
            await clausePage.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
            const corrected=await clauseHistory();assert.equal(corrected.entries.length,1);assert.equal(corrected.entries[0].distance,'full');assert.equal(corrected.entries[0].netSeconds,11565);
            const clearProjects=[
              ['距离(m)：5,000,城市：北京', '5k'], ['距离(m)：42,195,号码布：5000 meters', 'full'],
              ...[['5 kilometers', '5k'], ['10 kilometres', '10k'], ['5000 meters', '5k'], ['10000 metres', '10k'], ['5kms', '5k'], ['10kms', '10k']].map(([project, distance]) => ['完赛项目：' + project, distance]),
              ['距离（米）：42195', 'full'], ['距离（米）：5000', '5k'], ['距离（米）：21097.5', 'half'], ['距离（m）：5000', '5k'],
              ...[['比赛组别', '男子', '全程', 'full'], ['参赛组别', '女子', '半程', 'half']].flatMap(([field, group, project, distance]) => [
                [field + '：' + group + '\n完赛项目：' + project, distance],
                ['完赛项目：' + project + '\n' + field + '：' + group, distance]
              ]),
              ['项目：全程\n5000 meters：00:25:10', 'full'], ['5000 meters：00:25:10\n项目：全程', 'full'],
              ...[["5000m", "5k"], ["10000m", "10k"], ["42195m", "full"], ["21097.5m", "half"], ["5,000m", "5k"], ["五千m", "5k"], ["5000公尺", "5k"], ["42195公尺", "full"], ["五千公尺", "5k"]].map(([project, distance]) => ['完赛项目：' + project, distance]),
              ['完赛项目：5km(5000米)', '5k'], ['完赛项目：四万二千一百九十五米', 'full'],
              ['项目：全程\n5000m：00:25:10', 'full'], ['5000m：00:25:10\n项目：全程', 'full'],
              ['完赛项目：5000米', '5k'], ['完赛项目：10000米', '10k'], ['完赛项目：42195米', 'full'],
              ...['计时组', '用时组', '耗时组', '成绩组', '时间组'].flatMap(group => [
                ['项目\n全程：' + group + '\n项目：半程', 'half'],
                ['完赛项目：全程（' + group + '）\n项目：半程', 'half']
              ]),
              ...[
                ['完赛项目：全程马拉松 精英组', 'full'], ['全程 精英组', 'full'], ['全程马拉松男子精英组', 'full'],
                ['半程马拉松大众组', 'half'], ['5公里青年组', '5k'], ['青年组5公里', '5k'],
                ['精英组·全程马拉松', 'full'], ['男子【全程】', 'full'], ['大众组-半程', 'half'],
              ['男子：全程', 'full'], ['18-39岁全程', 'full'], ['40岁以上 全程', 'full'], ['40岁以上全程马拉松', 'full'],
                ['全程·精英组 03:12:45', 'full'], ['全程·精英组：03:12:45', 'full'],
                ['全程·精英组3小时12分45秒', 'full'], ['全程·精英组03时12分45秒', 'full'],
                ['18岁-39岁全程', 'full'], ['18周岁-39周岁全程', 'full'], ['18周岁至39周岁半程', 'half'],
                ['精英组～全程', 'full'], ['精英组~全程', 'full'],
                ['全程、男子组', 'full'], ['全程/男子', 'full'],
                ['项目：全程\n5公里：00:25:10', 'full'], ['5公里：00:25:10\n项目：全程', 'full'],
                ['项目：全程\n上半程01:35:00\n每5公里补给', 'full'],
                ['完赛项目：五公里', '5k'], ['完赛项目：十公里', '10k'], ['完赛项目：十千米', '10k'],
                ...['距离', '里程', '项目名称', '项目名'].map(field => [field + '：全程', 'full']),
                ['项目：全马\n全程马拉松 精英组', 'full'], ['项目：半程\n大众组半程马拉松', 'half'],
                ['项目：全马\n组别：精英组', 'full'],
                ['项目：全马\n5公里水站组\n配速组10公里\n计时组全程', 'full'],
                ['项目：全马\n全程·补给组 03:12:45\n5公里/水站组', 'full']
              ],
              ['组别：男子\n完赛项目：全程马拉松','full'],['组别：女子组\n完赛项目：半程马拉松','half'],['组别：公开组\n完赛项目：全马','full'],
              ['项目介绍\n欢迎来到这场比赛\n完赛项目：全马','full'],['项目介绍：欢迎参赛\n完赛项目：全马','full'],
              ['项目组：男子\n完赛项目：全马','full'],['完赛项目：半马\n项目组：女子组','half'],
              ['项目：全程\n项目介绍：半程、10公里','full'],['项目：半程\n5公里：00:25:10','half'],
              ['项目\n这是一行说明文字\n完赛项目：全马','full'],['项目：上半程\n完赛项目：全马','full'],
              ['项目：每5公里补给\n完赛项目：全马','full'],['项目：全马\n姓名：张三\n城市：北京\n号码布：A12345\n后半程状态不错','full'],
              ['项目：全马\n全程：公开组','full'],['项目：全马\n每5公里补给\n10公里用时：00:50:00','full'],
              ['项目：全马\n5公里：00:25:10\n半程：补给点\n每5公里补给','full'],
              ['完赛项目：全马\n项目：上半程','full'],
              ['全程（精英组）','full'],['全程马拉松（大众组）','full'],['项目：全程 （大众组）','full'],
              ['全程（精英组）\n项目：全马','full'],['项目：半程（女子40岁以上）','half'],
              ['项目：5公里（青年组）','5k'],['10公里（公开组）','10k'],
              ['项目：全马\n5公里：水站组\n10公里：配速组\n半程：计时组\n半程：补给组','full'],
              ['项目：全马\n5公里（水站组）\n10公里（配速组）\n半程（计时组）\n半程（补给组）','full'],
              ['全程（精英组，40岁以上）','full'],['全程（精英组）、5公里（水站组）','full'],
              ...[['【','】'],['[',']'],['「','」']].flatMap(([open,close])=>[
                ['全程'+open+'精英组'+close,'full'],
                ['项目：5公里'+open+'青年组'+close,'5k'],
                ['项目：全马\n5公里'+open+'水站组'+close+'\n10公里'+open+'00:50:00'+close,'full'],
                ['全程'+open+'精英组，03:12:45'+close,'full'],
                ['全程'+open+'精英组'+close+open+'03:12:45'+close,'full']
              ]),
              ['全程（精英组，03:12:45）','full'],['全程（精英组）（03:12:45）','full'],
              ...['·','・','-','－'].flatMap(separator=>[
                ['全程'+separator+'精英组','full'],
                ['项目：5公里'+separator+'青年组','5k'],
                ['项目：全马\n全程'+separator+'大众组','full'],
                ['项目：全马\n5公里'+separator+'水站组\n10公里'+separator+'配速组','full']
              ]),
              ...[['【','】'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>[
                [open+'全程'+close,'full'],
                ['完赛项目：'+open+'全程'+close,'full'],
                ['全程'+open+'精英组'+close,'full'],
                ['项目：全马\n5公里'+open+'水站组'+close+'\n10公里'+open+'00:50:00'+close,'full']
              ]),
              ['全程：03:12:45（精英组）','full'],['全程 03:12:45（精英组）','full'],
              ['项目：全马\n全程：03:12:45（精英组）','full']
            ];
            for(const [index,[clue,distance]] of clearProjects.entries()){
              await clausePage.getByRole('button',{name:'找回旧比赛',exact:true}).click();
              const preview=await previewText(makeText(clue,index+conflicts.length));
              assert.equal(preview.distance,distance,clue);assert.ok(!preview.issues.some(issue=>/项目/.test(issue)),clue);
              if(/^距离\(m\)：(?:5,000|42,195),/.test(clue)){
                assert.ok(!/城市|北京|号码布|5000 meters/.test(preview.distanceText),'field metadata stays out of project evidence: '+clue);
                const projectEvidence=await candidate.locator('small').filter({hasText:'资料中的项目：'}).innerText();
                assert.ok(!/城市|北京|号码布|5000 meters/.test(projectEvidence),'field metadata stays out of visible project evidence: '+clue);
              }
              assert.equal(await candidate.getByLabel('项目',{exact:true}).inputValue(),distance);assert.equal(await candidate.locator('.candidate-validation').count(),0);
              await acknowledgement.check();assert.equal(await submit.isDisabled(),false);await submit.click();
              await clausePage.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
              assert.equal((await clauseHistory()).entries.find(item=>item.name==='项目范围核对'+(index+conflicts.length)).distance,distance);
            }
            const stored=await clauseHistory();assert.equal(stored.entries.length,1+clearProjects.length);assert.equal(confirms,1+clearProjects.length);
            assert.ok(stored.summary.pb.every(item=>['full','half','5k','10k'].includes(item.distance)));
            await noOverflow(clausePage);
          }finally{await clauseContext.close();}
        });
        await check('splits and aid-station intervals cannot become a finish project or a PB without an explicit choice', async () => {
          const segmentToken='history-segment-private-token';
          db.prepare('INSERT INTO users (nickname,token,created_at) VALUES (?,?,?)').run('分段与项目核对跑者',segmentToken,new Date().toISOString());
          const segmentContext=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:1});
          await segmentContext.addInitScript(value=>localStorage.setItem('marathon_token',value),segmentToken);
          const segmentPage=await segmentContext.newPage();
          segmentPage.on('pageerror',error=>report.errors.push(error.message));
          let confirms=0;
          segmentPage.on('request',req=>{if(req.method()==='POST'&&req.url().endsWith('/import/confirm'))confirms++;});
          const segmentHistory=()=>request('',{headers:{Authorization:'Bearer '+segmentToken}});
          try{
            await segmentPage.goto(origin+'/marathon/history?import=1');
            const source=segmentPage.getByLabel('成绩文字或表格');
            const clues=['上半程','前半程配速稳定','后半程状态不错','半程点：01:40:00','5公里','5公里：00:25:10','每5公里设置补给','10公里用时：00:51:00','补给距离：10公里','分段距离：5公里','分段：5公里','组别\n分段\n5公里','组别：每5公里\n10公里','组别\n上半程\n10公里','全程：计时组','全程：补给组','5公里：水站组','10公里：配速组','全程（计时组）','全程（补给组）','5公里（水站组）','10公里（配速组）',
              ...[['【','】'],['[',']'],['「','」'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>['全程'+open+'补给组'+close,'5公里'+open+'00:25:10'+close,'10公里'+open+'配速组'+close]),
              ...['·','・','-','－'].flatMap(separator=>['全程'+separator+'计时组','5公里'+separator+'水站组','10公里'+separator+'配速组']),
              '5公里00:25:10','5公里3小时12分','5公里03时12分45秒','全程3小时12分45秒','全程03时12分45秒','上半程3小时12分','全程·补给组3小时12分45秒','10公里/配速组03时12分45秒','全程：03:12:45','全程 03:12:45','全程：03:12:45（补给组）','全程 03:12:45（配速组）','5公里水站组','配速组10公里','水站组-5公里','计时组全程','全程·补给组 03:12:45','全程、计时组','前半程男子组','上半程精英组','每5公里青年组','前半马男子组','后全马青年组'];
            for(const clue of clues){
              await source.fill('赛事名称：北京马拉松分段核对\n日期：2024-10-20\n'+clue+'\n净计时：03:12:45');
              const previewed=segmentPage.waitForResponse(response=>response.url().endsWith('/import/preview')&&response.request().method()==='POST');
              await segmentPage.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
              const preview=await (await previewed).json();
              assert.equal(preview.candidates[0].distance,'',clue);
              assert.match(preview.candidates[0].issues.join('；'),/请确认.*项目/,clue);
              const candidate=segmentPage.locator('.candidate');await candidate.waitFor();
              assert.equal(await candidate.getByLabel('项目',{exact:true}).inputValue(),'');
              assert.equal(await candidate.getByLabel('净计时',{exact:true}).inputValue(),'03:12:45');
              assert.match(await candidate.locator('.candidate-validation').innerText(),/请确认比赛项目/);
              await candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).check();
              const submit=segmentPage.getByRole('button',{name:'确认加入 1 场比赛',exact:true});
              assert.equal(await submit.isDisabled(),true);await submit.evaluate(button=>button.click());
              assert.equal(confirms,0);
              const untouched=await segmentHistory();assert.equal(untouched.entries.length,0);assert.deepEqual(untouched.summary.pb,[]);
            }
            const candidate=segmentPage.locator('.candidate');
            await candidate.getByLabel('项目',{exact:true}).selectOption('full');
            const acknowledgement=candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'});
            assert.equal(await acknowledgement.isChecked(),false);await acknowledgement.check();
            await segmentPage.getByRole('button',{name:'确认加入 1 场比赛',exact:true}).click();
            await segmentPage.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
            const corrected=await segmentHistory();assert.equal(corrected.entries.length,1);assert.equal(corrected.entries[0].distance,'full');assert.equal(corrected.entries[0].netSeconds,11565);
            assert.ok(corrected.summary.pb.every(item=>item.distance==='full'));
            await segmentPage.getByRole('button',{name:'找回旧比赛',exact:true}).click();
            await source.fill('赛事名称：真实五公里比赛\n日期：2024-09-01\n项目：5公里\n净计时：00:23:45');
            await segmentPage.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
            await candidate.waitFor();assert.equal(await candidate.getByLabel('项目',{exact:true}).inputValue(),'5k');
            assert.equal(await candidate.locator('.candidate-validation').count(),0);
            await acknowledgement.check();await segmentPage.getByRole('button',{name:'确认加入 1 场比赛',exact:true}).click();
            await segmentPage.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
            const shortRace=(await segmentHistory()).entries.find(item=>item.name==='真实五公里比赛');assert.equal(shortRace.distance,'5k');assert.equal(shortRace.netSeconds,1425);assert.equal(confirms,2);
            await noOverflow(segmentPage);
          }finally{await segmentContext.close();}
        });
        await check('exports contain own data and no authorization token', async () => {
          const downloadPromise = page.waitForEvent('download');
          await page.getByRole('button',{name:'导出我的跑史 JSON',exact:true}).click();
          const download = await downloadPromise;
          const output=await download.path();const text=fs.readFileSync(output,'utf8');
          assert.ok(text.includes('跑向终点'));
          assert.ok(!text.includes(token));
          const parsed=JSON.parse(text);assert.ok(Array.isArray(parsed));
          const preview=await request('/import/preview',{method:'POST',body:JSON.stringify({text})});
          assert.ok(preview.candidates.length>=5);
          assert.ok(preview.candidates.every(x=>x.duplicateId));
        });
        await check('screenshot bytes wait for explicit consent and account change clears private state', async () => {
          await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();
          let recognized=0;page.on('request',req=>{if(req.url().includes('/recognize'))recognized++;});
          await page.getByLabel('选择成绩截图或证书').setInputFiles({name:'certificate.png',mimeType:'image/png',buffer:png});
          await page.getByRole('button',{name:'同意本次解析',exact:true}).waitFor();
          assert.equal(recognized,0);
          await page.getByRole('button',{name:'取消',exact:true}).click();
          assert.equal(recognized,0);
          await page.evaluate(()=>{localStorage.setItem('marathon_token','history-other-token');window.dispatchEvent(new Event('focus'));});
          await page.getByRole('button',{name:'我的跑史',exact:true}).click();
          await page.getByRole('heading',{name:'从记得的那一场开始。'}).waitFor();
          assert.equal(await page.locator('.history-row').count(),0);
          assert.equal(await page.getByLabel('成绩文字或表格').count(),0);
        });
      }
      if(width===1280){await check('two real local OCR images require consent then create one reviewed personal race',async()=>{
        await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();
        const certificate=fs.readFileSync(path.join(__dirname,'../../server/test/fixtures/race-certificate.png'));
        let recognized=0;page.on('request',req=>{if(req.url().includes('/recognize'))recognized++;});
        await page.getByLabel('选择成绩截图或证书').setInputFiles([{name:'certificate-a.png',mimeType:'image/png',buffer:certificate},{name:'certificate-b.png',mimeType:'image/png',buffer:certificate}]);
        assert.equal(recognized,0);
        await page.getByRole('button',{name:'同意本次解析',exact:true}).click();
        await page.getByText('识别文字已放入下方，可先更正，再点“识别并核对比赛”。',{exact:true}).waitFor({timeout:60000});
        assert.equal(recognized,2);assert.match(await page.getByLabel('成绩文字或表格').inputValue(),/03:12:45/);
        await page.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
        await page.locator('.candidate').first().waitFor();
        assert.equal(await page.locator('.candidate').count(),2);
        const candidate=page.locator('.candidate').first();
        assert.match(await candidate.getByLabel('比赛名称',{exact:true}).inputValue(),/2025.*北京/);
        assert.equal(await candidate.getByLabel('净计时',{exact:true}).inputValue(),'03:12:45');
        assert.equal(await candidate.getByLabel('枪声时间',{exact:true}).inputValue(),'03:15:20');
        await page.locator('.candidate').last().locator('.candidate-select input').uncheck();
        await candidate.getByRole('checkbox',{name:'我已核对，这是本人的比赛记录。'}).check();
        await page.getByRole('button',{name:'确认加入 1 场比赛',exact:true}).click();
        await page.getByText('已加入 1 场比赛。',{exact:true}).waitFor();
        await page.locator('.history-row').filter({hasText:'2025 北京马拉松'}).click();
        await page.locator('.review-insight').waitFor();
        assert.match(await page.locator('.review-score').innerText(),/03:12:45/);
        assert.match(await page.locator('.source-facts').innerText(),/本人|核对|导入/);
        await page.locator('.material-details summary').click();
        assert.equal(await page.locator('.material-grid article').count(),0,'OCR original images are not automatically saved');
        const name='race-history-live-1280-ocr-review.png';await page.screenshot({path:path.join(__dirname,name),fullPage:true});report.screenshots.push(name);
      });await check('save errors retain edits for retry; deletion and hiding preserve original result',async()=>{
        await page.getByRole('button',{name:'编辑这场经历',exact:true}).click();
        const editor=page.locator('.history-dialog[open]');
        await editor.getByLabel('这场最想记住的是什么？').fill('一次失败重试后，仍然完整留下的感受。');
        await page.route('**/api/me/race-history/exp*',async route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'暂时无法保存，请重试'})}),{times:1});
        await editor.getByRole('button',{name:'保存这场经历',exact:true}).click();
        await editor.getByText('暂时无法保存，请重试',{exact:true}).waitFor();
        assert.equal(await editor.getByLabel('这场最想记住的是什么？').inputValue(),'一次失败重试后，仍然完整留下的感受。');
        await editor.getByRole('button',{name:'保存这场经历',exact:true}).click();
        await page.locator('.personal-story').getByText('一次失败重试后，仍然完整留下的感受。',{exact:true}).waitFor();
        await page.getByRole('button',{name:'删除这场经历',exact:true}).click();
        await page.getByRole('button',{name:'确认删除',exact:true}).click();
        await page.getByText('这场经历已删除。',{exact:true}).waitFor();
        assert.equal((await request('')).entries.filter(x=>x.name==='2025 北京马拉松').length,0);
        await page.locator('.history-row').filter({hasText:'2022 原有全马'}).click();
        await page.getByRole('button',{name:'从跑史隐藏',exact:true}).click();
        await page.getByText('原有成绩与荣誉收藏继续保留；此处不再展示这场回顾。',{exact:true}).waitFor();
        await page.getByRole('button',{name:'确认隐藏',exact:true}).click();
        await page.getByText('已从跑史隐藏，原成绩和收藏保留。',{exact:true}).waitFor();
        assert.equal((await request('')).entries.filter(x=>x.id.startsWith('result:')).length,0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM results WHERE user_id=? AND race_id=?').get(Number(first.lastInsertRowid),oldRace).n,1);
      });await check('multi-image OCR discards earlier text when account changes during the next image',async()=>{
        await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();
        let count=0,releaseSecond,markSecond;
        const secondStarted=new Promise(resolve=>markSecond=resolve),secondRelease=new Promise(resolve=>releaseSecond=resolve);
        await page.route('**/api/me/race-history/recognize',async route=>{
          count++;
          if(count===1){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'OLD_ACCOUNT_PRIVATE_OCR_第一张个人成绩',warnings:[]})});return;}
          markSecond();await secondRelease;
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'OLD_ACCOUNT_PRIVATE_OCR_第二张个人成绩',warnings:[]})}).catch(()=>{});
        });
        await page.getByLabel('选择成绩截图或证书').setInputFiles([{name:'private-one.png',mimeType:'image/png',buffer:png},{name:'private-two.png',mimeType:'image/png',buffer:png}]);
        await page.getByRole('button',{name:'同意本次解析',exact:true}).click();
        await secondStarted;assert.equal(count,2);
        await page.evaluate(()=>{localStorage.setItem('marathon_token','history-other-token');window.dispatchEvent(new Event('focus'));});
        releaseSecond();
        await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
        assert.ok(!(await page.locator('body').innerText()).includes('OLD_ACCOUNT_PRIVATE_OCR'));
        assert.equal(await page.getByLabel('成绩文字或表格').inputValue(),'');
        await page.getByLabel('成绩文字或表格').fill('比赛名称,日期,项目,净计时\n新账号独立半马,2024-06-01,半马,01:55:00');
        await page.getByRole('button',{name:'识别并核对比赛',exact:true}).click();
        await page.locator('.candidate').waitFor();
        assert.equal(await page.locator('.candidate').count(),1);
        assert.equal(await page.locator('.candidate').getByLabel('比赛名称',{exact:true}).inputValue(),'新账号独立半马');
        assert.ok(!(await page.getByLabel('成绩文字或表格').inputValue()).includes('OLD_ACCOUNT_PRIVATE_OCR'));
      });}
      if(width===320){await check('import form fits narrow screens and retains recoverable errors',async()=>{await page.getByRole('button',{name:'找回旧比赛',exact:true}).click();await page.getByLabel('成绩文字或表格').fill('比赛名称,日期,项目,净计时\n错误日期的比赛,2025-02-31,半马,01:40:00');await page.getByRole('button',{name:'识别并核对比赛',exact:true}).click();await page.locator('.candidate').waitFor();assert.match(await page.locator('.candidate-issues').innerText(),/真实比赛日期/);await noOverflow(page);const name='race-history-live-320-import.png';await page.screenshot({path:path.join(__dirname,name),fullPage:true});report.screenshots.push(name);});}
      await context.close();
    }
    assert.deepEqual(report.errors,[]);report.passed=true;
  } finally {await browser.close();}
}
main().catch(error=>{report.error=error.stack||String(error);console.error(error);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(__dirname,'race-history-web-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,screenshots:report.screenshots.length}));});
