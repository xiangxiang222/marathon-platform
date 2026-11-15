'use strict';
// Home shortcuts render at up to 44px: export 3x vectors without shipping 384px PNGs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.CHROME_BIN || undefined, ...(process.env.CHROME_PATH || process.env.CHROME_BIN ? {} : { channel: 'chrome' }), headless: true });
  try {
    for (const name of ['calendar', 'clubs', 'news']) {
      const page = await browser.newPage({ viewport: { width: 132, height: 132 }, deviceScaleFactor: 1 });
      await page.route('**/*', route => route.abort());
      const svg = fs.readFileSync(path.join(root, 'web/src/assets/quick', name + '.svg'), 'utf8');
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:132px;height:132px}</style>' + svg);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await page.screenshot({ omitBackground: true });
      fs.writeFileSync(path.join(root, 'miniprogram/images/quick-' + name + '.png'), png);
      console.log(name + ': 132 × 132, ' + png.length + ' bytes');
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
