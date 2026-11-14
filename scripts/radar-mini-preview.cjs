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
const cases = ['base', 'no-api-preview', 'detail-history', 'detail-competition'].map(scenario => ({ route, scenario }));

async function prepare(_route, _initialData, scenario) {
  let definition;
  const calls = [];
  const offline = scenario === 'no-api-preview';
  const origin = process.env.RADAR_MINI_API_ORIGIN;
  if (!origin) throw new Error('Run node scripts/radar-mini-preview.cjs to start its isolated API first.');
  const request = async (endpoint, method = 'GET', body) => {
    calls.push({ endpoint, method });
    if (offline) throw new Error('Injected API unavailability for bundled preview validation');
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
  await page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  if (scenario.startsWith('detail')) {
    const row = (page.data.filtered || page.data.rows || [])[0];
    if (!row) throw new Error('No race in actual Page response for detail mirror');
    page.openDetail({ currentTarget: { dataset: { id: row.id } } });
    if (scenario === 'detail-competition' && page.setDetailTab) page.setDetailTab({ currentTarget: { dataset: { tab: 'competition' } } });
  }
  return { data: page.data, components: {}, css: '' };
}

async function audit({ page, scenario, data }) {
  const errors = [];
  const text = await page.locator('body').innerText();
  if (scenario === 'base' && !text.includes('模拟')) errors.push('Live API seed scene must retain a visible simulated-data label');
  if (scenario === 'no-api-preview' && !text.includes('示例') && !text.includes('演示') && !text.includes('模拟')) errors.push('The no-API fallback must visibly identify demonstration data');
  if (scenario === 'no-api-preview' && !(data.filtered || []).length) errors.push('The unavailable-API demonstration must contain selectable race examples');
  if (scenario === 'detail-history') {
    const history = page.locator('.history-card').first();
    if (await history.count()) await history.evaluate(element => element.scrollIntoView({ block: 'start' }));
  }
  if (scenario === 'detail-competition') {
    const entrant = page.locator('.entrant').first();
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
    const out = path.join(root, 'design/previews/radar-redesign-20261114');
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
      if (fs.existsSync(reportPath)) { const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); report.provenance = 'Current Page methods, WXML and WXSS rendered in Chromium at 320×753 and 390×753. Authenticated scenes use a real isolated API with synthetic seeds; the unavailable-API scene uses the bundled preview. This is not a WeChat simulator or device test.'; fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
      if (status !== 0) process.exitCode = status || 1;
    } finally { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
