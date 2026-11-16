<template>
  <section id="race-outings" class="race-outings" aria-labelledby="race-outings-title">
    <header class="outings-heading">
      <span class="outings-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="7" r="3"/><path d="M2.5 20v-3a5.5 5.5 0 0 1 11 0v3M16 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4.5 5v1"/></svg></span>
      <div><p class="outings-eyebrow">约好时间，一起出发</p><h2 id="race-outings-title">本场同行安排</h2></div>
    </header>
    <p class="outings-intro">和跑团约拼车、集合、领物，在这里确认时间和伙伴。</p>

    <div v-if="!authenticated" class="outings-empty">
      <strong>下一程，和熟悉的人一起</strong><p>登录后，查看已加入跑团的同行安排。</p>
      <button type="button" class="outings-primary" @click="login">登录查看同行安排<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></button>
    </div>
    <template v-else>
      <div v-if="loading && !outings.length" class="outings-loading" role="status">正在寻找同行伙伴…</div>
      <div v-if="loadError" class="outings-load-error" role="alert"><p>{{ loadError }}</p><button type="button" class="outings-secondary" :disabled="loading" @click="load">{{ loading ? '加载中…' : '重新加载同行安排' }}</button></div>
      <template v-if="!loading || outings.length">
        <div v-if="!loadError && !availableClubs.length" class="outings-empty"><strong>先找到你的跑团</strong><p>加入跑团后，即可查看或发起同行安排。</p><router-link class="outings-discover" to="/clubs">发现跑团 <span aria-hidden="true">›</span></router-link></div>
        <template v-if="availableClubs.length">
          <div class="outings-toolbar">
            <label class="outings-filter"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none"><path d="M3 4h14l-5.5 6.5V16l-3-1.5v-4Z"/></svg><select v-model="filterClubId" aria-label="按跑团筛选"><option value="">全部跑团</option><option v-for="club in availableClubs" :key="club.id" :value="String(club.id)">{{ club.name }}</option></select></label>
            <button type="button" class="outings-primary outings-create" :aria-expanded="formOpen" aria-controls="outing-create-form" :disabled="formBusy" @click="toggleForm"><svg viewBox="0 0 16 16" aria-hidden="true"><path :d="formOpen ? 'M4 8h8' : 'M8 3v10M3 8h10'"/></svg>{{ formOpen ? '收起安排表单' : '发起安排' }}</button>
          </div>

          <form v-if="formOpen" id="outing-create-form" class="outing-form" @submit.prevent="createOuting">
            <div class="outing-form-heading"><h3>发起一个同行安排</h3><span>仅所属跑团可见</span></div>
            <div class="outing-fields">
              <label>安排类型<select v-model="draft.kind" aria-label="安排类型" :disabled="formBusy"><option value="carpool">拼车</option><option value="gather">集合</option><option value="pickup">领物</option></select></label>
              <label>所属跑团<select v-model="draft.clubId" aria-label="所属跑团" required :disabled="formBusy"><option value="" disabled>请选择跑团</option><option v-for="club in availableClubs" :key="club.id" :value="String(club.id)">{{ club.name }}</option></select></label>
              <label class="outing-field-wide">集合时间（北京时间）<input v-model="draft.startsAt" aria-label="集合时间（北京时间）" type="datetime-local" required :min="minimumTime" :disabled="formBusy" /><small>按北京时间填写，无需转换手机所在时区。</small></label>
              <label class="outing-field-wide">集合地点<input v-model="draft.place" aria-label="集合地点" required maxlength="120" placeholder="如：酒店大堂 / 地铁站 A 口" :disabled="formBusy" /></label>
              <label class="outing-field-wide">人数上限（含发起人）<input v-model="draft.capacity" aria-label="人数上限（含发起人）" type="number" min="1" max="100" step="1" required inputmode="numeric" :disabled="formBusy" /><small>填写总人数，发起人自动占 1 个名额。</small></label>
              <label class="outing-field-wide">补充说明<textarea v-model="draft.note" aria-label="补充说明" rows="3" maxlength="300" placeholder="可以补充行程、识别方式或需要带的东西" :disabled="formBusy"></textarea><small class="outing-note-count">{{ draft.note.length }}/300</small></label>
            </div>
            <p v-if="formError" class="outing-error" role="alert">{{ formError }}</p>
            <div class="outing-form-actions"><button type="button" class="outings-secondary" :disabled="formBusy" @click="formOpen = false">暂不发布</button><button type="submit" class="outings-primary" :disabled="formBusy">{{ formBusy ? '发布中…' : '发布安排' }}</button></div>
          </form>

          <div v-if="!loadError && !filteredOutings.length" class="outings-empty outings-empty-list"><span class="outings-empty-line" aria-hidden="true"></span><strong>第一份同行约定，等你发起</strong><p>{{ filterClubId ? '这个跑团还没有本场安排。' : '这场比赛还没有同行安排。' }}约好时间和地点，一起出发。</p></div>
          <div v-if="filteredOutings.length" class="outings-list">
            <article v-for="outing in filteredOutings" :key="outing.id" class="outing-card" :data-outing-id="outing.id">
              <div class="outing-card-heading">
                <span class="outing-kind-icon" :class="'kind-' + outing.kind" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><template v-if="outing.kind === 'carpool'"><path d="m5 9 1.5-4h11L19 9M4 9h16v9H4zM4 18v2m16-2v2M7 13h2m6 0h2"/></template><template v-else-if="outing.kind === 'pickup'"><path d="M5 8h14l1 12H4L5 8Z M8 8V6a4 4 0 0 1 8 0v2"/><path d="m9 13 2 2 4-4"/></template><template v-else><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></template></svg></span>
                <div class="outing-card-title"><h3>{{ outing.kindLabel || kindLabels[outing.kind] }}</h3><p>{{ outing.clubName }}</p></div>
                <span class="outing-state" :class="{ 'is-joined': outing.joined, 'is-full': !outing.remaining && !outing.joined }">{{ outing.joined ? isHost(outing) ? '我发起的' : '已加入' : !outing.remaining ? '已满员' : expired(outing) ? '已开始' : '可加入' }}</span>
              </div>
              <dl class="outing-facts"><div><dt><svg viewBox="0 0 16 16" aria-hidden="true" fill="none"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg><span class="outings-sr-only">时间</span></dt><dd>{{ formatTime(outing.startsAt) }}<small>北京时间</small></dd></div><div><dt><svg viewBox="0 0 16 16" aria-hidden="true" fill="none"><path d="M13 6c0 3.5-5 8-5 8S3 9.5 3 6a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6" r="1.5"/></svg><span class="outings-sr-only">地点</span></dt><dd>{{ outing.place }}</dd></div></dl>
              <p v-if="outing.note" class="outing-note">{{ outing.note }}</p>
              <div class="outing-members"><div class="outing-members-summary"><span class="outing-member-count"><strong>{{ outing.memberCount }}</strong> / {{ outing.capacity }} 人</span><span>{{ outing.remaining ? '还差 ' + outing.remaining + ' 人满员' : '伙伴已到齐' }}</span></div><div class="outing-member-names"><span v-for="member in outing.members" :key="member.userId" :class="{ 'is-host': String(member.userId) === String(outing.host?.userId) }">{{ member.nickname || '跑友' }}<small v-if="String(member.userId) === String(outing.host?.userId)">发起人</small></span></div></div>
              <div class="outing-card-actions"><span class="outing-host-caption">{{ outing.host?.nickname || '跑友' }} 发起</span><div class="outing-action-buttons"><button v-if="outing.joined && !isHost(outing)" type="button" class="outings-secondary" :disabled="!!busyIds[outing.id]" @click="membership(outing, false)">{{ busyIds[outing.id] === 'leave' ? '退出中…' : '退出安排' }}</button><button v-if="outing.canCancel" type="button" class="outings-cancel" :disabled="!!busyIds[outing.id]" @click="cancelOuting(outing)">{{ busyIds[outing.id] === 'cancel' ? '取消中…' : '取消安排' }}</button><button v-if="!outing.joined" type="button" class="outings-primary" :disabled="!outing.canJoin || !!busyIds[outing.id]" @click="membership(outing, true)">{{ busyIds[outing.id] === 'join' ? '加入中…' : !outing.remaining ? '已满员' : !outing.canJoin ? '暂不可加入' : '加入安排' }}</button></div></div>
              <p v-if="actionErrors[outing.id]" class="outing-error" role="alert">{{ actionErrors[outing.id] }}</p>
            </article>
          </div>
        </template>
      </template>
      <p v-if="feedback" class="outings-feedback" role="status">{{ feedback }}</p>
      <p v-if="availableClubs.length" class="outings-footnote">安排仅所属跑团可见 · 加入安排不会更改个人参赛计划</p>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const props = defineProps({ raceId: { type: [String, Number], required: true }, clubs: { type: Array, default: () => [] }, ready: Boolean });
const route = useRoute(), router = useRouter();
const accountToken = ref(localStorage.getItem('marathon_token') || '');
const authenticated = computed(() => props.ready && !!accountToken.value);
const outings = ref([]), accountClubs = ref(null), userId = ref(null), loading = ref(false), loadError = ref('');
const formOpen = ref(false), formBusy = ref(false), formError = ref(''), feedback = ref('');
const filterClubId = ref(String(route.query.clubId || '')), busyIds = ref({}), actionErrors = ref({});
const kindLabels = { carpool: '拼车', gather: '集合', pickup: '领物' };
const availableClubs = computed(() => accountClubs.value || props.clubs);
const filteredOutings = computed(() => outings.value.filter(outing => outing.status === 'open' && (!filterClubId.value || String(outing.clubId) === filterClubId.value)).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || Number(a.id) - Number(b.id)));
const minimumTime = computed(() => new Date(Date.now() + 8 * 3600000 + 60000).toISOString().slice(0, 16));
const draft = reactive({ kind: 'carpool', clubId: '', startsAt: '', place: '', capacity: 4, note: '' });
let generation = 0, loadSequence = 0, disposed = false, anchorPending = route.hash === '#race-outings';

function context() { return { raceId: String(props.raceId), token: localStorage.getItem('marathon_token') || '', generation }; }
function current(request) { return !disposed && request.generation === generation && request.raceId === String(props.raceId) && request.token === (localStorage.getItem('marathon_token') || ''); }
function path(request) { return '/races/' + encodeURIComponent(request.raceId) + '/outings'; }
function isHost(outing) { return userId.value != null && String(outing.host?.userId) === String(userId.value); }
function expired(outing) { return Date.parse(outing.startsAt + ':00+08:00') <= Date.now(); }
function formatTime(value) { const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/); return match ? `${match[1]}.${match[2]}.${match[3]} ${match[4]}` : value; }
function reconcileClubs() {
  const ids = new Set(availableClubs.value.map(club => String(club.id)));
  if (filterClubId.value && !ids.has(filterClubId.value)) filterClubId.value = '';
  if (!ids.has(draft.clubId)) draft.clubId = filterClubId.value || (availableClubs.value[0] ? String(availableClubs.value[0].id) : '');
}
async function load() {
  if (!authenticated.value) return;
  const request = context(), sequence = ++loadSequence;
  loading.value = true; loadError.value = '';
  try {
    const [data, me] = await Promise.all([api(path(request)), api('/me')]);
    if (!current(request) || sequence !== loadSequence) return;
    outings.value = Array.isArray(data.outings) ? data.outings.filter(outing => outing.status === 'open') : [];
    userId.value = me.user?.id ?? null;
    accountClubs.value = Array.isArray(me.clubs) ? me.clubs : props.clubs;
    reconcileClubs();
    if (anchorPending) { anchorPending = false; await nextTick(); if (current(request)) document.getElementById('race-outings')?.scrollIntoView({ block: 'start' }); }
  } catch (error) { if (current(request) && sequence === loadSequence) loadError.value = error.message || '同行安排暂时无法加载，请重试。'; }
  finally { if (current(request) && sequence === loadSequence) loading.value = false; }
}
function reset() {
  generation++; loadSequence++;
  outings.value = []; accountClubs.value = null; userId.value = null; loadError.value = ''; loading.value = false;
  formOpen.value = false; formBusy.value = false; formError.value = ''; feedback.value = ''; busyIds.value = {}; actionErrors.value = {};
  filterClubId.value = String(route.query.clubId || '');
  Object.assign(draft, { kind: 'carpool', clubId: '', startsAt: '', place: '', capacity: 4, note: '' });
  if (authenticated.value) load();
}
function syncAccount() { accountToken.value = localStorage.getItem('marathon_token') || ''; }
function toggleForm() { formOpen.value = !formOpen.value; if (formOpen.value) { reconcileClubs(); if (filterClubId.value) draft.clubId = filterClubId.value; } }
function login() { localStorage.setItem('marathon_return_after_login', route.fullPath.replace(/#.*$/, '') + '#race-outings'); router.push('/mine'); }
function updateOuting(outing) {
  if (!outing || String(outing.raceId) !== String(props.raceId)) return;
  const others = outings.value.filter(item => String(item.id) !== String(outing.id));
  outings.value = outing.status === 'open' ? [...others, outing] : others;
}
async function createOuting() {
  if (formBusy.value) return;
  formError.value = ''; feedback.value = '';
  const capacity = Number(draft.capacity), startsAt = draft.startsAt;
  if (!availableClubs.value.some(club => String(club.id) === draft.clubId)) { formError.value = '请选择已加入的跑团。'; return; }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) || !(Date.parse(startsAt + ':00+08:00') > Date.now())) { formError.value = '请选择未来的北京时间。'; return; }
  if (!draft.place.trim() || draft.place.trim().length > 120) { formError.value = '集合地点请填写 1 至 120 字。'; return; }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) { formError.value = '人数上限须为 1 至 100 人，包含发起人。'; return; }
  if (draft.note.length > 300) { formError.value = '补充说明最多 300 字。'; return; }
  const request = context(); formBusy.value = true;
  try {
    const data = await api(path(request), { method: 'POST', body: JSON.stringify({ clubId: Number(draft.clubId), kind: draft.kind, startsAt, place: draft.place.trim(), capacity, note: draft.note.trim() }) });
    if (!current(request)) return;
    updateOuting(data.outing); filterClubId.value = draft.clubId; formOpen.value = false;
    Object.assign(draft, { startsAt: '', place: '', capacity: 4, note: '' });
    feedback.value = '同行安排已发布，你已作为发起人加入。';
  } catch (error) { if (current(request)) formError.value = error.message || '发布失败，请重试，填写的内容已保留。'; }
  finally { if (current(request)) formBusy.value = false; }
}
async function membership(outing, joined) {
  if (busyIds.value[outing.id] || (!joined && isHost(outing)) || (joined && !outing.canJoin)) return;
  await changeOuting(outing, joined ? 'join' : 'leave', { method: 'PUT', body: JSON.stringify({ joined }) }, '/membership');
}
async function cancelOuting(outing) {
  if (busyIds.value[outing.id] || !outing.canCancel || !window.confirm('取消这项' + (outing.kindLabel || kindLabels[outing.kind]) + '安排？取消后，所有已加入的伙伴将不再看到它。')) return;
  await changeOuting(outing, 'cancel', { method: 'DELETE' });
}
async function changeOuting(outing, operation, options, suffix = '') {
  const request = context(); busyIds.value = { ...busyIds.value, [outing.id]: operation };
  actionErrors.value = { ...actionErrors.value, [outing.id]: '' }; feedback.value = '';
  try {
    const data = await api(path(request) + '/' + encodeURIComponent(outing.id) + suffix, options);
    if (!current(request)) return;
    if (operation === 'cancel') outings.value = outings.value.filter(item => String(item.id) !== String(outing.id));
    else updateOuting(data.outing);
    feedback.value = operation === 'join' ? '已加入安排，和伙伴约好了。' : operation === 'leave' ? '已退出安排。' : '同行安排已取消。';
  } catch (error) {
    if (!current(request)) return;
    actionErrors.value = { ...actionErrors.value, [outing.id]: error.message || '操作失败，请重试。' };
    if (error.status === 409 || error.status === 404) await load();
  } finally { if (current(request)) { const next = { ...busyIds.value }; delete next[outing.id]; busyIds.value = next; } }
}
watch([() => props.raceId, () => props.ready, accountToken], reset, { immediate: true });
watch(() => route.query.clubId, value => { filterClubId.value = String(value || ''); if (!loading.value) reconcileClubs(); });
watch(() => props.clubs, () => { if (!loading.value && accountClubs.value === null) reconcileClubs(); });
onMounted(() => { window.addEventListener('storage', syncAccount); window.addEventListener('focus', syncAccount); });
onBeforeUnmount(() => { disposed = true; generation++; window.removeEventListener('storage', syncAccount); window.removeEventListener('focus', syncAccount); });
</script>

<style scoped src="./race-outings.css"></style>
