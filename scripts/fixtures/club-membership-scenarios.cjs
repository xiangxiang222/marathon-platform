// Synthetic admission workflows. Never remove an existing member or request.
module.exports = async function(ctx) {
  const { db, api, once, owner, clubs, users } = ctx;
  const report = [];
  for (const [index, club] of clubs.entries()) {
    const base = '/clubs/' + club.id, groups = [], requests = [];
    for (let number = 0; number < 2; number++) groups.push(await once('members:' + club.id + ':group:' + number, async () => {
      const name = ctx.tag + ['轻松配速组', '进阶配速组'][number];
      const existing = db.prepare('SELECT id FROM club_groups WHERE club_id=? AND name=?').get(club.id, name);
      if (existing) return existing;
      return { id: (await api('POST', base + '/groups', owner, { name, pace: number ? '5:00–5:30' : '6:00–6:30', capacity: 0 })).group.id };
    }));
    const plan = await once('members:' + club.id + ':plan', async () => {
      const candidates = [...users.slice(index * 13), ...users.slice(0, index * 13)].filter(user =>
        !db.prepare('SELECT 1 FROM club_members WHERE club_id=? AND user_id=?').get(club.id, user.id) &&
        !db.prepare('SELECT 1 FROM club_requests WHERE club_id=? AND user_id=?').get(club.id, user.id));
      if (candidates.length < 3) throw new Error('Not enough synthetic outsiders');
      return { rows: ['pending', 'reject', 'approve'].map((decision, n) => ({ decision, userId: candidates[n].id })) };
    });
    for (const item of plan.rows) {
      const person = users.find(u => u.id === item.userId);
      const request = await once('members:' + club.id + ':request:' + person.id, async () => {
        const before = db.prepare('SELECT id FROM club_requests WHERE club_id=? AND user_id=? ORDER BY id DESC LIMIT 1').get(club.id, person.id);
        if (before) return before;
        await api('POST', '/clubs/join', person, { code: club.code });
        const row = db.prepare('SELECT id FROM club_requests WHERE club_id=? AND user_id=? ORDER BY id DESC LIMIT 1').get(club.id, person.id);
        if (!row) throw new Error('Synthetic join request was not created');
        return row;
      });
      if (item.decision !== 'pending') await once('members:' + club.id + ':decision:' + person.id, async () => {
        await api('POST', base + '/requests/' + request.id, owner, { decision: item.decision });
        return { requestId: request.id, userId: person.id, decision: item.decision };
      });
      requests.push({ requestId: request.id, userId: person.id, decision: item.decision });
    }
    report.push({ clubId: club.id, groups, requests });
  }
  return report;
};
