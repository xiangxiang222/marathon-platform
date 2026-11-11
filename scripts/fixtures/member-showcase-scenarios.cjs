'use strict';
// Additive showcase fixtures. Caller owns connection, cohort validation and
// durable journal. Importing this module performs no I/O or network requests.
const assert = require('node:assert/strict');
const DAY = 86400000, MARKER = '【模拟】成员场景261111';
const dayShift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const clock = seconds => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
function periods(date) {
  const week = new Date(date + 'T00:00:00Z').getUTCDay() || 7;
  const monthStart = date.slice(0, 7) + '-01', weekStart = dayShift(date, 1 - week);
  const beforeWeek = dayShift(weekStart, -2);
  return [...new Set([date, dayShift(date, -1), dayShift(date, -2), dayShift(date, -4), dayShift(date, -6),
    beforeWeek >= monthStart ? beforeWeek : monthStart, dayShift(date, -10), date.slice(0, 4) + '-02-15',
    date.slice(0, 4) + '-06-15', String(Number(date.slice(0, 4)) - 1) + '-11-15'])].filter(d => d <= date);
}
function freeStart(db, userId, date, duration, nowMs, minMs = 0) {
  const rows = db.prepare('SELECT started_at,duration_sec FROM runs WHERE user_id=? AND substr(started_at,1,10)=?').all(userId, date);
  for (let minute = 6 * 60; minute < 23 * 60; minute += 10) {
    const local = date + 'T' + String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    const start = Date.parse(local + ':00+08:00');
    if (start < minMs || start + duration * 1000 > nowMs) continue;
    if (rows.every(r => { const s = Date.parse(r.started_at + ':00+08:00'); return start + duration * 1000 <= s || start >= s + r.duration_sec * 1000; })) return local;
  }
  throw new Error('No completed nonoverlapping interval for synthetic user ' + userId + ' on ' + date);
}
async function seed(ctx) {
  const { db, api, once, users, clubs, owner } = ctx;
  assert.equal(users.length, 200); assert.equal(clubs.length, 10);
  const date = ctx.day(), dates = periods(date);
  const report = { marker: MARKER, date, historicalClubInclusion: !!ctx.includeSimulatedHistory, runDates: dates, races: [], users: [], clubs: [] };
  const specs = [
    { key: 'wish', title: '城市迎春跑', offset: 70, status: '想跑' },
    { key: 'drawn', title: '湖畔冬日半程', offset: 21, status: '中签' },
    { key: 'finished-5k', title: '秋日公园五公里', offset: -35, status: '完赛', distance: '5k' },
    { key: 'finished-10k', title: '滨江十公里挑战', offset: -70, status: '完赛', distance: '10k' },
    { key: 'finished-half', title: '湖畔初夏半程跑', offset: -170, status: '完赛', distance: 'half' },
    { key: 'finished-full', title: '春日城市马拉松', offset: -240, status: '完赛', distance: 'full' }
  ];
  for (const spec of specs) {
    const name = MARKER + ' · ' + spec.title;
    const made = await once('showcase:race:' + spec.key, async () => {
      const found = db.prepare('SELECT id,organizer FROM races WHERE name=? AND race_date=?').get(name, ctx.day(spec.offset));
      if (found) { assert.equal(found.organizer, MARKER); return { id: found.id }; }
      const race = await api('POST', '/admin/races', ctx.admin, { name, raceDate: ctx.day(spec.offset), city: '杭州', province: '浙江',
        place: '【模拟】城市公园演示路线', distances: ['full', 'half', '10k', '5k'], kinds: [], meet: 'offline', startAt: '07:30',
        organizer: MARKER, groups: '', grade: '', fee: '【模拟】不实际收费', scale: '【模拟】演示',
        guideText: '# ' + name + '\n\n仅供模拟数据展示，非真实赛事；模拟报名、中签及成绩不代表官方记录。',
        signupUrl: '', drawUrl: '', bibUrl: '', resultUrl: '', liveUrl: '', eventUrl: '', officialUrl: '', phone: '' });
      return { id: race.id };
    });
    if (spec.key === 'drawn') await once('showcase:race-nodes:' + spec.key, async () => {
      ctx.assertNewRow('races', made.id);
      await api('PUT', '/admin/races/' + made.id, ctx.admin, { regStart: ctx.day(-55), deadline: ctx.day(-7), drawAt: ctx.day(-4), payDeadline: ctx.day(2), deadlineName: '模拟报名截止', source: MARKER });
      return { id: made.id };
    });
    report.races.push({ ...made, key: spec.key, status: spec.status, name, ...(spec.distance ? { distance: spec.distance } : {}) });
  }
  for (const user of users) {
    const userRow = { userId: user.id, runs: [], plans: [], results: [] };
    userRow.introduction = await once('showcase:introduction:' + user.id, async () => {
      const existing = db.prepare('SELECT introduction FROM users WHERE id=?').get(user.id).introduction;
      if (existing?.trim()) return { userId: user.id, characters: [...existing].length, preserved: true };
      const hobby = ['公园晨跑', '河畔轻松跑', '周末长距离', '操场间歇', '山径探索'][user.index % 5];
      const goal = ['稳定积累耐力', '完成下一场半马', '养成规律训练', '跑得更轻松', '享受每次出发', '和团友一起进步', '尝试新的安全路线'][user.index % 7];
      const introduction = '【模拟】' + user.nickname + '的跑步档案：喜欢' + hobby + '，目标是' + goal + '。每周训练2–3次，重视热身与恢复。这是合成账号的场景简介。';
      await api('PUT', '/me/introduction', user, { introduction });
      return { userId: user.id, characters: [...introduction].length };
    });
    const memberships = db.prepare('SELECT club_id,joined_at FROM club_members WHERE user_id=? AND club_id BETWEEN 13 AND 22').all(user.id);
    assert.ok(memberships.length, 'Every synthetic user must already belong to at least one target club');
    for (const [i, datePart] of dates.entries()) {
      const km = 5 + ((user.index * 3 + i * 2) % 12) + (user.index % 5) / 10;
      const duration = Math.round(km * (315 + user.index % 80));
      const record = await once('showcase:run:' + user.id + ':' + datePart, async () => {
        const found = db.prepare('SELECT * FROM runs WHERE user_id=? AND city=? AND substr(started_at,1,10)=?').get(user.id, MARKER, datePart);
        if (found) return { id: found.id, date: datePart, km: found.distance_km, recovered: true };
        const minMs = datePart === date ? Math.max(...memberships.map(m => Date.parse(m.joined_at))) : 0;
        const startedAt = freeStart(db, user.id, datePart, duration, ctx.nowMs, minMs);
        const result = await api('POST', '/runs', user, { type: i === 8 ? 'trail' : 'run', startedAt, distanceKm: km, duration: clock(duration), climb: i === 8 ? 260 : 0, city: MARKER });
        assert.equal(result.run.overlap, false);
        return { id: result.run.id, date: datePart, km };
      });
      for (const membership of memberships) {
        const joinedDate = new Date(Date.parse(membership.joined_at) + 8 * 3600000).toISOString().slice(0, 10);
        if (datePart !== date && !ctx.includeSimulatedHistory && datePart < joinedDate) continue;
        await once('showcase:count:' + membership.club_id + ':' + record.id, async () => {
          const count = db.prepare('SELECT counted FROM mileage_counts WHERE club_id=? AND run_id=?').get(membership.club_id, record.id);
          assert.ok(count, 'API run must create a mileage count');
          if (!count.counted) {
            ctx.assertNewRow('runs', record.id);
            await api('POST', '/clubs/' + membership.club_id + '/mileage/runs/' + record.id + '/decision', owner, { counted: true });
            ctx.recordSetup('new-synthetic-run-manual-inclusion', { clubId: membership.club_id, userId: user.id, runId: record.id, date: datePart,
              beforeMembership: datePart < joinedDate, reason: 'Only this batch new synthetic run; explicit simulated club history, not official verification' });
          }
          return { clubId: membership.club_id, runId: record.id };
        });
      }
      userRow.runs.push(record);
    }
    for (const race of report.races) {
      if (race.status !== '完赛') {
        const plan = await once('showcase:plan:' + user.id + ':' + race.id, async () => {
          const existing = db.prepare('SELECT status FROM plans WHERE user_id=? AND race_id=?').get(user.id, race.id);
          if (existing) return { raceId: race.id, status: existing.status, preserved: true };
          await api('PUT', '/me/races/' + race.id, user, { status: race.status });
          return { raceId: race.id, status: race.status };
        }); userRow.plans.push(plan);
      } else {
        for (const distance of [race.distance]) {
          const result = await once('showcase:result:' + user.id + ':' + race.id + ':' + distance, async () => {
            const existing = db.prepare('SELECT seconds FROM results WHERE user_id=? AND race_id=? AND distance=?').get(user.id, race.id, distance);
            if (existing) return { raceId: race.id, distance, seconds: existing.seconds, preserved: true };
            const base = { '5k': 1500, '10k': 3180, half: 7140, full: 15300 }[distance];
            const seconds = base + user.index * (distance === 'full' ? 23 : distance === 'half' ? 12 : 4);
            await api('PUT', '/me/races/' + race.id + '/result', user, { distance, time: clock(seconds), story: '【模拟】成员展示成绩，非真实完赛或官方认证。' });
            return { raceId: race.id, distance, seconds };
          }); userRow.results.push(result);
        }
      }
    }
    report.users.push(userRow);
    if (ctx.progress && report.users.length % 20 === 0) ctx.progress('users', report.users.length, 200);
  }
  for (const club of clubs) {
    const base = '/clubs/' + club.id, people = ctx.members(club.id);
    assert.ok(people.length >= 6);
    for (const [index, letter] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) await once('showcase:group:' + club.id + ':' + letter, async () => {
      const name = letter + '组 · ' + ['速度', '进阶', '稳定', '轻松', '入门', '陪伴'][index];
      const found = db.prepare('SELECT id FROM mileage_groups WHERE club_id=? AND (name=? OR name=? OR name LIKE ?) ORDER BY id LIMIT 1').get(club.id, name, letter, letter + '组%');
      if (found) return { id: found.id, preserved: true };
      if (db.prepare('SELECT COUNT(*) n FROM mileage_groups WHERE club_id=?').get(club.id).n >= 30) return { preserved: true, limit: true };
      return { id: (await api('POST', base + '/training-groups', owner, { name, pace: ['4:30–5:00', '5:00–5:30', '5:30–6:00', '6:00–6:30', '6:30–7:00', '按舒适配速'][index], description: '【模拟】成员展示训练组，可按体感选择。', capacity: 0, sort: index + 10 })).group.id };
    });
    const mapping = await once('showcase:group-mapping:' + club.id, async () => {
      const groups = db.prepare('SELECT * FROM mileage_groups WHERE club_id=? ORDER BY sort,id').all(club.id);
      assert.ok(groups.length <= people.length, 'Not enough synthetic members to populate every existing group');
      const realCounts = new Map(groups.map(g => [g.id, db.prepare('SELECT COUNT(*) n FROM club_members WHERE club_id=? AND mileage_group_id=? AND user_id NOT BETWEEN 8 AND 207').get(club.id, g.id).n]));
      const assigned = new Map(groups.map(g => [g.id, 0])), rows = [];
      for (let i = 0; i < people.length; i++) {
        const available = groups.filter(g => !g.capacity || realCounts.get(g.id) + assigned.get(g.id) < g.capacity).sort((a, b) => assigned.get(a.id) - assigned.get(b.id) || a.sort - b.sort || a.id - b.id);
        assert.ok(available.length, 'All training groups are full; preserve capacities');
        const g = available[0]; assigned.set(g.id, assigned.get(g.id) + 1); rows.push({ userId: people[i].id, groupId: g.id });
      }
      assert.ok(groups.every(g => assigned.get(g.id) > 0), 'A full existing group cannot receive a synthetic member; do not overwrite real membership');
      return { rows, groups: groups.map(g => ({ id: g.id, name: g.name })) };
    });
    // Two-phase reassignment avoids temporarily exceeding finite capacities.
    for (const row of mapping.rows) await once('showcase:unassign:' + club.id + ':' + row.userId, async () => {
      await api('PUT', base + '/training-groups/members/' + row.userId, owner, { groupId: 0 }); return row;
    });
    for (const row of mapping.rows) await once('showcase:assign:' + club.id + ':' + row.userId, async () => {
      await api('PUT', base + '/training-groups/members/' + row.userId, owner, { groupId: row.groupId }); return row;
    });
    const albumActivity = await once('showcase:album:' + club.id, async () => {
      const title = MARKER + ' · 训练时光相册';
      const found = db.prepare('SELECT id,note FROM activities WHERE club_id=? AND title=?').get(club.id, title);
      if (found) { assert.equal(found.note, MARKER); return { id: found.id }; }
      const result = await api('POST', base + '/activities', owner, { title, place: '【模拟】公园绿道', startsAt: ctx.stamp(-1, '07:00'), endsAt: ctx.stamp(-1, '09:00'),
        trainingType: 'easy', minPeople: 1, minKm: 1, points: 0, review: false, plannedKm: 8, note: MARKER,
        workout: '【模拟】分组热身、轻松跑、拉伸。相册为明确标注的训练插画，不是真人照片。', groups: [{ name: '全员轻松组', kind: 'pace', pace: '舒适配速', capacity: 0 }] });
      return { id: result.activity.id };
    });
    const media = [];
    for (const user of people) {
      const item = await once('showcase:photo:' + club.id + ':' + user.id, async () => {
        const existing = db.prepare("SELECT id FROM activity_media WHERE activity_id=? AND user_id=? AND kind='photo' AND status='shown' AND filename!='' ORDER BY id LIMIT 1").get(albumActivity.id, user.id);
        if (existing) return { id: existing.id, userId: user.id, recovered: true };
        const variant = ['park', 'track', 'trail', 'medal'][(user.index + club.id) % 4];
        const result = await ctx.upload(base + '/activities/' + albumActivity.id + '/media', user, ctx.art[variant], '模拟训练插画-' + variant + '.png');
        assert.equal(result.media.status, 'shown');
        return { id: result.media.id, userId: user.id, variant };
      }); media.push(item);
    }
    await once('showcase:album-cover:' + club.id, async () => {
      const activity = db.prepare('SELECT cover_id FROM activities WHERE id=?').get(albumActivity.id);
      if (activity.cover_id !== media[0].id) { ctx.assertNewRow('activities', albumActivity.id); await api('POST', base + '/activities/' + albumActivity.id + '/cover', owner, { mediaId: media[0].id }); }
      return { mediaId: media[0].id };
    });
    report.clubs.push({ clubId: club.id, groups: mapping.groups, members: mapping.rows, activityId: albumActivity.id, media });
    if (ctx.progress) ctx.progress('clubs', report.clubs.length, 10);
  }
  return report;
}
module.exports = seed;
module.exports.periods = periods;
module.exports.freeStart = freeStart;
module.exports.MARKER = MARKER;
