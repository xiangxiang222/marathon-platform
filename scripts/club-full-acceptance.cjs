/* Expanded full-cohort HTTP acceptance; core cases adapted from club-live-acceptance.cjs.
 * Real HTTP acceptance. All accounts, business data and uploaded files live in an
 * automatically removed temporary directory. Never point this at a running app.
 * Run: node scripts/club-full-acceptance.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-club-live-'));
Object.assign(process.env, {
  NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0',
  MARATHON_DB: path.join(temp, 'test.sqlite'), MARATHON_MEDIA: path.join(temp, 'media'),
  ADMIN_TOKEN: crypto.randomBytes(24).toString('hex')
});
// Requiring the app skips require.main's pull/sync timers and external services.
// index.js normally probes the local .env even in tests. Hide that one file
// during synchronous module initialization; restore fs immediately afterward.
// No credentials or production configuration are loaded by this acceptance.
const existsSync = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : existsSync(file);
let app;
try { ({ app } = require(path.join(ROOT, 'server/src/index'))); }
finally { fs.existsSync = existsSync; }
const { getDb } = require(path.join(ROOT, 'server/src/db'));
const db = getDb();
const report = { createdAt: new Date().toISOString(), isolated: true, accountCount: 0, api: [], notes: [] };
let origin, server;
const actor = {};
const cohort = [], clubs = [];
report.httpRequests = 0; report.statusCounts = {}; report.endpoints = new Set();
const stamp = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
const day = (offset = 0) => stamp(Date.now() + offset * 86400000).slice(0, 10);
const people = (period) => period.groups.flatMap(g => g.people.map(p => ({ ...p, status: g.status })));
const fixturePhoto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
async function trackedFetch(url, options = {}) {
  assert.equal(new URL(url).origin, origin, 'acceptance only calls its temporary local server');
  const response = await fetch(url, options);
  const route = new URL(url).pathname.replace('/marathon/api', '').replace(/\/\d+(?=\/|$)/g, '/:id');
  report.httpRequests++;
  report.statusCounts[response.status] = (report.statusCounts[response.status] || 0) + 1;
  report.endpoints.add((options.method || 'GET') + ' ' + route);
  return response;
}
async function api(method, url, who, body, expected = 200) {
  const options = { method, headers: {} };
  if (who) options.headers.Authorization = 'Bearer ' + (typeof who === 'string' ? who : who.token);
  if (body instanceof FormData) options.body = body;
  else if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await trackedFetch(origin + '/marathon/api' + url, options);
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${url}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function upload(url, who, bytes = fixturePhoto, name = 'fixture.png') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: name.endsWith('mp4') ? 'video/mp4' : name.endsWith('png') ? 'image/png' : 'image/jpeg' }), name);
  return api('POST', url, who, form);
}
async function check(name, fn) {
  const before = Date.now();
  try { await fn(); report.api.push({ name, status: 'pass', ms: Date.now() - before }); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { report.api.push({ name, status: 'fail', error: error.message }); process.stderr.write('FAIL ' + name + ': ' + error.message + '\n'); throw error; }
}
async function register(key, nickname) {
  const created = await api('POST', '/auth/register', null, { nickname, password: 'Live-club-2026!', legalConsent: { accepted: true, version: require('../shared/legal-documents.json').version } });
  actor[key] = { ...created.user, token: created.token };
  report.accountCount++;
  return actor[key];
}
async function join(club, who, decision = 'approve') {
  const applied = await api('POST', '/clubs/join', who, { code: club.code });
  assert.equal(applied.pending, true);
  const ownerId = db.prepare('SELECT owner_id FROM clubs WHERE id = ?').get(club.id).owner_id;
  const owner = Object.values(actor).find(a => a.id === ownerId);
  const detail = await api('GET', '/clubs/' + club.id, owner);
  const request = detail.requests.find(r => r.userId === who.id || r.nickname === who.nickname);
  assert.ok(request, 'pending request appears to owner');
  await api('POST', '/clubs/' + club.id + '/requests/' + request.id, owner, { decision });
}
async function main() {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  origin = 'http://127.0.0.1:' + server.address().port;
  let club, other, activity, internal, meetup, call, fee, media, groupA, groupB;
  await check('AUTH-01 36 个账号均真实注册；逐个验证码登录；重复昵称与缺失同意拒绝', async () => {
    for (let index = 0; index < 36; index++) {
      const key = index === 0 ? 'owner' : index === 1 ? 'manager' : index === 2 ? 'a' : index === 3 ? 'b' : index === 6 ? 'outsider' : 'cohort' + index;
      const who = await register(key, '全量验收跑者' + String(index + 1).padStart(2, '0'));
      const captcha = await api('GET', '/auth/captcha');
      const code = db.prepare('SELECT code FROM captchas WHERE token=?').get(captcha.token).code;
      const logged = await api('POST', '/auth/login', null, { nickname: who.nickname, password: 'Live-club-2026!', captchaToken: captcha.token, captcha: code });
      assert.equal(logged.user.id, who.id); who.token = logged.token; cohort.push(who);
      await api('POST', '/auth/login', null, { nickname: who.nickname, password: 'Live-club-2026!', captchaToken: captcha.token, captcha: code }, 400);
    }
    await api('POST', '/auth/register', null, { nickname: cohort[0].nickname, password: 'Live-club-2026!', legalConsent: { accepted: true, version: require('../shared/legal-documents.json').version } }, 400);
    await api('POST', '/auth/register', null, { nickname: '未同意不得注册', password: 'Live-club-2026!' }, 428);
  });
  await check('AUTH-02 验证码登录恢复原账号与错误密码', async () => {
    for (const valid of [false, true]) {
      const captcha = await api('GET', '/auth/captcha');
      const code = db.prepare('SELECT code FROM captchas WHERE token = ?').get(captcha.token).code;
      const result = await api('POST', '/auth/login', null, { nickname: actor.a.nickname, password: valid ? 'Live-club-2026!' : 'wrong-password', captchaToken: captcha.token, captcha: code }, valid ? 200 : 400);
      if (valid) { assert.equal(result.user.id, actor.a.id); actor.a.token = result.token; }
    }
  });
  await check('CLUB-01 六位普通账号创建六个团，同名跨城市可区分，创建请求幂等', async () => {
    for (let index = 0; index < 6; index++) {
      const owner = cohort[index * 6];
      const body = { name: index < 2 ? '同名城市晨跑团' : '全量验收跑团' + (index + 1), city: ['北京','杭州','广州','上海','成都','南京'][index], requestId: crypto.randomUUID() };
      const created = (await api('POST', '/clubs', owner, body)).club;
      const retry = (await api('POST', '/clubs', owner, body)).club;
      assert.equal(created.id, retry.id); clubs.push(created);
      await api('POST', '/clubs', owner, { ...body, requestId: crypto.randomUUID() }, 429);
    }
    [club, other] = clubs;
    assert.equal(new Set(clubs.map(item => item.id)).size, 6);
    const same = await api('GET', '/clubs/directory?q=' + encodeURIComponent('同名城市晨跑团'));
    assert.equal(same.clubs.length, 2);
    assert.deepEqual(new Set(same.clubs.map(item => item.city)), new Set(['北京','杭州']));
  });
  const c = () => '/clubs/' + club.id;
  await check('CLUB-02 公开介绍仅公开资料；游客与团外不能读团详情', async () => {
    const intro = await api('GET', c() + '/public');
    assert.equal(intro.club.name, club.name);
    for (const field of ['members', 'requests', 'board', 'activities', 'code']) assert.equal(intro.club[field], undefined, field);
    await api('GET', c(), null, null, 401); await api('GET', c(), actor.outsider, null, 403);
  });
  await check('CLUB-03 申请拒绝后可重新申请、审核后才读详情', async () => {
    await join(club, actor.a, 'reject'); await api('GET', c(), actor.a, null, 403);
    for (const who of [actor.manager, actor.a, actor.b]) await join(club, who);
    assert.equal((await api('GET', c(), actor.a)).members.length, 4);
  });
  await check('ROLE-01 管理员任命与普通成员禁止管理', async () => {
    await api('PUT', c() + '/members/' + actor.manager.id, actor.owner, { role: 'manager' });
    const manager = await api('GET', c(), actor.manager); assert.equal(manager.club.staff, true); assert.equal(manager.club.owner, false);
    await api('POST', c() + '/groups', actor.a, { name: '不允许创建' }, 403);
    await api('PUT', c() + '/members/' + actor.a.id, actor.manager, { role: 'owner' }, 403);
  });
  await check('GROUP-01 管理员创建 A/B 配速组与人数上限校验', async () => {
    groupA = (await api('POST', c() + '/groups', actor.manager, { name: 'A 组', pace: '4:30', capacity: 1 })).group;
    groupB = (await api('POST', c() + '/groups', actor.manager, { name: 'B 组', pace: '6:00', capacity: 0 })).group;
    await api('POST', c() + '/groups', actor.owner, { name: '错误组', capacity: -1 }, 400);
  });
  await check('ACT-01 创建完整训练活动；非法日历日期拒绝', async () => {
    await api('POST', c() + '/activities', actor.owner, { title: '无效日期', place: '公园', startsAt: '2099-02-30 07:00' }, 400);
    activity = (await api('POST', c() + '/activities', actor.manager, {
      title: '周末河岸轻松跑', issue: '第 42 期', place: '奥森南门', gatherPlace: '南门广场', startsAt: stamp(Date.now() + 3 * 86400000),
      endsAt: stamp(Date.now() + 3 * 86400000 + 7200000), plannedKm: 10, minKm: 5, minPeople: 3, points: 2, trainingType: 'easy',
      workout: '按个人状态轻松完成', notice: '提前十分钟集合', route: '南园外圈两圈', review: true
    })).activity;
  });
  const act = () => c() + '/activities/' + activity.id;
  await check('ACT-02 必选组别；并发竞争最后一个名额只成功一人', async () => {
    await api('POST', act() + '/signup', actor.a, {}, 400);
    const statuses = await Promise.all([actor.a, actor.b].map(async who => {
      const response = await trackedFetch(origin + '/marathon/api' + act() + '/signup', { method: 'POST', headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: groupA.id, gender: who === actor.a ? '男' : '女', level: '进阶' }) });
      await response.json(); return response.status;
    }));
    assert.deepEqual(statuses.sort(), [200, 400]);
    const current = await api('GET', act(), actor.owner);
    for (const signup of current.signups) await api('DELETE', act() + '/signup', Object.values(actor).find(a => a.id === signup.userId));
  });
  await check('ACT-03 取消释放名额、重复报名拒绝、团外隔离', async () => {
    await api('POST', act() + '/signup', actor.a, { groupId: groupA.id, gender: '男', level: '进阶' });
    await api('POST', act() + '/signup', actor.a, { groupId: groupB.id }, 400);
    await api('DELETE', act() + '/signup', actor.a);
    await api('POST', act() + '/signup', actor.b, { groupId: groupA.id, gender: '女', level: '萌新' });
    for (const who of [actor.owner, actor.a]) await api('POST', act() + '/signup', who, { groupId: groupB.id, gender: '男', level: '进阶' });
    await api('POST', act() + '/signup', actor.outsider, { groupId: groupB.id }, 403);
  });
  await check('ACT-04 成员的团详情/活动/相册不泄露性别统计和他人水平', async () => {
    const all = await api('GET', c(), actor.a);
    const detail = await api('GET', act(), actor.a);
    const album = await api('GET', act() + '/album', actor.a);
    for (const value of [all.activities.find(a => a.id === activity.id), detail.activity, album.activity]) {
      assert.equal(value.men, undefined); assert.equal(value.women, undefined);
    }
    for (const signup of detail.signups.filter(s => s.userId !== actor.a.id)) { assert.equal(signup.gender, undefined); assert.equal(signup.level, undefined); }
  });
  await check('ACT-05 开始前无打卡入口且接口拒绝；服务端再核对截止', async () => {
    assert.equal((await api('GET', act(), actor.a)).activity.checkAvailable, false);
    await api('POST', act() + '/check', actor.a, { km: 10 }, 400);
    db.prepare('UPDATE activities SET signup_until = ? WHERE id = ?').run(stamp(Date.now() - 60000), activity.id);
    await api('POST', act() + '/signup', actor.manager, { groupId: groupB.id }, 400);
    db.prepare('UPDATE activities SET signup_until = ? WHERE id = ?').run(stamp(Date.now() + 2 * 86400000), activity.id);
  });
  await check('ACT-06 三人达标才发积分；更新里程重算且重复打卡不重复加分', async () => {
    db.prepare('UPDATE activities SET starts_at = ?, ends_at = ? WHERE id = ?').run(stamp(Date.now() - 60000), stamp(Date.now() + 3600000), activity.id);
    await api('POST', act() + '/check', actor.owner, { km: 6 });
    await api('POST', act() + '/check', actor.a, { km: 4 });
    const short = await api('POST', act() + '/check', actor.b, { km: 10 }); assert.equal(short.awarded, false);
    const enough = await api('POST', act() + '/check', actor.a, { km: 5 }); assert.equal(enough.awarded, true); assert.equal(enough.myPoints, 2);
    assert.equal((await api('POST', act() + '/check', actor.a, { km: 5 })).myPoints, 2);
  });
  await check('ALBUM-01 成员图片待审核；本人/管理可见，其他成员待审批后可见', async () => {
    media = (await upload(act() + '/media', actor.a)).media; assert.equal(media.pending, true);
    const mine = await api('GET', act() + '/album', actor.a); assert.ok(JSON.stringify(mine).includes('pending'));
    const hidden = await trackedFetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.b.token } }); assert.equal(hidden.status, 404);
    await api('POST', act() + '/media/' + media.id + '/approve', actor.a, {}, 403);
    await api('POST', act() + '/media/' + media.id + '/approve', actor.manager, {});
    const shown = await trackedFetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.b.token } }); assert.equal(shown.status, 200);
    const outsider = await trackedFetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.outsider.token } }); assert.equal(outsider.status, 403);
  });
  await check('GIFT-01 积分兑换扣分库存只扣一次；库存耗尽拒绝', async () => {
    const gift = (await api('POST', c() + '/gifts', actor.manager, { name: '晨光跑团纪念袜', cost: 2, stock: 1 })).gift;
    assert.equal((await api('POST', c() + '/gifts/' + gift.id + '/redeem', actor.a, {})).myPoints, 0);
    await api('POST', c() + '/gifts/' + gift.id + '/redeem', actor.b, {}, 400);
  });
  await check('MEET-01 成员发约跑/加入/取消；未到日期禁止打卡', async () => {
    meetup = (await api('POST', c() + '/meetups', actor.a, { date: day(2), place: '奥森南园 10 公里', note: '7:00 南门集合，轻松配速' })).meetup;
    await api('POST', c() + '/meetups/' + meetup.id + '/join', actor.b, {});
    await api('DELETE', c() + '/meetups/' + meetup.id + '/join', actor.b);
    await api('POST', c() + '/meetups/' + meetup.id + '/join', actor.b, {});
    await api('POST', c() + '/meetups/' + meetup.id + '/check', actor.b, {}, 400);
    await api('GET', c() + '/meetups/' + meetup.id, actor.outsider, null, 403);
  });
  await check('INTERNAL-01 管理员创建队内赛；普通成员不可创建；容量与重复报名', async () => {
    const body = { title: '晨光周末 10 公里测验', place: '奥森', startsAt: stamp(Date.now() + 4 * 86400000), deadline: stamp(Date.now() + 3 * 86400000), distance: '10k', finishPoints: 3, groups: [{ name: 'A 组', capacity: 1 }, { name: 'B 组', capacity: 0 }] };
    await api('POST', c() + '/internals', actor.a, body, 403);
    internal = (await api('POST', c() + '/internals', actor.manager, body)).race;
    const base = c() + '/internals/' + internal.id;
    await api('POST', base + '/signup', actor.a, { groupId: internal.groups[0].id });
    await api('POST', base + '/signup', actor.b, { groupId: internal.groups[0].id }, 400);
    await api('POST', base + '/signup', actor.b, { groupId: internal.groups[1].id });
    await api('POST', base + '/signup', actor.b, { groupId: internal.groups[1].id }, 400);
    await api('POST', base + '/results', actor.a, { time: '45:30' }, 400);
  });
  await check('INTERNAL-02 开始后录成绩并结束；积分幂等、成员不可给他人录成绩', async () => {
    db.prepare('UPDATE internal_races SET starts_at = ?, deadline = ? WHERE id = ?').run(stamp(Date.now() - 3600000), stamp(Date.now() - 7200000), internal.id);
    const base = c() + '/internals/' + internal.id;
    await api('POST', base + '/results', actor.a, { time: '45:30' });
    await api('POST', base + '/results', actor.b, { userId: actor.a.id, time: '59:59' });
    assert.equal(db.prepare('SELECT seconds FROM internal_results WHERE race_id = ? AND user_id = ?').get(internal.id, actor.a.id).seconds, 2730);
    await api('POST', base + '/results', actor.b, { outcome: 'dnf' });
    const first = await api('POST', base + '/end', actor.manager, {});
    const balance = db.prepare('SELECT SUM(delta) AS total FROM point_entries WHERE club_id = ? AND user_id = ?').get(club.id, actor.a.id).total;
    await api('POST', base + '/end', actor.owner, {});
    assert.equal(db.prepare('SELECT SUM(delta) AS total FROM point_entries WHERE club_id = ? AND user_id = ?').get(club.id, actor.a.id).total, balance);
    assert.ok(first.race);
  });
  await check('CALL-01 成绩接龙同步赛事名单、撤回不删先前个人成绩与证书', async () => {
    await api('PUT', '/me/races/bishan/result', actor.a, { distance: 'full', time: '3:30:00', story: '个人独立记录' });
    await upload('/me/races/bishan/result/proof/certificate?distance=full', actor.a);
    const collection = await upload('/me/runner/media?raceId=bishan&distance=full&kind=certificate', actor.a);
    call = (await api('POST', c() + '/calls', actor.manager, { raceId: 'bishan', distances: ['full'], deadline: stamp(Date.now() + 86400000) })).call;
    const base = c() + '/calls/' + call.id;
    const signed = await api('POST', base + '/rows', actor.a, { distance: 'full', time: '3:30:00' });
    const row = signed.call.groups.flatMap(group => group.rows).find(r => r.userId === actor.a.id);
    assert.ok(row);
    await api('DELETE', base + '/rows/' + row.id, actor.manager);
    const result = db.prepare('SELECT seconds, proof FROM results WHERE user_id = ? AND race_id = ? AND distance = ?').get(actor.a.id, 'bishan', 'full');
    assert.ok(result); assert.equal(result.seconds, 12600); assert.ok(result.proof);
    const privateId = collection.media?.id || collection.id;
    assert.ok(privateId, JSON.stringify(collection));
    assert.equal((await trackedFetch(origin + '/marathon/api/me/runner/media/' + privateId + '/file', { headers: { Authorization: 'Bearer ' + actor.a.token } })).status, 200);
    assert.equal((await trackedFetch(origin + '/marathon/api/me/runner/media/' + privateId + '/file', { headers: { Authorization: 'Bearer ' + actor.manager.token } })).status, 404);
    await api('POST', base + '/rows', actor.a, { distance: 'full', time: '3:30:00' });
    await api('POST', base + '/rows', actor.b, { distance: 'full', time: '3:50:00' });
    const board = (await api('GET', c(), actor.owner)).board.find(r => r.race.id === 'bishan');
    assert.ok(board.marks.some(m => m.userId === actor.a.id && m.clock === '3:30:00'));
  });
  await check('FEES-01 会费只记名单；普通成员不能标交费，管理员不能开新期', async () => {
    const body = { name: '2026 秋季会费', amount: 100, startsOn: day(-30), endsOn: day(30), blockSignup: false };
    await api('POST', c() + '/fees', actor.manager, body, 403);
    fee = (await api('POST', c() + '/fees', actor.owner, body)).period;
    await api('POST', c() + '/fees/' + fee.id + '/records', actor.a, { userId: actor.a.id, status: 'paid' }, 403);
    await api('POST', c() + '/fees/' + fee.id + '/records', actor.manager, { userId: actor.b.id, status: 'paid' });
  });
  await check('LEAVE-01 退出/管理员移出一致清理未来活动、队内赛、约跑，保留历史成绩', async () => {
    const futureAct = (await api('POST', c() + '/activities', actor.owner, { title: '下周晨跑清理验收', place: '河岸', startsAt: stamp(Date.now() + 6 * 86400000) })).activity;
    const futureRace = (await api('POST', c() + '/internals', actor.owner, { title: '下周队内赛清理验收', place: '奥森', startsAt: stamp(Date.now() + 6 * 86400000), deadline: stamp(Date.now() + 5 * 86400000), distance: '5k', groups: [{ name: '全员', capacity: 0 }] })).race;
    for (const who of [actor.a, actor.b]) {
      await api('POST', c() + '/activities/' + futureAct.id + '/signup', who, { groupId: groupB.id });
      await api('POST', c() + '/internals/' + futureRace.id + '/signup', who, { groupId: futureRace.groups[0].id });
    }
    await api('POST', c() + '/meetups/' + meetup.id + '/join', actor.a, {});
    const self = await api('POST', c() + '/leave', actor.a, {});
    const removed = await api('DELETE', c() + '/members/' + actor.b.id, actor.manager);
    for (const response of [self, removed]) assert.deepEqual(response.removedSignups, { activities: 1, meetups: 1, internalRaces: 1 });
    await api('GET', c(), actor.a, null, 403);
    assert.ok(db.prepare('SELECT 1 FROM results WHERE user_id = ? AND race_id = ?').get(actor.a.id, 'bishan'));
    assert.ok(db.prepare('SELECT 1 FROM internal_results WHERE race_id = ? AND user_id = ?').get(internal.id, actor.a.id));
  });
  await check('FEES-02 当前排除离团者；关闭期次快照再入团不改变历史', async () => {
    const current = (await api('GET', c() + '/fees', actor.owner)).current;
    assert.equal(people(current).some(p => p.userId === actor.b.id), false);
    await api('POST', c() + '/fees', actor.owner, { name: '2027 新期会费', amount: 120, startsOn: day(31), endsOn: day(120) });
    const history = (await api('GET', c() + '/fees/' + fee.id, actor.owner)).period;
    assert.equal(people(history).find(p => p.userId === actor.b.id).departed, true);
    await join(club, actor.a); await join(club, actor.b);
    const later = (await api('GET', c() + '/fees/' + fee.id, actor.owner)).period;
    assert.equal(people(later).find(p => p.userId === actor.b.id).departed, true);
    assert.equal(people(later).find(p => p.userId === actor.b.id).status, 'paid');
    await api('POST', c() + '/fees/' + fee.id + '/records', actor.owner, { userId: actor.b.id, status: 'unpaid' }, 400);
  });
  await check('ROLE-02 团长先移交后退出；跨团 ID 不能读取活动/会费/成绩', async () => {
    await api('POST', c() + '/leave', actor.owner, {}, 400);
    await api('PUT', c() + '/members/' + actor.manager.id, actor.owner, { role: 'owner' });
    assert.equal((await api('GET', c(), actor.manager)).club.owner, true);
    await api('PUT', c() + '/members/' + actor.owner.id, actor.manager, { role: 'owner' });
    for (const url of ['/activities/' + activity.id, '/fees/' + fee.id, '/calls/' + call.id]) await api('GET', '/clubs/' + other.id + url, actor.outsider, null, 404);
  });
  await check('DASH-01 多跑团列表、赛事标记、日常打卡取消与动态发布', async () => {
    await join(other, actor.a);
    const me = await api('GET', '/me', actor.a); assert.ok(me.clubs.length >= 2);
    await api('PUT', '/me/races/bishan', actor.a, { status: '完赛' });
    await api('POST', c() + '/checkins', actor.a, { note: '今日轻松恢复' });
    await api('DELETE', c() + '/checkins', actor.a);
    const post = await api('POST', c() + '/posts', actor.a, { body: '下次一起跑奥森，安全第一。' });
    assert.ok(post.id);
    await api('POST', c() + '/posts/' + post.id + '/like', actor.b, {});
    await api('POST', c() + '/posts/' + post.id + '/like', actor.b, {}, 400);
    await api('DELETE', c() + '/posts/' + post.id + '/like', actor.b);
    await api('POST', c() + '/posts/' + post.id + '/comments', actor.b, { body: '一起出发！' });
    await api('DELETE', c() + '/posts/' + post.id, actor.b, null, 403);
  });
  await check('FEES-03 未交费禁止活动/队内赛报名；收到会费即可报名', async () => {
    const current = (await api('GET', c() + '/fees', actor.owner)).current;
    await api('PUT', c() + '/fees/' + current.id, actor.owner, { name: current.name, amount: current.amount, startsOn: day(-1), endsOn: day(100), blockSignup: true });
    const futureAct = (await api('GET', c(), actor.a)).activities.find(a => a.title === '下周晨跑清理验收');
    await api('POST', c() + '/activities/' + futureAct.id + '/signup', actor.a, { groupId: groupB.id }, 400);
    const futureRace = (await api('GET', c() + '/internals', actor.a)).races.find(r => r.title === '下周队内赛清理验收');
    const raceDetail = (await api('GET', c() + '/internals/' + futureRace.id, actor.a)).race;
    await api('POST', c() + '/internals/' + futureRace.id + '/signup', actor.a, { groupId: raceDetail.groups[0].id }, 400);
    await api('POST', c() + '/fees/' + current.id + '/records', actor.manager, { userId: actor.a.id, status: 'paid' });
    await api('POST', c() + '/activities/' + futureAct.id + '/signup', actor.a, { groupId: groupB.id });
    await api('POST', c() + '/internals/' + futureRace.id + '/signup', actor.a, { groupId: raceDetail.groups[0].id });
    await api('PUT', c() + '/fees/' + current.id, actor.owner, { name: current.name, amount: current.amount, startsOn: day(-1), endsOn: day(100), blockSignup: false });
  });
  await check('MEET-02 当天三人打卡上传合影；无效照片拒绝；成员不能作废', async () => {
    const today = (await api('POST', c() + '/meetups', actor.b, { date: day(), place: '晨光桥下恢复跑', note: '结束后一起拉伸' })).meetup;
    const base = c() + '/meetups/' + today.id;
    for (const who of [actor.owner, actor.a, actor.b]) { await api('POST', base + '/join', who, {}); await api('POST', base + '/check', who, {}); }
    const photo = await upload(base + '/photos', actor.a); assert.ok(photo.meetup.photos.length);
    await api('POST', base + '/void', actor.a, {}, 403);
    const invalid = new FormData(); invalid.append('file', new Blob(['not a photo'], { type: 'image/jpeg' }), 'fake.jpg');
    await api('POST', base + '/photos', actor.a, invalid, 400);
  });
  await check('ACT-07 活动作废后不能报名、不能打卡', async () => {
    const cancelled = (await api('POST', c() + '/activities', actor.owner, { title: '取消活动边界', place: '河岸', startsAt: stamp(Date.now() + 8 * 86400000) })).activity;
    const base = c() + '/activities/' + cancelled.id;
    await api('POST', base + '/cancel', actor.a, {}, 403);
    await api('POST', base + '/cancel', actor.manager, {});
    await api('POST', base + '/signup', actor.a, { groupId: groupB.id }, 400);
    await api('POST', base + '/check', actor.a, { km: 10 }, 400);
    assert.equal((await api('GET', base, actor.a)).activity.status, 'cancelled');
  });
  await check('ALBUM-02 驳回删除待审图片；成员不能删除他人的图片', async () => {
    const extra = (await upload(act() + '/media', actor.b)).media;
    await api('DELETE', act() + '/media/' + extra.id, actor.a, null, 403);
    await api('POST', act() + '/media/' + extra.id + '/reject', actor.manager, {});
    assert.equal((await trackedFetch(origin + '/marathon/api/media/' + extra.id, { headers: { Authorization: 'Bearer ' + actor.b.token } })).status, 404);
  });
  await check('AUTH-03 过期 token 与空 token 均被团内数据服务端拒绝', async () => {
    for (const url of [c(), c() + '/fees', c() + '/calls', c() + '/meetups', c() + '/internals', c() + '/posts']) {
      await api('GET', url, 'expired-live-test-token', null, 401);
      await api('GET', url, null, null, 401);
    }
  });
  // Fixtures retained only in memory for browser navigation; all writes above use HTTP.
  const fixture = { club, other, activity, internal, meetup, call, fee, actor };
  report.notes.push('Only time-dependent start/deadline boundaries use explicit SQL changes in the disposable database; no production database or .env was accessed.');
  await extendedAudits(fixture);
}

async function extendedAudits(fixture) {
  const { club, other } = fixture;
  const c = '/clubs/' + club.id;
  await check('BATCH-01 全部36跑者分配六团，多团身份与跨团权限矩阵', async () => {
    for (let index = 0; index < clubs.length; index++) {
      const one = clubs[index], owner = cohort[index * 6];
      for (let offset = 1; offset < 6; offset++) {
        const who = cohort[index * 6 + offset];
        const me = await api('GET', '/me', who);
        if (!me.clubs.some(item => item.id === one.id)) await join(one, who);
      }
      await api('PUT', '/clubs/' + one.id + '/members/' + cohort[index * 6 + 1].id, owner, { role: 'manager' });
      const detail = await api('GET', '/clubs/' + one.id, owner);
      assert.ok(detail.members.length >= 6);
      for (const foreign of clubs.filter(item => item.id !== one.id)) {
        const me = await api('GET', '/me', owner);
        if (!me.clubs.some(item => item.id === foreign.id)) await api('GET', '/clubs/' + foreign.id, owner, null, 403);
      }
      for (const suffix of ['', '/mileage?range=all', '/fees', '/meetups', '/internals', '/calls', '/posts', '/partner', '/albums']) {
        await api('GET', '/clubs/' + one.id + suffix, null, null, 401);
        await api('GET', '/clubs/' + one.id + suffix, 'expired-full-audit-token', null, 401);
      }
      await api('GET', '/clubs/' + one.id, cohort[index * 6 + 5]);
    }
    assert.equal((await api('GET', '/me', actor.a)).clubs.length, 2);
  });
  await check('BATCH-02 六团各自真实创建活动/约跑/队内赛/动态，实体ID不串团', async () => {
    for (let index = 0; index < clubs.length; index++) {
      const one = clubs[index], owner = cohort[index * 6], member = cohort[index * 6 + 5], base = '/clubs/' + one.id;
      const group = (await api('POST', base + '/groups', owner, { name: '批量不限组', capacity: 0, pace: '6:00' })).group;
      const activity = (await api('POST', base + '/activities', owner, { title: '批量周末训练' + index, place: '本地测试公园', startsAt: stamp(Date.now() + 14 * 86400000) })).activity;
      await api('POST', base + '/activities/' + activity.id + '/signup', member, { groupId: group.id });
      const meetup = (await api('POST', base + '/meetups', member, { date: day(14), place: '批量约跑集合点' + index })).meetup;
      const internal = (await api('POST', base + '/internals', owner, { title: '批量五公里测验' + index, place: '本地测试公园', startsAt: stamp(Date.now() + 15 * 86400000), deadline: stamp(Date.now() + 14 * 86400000), distance: '5k', groups: [{ name: '全员', capacity: 0 }] })).race;
      await api('POST', base + '/internals/' + internal.id + '/signup', member, { groupId: internal.groups[0].id });
      await api('POST', base + '/posts', member, { body: '批量跑团测试动态' + index });
      const foreign = clubs[(index + 1) % clubs.length], foreignOwner = cohort[((index + 1) % clubs.length) * 6];
      for (const suffix of ['/activities/' + activity.id, '/meetups/' + meetup.id, '/internals/' + internal.id]) await api('GET', '/clubs/' + foreign.id + suffix, foreignOwner, null, 404);
    }
  });
  await check('MILEAGE-01 真实跑步登记、个人归属、团长规则与跨团独立裁定', async () => {
    const rules = { effectiveOn: day(), manualOk: true, runOn: true, runMin: .1, runMax: 999, paceFast: '1:00', paceSlow: '30:00', trailOn: true, trailMin: .1, trailClimb: 0, trailClimbAdd: false, flagFemale: 0, flagMale: 0, observe: false };
    await api('PUT', c + '/mileage/rules', actor.manager, rules, 403);
    await api('PUT', c + '/mileage/rules', actor.owner, rules);
    await api('PUT', '/clubs/' + other.id + '/mileage/rules', actor.outsider, rules);
    const run = (await api('POST', '/runs', actor.a, { type: 'run', startedAt: stamp(Date.now() - 86400000), distanceKm: 10, duration: '01:00:00', climb: 0, city: '测试市' })).run;
    await api('PUT', '/runs/' + run.id, actor.b, { city: '不得改他人' }, 404);
    await api('DELETE', '/runs/' + run.id, actor.b, null, 404);
    await api('POST', c + '/mileage/runs/' + run.id + '/decision', actor.a, { counted: true }, 403);
    await api('POST', c + '/mileage/runs/' + run.id + '/decision', actor.manager, { counted: true });
    await api('POST', '/clubs/' + other.id + '/mileage/runs/' + run.id + '/decision', actor.outsider, { counted: false });
    const board = await api('GET', c + '/mileage?range=all', actor.a);
    assert.equal(board.rank.find(item => item.userId === actor.a.id).km, 10);
    assert.ok(!(await api('GET', '/clubs/' + other.id + '/mileage?range=all', actor.a)).rank.some(item => item.userId === actor.a.id));
    await api('POST', c + '/mileage/runs/' + run.id + '/challenge', actor.b, { reason: '合成测试质疑' });
    const group = (await api('POST', c + '/mileage/groups', actor.owner, { name: '晨跑分组', capacity: 1, sort: 1 })).group;
    await api('PUT', c + '/mileage/members/' + actor.a.id, actor.owner, { groupId: group.id });
    await api('PUT', c + '/mileage/members/' + actor.b.id, actor.owner, { groupId: group.id }, 400);
    await api('DELETE', c + '/mileage/groups/' + group.id, actor.owner);
    await api('GET', c + '/mileage/export?kind=month&json=1', actor.owner);
    await api('GET', c + '/mileage/export?kind=month&json=1', actor.manager, null, 403);
    for (const kind of ['week', 'month', 'year', 'all']) await api('GET', c + '/mileage/report?kind=' + kind, actor.a);
    await api('DELETE', '/runs/' + run.id, actor.a);
    assert.ok(!(await api('GET', c + '/mileage?range=all', actor.a)).rank.some(item => item.userId === actor.a.id));
  });
  await check('MILEAGE-02 无效公历日期与继承属性运动类型必须拒绝且不写库', async () => {
    const rules = { effectiveOn: '2026-02-30', manualOk: true, runOn: true, runMin: 1, runMax: 100, paceFast: '2:00', paceSlow: '15:00', trailOn: true, trailMin: 1, trailClimb: 0, flagFemale: 0, flagMale: 0 };
    await api('PUT', c + '/mileage/rules', actor.owner, rules, 400);
    for (const type of ['toString', 'constructor', '__proto__']) await api('POST', '/runs', actor.a, { type, startedAt: stamp(Date.now() - 86400000), distanceKm: 5, duration: '00:30:00', climb: 0 }, 400);
    for (const suffix of ['?kind=week&at=2026-02-30', '?kind=month&at=2026-13', '?kind=week&at=9999-99-99']) await api('GET', c + '/mileage/report' + suffix, actor.a, null, 400);
  });
  await check('IDENTITY-01 身份核验材料仅本人/平台读，公开标记不泄露私密联系方式', async () => {
    const input = { organization: '测试城市跑步组织', scope: '仅本地合成跑团', sourceUrl: 'https://example.test/synthetic-club', evidence: '仅用于本地验收的组织说明私密证据', contact: 'owner-private@example.test' };
    const verification = (await api('POST', c + '/identity', actor.owner, input)).verification;
    for (const who of [actor.manager, actor.a, actor.outsider]) await api('GET', c + '/identity', who, null, 403);
    await api('POST', '/admin/club-identity/verification/' + verification.id + '/decision', process.env.ADMIN_TOKEN, { decision: 'approve', note: '已核对本地合成组织关系，无真实认证意义' });
    const pub = (await api('GET', c + '/public')).club;
    assert.equal(pub.verified, true);
    assert.ok(!JSON.stringify(pub).includes('owner-private'));
    assert.ok(!JSON.stringify(await api('GET', c, actor.a)).includes('私密证据'));
  });
  await check('IDENTITY-02 暂停公开招募不移除已有成员；同名不自动判冒用', async () => {
    const selected = clubs[5], owner = cohort[30], member = cohort[35], base = '/clubs/' + selected.id;
    const reportCase = (await api('POST', base + '/reports', actor.a, { type: 'impersonation', detail: '合成测试具体身份争议，等待管理员核对', sourceUrl: 'https://example.test/synthetic-report', contact: 'report-private@example.test' })).report;
    assert.equal((await api('GET', '/me/club-reports', owner)).reports.length, 0);
    await api('POST', '/admin/club-identity/report/' + reportCase.id + '/decision', process.env.ADMIN_TOKEN, { decision: 'restrict', note: '合成测试暂时关闭公开招募' });
    assert.equal((await api('GET', base + '/public')).club.restricted, true);
    await api('GET', base, member);
    await api('POST', '/clubs/join', actor.b, { clubId: selected.id }, 403);
    assert.ok(!(await api('GET', '/clubs/directory?q=' + encodeURIComponent(selected.name))).clubs.some(item => item.id === selected.id));
    await api('POST', '/admin/club-identity/report/' + reportCase.id + '/decision', process.env.ADMIN_TOKEN, { decision: 'restore', note: '合成测试已完成核对，恢复公开' });
    assert.equal(Boolean((await api('GET', base + '/public')).club.restricted), false);
    const confusion = (await api('POST', base + '/reports', actor.a, { type: 'confusion', detail: '仅有同名不能判断冒用，合成记录', contact: 'private@example.test' })).report;
    await api('POST', '/admin/club-identity/report/' + confusion.id + '/decision', process.env.ADMIN_TOKEN, { decision: 'restrict', note: '仅同名的限制动作必须拒绝' }, 400);
  });
  await check('PARTNER-01 认证门槛、物资、月联赛与分账只记账不改积分', async () => {
    const admin = process.env.ADMIN_TOKEN, month = day().slice(0, 7);
    const before = db.prepare('SELECT COUNT(*) n FROM point_entries').get().n;
    const supply = await api('POST', '/admin/supplies', admin, { brand: '合成补给', name: '测试能量胶', total: 20, quota: 1, month, needChecks: 0, needKm: 0, note: '不实际发货' });
    const partner = await api('GET', c + '/partner', actor.owner);
    assert.equal(partner.grade.id, 'open');
    await api('POST', c + '/supplies/' + supply.id + '/claim', actor.a, {}, 400);
    await api('POST', '/admin/leagues', admin, { month, title: '本地月度联赛', sponsor: '合成赞助', prize: '无实际奖品' });
    await api('POST', c + '/league/join', actor.manager, {}, 403);
    await api('POST', c + '/league/join', actor.owner, {});
    await api('POST', '/clubs/' + other.id + '/league/join', actor.outsider, {});
    assert.equal((await api('GET', c + '/partner', actor.a)).league.rows.length, 2);
    await api('DELETE', c + '/league/join', actor.owner);
    const split = await api('POST', '/admin/splits', admin, { clubId: club.id, month, kind: 'fee', yuan: 100, note: '合成线下账' });
    const memberView = JSON.stringify(await api('GET', c + '/partner', actor.a));
    assert.ok(!memberView.includes('合成线下账'));
    await api('PUT', '/admin/splits/' + split.id, admin, { settled: true });
    await api('DELETE', '/admin/splits/' + split.id, admin, null, 400);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM point_entries').get().n, before);
  });
  await check('ADMIN-01 平台/跑团后台角色隔离，普通团长不能读取后台名单', async () => {
    const admin = process.env.ADMIN_TOKEN;
    for (const suffix of ['/admin/overview', '/admin/users', '/admin/clubs', '/admin/club-identity']) await api('GET', suffix, actor.owner, null, 401);
    await api('POST', '/admin/accounts', admin, { username: 'club_full_desk', password: 'Full-desk-2026!', role: 'club' });
    const desk = (await api('POST', '/admin/login', null, { username: 'club_full_desk', password: 'Full-desk-2026!' })).token;
    await api('GET', '/admin/clubs', desk);
    await api('GET', '/admin/overview', desk);
    await api('GET', '/admin/club-identity', desk, null, 403);
    await api('POST', '/admin/supplies', desk, { name: '不得越权' }, 403);
    await api('GET', '/admin/users', admin);
    await api('GET', '/admin/clubs', admin);
  });
  report.clubCount = clubs.length;
  report.membershipCount = db.prepare('SELECT COUNT(*) n FROM club_members').get().n;
  report.notes.push('36 accounts are created by /auth/register and each logs in with a real one-use local CAPTCHA. SQL reads inspect the disposable CAPTCHA answer, fixture ownership and assertions. Business setup, joins, decisions, uploads and writes use real HTTP. SQL writes only simulate time boundaries in this disposable test data.');
  report.notes.push('认证达标后的物资实际领取/发放和离团事务回滚等更深边界由现有262项服务端回归覆盖；本批量旅程验证六团真实规模及主要权限/数据闭环，不声称任何生产或微信真机验收。');
}

main().catch(error => { report.fatal = error.message; process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close(); fs.rmSync(temp, { recursive: true, force: true });
  report.endpointCount = report.endpoints.size;
  report.endpoints = [...report.endpoints].sort();
  report.summary = { accounts: report.accountCount, clubs: report.clubCount || clubs.length, memberships: report.membershipCount || 0, scenariosPassed: report.api.filter(item => item.status === 'pass').length, scenariosFailed: report.api.filter(item => item.status === 'fail').length, httpRequests: report.httpRequests, endpointCount: report.endpointCount };
  report.passed = !report.fatal && report.summary.scenariosFailed === 0;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(ROOT, 'design/previews/club-full-acceptance-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
});
