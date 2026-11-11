'use strict';
// Browser executes the canonical native Canvas renderer to produce export PNGs,
// then mirrors actual WXML/WXSS with synthetic Page data. Not a WeChat device.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'), { chromium } = require('playwright-core');
const fixture = require('./achievement-poster-mini-fixture.cjs');
const root = path.resolve(__dirname, '../..'), out = path.join(__dirname, 'achievement-poster-20261111/mini');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { kind: 'Canonical Mini Canvas renderer executed in Chromium; native WXML/WXSS browser source mirror, synthetic inputs, not a WeChat device', exports: [] };
  try {
    const page = await browser.newPage();
    const modelSource = fs.readFileSync(path.join(root, 'miniprogram/utils/achievement-model.js'), 'utf8'), rendererSource = fs.readFileSync(path.join(root, 'miniprogram/utils/achievement-poster.js'), 'utf8');
    for (const [name, options, pageIndex] of [
      ['pb-cream', { mode: 'pb', style: 'cream' }, 0], ['pb-mint', { mode: 'pb', style: 'mint' }, 0], ['pb-coral', { mode: 'pb', style: 'coral' }, 0],
      ['pb-private', { mode: 'pb', showName: false, showRace: false, showDate: false }, 0],
      ['results-1', { mode: 'results', style: 'cream' }, 0], ['results-2', { mode: 'results', style: 'cream' }, 1], ['results-3', { mode: 'results', style: 'cream' }, 2]
    ]) {
      const rendered = await page.evaluate(({ modelSource, rendererSource, payload, options, pageIndex }) => {
        const modelModule = { exports: {} }; new Function('module', 'exports', modelSource)(modelModule, modelModule.exports);
        const module = { exports: {} }; new Function('module', 'exports', 'require', rendererSource)(module, module.exports, () => modelModule.exports);
        const canvas = document.createElement('canvas'), model = modelModule.exports.buildAchievementModel(payload, { nickname: '向前跑的我', ...options });
        const result = module.exports.renderAchievementPoster(canvas, model, { pageIndex });
        return { ...result, png: canvas.toDataURL('image/png').split(',')[1], rows: modelModule.exports.paginateAchievement(model)[pageIndex].rows.length, totalRows: model.rows.length };
      }, { modelSource, rendererSource, payload: fixture.runnerPayload(), options, pageIndex });
      assert.equal(rendered.width, 1080); assert.ok(rendered.height >= 1440); assert.ok(rendered.png.length > 10000);
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(rendered.png, 'base64'));
      delete rendered.png; report.exports.push({ name, ...rendered });
    }
    assert.equal(report.exports.filter(row => row.name.startsWith('results-')).reduce((n, row) => n + row.rows, 0), 44);
    report.passed = true;
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'canvas-report.json'), JSON.stringify(report, null, 2));
  const result = spawnSync(process.execPath, ['design/previews/mini-ui-source-audit.cjs'], { cwd: root, encoding: 'utf8', env: { ...process.env,
    UI_AUDIT_OUT: path.relative(root, out), MINI_AUDIT_ROUTES: fixture.route, MINI_AUDIT_FIXTURE: 'design/previews/achievement-poster-mini-fixture.cjs', UI_PALETTE_PROFILE: 'colorful' } });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); assert.equal(result.status, 0, 'Source mirror regression failed');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
