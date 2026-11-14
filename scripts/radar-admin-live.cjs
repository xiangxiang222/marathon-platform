const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-radar-admin-'));
process.env.MARATHON_DB = path.join(temporary, 'app.sqlite');
process.env.MARATHON_MEDIA = path.join(temporary, 'media');
process.env.BASE_PATH = '/marathon';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'radar-admin-live-temporary-token';
const { app } = require('../server/src/index');
const { getDb } = require('../server/src/db');
const { seedRadarDemo } = require('./seed-radar-demo.cjs');
const out = path.resolve(__dirname, '../design/previews/radar-20261114');
fs.mkdirSync(out, { recursive: true });
const report = { kind: 'Real API admin radar editing in a disposable database', checks: [], errors: [], screenshots: [], passed: false };
let server, browser;
async function check(name, action) { await action(); report.checks.push(name); }
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page has no horizontal overflow'); }
async function main() {
  const db = getDb(); seedRadarDemo(db);
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const api = async (raceId) => { const response = await fetch(origin + '/marathon/api/admin/races/' + raceId + '/radar', { headers: { Authorization: 'Bearer ' + process.env.ADMIN_TOKEN } }); assert.equal(response.status, 200); return (await response.json()).config; };
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    await context.addInitScript(value => sessionStorage.setItem('marathon_admin', value), process.env.ADMIN_TOKEN);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push({ width, message: error.message }));
    await page.goto(origin + '/marathon/admin');
    await page.getByRole('heading', { name: '运营总览', exact: true }).waitFor();
    const toggle = page.getByRole('button', { name: '打开导航菜单', exact: true }); if (await toggle.isVisible()) await toggle.click();
    await page.locator('.navigation-groups').getByRole('button', { name: /赛事管理/ }).click();
    await page.getByRole('tab', { name: '赛事库', exact: true }).click();
    await page.getByPlaceholder('搜索赛事名称 / 城市').fill('模拟赛事');
    await page.locator('.catalog-row').filter({ hasText: '滨湖马拉松' }).locator('.race-open').click();
    await page.locator('.edit-nav').getByRole('tab', { name: '奖项', exact: true }).click();
    const radar = page.locator('.radar-admin');
    await radar.getByLabel('历年前八年份').waitFor();
    const currentYear = Number(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 4));
    await check('initial save disabled and all eight places editable at ' + width, async () => {
      assert.equal(await radar.getByRole('button', { name: '保存雷达资料', exact: true }).isDisabled(), true);
      assert.equal(await radar.locator('.ra-history-table tbody tr').count(), 8);
      await radar.getByRole('button', { name: '＋ 添加年份', exact: true }).click();
      const config = await api('radar-demo-lakeside');
      const years = new Set(config.groups[0].histories.map(item => item.year));
      let nextYear = currentYear; while (years.has(nextYear)) nextYear--;
      assert.equal(await radar.getByLabel('新增历史年份').inputValue(), String(nextYear));
      await radar.locator('.ra-year-create').getByRole('button', { name: '取消', exact: true }).click();
      await noOverflow(page);
    });
    const athleteName = '模拟编辑选手' + width;
    await check('history edits save through live API and reload at ' + width, async () => {
      await radar.getByLabel(currentYear + '年第1名姓名', { exact: true }).fill(athleteName);
      await radar.getByRole('button', { name: '保存雷达资料', exact: true }).click();
      await radar.getByText('雷达资料已保存，前台会使用这次更新。', { exact: true }).waitFor();
      const config = await api('radar-demo-lakeside');
      assert.equal(config.groups[0].histories.find(item => item.year === currentYear).rows[0].name, athleteName);
      assert.equal(config.groups[0].histories.find(item => item.year === currentYear).rows.length, 8);
      assert.equal(await radar.getByRole('button', { name: '保存雷达资料', exact: true }).isDisabled(), true);
    });
    await radar.scrollIntoViewIfNeeded();
    const file = 'admin-history-' + width + '.png'; await page.screenshot({ path: path.join(out, file), fullPage: true }); report.screenshots.push(file);
    if (width === 1440) {
      await check('partial new year keeps blank ranks absent', async () => {
        await radar.getByRole('button', { name: '＋ 添加年份', exact: true }).click();
        await radar.getByRole('button', { name: '添加年份', exact: true }).click();
        const year = currentYear - 3;
        await radar.getByLabel(year + '年第1名姓名', { exact: true }).fill('新增年模拟甲');
        await radar.getByLabel(year + '年第1名成绩', { exact: true }).fill('2:15:00');
        await radar.getByRole('button', { name: '保存雷达资料', exact: true }).click();
        await radar.getByText('雷达资料已保存，前台会使用这次更新。', { exact: true }).waitFor();
        const config = await api('radar-demo-lakeside');
        assert.equal(config.groups[0].histories.find(item => item.year === year).rows.length, 1);
      });
      await check('actual award depth and individual amount persist', async () => {
        await radar.getByRole('tab', { name: '当届奖励', exact: true }).click();
        await radar.getByLabel('本期评估奖励至第几名', { exact: true }).selectOption('3');
        await radar.getByLabel('第1名税前奖金', { exact: true }).fill('12000');
        await radar.getByRole('button', { name: '保存雷达资料', exact: true }).click();
        await radar.getByText('雷达资料已保存，前台会使用这次更新。', { exact: true }).waitFor();
        const config = await api('radar-demo-lakeside'); assert.equal(config.groups[0].awardDepth, 3); assert.equal(config.groups[0].awards.length, 3); assert.equal(config.groups[0].awards[0].amount, 12000);
      });
      await check('known entrant PB status evidence and demo switch persist', async () => {
        await radar.getByRole('tab', { name: /今年阵容/ }).click();
        await radar.getByRole('button', { name: '＋ 添加选手', exact: true }).click();
        const entrant = radar.locator('.ra-entrant').last();
        await entrant.getByLabel('公开姓名或代称', { exact: true }).fill('新增模拟选手');
        await entrant.getByLabel('同项目 PB', { exact: true }).fill('2:09:00');
        await entrant.getByLabel('PB 比赛日期', { exact: true }).fill((currentYear - 1) + '-04-12');
        await entrant.getByLabel('本届参赛状态', { exact: true }).selectOption('已缴费');
        await entrant.getByLabel('证据等级', { exact: true }).selectOption('verified');
        await entrant.getByLabel('成绩与参赛来源', { exact: true }).fill('模拟已核验资料');
        await radar.locator('.ra-check input').uncheck();
        await radar.getByRole('button', { name: '保存雷达资料', exact: true }).click();
        await radar.getByText('雷达资料已保存，前台会使用这次更新。', { exact: true }).waitFor();
        const config = await api('radar-demo-lakeside'); assert.equal(config.demo, false); assert.equal(config.groups[0].entrants.at(-1).clock, '2:09:00'); assert.equal(config.groups[0].entrants.at(-1).status, '已缴费'); assert.equal(config.groups[0].entrants.at(-1).evidence, 'verified');
        // Keep all screenshots and subsequent runs visibly synthetic.
        await radar.locator('.ra-check input').check();
        await radar.getByRole('button', { name: '保存雷达资料', exact: true }).click();
        await radar.getByText('雷达资料已保存，前台会使用这次更新。', { exact: true }).waitFor();
        await noOverflow(page);
        const file = 'admin-entrants-1440.png'; await page.screenshot({ path: path.join(out, file), fullPage: true }); report.screenshots.push(file);
      });
    }
    await check('switching races never carries unsaved history into another event at ' + width, async () => {
      await radar.getByRole('tab', { name: /历年前八/ }).click();
      await radar.getByLabel('历年前八年份').selectOption(String(currentYear));
      await radar.getByLabel(currentYear + '年第1名姓名', { exact: true }).fill('不能串场的未保存内容');
      const close = page.locator('.edit-tools').getByRole('button', { name: '收起', exact: true }); await close.click();
      await page.locator('.catalog-row').filter({ hasText: '海风马拉松' }).locator('.race-open').click();
      await page.locator('.edit-nav').getByRole('tab', { name: '奖项', exact: true }).click();
      await radar.getByLabel('历年前八年份').waitFor();
      assert.notEqual(await radar.getByLabel(currentYear + '年第1名姓名', { exact: true }).inputValue(), '不能串场的未保存内容');
      assert.equal(await radar.getByRole('button', { name: '保存雷达资料', exact: true }).isDisabled(), true);
      const config = await api('radar-demo-lakeside'); assert.equal(config.groups[0].histories.find(item => item.year === currentYear).rows[0].name, athleteName);
      await noOverflow(page);
    });
    await context.close();
  }
  assert.equal(report.errors.length, 0); report.passed = true;
}
main().catch(error => { report.fatal = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.writeFileSync(path.join(out, 'admin-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
