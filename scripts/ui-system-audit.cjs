/* Repeatable, isolated UI review. Business data exists only in the disposable
 * SQLite created by ui-full-audit; admin transports are in-memory fixtures;
 * Mini previews read local sources and synthetic data without HTTP transport. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(ROOT, process.env.UI_AUDIT_OUT || 'design/previews/bright-ui-20261111');
const expectedAccent = (process.env.UI_EXPECTED_ACCENT || '#ff1838').toLowerCase();
if (!/^#[0-9a-f]{6}$/.test(expectedAccent)) throw new Error('UI_EXPECTED_ACCENT must be a six-digit hex color');
const selected = process.argv.slice(2);
const modes = selected.length ? selected : ['web', 'admin', 'mini'];
for (const mode of modes) if (!['web', 'admin', 'mini'].includes(mode)) throw new Error('Choose web, admin, and/or mini');
fs.mkdirSync(out, { recursive: true });
const summaryFile = path.join(out, 'summary.json');
const previous = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : null;
const report = { startedAt: new Date().toISOString(), kind: 'Isolated UI system review; no production requests or writes', output: out, requestedModes: modes, expectedAccent, scope: 'Palette adjustment and small visual refinements of existing pages; no layout rewrite', runs: previous?.runs || [] };

async function run(script, folder, reportName, extra = {}) {
  const reportFile = path.join(out, reportName);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, script)], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extra, UI_EXPECTED_ACCENT: expectedAccent, UI_AUDIT_OUT: path.join(out, folder), UI_AUDIT_REPORT: reportFile }
    });
    child.on('error', reject);
    child.on('exit', status => resolve(status));
  });
  report.runs = report.runs.filter(item => item.script !== script);
  report.runs.push({ script, exit: code, passed: code === 0, report: reportName });
}

async function admin() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-admin-ui-'));
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: {} } });
  try {
    await vite.listen();
    const env = { MARATHON_PREVIEW_URL: 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon' };
    await run('design/previews/admin-browser-regression.cjs', 'admin', 'admin-browser-report.json', env);
    await run('design/previews/admin-ui-full-audit.cjs', 'admin', 'admin-ui-full-audit-report.json', env);
  } finally {
    await vite.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

(async () => {
  if (modes.includes('web')) await run('scripts/ui-full-audit.cjs', 'web', 'web-report.json');
  if (modes.includes('admin')) await admin();
  if (modes.includes('mini')) {
    await run('design/previews/mini-ui-source-audit.cjs', 'mini', 'mini-report.json');
    await run('design/previews/activity-template-mini-mirror.cjs', 'mini-training', 'mini-training-report.json');
  }
})().catch(error => { report.error = error.stack; }).finally(async () => {
  report.finishedAt = new Date().toISOString();
  for (const run of report.runs) {
    const file = path.join(out, run.report);
    if (!fs.existsSync(file)) { run.passed = false; continue; }
    const detail = JSON.parse(fs.readFileSync(file, 'utf8'));
    run.passed = run.passed && detail.passed === true;
    run.checks = detail.checkCount || detail.checks?.length || detail.results?.length || 0;
    run.verifiedAt = fs.statSync(file).mtime.toISOString();
  }
  report.checkCount = report.runs.reduce((count, run) => count + run.checks, 0);
  report.passed = !report.error && report.runs.every(run => run.passed);
  try { report.comparisonCount = (await require('./ui-palette-comparison.cjs').generateComparisons(out, process.env.UI_PALETTE_PROFILE === 'colorful' ? { before: 'design/previews/bright-ui-20261111', labels: ['调整前 · 红白浅灰', '调整后 · 清爽点缀'] } : {})).pairs.length; }
  catch (error) { report.comparisonError = error.message; report.passed = false; }
  fs.writeFileSync(summaryFile, JSON.stringify(report, null, 2));
  const previousOut = process.env.UI_AUDIT_OUT;
  process.env.UI_AUDIT_OUT = out;
  if (process.env.UI_PALETTE_PROFILE === 'colorful') await require('./ui-colorful-gallery.cjs').generateColorfulGallery(out, { prepare: true });
  else require('./ui-audit-gallery.cjs');
  if (previousOut === undefined) delete process.env.UI_AUDIT_OUT;
  else process.env.UI_AUDIT_OUT = previousOut;
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
});
