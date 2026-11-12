/* Admin profile layout journeys with synthetic API fixtures.
 * Requires a local Vite preview. No production transport or writes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const { createState, setup } = require('./admin-api-fixture.cjs');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, process.env.UI_AUDIT_OUT || '/tmp/jd-admin-profiles');
const reportFile = path.resolve(root, process.env.UI_AUDIT_REPORT || path.join(out, 'report.json'));
const base = process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5268/marathon';
const report = { kind: 'Admin athlete/pacer layout and navigation with synthetic API fixtures; no real data writes', startedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [] };
const clone = value => JSON.parse(JSON.stringify(value));
const profile = type => ({ id: 'layout-' + type, type, name: type === 'pacer' ? '版式验收官兔' : '版式验收运动员', gender: 'women', nameEn: 'Layout runner', avatar: '', bio: '仅供后台版式验收的合成人物资料。', personalBest: '2:40:00', city: '杭州', birthDate: '1995-06-08', placeOfBirth: '浙江', team: '版式验收训练队', status: 'published', isPublic: true, hasDraft: false, origin: 'manual', revision: 1, baseVersion: 'layout-fixture', updatedAt: '2026-11-12T00:00:00Z', article: { title: '从训练到赛道的一段故事', lead: '这是一篇合成预览文章。', body: '## 一起出发\n\n日常训练与比赛履历组成了这份合成文章，用于检查完整阅读排版。\n\n## 比赛经历\n\n这些文字仅用于界面验收，不是真实人物报道。' }, seasonYear: 2026, seasonBest: '2:45:00', personalRecords: [{ discipline: '全程马拉松', mark: '2:40:00', date: '2026-10-11', venue: '合成马拉松' }], careerHighlights: [{ title: '合成马拉松', date: '2026-10-11', result: '2:40:00', position: '10' }], assignments: type === 'pacer' ? [{ raceId: 'layout-race', raceName: '合成城市马拉松官方配速任务', raceDate: '2026-11-01', city: '杭州', raceGrade: 'A', edition: 2026, targetTime: '3:30:00', distanceKm: 42.195, status: 'completed' }] : [] });
async function nav(page, name) { const toggle = page.getByRole('button', { name: '打开导航菜单', exact: true }); if (await toggle.isVisible()) await toggle.click(); await page.locator('.navigation-groups').getByRole('button', { name: new RegExp(name) }).click(); await page.locator('.profile-intro').waitFor(); }
async function inspect(page, label, extra = {}) {
  await page.waitForTimeout(35);
  const metrics = await page.evaluate(() => {
    const bounds = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
    const visible = el => { const r = el.getBoundingClientRect(), css = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.y < innerHeight && css.visibility !== 'hidden' && css.display !== 'none'; };
    const controls = [...document.querySelectorAll('.profile-admin button,.profile-admin input,.profile-admin select,.profile-admin textarea,.profile-admin a')].filter(visible).map(el => ({ tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80), ...bounds(el) }));
    const editor = document.querySelector('.profile-editor'), library = document.querySelector('.profile-library'), first = document.querySelector('.profile-editor .profile-form input');
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controls, editor: editor ? bounds(editor) : null, library: library ? bounds(library) : null, firstFocused: !!first && document.activeElement === first, editorTab: document.querySelector('.profile-editor-tabs button.on')?.textContent };
  });
  assert.ok(metrics.scrollWidth <= metrics.width + 1, label + ': page overflow');
  assert.deepEqual(metrics.controls.filter(c => c.x < -1 || c.right > metrics.width + 1), [], label + ': visible controls exceed viewport');
  if (extra.opened) {
    assert.equal(metrics.firstFocused, true, label + ': first editable input receives focus');
    if (metrics.width < 900) { assert.ok(Math.abs(metrics.editor.y - 72) <= 8, label + ': editor starts below sticky navigation: ' + metrics.editor.y); assert.ok(metrics.library.y >= metrics.editor.bottom - 1, label + ': library follows editor'); }
  }
  const file = label + '.png'; await page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled' });
  report.screenshots.push(file); report.checks.push({ label, ...metrics, passed: true });
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const width of [320, 390, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => sessionStorage.setItem('marathon_admin', 'mock-admin-token'));
      await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const page = await context.newPage(), state = createState(), mode = { value: 'data', release: null };
      page.on('pageerror', error => report.errors.push({ width, message: error.message }));
      await setup(page, state);
      await page.route('**/marathon/api/admin/content/profiles**', async route => {
        const url = new URL(route.request().url()), type = url.searchParams.get('type') || (url.pathname.endsWith('layout-pacer') ? 'pacer' : 'athlete');
        assert.equal(route.request().method(), 'GET', 'This layout suite must not save or mutate records');
        if (mode.value === 'loading') await new Promise(resolve => { mode.release = resolve; });
        if (mode.value === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成服务暂时不可用，请稍后重试。' }) });
        const detail = /\/profiles\/[^/]+$/.test(url.pathname), rows = mode.value === 'empty' ? [] : [profile(type)];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail ? { profile: profile(type) } : { profiles: rows, total: rows.length, page: 1, pages: 1 }) });
      });
      await page.goto(base + '/admin'); await page.locator('.metric-card').first().waitFor();
      for (const [type, name] of [['athlete', '运动员管理'], ['pacer', '官兔管理']]) {
        const prefix = type + '-' + width;
        mode.value = 'data'; await nav(page, name); await page.locator('.profile-row').first().waitFor(); await inspect(page, prefix + '-list');
        await page.locator('.profile-row').first().click(); await page.locator('.profile-editor').waitFor(); await inspect(page, prefix + '-open-existing', { opened: true });
        for (const [index, tab] of ['base', 'article', 'career', 'preview'].entries()) {
          await page.locator('.profile-editor-tabs button').nth(index).click();
          if (tab === 'preview') await page.getByRole('heading', { name: '从训练到赛道的一段故事', exact: true }).waitFor();
          await inspect(page, prefix + '-tab-' + tab);
        }
        await page.getByRole('button', { name: '收起人物编辑器', exact: true }).click();
        await page.locator('.profile-intro>.profile-primary').click(); await page.locator('.profile-editor').waitFor(); await inspect(page, prefix + '-new', { opened: true });
        await page.locator('.profile-editor .profile-form input').first().fill('合成新档案');
        await page.locator('.profile-editor-tabs button').nth(1).click(); await page.getByLabel('文章标题', { exact: false }).fill('合成文章预览');
        await page.getByLabel('人物正文', { exact: false }).fill('## 新的开始\n\n用于新建档案的版式验收正文。');
        await page.locator('.profile-editor-tabs button').nth(2).click();
        if (type === 'pacer') {
          await page.getByRole('button', { name: '添加配速赛事', exact: true }).click(); await page.getByLabel('赛事名称 1', { exact: true }).fill('合成城市马拉松官方配速任务');
          await page.getByLabel('目标完赛时间 1', { exact: true }).fill('3:30:00');
          assert.match(await page.locator('.profile-assignment-pace').textContent(), /4:59|4′59/);
          await page.getByText('赛事关联信息', { exact: true }).click(); await inspect(page, prefix + '-new-assignment');
        } else { await page.getByRole('button', { name: '添加个人成绩', exact: true }).click(); await page.getByRole('button', { name: '添加比赛履历', exact: true }).click(); await inspect(page, prefix + '-new-career'); }
        await page.locator('.profile-editor-tabs button').nth(3).click(); await page.getByRole('heading', { name: '合成文章预览', exact: true }).waitFor(); await inspect(page, prefix + '-new-preview');
        await page.getByRole('button', { name: '收起人物编辑器', exact: true }).click();
        mode.value = 'empty'; await page.locator('.profile-search button').click(); await page.getByText('从第一份人物档案开始', { exact: true }).waitFor(); await inspect(page, prefix + '-empty');
        mode.value = 'error'; await page.locator('.profile-search button').click(); await page.locator('.profile-error').waitFor(); await inspect(page, prefix + '-error');
        mode.value = 'data'; await page.locator('.profile-error button').click(); await page.locator('.profile-row').first().waitFor(); assert.equal(await page.locator('.profile-error').count(), 0); await inspect(page, prefix + '-retry');
        mode.value = 'loading'; await page.locator('.profile-search button').click(); await page.getByText('正在读取人物档案…', { exact: true }).waitFor(); await inspect(page, prefix + '-loading'); mode.value = 'data'; mode.release(); await page.locator('.profile-row').first().waitFor();
      }
      assert.deepEqual(state.unexpected, [], 'All transport handled by known mocks'); await context.close();
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); }
}
main().catch(error => { report.passed = false; report.error = error.stack; console.error(error.stack); process.exitCode = 1; }).finally(() => { report.finishedAt = new Date().toISOString(); fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, report: reportFile })); });
