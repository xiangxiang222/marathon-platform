const { ensureRadarSchema, validateRadarConfig, saveRadarConfig } = require('../server/src/radar-engine');
const { formatClock } = require('../server/src/career');

// Synthetic race identities and athletes only. Re-running preserves edited data.
function seedRadarDemo(db, options = {}) {
  ensureRadarSchema(db);
  const today = options.today || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const raceYear = year + 1;
  const specifications = [
    { id: 'radar-demo-lakeside', name: '滨湖马拉松 · 模拟赛事', city: '模拟滨湖', month: '03-14', depth: 8, full: 8220, half: 3990, entrants: 1 },
    { id: 'radar-demo-coast', name: '海风马拉松 · 模拟赛事', city: '模拟海岸', month: '04-11', depth: 3, full: 7980, half: 3840, entrants: 4 },
    { id: 'radar-demo-mountain', name: '山城半程马拉松 · 模拟赛事', city: '模拟山城', month: '05-09', depth: 8, full: null, half: 4200, entrants: 2, partial: true }
  ];
  const created = [], skipped = [];
  const insert = db.prepare("INSERT OR IGNORE INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet,source,updated_at) VALUES (?,?,?,?,?,?,'','','road','offline',?,?)");
  db.transaction(() => {
    for (const spec of specifications) {
      if (db.prepare('SELECT race_id FROM radar_configs WHERE race_id=?').get(spec.id)) { skipped.push(spec.id); continue; }
      const raceDate = raceYear + '-' + spec.month;
      insert.run(spec.id, spec.name, spec.city, '模拟地区', spec.full ? 'full,half' : 'half', raceDate, '拿奖雷达功能演示，非真实赛事公告', new Date().toISOString());
      const groups = [];
      for (const distance of spec.full ? ['full', 'half'] : ['half']) {
        for (const gender of ['男', '女']) {
          const base = spec[distance] + (gender === '女' ? distance === 'full' ? 1800 : 900 : 0);
          const step = distance === 'full' ? 60 : 40;
          const groupId = distance + '-' + (gender === '男' ? 'men' : 'women');
          const histories = [year, year - 1, year - 2].map((historyYear, offset) => ({
            year: historyYear, timing: 'gun', source: '模拟榜单 · ' + historyYear + ' 年功能演示',
            rows: Array.from({ length: spec.partial && offset === 0 ? 5 : 8 }, (_, index) => ({ place: index + 1, name: '模拟选手' + (index + 1), clock: formatClock(base + index * step + [0, 45, -30][offset]) }))
          }));
          // One deliberately incomplete group exercises the unavailable threshold state.
          if (spec.partial && gender === '女') histories.forEach(item => { item.rows = item.rows.slice(0, 5); });
          const entrants = Array.from({ length: spec.entrants }, (_, index) => ({
            id: groupId + '-athlete-' + index, name: '模拟跑者' + String.fromCharCode(65 + index),
            clock: formatClock(base - 60 + index * 35), pbDate: (year - 1) + '-04-12',
            status: index === 3 ? '已缴费' : '中签', evidence: index === 2 ? 'self_reported' : 'verified', source: '模拟参赛线索 · 非真实运动员'
          }));
          const awards = Array.from({ length: spec.depth }, (_, index) => ({ place: index + 1, amount: [10000, 6000, 3000, 2000, 1500, 1000, 800, 500][index] }));
          groups.push({ id: groupId, distance, gender, timing: 'gun', awardDepth: spec.depth, eligibility: '模拟规则：对应项目男女总名次奖，金额为税前演示值；仅供功能体验。', ruleSource: '模拟奖励规则 · 本期只评估前八名以内', awards, histories, entrants });
        }
      }
      const config = validateRadarConfig({ demo: true, groups }, { today, raceDate });
      saveRadarConfig(db, spec.id, config); created.push(spec.id);
    }
  })();
  return { created, skipped };
}
if (require.main === module) {
  const { getDb } = require('../server/src/db');
  const result = seedRadarDemo(getDb());
  console.log(JSON.stringify({ ...result, notice: '已添加模拟赛事、历年前八及模拟参赛阵容；已有后台编辑内容保留。' }, null, 2));
}
module.exports = { seedRadarDemo };
