/* Final read-side verification. Only SELECT/PRAGMA and ctx.api('GET', ...) are
 * used. Importing does not execute a seed, load credentials or open a database.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function verifyScenarios(ctx) {
  const { db, api, users, clubs, owner, catalog } = ctx;
  const tag = ctx.tag || '【模拟】';
  const today = ctx.day();
  const month = today.slice(0, 7);
  const minimums = { activities: 5, templates: 3, fees: 2, calls: 1, meetups: 1, internals: 1, posts: 1, points: 1, ...(ctx.verifyMinimums || {}) };
  const report = { checks: [], clubs: [], users: [], representatives: [], media: [], warnings: [], limitations: [
    'Only read-side APIs are exercised here. GET handlers may perform their normal lazy business recalculation.',
    'Binary media is checked for a nonempty local file and API metadata visibility; no JSON parsing of binary endpoints.',
    'Authorization, real WeChat consent, external device synchronization, payments and shipping are not claimed by this fixture.'
  ] };
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const count = (sql, ...args) => Number(one(sql, ...args)?.n || 0);
  const tally = (rows, field) => rows.reduce((out, row) => { const value = String(row[field] ?? ''); out[value] = (out[value] || 0) + 1; return out; }, {});
  const localMs = value => Date.parse(String(value || '').replace(' ', 'T') + (String(value || '').length === 16 ? ':00+08:00' : String(value || '').length === 19 ? '+08:00' : ''));
  const userIds = new Set(users.map(user => Number(user.id)));
  const pastIds = (catalog?.pastRaces || []).map(race => race.id);
  const futureIds = (catalog?.futureRaces || []).map(race => race.id);
  const inSql = ids => ids.map(() => '?').join(',') || 'NULL';
  const scopedUsers = new Map((ctx.userReport?.users || []).map(user => [Number(user.userId), user]));
  const mark = (name, actual, expected, passed, details = undefined) => {
    report.checks.push({ name, passed: !!passed, actual, expected, ...(details ? { details } : {}) });
    return !!passed;
  };
  async function get(label, endpoint, actor) {
    try {
      const body = await api('GET', endpoint, actor);
      mark(label, '200 JSON', '200 JSON', body != null && typeof body === 'object');
      return body;
    } catch (error) {
      // Never include headers, tokens, arbitrary request objects or stack traces.
      mark(label, 'request failed', '200 JSON', false, { endpoint, errorType: error.name || 'Error' });
      return null;
    }
  }
  function verifyFile(label, directory, filename, metadata = {}) {
    if (!ctx.mediaRoot) {
      report.media.push({ label, directory, filename: path.basename(filename || ''), checked: false, reason: 'ctx.mediaRoot was not supplied', ...metadata });
      return;
    }
    const safeName = path.basename(filename || '');
    const file = path.resolve(ctx.mediaRoot, directory, safeName);
    let size = 0, readable = false;
    try {
      const stat = fs.statSync(file);
      fs.accessSync(file, fs.constants.R_OK);
      readable = stat.isFile() && stat.size > 0 && safeName === filename;
      size = stat.size;
    } catch (_) {}
    mark('media:' + label, readable ? size : 'missing/unreadable', 'nonempty readable fixture file', readable);
    report.media.push({ label, file, bytes: size, readable, checked: true, ...metadata });
  }

  mark('scope:200-users', users.length, 200, users.length === 200 && userIds.size === 200);
  mark('scope:10-clubs', clubs.length, 10, clubs.length === 10);
  mark('scope:catalog-past', pastIds.length, '>=3', pastIds.length >= 3);
  mark('scope:catalog-future', futureIds.length, '>=3', futureIds.length >= 3);
  if (!ctx.userReport) report.warnings.push('ctx.userReport missing: run counts below are current allowlisted-user totals, not an exact new-batch count.');
  if (!ctx.mediaRoot) report.warnings.push('ctx.mediaRoot missing: media file existence is unverified.');

  // Every synthetic account is checked, not just the actors used in screenshots.
  for (const user of users) {
    const stored = one('SELECT nickname FROM users WHERE id=?', user.id);
    mark('user:' + user.id + ':identity', stored?.nickname || null, user.nickname, stored?.nickname === user.nickname);
    const row = {
      userId: user.id, nickname: user.nickname,
      runs: count('SELECT COUNT(*) n FROM runs WHERE user_id=?', user.id),
      futurePlans: count(`SELECT COUNT(*) n FROM plans WHERE user_id=? AND race_id IN (${inSql(futureIds)})`, user.id, ...futureIds),
      oldResults: count(`SELECT COUNT(*) n FROM results WHERE user_id=? AND race_id IN (${inSql(pastIds)})`, user.id, ...pastIds),
      privateHistories: count("SELECT COUNT(*) n FROM race_history_entries WHERE user_id=? AND legacy_key='' AND deleted=0 AND instr(name,?)>0", user.id, tag),
      timingConfirmedBridges: count(`SELECT COUNT(*) n FROM race_history_entries WHERE user_id=? AND legacy_key<>'' AND deleted=0 AND timing='net' AND net_seconds>0 AND race_id IN (${inSql(pastIds)})`, user.id, ...pastIds),
      monthTarget: one('SELECT target_km FROM mileage_flags WHERE user_id=? AND month=?', user.id, month)?.target_km ?? null,
      radar: !!one('SELECT 1 FROM radar_profiles WHERE user_id=?', user.id)
    };
    mark('user:' + user.id + ':runs', row.runs, '>=12', row.runs >= 12);
    mark('user:' + user.id + ':future-plans', row.futurePlans, '>=3 on new catalog races', row.futurePlans >= 3);
    mark('user:' + user.id + ':old-results', row.oldResults, '>=2 on new catalog races', row.oldResults >= 2);
    mark('user:' + user.id + ':private-history', row.privateHistories, '>=1 labelled standalone record', row.privateHistories >= 1);
    mark('user:' + user.id + ':timing-bridges', row.timingConfirmedBridges, '>=2 confirmed net clocks', row.timingConfirmedBridges >= 2);
    mark('user:' + user.id + ':month-target', row.monthTarget, '>0', row.monthTarget > 0);
    mark('user:' + user.id + ':radar', row.radar, true, row.radar);
    const tracked = scopedUsers.get(Number(user.id));
    if (tracked) {
      const runIds = tracked.historicalRuns || [];
      row.batchRuns = runIds.length ? count(`SELECT COUNT(*) n FROM runs WHERE user_id=? AND id IN (${inSql(runIds)})`, user.id, ...runIds) : 0;
      mark('user:' + user.id + ':batch-runs', row.batchRuns, '>=12 exact tracked rows', row.batchRuns >= 12);
      const pk = tracked.pk;
      row.pk = pk?.runId ? one('SELECT id,started_at,duration_sec,overlap FROM runs WHERE id=? AND user_id=?', pk.runId, user.id) : null;
      if (row.pk) {
        const start = Date.parse(row.pk.started_at.replace(' ', 'T') + (row.pk.started_at.length === 16 ? ':00' : '') + '+08:00');
        const complete = row.pk.started_at.slice(0, 10) === today && start + row.pk.duration_sec * 1000 <= ctx.nowMs && !row.pk.overlap;
        mark('user:' + user.id + ':pk-completed', complete, true, complete);
        const counts = all('SELECT c.club_id,c.counted,m.joined_at FROM mileage_counts c JOIN club_members m ON m.club_id=c.club_id AND m.user_id=? WHERE c.run_id=?', user.id, pk.runId);
        const originalClubs = new Set((pk.countedClubs || []).map(Number));
        const originalCounts = counts.filter(value => originalClubs.has(Number(value.club_id)));
        mark('user:' + user.id + ':pk-after-membership', originalCounts.length, 'all originally eligible rows start after original joined_at', originalCounts.length > 0 && originalCounts.every(value => start >= Date.parse(value.joined_at)));
        // A later intentional review may exclude a tracked row. Its original
        // countedClubs snapshot is verified along with the present decisions.
        mark('user:' + user.id + ':pk-original-inclusion', pk.countedClubs?.length || 0, '>=1 eligible club at creation', (pk.countedClubs?.length || 0) > 0);
      } else {
        mark('user:' + user.id + ':pk-completed', pk?.reason || 'No tracked today PK run', 'one completed eligible PK run', false);
      }
      if (tracked.history?.entryId?.startsWith('exp:')) {
        mark('user:' + user.id + ':tracked-history', tracked.history.entryId, 'existing owned new history', !!one('SELECT 1 FROM race_history_entries WHERE id=? AND user_id=? AND deleted=0', Number(tracked.history.entryId.slice(4)), user.id));
      }
    }
    report.users.push(row);
  }

  // Twenty evenly spaced users cover all roster bands and many memberships.
  const representatives = users.filter((user, index) => index % 10 === 0);
  for (const user of representatives) {
    const reads = {};
    for (const [label, endpoint] of [
      ['me', '/me'], ['runner', '/me/runner?period=week&offset=0'], ['runs', '/runs?month=' + month],
      ['history', '/me/race-history'], ['radar', '/radar']
    ]) reads[label] = await get('read:user:' + user.id + ':' + label, endpoint, user);
    if (reads.me) mark('read:user:' + user.id + ':me-owner', reads.me.user?.id, user.id, Number(reads.me.user?.id) === Number(user.id));
    if (reads.runner) mark('read:user:' + user.id + ':runner-nonempty', reads.runner.overview?.totalCount, '>0', reads.runner.overview?.totalCount > 0);
    if (reads.history) mark('read:user:' + user.id + ':history-nonempty', reads.history.entries?.length || 0, '>=3', (reads.history.entries?.length || 0) >= 3);
    report.representatives.push({ userId: user.id,
      clubs: reads.me?.clubs?.length ?? null, plans: reads.me?.plans?.length ?? null,
      runnerTotalCount: reads.runner?.overview?.totalCount ?? null, monthRunCount: reads.runs?.runs?.length ?? null,
      historyEntries: reads.history?.entries?.length ?? null, historyPbCount: reads.history?.summary?.pb?.length ?? null,
      radarRead: !!reads.radar });
  }
  mark('read:representatives', report.representatives.length, '>=10', report.representatives.length >= 10);

  for (const club of clubs) {
    const base = '/clubs/' + club.id;
    const activities = all('SELECT id,title,cover_id FROM activities WHERE club_id=? AND instr(title,?)>0', club.id, tag);
    const templates = all('SELECT id,name FROM activity_templates WHERE club_id=? AND instr(name,?)>0', club.id, tag);
    const fees = all('SELECT id,name,open FROM fee_periods WHERE club_id=? AND instr(name,?)>0', club.id, tag);
    const calls = all('SELECT id,title,race_id,deadline FROM result_calls WHERE club_id=? AND (instr(title,?)>0 OR instr(note,?)>0)', club.id, tag, tag);
    const meetups = all('SELECT id,place FROM meetups WHERE club_id=? AND (instr(place,?)>0 OR instr(note,?)>0)', club.id, tag, tag);
    const internals = all('SELECT id,title FROM internal_races WHERE club_id=? AND instr(title,?)>0', club.id, tag);
    const posts = all('SELECT id FROM club_posts WHERE club_id=? AND instr(body,?)>0', club.id, tag);
    const allowedRefs = { act: new Set(activities.map(row => Number(row.id))), meet: new Set(meetups.map(row => Number(row.id))), inner: new Set(internals.map(row => Number(row.id))) };
    const pointRows = all('SELECT user_id,ref_key,delta FROM point_entries WHERE club_id=?', club.id).filter(row => {
      const [source, id] = row.ref_key.split(':');
      return userIds.has(Number(row.user_id)) && allowedRefs[source]?.has(Number(id));
    });
    const row = { clubId: club.id, name: club.name, counts: { activities: activities.length, templates: templates.length, fees: fees.length, calls: calls.length,
      meetups: meetups.length, internals: internals.length, posts: posts.length, points: pointRows.length }, pointsTotal: pointRows.reduce((sum, value) => sum + value.delta, 0), activityStates: {}, meetupStates: {}, internalStates: {}, mileage: {} };
    const members = all('SELECT user_id,role,mileage_group_id FROM club_members WHERE club_id=?', club.id);
    const syntheticMembers = members.filter(value => userIds.has(Number(value.user_id)));
    const requests = all('SELECT id,user_id,status FROM club_requests WHERE club_id=?', club.id).filter(value => userIds.has(Number(value.user_id)));
    const groups = all('SELECT id,name FROM club_groups WHERE club_id=?', club.id);
    const mileageGroups = all('SELECT id,name FROM mileage_groups WHERE club_id=?', club.id);
    const signups = all(`SELECT s.* FROM activity_signups s WHERE s.activity_id IN (${inSql(activities.map(value => value.id))})`, ...activities.map(value => value.id)).filter(value => userIds.has(Number(value.user_id)));
    const checks = all(`SELECT c.* FROM activity_checks c WHERE c.activity_id IN (${inSql(activities.map(value => value.id))})`, ...activities.map(value => value.id)).filter(value => userIds.has(Number(value.user_id)));
    const mediaRows = all(`SELECT * FROM activity_media WHERE activity_id IN (${inSql(activities.map(value => value.id))})`, ...activities.map(value => value.id));
    row.business = { roles: tally(syntheticMembers, 'role'), requests: tally(requests, 'status'), groups: groups.length,
      mileageGroups: mileageGroups.length, assignedMileageMembers: syntheticMembers.filter(value => mileageGroups.some(group => Number(group.id) === Number(value.mileage_group_id))).length,
      signups: signups.length, checks: checks.length, mediaStates: tally(mediaRows, 'status'), fees: [], posts: [], calls: [], gifts: [] };
    mark('club:' + club.id + ':owner-preserved', members.some(value => Number(value.user_id) === Number(owner.id) && value.role === 'owner'), true, Number(club.owner_id) === Number(owner.id) && members.some(value => Number(value.user_id) === Number(owner.id) && value.role === 'owner'));
    for (const role of ['manager', 'member']) mark('club:' + club.id + ':role:' + role, row.business.roles[role] || 0, '>=1 synthetic member', (row.business.roles[role] || 0) >= 1);
    for (const status of ['pending', 'approved', 'rejected']) mark('club:' + club.id + ':request:' + status, row.business.requests[status] || 0, '>=1 synthetic application', (row.business.requests[status] || 0) >= 1);
    mark('club:' + club.id + ':club-groups', groups.length, '>=1', groups.length >= 1);
    mark('club:' + club.id + ':mileage-group-assignment', row.business.assignedMileageMembers, '>=1', row.business.assignedMileageMembers >= 1);
    mark('club:' + club.id + ':activity-signups', signups.length, '>=10 synthetic registrations', signups.length >= 10);
    mark('club:' + club.id + ':activity-checks', checks.length, '>=5 synthetic check-ins', checks.length >= 5);
    mark('club:' + club.id + ':check-registration-links', checks.length, 'every check belongs to a signup', checks.every(check => signups.some(signup => signup.activity_id === check.activity_id && signup.user_id === check.user_id)));
    for (const status of ['shown', 'pending']) mark('club:' + club.id + ':media:' + status, row.business.mediaStates[status] || 0, '>=1', (row.business.mediaStates[status] || 0) >= 1);
    for (const [type, minimum] of Object.entries(minimums)) mark('club:' + club.id + ':' + type, row.counts[type] ?? 0, '>=' + minimum, (row.counts[type] ?? 0) >= minimum);
    for (const [label, endpoint] of [
      ['detail', base], ['templates', base + '/activity-templates'], ['fees', base + '/fees'], ['calls', base + '/calls'],
      ['meetups', base + '/meetups'], ['internals', base + '/internals'], ['posts', base + '/posts'], ['partner', base + '/partner']
    ]) {
      const body = await get('read:club:' + club.id + ':' + label, endpoint, owner);
      if (label === 'partner' && body) row.partnerGrade = body.grade?.id || null;
      if (label === 'detail' && body) {
        mark('read:club:' + club.id + ':owner-role', body.club?.role, 'owner', body.club?.role === 'owner');
        mark('read:club:' + club.id + ':groups-visible', body.groups?.length || 0, groups.length, body.groups?.length === groups.length);
        mark('read:club:' + club.id + ':requests-visible', body.requests?.length || 0, 'all synthetic pending requests', requests.filter(value => value.status === 'pending').every(request => body.requests?.some(value => Number(value.id) === Number(request.id))));
      }
      if (label === 'posts' && body) for (const post of posts) {
        const comments = all('SELECT user_id FROM club_comments WHERE post_id=?', post.id).filter(value => userIds.has(Number(value.user_id))).length;
        const likes = all('SELECT user_id FROM club_likes WHERE post_id=?', post.id).filter(value => userIds.has(Number(value.user_id))).length;
        const view = body.posts?.find(value => Number(value.id) === Number(post.id));
        row.business.posts.push({ id: post.id, comments, likes });
        mark('club:' + club.id + ':post:' + post.id + ':comments', comments, '>=1 synthetic comment', comments >= 1);
        mark('club:' + club.id + ':post:' + post.id + ':likes', likes, '>=1 synthetic like', likes >= 1);
        mark('read:post:' + post.id + ':interactions', { comments: view?.comments?.length || 0, likes: view?.likes || 0 }, 'DB interactions visible', !!view && view.comments.length >= comments && view.likes >= likes);
      }
    }
    for (const range of ['today', 'week', 'month', 'all']) {
      const body = await get('read:club:' + club.id + ':mileage:' + range, base + '/mileage?range=' + range, owner);
      if (body) {
        row.mileage[range] = { totalKm: body.totalKm, ranks: body.rank?.length || 0, groups: body.groups?.length || 0 };
        mark('read:club:' + club.id + ':mileage-nonempty:' + range, body.totalKm, '>0 computed mileage', body.totalKm > 0);
      }
    }
    await get('read:club:' + club.id + ':month-report', base + '/mileage/report?kind=month&at=' + month, owner);
    for (const activity of activities) {
      const detail = await get('read:activity:' + activity.id + ':detail', base + '/activities/' + activity.id, owner);
      const album = await get('read:activity:' + activity.id + ':album', base + '/activities/' + activity.id + '/album', owner);
      if (detail?.activity) {
        const status = detail.activity.status;
        row.activityStates[status] = (row.activityStates[status] || 0) + 1;
        const expectedSignups = signups.filter(value => value.activity_id === activity.id);
        const expectedChecks = checks.filter(value => value.activity_id === activity.id);
        mark('read:activity:' + activity.id + ':registrations', detail.signups?.length || 0, 'all synthetic signup rows visible', expectedSignups.every(signup => detail.signups?.some(value => Number(value.userId) === Number(signup.user_id))));
        mark('read:activity:' + activity.id + ':checks', detail.checks?.length || 0, 'all synthetic check rows visible', expectedChecks.every(check => detail.checks?.some(value => Number(value.userId) === Number(check.user_id))));
        mark('read:activity:' + activity.id + ':group-links', detail.groups?.length || 0, 'valid group snapshots and assigned signups', (detail.groups?.length || 0) >= 1 && expectedSignups.every(signup => detail.groups.some(value => Number(value.id) === Number(signup.group_id))));
      }
      const media = all('SELECT id,filename,kind,status FROM activity_media WHERE activity_id=?', activity.id);
      for (const file of media) {
        mark('read:activity:' + activity.id + ':album-item:' + file.id, !!album?.items?.some(item => Number(item.id) === Number(file.id)), true, !!album?.items?.some(item => Number(item.id) === Number(file.id)));
        verifyFile('activity:' + file.id, String(activity.id), file.filename, { activityId: activity.id, mediaId: file.id, status: file.status });
      }
      if (activity.cover_id) mark('activity:' + activity.id + ':approved-cover', activity.cover_id, 'shown photo in same activity', mediaRows.some(file => file.id === activity.cover_id && file.activity_id === activity.id && file.kind === 'photo' && file.status === 'shown') && Number(album?.coverId) === Number(activity.cover_id));
      const ordinary = syntheticMembers.find(member => member.role === 'member' && !mediaRows.some(file => file.activity_id === activity.id && file.user_id === member.user_id && file.status === 'pending'));
      if (media.some(file => file.status === 'pending') && ordinary) {
        const actor = users.find(user => Number(user.id) === Number(ordinary.user_id));
        const memberAlbum = await get('read:activity:' + activity.id + ':member-album', base + '/activities/' + activity.id + '/album', actor);
        mark('read:activity:' + activity.id + ':pending-privacy', memberAlbum?.items?.filter(file => file.status === 'pending').length ?? null, 0, !!memberAlbum && !memberAlbum.items?.some(file => file.status === 'pending'));
      }
    }
    for (const status of ['open', 'live', 'ended', 'cancelled']) mark('club:' + club.id + ':activity-state:' + status, row.activityStates[status] || 0, '>=1', (row.activityStates[status] || 0) >= 1);
    for (const fee of fees) {
      const body = await get('read:fee:' + fee.id, base + '/fees/' + fee.id, owner);
      const period = body?.period;
      const distribution = Object.fromEntries((period?.groups || []).map(group => [group.status, group.people.filter(person => userIds.has(Number(person.userId))).length]));
      row.business.fees.push({ id: fee.id, open: !!fee.open, statuses: distribution });
      for (const status of ['paid', 'waived', 'unpaid']) mark('club:' + club.id + ':fee:' + fee.id + ':' + status, distribution[status] || 0, '>=1 synthetic member (default unpaid included)', (distribution[status] || 0) >= 1);
      mark('read:fee:' + fee.id + ':state', period?.open, !!fee.open, period?.open === !!fee.open);
    }
    mark('club:' + club.id + ':fee-period-states', fees.map(fee => !!fee.open), 'open current and closed history', fees.some(fee => fee.open) && fees.some(fee => !fee.open));
    for (const call of calls) {
      const body = await get('read:call:' + call.id, base + '/calls/' + call.id, owner);
      const values = all('SELECT id,user_id,seconds,staff_filled FROM result_call_rows WHERE call_id=?', call.id).filter(value => userIds.has(Number(value.user_id)));
      const closed = localMs(call.deadline) < ctx.nowMs;
      row.business.calls.push({ id: call.id, closed, submitted: values.length });
      mark('club:' + club.id + ':call:' + call.id + ':rows', values.length, '>=10 synthetic submissions', values.length >= 10);
      mark('club:' + club.id + ':call:' + call.id + ':valid-results', values.length, 'positive member-submitted clocks', values.every(value => value.seconds > 0 && !value.staff_filled));
      const visibleRows = (body?.call?.groups || []).flatMap(group => group.rows || []);
      mark('read:call:' + call.id + ':rows-visible', visibleRows.length, 'all synthetic rows visible', values.every(value => visibleRows.some(visible => Number(visible.id) === Number(value.id))));
      mark('read:call:' + call.id + ':state', body?.call?.closed, closed, body?.call?.closed === closed);
      mark('club:' + club.id + ':call:' + call.id + ':custom-race', call.race_id, '', !call.race_id);
    }
    mark('club:' + club.id + ':call-states', row.business.calls.map(call => call.closed), 'open and closed calls', row.business.calls.some(call => call.closed) && row.business.calls.some(call => !call.closed));
    const gifts = all('SELECT id,cost,stock FROM gifts WHERE club_id=? AND instr(name,?)>0', club.id, tag);
    for (const gift of gifts) {
      const redemptions = all('SELECT id,user_id,cost FROM redemptions WHERE gift_id=?', gift.id).filter(value => userIds.has(Number(value.user_id)));
      row.business.gifts.push({ id: gift.id, stock: gift.stock, redemptions: redemptions.length });
      mark('club:' + club.id + ':gift:' + gift.id + ':stock', gift.stock, '>=0', gift.stock >= 0);
      for (const redemption of redemptions) {
        const debit = one('SELECT club_id,user_id,delta FROM point_entries WHERE ref_key=?', 'redeem:' + redemption.id);
        mark('redemption:' + redemption.id + ':points-link', debit?.delta ?? null, -redemption.cost, !!debit && Number(debit.club_id) === Number(club.id) && Number(debit.user_id) === Number(redemption.user_id) && debit.delta === -redemption.cost && redemption.cost === gift.cost);
      }
    }
    mark('club:' + club.id + ':gifts', gifts.length, '>=1 labelled gift', gifts.length >= 1);
    mark('club:' + club.id + ':redemptions', row.business.gifts.reduce((sum, gift) => sum + gift.redemptions, 0), '>=1 synthetic redemption', row.business.gifts.some(gift => gift.redemptions >= 1));
    for (const meetup of meetups) {
      const body = await get('read:meetup:' + meetup.id, base + '/meetups/' + meetup.id, owner);
      const status = body?.meetup?.status;
      if (status) row.meetupStates[status] = (row.meetupStates[status] || 0) + 1;
      for (const file of all('SELECT id,filename FROM meetup_photos WHERE meetup_id=?', meetup.id)) verifyFile('meetup:' + file.id, 'meetups', file.filename, { meetupId: meetup.id });
    }
    for (const internal of internals) {
      const body = await get('read:internal:' + internal.id, base + '/internals/' + internal.id, owner);
      const status = body?.race?.status;
      if (status) row.internalStates[status] = (row.internalStates[status] || 0) + 1;
    }
    const member = ctx.members(club.id)[0];
    if (member) {
      await get('read:club:' + club.id + ':member-detail', base, member);
      await get('read:club:' + club.id + ':member-partner', base + '/partner', member);
    } else mark('club:' + club.id + ':synthetic-member', 0, '>=1', false);
    report.clubs.push(row);
  }

  // Check only media belonging to the tracked freshly created user records.
  for (const tracked of scopedUsers.values()) {
    for (const result of tracked.results || []) {
      if (!result.created) continue;
      const files = all('SELECT id,filename,kind FROM runner_media WHERE user_id=? AND race_id=? AND distance=?', tracked.userId, result.raceId, result.distance);
      for (const file of files) verifyFile('runner:' + file.id, 'runner', file.filename, { userId: tracked.userId, kind: file.kind });
    }
    if (tracked.history?.entryId) {
      for (const file of all('SELECT id,filename,kind FROM race_history_media WHERE user_id=? AND entry_key=?', tracked.userId, tracked.history.entryId)) verifyFile('history:' + file.id, 'history', file.filename, { userId: tracked.userId, kind: file.kind });
    }
  }
  mark('media:fixture-files', report.media.filter(file => file.checked).length, '>0 checked files', report.media.some(file => file.checked));
  const failed = report.checks.filter(check => !check.passed);
  report.summary = { passed: failed.length === 0, checks: report.checks.length, failed: failed.length, users: report.users.length, clubs: report.clubs.length,
    representatives: report.representatives.length, mediaFiles: report.media.length, mediaReadable: report.media.filter(file => file.readable).length,
    userCoverage: { runs: report.users.reduce((sum, user) => sum + user.runs, 0), futurePlans: report.users.reduce((sum, user) => sum + user.futurePlans, 0), oldResults: report.users.reduce((sum, user) => sum + user.oldResults, 0), privateHistories: report.users.reduce((sum, user) => sum + user.privateHistories, 0) },
    clubCoverage: Object.fromEntries(Object.keys(minimums).map(type => [type, report.clubs.reduce((sum, club) => sum + (club.counts[type] || 0), 0)])) };
  if (failed.length) {
    const error = new Error('Scenario verification failed: ' + failed.length + ' of ' + report.checks.length + ' checks; ' + failed.slice(0, 5).map(check => check.name).join(', '));
    error.report = report;
    throw error;
  }
  return report;
};
