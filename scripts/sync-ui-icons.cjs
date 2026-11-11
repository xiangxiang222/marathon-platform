// Rasterize the source SVG icon family for WeChat using the same shapes as Web.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const entries = [];
    for (const family of ['navigation', 'quick']) {
      for (const name of fs.readdirSync(path.join(root, 'web/src/assets', family)).filter(name => name.endsWith('.svg'))) {
        entries.push({ source: path.join(root, 'web/src/assets', family, name), target: path.join(root, 'miniprogram/images', (family === 'quick' ? 'quick-' : '') + name.replace('.svg', '.png')), size: family === 'quick' ? 120 : 72 });
      }
    }
    for (const family of ['runner', 'club']) {
      for (const name of fs.readdirSync(path.join(root, 'miniprogram/images', family)).filter(name => name.endsWith('.svg'))) {
        entries.push({ source: path.join(root, 'miniprogram/images', family, name), target: path.join(root, 'miniprogram/images', family, name.replace('.svg', '.png')), size: family === 'runner' ? 96 : 72 });
      }
    }
    for (const entry of entries) {
      const page = await browser.newPage({ viewport: { width: entry.size, height: entry.size }, deviceScaleFactor: 1 });
      await page.route('**/*', route => route.abort());
      await page.setContent('<style>html,body{margin:0;width:' + entry.size + 'px;height:' + entry.size + 'px;background:transparent}svg{display:block;width:' + entry.size + 'px;height:' + entry.size + 'px}</style>' + fs.readFileSync(entry.source, 'utf8'));
      // Use a fresh viewport per asset so transparent captures never reuse old tiles.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: entry.target, omitBackground: true });
      await page.close();
    }
    console.log('Synchronized ' + entries.length + ' SVG / PNG icons.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
