'use strict';
// Offline vector illustrations. These are deliberately labelled simulations,
// not photographs, race certificates or official medals.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const OUT = path.join(__dirname, 'fixtures/member-art');
const runner = (x, y, color, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="-86" r="17" fill="#263b4b"/><path d="M-4-59 17-15-17 17M14-15 53 8M-4-53-38-24-67-26M8-39 42-57 64-46" stroke="${color}" stroke-width="18"/><path d="m-17 17-35 39-36-5M-16 19 12 58 54 63" stroke="#263b4b" stroke-width="15"/><path d="m-94 53 20 5M52 64h25" stroke="#fff" stroke-width="11"/></g>`;
const art = [
  { key: 'park', name: '晨光公园', color: '#37785f', sky: '#e5f5ed', body: `<circle cx="763" cy="135" r="66" fill="#ffe9a4"/><path d="M0 310Q270 185 490 310T960 310V540H0" fill="#b8d9bd"/><path d="M0 380Q270 280 500 385T960 365V540H0" fill="#85b79b"/><path d="M295 540Q650 380 460 294" fill="none" stroke="#f2dec1" stroke-width="92"/><g fill="#4f8a6a"><circle cx="137" cy="241" r="67"/><circle cx="827" cy="290" r="85"/></g><g stroke="#7b725d" stroke-width="15"><path d="M137 285v100M827 330v90"/></g>${runner(475, 340, '#e66956', 1.1)}` },
  { key: 'track', name: '赛道节奏', color: '#416b97', sky: '#e8f2fc', body: `<path d="M0 315h960v225H0" fill="#a9d2b8"/><ellipse cx="450" cy="510" rx="560" ry="230" fill="#d86b62"/><ellipse cx="450" cy="510" rx="405" ry="150" fill="#8abd9c"/><g fill="none" stroke="#fff2e9" stroke-width="5"><ellipse cx="450" cy="510" rx="520" ry="210"/><ellipse cx="450" cy="510" rx="475" ry="187"/><ellipse cx="450" cy="510" rx="430" ry="162"/></g><path d="M95 295v-85h160v85M702 295v-85h160v85" stroke="#cfdae8" stroke-width="15" fill="none"/>${runner(485, 302, '#427ba3', 1.05)}${runner(717, 375, '#e5b34b', .7)}` },
  { key: 'trail', name: '山径探索', color: '#596b8d', sky: '#ecf0fc', body: `<circle cx="753" cy="122" r="57" fill="#ffe9ad"/><path d="m0 350 220-245 230 245 205-190 305 220v160H0" fill="#c1c9df"/><path d="m0 412 260-170 180 105 230-120 290 196v117H0" fill="#8fa6b5"/><path d="M0 444q240-180 550-30t410-18v144H0" fill="#789b89"/><path d="M280 540q370-85 200-173" stroke="#e4d1b2" stroke-width="65" fill="none"/><g fill="#466f65"><path d="m125 245-65 147h130z"/><path d="m828 245-72 162h144z"/></g>${runner(483, 355, '#ed9d54', .9)}` },
  { key: 'medal', name: '每一步都算数', color: '#946d33', sky: '#fff4db', body: `<g fill="#efd89e" opacity=".7"><circle cx="140" cy="330" r="85"/><circle cx="830" cy="210" r="110"/></g><path d="m350 150 110 65-45 110-110-158z" fill="#df7664"/><path d="m610 150-110 65 45 110 110-158z" fill="#729bc8"/><circle cx="480" cy="335" r="112" fill="#e1ba62"/><circle cx="480" cy="335" r="91" fill="#ffe5a1" stroke="#b49049" stroke-width="3"/><path d="m480 270 17 38 42 5-31 29 8 42-36-21-36 21 8-42-31-29 42-5z" fill="#c29440"/><g stroke="#cfae63" stroke-width="5" stroke-linecap="round"><path d="m220 220 15-15M729 371l17 15M724 160l-3-22M248 395l-16 5"/></g>` }
];
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    for (const item of art) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${item.sky}"/>${item.body}<rect x="30" y="25" width="235" height="40" rx="9" fill="white" fill-opacity=".9"/><text x="48" y="53" font-family="sans-serif" font-size="23" fill="${item.color}">模拟训练插画 · SYNTHETIC</text><text x="40" y="121" font-family="sans-serif" font-size="38" font-weight="600" fill="${item.color}">${item.name}</text><rect x="0" y="492" width="960" height="48" fill="#fff" fill-opacity=".92"/><text x="32" y="523" font-family="sans-serif" font-size="20" fill="#52616a">跑团场景演示 · 非真人照片 / 非完赛证明</text></svg>`;
      fs.writeFileSync(path.join(OUT, item.key + '.svg'), svg);
      await page.setContent('<style>html,body{margin:0}</style>' + svg);
      await page.screenshot({ path: path.join(OUT, item.key + '.png') });
    }
  } finally { await browser.close(); }
  process.stdout.write('Generated four labelled 960×540 simulation illustrations.\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
module.exports = { art };
