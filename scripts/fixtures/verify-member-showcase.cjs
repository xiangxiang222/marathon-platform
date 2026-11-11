'use strict';
// Read-only verification of every target account and every target membership.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function verify(ctx) {
  const { db, api, users, clubs, owner, seedReport: seed } = ctx;
  const report = { date: seed.date, checks: [], users: [], clubs: [], memberships: 0, binary: [] };
  const check = (name, pass, details) => { report.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) }); };
  const periods = ['day', 'week', 'month', 'year', 'all'];
  for (const user of users) {
    const introduction = db.prepare('SELECT introduction FROM users WHERE id=?').get(user.id).introduction;
    check('user:' + user.id + ':simulated-introduction', typeof introduction === 'string' && introduction.includes('【模拟】') && introduction.trim().length > 20);
    const rows = db.prepare('SELECT id,started_at,city FROM runs WHERE user_id=? AND city=?').all(user.id, seed.marker);
    const dates = new Set(rows.map(r => r.started_at.slice(0, 10)));
    check('user:' + user.id + ':all-planned-dates', seed.runDates.every(d => dates.has(d)), { runs: rows.length, dates: [...dates] });
    check('user:' + user.id + ':all-runs-completed', rows.every(r => { const row = db.prepare('SELECT duration_sec FROM runs WHERE id=?').get(r.id); return Date.parse(r.started_at + ':00+08:00') + row.duration_sec * 1000 <= ctx.nowMs; }));
    const plans = db.prepare('SELECT p.race_id,p.status FROM plans p JOIN races r ON r.id=p.race_id WHERE p.user_id=? AND r.organizer=?').all(user.id, seed.marker);
    check('user:' + user.id + ':wanted-drawn-finished', ['想跑', '中签', '完赛'].every(status => plans.some(p => p.status === status)), plans);
    const results = db.prepare('SELECT res.distance,res.seconds FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=? AND r.organizer=?').all(user.id, seed.marker);
    check('user:' + user.id + ':four-distances', ['full', 'half', '10k', '5k'].every(distance => results.some(r => r.distance === distance && r.seconds > 0)));
    const multiProject = db.prepare('SELECT res.race_id,COUNT(*) n FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=? AND r.organizer=? GROUP BY res.race_id HAVING COUNT(*)>1').all(user.id, seed.marker);
    check('user:' + user.id + ':one-project-per-race', multiProject.length === 0);
    report.users.push({ userId: user.id, newRuns: rows.length, plans: plans.length, results: results.length });
  }
  for (const club of clubs) {
    const base = '/clubs/' + club.id, people = ctx.members(club.id), clubReport = { clubId: club.id, syntheticMembers: people.length, groups: [], boards: [], members: [] };
    const groups = await api('GET', base + '/training-groups', owner);
    for (const group of groups.groups) {
      const count = db.prepare('SELECT COUNT(*) n FROM club_members WHERE club_id=? AND mileage_group_id=? AND user_id BETWEEN 8 AND 207').get(club.id, group.id).n;
      check('club:' + club.id + ':group:' + group.id + ':synthetic-member', count > 0, { name: group.name, synthetic: count });
      clubReport.groups.push({ id: group.id, name: group.name, synthetic: count });
    }
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) check('club:' + club.id + ':group:' + letter, groups.groups.some(g => g.name === letter || g.name.startsWith(letter + '组')) || groups.groups.length >= 30);
    const boardRows = {};
    for (const range of periods) {
      const board = await api('GET', base + '/mileage/board?range=' + range + '&date=' + seed.date, owner);
      check('club:' + club.id + ':board:' + range + ':all-synthetic-positive', people.every(u => board.rank.some(r => r.userId === u.id && r.km > 0)), { members: board.rank.length, summary: board.summary });
      boardRows[range] = new Map(board.rank.map(r => [r.userId, r.km]));
      clubReport.boards.push({ range, summary: board.summary });
    }
    for (const user of people) {
      report.memberships++;
      const profile = await api('GET', base + '/members/' + user.id + '/profile?range=all&date=' + seed.date, owner);
      check('member:' + club.id + ':' + user.id + ':simulated-introduction-visible', profile.user?.introduction?.includes('【模拟】'));
      const km = Object.fromEntries(periods.map(range => [range, Number(profile.mileage?.[range]?.km || 0)]));
      check('member:' + club.id + ':' + user.id + ':five-periods-positive', periods.every(range => km[range] > 0), km);
      check('member:' + club.id + ':' + user.id + ':board-profile-match', periods.every(range => Math.abs(km[range] - boardRows[range].get(user.id)) < .001));
      check('member:' + club.id + ':' + user.id + ':periods-monotonic', km.day <= km.week && km.week <= km.month && km.month <= km.year && km.year <= km.all, km);
      if (ctx.includeSimulatedHistory) check('member:' + club.id + ':' + user.id + ':distinct-periods', km.day < km.week && km.week < km.month && km.month < km.year && km.year < km.all, km);
      check('member:' + club.id + ':' + user.id + ':shared-race-states', ['想跑', '中签', '完赛'].every(status => profile.races?.some(r => r.status === status)));
      check('member:' + club.id + ':' + user.id + ':results-and-pb', profile.results?.length >= 4 && profile.pbs?.length === 4);
      check('member:' + club.id + ':' + user.id + ':public-album', profile.albums?.some(a => a.items?.some(item => item.kind === 'photo' && item.id > 0)));
      check('member:' + club.id + ':' + user.id + ':group', profile.group?.id > 0 && groups.groups.some(g => g.id === profile.group.id));
      check('member:' + club.id + ':' + user.id + ':no-private-result-fields', (profile.results || []).every(r => !Object.hasOwn(r, 'proof') && !Object.hasOwn(r, 'story') && !Object.hasOwn(r, 'sheet')));
      const fixtureMedia = seed.clubs.find(c => c.clubId === club.id).media.find(m => m.userId === user.id);
      const media = db.prepare('SELECT * FROM activity_media WHERE id=? AND user_id=?').get(fixtureMedia.id, user.id);
      const mediaPath = media && path.join(ctx.mediaRoot, String(media.activity_id), media.filename);
      const exists = !!mediaPath && fs.existsSync(mediaPath), bytes = exists ? fs.readFileSync(mediaPath) : null;
      check('member:' + club.id + ':' + user.id + ':new-image-readable', !!bytes && bytes.length > 10000 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a' && bytes.readUInt32BE(16) === 960 && bytes.readUInt32BE(20) === 540, { mediaId: fixtureMedia.id, bytes: bytes?.length || 0 });
      check('member:' + club.id + ':' + user.id + ':new-image-shared', media?.status === 'shown' && profile.albums?.some(a => a.items?.some(item => item.id === fixtureMedia.id)));
      clubReport.members.push({ userId: user.id, groupId: profile.group?.id, mileage: km, races: profile.races?.length || 0, results: profile.results?.length || 0, images: profile.summary?.photoCount || 0 });
    }
    // A real authenticated binary GET per club proves media routing as well as
    // local file existence. Headers are deliberately never included in reports.
    const item = seed.clubs.find(c => c.clubId === club.id).media[0];
    const response = await fetch(ctx.origin + '/marathon/api/media/' + item.id, { headers: { Authorization: 'Bearer ' + owner.token }, signal: AbortSignal.timeout(30000) });
    const bytes = await response.arrayBuffer();
    const result = { clubId: club.id, mediaId: item.id, status: response.status, type: response.headers.get('content-type'), bytes: bytes.byteLength };
    check('club:' + club.id + ':binary-image-http', result.status === 200 && result.bytes > 10000 && /^image\//.test(result.type || ''), result);
    report.binary.push(result); report.clubs.push(clubReport);
    if (ctx.progress) ctx.progress('verification-clubs', report.clubs.length, 10);
  }
  report.failed = report.checks.filter(c => !c.pass).length;
  report.summary = { users: users.length, introductions: users.length, clubs: clubs.length, memberships: report.memberships, checks: report.checks.length, failed: report.failed,
    newRuns: report.users.reduce((n, u) => n + u.newRuns, 0), newResultRows: report.users.reduce((n, u) => n + u.results, 0),
    illustrations: seed.clubs.reduce((n, c) => n + c.media.length, 0), historyMode: ctx.includeSimulatedHistory ? '模拟历史团长补录，仅本批新增runs' : '正常自动入团口径' };
  return report;
};
