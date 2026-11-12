'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('../server/node_modules/better-sqlite3');
const { configuration } = require('./verify-account-experiences.cjs');
const SCRIPT = path.join(__dirname, 'verify-account-experiences.cjs');
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr, summary: JSON.parse(stdout) }));
  });
}
test('CLI accepts only loopback API targets and 2–4 workers', () => {
  for (const value of ['https://example.com/marathon/api', 'http://127.0.0.1.evil.example/marathon/api', 'http://name:secret@127.0.0.1/marathon/api', 'http://localhost/marathon/api?credential=x', 'http://localhost/marathon/api#x', 'file:///tmp/api']) assert.throws(() => configuration(['--database', '/tmp/unused', '--base-url', value]));
  for (const value of ['1', '5', 'NaN']) assert.throws(() => configuration(['--database', '/tmp/unused', '--base-url', 'http://localhost:3790/marathon/api', '--concurrency', value]));
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(configuration(['--database', '/tmp/unused', '--base-url', 'http://' + host + ':3790/marathon/api/']).concurrency, 3);
});
test('CLI reads every account, checks seed signup ownership, reports deficits without secrets and writes no database data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-experience-verifier-')), file = path.join(directory, 'fixture.sqlite');
  const credentials = ['never-persist-this-bearer-one', 'never-persist-this-bearer-two'], names = ['不可输出的昵称甲', '不可输出的昵称乙'];
  const db = new Database(file);
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,token TEXT,nickname TEXT); CREATE TABLE account_experience_seed_registry(seed_key TEXT,batch TEXT,table_name TEXT,pk_json TEXT); CREATE TABLE activities(id INTEGER PRIMARY KEY,club_id INTEGER); CREATE TABLE activity_signups(activity_id INTEGER,user_id INTEGER)");
  for (let index = 0; index < 2; index++) db.prepare('INSERT INTO users VALUES(?,?,?)').run(index + 1, credentials[index], names[index]);
  db.prepare('INSERT INTO activities VALUES(11,22)').run(); db.prepare('INSERT INTO activity_signups VALUES(11,1)').run();
  db.prepare('INSERT INTO account_experience_seed_registry VALUES(?,?,?,?)').run('signup-one', 'account-experiences-v1', 'activity_signups', JSON.stringify({ activity_id: 11, user_id: 1 })); db.close();
  const before = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  let deficit = false, redirect = false, active = 0, peak = 0; const seen = [];
  const server = http.createServer((req, res) => {
    active++; peak = Math.max(active, peak);
    const userId = credentials.indexOf(String(req.headers.authorization || '').replace('Bearer ', '')) + 1;
    seen.push({ userId, method: req.method, url: req.url });
    setTimeout(() => {
      active--; res.setHeader('Content-Type', 'application/json');
      if (redirect && req.url === '/marathon/api/me' && userId === 1) { res.statusCode = 302; res.setHeader('Location', 'https://example.com/credential-must-not-follow'); return res.end('{}'); }
      if (req.url === '/marathon/api/me') return res.end(JSON.stringify({ user: { id: userId, nickname: names[userId - 1] }, clubs: [{ id: 1 }, { id: 2 }], plans: [{}], results: [{}, {}] }));
      if (req.url.startsWith('/marathon/api/runs?')) return res.end(JSON.stringify({ month: { id: new URL(req.url, 'http://localhost').searchParams.get('month') }, runs: deficit && userId === 2 ? [{}] : [{}, {}] }));
      if (req.url === '/marathon/api/me/runner?period=all') return res.end(JSON.stringify({ overview: { totalKm: 12, totalCount: 2 } }));
      if (req.url === '/marathon/api/me/race-history') return res.end(JSON.stringify({ entries: [{}, {}] }));
      if (req.url === '/marathon/api/clubs/22/activities/11') return res.end(JSON.stringify({ activity: { mine: { signed: true } }, signups: [{ userId, mine: true }] }));
      res.statusCode = 404; res.end('{}');
    }, 5);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const args = ['--database', file, '--base-url', 'http://127.0.0.1:' + server.address().port + '/marathon/api', '--concurrency', '2'];
    const success = await run(args); assert.equal(success.code, 0); assert.equal(success.summary.passed, true); assert.equal(success.summary.checked, 2); assert.equal(success.summary.seededSignupAccountsChecked, 1); assert.deepEqual(success.summary.failures, []);
    assert.ok(peak <= 2); assert.ok(seen.every(row => row.method === 'GET')); assert.equal(seen.filter(row => row.url.includes('/activities/')).length, 1);
    deficit = true; const failure = await run(args); assert.equal(failure.code, 1); assert.deepEqual(failure.summary.failures, [{ userId: 2, failedChecks: ['MONTH_RUNS_BELOW_TWO'] }]);
    deficit = false; redirect = true; const redirected = await run(args); assert.equal(redirected.code, 1); assert.deepEqual(redirected.summary.failures, [{ userId: 1, failedChecks: ['ME_REQUEST_FAILED'] }]);
    for (const result of [success, failure, redirected]) { assert.equal(result.stderr, ''); for (const secret of [...credentials, ...names]) assert.equal((result.stdout + result.stderr).includes(secret), false, 'No account credentials or names may be emitted'); }
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), before);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
});
