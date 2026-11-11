'use strict';
/* Default is strictly read-only planning. --rehearse copies the supplied DB
 * before starting an isolated API. --apply targets only a loopback deployment.
 * No credentials, database backups or journals are written into this repository.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.env.SCENARIO_APP_ROOT || path.join(__dirname, '..'));
const Database = require(path.join(ROOT, 'server/node_modules/better-sqlite3'));
const fixtures = require('./fixtures/member-showcase-scenarios.cjs');
const verify = require('./fixtures/verify-member-showcase.cjs');
const CREATED = '2026-11-10T14:49:00.392Z';
const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1]; };
const hash = row => crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function cohort(db, manifest) {
  assert.equal(manifest.length, 200, 'Original 200-account cohort manifest is required');
  const users = db.prepare('SELECT * FROM users WHERE id BETWEEN 8 AND 207 ORDER BY id').all();
  assert.equal(users.length, 200);
  users.forEach((u, index) => {
    assert.equal(u.id, index + 8); assert.equal(u.nickname, '测试跑者' + String(index + 1).padStart(3, '0'));
    assert.equal(u.created_at, CREATED); assert.ok(manifest.some(m => Number(m.id) === u.id && m.nickname === u.nickname));
    u.index = index;
  });
  const clubs = db.prepare('SELECT * FROM clubs WHERE id BETWEEN 13 AND 22 ORDER BY id').all();
  assert.equal(clubs.length, 10); assert.ok(clubs.every(c => c.owner_id === 1));
  return { users, clubs, owner: db.prepare('SELECT * FROM users WHERE id=1').get() };
}
function noSecrets(value) {
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert.ok(!/token|password|secret|openid|authorization/i.test(key), 'Credentials must not be persisted'); noSecrets(child);
  }
  return value;
}
function protectedRows(db) {
  const result = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!/^\w+$/.test(name)) continue;
    result[name] = db.prepare('SELECT rowid AS __rowid,* FROM ' + name).all().map(row => {
      const allowed = name === 'club_members' && row.user_id >= 8 && row.user_id <= 207 && row.club_id >= 13 && row.club_id <= 22;
      const allowIntro = name === 'users' && row.id >= 8 && row.id <= 207;
      if (allowed) delete row.mileage_group_id;
      if (allowIntro) delete row.introduction;
      return { id: row.__rowid, hash: hash(row), allowGroup: allowed, allowIntro };
    });
  }
  return result;
}
function checkProtected(db, baseline) {
  const report = { checked: 0, altered: [] };
  for (const [table, rows] of Object.entries(baseline)) for (const before of rows) {
    const now = db.prepare('SELECT rowid AS __rowid,* FROM ' + table + ' WHERE rowid=?').get(before.id);
    if (now && before.allowGroup) delete now.mileage_group_id;
    if (now && before.allowIntro) delete now.introduction;
    report.checked++;
    if (!now || hash(now) !== before.hash) report.altered.push({ table, rowId: before.id });
  }
  assert.equal(report.altered.length, 0, 'Existing rows changed: ' + JSON.stringify(report.altered.slice(0, 12)));
  return report;
}
function assertNewRow(db, existingIds, table, id) {
  assert.ok(existingIds[table] && /^\w+$/.test(table));
  const row = db.prepare('SELECT rowid AS rid FROM ' + table + ' WHERE id=?').get(id);
  assert.ok(row && !existingIds[table].has(row.rid), 'Refuse to mutate pre-existing ' + table + ' row ' + id);
}
async function main() {
  const apply = args.includes('--apply'), rehearse = args.includes('--rehearse');
  assert.ok(!(apply && rehearse), 'Choose --apply or --rehearse');
  const sourceFile = path.resolve(option('--database') || '/tmp/missing-showcase-db');
  const manifestFile = path.resolve(option('--cohort-manifest') || '/tmp/missing-cohort-manifest');
  assert.ok(fs.existsSync(sourceFile) && fs.existsSync(manifestFile), '--database and --cohort-manifest are required existing files');
  const runDir = path.resolve(option('--run-dir') || '/tmp/marathon-member-showcase-20261111');
  assert.ok(!runDir.startsWith(ROOT + path.sep), 'Journals/backups must stay outside repository');
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 }); fs.chmodSync(runDir, 0o700);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  let db = new Database(sourceFile, { readonly: true, fileMustExist: true }), server;
  const identified = cohort(db, manifest), date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const plan = { batch: 'member-showcase-20261111-v1', mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run', users: 200, clubs: 10,
    source: sourceFile, date, runDates: fixtures.periods(date), minimumNewRuns: fixtures.periods(date).length * 200,
    races: 6, introductions: 200, wantedPlans: 200, drawnPlans: 200, results: 800,
    memberships: db.prepare('SELECT COUNT(*) n FROM club_members WHERE user_id BETWEEN 8 AND 207 AND club_id BETWEEN 13 AND 22').get().n,
    existingGroups: db.prepare('SELECT club_id AS clubId,COUNT(*) AS groups FROM mileage_groups WHERE club_id BETWEEN 13 AND 22 GROUP BY club_id').all(),
    includeSimulatedHistory: args.includes('--include-simulated-history'),
    exclusions: ['真人资料及记录', '旧跑量记录/规则/入团日期', '私人跑史及媒体公开', '真实报名支付或官方认证', '外部消息及第三方同步'] };
  noSecrets(plan); fs.writeFileSync(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600 });
  if (!apply && !rehearse) { db.close(); process.stdout.write(JSON.stringify(plan, null, 2) + '\n'); return; }
  if (rehearse) {
    const copy = path.join(runDir, 'rehearsal.sqlite');
    if (!fs.existsSync(copy)) await db.backup(copy);
    db.close();
    const sourceMedia = option('--source-media');
    if (sourceMedia && !fs.existsSync(path.join(runDir, 'media'))) fs.cpSync(path.resolve(sourceMedia), path.join(runDir, 'media'), { recursive: true });
    const admin = crypto.randomBytes(32).toString('hex');
    Object.assign(process.env, { NODE_ENV: 'test', MARATHON_DB: copy, MARATHON_MEDIA: path.join(runDir, 'media'), ADMIN_TOKEN: admin, BASE_PATH: '/marathon', PORT: '0' });
    const originalExists = fs.existsSync;
    fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : originalExists(file);
    let app; try { ({ app } = require(path.join(ROOT, 'server/src/index'))); } finally { fs.existsSync = originalExists; }
    db = require(path.join(ROOT, 'server/src/db')).getDb();
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    await execute(db, { ...plan, database: copy, origin: 'http://127.0.0.1:' + server.address().port, admin, mediaRoot: process.env.MARATHON_MEDIA });
  } else {
    const env = {};
    for (const line of fs.readFileSync(option('--env-file') || path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    const origin = option('--origin') || 'http://127.0.0.1:3790', url = new URL(origin);
    assert.ok(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/', 'Apply accepts only a loopback HTTP origin');
    const admin = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN; assert.ok(admin, 'Existing admin bearer is required');
    await execute(db, { ...plan, database: sourceFile, origin, admin, mediaRoot: env.MARATHON_MEDIA || path.join(ROOT, 'server/data/media') });
  }
  async function execute(targetDb, config) {
    const stateFile = path.join(runDir, 'ledger.json');
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { batch: plan.batch, anchor: new Date().toISOString(), steps: {}, setups: [] };
    const binding = { database: fs.realpathSync(config.database), mode: config.mode, history: config.includeSimulatedHistory };
    if (state.binding) assert.deepEqual(state.binding, binding, 'Use a distinct run-dir per database/mode/options'); else state.binding = binding;
    const save = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(noSecrets(state), null, 2), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); };
    save();
    const baselineFile = path.join(runDir, 'baseline.json');
    const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile)) : protectedRows(targetDb);
    // Upgrade only a proven-unchanged older rehearsal baseline. This does not
    // silently rebaseline mutated user rows or discard protection of any field.
    if (baseline.users.some(row => !Object.hasOwn(row, 'allowIntro'))) {
      checkProtected(targetDb, baseline);
      for (const row of baseline.users) {
        const current = targetDb.prepare('SELECT rowid AS __rowid,* FROM users WHERE rowid=?').get(row.id);
        row.allowIntro = current.id >= 8 && current.id <= 207;
        if (row.allowIntro) { delete current.introduction; row.hash = hash(current); }
      }
      fs.writeFileSync(baselineFile, JSON.stringify(baseline), { mode: 0o600 });
    }
    const existingIds = Object.fromEntries(Object.entries(baseline).map(([table, rows]) => [table, new Set(rows.map(row => row.id))]));
    if (!fs.existsSync(baselineFile)) fs.writeFileSync(baselineFile, JSON.stringify(baseline), { mode: 0o600 });
    const actors = cohort(targetDb, manifest), nowMs = Date.parse(state.anchor), requests = { reads: 0, writes: 0 };
    const api = async (method, route, actor, body, expected = 200) => {
      assert.ok(/^\/(admin\/races(?:\/[^/?]+)?|runs|me\/introduction|me\/races\/[^/?]+(?:\/result)?|clubs\/\d+\/(?:training-groups(?:\/[^/?]+)?(?:\/\d+)?|mileage\/runs\/\d+\/decision|mileage\/board|members\/\d+\/profile|activities(?:\/\d+)?(?:\/(?:media|cover))?))(?:\?.*)?$/.test(route), 'Route outside showcase allowlist: ' + route);
      if (/^\/clubs\//.test(route)) assert.ok(actors.clubs.some(c => route.startsWith('/clubs/' + c.id + '/')));
      if (actor && typeof actor !== 'string') assert.ok(actor.id === 1 || actors.users.some(u => u.id === actor.id));
      const headers = { Authorization: 'Bearer ' + (typeof actor === 'string' ? actor : actor.token) };
      const options = { method, headers, signal: AbortSignal.timeout(45000) };
      if (body instanceof FormData) options.body = body;
      else if (body != null) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
      const response = await fetch(config.origin + '/marathon/api' + route, options);
      const data = await response.json().catch(() => ({}));
      requests[method === 'GET' ? 'reads' : 'writes']++;
      assert.equal(response.status, expected, method + ' ' + route + ' returned ' + response.status + ': ' + JSON.stringify(data).slice(0, 400));
      return data;
    };
    const ctx = { db: targetDb, ...actors, admin: config.admin, api, nowMs, mediaRoot: config.mediaRoot, origin: config.origin,
      assertNewRow: (table, id) => assertNewRow(targetDb, existingIds, table, id),
      includeSimulatedHistory: config.includeSimulatedHistory, day: (offset = 0) => new Date(nowMs + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10),
      stamp: (offset = 0, time = '07:00') => new Date(nowMs + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10) + 'T' + time,
      members: id => actors.users.filter(u => targetDb.prepare('SELECT 1 FROM club_members WHERE club_id=? AND user_id=?').get(id, u.id)),
      once: async (key, fn) => { if (Object.hasOwn(state.steps, key)) return state.steps[key]; const result = noSecrets(await fn()); state.steps[key] = result; save(); return result; },
      recordSetup: (name, details) => { state.setups.push({ name, details: noSecrets(details) }); save(); },
      progress: (kind, current, total) => process.stdout.write(JSON.stringify({ stage: kind, current, total }) + '\n'),
      art: Object.fromEntries(['park', 'track', 'trail', 'medal'].map(name => [name, fs.readFileSync(path.join(__dirname, 'fixtures/member-art', name + '.png'))])) };
    ctx.upload = (route, actor, bytes, name) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), name); return api('POST', route, actor, form); };
    const report = { ...plan, completed: false, anchor: state.anchor };
    try {
      report.seed = await fixtures(ctx);
      report.verification = await verify({ ...ctx, seedReport: report.seed });
      report.protectedRows = checkProtected(targetDb, baseline);
      report.completed = report.verification.failed === 0;
      report.journalSteps = Object.keys(state.steps).length;
      report.requests = requests;
      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(noSecrets(report), null, 2), { mode: 0o600 });
      assert.ok(report.completed, 'Verification failed; see report.json');
      process.stdout.write(JSON.stringify({ completed: true, checks: report.verification.checks.length, requests, journalSteps: report.journalSteps, report: path.join(runDir, 'report.json') }) + '\n');
    } catch (error) {
      report.error = error.message; report.requests = requests;
      fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(noSecrets(report), null, 2), { mode: 0o600 });
      throw error;
    }
  }
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; process.exit(1); });
module.exports = { cohort, noSecrets, protectedRows, checkProtected, assertNewRow };
