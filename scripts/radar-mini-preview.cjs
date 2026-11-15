/* Browser mirrors of current WXML/WXSS. This is not WeChat device validation.
 * Authenticated scenes load the real API backed by an isolated synthetic DB;
 * no-API scenes execute the Page's own bundled demonstration fallback. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const route = 'pages/radar/radar';
const cases = [
  'base', 'native-buttons', 'female', 'empty', 'loading', 'error',
  'no-api-preview', 'detail-history', 'detail-year', 'detail-competition'
].map(scenario => ({ route, scenario }));

async function prepare(_route, _initialData, scenario) {
  let definition;
  const calls = [];
  let failReload = false;
  let releaseLoading;
  const loadingGate = scenario === 'loading' ? new Promise(resolve => { releaseLoading = resolve; }) : null;
  const offline = scenario === 'no-api-preview';
  const origin = process.env.RADAR_MINI_API_ORIGIN;
  if (!origin) throw new Error('Run node scripts/radar-mini-preview.cjs to start its isolated API first.');
  const request = async (endpoint, method = 'GET', body) => {
    calls.push({ endpoint, method });
    if (offline) throw new Error('Injected API unavailability for bundled preview validation');
    if (failReload) throw new Error('赛事资料暂时无法加载，请稍后重试。');
    if (loadingGate) await loadingGate;
    const response = await fetch(origin + '/marathon/api' + endpoint, { method, headers: { Authorization: 'Bearer radar-mini-preview-token', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'API failed'), { status: response.status });
    return data;
  };
  const app = { globalData: { token: 'radar-mini-preview-token', baseUrl: origin } };
  const source = fs.readFileSync(path.join(root, 'miniprogram', route + '.js'), 'utf8');
  const wx = new Proxy({ pageScrollTo() {}, setNavigationBarTitle() {}, stopPullDownRefresh() {}, getStorageSync() { return ''; } }, { get: (target, key) => target[key] || (() => {}) });
  vm.runInNewContext(source, { Page(value) { definition = value; }, getApp: () => app, wx, console, Date, Promise, setTimeout, clearTimeout,
    require(name) { if (name === '../../utils/request') return { request, ready: () => Boolean(app.globalData.token) }; return require(path.resolve(root, 'miniprogram/pages/radar', name)); }
  }, { filename: route + '.js' });
  const page = { ...definition, data: clone(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = clone(value); } } };
  if (page.onLoad) page.onLoad({});
  const initialLoad = page.onShow();
  // Capture the real pending-request state, then release/await it so this
  // fixture never leaves unresolved work or a database request behind.
  if (scenario === 'loading') {
    const loadingData = clone(page.data);
    releaseLoading();
    await initialLoad;
    return { data: loadingData, components: {}, css: '' };
  }
  await initialLoad;
  await new Promise(resolve => setImmediate(resolve));
  if (scenario === 'female') {
    const originalProfile = { gender: page.data.gender, birth: page.data.birth, province: page.data.province, targets: clone(page.data.targets) };
    page.setGender({ currentTarget: { dataset: { gender: '女' } } });
    // Real API comparisons are computed for the saved profile. Exercise the
    // complete submit/refresh path rather than inventing female response rows.
    await page.save();
    await request('/me/radar', 'PUT', originalProfile);
  }
  if (scenario === 'empty') page.setDistance({ currentTarget: { dataset: { distance: '10k' } } });
  if (scenario === 'error') {
    failReload = true;
    await page.load();
  }
  if (scenario.startsWith('detail')) {
    const row = (page.data.filtered || page.data.rows || [])[0];
    if (!row) throw new Error('No race in actual Page response for detail mirror');
    page.openDetail({ currentTarget: { dataset: { id: row.id } } });
    if (scenario === 'detail-year') {
      const previous = page.data.selected.histories[1];
      if (!previous) throw new Error('The seeded detail fixture must have a previous edition');
      page.chooseYear({ currentTarget: { dataset: { year: previous.year } } });
    }
    if (scenario === 'detail-competition' && page.setDetailTab) page.setDetailTab({ currentTarget: { dataset: { tab: 'competition' } } });
  }
  // The shared mirror resets native buttons. Reintroduce only generic native
  // sizing defaults in this scene: more-specific page rules still win. This
  // catches unbounded 100%-width buttons squeezing adjacent Chinese labels.
  const nativeButtonDefaults = scenario === 'native-buttons'
    ? 'button { width:100%; margin-left:auto; margin-right:auto; }'
    : '';
  return { data: page.data, components: {}, css: nativeButtonDefaults };
}

async function audit({ page, scenario, data, metrics, width }) {
  const errors = [];
  const text = await page.locator('body').innerText();
  if (scenario === 'base' && !text.includes('模拟')) errors.push('Live API seed scene must retain a visible simulated-data label');
  if (scenario === 'no-api-preview' && !text.includes('示例') && !text.includes('演示') && !text.includes('模拟')) errors.push('The no-API fallback must visibly identify demonstration data');
  if (scenario === 'no-api-preview' && !(data.filtered || []).length) errors.push('The unavailable-API demonstration must contain selectable race examples');
  if (scenario === 'female' && (data.gender !== '女' || !data.filtered.length || data.filtered.some(row => row.gender !== '女'))) errors.push('The actual gender handler must render female-only race comparisons');
  if (scenario === 'empty' && (!text.includes('暂未收录') || data.filtered.length)) errors.push('An unavailable distance must retain an honest empty state');
  if (scenario === 'loading' && (!data.loading || !text.includes('正在比较赛事资料'))) errors.push('A pending real request must show a loading state');
  if (scenario === 'error' && (!text.includes('重新加载') || !text.includes('暂时无法加载') || !data.filtered.length)) errors.push('A failed refresh must offer retry while retaining previously loaded races');

  const layout = await page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const visible = element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const describe = element => ({
      text: element.textContent.trim().slice(0, 40),
      class: element.className,
      ...rect(element),
      fontSize: parseFloat(getComputedStyle(element).fontSize)
    });
    const labels = [...document.querySelectorAll('.condition-row > span:first-child,.results-title')].filter(visible).map(element => {
      // Text node rectangles reveal actual wrapping even when a flex parent
      // stretches the containing label to match a taller neighbour.
      const tops = new Set();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) if (box.width) tops.add(Math.round(box.top));
      }
      return { ...describe(element), textLines: tops.size };
    });
    const controls = [...document.querySelectorAll('.radar-page button,.radar-page input')].filter(visible).map(describe);
    const inputs = [...document.querySelectorAll('.time-inputs input')].map(describe);
    const time = document.querySelector('.time-inputs');
    const action = document.querySelector('.search-action');
    const condition = document.querySelector('.condition-row > span:first-child');
    const genders = document.querySelector('.gender-switch');
    const heading = document.querySelector('.results-title');
    const filters = document.querySelector('.list-filters');
    return {
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      labels, controls, inputs,
      time: time && rect(time), action: action && rect(action),
      condition: condition && rect(condition), genders: genders && rect(genders),
      heading: heading && rect(heading), filters: filters && rect(filters)
    };
  });
  metrics.radarLayout = layout;
  if (layout.scrollWidth > width) errors.push('Radar must fit the viewport including native-button stress defaults');
  // A count in the results heading can have a smaller font/baseline, so allow
  // two distinct top coordinates there but never enough height for two lines.
  for (const label of layout.labels) {
    const maxLines = label.class === 'results-title' ? 2 : 1;
    if (label.textLines > maxLines || label.height > label.fontSize * 1.9) errors.push('Heading/target label wraps vertically: ' + JSON.stringify(label));
  }
  for (const control of layout.controls) {
    if (control.height < 43.5) errors.push('A visible control is shorter than the 44px touch target: ' + JSON.stringify(control));
    if (control.width < 43.5) errors.push('A visible control is narrower than the 44px touch target: ' + JSON.stringify(control));
    if (control.left < -0.5 || control.right > width + 0.5) errors.push('A visible control exceeds the viewport: ' + JSON.stringify(control));
    if (control.fontSize < 12) errors.push('A visible control has text smaller than 12px: ' + JSON.stringify(control));
  }
  if (layout.condition && layout.genders && layout.condition.right > layout.genders.left - 3) errors.push('Target label collides with the gender selector');
  if (layout.heading && layout.filters && layout.heading.right > layout.filters.left - 3) errors.push('Results heading collides with result filters');
  if (layout.time && layout.action) {
    if (layout.action.top < layout.time.bottom - 0.5) errors.push('The primary search action must sit below the complete time input row');
    if (layout.action.width < layout.time.width - 1) errors.push('The primary search action must span the time input row width');
    for (const input of layout.inputs) {
      if (input.width < 38 || input.left < layout.time.left - 0.5 || input.right > layout.time.right + 0.5) errors.push('A time input is squeezed or extends outside its row: ' + JSON.stringify(input));
    }
    if (scenario === 'loading' && !await page.locator('.search-action').isDisabled()) errors.push('Search must be disabled while initial data is loading');
  }
  if (scenario === 'detail-history' || scenario === 'detail-year') {
    const history = page.locator('.history-card').first();
    const rankRows = page.locator('.history-card .rank-row:not(.rank-head)');
    if (await rankRows.count() !== 8) errors.push('A history edition must render all eight rank slots');
    if (scenario === 'detail-year' && !text.includes(String(data.selectedYear))) errors.push('The chosen previous edition must remain visible');
    if (await history.count()) await history.evaluate(element => element.scrollIntoView({ block: 'start' }));
  }
  if (scenario === 'detail-competition') {
    const entrant = page.locator('.entrant').first();
    if (!await entrant.count() || !text.includes('模拟跑者')) errors.push('The real seeded API must populate the competition detail');
    if (await entrant.count()) await entrant.evaluate(element => (element.closest('.card') || element).scrollIntoView({ block: 'start' }));
  }
  return errors;
}
module.exports = { cases, prepare, audit };

if (require.main === module) {
  (async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-radar-mini-'));
    process.env.MARATHON_DB = path.join(temporary, 'app.sqlite');
    process.env.MARATHON_MEDIA = path.join(temporary, 'media');
    process.env.NODE_ENV = 'test'; process.env.BASE_PATH = '/marathon';
    const { getDb } = require('../server/src/db');
    const { seedRadarDemo } = require('./seed-radar-demo.cjs');
    const { app } = require('../server/src/index');
    const db = getDb(); seedRadarDemo(db);
    const user = db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('源码镜像验收', 'radar-mini-preview-token', new Date().toISOString());
    db.prepare("INSERT INTO radar_profiles(user_id,gender,target_full) VALUES(?,'男',8400)").run(user.lastInsertRowid);
    const server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
    const out = path.resolve(root, process.env.RADAR_MINI_OUT || 'design/previews/radar-redesign-20261115');
    fs.mkdirSync(out, { recursive: true });
    try {
      const sourceAudit = path.join(root, 'design/previews/mini-ui-source-audit.cjs');
      // Reuse the existing renderer without changing its checked-in defaults.
      const code = `const fs=require('fs'),path=require('path'),Module=require('module');const file=${JSON.stringify(sourceAudit)};const code=fs.readFileSync(file,'utf8').replace('height:900','height:753').replace('fullPage:true','fullPage:false');const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(code,file);`;
      const status = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', code], { cwd: root, env: { ...process.env, RADAR_MINI_API_ORIGIN: 'http://127.0.0.1:' + server.address().port, MINI_AUDIT_FIXTURE: 'scripts/radar-mini-preview.cjs', MINI_AUDIT_ROUTES: route, UI_AUDIT_OUT: path.relative(root, out), UI_AUDIT_REPORT: path.relative(root, path.join(out, 'mini-report.json')) }, stdio: 'inherit' });
        child.on('error', reject); child.on('exit', resolve);
      });
      const reportPath = path.join(out, 'mini-report.json');
      if (fs.existsSync(reportPath)) { const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); report.provenance = 'Current Page methods, WXML and WXSS rendered in Chromium at 320×753 and 390×753. Authenticated scenes use a real isolated API with synthetic seeds; loading captures a held request, error injects a failed refresh, and the unavailable-API scene uses the bundled preview. Native-button sizing is a browser stress fixture, not a WeChat simulator or device test.'; fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
      if (status !== 0) process.exitCode = status || 1;
    } finally { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
