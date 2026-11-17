'use strict';
// Current WXML/WXSS mirror. Set RACE_RICH_SAVED_API_JSON to a saved API response for source-based rendering.
const fs = require('node:fs');
const path = require('node:path');
const { detailFixture } = require('./race-detail-mini-regression.cjs');
const qr = require('../server/node_modules/qrcode');
const sample = require('./race-rich-detail-fixture.cjs');
const cases = ['base', 'guide', 'guide-originals', 'cancelled', 'invalid'].map(scenario => ({ route: 'pages/race/race', scenario }));
async function prepare(unusedRoute, unusedData, scenario) {
  const payload = process.env.RACE_RICH_SAVED_API_JSON ? JSON.parse(fs.readFileSync(process.env.RACE_RICH_SAVED_API_JSON, 'utf8')) : { race: sample };
  const race = { guide: [], routeSheets: [], pacerSheets: [], nodes: [], links: [], groups: [], distanceLabels: [], kindLabels: [], ...payload.race };
  if (scenario === 'cancelled' || scenario === 'invalid') Object.assign(race, { registrationStatus: scenario, registrationLabel: scenario === 'cancelled' ? '赛事已取消' : '报名入口已失效' });
  const f = detailFixture(race, false); f.page.onLoad({ id: race.id }); await f.page.load();
  const pilot = process.env.RACE_RICH_PILOT_JSON ? JSON.parse(fs.readFileSync(process.env.RACE_RICH_PILOT_JSON, 'utf8')) : null;
  function localImage(media) {
    if (!media || !media.localFile) return '';
    return 'data:image/' + (path.extname(media.localFile).toLowerCase() === '.png' ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(media.localFile).toString('base64');
  }
  const fallback = await qr.toDataURL('https://reg.zuicool.com/verified-fixture-entry', { margin: 4, width: 288 });
  if (f.page.data.signupQr) {
    const savedQr = process.env.RACE_RICH_SAVED_API_JSON && path.join(path.dirname(process.env.RACE_RICH_SAVED_API_JSON), 'dianjiang-signup-qr.png');
    f.page.setData({ signupQr: savedQr && fs.existsSync(savedQr) ? 'data:image/png;base64,' + fs.readFileSync(savedQr).toString('base64') : fallback });
  }
  const mediaRows = (rows, kind) => rows.map((media, i) => ({ ...media, src: localImage(pilot && pilot.details.media.filter(item => item.kind === kind)[i]) || fallback, state: 'ready' }));
  const guides = mediaRows(f.page.data.guide, 'guide');
  f.page.setData({ tab: scenario.startsWith('guide') ? 'guide' : 'signup', guideOriginalsOpen: scenario === 'guide-originals', guide: guides, routeSheets: mediaRows(f.page.data.routeSheets, 'route'), pacerSheets: mediaRows(f.page.data.pacerSheets, 'pacer'), guideBlocks: f.page.data.guideBlocks.map(block => block.kind === 'image' ? { ...block, src: fallback } : block) });
  return { data: f.page.data, components: {}, css: '' };
}
async function audit({ page, scenario, metrics }) {
  const errors = [];
  if (scenario === 'base') {
    if (await page.locator('.race-group').count() !== 4) errors.push('All four source options must be visible.');
    if (await page.locator('.signup-entry .qr').count() !== 1) errors.push('One direct QR must be visible.');
    if (await page.locator('.official-actions,.official-foot').count()) errors.push('Duplicate signup actions remain.');
    if (!metrics.visibleText.includes('实际里程') || !metrics.visibleText.includes('13.5公里') || !metrics.visibleText.includes('196元')) errors.push('Sample distance or parent-child fee missing.');
  }
  if (scenario.startsWith('guide')) {
    if (!await page.locator('.guide-table').count()) errors.push('Source tables must be rendered as tables.');
    if (!await page.locator('.guide-index').count()) errors.push('The current guide chapters must be navigable.');
    const cells = await page.locator('.guide-table-cell').evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
    if (cells.some(width => width < 119)) errors.push('Source table columns must not collapse on small screens.');
    if (scenario === 'guide' && await page.locator('.guide-originals .race-media').count()) errors.push('Reference originals should be folded after a full guide.');
  }
  if (['cancelled', 'invalid'].includes(scenario) && await page.locator('.signup-entry .qr').count()) errors.push('Cancelled/invalid registration must have no QR.');
  return errors;
}
module.exports = { cases, prepare, audit };
