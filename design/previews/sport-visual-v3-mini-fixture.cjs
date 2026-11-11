/* Current sport Page methods with a deterministic display fixture; not WeChat. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset = {}, value = '') => ({ currentTarget: { dataset }, detail: { value } });
const rows = [[29,8],[23,12],[18,10],[15,8],[10,7],[8,5],[5,8.3],[2,10.2]].map(([day,distanceKm], index) => ({ id: index+1, type: 'run', typeLabel: '户外跑', startedAt: `2026-11-${String(day).padStart(2,'0')} 06:30`, distanceKm, durationLabel: '55:46', paceLabel: '5′28″', source: 'manual', sourceLabel: '手动记录', volumeKm: distanceKm, climb: 36, city: '杭州', clubs: [] }));
function instance(scenario) {
  let definition;
  const calls = [], app = { globalData: { token: scenario === 'guest' ? '' : 'synthetic-sport-token', baseUrl: 'https://fixture.invalid' } };
  const request = async (url, method = 'GET', body) => {
    calls.push({ url, method, body });
    if (url.startsWith('/runs?')) {
      const month = new URL(url, 'https://fixture.invalid').searchParams.get('month');
      const runs = scenario === 'empty' || month !== '2026-11' ? [] : clone(rows);
      return { month: { id: month, km: runs.length ? 68.5 : 0, count: runs.length, days: runs.length, paceLabel: runs.length ? '5′28″' : '', target: scenario === 'empty' ? 0 : 120, percent: runs.length ? 57 : 0, canFlag: month === '2026-11' }, runs, year: { km: 865 }, total: { km: 1260, count: 116 } };
    }
    if (method === 'PUT' || method === 'DELETE') return { ok: true };
    throw Error('Unexpected display fixture request: ' + method + ' ' + url);
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/pages/sport/sport.js'),'utf8'), { Page(value) { definition = value; }, getApp: () => app, wx: { switchTab() {}, navigateTo() {}, setStorageSync() {} }, console, require(name) { if (name === '../../utils/request') return { request }; if (name === '../../config') return { baseUrl: 'https://fixture.invalid' }; throw Error(name); } });
  const page = { ...definition, data: clone(definition.data), setData(patch) { for (const [key,value] of Object.entries(patch)) { const parts = key.replace(/\[(\d+)\]/g,'.$1').split('.'); let target=this.data; for(const part of parts.slice(0,-1)) target=target[part]; target[parts.at(-1)]=clone(value); } } };
  return {page,calls};
}
module.exports = {
  cases: ['base','target','record','edit','empty','guest'].map(scenario => ({ route: 'pages/sport/sport', scenario })),
  async prepare(route, initial, scenario) {
    const {page:p,calls}=instance(scenario);
    p.setData({ month:'2026-11' }); p.onShow(); await tick();
    if (scenario !== 'guest') {
      assert.equal(p.data.monthLabel,'2026年11月');
      assert.equal(p.data.weeklyRuns.reduce((sum,row)=>sum+row.km,0).toFixed(1), scenario==='empty'?'0.0':'68.5');
      if (scenario==='target') { p.toggleTarget(); assert.equal(p.data.targetOpen,true); }
      if (scenario==='record') { p.toggleRecord(); assert.equal(p.data.recordOpen,true); }
      if (scenario==='edit') { p.toggleRun(event({id:1})); assert.equal(p.data.expandedRunId,1); p.onCity(event({index:0},'苏州')); assert.equal(p.data.summary.runs[0].city,'苏州'); }
      // Exercise the new navigation against Page methods, then restore the scene.
      await p.shiftMonth(event({offset:-1})); assert.equal(p.data.month,'2026-10'); assert.equal(p.data.summary.runs.length,0);
      await p.shiftMonth(event({offset:1})); assert.equal(p.data.month,'2026-11'); assert.ok(calls.filter(call=>call.url.startsWith('/runs?')).length>=3);
    }
    return {data:p.data,components:{},css:''};
  },
  async audit({page,scenario}) {
    const errors=[];
    const text=await page.locator('body').innerText();
    if(scenario!=='guest') { if(await page.locator('.chart-column').count()!==5) errors.push('All five monthly date ranges must render'); if(!text.includes('2026年11月')) errors.push('Readable selected month is missing'); }
    if(scenario==='target'&&!text.includes('保存目标')) errors.push('Target form missing');
    if(scenario==='record'&&!text.includes('保存记录')) errors.push('Run creation form missing');
    if(scenario==='edit'&&!text.includes('保存修改')) errors.push('Run editor missing');
    if(scenario==='empty'&&!text.includes('从今天的一次跑步开始')) errors.push('Empty state missing');
    const small=await page.evaluate(()=>[...document.querySelectorAll('.sport-page *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<11.9}).map(el=>el.className));
    if(small.length) errors.push('Visible text below 12px: '+small.join(','));
    return errors;
  }
};
