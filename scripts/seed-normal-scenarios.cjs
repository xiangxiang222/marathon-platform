/* Fill the previously created 200-account simulation cohort through real APIs.
 * Rehearse on a copied SQLite file first. Production requires --apply and a
 * loopback API; no remote provider, payment or notification calls are made.
 * Credentials and the resumable ledger stay outside the repository.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.env.SCENARIO_APP_ROOT || path.join(__dirname, '..'));
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1]; };
const apply = args.includes('--apply');
const dbFile = path.resolve(arg('--database') || '/tmp/missing-scenario-db');
const runDir = path.resolve(arg('--run-dir') || '/tmp/marathon-normal-scenario-run');
const manifestFile = arg('--cohort-manifest');
assert.ok(fs.existsSync(dbFile), 'An existing backup or production database is required');
assert.ok(manifestFile && fs.existsSync(manifestFile), 'Original cohort manifest is required');
assert.ok(apply || !dbFile.includes('/var/www/'), 'Production database requires --apply');
fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
fs.chmodSync(runDir, 0o700);
const stateFile = path.join(runDir, 'ledger.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {
  batch: 'normal-scenarios-20261111', anchor: new Date().toISOString(), steps: {}, setups: [], requests: 0
};
const save = () => {
  fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(stateFile + '.tmp', stateFile);
};
const binding = { database: fs.realpathSync(dbFile), apply, origin: apply ? (arg('--origin') || 'http://127.0.0.1:3790') : 'isolated' };
if (state.binding) assert.deepEqual(state.binding, binding, 'A scenario run-dir cannot be reused for a different database or mode');
else { state.binding = binding; save(); }
const safeResult = value => {
  const walk = obj => { if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) { assert.ok(!/token|password|secret|openid|authorization/i.test(k), 'Never persist credentials in the scenario ledger'); walk(v); }
  }; walk(value); return value == null ? null : value;
};
let db, appServer, origin, admin, mediaRoot;
const report = { batch: state.batch, applied: apply, anchor: state.anchor, stages: {}, checks: [], exclusions: ['真实支付和物流', '微信及设备授权', '官方认证与第三方同步', '政策同意与隐私权利申请'], requestsThisRun: 0 };
const hash = row => crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function snapshot() {
  const rows = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!/^[a-zA-Z_0-9]+$/.test(name)) continue;
    rows[name] = db.prepare('SELECT rowid AS _scenario_rowid, * FROM ' + name).all().map(row => ({ id: row._scenario_rowid, hash: hash(row), userId: row.user_id == null ? null : row.user_id,
      ...(row.club_id != null ? { clubId: row.club_id } : {}),
      ...(name === 'club_members' ? { joinedAt: row.joined_at } : {}) }));
  }
  return rows;
}
async function main() {
  if (apply) {
    const envFile = arg('--env-file') || path.join(ROOT, '.env');
    const env = {};
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) env[match[1]] = match[2];
    }
    admin = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN;
    mediaRoot = env.MARATHON_MEDIA || path.join(ROOT, 'server/data/media');
    origin = arg('--origin') || 'http://127.0.0.1:3790';
    const u = new URL(origin);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && u.protocol === 'http:', 'Only a loopback API is permitted');
    const Database = require(path.join(ROOT, 'server/node_modules/better-sqlite3'));
    db = new Database(dbFile); db.pragma('busy_timeout = 10000');
  } else {
    admin = crypto.randomBytes(32).toString('hex');
    Object.assign(process.env, { NODE_ENV: 'test', MARATHON_DB: dbFile, MARATHON_MEDIA: path.join(runDir, 'media'), BASE_PATH: '/marathon', ADMIN_TOKEN: admin, PORT: '0' });
    const existsSync = fs.existsSync;
    fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : existsSync(file);
    let app;
    try { ({ app } = require(path.join(ROOT, 'server/src/index'))); }
    finally { fs.existsSync = existsSync; }
    db = require(path.join(ROOT, 'server/src/db')).getDb();
    appServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    origin = 'http://127.0.0.1:' + appServer.address().port;
    mediaRoot = process.env.MARATHON_MEDIA;
  }
  assert.ok(admin, 'An existing administrative bearer is required');
  const original = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(original.length, 200);
  const users = db.prepare('SELECT * FROM users WHERE id BETWEEN 8 AND 207 ORDER BY id').all().map((u, index) => {
    assert.equal(u.id, index + 8); assert.equal(u.nickname, '测试跑者' + String(index + 1).padStart(3, '0'));
    assert.equal(u.created_at, '2026-11-10T14:49:00.392Z');
    assert.ok(original.some(m => Number(m.id) === u.id && m.nickname === u.nickname), 'Original manifest must match each account');
    return { ...u, index };
  });
  assert.equal(users.length, 200);
  const clubs = db.prepare('SELECT * FROM clubs WHERE id BETWEEN 13 AND 22 ORDER BY id').all();
  assert.equal(clubs.length, 10); assert.ok(clubs.every(c => c.owner_id === 1));
  const owner = db.prepare('SELECT * FROM users WHERE id=1').get();
  const baselineFile = path.join(runDir, 'baseline-hashes.json');
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile)) : snapshot();
  if (!fs.existsSync(baselineFile)) fs.writeFileSync(baselineFile, JSON.stringify(baseline), { mode: 0o600 });
  const nowMs = Date.parse(state.anchor);
  const day = (offset = 0) => new Date(nowMs + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const stamp = (offset = 0, time = '07:00') => day(offset) + 'T' + time;
  const api = async (method, route, actor, body, expected = 200) => {
    assert.ok(route.startsWith('/') && !route.includes('://'));
    assert.ok(!/^\/(auth|session|official)(\/|$)|privacy-requests|\/devices\/|\/recognize|\/reward\/claim|\/sync(?:\/|$)/.test(route), 'Provider/auth/consent operations are excluded: ' + route);
    const options = { method, headers: {}, signal: AbortSignal.timeout(30000) };
    if (actor) options.headers.Authorization = 'Bearer ' + (typeof actor === 'string' ? actor : actor.token);
    if (body instanceof FormData) options.body = body;
    else if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const response = await fetch(origin + '/marathon/api' + route, options);
    const data = await response.json().catch(() => ({}));
    state.requests++; report.requestsThisRun++;
    assert.equal(response.status, expected, method + ' ' + route + ': ' + response.status + ' ' + JSON.stringify(data).slice(0, 700));
    return data;
  };
  const ctx = { db, api, users, clubs, owner, admin, day, stamp, nowMs, mediaRoot, origin, tag: '【模拟】',
    members: clubId => users.filter(u => {
      const member = db.prepare('SELECT joined_at FROM club_members WHERE club_id=? AND user_id=?').get(clubId, u.id);
      return member && Date.parse(member.joined_at) <= nowMs;
    }),
    once: async (key, fn) => {
      if (Object.prototype.hasOwnProperty.call(state.steps, key)) return state.steps[key];
      const value = safeResult(await fn()); state.steps[key] = value; save(); return value;
    },
    recordSetup: (name, details) => {
      const value = { name, details: safeResult(details) };
      if (!state.setups.some(row => JSON.stringify(row) === JSON.stringify(value))) state.setups.push(value);
      save();
    },
    fixturePhoto: fs.readFileSync(path.join(__dirname, 'fixtures/scenario-training.png')),
  };
  ctx.upload = async (route, actor, bytes = ctx.fixturePhoto, name = 'scenario-training.png') => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), name);
    return api('POST', route, actor, form);
  };
  const { seedCatalog, seedCommunity } = require('./fixtures/catalog-scenarios.cjs');
  for (const [name, fn] of [
    ['catalog', async () => { ctx.catalog = await seedCatalog(ctx); return { pastRaces: ctx.catalog.pastRaces.length, futureRaces: ctx.catalog.futureRaces.length }; }],
    ['social', () => require('./fixtures/club-social-scenarios.cjs')(ctx)],
    ['memberships', () => require('./fixtures/club-membership-scenarios.cjs')(ctx)],
    ['clubs', () => require('./fixtures/club-scenarios.cjs')(ctx)],
    ['users', () => require('./fixtures/user-scenarios.cjs')(ctx)],
    ['community', () => seedCommunity(ctx)],
    ['verify', () => require('./fixtures/verify-scenarios.cjs')(ctx)],
    ['binary', async () => {
      const candidates = [];
      const activity = db.prepare("SELECT m.id FROM activity_media m JOIN activities a ON a.id=m.activity_id WHERE instr(a.title,'【模拟】')>0 LIMIT 1").get();
      if (activity) candidates.push({ route: '/media/' + activity.id, actor: owner });
      const meetup = db.prepare("SELECT p.id,m.id meetup_id,m.club_id FROM meetup_photos p JOIN meetups m ON m.id=p.meetup_id WHERE instr(m.place,'【模拟】')>0 LIMIT 1").get();
      if (meetup) candidates.push({ route: '/clubs/' + meetup.club_id + '/meetups/' + meetup.meetup_id + '/photos/' + meetup.id, actor: owner });
      const runner = db.prepare("SELECT m.id,m.user_id FROM runner_media m JOIN races r ON r.id=m.race_id WHERE m.user_id BETWEEN 8 AND 207 AND instr(r.name,'【模拟】')>0 LIMIT 1").get();
      if (runner) candidates.push({ route: '/me/runner/media/' + runner.id + '/file', actor: users.find(u => u.id === runner.user_id) });
      const history = db.prepare("SELECT m.id,m.user_id,m.entry_key FROM race_history_media m JOIN race_history_entries e ON 'exp:'||e.id=m.entry_key WHERE m.user_id BETWEEN 8 AND 207 AND instr(e.name,'【模拟】')>0 LIMIT 1").get();
      if (history) candidates.push({ route: '/me/race-history/' + encodeURIComponent(history.entry_key) + '/media/' + history.id + '/file', actor: users.find(u => u.id === history.user_id) });
      const checked = [];
      for (const item of candidates) {
        const response = await fetch(origin + '/marathon/api' + item.route, { headers: { Authorization: 'Bearer ' + item.actor.token }, signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200, 'New simulated media must be served: ' + item.route);
        const bytes = (await response.arrayBuffer()).byteLength;
        assert.ok(bytes > 0 && response.headers.get('content-type').startsWith('image/'));
        checked.push({ route: item.route, bytes, status: response.status });
      }
      return checked;
    }],
  ]) {
    const selected = arg('--stages');
    if (selected && name !== 'catalog' && !selected.split(',').includes(name)) continue;
    process.stdout.write('START ' + name + '\n');
    report.stages[name] = safeResult(await fn());
    ctx[({ users: 'user', clubs: 'club' }[name] || name) + 'Report'] = report.stages[name];
    process.stdout.write('DONE ' + name + '\n');
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  const changes = [];
  const deltas = {};
  for (const [table, before] of Object.entries(baseline)) {
    const after = db.prepare('SELECT rowid AS _scenario_rowid, * FROM ' + table).all();
    const byId = new Map(after.map(r => [r._scenario_rowid, r]));
    deltas[table] = after.length - before.length;
    for (const row of before) {
      const actual = byId.get(row.id);
      if (table === 'club_members' && row.joinedAt) {
        assert.ok(actual && actual.joined_at === row.joinedAt && actual.club_id === row.clubId && actual.user_id === row.userId, 'An original membership or its joined_at changed');
      }
      if (!actual || hash(actual) !== row.hash) changes.push({ table, rowid: row.id, userId: row.userId,
        clubId: row.clubId ?? actual?.club_id ?? null, removed: !actual });
    }
  }
  report.tableDeltas = Object.fromEntries(Object.entries(deltas).filter(([, v]) => v));
  report.changedExistingRows = changes;
  report.historySetups = state.setups;
  report.totalJournalSteps = Object.keys(state.steps).length;
  report.completed = ['catalog', 'memberships', 'clubs', 'users', 'community', 'verify', 'binary'].every(name => report.stages[name]);
  report.foreignKeyErrors = db.pragma('foreign_key_check');
  report.integrity = db.pragma('integrity_check', { simple: true });
  assert.equal(report.integrity, 'ok'); assert.equal(report.foreignKeyErrors.length, 0);
  const unsafeChanges = changes.filter(c => {
    if (c.removed) return true;
    if (c.table === 'club_members') return !users.some(u => u.id === c.userId) || !clubs.some(club => club.id === c.clubId);
    return true;
  });
  report.protectedExistingRowsPass = unsafeChanges.length === 0;
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  assert.equal(unsafeChanges.length, 0, 'Existing protected rows changed: ' + JSON.stringify(unsafeChanges.slice(0, 15)));
  save();
  process.stdout.write(JSON.stringify({ report: path.join(runDir, 'report.json'), completed: report.completed, steps: report.totalJournalSteps, added: report.tableDeltas, existingRowChanges: changes.length, protectedExistingRowsPass: report.protectedExistingRowsPass, integrity: report.integrity }) + '\n');
}
main().catch(error => {
  save();
  if (error.report) fs.writeFileSync(path.join(runDir, 'verification-failure.json'), JSON.stringify(safeResult(error.report), null, 2), { mode: 0o600 });
  process.stderr.write(error.stack + '\n'); process.exitCode = 1;
}).finally(async () => {
  if (appServer) { appServer.closeAllConnections(); await new Promise(resolve => appServer.close(resolve)); }
  if (db) db.close();
});
