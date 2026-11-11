// Current activity-create WXML/WXSS source mirror, driven by the actual Page handlers and isolated in-memory fixture.
// This is not a WeChat simulator or device screenshot.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const mini = path.join(root, 'miniprogram');
const expectedAccent = (process.env.UI_EXPECTED_ACCENT || '#ff1838').toLowerCase();
if (!/^#[0-9a-f]{6}$/.test(expectedAccent)) throw new Error('UI_EXPECTED_ACCENT must be a six-digit hex color');
const out = path.resolve(root, process.env.UI_AUDIT_OUT || 'design/previews/activity-templates-20261110');
const reportFile = process.env.UI_AUDIT_REPORT ? path.resolve(root, process.env.UI_AUDIT_REPORT) : path.join(out, 'mini-mirror-report.json');
const scenarios = ['fresh','draft','groups','sheet','new-template','preview','member','template-error','template-empty','long-name','save-error'];
const { createFixture, event } = require('./activity-template-fixture.cjs');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(root, 'node_modules/playwright-core'));
const postcss = require(path.join(root, 'web/node_modules/postcss'));
const files = { js: path.join(mini, 'pages/activity-create/activity-create.js'), wxml: path.join(mini, 'pages/activity-create/activity-create.wxml'), wxss: path.join(mini, 'pages/activity-create/activity-create.wxss') };
const source = fs.readFileSync(files.wxml, 'utf8');
const definition = createFixture().page;
const handlers = [...source.matchAll(/(?:bind|catch)(?::?[\w-]+)\s*=\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
const missingHandlers = [...new Set(handlers.filter(name => !name.includes('{{') && typeof definition[name] !== 'function'))];
if (missingHandlers.length) throw Error('Missing WXML event handlers: ' + missingHandlers.join(', '));

function cssFor(file, seen = new Set()) {
  if (seen.has(file)) return '';
  seen.add(file);
  return fs.readFileSync(file, 'utf8').replace(/@import\s+['"]([^'"]+)['"];?/g, (_, name) => cssFor(path.resolve(path.dirname(file), name), seen));
}
const nativeTags = { page: 'body', view: 'div', text: 'span', navigator: 'a', 'scroll-view': 'div', image: 'img', picker: 'div', checkbox: 'input', 'checkbox-group': 'div', radio: 'input', 'radio-group': 'div', swiper: 'div', 'swiper-item': 'div', canvas: 'div', switch: 'span' };
function cssAt(width) {
  const sheet = postcss.parse(cssFor(path.join(mini, 'app.wxss')) + '\n' + cssFor(files.wxss));
  sheet.walkRules(rule => {
    for (const [tag, html] of Object.entries(nativeTags)) rule.selector = rule.selector.replace(new RegExp('(?<![.#\\w-])' + tag + '(?![\\w-])', 'g'), html);
  });
  return sheet.toString().replace(/(-?[\d.]+)rpx/g, (_, number) => Number(number) * width / 750 + 'px');
}
const assets = {};
function addAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) addAssets(file);
    else if (/\.(png|svg|jpe?g|webp)$/.test(file)) {
      const ext = path.extname(file).slice(1);
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
      assets['/' + path.relative(mini, file).split(path.sep).join('/')] = 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
    }
  }
}
addAssets(path.join(mini, 'images'));
async function fixture(scenario) {
  const f=createFixture({staff:scenario!=='member'});if(scenario==='template-empty')f.db.templates=[];if(scenario==='template-error'){let original;original=f.setHandler((url,method,...args)=>/activity-templates$/.test(url)&&(!method||method==='GET')?Promise.reject(Error('此功能暂不可用（HTTP 404），请联系管理员确认服务已更新。')):original(url,method,...args));}await f.load();
  const p=f.page;
  if(scenario==='draft') {p.input(event({key:'title'},'周三的未完成训练'));p.saveDraft();}
  if(scenario==='groups'||scenario==='preview'||scenario==='sheet'||scenario==='save-error'){
    p.useTemplate(event({source:'saved',id:91}));p.pickDate(event({key:'startDate'},'2026-11-14'));
    if(scenario==='groups'||scenario==='preview'){p.next();if(scenario==='preview'){p.groupInput(event({index:0,key:'capacity'},'0'));p.next();}}
    if(scenario==='sheet'||scenario==='save-error'){p.saveTemplate();p.inputTemplateName(event({},'周三间歇训练'));if(scenario==='save-error'){f.setHandler(()=>Promise.reject(Object.assign(Error('服务暂时不可用（HTTP 503），请稍后重试。'),{status:503})));await p.confirmSaveTemplate();}}
  }
  if(scenario==='new-template'){p.newTemplate();p.input(event({key:'title'},'周末长距离'));p.useTemplate(event({source:'preset',id:'long'}));p.toggleExtra();p.input(event({key:'gatherAt'},'提前 10 分钟'));}
  if(scenario==='long-name')p.setData({club:{...p.data.club,name:'杭州西湖城市马拉松与周末长距离训练一起向前跑俱乐部'},draft:{...p.data.draft,title:'周末城市绿道长距离与配速分组的共同训练安排'}});
  return JSON.parse(JSON.stringify(p.data));
}

async function render(page, data) {
  return page.evaluate(({ source, data, assets, nativeTags }) => {
    const template = document.createElement('template');
    template.innerHTML = source.replace(/<([\w-]+)([^<>]*?)\s*\/>/g, '<$1$2></$1>');
    const errors = [];
    function evaluate(raw, scope) {
      const expression = raw.replace(/^{{|}}$/g, '');
      try {
        return Function('scope', 'with(scope){return (' + expression + ')}')(new Proxy(scope, {
          has: () => true, get: (target, key) => key === Symbol.unscopables ? undefined : target[key]
        }));
      } catch (error) { errors.push({ expression, error: error.message }); return undefined; }
    }
    function textValue(value, scope) { return value.replace(/{{([\s\S]*?)}}/g, (_, expression) => { const result = evaluate(expression, scope); return result == null ? '' : String(result); }); }
    function children(parent, scope) {
      const fragment = document.createDocumentFragment();
      let branch = null;
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { fragment.append(document.createTextNode(textValue(child.textContent, scope))); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        // WeChat expands a loop before evaluating its same-node condition.
        if (child.hasAttribute('wx:for')) { fragment.append(node(child, scope)); branch = null; continue; }
        const condition = child.getAttribute('wx:if'), elseif = child.getAttribute('wx:elif'), otherwise = child.hasAttribute('wx:else');
        let show = true;
        if (condition !== null) { show = !!evaluate(condition, scope); branch = show; }
        else if (elseif !== null) { show = branch === false && !!evaluate(elseif, scope); branch = !!branch || show; }
        else if (otherwise) { show = branch === false; branch = true; }
        else branch = null;
        if (show) fragment.append(node(child, scope, true));
      }
      return fragment;
    }
    function node(element, scope, conditionHandled = false) {
      if (element.hasAttribute('wx:for')) {
        const fragment = document.createDocumentFragment(), items = evaluate(element.getAttribute('wx:for'), scope) || [];
        for (const [index, item] of Array.from(items).entries()) {
          const clone = element.cloneNode(true); clone.removeAttribute('wx:for');
          const local = { ...scope, [element.getAttribute('wx:for-item') || 'item']: item, [element.getAttribute('wx:for-index') || 'index']: index };
          fragment.append(node(clone, local));
        }
        return fragment;
      }
      if (!conditionHandled && element.hasAttribute('wx:if') && !evaluate(element.getAttribute('wx:if'), scope)) return document.createDocumentFragment();
      const tag = element.tagName.toLowerCase();
      if (tag === 'block') return children(element, scope);
      const result = document.createElement(nativeTags[tag] || tag);
      for (const attr of element.attributes) {
        if (/^(wx:|bind|catch)/.test(attr.name)) continue;
        let value = textValue(attr.value, scope);
        if (attr.name === 'src') value = assets[value] || value;
        if (attr.name === 'value' && (tag === 'input' || tag === 'textarea')) { result.value = value; if(tag==='input')result.setAttribute('value',value);else result.textContent=value;continue; }
        if (attr.name === 'disabled' && (!value || value === 'false')) continue;
        if (attr.name === 'url') { result.href = '#'; continue; }
        try { result.setAttribute(attr.name, value); } catch {}
      }
      if (!['image', 'input', 'textarea'].includes(tag)) result.append(children(element, scope));
      if(tag==='switch'){result.classList.add('native-switch');result.setAttribute('role','switch');}
      if (tag === 'image' && !result.getAttribute('src')) result.removeAttribute('src');
      return result;
    }
    document.body.append(children(template.content, data));
    return errors;
  }, { source, data, assets, nativeTags });
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { kind: 'Current activity-create WXML/WXSS browser source mirror; actual Page VM handlers with synthetic fixtures; not WeChat simulator/device. Native controls approximated.', source: files, expectedAccent, missingHandlers, results: [] };
  try {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 760 : 844 }, deviceScaleFactor: 1 });
      const network = [];
      await context.route(/^https?:\/\//, route => { network.push(route.request().url()); return route.abort(); });
      for (const scenario of scenarios) {
        const page = await context.newPage();
        await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}a{display:block;color:inherit;text-decoration:none}button{display:block;box-sizing:border-box;line-height:1.35;cursor:default}input,textarea{outline:none}img{display:inline-block;vertical-align:middle}*{box-sizing:border-box}.native-switch{display:inline-block;width:44px;height:26px;flex:none;border-radius:20px;background:#dedede;position:relative}.native-switch[checked=true]{background:' + expectedAccent + '}.native-switch:after{content:"";display:block;position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:white}.native-switch[checked=true]:after{left:20px}</style><style>' + cssAt(width) + '</style></head><body></body></html>');
        const expressionErrors = await render(page, await fixture(scenario));
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))));
        const metrics = await page.evaluate(() => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.body.scrollHeight,
          brokenImages: [...document.images].filter(image => image.getAttribute('src') && !image.naturalWidth).map(image => image.getAttribute('src').slice(0, 80)),
          overflow: [...document.querySelectorAll('body *')].filter(element => { const rect = element.getBoundingClientRect(); return rect.width && (rect.right > innerWidth + 2 || rect.left < -2) && !element.closest('scroll-view,.template-scroll,.preset-scroll,.template-list'); }).slice(0, 20).map(element => ({ tag: element.tagName, class: element.className, text: element.textContent.trim().slice(0, 50), right: Math.round(element.getBoundingClientRect().right), left: Math.round(element.getBoundingClientRect().left) })),
          footer: [...document.querySelectorAll('.bottom-actions button')].map(el=>{const rect=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);return {text:el.textContent.trim(),width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,lines:[...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))};}),
          restore: [...document.querySelectorAll('.restore-line')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
          groupFields: [...document.querySelectorAll('input[data-key="name"],input[data-key="pace"]')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
          previewGroups: [...document.querySelectorAll('.preview-group')].map(el=>el.textContent.trim()),
          gatherAt: [...document.querySelectorAll('input[data-key="gatherAt"]')].map(el=>el.value)
        }));
        const name = 'mini-' + scenario + '-' + width;
        await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
        await page.screenshot({ path: path.join(out, name + '-viewport.png') });
        fs.writeFileSync(path.join(out, name + '.html'), await page.content());
        const layoutErrors=[];
        for(const button of metrics.footer){if(button.width<60||button.height>58||Math.max(...button.lines)-Math.min(...button.lines)>12)layoutErrors.push('Footer button wraps or is cramped: '+JSON.stringify(button));}
        for(const restore of metrics.restore){if(restore.height>150)layoutErrors.push('Restore card is too tall: '+JSON.stringify(restore));}
        for(const field of metrics.groupFields){if(field.width<80)layoutErrors.push('Group input is too narrow: '+JSON.stringify(field));}
        if(scenario==='preview'&&(!metrics.previewGroups.some(text=>text.includes('人数不限'))||metrics.previewGroups.some(text=>text.includes('0 人'))))layoutErrors.push('String zero capacity must preview as unlimited');
        if(scenario==='new-template'&&metrics.gatherAt[0]!=='提前 10 分钟')layoutErrors.push('Gathering hint must preserve free text');
        report.results.push({ scenario, ...metrics, expressionErrors, layoutErrors, network: [...network], passed: metrics.scrollWidth <= width && !metrics.brokenImages.length && !expressionErrors.length && !network.length && !layoutErrors.length });
        console.log(JSON.stringify(report.results.at(-1)));
        await page.close();
      }
      await context.close();
    }
  } finally { await browser.close(); }
  report.passed = report.results.length === scenarios.length * 2 && report.results.every(result => result.passed);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  const links = report.results.map(result => '<li>' + result.scenario + ' / ' + result.width + 'px · <a href="mini-' + result.scenario + '-' + result.width + '.png">整页</a> · <a href="mini-' + result.scenario + '-' + result.width + '-viewport.png">首屏</a> · <a href="mini-' + result.scenario + '-' + result.width + '.html">HTML</a></li>').join('');
  fs.writeFileSync(path.join(out, 'mini-index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>训练模板源码镜像</title><body><h1>训练发布与模板 · 小程序源码镜像</h1><p>当前 WXML/WXSS + 实际 Page VM handlers，使用合成展示资料，非微信模拟器或真机截图；所有 HTTP 请求均阻断，原生控件为浏览器近似表现。</p><ul>' + links + '</ul></body></html>');
  console.log('Mirror output: ' + out + '; passed=' + report.passed);
  if (!report.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
