'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const origin = (process.env.RACE_ARCHIVE_ORIGIN || 'http://127.0.0.1:5187') + '/marathon';
const chrome = process.env.RACE_ARCHIVE_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium'].find(file => fs.existsSync(file));

async function get(path) {
  const response = await fetch(origin + '/api/race-catalog' + path);
  assert.ok(response.ok, path + ' public API ' + response.status);
  return response.json();
}
async function links(locator, urls) {
  const actual = await locator.evaluateAll(elements => elements.map(element => element.href));
  for (const url of urls) assert.ok(actual.includes(url), 'missing ' + url);
}
async function run() {
  const browser = await chromium.launch(chrome ? { executablePath: chrome, headless: true } : { headless: true });
  const errors = [], views = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    page.on('pageerror', err => errors.push(err.message));
    const catalog = await get('');
    for (const race of catalog.races) {
      const { archive } = await get('/' + race.id);
      await page.goto(origin + '/race-catalog/' + race.id);
      const tabs = page.getByRole('navigation', { name: '赛事栏目' });
      await tabs.waitFor();
      await page.getByText('逐届资料与缺项', { exact: true }).click();
      assert.equal(await page.locator('.annual-coverage .edition-coverage-row').count(), archive.editions.length);
      await page.getByText('逐届资料与缺项', { exact: true }).click();
      for (const [tab, label, selector] of [['entry','参赛','选择参赛年份'],['results','成绩','选择成绩年份'],['gallery','图鉴','选择图鉴年份'],['updates','动态','选择故事年份']]) {
        await tabs.getByRole('button', { name: label, exact: true }).click();
        for (const edition of archive.editions) {
          await page.getByLabel(selector).selectOption(String(edition.year));
          const resources = category => edition.officialResources.filter(item => item.category === category).map(item => item.url);
          if (tab === 'entry') {
            await page.getByRole('button', { name: '报名中签', exact: true }).click();
            assert.ok(await page.getByRole('heading', { name: edition.year + ' 报名安排', exact: true }).isVisible());
            if (edition.registration.opens) assert.ok((await page.locator('.timeline').innerText()).includes(edition.registration.opens));
            await page.getByRole('button', { name: '参赛指南', exact: true }).click();
            await links(page.locator('.section a.official-resource'), resources('guide'));
          } else if (tab === 'results') {
            assert.equal(await page.locator('.champion,.result-row').count(), edition.results.length);
            await links(page.locator('.section a.official-resource'), resources('results'));
            const displayed = await page.locator('.champion,.result-row').allTextContents();
            for (const row of edition.results) assert.ok(displayed.some(text => text.includes(row.athlete) && (!row.timing || text.includes(row.timing))));
          } else if (tab === 'gallery') {
            for (const [name, category] of [['参赛服', 'shirt'], ['奖牌', 'medal']]) {
              await page.getByRole('button', { name, exact: true }).click();
              await links(page.locator('.collection-year a'), resources(category));
              const displayed = await page.locator('.collection-head b').allTextContents();
              assert.ok(displayed.every(year => year === String(edition.year)));
            }
          } else {
            assert.ok((await page.locator('.story-card .text small').allTextContents()).every(text => text.includes(String(edition.year))));
          }
        }
      }
      await tabs.getByRole('button', { name: '赛道', exact: true }).click();
      for (const edition of archive.editions) {
        await page.locator('.version-card').filter({ has: page.getByText(String(edition.year), { exact: true }) }).first().click();
        if (await page.getByLabel('选择版本内年份').count()) await page.getByLabel('选择版本内年份').selectOption(String(edition.year));
        assert.ok(await page.getByRole('heading', { name: edition.year + ' 年赛道图', exact: true }).isVisible());
        await links(page.locator('.section a.official-resource'), edition.officialResources.filter(item => item.category === 'route-map').map(item => item.url));
      }
      views.push({ id: race.id, years: archive.editions.map(item => item.year) });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ races: views.length, editions: views.reduce((n, race) => n + race.years.length, 0), states: 5 * views.reduce((n, race) => n + race.years.length, 0), errors }, null, 2));
  } finally { await browser.close(); }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
