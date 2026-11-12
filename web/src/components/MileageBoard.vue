<template>
  <section class="mileage-board">
    <header class="board-heading"><div><h2>跑量看板</h2><p>每一程，都有迹可循</p></div><button v-if="board?.staff" type="button" class="text-action" @click="openGroups">训练组管理 <span>›</span></button></header>
    <nav class="range-tabs" aria-label="跑量时间范围"><button v-for="item in ranges" :key="item.id" type="button" :class="{ on: range === item.id }" :aria-pressed="range === item.id" @click="pickRange(item.id)">{{ item.label }}</button></nav>
    <div class="period-control"><button type="button" aria-label="上一统计周期" :disabled="range === 'all' || loading" @click="shiftDate(-1)">‹</button><label><span>{{ board?.period?.label || date }}</span><input v-if="range !== 'all'" type="date" v-model="date" :max="today" aria-label="选择跑量统计日期" @change="loadPeriod" /></label><button type="button" aria-label="下一统计周期" :disabled="!canAdvanceMileage(range, date, today) || loading" @click="shiftDate(1)">›</button></div>

    <div v-if="error" class="board-error" role="alert"><span>{{ error }}</span><button type="button" @click="load">重新加载</button></div>
    <div v-if="!board && loading" class="board-loading" role="status">正在整理跑量…</div>
    <template v-if="board">
      <section class="volume-card" :aria-busy="loading"><div class="volume-label"><span>{{ selectedGroupName }} · 跑量合计</span><span class="volume-symbol" aria-hidden="true"><RunnerIcon name="stats" /></span></div><div class="volume-number" :class="{ 'is-long': number(board.summary.km).length > 9 }"><span>{{ number(board.summary.km) }}</span><small>公里</small></div><div class="volume-metrics"><div><b>{{ compact(board.summary.times) }}</b><span>运动次数</span></div><div><b>{{ compact(board.summary.activeMembers) }}<small> / {{ compact(board.summary.members) }}</small></b><span>活跃 / 成员</span></div><div><b>{{ compact(board.summary.members ? board.summary.km / board.summary.members : 0) }}</b><span>人均公里</span></div></div></section>
      <section v-if="actualGroups.length" class="group-overview"><div class="panel-title"><div><h3>训练组跑量</h3><p>和同频的伙伴，一起积累</p></div><span>{{ actualGroups.length }} 组</span></div><div class="group-cards"><button v-for="group in shownGroups" :key="group.id" type="button" class="group-card" :class="{ selected: groupId === String(group.id) }" :aria-pressed="groupId === String(group.id)" @click="pickGroup(String(group.id))"><span class="group-card-top"><b>{{ group.name }}</b><i>↗</i></span><span class="group-card-pace">{{ group.pace || '按个人节奏' }}</span><strong :class="{ 'is-long': number(group.km).length > 8 }"><span>{{ number(group.km) }}</span><small> km</small></strong><span>{{ group.activeMembers }} 位活跃 · {{ group.memberCount }} 位成员</span></button></div><button v-if="actualGroups.length > 4" type="button" class="groups-toggle" :aria-expanded="groupsExpanded" @click="groupsExpanded = !groupsExpanded">{{ groupsExpanded ? '收起组别' : '查看全部 ' + actualGroups.length + ' 个组别' }}<span>{{ groupsExpanded ? '⌃' : '⌄' }}</span></button></section>
      <section class="rank-panel"><div class="panel-title"><h3>成员排行</h3><span>{{ visibleRank.length }} 位成员</span></div><nav class="group-tabs" aria-label="按常设训练组筛选"><label><span>查看组别</span><select :value="groupId" aria-label="选择排行榜训练组" @change="pickGroup($event.target.value)"><option value="">全员</option><option v-for="group in actualGroups" :key="group.id" :value="String(group.id)">{{ group.name }}</option><option value="0">未分组</option></select></label></nav><label class="rank-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="query" placeholder="搜索成员昵称" aria-label="搜索跑量排行榜成员" /><button v-if="query" type="button" aria-label="清空搜索" @click="query = ''">×</button></label><div v-if="mine" class="mine-summary"><div><span>我的本期</span><small>{{ mine.km > 0 ? '第 ' + mine.place + ' 名' : '等待出发' }}</small></div><b>{{ number(mine.km) }}<small> km</small></b></div><div class="rank-columns"><span>排名 / 成员</span><span>跑量 · 公里</span></div><router-link v-for="row in visibleRank" :key="row.userId" class="rank-row" :class="{ mine: row.mine }" :to="memberLink(row.userId)"><span class="rank-place" :class="{ medal: row.place <= 3 && row.km > 0 }">{{ row.place }}</span><span class="rank-avatar"><img v-if="row.avatar" :src="row.avatar" alt="" /><template v-else>{{ String(row.nickname || '跑').slice(0, 1) }}</template></span><span class="rank-person"><b>{{ row.nickname }}<small v-if="row.mine">我</small></b><span>{{ row.group || '未分组' }}<template v-if="row.times"> · {{ row.times }} 次</template></span></span><span class="rank-distance"><b>{{ number(row.km) }}</b><small>{{ row.paceLabel ? row.paceLabel + ' /km' : row.km ? row.days + ' 天运动' : '本期未记录' }}</small></span><i class="rank-chevron">›</i></router-link><div v-if="!visibleRank.length" class="quiet-empty">{{ query ? '没有找到这位成员，试试其他昵称。' : '这里还没有成员。' }}</div><p class="rank-footnote">按成员当前训练组汇总历史已计入本团的跑量 · 北京时间。点击成员查看介绍和跑量。</p></section>
      <details class="tools-panel" :open="toolsOpen" @toggle="openTools"><summary><span>近期明细、报表与规则</span><i>⌄</i></summary><template v-if="toolsOpen"><p v-if="toolsError" class="inline-error">{{ toolsError }} <button type="button" @click="loadTools">重试</button></p><template v-if="legacy"><p class="tools-note">{{ legacy.rules?.note || '只记跑步与越野；活动签到不折算公里。' }}</p><details class="nested-tool"><summary>全团近期运动明细 <span>{{ legacy.feed?.length || 0 }} 条</span></summary><article v-for="item in legacy.feed || []" :key="item.id" class="run-record"><div><b>{{ item.nickname }}</b><span>{{ item.typeLabel }} · {{ item.startedAt }}</span></div><strong>{{ number(item.volumeKm) }}<small> 公里</small></strong><p>{{ item.durationLabel }}<template v-if="item.paceLabel"> · {{ item.paceLabel }} /km</template></p><p v-if="item.challenge">质疑：{{ item.challenge }}</p><img v-if="item.shot" :src="runShotSrc(item.id)" alt="运动凭证" /><details v-if="!item.mine || legacy.staff" class="record-review"><summary>记录反馈与审核</summary><form v-if="!item.mine" class="inline-form" @submit.prevent="challenge(item)"><input v-model="reasons[item.id]" maxlength="80" placeholder="质疑原因" aria-label="质疑原因" /><button type="submit">提交质疑</button></form><div v-if="legacy.staff" class="review-actions"><button type="button" @click="decide(item, false)">不计入</button><button type="button" @click="decide(item, true)">继续计入</button></div></details></article><p v-if="!legacy.feed?.length" class="quiet-empty">这段时间没有计入的记录。</p></details><details class="nested-tool" :open="route.query.tools === '1'"><summary>当前周期报表与导出</summary><nav class="tool-tabs"><button v-for="item in kinds" :key="item.id" type="button" :class="{ on: kind === item.id }" @click="pickKind(item.id)">{{ item.label }}</button></nav><p v-if="report" class="tools-note">{{ report.title }} · {{ report.total?.km || 0 }} 公里 · {{ report.total?.durationLabel }}</p><div class="report-scroll"><table v-if="report"><thead><tr><th>成员</th><th>公里</th><th>天 / 次</th><th>时长</th><th>配速</th><th v-if="kind === 'month'">Flag</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.userId"><td><router-link :to="reportMemberLink(row.userId)" class="report-member-link">{{ row.nickname }} <span>›</span></router-link></td><td>{{ row.km }}</td><td>{{ row.dayText }}</td><td>{{ row.durationLabel }}</td><td>{{ row.paceLabel || '—' }}</td><td v-if="kind === 'month'">{{ row.flag }}</td></tr></tbody><tfoot><tr><td>合计</td><td>{{ report.total.km }}</td><td>{{ report.total.dayText }}</td><td>{{ report.total.durationLabel }}</td><td>{{ report.total.paceLabel || '—' }}</td><td v-if="kind === 'month'">—</td></tr></tfoot></table></div><label v-if="legacy.owner" class="check-line"><input v-model="includeEmpty" type="checkbox" />导出包含没有记录的成员</label><button v-if="legacy.owner" type="button" class="outline-action" @click="exportFile">导出 CSV</button></details><details v-if="legacy.rules" class="nested-tool"><summary>本团计入规则 <span>{{ legacy.owner ? '可编辑' : '只读' }}</span></summary><form class="rules-form" @submit.prevent="saveRules"><label>生效日期<input v-model="legacy.rules.effectiveOn" type="date" :disabled="!legacy.owner" /></label><label v-for="field in ruleChecks" :key="field.key" class="check-line"><input v-model="legacy.rules[field.key]" :disabled="!legacy.owner" type="checkbox" />{{ field.label }}</label><div class="rule-fields"><label v-for="field in ruleFields" :key="field.key">{{ field.label }}<input v-model="legacy.rules[field.key]" :disabled="!legacy.owner" :type="field.type || 'number'" :step="field.step || 'any'" /></label></div><button v-if="legacy.owner" type="submit" class="save-action" :disabled="busy">保存规则</button></form></details></template></template></details>
    </template>
    <p v-if="notice" class="board-notice" role="status">{{ notice }}</p>
    <Teleport to="body"><div v-if="groupsOpen" class="training-overlay" @click.self="closeGroups" @keydown.esc="closeGroups"><section class="training-sheet" role="dialog" aria-modal="true" aria-labelledby="training-group-title"><header><div><h2 id="training-group-title">常设训练组</h2></div><button type="button" aria-label="关闭训练组管理" @click="closeGroups">×</button></header><p class="sheet-intro">为团友设置日常训练组，统一配速与成员归属。发布团练时也可直接选用。</p><p v-if="manageError" class="inline-error" role="alert">{{ manageError }} <button type="button" @click="loadGroups">重新加载</button></p><p v-if="manageLoading" class="tools-note" role="status">正在读取训练组…</p><template v-if="management"><div class="manage-section-heading"><h3>训练组 <small>{{ management.groups.length }}</small></h3><button type="button" class="text-action" @click="editGroup()">+ 新建训练组</button></div><form v-if="groupDraft" class="group-form" @submit.prevent="saveGroup"><h3>{{ groupDraft.id ? '编辑训练组' : '新建训练组' }}</h3><label>组名<input v-model.trim="groupDraft.name" maxlength="20" required placeholder="例：A 组" /></label><label>常用配速<input v-model.trim="groupDraft.pace" maxlength="40" placeholder="例：5′00″–5′30″ /km" /></label><label>训练组介绍<textarea v-model.trim="groupDraft.description" maxlength="300" rows="2" placeholder="填写训练目标或适合的成员" /></label><div class="rule-fields"><label>人数上限<input v-model.number="groupDraft.capacity" type="number" min="0" max="500" placeholder="0 不限" /></label><label>显示顺序<input v-model.number="groupDraft.sort" type="number" min="0" max="999" /></label></div><div class="form-actions"><button type="button" class="outline-action" :disabled="busy" @click="groupDraft = null">取消</button><button type="submit" class="save-action" :disabled="busy">{{ busy ? '正在保存…' : '保存训练组' }}</button></div></form><article v-for="group in management.groups" :key="group.id" class="managed-group"><div><b>{{ group.name }}</b><span>{{ group.pace || '配速待设置' }} · {{ group.memberCount }} 人<template v-if="group.capacity"> / {{ group.capacity }} 上限</template></span><p v-if="group.description">{{ group.description }}</p></div><button type="button" :disabled="busy" @click="editGroup(group)">编辑</button><button type="button" class="delete-group" :disabled="busy" @click="removeGroup(group)">删除</button></article><p v-if="!management.groups.length && !groupDraft" class="quiet-empty">还没有常设组，新建 A / B / C 组开始安排。</p><div class="manage-section-heading"><h3>成员归组</h3><span>每人一个常设组</span></div><input v-model="manageQuery" class="manage-search" placeholder="搜索成员昵称" aria-label="搜索训练组成员" /><div v-for="person in managementMembers" :key="person.id" class="assign-row"><router-link :to="memberLink(person.id)" class="manage-member-link">{{ person.nickname }}</router-link><select :value="person.groupId || 0" :aria-label="person.nickname + '的训练组'" :disabled="busy" @change="assign(person, $event.target.value)"><option value="0">未分组</option><option v-for="group in management.groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></div></template></section></div></Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { download, runShotSrc } from '../api';
import { useClubSession } from '../useClubSession';
import RunnerIcon from './RunnerIcon.vue';
import { memberProfileLink } from '../member-profile-navigation';
import { beijingDay, validMileageDate, canAdvanceMileage, moveMileageDate } from '../club-mileage-utils';
const props = defineProps({ clubId: { type: [Number, String], required: true } });
const ranges = [{ id: 'day', label: '日' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }, { id: 'all', label: '累计' }];
const kinds = [{ id: 'week', label: '周报' }, { id: 'month', label: '月报' }, { id: 'year', label: '年报' }];
const route = useRoute();
const today = beijingDay();
const board = ref(null), loading = ref(false), error = ref(''), notice = ref('');
const range = ref(ranges.some(item => item.id === route.query.range) ? route.query.range : 'month'), date = ref(validMileageDate(route.query.date, today)), groupId = ref(/^\d+$/.test(route.query.groupId || '') ? route.query.groupId : ''), query = ref(typeof route.query.q === 'string' ? route.query.q : '');
const groupsOpen = ref(false), management = ref(null), manageLoading = ref(false), manageError = ref(''), manageQuery = ref(''), groupDraft = ref(null), busy = ref(false);
const toolsOpen = ref(route.query.tools === '1'), legacy = ref(null), toolsError = ref(''), report = ref(null), kind = ref(kinds.some(item => item.id === route.query.report) ? route.query.report : 'month'), includeEmpty = ref(false), reasons = ref({});
let version = 0, toolsVersion = 0, groupsVersion = 0, reportVersion = 0;
function reset() { version++; toolsVersion++; groupsVersion++; reportVersion++; board.value = null; management.value = null; legacy.value = null; report.value = null; groupsOpen.value = false; groupDraft.value = null; error.value = ''; notice.value = ''; manageError.value = ''; toolsError.value = ''; busy.value = false; loading.value = false; manageLoading.value = false; range.value = 'month'; date.value = today; groupId.value = ''; query.value = ''; groupsExpanded.value = false; manageQuery.value = ''; toolsOpen.value = false; reasons.value = {}; }
const session = useClubSession(reset, () => String(props.clubId));
const groupsExpanded = ref(false);
const shownGroups = computed(() => groupsExpanded.value ? actualGroups.value : actualGroups.value.slice(0, 4));
const mine = computed(() => (board.value?.rank || []).find(row => row.mine));
const actualGroups = computed(() => (board.value?.groups || []).filter(group => Number(group.id) > 0));
const selectedGroupName = computed(() => groupId.value === '' ? '全员' : groupId.value === '0' ? '未分组' : board.value?.groups?.find(g => String(g.id) === groupId.value)?.name || '训练组');
const visibleRank = computed(() => (board.value?.rank || []).filter(row => !query.value.trim() || row.nickname.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
const managementMembers = computed(() => (management.value?.members || []).filter(row => !manageQuery.value.trim() || row.nickname.includes(manageQuery.value.trim())));
const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const compact = value => Number(value) >= 100000000 ? number(Number(value) / 100000000) + '亿' : Number(value) >= 10000 ? number(Math.round(Number(value) / 1000) / 10) + '万' : number(value);
function returnContext(reportView = false) {
  const queryParams = new URLSearchParams({ tab: 'km', range: range.value, date: date.value });
  if (groupId.value !== '') queryParams.set('groupId', groupId.value);
  if (query.value) queryParams.set('q', query.value);
  if (reportView) { queryParams.set('tools', '1'); queryParams.set('report', kind.value); }
  return '/clubs/' + props.clubId + '?' + queryParams;
}
const memberLink = uid => memberProfileLink(props.clubId, uid, { tab: 'mileage', range: range.value, date: date.value, returnTo: returnContext() });
const reportMemberLink = uid => memberProfileLink(props.clubId, uid, { tab: 'mileage', range: kind.value, date: date.value, returnTo: returnContext(true) });
async function load() { date.value = validMileageDate(date.value, today); const current = ++version; loading.value = true; error.value = ''; const queryString = new URLSearchParams({ range: range.value, date: date.value }); if (groupId.value !== '') queryString.set('groupId', groupId.value); try { const data = await session.request('/clubs/' + props.clubId + '/mileage/board?' + queryString); if (current === version) board.value = data; } catch (e) { if (!e.stale && current === version) { if (e.status === 404 && groupId.value !== '') { groupId.value = ''; notice.value = '所选训练组已不可用，已显示全员跑量'; return await load(); } board.value = null; error.value = e.message; } } finally { if (current === version) loading.value = false; } }
function pickRange(value) { if (range.value === value) return; range.value = value; void load(); if (toolsOpen.value) void loadTools(); }
function pickGroup(value) { groupId.value = value; void load(); }
function loadPeriod() { date.value = validMileageDate(date.value, today); void load(); if (toolsOpen.value) void pickKind(kind.value); }
function shiftDate(direction) { date.value = moveMileageDate(range.value, date.value, direction, today); loadPeriod(); }
async function openGroups() { groupsOpen.value = true; await nextTick(); document.querySelector('.training-sheet > header button')?.focus(); await loadGroups(); }
function closeGroups() { groupsOpen.value = false; groupDraft.value = null; }
async function loadGroups() { const current = ++groupsVersion; manageLoading.value = true; manageError.value = ''; try { const data = await session.request('/clubs/' + props.clubId + '/training-groups'); if (current === groupsVersion) management.value = data; } catch (e) { if (!e.stale && current === groupsVersion) manageError.value = e.message; } finally { if (current === groupsVersion) manageLoading.value = false; } }
function editGroup(group) { groupDraft.value = { id: group?.id || 0, name: group?.name || '', pace: group?.pace || '', description: group?.description || '', capacity: group?.capacity || 0, sort: group?.sort || 0 }; }
async function mutate(path, method, body, done) { if (busy.value) return; const stamp = session.capture(); busy.value = true; manageError.value = ''; notice.value = ''; try { await session.request('/clubs/' + props.clubId + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); if (!session.current(stamp)) return; done?.(); await Promise.all([loadGroups(), load()]); } catch (e) { if (!e.stale && session.current(stamp)) manageError.value = e.message; } finally { if (session.current(stamp)) busy.value = false; } }
function saveGroup() { const { id, ...data } = groupDraft.value; return mutate('/training-groups' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', data, () => { groupDraft.value = null; }); }
function removeGroup(group) { if (!window.confirm('删除“' + group.name + '”？成员将归为未分组，历史活动分组保留。')) return; return mutate('/training-groups/' + group.id, 'DELETE', null, () => { if (groupId.value === String(group.id)) groupId.value = ''; }); }
function assign(person, value) { return mutate('/training-groups/members/' + person.id, 'PUT', { groupId: Number(value) }); }
async function loadTools() { const current = ++toolsVersion; toolsError.value = ''; try { const data = await session.request('/clubs/' + props.clubId + '/mileage?range=' + (range.value === 'day' ? 'today' : range.value)); if (current !== toolsVersion) return; legacy.value = data; await pickKind(kind.value); } catch (e) { if (!e.stale && current === toolsVersion) toolsError.value = e.message; } }
function openTools(event) { toolsOpen.value = event.target.open; if (event.target.open && !legacy.value) void loadTools(); }
async function pickKind(value) { const current = ++reportVersion; kind.value = value; const stamp = session.capture(); report.value = null; toolsError.value = ''; try { const data = await session.request('/clubs/' + props.clubId + '/mileage/report?' + new URLSearchParams({ kind: value, date: date.value })); if (current === reportVersion && session.current(stamp) && kind.value === value) report.value = data; } catch (e) { if (!e.stale && current === reportVersion && session.current(stamp)) toolsError.value = e.message; } }
async function recordAction(path, body) { const stamp = session.capture(); try { await session.request('/clubs/' + props.clubId + path, { method: 'POST', body: JSON.stringify(body) }); if (session.current(stamp)) await Promise.all([loadTools(), load()]); } catch (e) { if (!e.stale && session.current(stamp)) toolsError.value = e.message; } }
const challenge = item => recordAction('/mileage/runs/' + item.id + '/challenge', { reason: reasons.value[item.id] || '' });
const decide = (item, counted) => recordAction('/mileage/runs/' + item.id + '/decision', { counted });
const ruleChecks = [{ key: 'manualOk', label: '允许手填记录' }, { key: 'runOn', label: '跑步计入' }, { key: 'trailOn', label: '越野计入' }, { key: 'trailClimbAdd', label: '越野每 100 米爬升加 1 公里' }, { key: 'observe', label: '当月入团自动观摩' }];
const ruleFields = [{ key: 'runMin', label: '跑步最短 · km' }, { key: 'runMax', label: '跑步最长 · km' }, { key: 'paceFast', label: '最快配速', type: 'text' }, { key: 'paceSlow', label: '最慢配速', type: 'text' }, { key: 'trailMin', label: '越野最短 · km' }, { key: 'trailClimb', label: '最低爬升 · m', step: 1 }, { key: 'flagFemale', label: '女子月度下限' }, { key: 'flagMale', label: '男子月度下限' }];
async function saveRules() { const stamp = session.capture(); try { const data = await session.request('/clubs/' + props.clubId + '/mileage/rules', { method: 'PUT', body: JSON.stringify({ ...legacy.value.rules, trailClimb: Math.round(Number(legacy.value.rules.trailClimb)) }) }); if (session.current(stamp)) { legacy.value.rules = data.rules; notice.value = '跑量规则已保存'; await load(); } } catch (e) { if (!e.stale && session.current(stamp)) toolsError.value = e.message; } }
async function exportFile() { const stamp = session.capture(); try { await download('/clubs/' + props.clubId + '/mileage/export?' + new URLSearchParams({ kind: kind.value, date: date.value, ...(includeEmpty.value ? { empty: '1' } : {}) }), '跑量.csv'); } catch (e) { if (session.current(stamp)) toolsError.value = e.message; } }
watch(() => props.clubId, () => { void load(); if (toolsOpen.value) void loadTools(); }, { immediate: true });
watch(session.token, load);
onBeforeUnmount(() => { version++; toolsVersion++; groupsVersion++; reportVersion++; });
</script>

<style scoped>
.mileage-board,.training-sheet{--ink:#24302e;--muted:#687672;--ink-secondary:#687672;--line:#eeede8;--card:#fff;--field-bg:#f6f5f2;--accent:#d63150;--accent-soft:#fcebee;--sage:#3e7669;--sage-soft:#edf4ef;color:var(--ink);font-size:14px;line-height:1.5}
.mileage-board{padding:16px;background:var(--field-bg);border-radius:16px}
.mileage-board button,.training-sheet button{display:inline-flex;align-items:center;justify-content:center;width:auto;min-width:0;min-height:44px;margin:0;padding:0;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.mileage-board button:disabled,.training-sheet button:disabled{opacity:.35;cursor:default}
.board-heading,.panel-title,.manage-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.board-heading h2{margin:0;font-size:20px;line-height:1.4;font-weight:650}
.board-heading p,.panel-title p{margin:4px 0 0;font-size:12px;color:var(--muted);line-height:1.6}
.mileage-board .text-action,.training-sheet .text-action{flex:none;min-height:44px;padding:0 2px;color:var(--accent);font-size:12px;white-space:nowrap}
.range-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:16px 0 0;padding:4px;border:1px solid var(--line);border-radius:13px;background:#eeede8}
.mileage-board .range-tabs button{width:100%;min-height:44px;border-radius:9px;color:var(--muted);font-size:13px}
.mileage-board .range-tabs button.on{background:#fff;color:var(--accent);font-weight:600;box-shadow:0 1px 4px #24302e08}
.period-control{display:flex;align-items:center;gap:4px;min-height:52px;margin:4px 0 12px}
.mileage-board .period-control>button{flex:none;width:44px;min-height:44px;font-size:24px;color:var(--muted)}
.period-control label{position:relative;display:grid;place-items:center;flex:1;min-width:0;min-height:44px;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.5;text-align:center}
.period-control label>span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.period-control input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.volume-card{position:relative;overflow:hidden;margin:0 0 24px;padding:18px 16px 16px;border:1px solid #456f62;border-radius:16px;background:linear-gradient(125deg,#263f37,#3e7669);color:#fff}
.volume-label{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#d4e7df;font-size:12px}
.volume-label>span:first-child{min-width:0;overflow-wrap:anywhere}
.volume-symbol{display:grid;place-items:center;flex:none;width:30px;height:30px;border:1px solid #ffffff30;border-radius:10px;color:#e2f0e9;background:#ffffff0d}
.volume-symbol svg{width:18px;height:18px}
.volume-number{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:12px 0 20px;font-size:clamp(30px,10vw,48px);font-weight:650;letter-spacing:-1px;font-variant-numeric:tabular-nums;line-height:1.15;overflow-wrap:anywhere}
.volume-number>span{white-space:nowrap}
.volume-number.is-long{font-size:30px;letter-spacing:-.5px}
.volume-number>small{margin-left:0;font-size:12px;font-weight:400;color:#d4e7df;letter-spacing:normal;white-space:nowrap}
.volume-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding-top:14px;border-top:1px solid #ffffff26}
.volume-metrics>div{display:grid;min-width:0;gap:5px}
.volume-metrics>div+div{padding-left:10px;border-left:1px solid #ffffff26}
.volume-metrics b{font-size:17px;font-weight:600;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;line-height:1.4}
.volume-metrics b small,.volume-metrics span{font-size:12px;font-weight:400;color:#d4e7df}
.panel-title h3,.manage-section-heading h3{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.panel-title>span,.manage-section-heading>span{flex:none;font-size:12px;color:var(--muted)}
.group-overview{margin-bottom:24px}
.group-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.mileage-board .group-card{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;width:100%;min-width:0;min-height:158px;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;text-align:left}
.mileage-board .group-card.selected{border-color:#a9c4b7;background:var(--sage-soft)}
.group-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:5px}
.group-card-top b{display:-webkit-box;min-height:38px;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--ink);font-size:13px;font-weight:600;line-height:19px;overflow-wrap:anywhere}
.group-card-top i{flex:none;color:var(--sage);font-size:14px;font-style:normal}
.group-card .group-card-pace{display:block;overflow:hidden;margin-top:4px;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:var(--muted)}
.group-card strong{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px;margin-top:14px;color:var(--sage);font-size:23px;font-weight:650;line-height:1.2;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.group-card strong>span{white-space:nowrap}
.group-card strong.is-long{font-size:15px}
.group-card strong small{font-size:12px;font-weight:400;white-space:nowrap}
.group-card>span:last-child{margin-top:7px;color:var(--muted);font-size:12px;line-height:1.5}
.mileage-board .groups-toggle{display:flex;gap:8px;width:100%;min-height:44px;margin-top:4px;color:var(--sage);font-size:12px}
.groups-toggle span{font-size:16px}
.rank-panel{padding:16px 14px 12px;border:1px solid var(--line);border-radius:16px;background:#fff}
.group-tabs{margin:14px 0 10px}
.group-tabs label{display:flex;align-items:center;gap:12px;min-width:0;min-height:44px;padding-left:12px;border:1px solid var(--line);border-radius:10px;background:var(--field-bg)}
.group-tabs label>span{flex:none;font-size:12px;color:var(--muted)}
.group-tabs select{flex:1;width:0;min-width:0;max-width:100%;min-height:44px;padding:0 26px 0 0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;text-overflow:ellipsis}
.rank-search{display:flex;align-items:center;gap:8px;min-height:44px;margin:0 0 12px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:var(--field-bg)}
.rank-search svg{flex:none;width:16px;height:16px;color:var(--muted)}
.rank-search input{flex:1;width:0;min-width:0;min-height:44px;padding:0;border:0;border-radius:0;outline:none;background:transparent;color:var(--ink);font:inherit;font-size:13px}
.mileage-board .rank-search button{flex:none;width:44px;min-height:44px;font-size:20px;color:var(--muted)}
.mine-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #dce8df;border-radius:11px;background:var(--sage-soft);color:var(--sage)}
.mine-summary>div{display:grid;gap:3px}
.mine-summary>div>span{font-size:12px;font-weight:600}
.mine-summary small{font-size:12px;font-weight:400}
.mine-summary>div small{color:var(--muted)}
.mine-summary>b{min-width:0;font-size:22px;font-weight:650;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.rank-columns{display:flex;justify-content:space-between;padding:16px 0 9px;font-size:12px;color:var(--muted)}
.rank-row{display:flex;align-items:center;gap:8px;min-height:76px;border-top:1px solid var(--line);color:var(--ink);text-decoration:none}
.rank-row.mine{margin:0 -5px;padding:0 5px;border-radius:10px;background:#f8faf7}
.rank-place{flex:none;width:18px;color:#89948f;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}
.rank-place.medal{color:var(--sage);font-weight:650}
.rank-avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;overflow:hidden;border:1px solid #e1e9e1;border-radius:11px;background:var(--sage-soft);color:var(--sage);font-size:13px}
.rank-avatar img{width:100%;height:100%;object-fit:cover}
.rank-person{display:grid;flex:1;min-width:0;gap:5px}
.rank-person>b{display:flex;align-items:center;gap:4px;min-width:0;font-size:13px;font-weight:550;line-height:1.5;overflow-wrap:anywhere}
.rank-person>b small{flex:none;padding:0 3px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:400}
.rank-person>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted);font-size:12px;line-height:1.5}
.rank-distance{display:grid;flex:none;gap:5px;max-width:39%;text-align:right}
.rank-distance>b{font-size:19px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.rank-distance>small{color:var(--muted);font-size:12px}
.rank-chevron{flex:none;color:#a8b0aa;font-size:15px;font-style:normal}
.rank-footnote{margin:12px 0 0;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.8}
.quiet-empty{padding:26px 5px;text-align:center;color:var(--muted);font-size:12px;line-height:1.8}
.board-error,.board-notice{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:13px;border:1px solid #f3d8dd;border-radius:12px;background:var(--accent-soft);color:var(--accent);font-size:12px;line-height:1.8}
.board-error button{flex:none;font-size:12px;color:var(--accent)}
.board-loading{padding:48px 12px;text-align:center;color:var(--muted);font-size:13px}
.board-notice{margin-top:12px}
.tools-panel{margin-top:14px;padding:0 16px;background:var(--card);border-radius:15px}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.tools-panel>summary,.nested-tool>summary{display:flex;justify-content:space-between;align-items:center;min-height:57px;gap:8px;font-size:14px}
.tools-panel>summary i{font-style:normal;color:var(--muted)}
.tools-note{font-size:12px;color:var(--muted);line-height:1.8}
.nested-tool{border-top:1px solid var(--line)}
.nested-tool summary span{color:var(--muted);font-size:12px}
.run-record{position:relative;border-top:1px solid var(--line);padding:13px 0;font-size:12px}
.run-record>div{display:grid;gap:5px}
.run-record>div span,.run-record>p{color:var(--muted);font-size:12px;line-height:1.8}
.run-record>strong{display:block;margin-top:10px;font-size:18px}
.run-record>strong small{font-size:12px;font-weight:400}
.run-record>img{max-width:100%;max-height:220px;border-radius:9px}
.record-review summary{color:var(--muted);font-size:12px;min-height:35px}
.inline-form{display:flex;gap:7px}
.inline-form input{flex:1;min-width:0}
.review-actions{display:flex;gap:10px}
.review-actions button{font-size:12px;color:var(--accent)}
.tool-tabs{display:flex;gap:8px}
.tool-tabs button{flex:1;padding:9px;border-radius:7px;background:var(--field-bg);color:var(--muted);font-size:12px}
.tool-tabs button.on{color:var(--accent);background:var(--accent-soft)}
.report-scroll{overflow:auto}
table{width:100%;border-collapse:collapse;text-align:left;font-size:12px;white-space:nowrap}
th{font-weight:400;color:var(--muted)}
td,th{padding:12px 9px;border-bottom:1px solid var(--line)}
.rules-form{padding:5px 0 16px;display:grid;gap:12px}
.rules-form label,.group-form label{display:grid;gap:7px;color:var(--muted);font-size:12px}
.rule-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.check-line{display:flex!important;align-items:center;gap:8px!important;font-size:12px;color:var(--muted);line-height:1.7;margin:12px 0}
.check-line input{width:15px;height:15px;accent-color:var(--accent)}
.rules-form input:not([type=checkbox]),.inline-form input,.group-form input,.group-form textarea,.assign-row select,.manage-search{width:100%;min-width:0;box-sizing:border-box;min-height:42px;padding:10px 11px;border:1px solid var(--line);border-radius:8px;background:var(--card);font:inherit;color:var(--ink);font-size:14px}
.rules-form input:disabled{opacity:.65}
.mileage-board .save-action,.training-sheet .save-action{min-height:42px;padding:0 16px;width:auto;background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:9px;font-size:12px}
.mileage-board .outline-action,.training-sheet .outline-action{min-height:42px;padding:0 14px;width:auto;color:var(--muted);border:1px solid var(--line);border-radius:9px;font-size:12px;background:var(--card)}
.outline-action{margin-bottom:12px}
.inline-error{font-size:12px;color:var(--accent);line-height:1.8}
.inline-error button{color:var(--accent);text-decoration:underline;font-size:12px}
.training-overlay{position:fixed;z-index:80;inset:0;display:flex;justify-content:flex-end;background:#25293655;backdrop-filter:blur(3px)}
.training-sheet{box-sizing:border-box;width:min(480px,100%);height:100dvh;overflow:auto;padding:25px 23px 40px;background:var(--card);color:var(--ink);font-family:inherit}
.training-sheet>header{display:flex;align-items:center;justify-content:space-between;gap:14px}
.training-sheet>header span{color:var(--muted);font-size:12px;letter-spacing:normal}
.training-sheet h2{font-size:22px;margin:8px 0 0;letter-spacing:normal}
.training-sheet>header button{width:35px;min-height:40px;color:var(--muted);font-size:24px}
.sheet-intro{font-size:12px;color:var(--muted);line-height:1.9;margin:18px 0 20px}
.manage-section-heading{border-top:1px solid var(--line);padding-top:20px;margin:20px 0 14px}
.manage-section-heading h3 small{color:var(--muted);font-size:12px;margin-left:5px;font-weight:400}
.group-form{display:grid;gap:13px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:15px}
.group-form h3{font-size:14px;margin:0}
.group-form textarea{resize:vertical}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.form-actions button{margin:0}
.managed-group{display:flex;align-items:center;gap:10px;padding:17px 0;border-top:1px solid var(--line)}
.managed-group>div{flex:1;min-width:0}
.managed-group b{font-size:14px;font-weight:500;overflow-wrap:anywhere}
.managed-group span{display:block;color:var(--muted);font-size:12px;margin-top:6px;line-height:1.7}
.managed-group p{color:var(--muted);font-size:12px;line-height:1.8;margin:6px 0 0;overflow-wrap:anywhere}
.managed-group>button{flex:none;width:auto;min-height:36px;font-size:12px;color:var(--muted)}
.managed-group>button.delete-group{color:var(--accent)}
.assign-row{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid var(--line)}
.assign-row>span,.assign-row>.manage-member-link{flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px}
.assign-row select{width:125px;flex:none;font-size:12px}
.manage-search{margin-bottom:7px}

.report-member-link{display:inline-flex;align-items:center;gap:7px;min-height:44px;color:var(--ink);text-decoration:none}.report-member-link span{color:var(--muted)}
.tools-panel{border:1px solid var(--line);border-radius:14px}
.tools-panel>summary,.nested-tool>summary,.record-review summary{min-height:44px}
.mileage-board .tool-tabs button,.training-sheet .form-actions button{flex:1;min-height:44px}
.mileage-board .save-action,.training-sheet .save-action,.mileage-board .outline-action,.training-sheet .outline-action{min-height:44px}
.rules-form input:not([type=checkbox]),.inline-form input,.group-form input,.group-form textarea,.assign-row select,.manage-search{min-height:44px;border-radius:10px;background:var(--field-bg)}
.training-sheet{padding:20px 20px 32px;background:#fff}
.training-sheet>header button{width:44px;min-height:44px}
.managed-group>button{min-height:44px}
.assign-row>.manage-member-link{display:flex;align-items:center;min-height:44px;color:var(--ink);text-decoration:none}
@media(max-width:350px){.mileage-board{padding:16px 12px}.board-heading h2{font-size:19px}.board-heading p{max-width:160px}.volume-card{padding:16px 14px}.volume-metrics{gap:6px}.volume-metrics>div+div{padding-left:6px}.volume-metrics b{font-size:14px}.volume-number.is-long{font-size:26px}.group-card strong.is-long{font-size:13px}.group-cards{gap:8px}.mileage-board .group-card{padding:10px}.group-card strong{font-size:21px}.rank-panel{padding:14px 12px 12px}.rank-row{gap:6px}.rank-place{width:13px}.rank-avatar{width:28px;height:28px}.rank-distance>b{font-size:17px}.rank-chevron{display:none}.training-sheet{padding:18px 16px 28px}}
</style>
