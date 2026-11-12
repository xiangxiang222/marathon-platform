'use strict';
/* Read-only local deployment verification. No application imports, migrations,
 * seed calls, credential output, response-body logging, or report files. */
const path = require('node:path');
const Database = require(path.join(__dirname, '../server/node_modules/better-sqlite3'));
const BATCH = 'account-experiences-v1';
function configuration(args) {
  const allowed = new Set(['--database', '--base-url', '--concurrency']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('INVALID_ARGUMENTS');
    options[key] = value;
  }
  if (!options['--database'] || !options['--base-url']) throw new Error('DATABASE_AND_BASE_URL_REQUIRED');
  let url;
  try { url = new URL(options['--base-url']); } catch { throw new Error('INVALID_BASE_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('LOOPBACK_API_ONLY');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/api')) throw new Error('API_BASE_PATH_REQUIRED');
  const concurrency = Number(options['--concurrency'] || 3);
  if (!Number.isInteger(concurrency) || concurrency < 2 || concurrency > 4) throw new Error('CONCURRENCY_MUST_BE_2_TO_4');
  return { file: path.resolve(options['--database']), baseUrl: url.href.replace(/\/$/, ''), concurrency };
}
function seededSignupTargets(db) {
  const targets = new Map();
  const registry = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_experience_seed_registry'").get();
  if (!registry) return targets;
  const rows = db.prepare("SELECT pk_json FROM account_experience_seed_registry WHERE batch=? AND table_name='activity_signups' ORDER BY seed_key").all(BATCH);
  const activity = db.prepare('SELECT a.id,a.club_id FROM activity_signups s JOIN activities a ON a.id=s.activity_id WHERE s.activity_id=? AND s.user_id=?');
  for (const row of rows) {
    let key;
    try { key = JSON.parse(row.pk_json); } catch { throw new Error('INVALID_SEED_REGISTRY'); }
    if (!Number.isSafeInteger(key?.activity_id) || !Number.isSafeInteger(key?.user_id) || key.activity_id < 1 || key.user_id < 1) throw new Error('INVALID_SEED_REGISTRY');
    if (!targets.has(key.user_id)) { const found = activity.get(key.activity_id, key.user_id); if (found) targets.set(key.user_id, { activityId: found.id, clubId: found.club_id }); }
  }
  return targets;
}
async function request(baseUrl, suffix, token) {
  try {
    const response = await fetch(baseUrl + suffix, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { error: 'HTTP_' + response.status };
    try { return { data: await response.json() }; } catch { return { error: 'INVALID_JSON' }; }
  } catch { return { error: 'REQUEST_FAILED' }; }
}
async function verifyAccount(account, { baseUrl, month, signup }) {
  const failedChecks = [];
  if (typeof account.token !== 'string' || !account.token) return { userId: account.id, failedChecks: ['CREDENTIAL_UNAVAILABLE'] };
  const results = {};
  for (const [key, suffix] of [['me', '/me'], ['runs', '/runs?month=' + month], ['runner', '/me/runner?period=all'], ['history', '/me/race-history']]) {
    const result = await request(baseUrl, suffix, account.token);
    if (result.error) failedChecks.push(key.toUpperCase() + '_' + result.error);
    else if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) failedChecks.push(key.toUpperCase() + '_INVALID_SHAPE');
    else results[key] = result.data;
  }
  const { me, runs, runner, history } = results;
  if (me) {
    if (Number(me.user?.id) !== account.id) failedChecks.push('ACCOUNT_ID_MISMATCH');
    if (!Array.isArray(me.clubs) || me.clubs.length < 2) failedChecks.push('CLUBS_BELOW_TWO');
    if (!Array.isArray(me.plans) || me.plans.length === 0) failedChecks.push('PLANS_EMPTY');
  }
  if (me && history && Math.max(Array.isArray(me.results) ? me.results.length : 0, Array.isArray(history.entries) ? history.entries.length : 0) < 2) failedChecks.push('RACE_EXPERIENCES_BELOW_TWO');
  if (runs) {
    if (runs.month?.id !== month) failedChecks.push('MONTH_MISMATCH');
    if (!Array.isArray(runs.runs) || runs.runs.length < 2) failedChecks.push('MONTH_RUNS_BELOW_TWO');
  }
  if (runner && !(Number(runner.overview?.totalKm) > 0 && Number(runner.overview?.totalCount) > 0)) failedChecks.push('PERSONAL_RUN_STATS_EMPTY');
  if (signup) {
    const result = await request(baseUrl, '/clubs/' + signup.clubId + '/activities/' + signup.activityId, account.token);
    if (result.error) failedChecks.push('SEEDED_SIGNUP_' + result.error);
    else if (!result.data.activity?.mine?.signed || !Array.isArray(result.data.signups) || !result.data.signups.some(row => Number(row.userId) === account.id && row.mine === true)) failedChecks.push('SEEDED_SIGNUP_NOT_MINE');
  }
  return { userId: account.id, failedChecks };
}
async function main(args = process.argv.slice(2)) {
  let db;
  try {
    const config = configuration(args);
    try { db = new Database(config.file, { readonly: true, fileMustExist: true }); } catch { throw new Error('DATABASE_READ_ONLY_OPEN_FAILED'); }
    let accounts, signups;
    try { accounts = db.prepare('SELECT id,token FROM users ORDER BY id').all(); signups = seededSignupTargets(db); } catch (error) { throw new Error(error.message === 'INVALID_SEED_REGISTRY' ? error.message : 'DATABASE_SCHEMA_UNAVAILABLE'); }
    const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
    const failures = []; let cursor = 0, checked = 0, signupAccounts = 0;
    async function worker() {
      while (cursor < accounts.length) {
        const account = accounts[cursor++], signup = signups.get(account.id);
        const result = await verifyAccount(account, { baseUrl: config.baseUrl, month, signup }); checked++; if (signup) signupAccounts++;
        if (result.failedChecks.length) failures.push(result);
      }
    }
    await Promise.all(Array.from({ length: Math.min(config.concurrency, accounts.length) }, worker));
    failures.sort((a, b) => a.userId - b.userId);
    const summary = { passed: accounts.length > 0 && failures.length === 0, mode: 'read-only', month, concurrency: config.concurrency, accounts: accounts.length, checked, passedAccounts: checked - failures.length, failedAccounts: failures.length, seededSignupAccountsChecked: signupAccounts, failures };
    if (!accounts.length) summary.error = 'NO_ACCOUNTS';
    console.log(JSON.stringify(summary)); return summary.passed ? 0 : 1;
  } catch (error) {
    const known = new Set(['INVALID_ARGUMENTS', 'DATABASE_AND_BASE_URL_REQUIRED', 'INVALID_BASE_URL', 'LOOPBACK_API_ONLY', 'API_BASE_PATH_REQUIRED', 'CONCURRENCY_MUST_BE_2_TO_4', 'DATABASE_READ_ONLY_OPEN_FAILED', 'INVALID_SEED_REGISTRY', 'DATABASE_SCHEMA_UNAVAILABLE']);
    console.log(JSON.stringify({ passed: false, mode: 'read-only', error: known.has(error.message) ? error.message : 'VERIFICATION_FAILED' })); return 1;
  } finally { if (db) db.close(); }
}
if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = { configuration, seededSignupTargets, verifyAccount, main };
