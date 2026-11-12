<template>
  <main class="exercise">
    <PageHeader title="运动" subtitle="跑量、目标与运动记录" />
    <section v-if="!ready" class="surface guest-state"><span class="guest-mark" aria-hidden="true">＋</span><h2>我的运动记录</h2><p>登录后记录跑步，查看自己的跑量与进步。</p><button class="primary" type="button" @click="login">登录后记录</button></section>
    <template v-else-if="data">
      <section class="surface mileage-hero" :aria-busy="loading">
        <div class="hero-top">
          <div class="month-block">
            <span class="month-caption">月度跑量</span>
            <div class="month-control">
              <button class="month-step" type="button" aria-label="上一个月" @click="shiftMonth(-1)">‹</button>
              <label class="month-select"><span>{{ monthLabel }}</span><input v-model="month" type="month" aria-label="选择月份" @change="load" /></label>
              <button class="month-step" type="button" aria-label="下一个月" @click="shiftMonth(1)">›</button>
            </div>
          </div>
          <button v-if="data.month.canFlag" class="target-link" type="button" :aria-label="data.month.target ? '修改目标 ›' : '设置目标 ›'" :aria-expanded="targetOpen" @click="targetOpen = !targetOpen">{{ data.month.target ? '修改目标' : '设置目标' }}</button>
        </div>
        <div class="hero-overview">
          <div class="mileage-copy">
            <span class="hero-kicker">本月累计</span>
            <div class="mileage-value"><strong>{{ data.month.km }}</strong><span>km</span></div>
            <span class="mileage-footnote">{{ data.month.count }} 次跑步 · {{ data.month.days }} 天运动</span>
          </div>

        </div>
        <div class="run-metrics"><div><b>{{ data.month.count }}</b><span>跑步次数</span></div><div><b>{{ data.month.days }}</b><span>运动天数</span></div><div><b>{{ data.month.paceLabel || '—' }}</b><span>平均配速</span></div></div>
        <div v-if="data.month.target" class="target-summary"><div class="target-copy"><span>本月目标 <b>{{ data.month.target }} km</b></span><strong>{{ targetPercent }}%</strong></div><div class="progress" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100" aria-label="跑量目标进度"><i :style="{ width: progressPercent + '%' }"></i></div><p><span>已完成 {{ data.month.km }} km</span><span>还差 {{ Math.max(0, Number(data.month.target) - Number(data.month.km)).toFixed(1) }} km</span></p></div>
        <button v-else-if="data.month.canFlag" class="target-prompt" type="button" :aria-expanded="targetOpen" @click="targetOpen = !targetOpen"><span class="target-mark">＋</span><span><strong>设置月度跑量目标</strong><small>记录目标并查看完成进度</small></span><b>设置 ›</b></button>
        <p v-if="data.month.observe" class="hint observe-note">本月为观察月，目标仅供个人记录。</p>
        <div class="record-actions"><button class="primary record-button" type="button" :aria-expanded="recordOpen" @click="recordOpen = !recordOpen">{{ recordOpen ? '收起记录' : '＋ 记录跑步' }}</button><router-link class="import-button" to="/runner?view=devices">导入运动文件</router-link></div>
      </section>
      <section class="surface trend-card">
        <div class="weekly-chart" role="img" :aria-label="weeklyChartLabel">
          <div class="chart-heading"><div><h2>跑量趋势</h2><p class="chart-subtitle">按自然周统计本月跑量</p></div><span>公里 / 周</span></div>
          <div class="chart-bars" :style="{ gridTemplateColumns: `repeat(${weeklyRuns.length}, minmax(0, 1fr))` }" aria-hidden="true">
            <div v-for="week in weeklyRuns" :key="week.label" class="chart-column">
              <span class="bar-value">{{ week.kmLabel }}</span>
              <div class="bar-track"><i :class="{ peak: week.peak }" :style="{ height: week.height + '%' }"></i></div>
              <span class="bar-label">{{ week.label }}</span>
            </div>
          </div>
        </div>

      </section>
      <section v-if="targetOpen && data.month.canFlag" class="surface editor"><div class="section-heading"><h2>本月目标</h2><button type="button" class="close-button" aria-label="收起目标设置" @click="targetOpen = false">收起</button></div><form class="stack" @submit.prevent="saveFlag"><label>目标跑量<input v-model="target" inputmode="decimal" placeholder="本月目标，公里" /></label><span class="field-label">性别</span><div class="choices"><button type="button" :class="{ on: gender === '男' }" @click="gender = '男'">男</button><button type="button" :class="{ on: gender === '女' }" @click="gender = '女'">女</button><button type="button" :class="{ on: gender === '' }" @click="gender = ''">不填</button></div><p class="hint">不填性别时，按本团下限里较高的一项计算。</p><button class="primary" type="submit">保存目标</button></form></section>
      <p class="manual-note">支持手动记录与 FIT / TCX 文件导入</p>
      <section v-if="recordOpen" class="surface editor"><div class="section-heading"><h2>记录一次跑步</h2></div><form class="stack" @submit.prevent="create"><div class="choices"><button type="button" :class="{ on: form.type === 'run' }" @click="form.type = 'run'">跑步</button><button type="button" :class="{ on: form.type === 'trail' }" @click="form.type = 'trail'">越野</button></div><label>开始时间<input v-model="form.startedAt" placeholder="例如 2026-10-27 06:30" /></label><div class="field-pair"><label>距离（公里）<input v-model="form.distanceKm" inputmode="decimal" placeholder="例如 10" /></label><label>用时<input v-model="form.duration" placeholder="例如 0:50:00" /></label></div><div class="field-pair"><label>爬升（米）<input v-model="form.climb" inputmode="numeric" placeholder="可填 0" /></label><label>城市<input v-model="form.city" maxlength="20" placeholder="选填" /></label></div><label class="file-pick">{{ shot ? '已选择运动截图' : '添加运动截图（选填）' }}<input type="file" accept="image/jpeg,image/png,image/webp" @change="pickShot" /></label><button class="primary" type="submit">保存记录</button></form></section>
      <div class="section-heading records-heading"><h2>运动记录</h2><span>{{ data.runs.length }} 条</span></div>
      <article v-for="item in data.runs" :key="item.id" class="surface run-record"><div class="section-heading"><h3>{{ item.typeLabel }}</h3><button class="text-button" type="button" :aria-expanded="expandedRun === item.id" @click="expandedRun = expandedRun === item.id ? null : item.id">{{ expandedRun === item.id ? '收起' : '详情 / 编辑' }}</button></div><p class="run-date">{{ item.startedAt }}<template v-if="item.city"> · {{ item.city }}</template></p><div class="record-data"><div><b>{{ item.distanceKm }}</b><span>公里</span></div><div><b>{{ item.durationLabel }}</b><span>用时</span></div><div><b>{{ item.paceLabel || '—' }}</b><span>配速</span></div></div><div v-if="expandedRun === item.id" class="record-details"><p class="hint">{{ item.sourceLabel }} · 跑量 {{ item.volumeKm }} 公里 · 爬升 {{ item.climb == null ? '未提供' : item.climb + ' 米' }}</p><p v-if="item.note" class="hint">{{ item.note }}</p><p v-for="club in item.clubs" :key="club.name" class="hint">{{ club.counted ? '计入' : '未计入' }} {{ club.name }}</p><img v-if="item.shot" class="shot" :src="shotSrc(item.id)" alt="运动记录截图"/></div><form v-if="expandedRun === item.id" class="stack record-editor" @submit.prevent="saveRow(item)"><div class="field-pair"><label>运动类型<select v-model="item.editRunMode"><option v-for="mode in runModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></select></label><label>城市<input v-model="item.city" maxlength="20" placeholder="城市" /></label></div><label>累计爬升（米）<input v-model="item.editClimb" inputmode="numeric" placeholder="未提供，可按设备记录补填" /></label><p class="hint">类型待确认时暂不计入跑团 PK；越野还需提供爬升。室内、操场与虚拟跑仅计个人运动。</p><button class="primary" type="submit">保存修改</button><button class="delete-button" type="button" @click="remove(item)">删除这条记录</button></form></article>
      <section v-if="!data.runs.length" class="surface empty-state"><h3>从今天的一次跑步开始</h3><p>点击“记录跑步”，保存距离、用时和路线城市。</p></section>
      <p class="year-note">今年 {{ data.year.km }} 公里 · 累计 {{ data.total.km }} 公里，{{ data.total.count }} 次</p>
    </template>
    <section v-else-if="loadError && !loading" class="surface" role="alert"><p>{{ loadError }}</p><button class="primary" type="button" @click="load">重新加载</button></section>
    <p v-else class="loading-copy">正在读取运动记录…</p>
    <div v-if="data && loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重新加载</button></div>
    <p v-if="message" class="message">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api, runShotSrc, upload } from "../api";
import { useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
const router = useRouter();
const runModes = [{ value: 'unknown', label: '跑步·待确认' }, { value: 'road', label: '户外跑' }, { value: 'trail', label: '越野' }, { value: 'treadmill', label: '跑步机' }, { value: 'indoor', label: '室内跑' }, { value: 'track', label: '操场跑' }, { value: 'virtual', label: '虚拟跑' }];
const recordOpen = ref(false);
const targetOpen = ref(false);
const expandedRun = ref(null);
const runSceneSrc = import.meta.env.BASE_URL + 'images/art-shoe.png';
const monthLabel = computed(() => {
  const [year, selectedMonth] = month.value.split('-');
  return `${year}年${Number(selectedMonth)}月`;
});
const weeklyRuns = computed(() => {
  const [year, selectedMonth] = month.value.split('-').map(Number);
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();
  const weeks = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => ({
    label: `${index * 7 + 1}–${Math.min((index + 1) * 7, daysInMonth)}`,
    km: 0
  }));
  for (const run of data.value?.runs || []) {
    if (run.type && !['run', 'trail'].includes(run.type)) continue;
    const day = Number(String(run.startedAt).slice(8, 10));
    const week = weeks[Math.floor((day - 1) / 7)];
    if (week) week.km += Number(run.volumeKm || 0);
  }
  const max = Math.max(...weeks.map((week) => week.km), 0);
  const peak = max > 0 ? weeks.findIndex((week) => week.km === max) : -1;
  return weeks.map((week, index) => ({
    ...week,
    kmLabel: week.km.toFixed(1),
    height: week.km > 0 && max > 0 ? Math.max(8, Math.round(week.km / max * 100)) : 0,
    peak: index === peak
  }));
});
const weeklyChartLabel = computed(() => `每周跑量：${weeklyRuns.value.map((week) => `${week.label} ${week.kmLabel} 公里`).join('，')}`);
const targetPercent = computed(() => {
  const value = data.value && data.value.month;
  if (!value || !Number(value.target)) return 0;
  const percent = value.percent != null ? Number(value.percent) : Math.round(Number(value.km) / Number(value.target) * 100);
  return Number.isFinite(percent) ? percent : 0;
});
const progressPercent = computed(() => Math.max(0, Math.min(100, Number(targetPercent.value) || 0)));
function login() { localStorage.setItem("marathon_return_after_login", "/sport"); router.push("/mine"); }

const ready = ref(!!localStorage.getItem("marathon_token"));
const data = ref(null);
const loading = ref(false);
const loadError = ref("");
let loadSequence = 0;
const message = ref("");
const month = ref(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
const gender = ref("");
const target = ref("");
const shot = ref(null);
const form = ref({ type: "run", startedAt: "", distanceKm: "", duration: "", climb: "0", city: "" });

function shotSrc(id) {
  return runShotSrc(id);
}

function shiftMonth(offset) {
  const [year, selectedMonth] = month.value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, selectedMonth - 1 + offset, 1));
  month.value = shifted.toISOString().slice(0, 7);
  load();
}

async function load() {
  if (!ready.value) return;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.value)) {
    month.value = data.value?.month.id || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
    message.value = '请选择要查看的月份';
    return;
  }
  const sequence = ++loadSequence;
  const selectedMonth = month.value;
  loading.value = true;
  loadError.value = "";
  message.value = "";
  try {
    const loaded = await api("/runs?month=" + encodeURIComponent(selectedMonth));
    if (sequence !== loadSequence) return;
    loaded.runs = (loaded.runs || []).map((item) => ({ ...item, editRunMode: item.runMode || (item.type === 'trail' ? 'trail' : 'road'), editClimb: item.climb == null ? '' : String(item.climb) }));
    data.value = loaded;
    gender.value = data.value.month.gender || "";
    target.value = data.value.month.target ? String(data.value.month.target) : "";
  } catch (err) {
    if (sequence !== loadSequence) return;
    if (err.status === 401) {
      localStorage.removeItem("marathon_token");
      localStorage.removeItem("marathon_name");
      ready.value = false;
      data.value = null;
    } else loadError.value = err.message;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function pickShot(event) {
  shot.value = event.target.files && event.target.files[0] ? event.target.files[0] : null;
}

async function create() {
  message.value = "";
  try {
    const saved = await api("/runs", {
      method: "POST",
      body: JSON.stringify({
        type: form.value.type,
        startedAt: form.value.startedAt,
        distanceKm: Number(form.value.distanceKm),
        duration: form.value.duration,
        climb: Number(form.value.climb || 0),
        city: form.value.city
      })
    });
    if (shot.value) await upload("/runs/" + saved.run.id + "/shot", shot.value);
    shot.value = null;
    form.value = { type: form.value.type, startedAt: "", distanceKm: "", duration: "", climb: "0", city: "" };
    if (saved.note) message.value = saved.note;
    month.value = saved.run.startedAt.slice(0, 7);
    await load();
    recordOpen.value = false;
  } catch (err) {
    message.value = err.message;
  }
}

async function saveFlag() {
  message.value = "";
  try {
    await api("/runs-flag", {
      method: "PUT",
      body: JSON.stringify({ month: month.value, targetKm: Number(target.value), gender: gender.value })
    });
    await load();
    targetOpen.value = false;
  } catch (err) {
    message.value = err.message;
  }
}

async function saveRow(item) {
  message.value = "";
  try {
    const changes = { city: item.city };
    if (item.editRunMode && item.editRunMode !== (item.runMode || (item.type === 'trail' ? 'trail' : 'road'))) changes.runMode = item.editRunMode;
    if (item.editClimb != null && String(item.editClimb).trim() !== '' && (item.climb == null || Number(item.editClimb) !== Number(item.climb))) changes.climb = item.editClimb;
    await api("/runs/" + item.id, { method: "PUT", body: JSON.stringify(changes) });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function remove(item) {
  message.value = "";
  try {
    await api("/runs/" + item.id, { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(() => {
  load().catch((err) => {
    message.value = err.message;
  });
});
</script>

<style scoped>
/* Monthly training summary. The shared PageHeader remains owned by the shell. */
.exercise > .surface:first-of-type { margin-top: 0; }
.hero-top,.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.month-block { min-width: 0; }
.month-caption,.hero-kicker { display: block; color: var(--muted); font-size:12px; font-weight: 500; line-height: 18px; }
.month-control { display: flex; align-items: center; margin-top: 2px; }
.month-step { display: grid; place-items: center; border-radius:8px; line-height: 1; }
.month-select { position: relative; display: grid; place-items: center; padding: 0 4px; border-radius:8px; color: var(--ink); font-weight: 600; }
.month-select input { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; opacity: 0; }
.target-link { display: flex; align-items: center; justify-content: center; min-width: 68px; line-height: 20px; white-space: nowrap; }
.target-link b { font-weight: 600; }
.hero-overview { grid-template-columns: minmax(0,1fr) 104px; gap: 12px; align-items: center; margin-top: 16px; }
.mileage-copy { min-width: 0; }
.hero-kicker { font-weight: 600; }
.mileage-value { display: flex; align-items: baseline; margin: 6px 0 0; white-space: nowrap; }
.mileage-value strong { color: var(--ink); font-variant-numeric: tabular-nums; }
.mileage-value > span { color: var(--muted); font-size:14px; font-weight: 600; }
.mileage-footnote { display: block; line-height: 17px; }
.runner-strip { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 0; height: 128px; overflow: hidden; padding: 8px; border-radius:10px; background: #f5f5f5; color: var(--ink); }
.runner-photo { display: block; width: 76px; height: 76px; margin: -3px auto 0; object-fit: contain; }
.strip-label { margin-bottom: 3px; color: #ffffffd9; font-size:12px; font-weight: 600; }
.runner-strip strong { font-size:14px; line-height: 19px; white-space: nowrap; }
.strip-detail { margin-top: 2px; color: var(--muted); font-size:12px; line-height: 15px; }
.weekly-chart { margin-top: 18px; }
.chart-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.chart-heading h2 { margin: 0; line-height: 20px; }
.chart-heading > span { color: var(--muted); font-size:12px; }
.chart-bars { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); height: 94px; }
.chart-column { display: grid; grid-template-rows: 17px minmax(0,1fr) 16px; justify-items: center; min-width: 0; }
.bar-value,.bar-label { color: var(--muted); line-height: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bar-track { display: flex; align-items: flex-end; width: 100%; max-width: 26px; overflow: hidden; }
.bar-track i { display: block; width: 100%; min-height: 0; transition: height .2s ease; }
.target-summary { margin-top: 14px; border: 1px solid #f5f5f5; border-radius:10px; background: #fff; }
.target-copy,.target-summary p { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.target-copy { margin-bottom: 9px; color: var(--ink-secondary); }
.target-copy b { color: var(--ink); font-weight: 600; }
.target-copy strong { color: var(--accent); font-weight: 600; }
.progress { height: 5px; overflow: hidden; border-radius:12px; background: #f5f5f5; }
.progress i { display: block; height: 100%; border-radius:inherit; background: var(--accent); }
.target-summary p { color: var(--muted); line-height: 16px; }
.target-prompt { margin-top: 14px; }
.target-mark { place-items: center; width: 30px; height: 30px; flex: none; border-radius:8px; background: #f5f5f5; color: var(--accent); font-size:19px; }
.target-prompt > span:nth-child(2) { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.target-prompt strong { color: var(--ink); }
.target-prompt small { color: var(--muted); font-size:12px; }
.target-prompt > b { margin-left: auto; color: var(--accent); font-size:12px; font-weight: 600; white-space: nowrap; }
.run-metrics { padding-top: 13px; margin-top: 13px; border-top: 1px solid var(--line); }
.run-metrics div { text-align: center; }
.run-metrics div:first-child { text-align: left; }
.run-metrics div:last-child { text-align: right; }
.run-metrics b { display: block; font-variant-numeric: tabular-nums; }
.run-metrics span { display: block; color: var(--muted); }
.record-actions { display: grid; }
.primary,.import-button,.choices button,.close-button,.delete-button,.text-button,.stack .file-pick { min-height: 44px; border-radius:10px; font-size:14px; }
.primary { padding: 0 14px; background: var(--accent); color: #fff; font-weight: 600; }
.record-button { width: 100%; }
.import-button { display: grid; place-items: center; padding: 0 8px; font-weight: 500; text-align: center; }
.manual-note { color: var(--muted); line-height: 17px; }
.section-heading h2,.section-heading h3 { margin: 0; font-size:16px; line-height: 24px; font-weight: 600; }
.section-heading > span { color: var(--muted); font-size:12px; }
.records-heading h2 { font-size:18px; }
.run-record { padding: 14px; }
.text-button { padding: 0 8px; color: var(--accent); font-size:12px; }
.run-date { color: var(--muted); line-height: 18px; }
.record-data { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
.record-data b { display: block; line-height: 24px; font-variant-numeric: tabular-nums; }
.record-data span { display: block; color: var(--muted); }
.stack { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
.stack label,.field-label { min-width: 0; color: var(--muted); font-size:12px; }
.stack input,.stack select { width: 100%; min-width: 0; height: 44px; margin-top: 6px; padding: 0 12px; border: 1px solid var(--line); border-radius:10px; background: var(--bg); color: var(--ink); font-size:14px; }
.field-pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }
.choices { display: flex; gap: 8px; }
.choices button { min-width: 62px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius:8px; background: #fff; color: var(--ink); font-size:13px; }
.choices button.on { border-color: var(--accent); background: #f5f5f5; color: var(--accent); }
.close-button { padding: 0 8px; color: var(--muted); font-size:12px; }
.stack .file-pick { position: relative; display: grid; place-items: center; min-height: 44px; overflow: hidden; background: #f5f5f5; color: var(--ink-secondary); font-size:13px; }
.file-pick input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.record-editor { margin-top: 14px; border-top: 1px solid var(--line); }
.delete-button { color: var(--muted); font-size:13px; }
.shot { display: block; width: 100%; margin-top: 12px; border-radius:8px; }
.guest-state,.empty-state { padding: 28px 20px; text-align: center; }
.guest-state h2 { line-height: 28px; font-weight: 600; }
.guest-state p,.empty-state p { margin: 8px 0 18px; color: var(--muted); font-size:14px; line-height: 1.65; }
.guest-state .primary { width: 100%; }
.guest-mark { place-items: center; width: 48px; height: 48px; margin: auto; border-radius:12px; background: #f5f5f5; color: var(--accent); font-size:22px; }
.empty-state h3 { margin: 0; font-size:16px; }
.year-note,.loading-copy { margin: 14px 4px; color: var(--muted); font-size:12px; line-height: 20px; }
.message { margin: 12px 4px; color: var(--accent); font-size:12px; line-height: 20px; }
.editor { margin-top: 8px; }
@media(max-width:350px){.hero-overview{grid-template-columns:minmax(0,1fr) 88px;gap:8px}.runner-strip{height:120px;padding:7px}.runner-photo{width:68px;height:68px}.weekly-chart{padding-right:8px;padding-left:8px}}
.month-block { display: flex; flex-direction: column; gap: 3px; }
.month-caption { color: #777; }
.month-control { margin-top: 0; }
.month-select { padding: 0 3px; }
.target-link { min-width: 0; border-color: #f5f5f5; }
.hero-overview { grid-template-columns: minmax(0,1fr) 96px; gap: 6px; margin-top: 8px; }
.hero-kicker { font-weight: 400; }
.mileage-value > span { font-size:13px; font-weight: 500; }
.mileage-footnote { display: none; }
.runner-strip { height: 100px; justify-content: center; padding: 0; background: transparent; border-radius:0; }
.runner-photo { width: 90px; height: 82px; margin: 0; }
.runner-strip strong { font-size:12px; font-weight: 500; color: #ff1838; }
.strip-detail { display: none; }
.run-metrics { margin-top: 13px; }
.run-metrics div,.run-metrics div:first-child,.run-metrics div:last-child { text-align: left; }
.run-metrics div + div { padding-left: 10px; border-left: 1px solid #eee; }
.record-actions > * { min-height: 42px; height: 42px; padding: 0 8px; border-radius:10px; font-size:13px; }
.record-actions .import-button { border-color: #eee; background: #fff; color: #777; }
.trend-card { padding: 14px; }
.weekly-chart { margin-top: 0; }
.chart-heading { align-items: center; }
.chart-subtitle { margin: 3px 0 0; line-height: 16px; }
.chart-heading > span { font-size:12px; color: #999; }
.chart-bars { height: 105px; padding: 0 2px; }
.bar-track { max-width: 22px; margin: 3px 0 6px; }
.bar-value,.bar-label { line-height: 15px; }
.target-summary { margin-top: 13px; background: #f5f5f5; }
.target-prompt { justify-content: flex-start; }
.target-prompt strong { line-height: 18px; }
.target-prompt small { font-size:12px; line-height: 16px; }
.target-prompt > b { margin-left: auto; font-size:12px; }
.observe-note { margin-top: 9px; }
.manual-note { text-align: center; }
.run-record { padding: 13px 14px; }
.run-record .section-heading { min-height: 30px; }
.text-button { min-height: 30px; }
.run-date { margin-top: 2px; }
.record-data { margin-bottom: 11px; }
.empty-state { padding: 20px 14px; }
.empty-state h3 { font-size:15px; }
.empty-state p { margin: 6px 0 0; font-size:12px; }
@media(max-width:350px) { .hero-overview { grid-template-columns:minmax(0,1fr) 80px; } .runner-strip { height: 90px; } .runner-photo { width:80px;height:74px; } }
</style>

<style scoped src="../personal-ui.css"></style>
