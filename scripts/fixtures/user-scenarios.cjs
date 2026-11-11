/* User-owned synthetic scenarios. No transport, environment or database setup.
 * The orchestrator supplies an explicitly scoped ctx; importing this file does
 * nothing. Writes go through ctx.api/upload and ctx.once; db is read-only here.
 */
const assert = require('node:assert/strict');

const KM = { full: 42.195, half: 21.0975, '10k': 10, '5k': 5 };
const PLAN_STATES = {
  settled: ['中签', '未中签', '已缴费', '已领物', '弃赛', '想跑'],
  open: ['想跑', '已报名', '待抽签', '弃赛'],
  waiting: ['已报名', '待抽签', '想跑'],
  online: ['想跑', '已报名', '已缴费', '弃赛'],
  unannounced: ['想跑']
};
const CITIES = [['杭州', '浙江'], ['北京', '北京'], ['上海', '上海'], ['成都', '四川'], ['南京', '江苏']];
const clock = seconds => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
const localStamp = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
const localMs = stamp => {
  const value = String(stamp || '').replace(' ', 'T');
  return Date.parse(value + (/Z$|[+-]\d{2}:\d{2}$/.test(value) ? '' : (value.length === 16 ? ':00' : '') + '+08:00'));
};
const distances = race => {
  if (Array.isArray(race.distanceKeys)) return race.distanceKeys;
  if (Array.isArray(race.distances)) return race.distances;
  try { const parsed = JSON.parse(race.distances); if (Array.isArray(parsed)) return parsed; } catch (_) {}
  return String(race.distances || '').split(',');
};
const rounded = n => Math.round(n * 100) / 100;

module.exports = async function userScenarios(ctx) {
  const { db, api, once, clubs, owner, catalog, upload } = ctx;
  const users = ctx.users.map(user => ({ ...user, index: user.index ?? user.index0based }));
  const tag = ctx.tag || '【模拟】';
  const now = Number(ctx.nowMs);
  assert(Number.isFinite(now), 'ctx.nowMs must be a fixed orchestration timestamp');
  assert.equal(users.length, 200, 'This fixture requires the explicit 200-user allowlist');
  assert.equal(new Set(users.map(user => user.id)).size, 200, 'User IDs must be unique');
  assert.equal(clubs.length, 10, 'This fixture requires the explicit 10-club allowlist');
  assert(catalog?.pastRaces?.length >= 3 && catalog?.futureRaces?.length >= 3, 'Catalog must run first');
  const today = ctx.day();
  const month = today.slice(0, 7);
  assert.equal(today, localStamp(now).slice(0, 10), 'ctx.day and nowMs must use the same Beijing day');
  const userMap = new Map(users.map(user => [Number(user.id), user]));
  const clubSet = new Set(clubs.map(club => Number(club.id)));
  const report = { users: [], clubs: [], skipped: [], media: [], notes: [
    'Preserves existing nickname/avatar, month target, radar profile, mileage rule and nonzero mileage group assignment.',
    'No DB mutations, legal consent, external device status, feedback, calls or notifications are generated here.',
    'Past personal runs are historical simulation; PK uses original joined_at and completed Beijing-today intervals.'
  ] };
  const one = (sql, ...values) => db.prepare(sql).get(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values);
  const key = (...parts) => ['users-v1', ...parts].join(':');
  const skip = (kind, details) => { report.skipped.push({ kind, ...details }); return { skipped: true, ...details }; };

  // Verify exact allowlisted identities without hard-coding local rehearsal IDs.
  // Production orchestration additionally checks original manifest/created_at.
  for (const user of users) {
    const row = one('SELECT id,nickname FROM users WHERE id=?', user.id);
    assert(row && row.nickname === user.nickname, `Allowlist identity mismatch: ${user.id}`);
    assert(Number.isInteger(user.index) && user.index >= 0 && user.index < 200, 'Expected index 0..199');
    assert.equal(user.nickname, '测试跑者' + String(user.index + 1).padStart(3, '0'));
    assert(user.token, `Missing scoped actor token: ${user.id}`);
  }
  assert.equal(new Set(users.map(user => user.index)).size, 200);
  for (const [group, races] of [['past', catalog.pastRaces], ['future', catalog.futureRaces]]) {
    for (const race of races) {
      const row = one('SELECT id,name,race_date FROM races WHERE id=?', race.id);
      assert(row && row.name.includes(tag), 'Catalog must contain only newly created labelled simulation races');
      assert(group === 'past' ? row.race_date < today : row.race_date > today, 'Catalog race date does not match its role');
    }
  }

  // Install only missing rules, before runs, so automatic per-club judging uses
  // real original membership timestamps and a stable rule snapshot.
  const rules = new Map();
  for (const club of clubs) {
    assert.equal(Number(club.owner_id), Number(owner.id), 'ctx.owner must own target clubs');
    const base = '/clubs/' + club.id + '/mileage';
    const rule = await once(key('club', club.id, 'rules'), async () => {
      const existing = one('SELECT * FROM mileage_rules WHERE club_id=?', club.id);
      if (existing) return { preserved: true, rule: existing };
      await api('PUT', base + '/rules', owner, { effectiveOn: ctx.day(-56), manualOk: true, runOn: true,
        runMin: 1, runMax: 60, paceFast: '3:00', paceSlow: '10:00', trailOn: true, trailMin: 3,
        trailClimb: 100, trailClimbAdd: true, flagFemale: 30, flagMale: 40, observe: true });
      return { created: true, rule: one('SELECT * FROM mileage_rules WHERE club_id=?', club.id) };
    });
    // Fetch current row: a user may have legitimately updated a rule on a later
    // invocation; once results must never restore an old snapshot.
    const currentRule = one('SELECT * FROM mileage_rules WHERE club_id=?', club.id);
    assert(currentRule, 'Mileage rule creation failed');
    rules.set(Number(club.id), currentRule);
    const groupRows = [];
    for (let index = 0; index < 2; index++) {
      const name = tag + ['晨跑组', '进阶组'][index];
      groupRows.push(await once(key('club', club.id, 'group', index), async () => {
        const existing = one('SELECT * FROM mileage_groups WHERE club_id=? AND name=?', club.id, name);
        if (existing) return { ...existing, preserved: true };
        const count = one('SELECT COUNT(*) n FROM mileage_groups WHERE club_id=?', club.id).n;
        if (count >= 30) return skip('group-limit', { clubId: club.id, name });
        const answer = await api('POST', base + '/groups', owner, { name, capacity: 0, sort: 10 + index });
        return answer.group;
      }));
    }
    const actors = ctx.members(club.id);
    assert(Array.isArray(actors), 'ctx.members must synchronously return synthetic actors');
    let assigned = 0;
    for (const user of actors) {
      assert(userMap.has(Number(user.id)), 'ctx.members returned a non-allowlisted member');
      const group = groupRows[userMap.get(Number(user.id)).index % 2];
      if (!group?.id) continue;
      const result = await once(key('club', club.id, 'assignment', user.id), async () => {
        const member = one('SELECT mileage_group_id FROM club_members WHERE club_id=? AND user_id=?', club.id, user.id);
        if (!member) return skip('missing-membership', { clubId: club.id, userId: user.id });
        if (member.mileage_group_id) return { preserved: true, groupId: member.mileage_group_id };
        await api('PUT', base + '/members/' + user.id, owner, { groupId: group.id });
        return { assigned: true, groupId: group.id };
      });
      if (result.assigned) assigned++;
    }
    report.clubs.push({ clubId: club.id, rulePreserved: !!rule.preserved, groups: groupRows.map(group => group.id || null), assigned });
  }

  function intervals(userId) {
    return all('SELECT started_at,ended_at,duration_sec FROM runs WHERE user_id=?', userId).map(row => {
      const start = localMs(row.started_at);
      const rawEnd = row.ended_at && localMs(row.ended_at);
      return { start, end: Number.isFinite(rawEnd) ? rawEnd : start + row.duration_sec * 1000 };
    }).filter(row => Number.isFinite(row.start));
  }
  const free = (rows, start, duration) => !rows.some(row => start < row.end && row.start < start + duration * 1000);
  function historicSlot(userId, date, duration) {
    const rows = intervals(userId);
    for (let minute = 0; minute <= 12 * 60; minute += 15) {
      const start = Date.parse(date + 'T05:30:00+08:00') + minute * 60000;
      if (start + duration * 1000 <= now && free(rows, start, duration)) return localStamp(start);
    }
    return null;
  }
  function pkCandidate(userId) {
    const memberships = all('SELECT club_id,joined_at FROM club_members WHERE user_id=?', userId).filter(row => clubSet.has(Number(row.club_id)));
    const available = memberships.map(member => ({ member, rule: rules.get(Number(member.club_id)) })).filter(({ rule }) => rule && rule.manual_ok && rule.run_on && rule.run_min > 0 && rule.run_max >= rule.run_min && rule.pace_fast > 0 && rule.pace_slow > rule.pace_fast);
    if (!available.length) return { reason: 'Existing club rules do not permit a valid manual road run' };
    const rows = intervals(userId), dayStart = Date.parse(today + 'T00:00:00+08:00');
    let best = null;
    for (const source of available) {
      const distance = rounded(Math.max(source.rule.run_min, Math.min(source.rule.run_max, 6 + userMap.get(Number(userId)).index % 6)));
      const pace = Math.round(Math.max(source.rule.pace_fast, Math.min(source.rule.pace_slow, 330 + userMap.get(Number(userId)).index % 9 * 10)));
      const duration = Math.max(1, Math.round(distance * pace));
      const latest = Math.floor((now - duration * 1000 - 120000) / 60000) * 60000;
      const earliest = Math.max(dayStart, Date.parse(source.member.joined_at), Date.parse(source.rule.effective_on + 'T00:00:00+08:00'));
      const preferred = Date.parse(today + 'T06:00:00+08:00');
      const candidates = [preferred];
      for (let start = latest; start >= earliest; start -= 60000) candidates.push(start);
      for (const start of candidates) {
        if (start < earliest || start > latest || !free(rows, start, duration)) continue;
        const eligibleClubs = available.filter(({ member, rule }) => start >= Date.parse(member.joined_at) && today >= rule.effective_on && distance >= rule.run_min && distance <= rule.run_max && pace >= rule.pace_fast && pace <= rule.pace_slow).map(item => Number(item.member.club_id));
        if (!best || eligibleClubs.length > best.eligibleClubs.length) best = { startedAt: localStamp(start), distanceKm: distance, duration: clock(duration), climb: 0, type: 'run', eligibleClubs };
        break;
      }
    }
    return best || { reason: 'No non-overlapping completed Beijing-today interval after original joined_at fits before nowMs' };
  }

  const past = [...catalog.pastRaces].sort((a, b) => String(a.raceDate || a.race_date || one('SELECT race_date FROM races WHERE id=?', a.id).race_date).localeCompare(String(b.raceDate || b.race_date || one('SELECT race_date FROM races WHERE id=?', b.id).race_date)));
  for (const user of users) {
    const index = user.index, city = CITIES[index % CITIES.length];
    const item = { userId: user.id, nickname: user.nickname, historicalRuns: [], pk: null, plans: [], results: [], history: null };
    await once(key(user.id, 'month-target', month), async () => {
      const existing = one('SELECT target_km FROM mileage_flags WHERE user_id=? AND month=?', user.id, month);
      if (existing) return { preserved: true, targetKm: existing.target_km };
      const storedGender = one('SELECT gender FROM user_mileage WHERE user_id=?', user.id);
      const gender = storedGender ? storedGender.gender : index % 2 ? '女' : '男';
      const memberRules = all('SELECT club_id FROM club_members WHERE user_id=?', user.id).map(member => one('SELECT * FROM mileage_rules WHERE club_id=?', member.club_id)).filter(Boolean);
      const floor = Math.max(1, ...memberRules.map(rule => gender === '女' ? rule.flag_female : gender === '男' ? rule.flag_male : Math.max(rule.flag_female, rule.flag_male)));
      const targetKm = Math.max(floor, 40 + index % 9 * 15);
      await api('PUT', '/runs-flag', user, { month, gender, targetKm });
      return { targetKm, gender };
    });
    await once(key(user.id, 'radar'), async () => {
      if (one('SELECT 1 FROM radar_profiles WHERE user_id=?', user.id)) return { preserved: true };
      const gender = one('SELECT gender FROM user_mileage WHERE user_id=?', user.id)?.gender || '';
      await api('PUT', '/me/radar', user, { gender, birth: (1980 + index % 22) + '-' + String(index % 12 + 1).padStart(2, '0'), province: city[1], targets: { full: clock(10800 + index % 20 * 180), half: clock(4800 + index % 24 * 90), '10k': clock(2400 + index % 15 * 60), '5k': '' } });
      return { created: true };
    });
    const count = 12 + index % 7;
    for (let number = 0; number < count; number++) {
      const result = await once(key(user.id, 'past-run', number), async () => {
        const offset = -(1 + Math.floor(number * 55 / count));
        const trail = number % 6 === 5, distanceKm = trail ? 10 + index % 6 : 5 + (index + number) % 10;
        const duration = Math.round(distanceKm * (trail ? 480 + index % 6 * 10 : 315 + (index + number) % 10 * 12));
        const startedAt = historicSlot(user.id, ctx.day(offset), duration);
        if (!startedAt) return skip('historical-time-full', { userId: user.id, date: ctx.day(offset) });
        const answer = await api('POST', '/runs', user, { type: trail ? 'trail' : 'run', startedAt, distanceKm, duration: clock(duration), climb: trail ? 200 + index % 8 * 50 : 0, city: city[0] });
        assert.equal(answer.run?.overlap, false, 'New personal fixture must not overlap another run');
        return { runId: answer.run.id, startedAt, distanceKm, type: trail ? 'trail' : 'run' };
      });
      if (result.runId) item.historicalRuns.push(result.runId);
    }
    item.pk = await once(key(user.id, 'today-pk', today), async () => {
      const candidate = pkCandidate(user.id);
      if (!candidate.startedAt) return skip('pk-unavailable', { userId: user.id, reason: candidate.reason });
      const { eligibleClubs, ...body } = candidate;
      const answer = await api('POST', '/runs', user, { ...body, city: city[0] });
      const counts = all('SELECT club_id,counted FROM mileage_counts WHERE run_id=?', answer.run.id).filter(row => clubSet.has(Number(row.club_id)));
      assert(!answer.run.overlap, 'PK fixture must not overlap');
      assert(counts.some(row => row.counted), 'Expected automatic PK inclusion in at least one target club');
      return { runId: answer.run.id, eligibleClubs, countedClubs: counts.filter(row => row.counted).map(row => row.club_id), startedAt: body.startedAt, duration: body.duration };
    });
    for (let number = 0; number < 3; number++) {
      const race = catalog.futureRaces[(index + number) % catalog.futureRaces.length];
      item.plans.push(await once(key(user.id, 'future-plan', race.id), async () => {
        const existing = one('SELECT status FROM plans WHERE user_id=? AND race_id=?', user.id, race.id);
        if (existing) return { raceId: race.id, status: existing.status, preserved: true };
        const choices = PLAN_STATES[race.scenarioPhase];
        assert(choices, 'Future catalog race requires a supported scenarioPhase');
        const status = choices[(index + number) % choices.length];
        await api('PUT', '/me/races/' + encodeURIComponent(race.id), user, { status });
        return { raceId: race.id, status };
      }));
    }
    const selected = [past[index % past.length], past[(index + 1) % past.length]].sort((a,b) => one('SELECT race_date FROM races WHERE id=?', a.id).race_date.localeCompare(one('SELECT race_date FROM races WHERE id=?', b.id).race_date));
    const preferred = index % 4 === 0 ? 'full' : index % 4 === 3 ? '10k' : 'half';
    for (let number = 0; number < selected.length; number++) {
      const race = selected[number];
      const distance = distances(race).includes(preferred) ? preferred : distances(race).find(value => KM[value]);
      assert(distance, 'Past catalog race needs a supported standard distance');
      const result = await once(key(user.id, 'race-result', race.id, distance), async () => {
        const existing = one('SELECT seconds FROM results WHERE user_id=? AND race_id=? AND distance=?', user.id, race.id, distance);
        if (existing) return { raceId: race.id, distance, seconds: existing.seconds, preserved: true };
        const seconds = Math.round(KM[distance] * (285 + index % 17 * 6)) + (number === 0 ? 240 : 0);
        await api('PUT', '/me/races/' + encodeURIComponent(race.id) + '/result', user, { distance, time: clock(seconds), story: tag + '训练积累后的稳定发挥；此成绩为合成展示资料，未经赛事官方核验。' });
        return { raceId: race.id, distance, seconds, created: true };
      });
      item.results.push(result);
      // Never reinterpret pre-existing human-confirmed timing; only bridge this
      // module's freshly created old-style result into the new private archive.
      if (result.created) await once(key(user.id, 'result-timing', race.id, distance), async () => {
        const entryId = 'result:' + race.id + ':' + distance;
        if (one('SELECT 1 FROM race_history_entries WHERE user_id=? AND legacy_key=?', user.id, entryId)) return { entryId, preserved: true };
        await api('PATCH', '/me/race-history/' + encodeURIComponent(entryId), user, { timing: 'net', netTime: clock(result.seconds), gunTime: clock(result.seconds + 60), unknownTime: '', tags: number ? ['突破', '坚持'] : ['城市'] });
        return { entryId, timing: 'net' };
      });
    }
    item.history = await once(key(user.id, 'private-history'), async () => {
      const kindIndex = index % 4;
      const name = tag + ['山径体验赛', '雨天半程回忆', '城市五公里回忆', '周末线上跑'][kindIndex] + String(index + 1).padStart(3, '0');
      const raceDate = ctx.day(-35 - index % 18);
      const existing = one('SELECT id FROM race_history_entries WHERE user_id=? AND name=? AND race_date=? AND deleted=0', user.id, name, raceDate);
      if (existing) return { entryId: 'exp:' + existing.id, preserved: true };
      const body = { name, raceDate, city: city[0], province: city[1], distance: kindIndex === 0 ? 'other' : kindIndex === 1 ? 'half' : '5k', kind: kindIndex === 0 ? 'trail' : 'road', meet: kindIndex === 3 ? 'online' : 'offline', status: kindIndex === 1 ? 'dnf' : kindIndex === 2 ? 'dns' : 'finished', timing: 'unknown', story: tag + '私人跑史的合成回忆，用于展示不同参赛状态。', tags: [kindIndex === 1 ? '归来' : '享受比赛'] };
      if (body.status === 'finished') body.unknownTime = kindIndex === 0 ? '02:25:00' : '00:30:00';
      const answer = await api('POST', '/me/race-history', user, body, 201);
      return { entryId: answer.entry.id, status: body.status, kind: body.kind };
    });
    if (index < 20 && item.results[0]?.created) {
      const first = item.results[0];
      report.media.push(await once(key(user.id, 'runner-photo'), async () => {
        const prior = one("SELECT id FROM runner_media WHERE user_id=? AND race_id=? AND distance=? AND kind='photo'", user.id, first.raceId, first.distance);
        if (prior) return { userId: user.id, mediaId: prior.id, preserved: true };
        const answer = await upload('/me/runner/media?kind=photo&raceId=' + encodeURIComponent(first.raceId) + '&distance=' + first.distance, user, ctx.fixturePhoto, '模拟个人跑步照片.png');
        return { userId: user.id, media: answer.media };
      }));
    }
    if (index >= 20 && index < 30 && item.history?.entryId && !item.history.preserved) {
      report.media.push(await once(key(user.id, 'history-photo'), async () => {
        const answer = await upload('/me/race-history/' + encodeURIComponent(item.history.entryId) + '/media?kind=photo', user, ctx.fixturePhoto, '模拟私人跑史照片.png');
        return { userId: user.id, media: answer.media };
      }));
    }
    report.users.push(item);
  }

  // Exercise review only on rows created/tracked by this module. A second
  // synthetic club member challenges; the real owner is used only to manage.
  for (const club of clubs) {
    const candidates = report.users.filter(row => row.pk?.runId && row.pk.countedClubs.includes(Number(club.id))).slice(0, 3);
    const actors = ctx.members(club.id);
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const challenger = actors.find(actor => Number(actor.id) !== Number(candidate.userId));
      if (!challenger) continue;
      await once(key('club', club.id, 'review', candidate.pk.runId), async () => {
        const current = one('SELECT counted,challenge,decision FROM mileage_counts WHERE club_id=? AND run_id=?', club.id, candidate.pk.runId);
        if (!current?.counted || current.challenge || current.decision) return { preserved: true };
        await api('POST', '/clubs/' + club.id + '/mileage/runs/' + candidate.pk.runId + '/challenge', challenger, { reason: tag + '演示记录核对流程' });
        if (index > 0) await api('POST', '/clubs/' + club.id + '/mileage/runs/' + candidate.pk.runId + '/decision', owner, { counted: index === 2 });
        return { runId: candidate.pk.runId, status: index === 0 ? 'challenged' : index === 1 ? 'excluded' : 'included' };
      });
    }
  }
  report.summary = { users: report.users.length, historicalRuns: report.users.reduce((n,user) => n + user.historicalRuns.length, 0), todayPkRuns: report.users.filter(user => user.pk?.runId).length,
    futurePlans: report.users.reduce((n,user) => n + user.plans.length, 0), raceResults: report.users.reduce((n,user) => n + user.results.length, 0), privateHistories: report.users.filter(user => user.history?.entryId).length,
    media: report.media.length, skipped: report.skipped.length };
  return report;
};
