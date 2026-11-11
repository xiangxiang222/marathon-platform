const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

async function generateComparisons(output, options = {}) {
  const out = output || path.resolve(root, process.env.UI_AUDIT_OUT || 'design/previews/bright-ui-20261111');
  const before = path.resolve(root, options.before || process.env.UI_AUDIT_BEFORE || 'design/previews/ui-system-20261111');
  const folder = path.join(out, 'comparisons');
  fs.mkdirSync(folder, { recursive: true });
  const cases = [
    ['web-home', 'Web 首页', 'web/home-390.png', 390],
    ['web-activity', 'Web 活动详情', 'web/activity-390.png', 390],
    ['web-create', 'Web 发布活动', 'web/activity-create-390.png', 390],
    ['mini-home', 'Mini 赛历首页', 'mini/pages-races-races-390.png', 390],
    ['mini-clubs', 'Mini 跑团首页', 'mini/pages-clubs-clubs-390.png', 390],
    ['mini-activity', 'Mini 活动详情', 'mini/pages-activity-activity-390.png', 390],
    ['mini-create', 'Mini 发布活动', 'mini/pages-activity-create-activity-create-390.png', 390],
    ['admin-overview', 'Web 后台总览', 'admin/admin-overview-1440.png', 720],
    ['web-sport', 'Web 运动', 'web/sport-390.png', 390],
    ['web-mine', 'Web 我的', 'web/mine-390.png', 390],
    ['mini-sport', 'Mini 运动', 'mini/pages-sport-sport-390.png', 390],
    ['mini-mine', 'Mini 我的', 'mini/pages-mine-mine-390.png', 390]
  ];
  const labels = options.labels || ['上轮偏暗色板', '当前红白浅灰'];
  const report = { before, after: out, kind: options.kind || 'Representative local screenshots; palette adjustment and small refinements, not a new layout rebuild', labels, pairs: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    for (const [id, title, file, width] of cases) {
      const first = path.join(before, file), second = path.join(out, file);
      if (!fs.existsSync(first) || !fs.existsSync(second)) continue;
      const sources = [first, second].map(source => 'data:image/png;base64,' + fs.readFileSync(source).toString('base64'));
      const encoded = await page.evaluate(async ({ sources, width, title, labels }) => {
        const images = await Promise.all(sources.map(async source => { const image = new Image(); image.src = source; await image.decode(); return image; }));
        const height = 900, gap = 16, header = 66;
        const canvas = document.createElement('canvas'); canvas.width = width * 2 + gap * 3; canvas.height = height + header + gap;
        const context = canvas.getContext('2d'); context.fillStyle = '#f5f5f5'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#262626'; context.font = 'bold 18px system-ui'; context.fillText(title, gap, 25);
        context.font = '13px system-ui'; context.fillText(labels[0], gap, 51); context.fillText(labels[1], width + gap * 2, 51);
        images.forEach((image, index) => {
          const scale = width / image.width, crop = Math.min(image.height, height / scale), x = gap + index * (width + gap);
          context.fillStyle = 'white'; context.fillRect(x, header, width, height);
          context.drawImage(image, 0, 0, image.width, crop, x, header, width, crop * scale);
        });
        const imagePalette = images.map((image, index) => {
          const data = context.getImageData(gap + index * (width + gap), header, width, height).data;
          let samples = 0, pastel = 0, dark = 0;
          for (let offset = 0; offset < data.length; offset += 4 * 16) {
            const color = [data[offset], data[offset + 1], data[offset + 2]];
            const light = color.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, channel) => sum + value * [0.2126, 0.7152, 0.0722][channel], 0);
            samples++;
            if (light >= 0.65 && Math.max(...color) - Math.min(...color) >= 10) pastel++;
            if (light < 0.2) dark++;
          }
          return { label: labels[index], samples, pastelFraction: Number((pastel / samples).toFixed(4)), darkFraction: Number((dark / samples).toFixed(4)), method: 'RGB samples from screenshot top 900px; includes text/icons/artwork, not just CSS backgrounds' };
        });
        return { png: canvas.toDataURL('image/png').split(',')[1], imagePalette };
      }, { sources, width, title, labels });
      const comparison = path.join(folder, id + '.png');
      fs.writeFileSync(comparison, Buffer.from(encoded.png, 'base64'));
      report.pairs.push({ id, title, before: path.relative(out, first), after: file, comparison: path.relative(out, comparison), imagePalette: encoded.imagePalette, note: 'Top 900px at original mobile scale; desktop image reduced to 720px.' });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'comparison-report.json'), JSON.stringify(report, null, 2));
  return report;
}

module.exports = { generateComparisons };
if (require.main === module) generateComparisons().then(report => console.log('Generated ' + report.pairs.length + ' palette comparisons')).catch(error => { console.error(error); process.exitCode = 1; });
