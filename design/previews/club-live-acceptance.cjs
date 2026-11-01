/* Real HTTP acceptance. All accounts, business data and uploaded files live in an
 * automatically removed temporary directory. Never point this at a running app.
 * Run: node design/previews/club-live-acceptance.cjs [--api-only | --journeys-only | --details-only]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
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
const report = { createdAt: new Date().toISOString(), isolated: true, accountCount: 0, api: [], browser: [], layoutGroups: [], layoutVisits: [], notes: [] };
let origin, server, vite, browser;
const actor = {};
const stamp = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
const day = (offset = 0) => stamp(Date.now() + offset * 86400000).slice(0, 10);
const people = (period) => period.groups.flatMap(g => g.people.map(p => ({ ...p, status: g.status })));
const fixturePhoto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
async function api(method, url, who, body, expected = 200) {
  const options = { method, headers: {} };
  if (who) options.headers.Authorization = 'Bearer ' + (typeof who === 'string' ? who : who.token);
  if (body instanceof FormData) options.body = body;
  else if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(origin + '/marathon/api' + url, options);
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${url}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function upload(url, who, bytes = fixturePhoto, name = 'fixture.png') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: name.endsWith('mp4') ? 'video/mp4' : name.endsWith('png') ? 'image/png' : 'image/jpeg' }), name);
  return api('POST', url, who, form);
}
async function check(name, fn, kind = 'api') {
  const before = Date.now();
  try { await fn(); report[kind].push({ name, status: 'pass', ms: Date.now() - before }); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { report[kind].push({ name, status: 'fail', error: error.message }); process.stderr.write('FAIL ' + name + ': ' + error.message + '\n'); if (kind === 'browser') process.exitCode = 1; else throw error; }
}
async function register(key, nickname) {
  const created = await api('POST', '/auth/register', null, { nickname, password: 'Live-club-2026!', legalConsent: { accepted: true, version: require('../../shared/legal-documents.json').version } });
  actor[key] = { ...created.user, token: created.token };
  report.accountCount++;
  return actor[key];
}
async function createClub(who, name) {
  const created = await api('POST', '/clubs', who, { name, city: '北京', requestId: crypto.randomUUID() });
  assert.equal(created.pending, false);
  assert.ok(created.club.id);
  return created.club;
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
  await check('AUTH-01 五个账号使用真实注册接口', async () => {
    for (const [key, name] of [['owner', '晨光团长'], ['manager', '河岸管理'], ['a', '城市跑者甲'], ['b', '越野跑者乙'], ['outsider', '外团跑者']]) await register(key, name);
  });
  await check('AUTH-02 验证码登录恢复原账号与错误密码', async () => {
    for (const valid of [false, true]) {
      const captcha = await api('GET', '/auth/captcha');
      const code = db.prepare('SELECT code FROM captchas WHERE token = ?').get(captcha.token).code;
      const result = await api('POST', '/auth/login', null, { nickname: actor.a.nickname, password: valid ? 'Live-club-2026!' : 'wrong-password', captchaToken: captcha.token, captcha: code }, valid ? 200 : 400);
      if (valid) { assert.equal(result.user.id, actor.a.id); actor.a.token = result.token; }
    }
  });
  await check('CLUB-01 两个普通账号无需资格或审批即可创建跑团', async () => {
    club = await createClub(actor.owner, '晨光城市马拉松跑团'); other = await createClub(actor.outsider, '山野独立跑团');
    assert.notEqual(club.id, other.id);
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
      const response = await fetch(origin + '/marathon/api' + act() + '/signup', { method: 'POST', headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: groupA.id, gender: who === actor.a ? '男' : '女', level: '进阶' }) });
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
    const hidden = await fetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.b.token } }); assert.equal(hidden.status, 404);
    await api('POST', act() + '/media/' + media.id + '/approve', actor.a, {}, 403);
    await api('POST', act() + '/media/' + media.id + '/approve', actor.manager, {});
    const shown = await fetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.b.token } }); assert.equal(shown.status, 200);
    const outsider = await fetch(origin + '/marathon/api/media/' + media.id, { headers: { Authorization: 'Bearer ' + actor.outsider.token } }); assert.equal(outsider.status, 403);
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
    assert.equal((await fetch(origin + '/marathon/api/me/runner/media/' + privateId + '/file', { headers: { Authorization: 'Bearer ' + actor.a.token } })).status, 200);
    assert.equal((await fetch(origin + '/marathon/api/me/runner/media/' + privateId + '/file', { headers: { Authorization: 'Bearer ' + actor.manager.token } })).status, 404);
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
    assert.equal((await fetch(origin + '/marathon/api/media/' + extra.id, { headers: { Authorization: 'Bearer ' + actor.b.token } })).status, 404);
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
  if (!process.argv.includes('--api-only')) await browserChecks(fixture);
}

async function browserChecks(fixture) {
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), cacheDir: path.join(temp, 'vite-cache'), configFile: path.join(ROOT, 'web/vite.config.js'), server: { host: '127.0.0.1', port: Number(process.env.MARATHON_LIVE_PREVIEW_PORT || 5175), strictPort: true, proxy: { '/marathon/api': { target: origin, changeOrigin: true } } } });
  await vite.listen();
  const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const base = 'http://127.0.0.1:' + Number(process.env.MARATHON_LIVE_PREVIEW_PORT || 5175) + '/marathon';
  for (const width of process.argv.includes('--journeys-only') ? [] : [320, 390, 1440]) {
    for (const role of ['owner', 'manager', 'a', 'outsider', 'guest']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
      if (role !== 'guest') await context.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, fixture.actor[role]);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let routes = role === 'guest' || role === 'outsider' ? ['/clubs/' + fixture.club.id + '/public', '/clubs/' + fixture.club.id] : ['/clubs', '/clubs/' + fixture.club.id, '/clubs/' + fixture.club.id + '/activities/' + fixture.activity.id, '/clubs/' + fixture.club.id + '/calls/' + fixture.call.id, '/clubs/' + fixture.club.id + '/meetups/' + fixture.meetup.id, '/clubs/' + fixture.club.id + '/internals/' + fixture.internal.id];
      if (['owner', 'manager', 'a'].includes(role) && !process.argv.includes('--details-only')) {
        for (const query of ['tab=act', 'tab=act&view=meetup', 'tab=act&view=internal', 'tab=race', 'tab=km', 'tab=people&view=members', 'tab=people&view=fees', 'tab=people&view=manage', 'tab=album', 'tab=feed', 'tab=partner']) routes.push('/clubs/' + fixture.club.id + '?' + query);
        routes.push('/clubs/' + fixture.club.id + '/activities/' + fixture.activity.id + '/album');
        if (role !== 'a') routes.push('/clubs/' + fixture.club.id + '/activities/new');
      }
      if (process.argv.includes('--details-only')) routes = routes.filter(route => /\/(activities|calls|meetups|internals)\//.test(route));
      await check(`WEB-${width}-${role} 真实 API 页面加载、权限及无横向溢出`, async () => {
        for (const route of routes) {
          const startedAt = Date.now();
          const visit = { width, role, route, status: 'running' };
          report.layoutVisits.push(visit);
          try {
            const previousErrorCount = errors.length;
            await page.goto(base + route); await page.waitForLoadState('networkidle');
            await page.locator('#app').waitFor();
            assert.ok((await page.locator('#app').innerText()).length > 12, 'page content: ' + route);
            visit.dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
            assert.ok(visit.dimensions.scroll <= visit.dimensions.client + 1, `${route} overflow ${JSON.stringify(visit.dimensions)}`);
            if (route === '/clubs/' + fixture.club.id && ['owner', 'manager', 'a'].includes(role)) assert.ok((await page.locator('#app').innerText()).includes(fixture.club.name));
            if (route === '/clubs/' + fixture.club.id && ['guest', 'outsider'].includes(role)) assert.equal(await page.locator('a[href$="/activities/new"]').count(), 0);
            visit.screenshot = 'club-live-' + role + '-' + width + '-' + (route.split('/').slice(2).join('-').replace(/[^A-Za-z0-9-]/g, '-') || 'list') + '.png';
            await page.screenshot({ path: path.join(__dirname, visit.screenshot), fullPage: true });
            visit.pageErrors = errors.slice(previousErrorCount);
            assert.deepEqual(visit.pageErrors, [], 'no page runtime errors');
            visit.status = 'pass';
          } catch (error) {
            visit.status = 'fail'; visit.error = error.message; throw error;
          } finally { visit.ms = Date.now() - startedAt; }
        }
        assert.deepEqual(errors, []);
      }, 'layoutGroups');
      await context.close();
    }
  }
  if (!process.argv.includes('--details-only')) await browserJourneys(fixture, base);
}

async function browserJourneys(fixture, base) {
  const contexts = [];
  async function pageFor(who, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    contexts.push(context);
    await context.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    if (who) await context.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, who);
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('dialog', dialog => dialog.accept());
    return page;
  }
  const c = '/clubs/' + fixture.club.id;
  const owner = await pageFor(actor.owner), member = await pageFor(actor.a), manager = await pageFor(actor.manager);
  const field = (page, name) => page.locator('label.field').filter({ hasText: name }).locator('input');
  const overflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no horizontal overflow');
  let uiActivity;
  await check('UI-01 管理员真实发布三步活动；模板不自动写课表；复制清空日期期次', async () => {
    await owner.goto(base + c + '/activities/new?copy=' + fixture.activity.id);
    await field(owner, '训练标题').waitFor();
    assert.equal(await field(owner, '活动期次').inputValue(), '');
    assert.equal(await field(owner, '开始时间').inputValue(), '');
    await owner.goto(base + c + '/activities/new');
    await field(owner, '训练标题').waitFor();
    await owner.locator('.templates').getByRole('button', { name: /轻松跑/ }).click();
    assert.equal(await field(owner, '训练标题').inputValue(), '');
    await field(owner, '训练标题').fill('浏览器发布·河岸周末轻松跑');
    await field(owner, '开始时间').fill(stamp(Date.now() + 7 * 86400000));
    await field(owner, '结束时间').fill(stamp(Date.now() + 7 * 86400000 + 7200000));
    await field(owner, '训练地点').fill('晨光河岸公园');
    await field(owner, '集合点').fill('公园南门红色雕塑旁');
    await field(owner, '计划距离').fill('10');
    await owner.getByRole('button', { name: /^继续/ }).click();
    assert.equal(await owner.getByPlaceholder('热身、主训练内容、放松安排…').inputValue(), '');
    await owner.getByPlaceholder('热身、主训练内容、放松安排…').fill('按各自能力完成两圈，结束后拉伸。');
    await owner.getByRole('button', { name: /^继续/ }).click();
    await overflow(owner);
    await owner.getByRole('button', { name: '确认发布训练', exact: true }).click();
    await owner.waitForURL(/\/activities\/\d+$/);
    await owner.getByRole('heading', { name: '浏览器发布·河岸周末轻松跑' }).waitFor();
    const id = Number(owner.url().split('/').pop());
    uiActivity = (await api('GET', c + '/activities/' + id, actor.owner)).activity;
    assert.equal(uiActivity.workout, '按各自能力完成两圈，结束后拉伸。');
    await owner.screenshot({ path: path.join(__dirname, 'club-live-ui-created-390.png'), fullPage: true });
  }, 'browser');
  // Keep later independent interactions executable if a create-form regression occurs.
  if (!uiActivity) uiActivity = (await api('POST', c + '/activities', actor.owner, { title: '浏览器报名独立场景', place: '河岸', startsAt: stamp(Date.now() + 7 * 86400000), groups: [{ name: '轻松跑组', capacity: 0, kind: 'pace' }] })).activity;
  await check('UI-02 成员真实选组报名、确认成功、取消后释放名额', async () => {
    await member.goto(base + c + '/activities/' + uiActivity.id + '/signup');
    await member.getByRole('button', { name: '确认报名', exact: true }).waitFor();
    assert.equal(await member.getByRole('button', { name: '确认报名', exact: true }).isEnabled(), false);
    await member.locator('.group-option:not([disabled])').last().click();
    await member.getByRole('button', { name: '确认报名', exact: true }).click();
    await member.locator('.success-panel').waitFor();
    assert.equal((await api('GET', c + '/activities/' + uiActivity.id, actor.a)).activity.mine.signed, true);
    await member.getByRole('link', { name: '查看活动名单', exact: true }).click();
    await member.getByRole('button', { name: '取消我的报名', exact: true }).click();
    await member.getByRole('link', { name: /选择分组报名|报名参加/ }).waitFor();
    assert.equal((await api('GET', c + '/activities/' + uiActivity.id, actor.a)).activity.mine.signed, false);
  }, 'browser');
  await check('UI-03 开始前打卡表单不可见、普通成员无组织工具', async () => {
    const detail = await api('GET', c + '/activities/' + uiActivity.id, actor.a);
    await api('POST', c + '/activities/' + uiActivity.id + '/signup', actor.a, { groupId: detail.groups.at(-1).id });
    await member.goto(base + c + '/activities/' + uiActivity.id);
    await member.getByRole('heading', { name: uiActivity.title }).waitFor();
    assert.equal(await member.getByPlaceholder('打卡里程 km').count(), 0);
    assert.equal(await member.locator('.staff-tools').count(), 0);
    await member.getByText('活动开始后可打卡', { exact: true }).waitFor();
  }, 'browser');
  await check('UI-04 队内赛 radio 可点击、报名取消、开赛后提交成绩', async () => {
    const race = (await api('POST', c + '/internals', actor.owner, { title: '浏览器 5 公里测验', place: '河岸', startsAt: stamp(Date.now() + 8 * 86400000), deadline: stamp(Date.now() + 7 * 86400000), distance: '5k', groups: [{ name: '轻松组', capacity: 2 }, { name: '挑战组', capacity: 2 }] })).race;
    const url = c + '/internals/' + race.id;
    await member.goto(base + url);
    await member.locator('input[type=radio][name=group]').last().check();
    await member.getByRole('button', { name: '报名', exact: true }).click();
    await member.getByRole('button', { name: '取消报名', exact: true }).waitFor();
    assert.equal((await api('GET', url, actor.a)).race.mine.groupId, race.groups[1].id);
    await member.getByRole('button', { name: '取消报名', exact: true }).click();
    await member.getByRole('button', { name: '报名', exact: true }).waitFor();
    assert.equal((await api('GET', url, actor.a)).race.mine, null);
    await member.locator('input[type=radio][name=group]').first().check();
    await member.getByRole('button', { name: '报名', exact: true }).click();
    await member.getByRole('button', { name: '取消报名', exact: true }).waitFor();
    db.prepare('UPDATE internal_races SET starts_at = ?, deadline = ? WHERE id = ?').run(stamp(Date.now() - 60000), stamp(Date.now() - 120000), race.id);
    await member.reload();
    await member.getByPlaceholder('45:30 或 3:29:59').fill('25:30');
    await member.getByRole('button', { name: '提交', exact: true }).click();
    await member.getByText('25:30', { exact: true }).waitFor();
    assert.equal(db.prepare('SELECT seconds FROM internal_results WHERE race_id = ? AND user_id = ?').get(race.id, actor.a.id).seconds, 1530);
    await overflow(member);
  }, 'browser');
  await check('UI-05 约跑接龙真实加入取消；未到日期无打卡', async () => {
    const url = c + '/meetups/' + fixture.meetup.id;
    await member.goto(base + url);
    await member.getByRole('button', { name: '算我一个', exact: true }).click();
    await member.getByRole('button', { name: '不算我了', exact: true }).waitFor();
    assert.equal((await api('GET', url, actor.a)).meetup.joined, true);
    assert.equal(await member.getByRole('button', { name: '打卡', exact: true }).count(), 0);
    await member.getByRole('button', { name: '不算我了', exact: true }).click();
    await member.getByRole('button', { name: '算我一个', exact: true }).waitFor();
    assert.equal((await api('GET', url, actor.a)).meetup.joined, false);
  }, 'browser');
  await check('UI-06 接龙本人录成绩、CSV导出实际文件与长图预览', async () => {
    await member.goto(base + c + '/calls/' + fixture.call.id);
    await member.locator('input[type=radio][name=distance]').first().check();
    await member.getByPlaceholder('1:32:10 或 45:30').fill('3:30:01');
    await member.getByRole('button', { name: '提交', exact: true }).click();
    await member.locator('.mate.mine b').filter({ hasText: '3:30:01' }).waitFor();
    const download = member.waitForEvent('download');
    await member.getByRole('button', { name: '导出完整 CSV', exact: true }).click();
    const file = await download, csv = fs.readFileSync(await file.path(), 'utf8');
    assert.ok(csv.includes(actor.a.nickname)); assert.ok(csv.includes('3:30:01'));
    await member.getByRole('button', { name: '生成成绩长图', exact: true }).click();
    await member.getByAltText('成绩接龙长图').waitFor();
    const image = member.getByAltText('成绩接龙长图');
    assert.ok(await image.evaluate(img => img.complete && img.naturalWidth > 100));
    assert.equal(await member.locator('.poster-preview button').count(), 0);
    await member.screenshot({ path: path.join(__dirname, 'club-live-ui-call-poster-390.png'), fullPage: true });
  }, 'browser');
  await check('UI-07 五个主导航及活动子分类、旧期会费、成员搜索/多团切换', async () => {
    await owner.goto(base + c);
    await owner.locator('nav[aria-label="跑团导航"]').waitFor();
    for (const [name, tab] of [['活动', 'act'], ['赛事', 'race'], ['跑量', 'km'], ['成员', 'people'], ['今日', 'overview']]) {
      await owner.locator('nav[aria-label="跑团导航"]').getByRole('button', { name, exact: true }).click();
      await owner.waitForURL(url => url.searchParams.get('tab') === tab);
      await overflow(owner);
    }
    await owner.goto(base + c + '?tab=act&view=meetup');
    await owner.locator('.secondary-tabs[aria-label="活动类型"]').getByRole('button', { name: /约跑/ }).click();
    assert.ok(owner.url().includes('view=meetup'));
    await owner.goto(base + c + '?tab=people&view=fees');
    await owner.getByRole('button', { name: fixture.fee.name, exact: true }).click();
    await owner.getByRole('heading', { name: fixture.fee.name, exact: true }).waitFor();
    await owner.getByText('已离团', { exact: true }).first().waitFor();
    assert.equal(await owner.getByRole('button', { name: '已收到', exact: true }).count(), 0);
    await owner.goto(base + c + '?tab=people&view=members');
    await owner.getByLabel('搜索跑团成员').fill(actor.a.nickname);
    assert.equal(await owner.locator('.member-directory .mate.member').count(), 1);
    await member.goto(base + '/clubs');
    await member.locator('.my-clubs').getByRole('link').filter({ hasText: fixture.other.name }).click();
    await member.getByRole('heading', { name: fixture.other.name, exact: true }).waitFor();
    await member.screenshot({ path: path.join(__dirname, 'club-live-ui-switch-390.png'), fullPage: true });
  }, 'browser');
  await check('UI-08 管理员无团长权限、成员无管理工具且会费只读', async () => {
    await manager.goto(base + c + '?tab=people&view=members');
    await manager.locator('.member-actions').first().locator('summary').click();
    assert.equal(await manager.getByRole('button', { name: '交给他当团长', exact: true }).count(), 0);
    assert.equal(await manager.getByRole('button', { name: '移出', exact: true }).count() > 0, true);
    await member.goto(base + c + '?tab=people&view=members');
    await member.getByLabel('搜索跑团成员').waitFor();
    assert.equal(await member.locator('.member-actions').count(), 0);
    assert.equal(await member.locator('.requests-block').count(), 0);
    await member.goto(base + c + '?tab=people&view=fees');
    await member.getByRole('heading', { name: '会费名单', exact: true }).waitFor();
    assert.equal(await member.getByRole('button', { name: '已收到', exact: true }).count(), 0);
  }, 'browser');
  await check('UI-09 邀请介绍登录回跳、待审核、团长从成员页审批后进入', async () => {
    const guest = await pageFor(null);
    await guest.goto(base + '/clubs/invite/' + fixture.club.code);
    await guest.locator('.intro-primary').waitFor();
    await guest.locator('.intro-primary').click();
    await guest.waitForURL(/\/mine$/);
    await guest.getByLabel('昵称', { exact: true }).fill(actor.outsider.nickname);
    await guest.locator('.auth-form input[type=password]').fill('Live-club-2026!');
    await guest.locator('.captcha img').waitFor();
    const captcha = db.prepare('SELECT code FROM captchas WHERE used = 0 ORDER BY id DESC LIMIT 1').get(); assert.ok(captcha);
    await guest.getByPlaceholder('上图字符').fill(captcha.code);
    await guest.getByRole('checkbox').check();
    await guest.getByRole('button', { name: '登录', exact: true }).click();
    await guest.waitForURL(/\/clubs\/\d+\/public$/);
    await guest.getByRole('button', { name: '等待审核', exact: true }).waitFor();
    actor.outsider.token = db.prepare('SELECT token FROM users WHERE id = ?').get(actor.outsider.id).token;
    await api('GET', c, actor.outsider, null, 403);
    await owner.goto(base + c + '?tab=people&view=members');
    const row = owner.locator('.requests-block .mate').filter({ hasText: actor.outsider.nickname });
    await row.getByRole('button', { name: '通过', exact: true }).click();
    await row.waitFor({ state: 'detached' });
    await guest.reload(); await guest.getByRole('button', { name: '进入跑团', exact: true }).click();
    await guest.getByRole('heading', { name: fixture.club.name, exact: true }).waitFor();
    await guest.screenshot({ path: path.join(__dirname, 'club-live-ui-invite-approved-390.png'), fullPage: true });
  }, 'browser');
  await check('UI-10 API断网加载可重试恢复；过期登录不显示旧团内数据', async () => {
    let interrupted = true;
    await manager.route('**/marathon/api/clubs/' + fixture.club.id + '/meetups/' + fixture.meetup.id, route => interrupted ? route.abort('failed') : route.continue());
    await manager.goto(base + c + '/meetups/' + fixture.meetup.id);
    await manager.getByRole('button', { name: '重新加载', exact: true }).waitFor();
    interrupted = false;
    await manager.getByRole('button', { name: '重新加载', exact: true }).click();
    await manager.getByRole('heading', { name: new RegExp(fixture.meetup.place) }).waitFor();
    const expired = await pageFor({ token: 'expired-live-browser-token', nickname: '失效账号' });
    await expired.goto(base + c);
    await expired.waitForLoadState('networkidle');
    assert.equal(await expired.locator('.club-hero').count(), 0);
    assert.equal(await expired.locator('.member-directory').count(), 0);
  }, 'browser');
  for (const context of contexts) await context.close();
}

main().catch(error => { report.fatal = error.message; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
  report.summary = { apiPass: report.api.filter(r => r.status === 'pass').length, apiFail: report.api.filter(r => r.status === 'fail').length, browserPass: report.browser.filter(r => r.status === 'pass').length, browserFail: report.browser.filter(r => r.status === 'fail').length, layoutGroupPass: report.layoutGroups.filter(r => r.status === 'pass').length, layoutGroupFail: report.layoutGroups.filter(r => r.status === 'fail').length, layoutVisitPass: report.layoutVisits.filter(r => r.status === 'pass').length, layoutVisitFail: report.layoutVisits.filter(r => r.status === 'fail').length };
  report.passed = !report.fatal && !Object.entries(report.summary).some(([key, count]) => key.endsWith('Fail') && count > 0);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, 'club-live-acceptance-report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report.summary) + '\n');
});
