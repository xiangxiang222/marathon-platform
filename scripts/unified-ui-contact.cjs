/** Rebuild the four-tab comparison from existing acceptance screenshots. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const folder = path.resolve(root, process.env.UI_AUDIT_OUT || 'design/previews/jd-ui-20261111');
const views = [
  ['home', 'races', '赛事', '发现下一场比赛'],
  ['clubs', 'clubs', '跑团', '找到一起跑的人'],
  ['sport', 'sport', '运动', '记录每一步进步'],
  ['mine', 'mine', '我的', '每一程，都有记录']
];
const styles = `*{box-sizing:border-box}body{margin:0;padding:32px;background:#eef1f5;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}h1{font-size:28px;margin:0 0 8px;font-weight:600;letter-spacing:normal}p{margin:0;color:#777777;font-size:14px;line-height:1.7}.tag{font-size:12px;border:1px solid #dce1e8;padding:8px 12px;border-radius:8px;background:#f9fafb}.grid{display:grid;grid-template-columns:repeat(4,390px);gap:24px}.label{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}.label b{font-size:17px;font-weight:600}.label span{font-size:12px;color:#777777}.screen{height:900px;border:1px solid #dce1e8;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 8px 24px #1a1a1a08}.screen img{width:390px;display:block;max-width:none}footer{font-size:12px;color:#777777;margin-top:20px;line-height:1.7}`;

function documentFor(mini) {
  const label = mini ? '小程序源码镜像 · 390 px' : '网页本地预览 · 390 px';
  const caveat = mini
    ? '画面来自小程序源码镜像与合成验收数据，包含模拟的状态栏留白。此图用于布局审阅，非微信真机截图。'
    : '画面使用隔离本地服务与验收数据，内容仅用于设计及功能验收。此图为网页预览，非微信真机截图。';
  const cards = views.map(([webId, miniId, name, description]) => {
    const image = mini ? `mini/pages-${miniId}-${miniId}-390.png` : `web/${webId}-390.png`;
    return `<section><div class="label"><b>${name}</b><span>${description}</span></div><div class="screen"><img src="${image}" alt="${name}页面首屏" /></div></section>`;
  }).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>${styles}</style><header><div><h1>赛历 · 四个主入口</h1><p>原创小插画 · 紧凑图文模块 · 真实数据图表 · 统一字体与控件。</p></div><div class="tag">${label}</div></header><div class="grid">${cards}</div><footer>${caveat}</footer></html>`;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  try {
    for (const mini of [false, true]) {
      const name = mini ? 'mini-contact' : 'web-contact';
      const html = path.join(folder, `${name}.html`);
      fs.writeFileSync(html, documentFor(mini));
      const page = await browser.newPage({ viewport: { width: 1696, height: 1100 }, deviceScaleFactor: 1 });
      await page.goto('file://' + html, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()));
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({ path: path.join(folder, `${name}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
