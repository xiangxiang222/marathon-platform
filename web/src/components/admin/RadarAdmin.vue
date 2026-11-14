<template>
  <section class="radar-admin" aria-labelledby="radar-admin-title" @keydown.enter="preventOuterSubmit">
    <header class="ra-heading">
      <div><span class="ra-kicker">男女前八 · 历史与本届</span><h3 id="radar-admin-title">拿奖雷达</h3><p>按项目、男女组维护；历史成绩与今年阵容分别录入。</p></div>
      <span v-if="config.demo" class="ra-demo">模拟数据</span>
    </header>
    <p v-if="loading" class="ra-empty" role="status">正在读取雷达资料…</p>
    <div v-else-if="loadError" class="ra-error" role="alert">{{ loadError }}<button type="button" @click="load">重新读取</button></div>
    <template v-else-if="loadedId === raceId">
      <fieldset class="ra-fields" :disabled="saving">
        <label class="ra-check"><input v-model="config.demo" type="checkbox" /><span>这场使用模拟数据<small>开启后，前台明确显示“模拟数据”。正式资料录入完毕后再关闭。</small></span></label>
        <div class="ra-group-nav" role="group" aria-label="雷达参赛组">
          <button v-for="item in config.groups" :key="item.id" type="button" :class="{ on: selectedId === item.id }" :aria-pressed="selectedId === item.id" @click="selectGroup(item.id)">{{ distanceLabels[item.distance] }} · {{ item.gender === '男' ? '男子' : '女子' }}</button>
          <button class="ra-add" type="button" :disabled="config.groups.length >= 8" @click="addingGroup = !addingGroup">＋ 添加参赛组</button>
        </div>
        <div v-if="addingGroup" class="ra-add-group">
          <label>比赛项目<select v-model="newDistance" aria-label="新增组项目"><option v-for="(label, value) in distanceLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <label>男女组<select v-model="newGender" aria-label="新增组性别"><option value="男">男子</option><option value="女">女子</option></select></label>
          <div class="ra-actions"><button type="button" class="ra-primary" @click="addGroup">添加组别</button><button type="button" @click="addingGroup = false">取消</button></div>
        </div>
        <div v-if="!group && !addingGroup" class="ra-empty"><strong>先添加一个参赛组</strong><p>每个项目分别记录男子、女子前八。资料不全也可以保存，未录入的名次保持空白。</p></div>
        <template v-if="group">
          <div class="ra-group-heading"><span>{{ distanceLabels[group.distance] }}{{ group.gender === '男' ? '男子' : '女子' }}总排名</span><button class="ra-text ra-danger" type="button" @click="confirmDelete = confirmDelete === 'group' ? '' : 'group'">删除本组</button></div>
          <div v-if="confirmDelete === 'group'" class="ra-confirm"><span>删除本组及其历史、阵容？保存后生效。</span><button type="button" @click="removeGroup">确认删除本组</button><button type="button" @click="confirmDelete = ''">取消</button></div>
          <div class="ra-tabs" role="tablist" aria-label="雷达资料分类"><button v-for="item in tabs" :id="'ra-tab-' + item.id" :key="item.id" type="button" role="tab" :aria-selected="tab === item.id" :aria-controls="'ra-panel-' + item.id" :class="{ on: tab === item.id }" @click="tab = item.id">{{ item.label }}<small v-if="item.id === 'history'">{{ group.histories.length }}</small><small v-if="item.id === 'entrants'">{{ group.entrants.length }}</small></button></div>
          <div v-show="tab === 'rules'" id="ra-panel-rules" class="ra-panel" role="tabpanel" aria-labelledby="ra-tab-rules">
            <div class="ra-grid">
              <label>名次计时<select v-model="group.timing" aria-label="名次计时"><option value="gun">枪声成绩</option><option value="net">净计时</option></select></label>
              <label>本期评估奖励至第几名<select v-model.number="group.awardDepth" aria-label="本期评估奖励至第几名"><option v-for="n in 8" :key="n" :value="n">第 {{ n }} 名</option></select></label>
              <label class="ra-wide">参赛与领奖资格<textarea v-model="group.eligibility" rows="2" maxlength="500" placeholder="例如：男女总排名，不限国籍；领奖资格以当届规程为准"></textarea></label>
              <label class="ra-wide">当届奖励规则来源<input v-model="group.ruleSource" maxlength="500" placeholder="公告名称、发布日期或原文地址" /></label>
            </div>
            <div class="ra-subheading"><strong>逐名奖金</strong><span>税前人民币元；0 表示非现金，留空表示未收录</span></div>
            <div class="ra-awards"><label v-for="n in Number(group.awardDepth)" :key="n">第 {{ n }} 名<input v-model="group.awardInputs[n - 1]" type="number" min="0" max="99999999" step="1" :aria-label="'第' + n + '名税前奖金'" placeholder="未收录" /></label></div>
            <p class="ra-help">仅评估男女总排名前八。若实际只奖励前三，填第 3 名；奖励超过八名，本期只记录到第 8 名。</p>
          </div>
          <div v-show="tab === 'history'" id="ra-panel-history" class="ra-panel" role="tabpanel" aria-labelledby="ra-tab-history">
            <div class="ra-history-toolbar"><label>查看年份<select v-model.number="selectedYear" aria-label="历年前八年份"><option v-for="item in sortedHistories" :key="item.year" :value="item.year">{{ item.year }} 年 · {{ filledRows(item) }}/8 名</option></select></label><button type="button" @click="addingYear = !addingYear">＋ 添加年份</button></div>
            <div v-if="addingYear" class="ra-year-create"><label>新增年份<input v-model="newYear" type="number" min="1900" :max="lastHistoryYear" placeholder="例如 2025" aria-label="新增历史年份" /></label><button type="button" @click="addHistory">添加年份</button><button class="ra-text" type="button" @click="addingYear = false">取消</button></div>
            <div v-if="!history" class="ra-empty"><strong>历年前八入口已保留</strong><p>添加年份后填写已收录名次。无需一次填满八名，也不会根据缺项推算成绩。</p></div>
            <template v-else>
              <div class="ra-grid"><label>历史榜单计时<select v-model="history.timing" aria-label="历史榜单计时"><option value="gun">枪声成绩</option><option value="net">净计时</option></select></label><label>成绩来源<input v-model="history.source" maxlength="500" placeholder="该年度官方成绩公告或模拟数据" /></label></div>
              <p v-if="history.timing !== group.timing" class="ra-caution">历史榜单与当届奖励计时不同，前台会提示口径差异。</p>
              <div class="ra-table-wrap" tabindex="0" role="region" :aria-label="history.year + '年前八编辑表，可横向滚动'"><table class="ra-history-table"><thead><tr><th scope="col">名次</th><th scope="col">选手姓名</th><th scope="col">完赛成绩</th></tr></thead><tbody><tr v-for="row in history.rows" :key="row.place"><th scope="row"><span :class="{ 'ra-podium': row.place <= 3 }">{{ String(row.place).padStart(2, '0') }}</span></th><td><input v-model="row.name" maxlength="80" :aria-label="history.year + '年第' + row.place + '名姓名'" placeholder="姓名可空" /></td><td><input v-model="row.clock" maxlength="12" :aria-label="history.year + '年第' + row.place + '名成绩'" placeholder="2:18:30" inputmode="text" /></td></tr></tbody></table></div>
              <div class="ra-bottom-note"><span>已填 {{ filledRows(history) }}/8 名 · 空行不会保存为零成绩</span><button type="button" class="ra-text ra-danger" @click="confirmDelete = confirmDelete === 'history' ? '' : 'history'">删除 {{ history.year }} 年</button></div>
              <div v-if="confirmDelete === 'history'" class="ra-confirm"><span>删除 {{ history.year }} 年榜单？保存后生效。</span><button type="button" @click="removeHistory">确认删除该年</button><button type="button" @click="confirmDelete = ''">取消</button></div>
            </template>
          </div>
          <div v-show="tab === 'entrants'" id="ra-panel-entrants" class="ra-panel" role="tabpanel" aria-labelledby="ra-tab-entrants">
            <div class="ra-subheading"><strong>今年已知参赛线索</strong><button type="button" :disabled="group.entrants.length >= 100" @click="addEntrant">＋ 添加选手</button></div>
            <p class="ra-help">这里只维护后台录入的公开选手；请同时核对 PB 和本届参赛状态后再标为“已核验”。用户授权线索由系统匿名汇总，请避免把同一位选手重复录入。</p>
            <p v-if="!group.entrants.length" class="ra-empty">尚未录入本届选手。没有已知选手不代表竞争小。</p>
            <article v-for="(entrant, index) in group.entrants" :key="entrant.id" class="ra-entrant">
              <header><strong>选手 {{ index + 1 }}</strong><button type="button" class="ra-text ra-danger" :aria-label="'移除选手' + (index + 1)" @click="group.entrants.splice(index, 1)">移除</button></header>
              <div class="ra-grid"><label>公开姓名或代称<input v-model="entrant.name" maxlength="80" placeholder="例如：选手 A" /></label><label>同项目 PB<input v-model="entrant.clock" maxlength="12" placeholder="2:10:00" /></label><label>PB 比赛日期<input v-model="entrant.pbDate" type="date" /></label><label>本届参赛状态<select v-model="entrant.status" aria-label="本届参赛状态"><option>中签</option><option>已缴费</option><option>已领物</option><option>弃赛</option></select></label><label>证据等级<select v-model="entrant.evidence" aria-label="证据等级"><option value="self_reported">用户自报</option><option value="verified">已核验</option></select></label><label>成绩与参赛来源<input v-model="entrant.source" maxlength="500" placeholder="成绩与本届参赛状态的核验记录" /></label></div>
            </article>
          </div>
        </template>
        <footer class="ra-save"><div><strong>{{ dirty ? '有未保存的雷达修改' : '雷达资料已同步' }}</strong><span>单独保存，不随赛事顶部“保存”按钮提交。</span></div><button type="button" class="ra-primary" :disabled="!dirty || saving" @click="save">{{ saving ? '正在保存…' : '保存雷达资料' }}</button></footer>
      </fieldset>
      <p v-if="error" class="ra-error" role="alert">{{ error }}</p><p v-if="notice" class="ra-success" role="status">{{ notice }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({ raceId: { type: String, required: true }, raceDate: { type: String, default: '' }, active: { type: Boolean, default: true }, request: { type: Function, required: true } });
const distanceLabels = { full: '全马', half: '半马', '10k': '10 公里', '5k': '5 公里' };
const tabs = [{ id: 'rules', label: '当届奖励' }, { id: 'history', label: '历年前八' }, { id: 'entrants', label: '今年阵容' }];
const config = ref({ demo: false, groups: [] }), loadedId = ref(''), loading = ref(false), saving = ref(false), loadError = ref(''), error = ref(''), notice = ref(''), baseline = ref('');
const selectedId = ref(''), selectedYear = ref(0), tab = ref('history'), addingGroup = ref(false), addingYear = ref(false), confirmDelete = ref(''), newDistance = ref('full'), newGender = ref('男'), newYear = ref('');
let revision = 0, localId = 0;
const group = computed(() => config.value.groups.find(item => item.id === selectedId.value));
const sortedHistories = computed(() => [...(group.value?.histories || [])].sort((a, b) => b.year - a.year));
const history = computed(() => group.value?.histories.find(item => item.year === Number(selectedYear.value)));
const dirty = computed(() => loadedId.value === props.raceId && JSON.stringify(config.value) !== baseline.value);
const lastHistoryYear = computed(() => Number(props.raceDate.slice(0, 4) || new Date().getFullYear()) - 1);

function preventOuterSubmit(event) { if (!['TEXTAREA', 'BUTTON'].includes(event.target.tagName)) event.preventDefault(); }
function normalize(input) {
  return { demo: input?.demo === true, groups: (input?.groups || []).map(item => ({
    id: item.id, distance: item.distance, gender: item.gender, timing: item.timing || 'gun', awardDepth: item.awardDepth || 8, eligibility: item.eligibility || '', ruleSource: item.ruleSource || '',
    awardInputs: Array.from({ length: 8 }, (_, index) => item.awards?.find(award => award.place === index + 1)?.amount ?? ''),
    histories: (item.histories || []).map(edition => ({ year: Number(edition.year), source: edition.source || '', timing: edition.timing || item.timing || 'gun', rows: Array.from({ length: 8 }, (_, index) => { const found = edition.rows?.find(row => row.place === index + 1); return { place: index + 1, name: found?.name || '', clock: found?.clock || '' }; }) })),
    entrants: (item.entrants || []).map(entrant => ({ id: entrant.id, name: entrant.name || '', clock: entrant.clock || '', pbDate: entrant.pbDate || '', status: entrant.status || '中签', evidence: entrant.evidence || 'self_reported', source: entrant.source || '' }))
  })) };
}
function install(input) {
  config.value = normalize(input);
  baseline.value = JSON.stringify(config.value);
  if (!config.value.groups.some(item => item.id === selectedId.value)) selectedId.value = config.value.groups[0]?.id || '';
  settleYear();
}
function settleYear() {
  if (!group.value?.histories.some(item => item.year === Number(selectedYear.value))) selectedYear.value = sortedHistories.value[0]?.year || 0;
  const existing = new Set((group.value?.histories || []).map(item => item.year));
  let candidate = lastHistoryYear.value;
  while (candidate >= 1900 && existing.has(candidate)) candidate--;
  newYear.value = String(candidate);
}
function selectGroup(id) { selectedId.value = id; addingYear.value = false; confirmDelete.value = ''; error.value = ''; settleYear(); }
function filledRows(edition) { return edition.rows.filter(row => row.clock.trim()).length; }
function addGroup() {
  error.value = ''; notice.value = '';
  if (config.value.groups.some(item => item.distance === newDistance.value && item.gender === newGender.value)) { error.value = '这个项目的男女组已经存在，直接切换到该组编辑即可。'; return; }
  const id = newDistance.value + '-' + (newGender.value === '男' ? 'men' : 'women') + '-' + Date.now().toString(36) + '-' + (++localId);
  config.value.groups.push({ id, distance: newDistance.value, gender: newGender.value, timing: 'gun', awardDepth: 8, eligibility: '', ruleSource: config.value.demo ? '模拟数据，仅供功能演示' : '', awardInputs: Array(8).fill(''), histories: [], entrants: [] });
  selectGroup(id); addingGroup.value = false; tab.value = 'rules';
}
function removeGroup() { const index = config.value.groups.findIndex(item => item.id === selectedId.value); if (index >= 0) config.value.groups.splice(index, 1); selectedId.value = config.value.groups[0]?.id || ''; confirmDelete.value = ''; settleYear(); }
function addHistory() {
  const year = Number(newYear.value); error.value = ''; notice.value = '';
  if (!Number.isInteger(year) || year < 1900 || year > lastHistoryYear.value) { error.value = '历史年份应在 1900 到 ' + lastHistoryYear.value + ' 年之间。'; return; }
  if (group.value.histories.some(item => item.year === year)) { error.value = '这一年已经存在，请切换年份编辑。'; return; }
  if (group.value.histories.length >= 30) { error.value = '每组最多维护 30 个历史年份。'; return; }
  group.value.histories.push({ year, source: config.value.demo ? '模拟数据，仅供功能演示' : '', timing: group.value.timing, rows: Array.from({ length: 8 }, (_, index) => ({ place: index + 1, name: '', clock: '' })) });
  selectedYear.value = year; addingYear.value = false; confirmDelete.value = '';
}
function removeHistory() { const index = group.value.histories.findIndex(item => item.year === Number(selectedYear.value)); if (index >= 0) group.value.histories.splice(index, 1); confirmDelete.value = ''; settleYear(); }
function addEntrant() { group.value.entrants.push({ id: 'entrant-' + Date.now().toString(36) + '-' + (++localId), name: '', clock: '', pbDate: '', status: '中签', evidence: 'self_reported', source: config.value.demo ? '模拟数据，仅供功能演示' : '' }); notice.value = ''; }
function payload() {
  const groups = config.value.groups.map(item => {
    for (const edition of item.histories) {
      if (edition.rows.some(row => row.name.trim() && !row.clock.trim())) throw new Error(edition.year + ' 年有选手只填写了姓名，请补上成绩或清空该行。');
    }
    const awards = item.awardInputs.slice(0, Number(item.awardDepth)).flatMap((value, index) => {
      if (value === '' || value == null) return [];
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount < 0 || amount > 99999999) throw new Error('奖金应填写 0 到 99999999 的整数元。');
      return [{ place: index + 1, amount }];
    });
    return { id: item.id, distance: item.distance, gender: item.gender, timing: item.timing, awardDepth: Number(item.awardDepth), eligibility: item.eligibility.trim(), ruleSource: item.ruleSource.trim(), awards,
      histories: item.histories.map(edition => ({ year: edition.year, source: edition.source.trim(), timing: edition.timing, rows: edition.rows.filter(row => row.clock.trim()).map(row => ({ place: row.place, name: row.name.trim(), clock: row.clock.trim() })) })),
      entrants: item.entrants.map(entrant => ({ ...entrant, name: entrant.name.trim(), clock: entrant.clock.trim(), source: entrant.source.trim() })) };
  });
  return { demo: config.value.demo, groups };
}
async function load() {
  const id = props.raceId, version = ++revision;
  loading.value = true; loadError.value = ''; error.value = ''; notice.value = '';
  try {
    const result = await props.request('/admin/races/' + encodeURIComponent(id) + '/radar');
    if (version !== revision || id !== props.raceId) return;
    install(result.config); loadedId.value = id;
  } catch (err) { if (version === revision) loadError.value = err.message; }
  finally { if (version === revision) loading.value = false; }
}
async function save() {
  if (saving.value || loading.value || loadedId.value !== props.raceId) return;
  error.value = ''; notice.value = '';
  let next;
  try { next = payload(); } catch (err) { error.value = err.message; return; }
  const id = props.raceId, version = revision;
  saving.value = true;
  try {
    const result = await props.request('/admin/races/' + encodeURIComponent(id) + '/radar', { method: 'PUT', body: JSON.stringify({ config: next }) });
    if (id !== props.raceId || version !== revision) return;
    install(result.config || next); notice.value = '雷达资料已保存，前台会使用这次更新。';
  } catch (err) { if (version === revision) error.value = err.message; }
  finally { if (version === revision) saving.value = false; }
}
watch(() => props.raceId, () => { revision++; loadedId.value = ''; loading.value = false; saving.value = false; loadError.value = ''; error.value = ''; notice.value = ''; config.value = { demo: false, groups: [] }; selectedId.value = ''; addingGroup.value = false; addingYear.value = false; confirmDelete.value = ''; if (props.active && props.raceId) load(); });
watch(() => props.active, active => { if (active && props.raceId && loadedId.value !== props.raceId && !loading.value) load(); }, { immediate: true });
watch(selectedYear, () => { confirmDelete.value = ''; });
onBeforeUnmount(() => { revision++; });
</script>

<style scoped>
.radar-admin{width:100%;min-width:0;margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--line);color:var(--ink)}.radar-admin *{box-sizing:border-box}.radar-admin button,.radar-admin input,.radar-admin select,.radar-admin textarea{font:inherit}.radar-admin button{min-height:40px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:12px;cursor:pointer}.radar-admin button:disabled{opacity:.45;cursor:default}.radar-admin button:focus-visible,.radar-admin input:focus-visible,.radar-admin select:focus-visible,.radar-admin textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.ra-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ra-heading h3{margin:7px 0 8px;font-size:21px}.ra-heading p{margin:0;color:var(--muted);font-size:12px;line-height:1.8}.ra-kicker{color:var(--accent);font-size:11px;letter-spacing:.04em}.ra-demo{flex:none;padding:5px 8px;border-radius:6px;background:#fff4e3;color:#8b590d;font-size:11px}.ra-fields{display:block;min-width:0;margin:18px 0 0;padding:0;border:0}.ra-check{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--field-bg);font-size:13px}.ra-check input{width:16px;height:16px;flex:none;accent-color:var(--accent);margin:2px 0}.ra-check small{display:block;margin-top:6px;color:var(--muted);font-size:11px;line-height:1.8}.ra-group-nav{display:flex;flex-wrap:wrap;gap:7px;margin:18px 0}.ra-group-nav button.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}.ra-group-nav .ra-add{border-style:dashed;color:var(--muted)}.ra-add-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px;border:1px solid var(--line);border-radius:10px;margin-bottom:18px}.ra-actions{display:flex;gap:8px;grid-column:1/-1}.ra-group-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;font-weight:600}.radar-admin .ra-text{min-height:36px;padding:6px 0;border:0;background:transparent;color:var(--muted)}.radar-admin .ra-danger{color:var(--accent)}.ra-tabs{display:flex;gap:2px;margin-top:8px;border-bottom:1px solid var(--line)}.ra-tabs button{flex:1;min-width:0;padding:12px 3px;border:0;border-radius:0;background:transparent;color:var(--muted);font-size:12px;white-space:nowrap}.ra-tabs button.on{box-shadow:inset 0 -2px var(--accent);color:var(--accent);font-weight:600}.ra-tabs small{display:inline-block;margin-left:5px;font-size:10px;font-weight:400}.ra-panel{padding-top:18px;min-width:0}.ra-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ra-wide{grid-column:1/-1}.ra-grid label,.ra-add-group label,.ra-history-toolbar label,.ra-year-create label,.ra-awards label{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:12px}.radar-admin input:not([type=checkbox]),.radar-admin select,.radar-admin textarea{width:100%;min-width:0;min-height:40px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--field-bg);color:var(--ink);font-size:12px;line-height:1.5}.radar-admin textarea{resize:vertical}.ra-subheading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:20px 0 12px}.ra-subheading strong{font-size:13px}.ra-subheading>span{font-size:11px;color:var(--muted);line-height:1.7}.ra-awards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ra-help{margin:12px 0;color:var(--muted);font-size:11px;line-height:1.8}.ra-history-toolbar{display:flex;align-items:flex-end;gap:10px;margin-bottom:16px}.ra-history-toolbar label{flex:1}.ra-history-toolbar button{flex:none}.ra-year-create{display:flex;align-items:flex-end;gap:10px;padding:12px;background:var(--field-bg);border-radius:8px;margin-bottom:16px}.ra-year-create label{flex:1}.ra-year-create>button{flex:none}.ra-table-wrap{max-width:100%;overflow-x:auto;margin-top:16px;border:1px solid var(--line);border-radius:10px;overscroll-behavior-x:contain}.ra-history-table{width:100%;min-width:350px;border-collapse:collapse;table-layout:fixed}.ra-history-table th,.ra-history-table td{padding:8px;border-bottom:1px solid var(--line);text-align:left}.ra-history-table thead th{background:var(--field-bg);font-size:11px;color:var(--muted);font-weight:400}.ra-history-table th:first-child{width:52px;text-align:center}.ra-history-table th:last-child{width:136px}.ra-history-table tbody th{font-size:12px;font-variant-numeric:tabular-nums;font-weight:400;color:var(--muted)}.ra-history-table tr:last-child>*{border-bottom:0}.ra-history-table .ra-podium{color:var(--accent);font-weight:700}.ra-history-table input{background:#fff!important;font-variant-numeric:tabular-nums}.ra-bottom-note{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;font-size:11px;color:var(--muted)}.ra-entrant{padding:14px;border:1px solid var(--line);border-radius:10px;margin-top:12px}.ra-entrant>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:13px}.ra-entrant .ra-text{min-height:30px}.ra-empty{padding:22px 12px;text-align:center;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12px;line-height:1.8;margin:16px 0}.ra-empty strong{color:var(--ink);font-size:14px}.ra-empty p{margin-bottom:0}.ra-save{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}.ra-save strong,.ra-save span{display:block;font-size:12px}.ra-save span{margin-top:6px;font-size:11px;color:var(--muted);line-height:1.7}.radar-admin .ra-primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:500}.ra-error,.ra-success,.ra-caution{margin:14px 0 0;padding:12px;border-radius:8px;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.ra-error{color:var(--accent);background:var(--accent-soft)}.ra-error button{margin-left:10px}.ra-success{color:#246344;background:#edf7f0}.ra-caution{margin-bottom:0;color:#8b590d;background:#fff4e3}.ra-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0;padding:12px;background:var(--accent-soft);border-radius:8px;font-size:12px;line-height:1.7}.ra-confirm span{width:100%;color:var(--accent)}
@media(max-width:600px){.ra-grid{gap:12px}.ra-awards{grid-template-columns:repeat(2,minmax(0,1fr))}.ra-save>.ra-primary{width:100%}.radar-admin button,.radar-admin input:not([type=checkbox]),.radar-admin select{min-height:44px}.ra-history-toolbar{gap:7px}.ra-history-toolbar button{padding-inline:9px}.ra-year-create{flex-wrap:wrap}.ra-year-create label{flex-basis:100%}.ra-entrant{padding:12px}.ra-entrant .ra-grid{grid-template-columns:minmax(0,1fr)}.ra-tabs button{font-size:11px}.ra-tabs small{margin-left:3px}.ra-heading h3{font-size:20px}}
</style>
