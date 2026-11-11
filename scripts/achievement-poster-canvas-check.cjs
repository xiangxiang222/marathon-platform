// Real Chromium Canvas checks for the shared renderer. Does not call any API.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'design/previews/achievement-poster-20261111/renderer');
async function main() {
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-achievement-poster.cjs'), '--check']);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  fs.mkdirSync(out, { recursive: true });
  const checks = [];
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="poster"></canvas>');
    await page.addScriptTag({ content: '(function(){const module={exports:{}};\n' + fs.readFileSync(path.join(root, 'miniprogram/utils/achievement-model.js'), 'utf8') + '\nwindow.model=module.exports;})();' });
    await page.addScriptTag({ content: '(function(){const module={exports:{}};const require=()=>window.model;\n' + fs.readFileSync(path.join(root, 'miniprogram/utils/achievement-poster.js'), 'utf8') + '\nwindow.renderer=module.exports;})();' });
    for (const count of [1, 2, 3, 4]) {
      const result = await page.evaluate(count => {
        const distances = ['full', 'half', '10k', '5k'];
        const results = distances.slice(0, count).map((distance, i) => ({ distance, seconds: [12908, 6205, 2602, 1236][i], race: { id: i + 1, name: '城市马拉松暨环湖跑步嘉年华'.repeat(4), raceDate: '2026-10-18', kind: 'road', meet: 'offline', city: '杭州', province: '浙江' } }));
        const data = window.model.buildAchievementModel({ asOf: '2026-11-11', results }, { nickname: '爱跑步的林同学🏃', showCity: true });
        const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'), draw = ctx.fillText.bind(ctx), calls = [];
        ctx.fillText = (v, x, y) => { const width = ctx.measureText(v).width, left = ctx.textAlign === 'right' ? x - width : ctx.textAlign === 'center' ? x - width / 2 : x; calls.push({ text: v, left, right: left + width, y }); draw(v, x, y); };
        const meta = window.renderer.renderAchievementPoster(canvas, data);
        ctx.fillText = draw;
        return { meta, calls, png: canvas.toDataURL('image/png') };
      }, count);
      assert.equal(result.meta.width, 1080); assert.equal(result.meta.height, 1440);
      for (const call of result.calls) { assert.ok(call.left >= 0 && call.right <= 1080 && call.y > 0 && call.y < 1440, JSON.stringify(call)); }
      fs.writeFileSync(path.join(out, 'pb-' + count + '-items.png'), Buffer.from(result.png.split(',')[1], 'base64'));
      checks.push({ name: count + ' PB items, long Chinese title and city', passed: true, width: 1080, height: 1440 });
    }
    const privacy = await page.evaluate(() => {
      const input = { asOf: '2026-11-11', results: [{ distance: 'half', seconds: 6205, race: { id: 1, name: 'PRIVATE-RACE', raceDate: '2026-10-18', kind: 'road', meet: 'offline', city: 'PRIVATE-CITY', province: 'PRIVATE-PROVINCE' } }] };
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'), draw = ctx.fillText.bind(ctx), text = [];
      ctx.fillText = (v, x, y) => { text.push(v); draw(v, x, y); };
      const model = window.model.buildAchievementModel(input, { nickname: 'PRIVATE-NAME', showName: false, showRace: false, showDate: false, showCity: false });
      window.renderer.renderAchievementPoster(canvas, model); ctx.fillText = draw;
      let rejectedEmpty = false; try { window.renderer.renderAchievementPoster(canvas, window.model.buildAchievementModel(input, { selectedKeys: [] })); } catch (e) { rejectedEmpty = /先选/.test(e.message); }
      return { text, rejectedEmpty };
    });
    assert.ok(!privacy.text.join('|').includes('PRIVATE-')); assert.ok(!privacy.text.join('|').includes('2026')); assert.ok(!privacy.text.includes('热爱奔跑的我')); assert.equal(privacy.rejectedEmpty, true);
    checks.push({ name: 'hidden fields are absent from actual Canvas text; empty selection rejected', passed: true });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: checks.length, checks, scope: 'Real Chromium Canvas, synthetic local records, no API requests; not WeChat device rendering' }, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ passed: checks.length, output: path.relative(root, out) }) + '\n');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
