/* Additive club fee ledgers, synthetic conversation and custom result calls.
 * No transport/setup at import; no DB writes. Every mutation is ctx.once + API.
 */
const assert = require('node:assert/strict');
const clock = seconds => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');

module.exports = async function clubSocialScenarios(ctx) {
  const { db, api, once, clubs, owner } = ctx;
  const tag = ctx.tag || '【模拟】';
  const allowlist = new Set(ctx.users.map(user => Number(user.id)));
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const key = (...parts) => ['club-social-v1', ...parts].join(':');
  const report = { clubs: [], warnings: [], notes: [
    'Only synthetic actors post, comment, like or submit results. No notifications or external messages are sent.',
    'Fee amounts are simulation ledger entries, not real payments; blockSignup stays false.',
    'Custom calls deliberately have no public raceId, so they never overwrite personal catalog results.',
    'An unrelated existing open fee period is preserved; two new fee periods are skipped and explicitly reported.'
  ] };
  assert.equal(clubs.length, 10);
  for (const club of clubs) {
    assert.equal(Number(club.owner_id), Number(owner.id));
    const actors = ctx.members(club.id);
    assert(actors.length >= 3, 'Social fixture needs at least three synthetic members per club');
    assert(actors.every(actor => allowlist.has(Number(actor.id))), 'Non-synthetic member rejected');
    const base = '/clubs/' + club.id;
    const entry = { clubId: club.id, fees: [], posts: [], calls: [] };
    const historyName = tag + '上期会费';
    const currentName = tag + '本期会费';
    const openBefore = one('SELECT id,name FROM fee_periods WHERE club_id=? AND open=1', club.id);
    const knownHistory = one('SELECT id FROM fee_periods WHERE club_id=? AND name=?', club.id, historyName);
    const knownCurrent = one('SELECT id FROM fee_periods WHERE club_id=? AND name=?', club.id, currentName);
    const ownedOpen = !openBefore || [knownHistory?.id, knownCurrent?.id].includes(openBefore.id);
    if (!ownedOpen) {
      report.warnings.push({ clubId: club.id, kind: 'fees-preserved', periodId: openBefore.id, reason: 'Existing unrelated open fee would be closed by API create; skipped fee generation.' });
    } else {
      const history = await once(key(club.id, 'fee-history'), async () => {
        const existing = one('SELECT id,open FROM fee_periods WHERE club_id=? AND name=?', club.id, historyName);
        if (existing) return { id: existing.id, existing: true };
        const result = await api('POST', base + '/fees', owner, { name: historyName, amount: 60, startsOn: ctx.day(-60), endsOn: ctx.day(-1), blockSignup: false, note: tag + '历史会费演示账目，不代表真实支付或收款。' });
        return { id: result.period.id };
      });
      const ledgerActors = actors.slice(0, Math.min(18, actors.length));
      for (let index = 0; index < ledgerActors.length; index++) {
        const actor = ledgerActors[index];
        await once(key(club.id, 'fee-history-record', actor.id), async () => {
          if (!one('SELECT open FROM fee_periods WHERE id=?', history.id)?.open) return { preservedClosed: true };
          if (one('SELECT 1 FROM fee_records WHERE period_id=? AND user_id=?', history.id, actor.id)) return { preserved: true };
          const status = index % 6 === 0 ? 'waived' : index % 3 ? 'paid' : 'unpaid';
          await api('POST', base + '/fees/' + history.id + '/records', owner, { userId: actor.id, status });
          return { userId: actor.id, status };
        });
      }
      const current = await once(key(club.id, 'fee-current'), async () => {
        const existing = one('SELECT id FROM fee_periods WHERE club_id=? AND name=?', club.id, currentName);
        if (existing) return { id: existing.id, existing: true };
        const active = one('SELECT id FROM fee_periods WHERE club_id=? AND open=1', club.id);
        assert(!active || active.id === history.id, 'Refuse to close unrelated fee period');
        const result = await api('POST', base + '/fees', owner, { name: currentName, amount: 80, startsOn: ctx.day(), endsOn: ctx.day(60), blockSignup: false, note: tag + '本期会费状态演示，不收取任何真实费用。' });
        return { id: result.period.id };
      });
      for (let index = 0; index < ledgerActors.length; index++) {
        const actor = ledgerActors[index];
        await once(key(club.id, 'fee-current-record', actor.id), async () => {
          if (one('SELECT 1 FROM fee_records WHERE period_id=? AND user_id=?', current.id, actor.id)) return { preserved: true };
          assert(one('SELECT open FROM fee_periods WHERE id=?', current.id)?.open, 'New current fee must remain open');
          const status = index % 7 === 0 ? 'waived' : index % 2 ? 'paid' : 'unpaid';
          await api('POST', base + '/fees/' + current.id + '/records', owner, { userId: actor.id, status });
          return { userId: actor.id, status };
        });
      }
      entry.fees = [{ id: history.id, open: !!one('SELECT open FROM fee_periods WHERE id=?', history.id)?.open }, { id: current.id, open: !!one('SELECT open FROM fee_periods WHERE id=?', current.id)?.open }];
      assert(!entry.fees[0].open && entry.fees[1].open, 'Expected closed history and open current ledger');
    }

    for (let number = 0; number < 3; number++) {
      const author = actors[number % actors.length];
      const body = tag + ['晨跑分享：放慢一点，和团友一起把节奏找回来。', '训练小记：间歇后做好放松，恢复也是训练的一部分。', '周末约跑：本条是合成跑友交流，出发前请核对实际活动安排。'][number];
      const post = await once(key(club.id, 'post', number), async () => {
        const existing = one('SELECT id FROM club_posts WHERE club_id=? AND user_id=? AND body=?', club.id, author.id, body);
        if (existing) return { id: existing.id };
        return { id: (await api('POST', base + '/posts', author, { body })).id };
      });
      const others = actors.filter(actor => Number(actor.id) !== Number(author.id)).slice(0, 5);
      for (let index = 0; index < others.length; index++) {
        const actor = others[index];
        await once(key(club.id, 'like', post.id, actor.id), async () => {
          if (!one('SELECT 1 FROM club_likes WHERE post_id=? AND user_id=?', post.id, actor.id)) await api('POST', base + '/posts/' + post.id + '/like', actor, {});
          return { postId: post.id, userId: actor.id };
        });
        if (index < 3) await once(key(club.id, 'comment', post.id, actor.id), async () => {
          const text = tag + ['一起稳定向前，按自己的状态跑。', '补水和放松都记上，期待下一次相聚。', '这份合成训练交流用于演示跑团动态。'][index];
          if (!one('SELECT 1 FROM club_comments WHERE post_id=? AND user_id=? AND body=?', post.id, actor.id, text)) await api('POST', base + '/posts/' + post.id + '/comments', actor, { body: text });
          return { postId: post.id, userId: actor.id };
        });
      }
      entry.posts.push({ id: post.id, authorId: author.id, likes: others.length, comments: Math.min(3, others.length) });
    }

    for (let number = 0; number < 2; number++) {
      const title = tag + (number ? '已截止成绩收集' : '开放成绩收集');
      const call = await once(key(club.id, 'call', number), async () => {
        const existing = one('SELECT id,race_id FROM result_calls WHERE club_id=? AND title=?', club.id, title);
        if (existing) { assert(!existing.race_id); return { id: existing.id }; }
        const result = await api('POST', base + '/calls', owner, { title, raceDate: ctx.day(number ? -21 : -7), distances: ['half', '10k', '5k'], deadline: ctx.stamp(7, '22:00'), note: tag + '自定义合成历史赛，仅做团内统计，不代表官方成绩。' });
        return { id: result.call.id };
      });
      const submitters = actors.slice(0, Math.min(12, actors.length));
      for (let index = 0; index < submitters.length; index++) {
        const actor = submitters[index], distance = ['half', '10k', '5k'][index % 3];
        await once(key(club.id, 'call-row', call.id, actor.id), async () => {
          if (one('SELECT 1 FROM result_call_rows WHERE call_id=? AND user_id=? AND distance=?', call.id, actor.id, distance)) return { preserved: true };
          const stored = one('SELECT deadline FROM result_calls WHERE id=?', call.id);
          const closed = Date.parse(stored.deadline.replace(' ', 'T') + ':00+08:00') < ctx.nowMs;
          assert(!closed, 'Interrupted run found missing member submissions on a closed call; preserve and investigate');
          const time = clock(Math.round(({ half: 21.0975, '10k': 10, '5k': 5 })[distance] * (300 + index * 9)));
          await api('POST', base + '/calls/' + call.id + '/rows', actor, { distance, time });
          return { userId: actor.id, distance, time };
        });
      }
      if (number) await once(key(club.id, 'close-call', call.id), async () => {
        await api('PUT', base + '/calls/' + call.id, owner, { deadline: ctx.stamp(-1, '22:00'), note: tag + '成绩收集已截止；模拟记录不代表官方成绩。' });
        return { id: call.id, closed: true };
      });
      entry.calls.push({ id: call.id, closed: !!number, submitted: submitters.length });
    }
    report.clubs.push(entry);
  }
  report.summary = { clubs: report.clubs.length, fees: report.clubs.reduce((n,club) => n + club.fees.length, 0), posts: report.clubs.reduce((n,club) => n + club.posts.length, 0), calls: report.clubs.reduce((n,club) => n + club.calls.length, 0), warnings: report.warnings.length };
  return report;
};
