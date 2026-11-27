'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const inactive = [81, 76, 88];
const active = [85, 56, 140];
const items = [
  ['赛事', '/', 'pages/races/races'],
  ['跑团', '/clubs', 'pages/clubs/clubs'],
  ['运动', '/sport', 'pages/sport/sport'],
  ['我的', '/mine', 'pages/mine/mine']
];

function colorHex([r, g, b]) {
  return '#' + [r, g, b].map(color => color.toString(16).padStart(2, '0')).join('');
}

// Sample the actual rendered icon rather than assuming the label color matches it.
async function iconRGB(page, sources) {
  return page.evaluate(async paths => {
    return Promise.all(paths.map(async src => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 24;
      canvas.height = image.naturalHeight || 24;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colors = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250) continue;
        const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
        colors.set(color, (colors.get(color) || 0) + 1);
      }
      return [...colors].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    }));
  }, sources);
}

test('Four Web and native tabs preserve destinations and share the selected and inactive palette', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-bottom-nav-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const { createServer } = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'), cacheDir: temp, server: { host: '127.0.0.1', port: 0 } });
  t.after(() => vite.close());
  await vite.listen();
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon';
  const { CHROME_PATH } = process.env;
  const browser = await chromium.launch(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await page.route('**/marathon/api/**', route => route.fulfill({ json: {} }));
  await page.goto(base + '/');
  const links = page.getByRole('navigation', { name: '主导航' }).getByRole('link');
  await links.last().waitFor();
  assert.deepEqual(await links.allTextContents(), items.map(item => item[0]));
  assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname)), items.map(item => '/marathon' + item[1]));

  const mini = path.join(root, 'miniprogram');
  const { tabBar } = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  assert.deepEqual(tabBar.list.map(item => [item.text, item.pagePath]), items.map(([label, , destination]) => [label, destination]));
  await t.test('Native text and existing PNG icons use identical colors', async () => {
    const sources = tabBar.list.flatMap(item => [item.iconPath, item.selectedIconPath]).map(file => 'data:image/png;base64,' + fs.readFileSync(path.join(mini, file), 'base64'));
    const iconColors = await iconRGB(page, sources);
    assert.deepEqual({ text: [tabBar.color, tabBar.selectedColor], icons: iconColors }, {
      text: [colorHex(inactive), colorHex(active)],
      icons: items.flatMap(() => [inactive, active])
    });
  });

  await t.test('All Web routes change precisely one text label and icon', async () => {
    for (let current = 0; current < items.length; current++) {
      await links.nth(current).click();
      await page.waitForURL(base + items[current][1]);
      const labels = await links.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
      const icons = await iconRGB(page, await links.evaluateAll(nodes => nodes.map(node => node.querySelector('img').src)));
      const colors = items.map((_, index) => index === current ? active : inactive);
      assert.deepEqual({ labels, icons }, { labels: colors.map(color => 'rgb(' + color.join(', ') + ')'), icons: colors });
    }
  });
});
