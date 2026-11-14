'use strict';
// Keep the mini program's native PNGs identical to the authored Web vectors.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const target = path.join(root, 'miniprogram/images/race-landmarks');
    fs.mkdirSync(target, { recursive: true });
    for (const id of ['beijing', 'shanghai', 'xiamen']) {
      const page = await browser.newPage({ viewport: { width: 120, height: 96 }, deviceScaleFactor: 2 });
      await page.route('**/*', request => request.abort());
      const svg = fs.readFileSync(path.join(root, 'web/public/images/race-landmarks', id + '.svg'), 'utf8');
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block}</style>' + svg);
      await page.screenshot({ path: path.join(target, id + '.png'), omitBackground: true });
      await page.close();
    }
    console.log('Synchronized three city landmark SVG / PNG pairs.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
