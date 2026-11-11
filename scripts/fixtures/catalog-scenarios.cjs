'use strict';

// Scenario data only. Importing this module performs no I/O and starts no seed.
// The caller supplies its database, authenticated API and durable once() journal.
const DISCLAIMER = '仅供模拟场景演示，不是真实赛事、报名、奖励或合作承诺。';

function marked(ctx, text) { return `${ctx.tag || '【模拟】'}${text}`; }
function raceRow(ctx, id) {
  const row = ctx.db.prepare('SELECT * FROM races WHERE id = ?').get(id);
  if (!row) throw new Error(`模拟赛事未找到：${id}`);
  return { ...row, raceDate: row.race_date, distanceKeys: String(row.distances || '').split(',').filter(Boolean) };
}
function nextMonth(month) {
  const [year, part] = month.split('-').map(Number);
  return new Date(Date.UTC(year, part, 1)).toISOString().slice(0, 7);
}

async function seedCatalog(ctx) {
  const specs = [
    { key: 'past-marathon', offset: -430, city: '北京', province: '北京', title: '城市秋日马拉松', distances: ['full', 'half', '10k', '5k'] },
    { key: 'past-half', offset: -210, city: '杭州', province: '浙江', title: '湖畔春日半程跑', distances: ['half', '10k', '5k'] },
    { key: 'past-trail', offset: -65, city: '成都', province: '四川', title: '山径体验赛', distances: ['10k', '5k'], kinds: ['trail'] },
    { key: 'past-city', offset: -14, city: '上海', province: '上海', title: '滨江城市长跑', distances: ['full', 'half', '10k', '5k'] },
    { key: 'future-city', offset: 14, city: '北京', province: '北京', title: '初冬城市马拉松', distances: ['full', 'half', '10k', '5k'], phase: 'settled' },
    { key: 'future-conflict', offset: 14, city: '杭州', province: '浙江', title: '湖畔周末半程跑', distances: ['half', '10k', '5k'], phase: 'open' },
    { key: 'future-trail', offset: 28, city: '成都', province: '四川', title: '林间山径体验赛', distances: ['10k', '5k'], kinds: ['trail'], phase: 'waiting' },
    { key: 'future-online', offset: 35, city: '线上', province: '', title: '冬日线上陪伴跑', distances: ['10k', '5k'], meet: 'online', phase: 'online' },
    { key: 'future-unannounced', offset: 56, city: '深圳', province: '广东', title: '新年城市长跑', distances: ['full', 'half', '10k', '5k'], phase: 'unannounced' }
  ];
  const pastRaces = [], futureRaces = [];
  for (const spec of specs) {
    const made = await ctx.once(`catalog:race:${spec.key}`, async () => {
      const name = marked(ctx, spec.title);
      const found = ctx.db.prepare('SELECT id FROM races WHERE name = ? AND race_date = ?').get(name, ctx.day(spec.offset));
      const result = found || await ctx.api('POST', '/admin/races', ctx.admin, {
        name, raceDate: ctx.day(spec.offset), city: spec.city, province: spec.province,
        place: marked(ctx, spec.meet === 'online' ? '自行选择安全路线' : `${spec.city}公园集合区`),
        distances: spec.distances, kinds: spec.kinds || [], groups: '', meet: spec.meet || 'offline',
        startAt: spec.meet === 'online' ? '' : '07:30', organizer: marked(ctx, '场景演示小组'), grade: '',
        fee: marked(ctx, '免费演示，不开展实际报名或收款'), scale: marked(ctx, '300人场景'),
        route: marked(ctx, '公园环线示意，非真实赛事路线，请勿据此出行。'),
        pickup: marked(ctx, '无实际领物安排。'), pacers: marked(ctx, '仅演示分组，不提供现实配速服务。'),
        signupUrl: '', drawUrl: '', bibUrl: '', resultUrl: '', liveUrl: '', eventUrl: '', officialUrl: '', phone: '',
        guideText: `# ${name}\n\n${DISCLAIMER}\n\n## 场景安排\n\n- 日期：${ctx.day(spec.offset)}\n- 项目：${spec.distances.join(' / ')}\n- 本页面仅用于展示赛历、个人计划、跑团名单与成绩功能。\n\n## 说明\n\n不开放实际报名，不收款，不提供保险、官方认证或现场服务。个人填写的模拟成绩不代表真实完赛。`
      });
      return { id: result.id };
    });
    // Keep all timeline edits inside the public admin contract. No official URLs
    // or official_races/bot submissions are invented for these manual entries.
    if (spec.offset < 0 || spec.phase !== 'unannounced') {
      await ctx.once(`catalog:race-nodes:${spec.key}`, async () => {
        const nodes = spec.offset < 0
          ? { regStart: ctx.day(spec.offset - 60), deadline: ctx.day(spec.offset - 20), drawAt: ctx.day(spec.offset - 14), payDeadline: ctx.day(spec.offset - 10) }
          : ({
            settled: { regStart: ctx.day(-60), deadline: ctx.day(-8), drawAt: ctx.day(-5), payDeadline: ctx.day(-2) },
            open: { regStart: ctx.day(-7), deadline: ctx.day(4), drawAt: ctx.day(6), payDeadline: ctx.day(9) },
            waiting: { regStart: ctx.day(-60), deadline: ctx.day(-2), drawAt: ctx.day(3), payDeadline: ctx.day(6) },
            online: { regStart: ctx.day(-7), deadline: ctx.day(20), drawAt: '', payDeadline: '' }
          })[spec.phase];
        await ctx.api('PUT', `/admin/races/${made.id}`, ctx.admin, {
          ...nodes,
          deadlineName: '模拟报名截止', source: marked(ctx, '自建演示时间表，非官方信息')
        });
        return { id: made.id };
      });
    }
    (spec.offset < 0 ? pastRaces : futureRaces).push({ ...raceRow(ctx, made.id), scenarioPhase: spec.phase || 'finished' });
  }
  // Non-cash, explicitly fictional rules exercise the radar without implying a
  // real prize purse, official cutoff or certification.
  const radarRace = futureRaces[0];
  const rules = [
    { key: 'finish', distance: 'full', kind: 'break', breakClock: '05:00:00' },
    { key: 'half', distance: 'half', kind: 'place', placeN: 20, cutoffClock: '02:10:00' },
    { key: 'age', distance: '10k', kind: 'age', placeN: 10, ageMin: 18, ageMax: 60 },
    { key: 'local', distance: '5k', kind: 'local', placeN: 10, province: '北京' }
  ];
  for (const rule of rules) {
    await ctx.once(`catalog:prize:${rule.key}`, async () => {
      const source = marked(ctx, `演示规则-${rule.key}，非真实赛事奖项`);
      const existing = ctx.db.prepare('SELECT id FROM prize_rules WHERE race_id = ? AND source = ?').get(radarRace.id, source);
      if (existing) return { id: existing.id };
      const { key, ...values } = rule;
      return ctx.api('POST', `/admin/races/${radarRace.id}/prizes`, ctx.admin, {
        gender: '', ageMin: 0, ageMax: 0, province: '', placeN: 0, breakClock: '',
        amount: 0, tax: 0, stack: false, cutoffClock: '', cutoffSource: '',
        ...values, source, note: marked(ctx, '无真实奖励，不构成参赛承诺'),
        ...(values.cutoffClock ? { cutoffSource: marked(ctx, '虚构往届对照，仅作场景展示') } : {})
      });
    });
  }
  await ctx.once('catalog:draw-example', async () => {
    const label = marked(ctx, '演示往届');
    const existing = ctx.db.prepare('SELECT id FROM draw_rates WHERE race_id = ? AND label = ?').get(radarRace.id, label);
    return existing || ctx.api('POST', `/admin/races/${radarRace.id}/draws`, ctx.admin, {
      label, applicants: 1200, quota: 800, source: marked(ctx, '虚构人数示例，非官方中签数据')
    });
  });
  await ctx.recordSetup('catalog', { pastRaces: pastRaces.map(x => x.id), futureRaces: futureRaces.map(x => x.id), officialSourcesCreated: false });
  return { pastRaces, futureRaces };
}

async function seedFeedback(ctx) {
  const targets = ['pending', 'pending', 'published', 'published', 'published', 'published', 'published', 'published', 'published', 'published', 'adopted', 'adopted', 'building', 'released', 'released', 'declined', 'declined', 'withdrawn'];
  const topics = [
    ['活动月历筛选体验', 'ui', 'clubs'], ['跑量记录备注建议', 'feature', 'sport'],
    ['赛事城市筛选建议', 'feature', 'races'], ['团练分组信息排版', 'ui', 'clubs'],
    ['跑史图片整理建议', 'feature', 'profile'], ['运动目标展示反馈', 'bug', 'sport'],
    ['活动报名提示建议', 'feature', 'clubs'], ['赛历日期展示体验', 'ui', 'races'],
    ['团内动态阅读建议', 'other', 'clubs'], ['个人档案入口体验', 'ui', 'profile']
  ];
  const ids = [];
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index], author = ctx.users[(index + 13) % ctx.users.length];
    const [topic, category, module] = topics[index % topics.length];
    const title = marked(ctx, `${topic} ${String(index + 1).padStart(2, '0')}`);
    const created = await ctx.once(`community:feedback:create:${index}`, async () => {
      const existing = ctx.db.prepare('SELECT id FROM feedback WHERE user_id = ? AND title = ?').get(author.id, title);
      if (existing) return { id: existing.id };
      const value = await ctx.api('POST', '/feedback', author, {
        title, category, module,
        body: marked(ctx, `这是合成跑友的正常使用场景样例：${topic}。希望信息层级更清楚，方便查看和操作。该条及其处理进度仅用于演示，不代表真实用户投诉、产品缺陷确认或研发交付承诺。`)
      });
      return { id: value.id };
    });
    ids.push(created.id);
    if (index % 5 === 0) await ctx.once(`community:feedback:image:${index}`, async () => {
      const existing = ctx.db.prepare('SELECT id FROM feedback_images WHERE feedback_id = ? LIMIT 1').get(created.id);
      if (!existing) await ctx.upload(`/feedback/${created.id}/images`, author, ctx.fixturePhoto, '模拟界面反馈.png');
      return { id: created.id };
    });
    const stages = target === 'pending' ? [] : target === 'withdrawn' ? ['withdrawn'] :
      target === 'declined' ? ['published', 'declined'] :
      target === 'published' ? ['published'] : target === 'adopted' ? ['published', 'adopted'] :
      target === 'building' ? ['published', 'adopted', 'building'] : ['published', 'adopted', 'building', 'released'];
    for (const stage of stages) {
      await ctx.once(`community:feedback:${index}:${stage}`, async () => {
        const current = await ctx.api('GET', `/admin/feedback/${created.id}`, ctx.admin);
        const ahead = ['pending', 'published', 'adopted', 'building', 'released'];
        if (current.status === stage || (stage === 'published' && current.status === 'declined') || (ahead.includes(stage) && ahead.indexOf(current.status) > ahead.indexOf(stage))) return { id: created.id, status: current.status };
        if (stage === 'withdrawn') {
          await ctx.api('POST', `/feedback/${created.id}/withdraw`, author, {});
        } else {
          await ctx.api('PATCH', `/admin/feedback/${created.id}`, ctx.admin, {
            status: stage, expectedVersion: current.revision,
            reply: marked(ctx, `流程样例：${({ published: '公开征集意见', adopted: '演示采纳', building: '演示开发中', released: '演示已上线', declined: '演示暂不采纳' })[stage]}。仅展示处理状态，不代表真实产品承诺。`),
            ...(stage === 'adopted' ? { rewardName: marked(ctx, '纪念奖励样例（无实物，不领取）') } : {})
          });
        }
        return { id: created.id, status: stage };
      });
      // Voting occurs while the item is published, before later legal state
      // transitions close voting. All votes belong to synthetic users only.
      if (stage === 'published') {
        for (let vote = 0; vote < 3 + index % 9; vote++) {
          const voter = ctx.users[(index * 7 + vote + 50) % ctx.users.length];
          if (voter.id === author.id) continue;
          await ctx.once(`community:feedback:vote:${index}:${voter.id}`, async () => {
            const row = ctx.db.prepare('SELECT status FROM feedback WHERE id = ?').get(created.id);
            const exists = ctx.db.prepare('SELECT 1 FROM feedback_votes WHERE feedback_id = ? AND user_id = ?').get(created.id, voter.id);
            if (!exists && row.status === 'published') await ctx.api('PUT', `/feedback/${created.id}/vote`, voter, { voted: true });
            return { id: created.id, userId: voter.id };
          });
        }
      }
    }
  }
  return ids;
}

async function seedCommunity(ctx) {
  const catalog = ctx.catalog || await seedCatalog(ctx);
  const newsIds = [];
  for (let index = 0; index < 8; index++) {
    const race = [...catalog.futureRaces, ...catalog.pastRaces][index];
    const key = `scenario-news-${index + 1}`;
    const title = marked(ctx, `${race.city}跑步场景 · ${index % 2 ? '周末准备清单' : '活动安排示例'}`);
    const saved = await ctx.once(`community:news:${index}`, async () => {
      const existing = ctx.db.prepare('SELECT id FROM news WHERE race_id = ? AND article_key = ?').get(race.id, key);
      if (existing) return { id: existing.id };
      const value = await ctx.api('POST', '/admin/news', ctx.admin, {
        raceId: race.id, key, title, source: marked(ctx, '场景编辑组'), publishedAt: ctx.day(-index),
        body: `# ${title}\n\n${DISCLAIMER}\n\n## 出发前\n\n- 核对页面上的日期和项目。\n- 根据自己的身体状态安排运动。\n- 与团友确认集合信息。\n\n## 场景说明\n\n本文关联${race.name}，用于展示资讯列表、正文与关联赛事入口；不代表赛事公告或真实新闻，无官方报名、付款或领物安排。`
      });
      return { id: value.news.id };
    });
    newsIds.push(saved.id);
  }
  const feedbackIds = await seedFeedback(ctx);
  const month = ctx.day(0).slice(0, 7);
  const supplySpecs = [
    { key: 'basic', name: '训练补给包样例', total: 100, quota: 6, needChecks: 0, needKm: 0 },
    { key: 'progress', name: '月度坚持纪念包样例', total: 80, quota: 4, needChecks: 2, needKm: 20 },
    { key: 'challenge', name: '进阶训练纪念包样例', total: 40, quota: 2, needChecks: 7, needKm: 80 },
    { key: 'closed', name: '已关闭物资场景', total: 20, quota: 2, needChecks: 0, needKm: 0, closed: true }
  ];
  const supplies = [];
  for (const spec of supplySpecs) {
    const saved = await ctx.once(`community:supply:${spec.key}`, async () => {
      const name = marked(ctx, spec.name), existing = ctx.db.prepare('SELECT id FROM supplies WHERE name = ? AND month = ?').get(name, month);
      if (existing) return { id: existing.id };
      return ctx.api('POST', '/admin/supplies', ctx.admin, {
        brand: marked(ctx, '虚构训练伙伴'), name, month, total: spec.total, quota: spec.quota,
        needChecks: spec.needChecks, needKm: spec.needKm,
        note: marked(ctx, '仅演示领取条件和额度，无实际品牌合作、实物或发放承诺。')
      });
    });
    supplies.push({ ...spec, id: saved.id });
    if (spec.closed) await ctx.once(`community:supply:close:${spec.key}`, async () => {
      await ctx.api('PUT', `/admin/supplies/${saved.id}`, ctx.admin, { open: false });
      return { id: saved.id };
    });
  }
  const claims = [], skipped = [];
  const byId = new Map(ctx.users.map(user => [Number(user.id), user]));
  for (const club of ctx.clubs) {
    // Persist selection before claiming. Re-running must not select additional
    // people merely because the original people now have pending claims.
    const plan = await ctx.once(`community:claim-plan:${club.id}`, async () => {
      const roster = (await ctx.members(club.id)).map(user => byId.get(Number(user.id || user.userId))).filter(Boolean);
      const rows = [];
      for (const user of roster) {
        if (rows.length >= 3) break;
        const view = await ctx.api('GET', `/clubs/${club.id}/partner`, user);
        const wanted = supplies[rows.length === 2 ? 1 : 0];
        // A cancelled row still belongs to its original scenario. Reusing it
        // would move that same claim to another club and erase the example.
        if (ctx.db.prepare('SELECT 1 FROM supply_claims WHERE supply_id = ? AND user_id = ?').get(wanted.id, user.id)) continue;
        if (view.supplies.some(supply => supply.id === wanted.id && supply.ready)) rows.push({ userId: user.id, supplyId: wanted.id, cancel: rows.length === 1 });
      }
      return { rows };
    });
    for (const entry of plan.rows) {
      const user = byId.get(entry.userId), wanted = supplies.find(item => item.id === entry.supplyId);
      if (!user || !wanted) throw new Error('模拟物资领取计划与合成账号不一致');
      const result = await ctx.once(`community:claim:${club.id}:${wanted.id}:${user.id}`, async () => {
        const existing = ctx.db.prepare('SELECT id, status FROM supply_claims WHERE supply_id = ? AND user_id = ?').get(wanted.id, user.id);
        if (!existing || existing.status === 'cancelled') await ctx.api('POST', `/clubs/${club.id}/supplies/${wanted.id}/claim`, user, {});
        const row = ctx.db.prepare('SELECT id, status FROM supply_claims WHERE supply_id = ? AND user_id = ? AND club_id = ?').get(wanted.id, user.id, club.id);
        if (!row) throw new Error('模拟物资已由该成员在另一跑团领取，未跨团修改领取记录');
        return { id: row.id, clubId: club.id, supplyId: wanted.id, userId: user.id };
      });
      claims.push(result);
      if (entry.cancel) await ctx.once(`community:claim:cancel:${result.id}`, async () => {
        const row = ctx.db.prepare('SELECT status FROM supply_claims WHERE id = ?').get(result.id);
        if (row.status === 'pending') await ctx.api('DELETE', `/clubs/${club.id}/supplies/${wanted.id}/claims/${result.id}`, user);
        return { id: result.id, status: 'cancelled' };
      });
    }
    if (!plan.rows.length) skipped.push({ clubId: club.id, reason: '没有满足当前物资条件的合成成员；保留真实资格计算，不修改组织核验或合作等级。' });
  }
  const leagues = [];
  for (const leagueMonth of [month, nextMonth(month)]) {
    const saved = await ctx.once(`community:league:${leagueMonth}`, async () => {
      const existing = ctx.db.prepare('SELECT id, title FROM leagues WHERE month = ?').get(leagueMonth);
      if (existing && !existing.title.startsWith(ctx.tag || '【模拟】')) return { skipped: true, month: leagueMonth, reason: '该月已有非模拟联赛，未修改、加入或覆盖。' };
      if (existing) return { id: existing.id, month: leagueMonth };
      const made = await ctx.api('POST', '/admin/leagues', ctx.admin, {
        month: leagueMonth, title: marked(ctx, `${leagueMonth}跑团训练联赛`), sponsor: marked(ctx, '虚构社区伙伴'),
        prize: marked(ctx, '展示榜单，无实物、现金或真实赞助承诺')
      });
      return { id: made.id, month: leagueMonth };
    });
    leagues.push(saved);
    if (saved.skipped || leagueMonth !== month) continue;
    for (const club of ctx.clubs) {
      const actor = byId.get(Number(club.owner_id)) || (Number(ctx.owner?.id) === Number(club.owner_id) ? ctx.owner : null);
      if (!actor) { skipped.push({ clubId: club.id, reason: '未提供该团团长身份，不能代为报名联赛。' }); continue; }
      await ctx.once(`community:league:join:${saved.id}:${club.id}`, async () => {
        await ctx.api('POST', `/clubs/${club.id}/league/join`, actor, {});
        return { id: saved.id, clubId: club.id };
      });
    }
  }
  const result = { newsIds, feedbackIds, supplyIds: supplies.map(x => x.id), claims, leagues, skipped };
  await ctx.recordSetup('community', { ...result, officialVerificationChanged: false, realShipmentsCreated: false, awardClaimsCreated: false });
  return result;
}

module.exports = { seedCatalog, seedCommunity };
