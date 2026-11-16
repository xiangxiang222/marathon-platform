'use strict';
// Real Vue and Express flow in a disposable local database. No production data or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'participation-web-'));
const out = process.env.PARTICIPATION_WEB_OUT || path.join(root, 'design/previews/participation-20261116/web');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '0', BASE_PATH: '/marathon', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(root, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { checks: [], views: [], errors: [], passed: false };
let server, vite, browser;
const token = 'participation-browser-synthetic';
async function check(name, run) { await run(); report.checks.push(name); }
async function assertSharingCollapsed(page) {
  assert.equal(await page.locator('#club-sync-panel').count(), 0, 'Successful sharing save closes the selector');
  assert.equal(await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).getAttribute('aria-expanded'), 'false');
}
async function participationLayout(page, name, width, { expanded, guest = false } = {}) {
  const plan = page.locator('.race-plan');
  await plan.waitFor();
  assert.equal(await page.locator('.race-plan .plan-editor').count(), expanded ? 1 : 0, name + ': editor visibility');
  if (guest) {
    assert.equal(await plan.getByRole('button', { name: '登录后标记', exact: true }).count(), 1);
    assert.equal(await page.locator('.race-companionship').count(), 0, 'Guests cannot see personal sharing controls');
  } else {
    assert.equal(await plan.locator('button[aria-expanded]').first().getAttribute('aria-expanded'), String(expanded));
  }
  if (expanded) {
    assert.equal(await plan.locator('.plan-stages button').count(), 4);
    assert.equal(await plan.locator('.plan-stages button[aria-pressed=true]').count(), 1);
  }
  const metrics = await page.evaluate(() => {
    const visible = element => {
      // aria-hidden descriptions still have to be legible to sighted readers.
      if (element.closest('svg,.visually-hidden')) return false;
      const css = getComputedStyle(element), rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
    };
    const areas = [...document.querySelectorAll('.race-follow-row,.race-plan')];
    const tinyText = [], smallControls = [];
    for (const area of areas) {
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode());) {
        const element = node.parentElement;
        if (!node.textContent.trim() || !element || !visible(element)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        if (![...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1)) continue;
        const size = parseFloat(getComputedStyle(element).fontSize);
        if (size < 11.9) tinyText.push({ text: node.textContent.trim().slice(0, 60), size });
      }
      for (const control of area.querySelectorAll('button,a[href],.proof-actions label')) {
        if (!visible(control)) continue;
        const rect = control.getBoundingClientRect();
        if (rect.width < 43.5 || rect.height < 43.5) smallControls.push({ text: control.getAttribute('aria-label') || control.textContent.trim(), width: rect.width, height: rect.height });
      }
    }
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, tinyText, smallControls };
  });
  assert.equal(metrics.width, width);
  assert.ok(metrics.scrollWidth <= width, name + ': horizontal page overflow');
  assert.deepEqual(metrics.tinyText, [], name + ': visible participation text below 12px');
  assert.deepEqual(metrics.smallControls, [], name + ': participation controls below 44px');
  const focusTargets = [page.locator('.race-follow-row button'), plan.locator('button').first()];
  if (expanded) focusTargets.push(plan.locator('.plan-stages button[aria-pressed=true]'), plan.locator('.statuses button').first());
  for (const target of focusTargets) {
    // Establish keyboard modality before focusing the actual control, so :focus-visible is exercised.
    await page.keyboard.press('Tab');
    await target.focus();
    const focus = await target.evaluate(element => {
      const css = getComputedStyle(element);
      return { focused: document.activeElement === element, visible: element.matches(':focus-visible'), outline: parseFloat(css.outlineWidth) >= 1 && css.outlineStyle !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(css.outlineColor), shadow: css.boxShadow !== 'none' };
    });
    assert.ok(focus.focused && focus.visible && (focus.outline || focus.shadow), name + ': visible keyboard focus');
  }
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  const filename = name + '-' + width + '.png';
  await page.screenshot({ path: path.join(out, filename), fullPage: true });
  report.views.push({ name, screenshot: filename, ...metrics });
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString(), day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const userId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成跑者', token, stamp).lastInsertRowid);
  const buddyId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成团友', 'participation-buddy', stamp).lastInsertRowid);
  const clubIds = ['合成甲团', '合成乙团'].map((name, index) => Number(db.prepare('INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)').run(name, 'PARTICIPATION-' + index, buddyId, stamp).lastInsertRowid));
  for (const clubId of clubIds) for (const id of [userId, buddyId]) db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(clubId, id, stamp);
  const raceId = 'participation-web-race', otherId = 'participation-other-race';
  for (const [id, name] of [[raceId, '合成同行马拉松'], [otherId, '合成另一场马拉松']]) db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, name, '合成城市', '合成地区', 'full', day, '', '合成起点', 'road', 'offline');
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const apiOrigin = 'http://127.0.0.1:' + server.address().port;
  async function read(suffix, userToken = token) { const response = await fetch(apiOrigin + '/marathon/api' + suffix, { headers: { Authorization: 'Bearer ' + userToken } }); assert.equal(response.status, 200, suffix); return response.json(); }
  const { createServer } = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': apiOrigin } } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.CHROME_BIN, ...(process.env.CHROME_PATH || process.env.CHROME_BIN ? {} : { channel: 'chrome' }), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(token => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', '合成跑者'); }, token);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  const racePath = origin + '/marathon/races/' + raceId;

  await check('List follows independently without navigating or creating a plan', async () => {
    await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
    const row = page.locator('.race-card-shell').filter({ hasText: '合成同行马拉松' });
    await row.getByRole('button', { name: '关注合成同行马拉松', exact: true }).click();
    await row.getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/marathon/');
    const mine = await read('/me');
    assert.equal(mine.plans.length, 0);
    assert.ok(mine.followedRaces.some(race => race.id === raceId));
  });
  await check('Four stages allow direct registration and explicit confirmation without lottery', async () => {
    await page.goto(racePath, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '标记参赛状态', exact: false }).click();
    assert.equal(await page.locator('.plan-stages button').count(), 4);
    assert.equal(await page.locator('.race-plan .statuses .status').count(), 1);
    await page.getByRole('button', { name: '3 确认参赛', exact: true }).click();
    await page.locator('.race-plan .statuses').getByRole('button', { name: '确认参赛', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '确认参赛');
    const race = await read('/races/' + raceId);
    assert.equal(race.myStatus, '确认参赛');
    assert.deepEqual(race.sharedClubIds, []);
    assert.equal(race.following, true);
    assert.equal(await page.getByText('报名截图仅本人可见，不会同步给跑团。', { exact: true }).count(), 1);
  });
  await check('Sharing is selected per club and companion note has the same audience', async () => {
    await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).click();
    await page.getByRole('checkbox', { name: /合成甲团/ }).check();
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已更新同步范围，后续参赛状态会自动同步。', { exact: true }).waitFor();
    await assertSharingCollapsed(page);
    assert.ok((await page.locator('.club-sync-heading').innerText()).includes('合成甲团'));
    await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).click();
    assert.equal(await page.getByRole('checkbox', { name: /合成甲团/ }).isChecked(), true);
    await page.getByLabel('我的同行需求', { exact: true }).fill('合成需求：比赛日想拼车，领物后一起集合');
    await page.getByRole('button', { name: '保存同行需求', exact: true }).click();
    await page.getByText('同行需求已保存。', { exact: true }).waitFor();
    const buddyRace = await read('/races/' + raceId, 'participation-buddy');
    assert.ok(buddyRace.clubs.find(club => club.id === clubIds[0]).mates.some(mate => mate.nickname === '合成跑者' && mate.note.includes('拼车')));
    assert.ok(!buddyRace.clubs.find(club => club.id === clubIds[1]).mates.some(mate => mate.nickname === '合成跑者'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meetup_joins').get()?.n || 0, 0);
  });
  await check('Status updates preserve selected sharing and cancelling follow preserves plan', async () => {
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已缴费', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已缴费');
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('button', { name: '关注合成同行马拉松', exact: true }).waitFor();
    const race = await read('/races/' + raceId);
    assert.equal(race.following, false); assert.equal(race.myStatus, '已缴费'); assert.deepEqual(race.sharedClubIds, [clubIds[0]]);
  });
  await check('Failed unsharing stays open with the draft; retry saves and collapses the selector', async () => {
    await page.getByRole('checkbox', { name: /合成甲团/ }).uncheck();
    const failSharing = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成同步保存失败' }) });
    await page.route('**/api/me/races/' + raceId + '/sharing', failSharing);
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.locator('.race-companionship [role=alert]').filter({ hasText: '合成同步保存失败' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('checkbox', { name: /合成甲团/ }).isChecked(), false);
    assert.deepEqual((await read('/races/' + raceId)).sharedClubIds, [clubIds[0]]);
    await page.unroute('**/api/me/races/' + raceId + '/sharing', failSharing);
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已设为仅自己可见。', { exact: true }).waitFor();
    await assertSharingCollapsed(page);
    assert.ok((await page.locator('.club-sync-state').innerText()).includes('仅自己可见'));
    const buddyRace = await read('/races/' + raceId, 'participation-buddy');
    assert.ok(buddyRace.clubs.every(club => !club.mates.some(mate => mate.nickname === '合成跑者')));
    const mine = await read('/races/' + raceId); assert.ok(mine.companionNote.includes('拼车'));
  });
  await check('Failed follow and state saves retain existing data and allow retry', async () => {
    const failFollow = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成关注保存失败' }) });
    await page.route('**/api/me/races/' + raceId + '/follow', failFollow);
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('alert').waitFor();
    assert.equal((await read('/races/' + raceId)).following, false);
    assert.equal(await page.locator('.race-follow-row').getByRole('button').isEnabled(), true);
    await page.unroute('**/api/me/races/' + raceId + '/follow', failFollow);
    const failState = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成状态保存失败' }) });
    await page.route('**/api/me/races/' + raceId, failState);
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).click();
    await page.locator('.race-plan [role=status]').filter({ hasText: '合成状态保存失败' }).waitFor();
    assert.equal((await read('/races/' + raceId)).myStatus, '已缴费');
    assert.equal(await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).isEnabled(), true);
    await page.unroute('**/api/me/races/' + raceId, failState);
  });
  await check('Unsaved sharing and companion drafts survive status and independent section saves', async () => {
    const draft = '尚未保存的同行需求：等待团友确认';
    await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).click();
    await page.getByLabel('我的同行需求', { exact: true }).fill(draft);
    await page.getByRole('checkbox', { name: /合成乙团/ }).check();
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已领物');
    assert.equal(await page.getByLabel('我的同行需求', { exact: true }).inputValue(), draft);
    assert.equal(await page.getByRole('checkbox', { name: /合成乙团/ }).isChecked(), true);
    assert.deepEqual((await read('/races/' + raceId)).sharedClubIds, []);
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已更新同步范围，后续参赛状态会自动同步。', { exact: true }).waitFor();
    await assertSharingCollapsed(page);
    await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).click();
    assert.equal(await page.getByLabel('我的同行需求', { exact: true }).inputValue(), draft);
    await page.getByRole('checkbox', { name: /合成乙团/ }).uncheck();
    await page.getByRole('button', { name: '保存同行需求', exact: true }).click();
    await page.getByText('同行需求已保存。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: /合成乙团/ }).isChecked(), false);
    assert.deepEqual((await read('/races/' + raceId)).sharedClubIds, [clubIds[1]], 'saving a note must not silently save the audience draft');
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已设为仅自己可见。', { exact: true }).waitFor();
    await assertSharingCollapsed(page);
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已缴费', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已缴费');
  });
  await check('Race tabs switch locally without returning to the page header', async () => {
    for (const width of [320, 390, 1440]) {
      db.prepare('UPDATE races SET race_date=? WHERE id=?').run((Number(day.slice(0, 4)) + 1) + '-06-21', raceId);
      await page.setViewportSize({ width, height: 700 });
      await page.goto(racePath, { waitUntil: 'networkidle' });
      for (const position of [200, 80]) {
        // Keep the tabs clear of the sticky page header so clicks need no automatic scrolling.
        await page.locator('.tabs').evaluate((element, top) => scrollTo(0, scrollY + element.getBoundingClientRect().top - top), position);
        for (const label of ['赛事信息', '赛事资讯', '我的成绩', '赛事信息', '赛事资讯', '赛事信息']) {
          const before = await page.locator('.tabs').evaluate(element => ({ y: element.getBoundingClientRect().top, scrollY }));
          assert.ok(before.scrollY > 100, 'The tab regression must start below the hero');
          await page.locator('.tabs').getByRole('tab', { name: label, exact: true }).click();
          await page.waitForFunction(label => document.querySelector('.tabs .on')?.textContent === label, label);
          const after = await page.locator('.tabs').evaluate(element => ({ y: element.getBoundingClientRect().top, scrollY }));
          assert.ok(after.scrollY > 100, label + ' must not return to the page header at ' + width);
          assert.ok(Math.abs(after.y - before.y) <= 1, label + ' must keep the tab row in place at ' + width + ': ' + JSON.stringify({ before, after }));
        }
      }
    }
  });
  await check('Long race names and place details fit narrow screens without clipping actions', async () => {
    const longName = '2027全国城市生态马拉松暨全民健康跑·大型长名称展示测试赛事';
    db.prepare('UPDATE races SET name=?,place=?,city=?,province=?,race_date=? WHERE id=?').run(longName, '合成城市滨海生态景观大道起点广场', '合成城市', '合成地区', (Number(day.slice(0, 4)) + 1) + '-06-21', otherId);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(origin + '/marathon/races/' + otherId, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.race-hero h1').textContent(), longName);
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        titleWidth: document.querySelector('.race-hero h1').clientWidth,
        titleScrollWidth: document.querySelector('.race-hero h1').scrollWidth,
        hasCover: !!document.querySelector('.race-cover'),
        mainControls: [...document.querySelectorAll('.official-primary,.tabs .tab,.race-follow-row button,.race-plan .plan-action')].filter(el => el.getClientRects().length).map(el => ({ label: el.textContent.trim(), height: el.getBoundingClientRect().height }))
      }));
      assert.ok(metrics.pageWidth <= width, JSON.stringify(metrics));
      assert.ok(metrics.titleScrollWidth <= metrics.titleWidth, 'Long title should wrap inside the available column');
      assert.equal(metrics.hasCover, false, 'Missing images keep the original abstract track hero');
      assert.ok(metrics.mainControls.every(control => control.height >= 43.5), JSON.stringify(metrics.mainControls));
    }
    db.prepare('UPDATE races SET name=?,place=?,race_date=? WHERE id=?').run('合成另一场马拉松', '合成起点', day, otherId);
    await page.goto(racePath, { waitUntil: 'networkidle' });
  });
  await check('Mine separates followed races from participation plans', async () => {
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).waitFor();
    await page.goto(origin + '/marathon/mine', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '我的赛事', exact: true }).click();
    await page.locator('.plan-row').filter({ hasText: '合成同行马拉松' }).waitFor();
    await page.getByRole('button', { name: '关注的比赛 1', exact: true }).click();
    await page.locator('.followed-races .race-card-shell').filter({ hasText: '合成同行马拉松' }).waitFor();
    await page.locator('.followed-races').getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).click();
    await page.getByText('先关注，慢慢选下一场', { exact: true }).waitFor();
    assert.equal((await read('/races/' + raceId)).myStatus, '已缴费');
  });
  await check('Calendar displays personal state separately from event state', async () => {
    db.prepare('UPDATE races SET race_date=? WHERE id=?').run(day, raceId);
    await page.goto(origin + '/marathon/calendar', { waitUntil: 'networkidle' });
    await page.locator('.calendar-race-row').filter({ hasText: '合成同行马拉松' }).waitFor();
    assert.ok((await page.locator('.calendar-race-row').filter({ hasText: '合成同行马拉松' }).innerText()).includes('我的状态 · 已缴费'));
  });
  await check('Responsive layouts preserve all controls at 320, 390 and 1440px', async () => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(racePath, { waitUntil: 'networkidle' });
      await participationLayout(page, 'race-plan-collapsed', width, { expanded: false });
      await page.locator('.race-plan button[aria-expanded]').first().click();
      await participationLayout(page, 'race-plan-expanded', width, { expanded: true });
      await page.locator('.race-plan button[aria-expanded]').first().click();
      assert.equal(await page.locator('.race-plan .plan-editor').count(), 0, 'Plan can collapse without changing saved state');
      assert.equal((await read('/races/' + raceId)).myStatus, '已缴费');
      await page.goto(racePath + '?plan=1', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.race-plan .plan-editor').count(), 1, 'A plan deep link expands the editor');
      await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'list overflow at ' + width);
      const row = page.locator('.race-card-shell').filter({ hasText: '合成同行马拉松' });
      const overlaps = await row.evaluate(element => { const link = element.querySelector('.body').getBoundingClientRect(), button = element.querySelector('.follow-race').getBoundingClientRect(); return link.left < button.right && link.right > button.left && link.top < button.bottom && link.bottom > button.top; });
      assert.equal(overlaps, false, 'follow does not overlap race text at ' + width);
    }
  });
  await check('Guests see readable follow and login actions without private plan controls at every width', async () => {
    const guest = await browser.newContext({ reducedMotion: 'reduce' });
    await guest.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const guestPage = await guest.newPage();
    guestPage.on('pageerror', error => report.errors.push(error.message));
    try {
      for (const width of [320, 390, 1440]) {
        await guestPage.setViewportSize({ width, height: 1000 });
        await guestPage.goto(racePath, { waitUntil: 'networkidle' });
        await participationLayout(guestPage, 'race-plan-guest', width, { expanded: false, guest: true });
      }
      await guestPage.getByRole('button', { name: '登录后标记', exact: true }).click();
      await guestPage.waitForURL('**/marathon/mine');
      assert.equal(await guestPage.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + raceId + '?plan=1');
    } finally { await guest.close(); }
  });
  await check('A pending update cannot duplicate requests or change another event after navigation', async () => {
    db.prepare('UPDATE races SET race_date=? WHERE id=?').run(new Date(Date.now() + 2 * 86400000 + 8 * 3600000).toISOString().slice(0, 10), otherId);
    await page.goto(racePath + '?plan=1', { waitUntil: 'networkidle' });
    let release, arrived, done, requests = 0;
    const requestArrived = new Promise(resolve => { arrived = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const finished = new Promise(resolve => { done = resolve; });
    const delayed = async route => { if (route.request().method() !== 'PUT') return route.continue(); requests++; const response = await route.fetch(); arrived(); await hold; await route.fulfill({ response }); done(); };
    await page.route('**/api/me/races/' + raceId, delayed);
    const stateButton = page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true });
    await stateButton.click(); await requestArrived;
    assert.equal(await stateButton.isDisabled(), true);
    await stateButton.evaluate(button => button.click());
    assert.equal(requests, 1);
    await page.locator('header.topbar a').first().click();
    await page.getByRole('textbox', { name: '搜索赛事名称或城市' }).fill('合成另一场马拉松');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.race-card').filter({ hasText: '合成另一场马拉松' }).click();
    await page.waitForURL('**/races/' + otherId);
    release();
    await finished;
    await page.unroute('**/api/me/races/' + raceId, delayed);
    await page.locator('.race-plan .plan-status').filter({ hasText: '还没有参赛计划' }).waitFor();
    assert.equal((await read('/races/' + otherId)).myStatus, '');
    assert.equal(await page.getByText('已标记为「已领物」', { exact: true }).count(), 0);
  });
  await check('Guest follow returns to the same event after login', async () => {
    const guest = await browser.newContext(); const guestPage = await guest.newPage();
    await guest.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await guestPage.goto(racePath, { waitUntil: 'networkidle' });
    await guestPage.locator('.race-follow-row').getByRole('button').click();
    await guestPage.waitForURL('**/marathon/mine');
    assert.equal(await guestPage.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + raceId + '?follow=1');
    await guestPage.evaluate(token => localStorage.setItem('marathon_token', token), token);
    await guestPage.goto(racePath + '?follow=1', { waitUntil: 'networkidle' });
    await guestPage.getByText('已关注这场比赛。', { exact: true }).waitFor();
    assert.equal((await read('/races/' + raceId)).following, true);
    await guest.close();
  });
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await context.close();
}
main().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
