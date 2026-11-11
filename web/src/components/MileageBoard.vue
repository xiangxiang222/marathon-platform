<template>
  <section class="mileage-board">
    <header class="board-heading"><div><h2>跑量看板</h2><p>每一次出发，都在这里汇成进步</p></div><button v-if="board?.staff" type="button" class="text-action" @click="openGroups">训练组管理 <span>›</span></button></header>
    <nav class="range-tabs" aria-label="跑量时间范围"><button v-for="item in ranges" :key="item.id" type="button" :class="{ on: range === item.id }" :aria-pressed="range === item.id" @click="pickRange(item.id)">{{ item.label }}</button></nav>
    <div class="period-control"><button type="button" aria-label="上一统计周期" :disabled="range === 'all' || loading" @click="shiftDate(-1)">‹</button><label><span>{{ board?.period?.label || date }}</span><input v-if="range !== 'all'" type="date" v-model="date" :max="today" aria-label="选择跑量统计日期" @change="load" /></label><button type="button" aria-label="下一统计周期" :disabled="!canAdvanceMileage(range, date, today) || loading" @click="shiftDate(1)">›</button></div>
    <nav class="group-tabs" aria-label="按常设训练组筛选"><button type="button" :class="{ on: groupId === '' }" :aria-pressed="groupId === ''" @click="pickGroup('')">全员</button><button v-for="group in board?.groups || []" :key="group.id" type="button" :class="{ on: groupId === String(group.id) }" :aria-pressed="groupId === String(group.id)" @click="pickGroup(String(group.id))">{{ group.name }}</button></nav>
    <div v-if="error" class="board-error" role="alert"><span>{{ error }}</span><button type="button" @click="load">重新加载</button></div>
    <div v-if="!board && loading" class="board-loading" role="status">正在整理跑量…</div>
    <template v-if="board">
      <section class="volume-card" :aria-busy="loading"><div class="volume-label"><span>{{ selectedGroupName }} · 跑量合计</span><span class="volume-symbol" aria-hidden="true"><RunnerIcon name="stats" /></span></div><div class="volume-number">{{ number(board.summary.km) }}<small>公里</small></div><div class="volume-metrics"><div><b>{{ board.summary.times }}</b><span>运动次数</span></div><div><b>{{ board.summary.activeMembers }}<small> / {{ board.summary.members }}</small></b><span>活跃 / 成员</span></div><div><b>{{ number(board.summary.members ? board.summary.km / board.summary.members : 0) }}</b><span>人均公里</span></div></div></section>
      <section v-if="actualGroups.length && groupId === ''" class="group-overview"><div class="panel-title"><h3>训练组概况</h3><span>{{ actualGroups.length }} 个组别</span></div><div class="group-cards"><button v-for="(group, index) in actualGroups" :key="group.id" type="button" :class="['group-card', 'tone-' + index % 3]" @click="pickGroup(String(group.id))"><span class="group-card-top"><b>{{ group.name }}</b><i>›</i></span><strong>{{ number(group.km) }}<small> km</small></strong><span>{{ group.activeMembers }} 位活跃 · {{ group.memberCount }} 位成员</span><small v-if="group.pace" class="group-pace">{{ group.pace }}</small></button></div></section>
      <section class="rank-panel"><div class="panel-title"><h3>成员排行</h3><span>{{ visibleRank.length }} 位成员</span></div><label class="rank-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="query" placeholder="搜索成员昵称" aria-label="搜索跑量排行榜成员" /><button v-if="query" type="button" aria-label="清空搜索" @click="query = ''">×</button></label><div class="rank-columns"><span>排名 / 成员</span><span>跑量 · 公里</span></div><router-link v-for="row in visibleRank" :key="row.userId" class="rank-row" :class="{ mine: row.mine }" :to="memberLink(row.userId)"><span class="rank-place" :class="{ medal: row.place <= 3 && row.km > 0 }">{{ row.place }}</span><span class="rank-avatar"><img v-if="row.avatar" :src="row.avatar" alt="" /><template v-else>{{ row.nickname.slice(0, 1) }}</template></span><span class="rank-person"><b>{{ row.nickname }}<small v-if="row.mine">我</small></b><span>{{ row.group || '未分组' }}<template v-if="row.times"> · {{ row.times }} 次</template></span></span><span class="rank-distance"><b>{{ number(row.km) }}</b><small>{{ row.paceLabel ? row.paceLabel + ' /km' : row.km ? row.days + ' 天运动' : '本期未记录' }}</small></span><i class="rank-chevron">›</i></router-link><div v-if="!visibleRank.length" class="quiet-empty">{{ query ? '没有找到这位成员，试试其他昵称。' : '这里还没有成员。' }}</div><p class="rank-footnote">按成员当前训练组汇总历史已计入本团的跑量 · 北京时间。点击成员查看介绍和跑量。</p></section>
      <details class="tools-panel" @toggle="openTools"><summary><span>近期明细、报表与规则</span><i>⌄</i></summary><template v-if="toolsOpen"><p v-if="toolsError" class="inline-error">{{ toolsError }} <button type="button" @click="loadTools">重试</button></p><template v-if="legacy"><p class="tools-note">{{ legacy.rules?.note || '只记跑步与越野；活动签到不折算公里。' }}</p><details class="nested-tool"><summary>全团近期运动明细 <span>{{ legacy.feed?.length || 0 }} 条</span></summary><article v-for="item in legacy.feed || []" :key="item.id" class="run-record"><div><b>{{ item.nickname }}</b><span>{{ item.typeLabel }} · {{ item.startedAt }}</span></div><strong>{{ number(item.volumeKm) }}<small> 公里</small></strong><p>{{ item.durationLabel }}<template v-if="item.paceLabel"> · {{ item.paceLabel }} /km</template></p><p v-if="item.challenge">质疑：{{ item.challenge }}</p><img v-if="item.shot" :src="runShotSrc(item.id)" alt="运动凭证" /><details v-if="!item.mine || legacy.staff" class="record-review"><summary>记录反馈与审核</summary><form v-if="!item.mine" class="inline-form" @submit.prevent="challenge(item)"><input v-model="reasons[item.id]" maxlength="80" placeholder="质疑原因" aria-label="质疑原因" /><button type="submit">提交质疑</button></form><div v-if="legacy.staff" class="review-actions"><button type="button" @click="decide(item, false)">不计入</button><button type="button" @click="decide(item, true)">继续计入</button></div></details></article><p v-if="!legacy.feed?.length" class="quiet-empty">这段时间没有计入的记录。</p></details><details class="nested-tool"><summary>当前周期报表与导出</summary><nav class="tool-tabs"><button v-for="item in kinds" :key="item.id" type="button" :class="{ on: kind === item.id }" @click="pickKind(item.id)">{{ item.label }}</button></nav><p v-if="report" class="tools-note">{{ report.title }} · {{ report.total?.km || 0 }} 公里 · {{ report.total?.durationLabel }}</p><div class="report-scroll"><table v-if="report"><thead><tr><th>成员</th><th>公里</th><th>天 / 次</th><th>时长</th><th>配速</th><th v-if="kind === 'month'">Flag</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.userId"><td>{{ row.nickname }}</td><td>{{ row.km }}</td><td>{{ row.dayText }}</td><td>{{ row.durationLabel }}</td><td>{{ row.paceLabel || '—' }}</td><td v-if="kind === 'month'">{{ row.flag }}</td></tr></tbody><tfoot><tr><td>合计</td><td>{{ report.total.km }}</td><td>{{ report.total.dayText }}</td><td>{{ report.total.durationLabel }}</td><td>{{ report.total.paceLabel || '—' }}</td><td v-if="kind === 'month'">—</td></tr></tfoot></table></div><label v-if="legacy.owner" class="check-line"><input v-model="includeEmpty" type="checkbox" />导出包含没有记录的成员</label><button v-if="legacy.owner" type="button" class="outline-action" @click="exportFile">导出 CSV</button></details><details v-if="legacy.rules" class="nested-tool"><summary>本团计入规则 <span>{{ legacy.owner ? '可编辑' : '只读' }}</span></summary><form class="rules-form" @submit.prevent="saveRules"><label>生效日期<input v-model="legacy.rules.effectiveOn" type="date" :disabled="!legacy.owner" /></label><label v-for="field in ruleChecks" :key="field.key" class="check-line"><input v-model="legacy.rules[field.key]" :disabled="!legacy.owner" type="checkbox" />{{ field.label }}</label><div class="rule-fields"><label v-for="field in ruleFields" :key="field.key">{{ field.label }}<input v-model="legacy.rules[field.key]" :disabled="!legacy.owner" :type="field.type || 'number'" :step="field.step || 'any'" /></label></div><button v-if="legacy.owner" type="submit" class="save-action" :disabled="busy">保存规则</button></form></details></template></template></details>
    </template>
    <p v-if="notice" class="board-notice" role="status">{{ notice }}</p>
    <Teleport to="body"><div v-if="groupsOpen" class="training-overlay" @click.self="closeGroups" @keydown.esc="closeGroups"><section class="training-sheet" role="dialog" aria-modal="true" aria-labelledby="training-group-title"><header><div><span>CLUB TRAINING</span><h2 id="training-group-title">常设训练组</h2></div><button type="button" aria-label="关闭训练组管理" @click="closeGroups">×</button></header><p class="sheet-intro">为团友设置日常训练组，统一配速与成员归属。发布团练时也可直接选用。</p><p v-if="manageError" class="inline-error" role="alert">{{ manageError }} <button type="button" @click="loadGroups">重新加载</button></p><p v-if="manageLoading" class="tools-note" role="status">正在读取训练组…</p><template v-if="management"><div class="manage-section-heading"><h3>训练组 <small>{{ management.groups.length }}</small></h3><button type="button" class="text-action" @click="editGroup()">+ 新建训练组</button></div><form v-if="groupDraft" class="group-form" @submit.prevent="saveGroup"><h3>{{ groupDraft.id ? '编辑训练组' : '新建训练组' }}</h3><label>组名<input v-model.trim="groupDraft.name" maxlength="20" required placeholder="例：A 组" /></label><label>常用配速<input v-model.trim="groupDraft.pace" maxlength="40" placeholder="例：5′00″–5′30″ /km" /></label><label>训练组介绍<textarea v-model.trim="groupDraft.description" maxlength="300" rows="2" placeholder="填写训练目标或适合的成员" /></label><div class="rule-fields"><label>人数上限<input v-model.number="groupDraft.capacity" type="number" min="0" max="500" placeholder="0 不限" /></label><label>显示顺序<input v-model.number="groupDraft.sort" type="number" min="0" max="999" /></label></div><div class="form-actions"><button type="button" class="outline-action" :disabled="busy" @click="groupDraft = null">取消</button><button type="submit" class="save-action" :disabled="busy">{{ busy ? '正在保存…' : '保存训练组' }}</button></div></form><article v-for="group in management.groups" :key="group.id" class="managed-group"><div><b>{{ group.name }}</b><span>{{ group.pace || '配速待设置' }} · {{ group.memberCount }} 人<template v-if="group.capacity"> / {{ group.capacity }} 上限</template></span><p v-if="group.description">{{ group.description }}</p></div><button type="button" :disabled="busy" @click="editGroup(group)">编辑</button><button type="button" class="delete-group" :disabled="busy" @click="removeGroup(group)">删除</button></article><p v-if="!management.groups.length && !groupDraft" class="quiet-empty">还没有常设组，新建 A / B / C 组开始安排。</p><div class="manage-section-heading"><h3>成员归组</h3><span>每人一个常设组</span></div><input v-model="manageQuery" class="manage-search" placeholder="搜索成员昵称" aria-label="搜索训练组成员" /><div v-for="person in managementMembers" :key="person.id" class="assign-row"><span>{{ person.nickname }}</span><select :value="person.groupId || 0" :aria-label="person.nickname + '的训练组'" :disabled="busy" @change="assign(person, $event.target.value)"><option value="0">未分组</option><option v-for="group in management.groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></div></template></section></div></Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { download, runShotSrc } from '../api';
import { useClubSession } from '../useClubSession';
import RunnerIcon from './RunnerIcon.vue';
import { beijingDay, validMileageDate, canAdvanceMileage, moveMileageDate } from '../club-mileage-utils';
const props = defineProps({ clubId: { type: [Number, String], required: true } });
const ranges = [{ id: 'day', label: '日' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }, { id: 'all', label: '累计' }];
const kinds = [{ id: 'week', label: '周报' }, { id: 'month', label: '月报' }, { id: 'year', label: '年报' }];
const route = useRoute();
const today = beijingDay();
const board = ref(null), loading = ref(false), error = ref(''), notice = ref('');
const range = ref(ranges.some(item => item.id === route.query.range) ? route.query.range : 'month'), date = ref(validMileageDate(route.query.date, today)), groupId = ref(''), query = ref('');
const groupsOpen = ref(false), management = ref(null), manageLoading = ref(false), manageError = ref(''), manageQuery = ref(''), groupDraft = ref(null), busy = ref(false);
const toolsOpen = ref(false), legacy = ref(null), toolsError = ref(''), report = ref(null), kind = ref('month'), includeEmpty = ref(false), reasons = ref({});
let version = 0, toolsVersion = 0, groupsVersion = 0;
function reset() { version++; toolsVersion++; groupsVersion++; board.value = null; management.value = null; legacy.value = null; report.value = null; groupsOpen.value = false; groupDraft.value = null; error.value = ''; notice.value = ''; manageError.value = ''; toolsError.value = ''; busy.value = false; loading.value = false; manageLoading.value = false; range.value = 'month'; date.value = today; groupId.value = ''; query.value = ''; manageQuery.value = ''; toolsOpen.value = false; reasons.value = {}; }
const session = useClubSession(reset, () => String(props.clubId));
const actualGroups = computed(() => (board.value?.groups || []).filter(group => Number(group.id) > 0));
const selectedGroupName = computed(() => groupId.value === '' ? '全员' : board.value?.groups?.find(g => String(g.id) === groupId.value)?.name || '训练组');
const visibleRank = computed(() => (board.value?.rank || []).filter(row => !query.value.trim() || row.nickname.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
const managementMembers = computed(() => (management.value?.members || []).filter(row => !manageQuery.value.trim() || row.nickname.includes(manageQuery.value.trim())));
const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const memberLink = uid => ({ path: '/clubs/' + props.clubId + '/members/' + uid, query: { range: range.value, date: date.value } });
async function load() { date.value = validMileageDate(date.value, today); const current = ++version; loading.value = true; error.value = ''; const queryString = new URLSearchParams({ range: range.value, date: date.value }); if (groupId.value !== '') queryString.set('groupId', groupId.value); try { const data = await session.request('/clubs/' + props.clubId + '/mileage/board?' + queryString); if (current === version) board.value = data; } catch (e) { if (!e.stale && current === version) { if (e.status === 404 && groupId.value !== '') { groupId.value = ''; notice.value = '所选训练组已不可用，已显示全员跑量'; return await load(); } board.value = null; error.value = e.message; } } finally { if (current === version) loading.value = false; } }
function pickRange(value) { if (range.value === value) return; range.value = value; void load(); if (toolsOpen.value) void loadTools(); }
function pickGroup(value) { groupId.value = value; void load(); }
function shiftDate(direction) { date.value = moveMileageDate(range.value, date.value, direction, today); void load(); }
async function openGroups() { groupsOpen.value = true; await nextTick(); document.querySelector('.training-sheet > header button')?.focus(); await loadGroups(); }
function closeGroups() { groupsOpen.value = false; groupDraft.value = null; }
async function loadGroups() { const current = ++groupsVersion; manageLoading.value = true; manageError.value = ''; try { const data = await session.request('/clubs/' + props.clubId + '/training-groups'); if (current === groupsVersion) management.value = data; } catch (e) { if (!e.stale && current === groupsVersion) manageError.value = e.message; } finally { if (current === groupsVersion) manageLoading.value = false; } }
function editGroup(group) { groupDraft.value = { id: group?.id || 0, name: group?.name || '', pace: group?.pace || '', description: group?.description || '', capacity: group?.capacity || 0, sort: group?.sort || 0 }; }
async function mutate(path, method, body, done) { if (busy.value) return; const stamp = session.capture(); busy.value = true; manageError.value = ''; notice.value = ''; try { await session.request('/clubs/' + props.clubId + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); if (!session.current(stamp)) return; done?.(); await Promise.all([loadGroups(), load()]); } catch (e) { if (!e.stale && session.current(stamp)) manageError.value = e.message; } finally { if (session.current(stamp)) busy.value = false; } }
function saveGroup() { const { id, ...data } = groupDraft.value; return mutate('/training-groups' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', data, () => { groupDraft.value = null; }); }
function removeGroup(group) { if (!window.confirm('删除“' + group.name + '”？成员将归为未分组，历史活动分组保留。')) return; return mutate('/training-groups/' + group.id, 'DELETE', null, () => { if (groupId.value === String(group.id)) groupId.value = ''; }); }
function assign(person, value) { return mutate('/training-groups/members/' + person.id, 'PUT', { groupId: Number(value) }); }
async function loadTools() { const current = ++toolsVersion; toolsError.value = ''; try { const data = await session.request('/clubs/' + props.clubId + '/mileage?range=' + (range.value === 'day' ? 'today' : range.value)); if (current === toolsVersion) legacy.value = data; await pickKind(kind.value); } catch (e) { if (!e.stale && current === toolsVersion) toolsError.value = e.message; } }
function openTools(event) { toolsOpen.value = event.target.open; if (event.target.open && !legacy.value) void loadTools(); }
async function pickKind(value) { kind.value = value; const stamp = session.capture(); try { const data = await session.request('/clubs/' + props.clubId + '/mileage/report?kind=' + value); if (session.current(stamp) && kind.value === value) report.value = data; } catch (e) { if (!e.stale && session.current(stamp)) toolsError.value = e.message; } }
async function recordAction(path, body) { const stamp = session.capture(); try { await session.request('/clubs/' + props.clubId + path, { method: 'POST', body: JSON.stringify(body) }); if (session.current(stamp)) await Promise.all([loadTools(), load()]); } catch (e) { if (!e.stale && session.current(stamp)) toolsError.value = e.message; } }
const challenge = item => recordAction('/mileage/runs/' + item.id + '/challenge', { reason: reasons.value[item.id] || '' });
const decide = (item, counted) => recordAction('/mileage/runs/' + item.id + '/decision', { counted });
const ruleChecks = [{ key: 'manualOk', label: '允许手填记录' }, { key: 'runOn', label: '跑步计入' }, { key: 'trailOn', label: '越野计入' }, { key: 'trailClimbAdd', label: '越野每 100 米爬升加 1 公里' }, { key: 'observe', label: '当月入团自动观摩' }];
const ruleFields = [{ key: 'runMin', label: '跑步最短 · km' }, { key: 'runMax', label: '跑步最长 · km' }, { key: 'paceFast', label: '最快配速', type: 'text' }, { key: 'paceSlow', label: '最慢配速', type: 'text' }, { key: 'trailMin', label: '越野最短 · km' }, { key: 'trailClimb', label: '最低爬升 · m', step: 1 }, { key: 'flagFemale', label: '女子月度下限' }, { key: 'flagMale', label: '男子月度下限' }];
async function saveRules() { const stamp = session.capture(); try { const data = await session.request('/clubs/' + props.clubId + '/mileage/rules', { method: 'PUT', body: JSON.stringify({ ...legacy.value.rules, trailClimb: Math.round(Number(legacy.value.rules.trailClimb)) }) }); if (session.current(stamp)) { legacy.value.rules = data.rules; notice.value = '跑量规则已保存'; await load(); } } catch (e) { if (!e.stale && session.current(stamp)) toolsError.value = e.message; } }
async function exportFile() { const stamp = session.capture(); try { await download('/clubs/' + props.clubId + '/mileage/export?kind=' + kind.value + (includeEmpty.value ? '&empty=1' : ''), '跑量.csv'); } catch (e) { if (session.current(stamp)) toolsError.value = e.message; } }
watch(() => props.clubId, load, { immediate: true });
watch(session.token, load);
onBeforeUnmount(() => { version++; toolsVersion++; groupsVersion++; });
</script>

<style scoped>
.mileage-board{padding:24px 16px 20px;color:var(--ink);font-size:14px}
.board-heading,.panel-title,.manage-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.board-heading h2{font-size:23px;letter-spacing:-.5px;margin:0;font-weight:650}
.board-heading p{font-size:12px;color:var(--muted);margin:7px 0 0;line-height:1.7}
.mileage-board .text-action,.training-sheet .text-action{width:auto;min-height:38px;padding:0;color:var(--accent);font-size:12px;white-space:nowrap}
.range-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;background:#fff;border-radius:11px;margin:22px 0 12px}
.mileage-board .range-tabs button{min-height:38px;border-radius:8px;font-size:14px;color:var(--muted)}
.mileage-board .range-tabs button.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.period-control{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 3px 13px}
.mileage-board .period-control>button{width:32px;min-height:36px;font-size:23px;color:var(--muted)}
button:disabled{opacity:.4}
.period-control label{position:relative;overflow:hidden;display:grid;place-items:center;flex:1;min-width:0;min-height:36px;font-size:12px;color:var(--ink-secondary);text-align:center;line-height:1.5}
.period-control input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.group-tabs{display:flex;gap:8px;overflow:auto;padding:0 0 13px;scrollbar-width:thin}
.mileage-board .group-tabs button{flex:none;min-height:34px;padding:0 13px;border:1px solid #e9e9ed;border-radius:8px;background:#fff;color:var(--muted);font-size:12px}
.mileage-board .group-tabs button.on{color:var(--ink);border-color:#adb5ba;background:#f6f9fa;font-weight:550}
.volume-card{background:linear-gradient(125deg,#f0f8f5,#fff 78%);border-radius:18px;padding:20px 21px;margin:0 0 23px;overflow:hidden}
.volume-label{display:flex;align-items:center;justify-content:space-between;color:#678278;font-size:12px}
.volume-symbol{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;color:#7fa697;background:#e4f1eb}
.volume-symbol svg{width:18px;height:18px}
.volume-number{font-size:49px;font-weight:650;letter-spacing:-1.8px;font-variant-numeric:tabular-nums;line-height:1.25;margin:10px 0 21px;overflow-wrap:anywhere}
.volume-number>small{font-size:12px;font-weight:400;color:var(--muted);letter-spacing:0;margin-left:9px}
.volume-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding-top:17px;border-top:1px solid #e4ece7}
.volume-metrics>div{display:grid;gap:6px}
.volume-metrics b{font-size:18px;font-weight:550;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.volume-metrics b small{font-size:12px;font-weight:400;color:var(--muted)}
.volume-metrics span{color:var(--muted);font-size:11px}
.panel-title h3,.manage-section-heading h3{font-size:16px;font-weight:600;margin:0}
.panel-title>span,.manage-section-heading>span{font-size:11px;color:var(--muted)}
.group-overview{margin-bottom:23px}
.group-cards{display:flex;gap:10px;overflow:auto;margin:12px -1px 0;padding-bottom:5px;scrollbar-width:thin}
.mileage-board .group-card{flex:0 0 150px;display:flex;align-items:stretch;justify-content:flex-start;flex-direction:column;gap:7px;min-width:0;padding:14px;border-radius:13px;background:#fff;text-align:left}
.group-card-top{display:flex;justify-content:space-between;align-items:center;gap:5px}
.group-card-top b{font-size:13px;font-weight:550;overflow-wrap:anywhere}
.group-card-top i{font-size:17px;font-style:normal;color:#a0a0aa}
.group-card strong{font-size:23px;letter-spacing:-.5px;font-weight:600;margin:3px 0 0}
.group-card strong small{font-size:11px;color:var(--muted);font-weight:400;letter-spacing:0}
.group-card>span:not(.group-card-top),.group-pace{font-size:11px;color:var(--muted);line-height:1.6;overflow-wrap:anywhere}
.group-card.tone-0 .group-card-top b{color:#3b8b70}
.group-card.tone-1 .group-card-top b{color:#4e7ba4}
.group-card.tone-2 .group-card-top b{color:#9a7942}
.rank-panel{padding:18px 16px 12px;border-radius:17px;background:#fff}
.rank-search{display:flex;align-items:center;gap:8px;margin:16px 0 4px;padding:0 10px;background:#f6f7f9;border-radius:9px}
.rank-search svg{width:16px;height:16px;flex:none;color:#9b9da4}
.rank-search input{width:100%;min-width:0;height:38px;background:transparent;border:0;padding:0;color:var(--ink);font-size:12px;outline:none}
.mileage-board .rank-search button{min-height:32px;width:20px;font-size:19px;color:var(--muted)}
.rank-columns{display:flex;justify-content:space-between;font-size:11px;color:#97979e;padding:15px 0 8px}
.rank-row{display:flex;align-items:center;gap:9px;min-height:76px;border-top:1px solid #f1f1f4;color:var(--ink)}
.rank-place{flex:none;width:19px;font-size:13px;font-weight:500;color:#9999a1;font-variant-numeric:tabular-nums}
.rank-place.medal{color:#bf8a3c;font-weight:650}
.rank-avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;overflow:hidden;border-radius:12px;background:#f0f3f7;color:#8895a5;font-size:13px}
.rank-avatar img{width:100%;height:100%;object-fit:cover}
.rank-person{display:grid;flex:1;min-width:0;gap:7px}
.rank-person>b{display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:13px;font-weight:550;overflow-wrap:anywhere;line-height:1.5}
.rank-person>b small{font-size:11px;font-weight:400;background:var(--accent-soft);color:var(--accent);border-radius:4px;padding:1px 4px}
.rank-person>span{font-size:11px;color:var(--muted);line-height:1.5;overflow-wrap:anywhere}
.rank-distance{display:grid;gap:6px;text-align:right;flex:none;max-width:36%}
.rank-distance>b{font-size:21px;line-height:1.2;font-weight:600;letter-spacing:-.5px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.rank-distance>small{font-size:11px;color:var(--muted)}
.rank-chevron{color:#c3c3ca;font-size:16px;font-style:normal}
.rank-row.mine .rank-person>b{color:var(--accent)}
.rank-footnote{margin:12px 0 0;padding-top:13px;border-top:1px solid #f1f1f4;color:#92929a;font-size:11px;line-height:1.8}
.quiet-empty{text-align:center;padding:25px 0;color:var(--muted);font-size:12px;line-height:1.8}
.board-error,.board-notice{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:13px;margin:0 0 12px;background:#fff2f0;color:var(--accent);border-radius:10px;font-size:12px;line-height:1.8}
.board-error button{flex:none;color:var(--accent);font-size:12px}
.board-loading{padding:60px 0;text-align:center;color:var(--muted);font-size:13px}
.board-notice{margin-top:12px}
.tools-panel{margin-top:14px;padding:0 16px;background:#fff;border-radius:15px}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.tools-panel>summary,.nested-tool>summary{display:flex;justify-content:space-between;align-items:center;min-height:57px;gap:8px;font-size:13px}
.tools-panel>summary i{font-style:normal;color:#aaa}
.tools-note{font-size:12px;color:var(--muted);line-height:1.8}
.nested-tool{border-top:1px solid var(--line)}
.nested-tool summary span{color:var(--muted);font-size:11px}
.run-record{position:relative;border-top:1px solid var(--line);padding:13px 0;font-size:12px}
.run-record>div{display:grid;gap:5px}
.run-record>div span,.run-record>p{color:var(--muted);font-size:11px;line-height:1.8}
.run-record>strong{display:block;margin-top:10px;font-size:18px}
.run-record>strong small{font-size:11px;font-weight:400}
.run-record>img{max-width:100%;max-height:220px;border-radius:9px}
.record-review summary{color:var(--muted);font-size:11px;min-height:35px}
.inline-form{display:flex;gap:7px}
.inline-form input{flex:1;min-width:0}
.review-actions{display:flex;gap:10px}
.review-actions button{font-size:11px;color:var(--accent)}
.tool-tabs{display:flex;gap:8px}
.tool-tabs button{flex:1;padding:9px;border-radius:7px;background:#f7f7f9;color:var(--muted);font-size:12px}
.tool-tabs button.on{color:var(--accent);background:var(--accent-soft)}
.report-scroll{overflow:auto}
table{width:100%;border-collapse:collapse;text-align:left;font-size:11px;white-space:nowrap}
th{font-weight:400;color:var(--muted)}
td,th{padding:12px 9px;border-bottom:1px solid var(--line)}
.rules-form{padding:5px 0 16px;display:grid;gap:12px}
.rules-form label,.group-form label{display:grid;gap:7px;color:var(--muted);font-size:12px}
.rule-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.check-line{display:flex!important;align-items:center;gap:8px!important;font-size:12px;color:var(--muted);line-height:1.7;margin:12px 0}
.check-line input{width:15px;height:15px;accent-color:var(--accent)}
.rules-form input:not([type=checkbox]),.inline-form input,.group-form input,.group-form textarea,.assign-row select,.manage-search{width:100%;min-width:0;box-sizing:border-box;min-height:42px;padding:10px 11px;border:1px solid var(--line);border-radius:8px;background:#fafafb;font:inherit;color:var(--ink);font-size:13px}
.rules-form input:disabled{opacity:.65}
.mileage-board .save-action,.training-sheet .save-action{min-height:42px;padding:0 16px;width:auto;background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:9px;font-size:12px}
.mileage-board .outline-action,.training-sheet .outline-action{min-height:42px;padding:0 14px;width:auto;color:var(--muted);border:1px solid var(--line);border-radius:9px;font-size:12px;background:#fff}
.outline-action{margin-bottom:12px}
.inline-error{font-size:12px;color:var(--accent);line-height:1.8}
.inline-error button{color:var(--accent);text-decoration:underline;font-size:12px}
.training-overlay{position:fixed;z-index:80;inset:0;display:flex;justify-content:flex-end;background:#25293655;backdrop-filter:blur(3px)}
.training-sheet{box-sizing:border-box;width:min(480px,100%);height:100dvh;overflow:auto;padding:25px 23px 40px;background:#fff;color:var(--ink);font-family:inherit}
.training-sheet>header{display:flex;align-items:center;justify-content:space-between;gap:14px}
.training-sheet>header span{color:#9b9da5;font-size:11px;letter-spacing:1.7px}
.training-sheet h2{font-size:23px;margin:8px 0 0;letter-spacing:-.5px}
.training-sheet>header button{width:35px;min-height:40px;color:var(--muted);font-size:27px}
.sheet-intro{font-size:12px;color:var(--muted);line-height:1.9;margin:18px 0 20px}
.manage-section-heading{border-top:1px solid var(--line);padding-top:20px;margin:20px 0 14px}
.manage-section-heading h3 small{color:var(--muted);font-size:12px;margin-left:5px;font-weight:400}
.group-form{display:grid;gap:13px;padding:16px;border:1px solid #f1ded9;border-radius:12px;background:#fffaf8;margin-bottom:15px}
.group-form h3{font-size:15px;margin:0}
.group-form textarea{resize:vertical}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.form-actions button{margin:0}
.managed-group{display:flex;align-items:center;gap:10px;padding:17px 0;border-top:1px solid var(--line)}
.managed-group>div{flex:1;min-width:0}
.managed-group b{font-size:14px;font-weight:550;overflow-wrap:anywhere}
.managed-group span{display:block;color:var(--muted);font-size:11px;margin-top:6px;line-height:1.7}
.managed-group p{color:var(--muted);font-size:11px;line-height:1.8;margin:6px 0 0;overflow-wrap:anywhere}
.managed-group>button{flex:none;width:auto;min-height:36px;font-size:11px;color:var(--muted)}
.managed-group>button.delete-group{color:#bb6057}
.assign-row{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid var(--line)}
.assign-row>span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px}
.assign-row select{width:125px;flex:none;font-size:12px}
.manage-search{margin-bottom:7px}
@media(max-width:350px){.mileage-board{padding:21px 12px}
.board-heading h2{font-size:21px}
.board-heading p{font-size:11px}
.mileage-board .text-action{font-size:11px}
.volume-card{padding:18px}
.volume-number{font-size:44px}
.volume-metrics{gap:5px}
.volume-metrics b{font-size:17px}
.volume-metrics span{font-size:11px}
.rank-panel{padding:17px 12px 12px}
.rank-row{gap:6px}
.rank-place{width:15px}
.rank-avatar{width:29px;height:29px;border-radius:10px}
.rank-person>b{font-size:12px}
.rank-distance>b{font-size:19px}
.rank-chevron{display:none}
.training-sheet{padding:22px 17px 35px}
}

</style>
