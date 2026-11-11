/* Additive, resumable club fixtures. Importing does not connect or execute. */
module.exports = async function seedClubScenarios(ctx) {
  const { db, api, once, clubs, owner, day, stamp, upload } = ctx;
  const tag = ctx.tag || '【模拟】', marker = tag + '正常场景1111';
  const fromNow = minutes => new Date(ctx.nowMs + (8 * 60 + minutes) * 60000).toISOString().slice(0, 16);
  const report = { clubs: [], setups: [], social: null };
  const setup = async (name, details) => { report.setups.push({ name, details }); await ctx.recordSetup(name, details); };
  for (const club of clubs) {
    const base = '/clubs/' + club.id, key = 'club:' + club.id + ':';
    const roster = await once(key + 'stable-roster', async () => ({ ids: ctx.members(club.id).slice(0, 12).map(person => person.id) }));
    const people = roster.ids.map(id => ctx.users.find(person => person.id === id));
    if (people.length < 3) throw new Error('Need three synthetic club members: ' + club.id);
    const row = { clubId: club.id, templates: [], activities: [], checkins: [], gifts: [], meetups: [], internals: [] };
    const groups = [{ name: '轻松组', kind: 'pace', pace: '6:00–6:30', capacity: 20 }, { name: '进阶组', kind: 'pace', pace: '5:00–5:30', capacity: 10 }];
    await once(key + 'default-group', async () => {
      const name = tag + '日常轻松组';
      const found = db.prepare('SELECT id FROM club_groups WHERE club_id=? AND name=?').get(club.id, name);
      return { id: found?.id || (await api('POST', base + '/groups', owner, { name, pace: '6:00', capacity: 0 })).group.id };
    });
    await once(key + 'manager', async () => {
      const person = people[0], before = db.prepare('SELECT * FROM club_members WHERE club_id=? AND user_id=?').get(club.id, person.id);
      if (before.role !== 'manager') {
        await setup('synthetic-member-manager', { clubId: club.id, userId: person.id, before, afterRole: 'manager', reason: 'Synthetic scenario manager; existing membership preserved' });
        await api('PUT', base + '/members/' + person.id, owner, { role: 'manager' });
      }
      return { userId: person.id, role: 'manager' };
    });
    for (const [type, title, km] of [['easy', '轻松跑', 8], ['interval', '间歇跑', 6], ['long', '长距离', 18]]) {
      const created = await once(key + 'template:' + type, async () => {
        const name = tag + title + '1111';
        const found = db.prepare('SELECT id FROM activity_templates WHERE club_id=? AND name=?').get(club.id, name);
        if (found) return { id: found.id };
        const body = { name, config: { trainingType: type, title: tag + title, plannedKm: km, place: '城市绿道', gatherPlace: '公园南门', gatherAt: '提前10分钟', workout: '热身后按组训练，结束后放松拉伸', notice: marker, note: marker, minPeople: 3, minKm: 5, points: 3, review: true, groups, startTime: '07:00', durationMinutes: 90, signupLeadMinutes: 60, cancelLeadMinutes: 30 } };
        return { id: (await api('POST', base + '/activity-templates', owner, body, 201)).template.id };
      }); row.templates.push(created.id);
    }
    for (const [kind, title, type, offset] of [['future-easy', '下次轻松跑', 'easy', 3], ['future-long', '下次长距离', 'long', 5], ['live', '今日进行中团练', 'tempo', 2], ['ended', '已完成积分团练', 'easy', 2], ['cancelled', '天气取消训练', 'social', 6]]) {
      const activity = await once(key + 'activity:' + kind, async () => {
        const name = tag + title + '1111';
        const found = db.prepare('SELECT id FROM activities WHERE club_id=? AND title=?').get(club.id, name);
        if (found) return { id: found.id };
        const body = { title: name, place: '城市绿道', startsAt: stamp(offset, '07:00'), endsAt: stamp(offset, '09:00'), plannedKm: kind === 'future-long' ? 18 : 10, trainingType: type, gatherPlace: '公园南门广场', gatherAt: '提前15分钟', note: marker, workout: '热身1公里，分组训练，放松1公里', notice: marker + '，量力而行', minKm: 5, minPeople: 3, points: 3, review: true, groups };
        return { id: (await api('POST', base + '/activities', owner, body)).activity.id };
      });
      const path = base + '/activities/' + activity.id;
      const groupRows = db.prepare('SELECT id FROM activity_groups WHERE activity_id=? ORDER BY sort,id').all(activity.id);
      if (kind !== 'cancelled') for (const [index, person] of people.slice(0, 8).entries()) {
        await once(key + kind + ':signup:' + person.id, async () => {
          if (!db.prepare('SELECT 1 FROM activity_signups WHERE activity_id=? AND user_id=?').get(activity.id, person.id)) await api('POST', path + '/signup', person, { groupId: groupRows[index % groupRows.length].id, gender: index % 2 ? '女' : '男', level: ['萌新', '入门', '进阶', '专业'][index % 4] });
          return { activityId: activity.id, userId: person.id };
        });
      }
      if (kind.startsWith('future')) await once(key + kind + ':pacer', async () => { await api('POST', path + '/pacer', people[0], { on: true }); return { userId: people[0].id }; });
      if (kind === 'live' || kind === 'ended') {
        await once(key + kind + ':time', async () => {
          const update = { startsAt: kind === 'ended' ? stamp(-2, '07:00') : fromNow(-30), endsAt: kind === 'ended' ? stamp(-2, '09:00') : fromNow(60), signupUntil: '', cancelUntil: '' };
          await api('PUT', path, owner, update); await setup('new-activity-scenario-time', { clubId: club.id, activityId: activity.id, update, reason: 'Only this batch newly created activity; normal API update after signup' });
          return { activityId: activity.id };
        });
        for (const [index, person] of people.slice(0, kind === 'ended' ? 7 : 4).entries()) await once(key + kind + ':check:' + person.id, async () => {
          const result = await api('POST', path + '/check', person, { km: index === 6 ? 3 : 10 + index / 10, note: tag + '已完成分组训练' });
          return { activityId: activity.id, userId: person.id, awarded: result.awarded };
        });
        if (kind === 'ended') {
          await once(key + kind + ':end', async () => { await api('POST', path + '/end', owner, {}); await api('PUT', path, owner, { endsAt: stamp(-2, '09:00') }); return { activityId: activity.id }; });
          for (let index = 0; index < 3; index++) {
            const media = await once(key + kind + ':photo:' + index, async () => ({ id: (await upload(path + '/media', people[index])).media.id }));
            if (index < 2) await once(key + kind + ':approve:' + index, async () => { await api('POST', path + '/media/' + media.id + '/approve', owner, {}); return { mediaId: media.id }; });
            if (index === 0) await once(key + kind + ':cover', async () => { await api('POST', path + '/cover', owner, { mediaId: media.id }); return { mediaId: media.id }; });
          }
        }
      }
      if (kind === 'cancelled') await once(key + kind + ':cancel', async () => { await api('POST', path + '/cancel', owner, {}); return { activityId: activity.id }; });
      row.activities.push({ id: activity.id, kind });
    }
    // Move only an API-created, new today row to each absent historical key.
    // A pre-existing today row is never overwritten or moved.
    for (const person of people.slice(0, 8)) {
      for (const offset of [-4, -3, -2, -1]) await once(key + 'daily:' + person.id + ':' + day(offset), async () => {
        const target = db.prepare('SELECT 1 FROM checkins WHERE club_id=? AND user_id=? AND day=?').get(club.id, person.id, day(offset));
        if (target) return { userId: person.id, day: day(offset), preserved: true };
        if (db.prepare('SELECT 1 FROM checkins WHERE club_id=? AND user_id=? AND day=?').get(club.id, person.id, day())) return { userId: person.id, day: day(offset), skipped: 'pre-existing today key preserved' };
        await api('POST', base + '/checkins', person, { note: marker + '晨跑完成' });
        const before = db.prepare('SELECT * FROM checkins WHERE club_id=? AND user_id=? AND day=?').get(club.id, person.id, day());
        if (!before || before.note !== marker + '晨跑完成') throw new Error('New checkin identity mismatch');
        db.prepare('UPDATE checkins SET day=?,created_at=? WHERE club_id=? AND user_id=? AND day=? AND note=?').run(day(offset), new Date(Date.parse(stamp(offset, '08:00') + ':00+08:00')).toISOString(), club.id, person.id, day(), before.note);
        await setup('new-synthetic-checkin-history', { clubId: club.id, userId: person.id, before, afterDay: day(offset), reason: 'Only newly API-created synthetic row; preserve existing keys' });
        return { userId: person.id, day: day(offset) };
      });
      const daily = await once(key + 'daily:' + person.id + ':' + day(), async () => {
        if (!db.prepare('SELECT 1 FROM checkins WHERE club_id=? AND user_id=? AND day=?').get(club.id, person.id, day())) await api('POST', base + '/checkins', person, { note: marker + '今日状态很好' });
        return { userId: person.id, day: day() };
      }); row.checkins.push(daily);
    }
    for (const [kind, cost, stock] of [['available', 2, 20], ['premium', 20, 10], ['sold-out', 1, 1]]) {
      const gift = await once(key + 'gift:' + kind, async () => {
        const name = tag + ({ available: '纪念运动袜', premium: '训练纪念包', 'sold-out': '限量补给' }[kind]) + '1111';
        const found = db.prepare('SELECT id FROM gifts WHERE club_id=? AND name=?').get(club.id, name);
        return { id: found?.id || (await api('POST', base + '/gifts', owner, { name, cost, stock })).gift.id };
      });
      if (kind !== 'premium') await once(key + 'gift-redeem:' + kind, async () => {
        const person = kind === 'sold-out' ? people[1] : people[0];
        const found = db.prepare('SELECT id FROM redemptions WHERE gift_id=? AND user_id=?').get(gift.id, person.id);
        if (!found) await api('POST', base + '/gifts/' + gift.id + '/redeem', person, {});
        return { giftId: gift.id, userId: person.id };
      }); row.gifts.push({ ...gift, kind });
    }
    for (const kind of ['future', 'historical']) {
      const meetup = await once(key + 'meetup:' + kind, async () => {
        const place = tag + (kind === 'future' ? '周末公园约跑' : '昨日轻松约跑') + '1111';
        const found = db.prepare('SELECT id FROM meetups WHERE club_id=? AND place=?').get(club.id, place);
        return { id: found?.id || (await api('POST', base + '/meetups', people[0], { date: day(kind === 'future' ? 4 : 0), place, note: marker + '合成约跑体验' })).meetup.id };
      });
      const route = base + '/meetups/' + meetup.id;
      for (const person of people.slice(0, 6)) await once(key + 'meetup:' + kind + ':join:' + person.id, async () => {
        if (!db.prepare('SELECT 1 FROM meetup_joins WHERE meetup_id=? AND user_id=?').get(meetup.id, person.id)) await api('POST', route + '/join', person, {});
        return { meetupId: meetup.id, userId: person.id };
      });
      if (kind === 'historical') {
        for (const person of people.slice(0, 6)) await once(key + 'meetup-check:' + person.id, async () => {
          if (!db.prepare('SELECT 1 FROM meetup_checks WHERE meetup_id=? AND user_id=?').get(meetup.id, person.id)) await api('POST', route + '/check', person, {});
          return { meetupId: meetup.id, userId: person.id };
        });
        await once(key + 'meetup-photo', async () => { await upload(route + '/photos', people[0]); return { meetupId: meetup.id }; });
        await once(key + 'meetup-time', async () => {
          const before = db.prepare('SELECT * FROM meetups WHERE id=? AND club_id=?').get(meetup.id, club.id);
          const date = [-1, -2, -3, -4, -5, -6].map(offset => day(offset)).find(value => !db.prepare('SELECT 1 FROM meetups WHERE club_id=? AND run_on=? AND id!=?').get(club.id, value, meetup.id));
          if (!date) throw new Error('No safe new historical meetup day');
          if (!before?.place.startsWith(tag) || before.run_on !== day()) throw new Error('Unsafe meetup time setup');
          db.prepare('UPDATE meetups SET run_on=? WHERE id=? AND club_id=?').run(date, meetup.id, club.id);
          await setup('new-meetup-history', { clubId: club.id, meetupId: meetup.id, beforeRunOn: before.run_on, afterRunOn: date });
          return { meetupId: meetup.id, date };
        });
        await once(key + 'meetup-settle', async () => { const result = await api('POST', route + '/resettle', owner, {}); return { meetupId: meetup.id, status: result.meetup.status }; });
      } row.meetups.push({ ...meetup, kind });
    }
    for (const kind of ['future', 'historical']) {
      const race = await once(key + 'internal:' + kind, async () => {
        const title = tag + (kind === 'future' ? '月度10公里挑战' : '已完成5公里测验') + '1111';
        const found = db.prepare('SELECT id FROM internal_races WHERE club_id=? AND title=?').get(club.id, title);
        return { id: found?.id || (await api('POST', base + '/internals', owner, { title, place: '城市绿道', startsAt: stamp(8, '08:00'), deadline: stamp(7, '22:00'), distance: kind === 'future' ? '10k' : '5k', finishPoints: 3, note: marker, groups: [{ name: '大众组', capacity: 20 }, { name: '挑战组', capacity: 10 }] })).race.id };
      });
      const route = base + '/internals/' + race.id;
      const groupIds = db.prepare('SELECT id FROM internal_groups WHERE race_id=? ORDER BY sort,id').all(race.id);
      for (const [index, person] of people.slice(0, 8).entries()) await once(key + 'internal:' + kind + ':signup:' + person.id, async () => {
        if (!db.prepare('SELECT 1 FROM internal_signups WHERE race_id=? AND user_id=?').get(race.id, person.id)) await api('POST', route + '/signup', person, { groupId: groupIds[index % groupIds.length].id });
        return { raceId: race.id, userId: person.id };
      });
      if (kind === 'historical') {
        await once(key + 'internal-time', async () => {
          const before = db.prepare('SELECT starts_at,deadline,title FROM internal_races WHERE id=? AND club_id=?').get(race.id, club.id);
          if (!before?.title.startsWith(tag)) throw new Error('Unsafe internal race history setup');
          db.prepare('UPDATE internal_races SET starts_at=?,deadline=? WHERE id=? AND club_id=?').run(stamp(-3, '08:00'), stamp(-4, '22:00'), race.id, club.id);
          await setup('new-internal-race-history', { clubId: club.id, raceId: race.id, before, startsAt: stamp(-3, '08:00'), deadline: stamp(-4, '22:00') }); return { raceId: race.id };
        });
        for (const [index, person] of people.slice(0, 7).entries()) await once(key + 'internal-result:' + person.id, async () => {
          await api('POST', route + '/results', index === 6 ? owner : person, index === 6 ? { userId: person.id, outcome: 'dns' } : index === 5 ? { outcome: 'dnf' } : { outcome: 'finish', time: (25 + index) + ':30' });
          return { raceId: race.id, userId: person.id, outcome: index === 6 ? 'dns' : index === 5 ? 'dnf' : 'finish' };
        });
        await once(key + 'internal-end', async () => { await api('POST', route + '/end', owner, {}); return { raceId: race.id }; });
      } row.internals.push({ ...race, kind });
    }
    report.clubs.push(row);
  }
  report.social = await require('./club-social-scenarios.cjs')(ctx);
  return report;
};
