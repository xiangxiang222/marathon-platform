'use strict';
// Regenerate mini program PNGs from the Web vectors (Chrome and Python Pillow).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { spawnSync } = require('node:child_process');
const catalog = require('../shared/race-catalog.json');
const root = path.resolve(__dirname, '..');
const ids = process.argv.slice(2);
const races = ids.length ? ids : catalog.races.map(race => race.id);
for (const id of races) {
  if (!catalog.races.some(race => race.id === id)) throw Error('Unknown race: ' + id);
}
// Use an indexed PNG to retain antialiasing without putting full RGBA files in the mini package.
function indexedPng(bytes) {
  const convert = spawnSync(process.env.PYTHON || 'python', ['-c',
    'import io, sys; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())); im.convert("RGBA").quantize(colors=128,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(sys.stdout.buffer,format="PNG",optimize=True)'],
    { input: bytes });
  if (convert.status !== 0) throw Error('Install Pillow to synchronize mini landmark PNGs: ' + (convert.error || convert.stderr.toString()));
  return convert.stdout;
}
async function main() {
  const executablePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(file => fs.existsSync(file));
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const target = path.join(root, 'miniprogram/images/race-landmarks');
    fs.mkdirSync(target, { recursive: true });
    for (const id of races) {
      // 160 x 128 keeps the 80 x 64 home icons sharp at 2x within the mini package budget.
      const page = await browser.newPage({ viewport: { width: 120, height: 96 }, deviceScaleFactor: 4 / 3 });
      await page.route('**/*', request => request.abort());
      const svg = fs.readFileSync(path.join(root, 'web/public/images/race-landmarks', id + '.svg'), 'utf8');
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block}</style>' + svg);
      const image = await page.screenshot({ omitBackground: true });
      fs.writeFileSync(path.join(target, id + '.png'), indexedPng(image));
      await page.close();
    }
    console.log('Synchronized ' + races.length + ' city landmark SVG / PNG pairs.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
