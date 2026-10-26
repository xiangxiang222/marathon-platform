<template>
  <main class="exercise">
    <PageHeader title="运动" subtitle="记录每一步进步" />
    <section v-if="!ready" class="surface guest-state"><span class="guest-mark" aria-hidden="true">＋</span><h2>每一次出发，都算数</h2><p>登录后记录跑步，查看自己的跑量与进步。</p><button class="primary" type="button" @click="login">登录后记录</button></section>
    <template v-else-if="data">
      <section class="surface mileage-hero">
        <div class="hero-top"><label class="month-select"><span>本月跑量</span><input v-model="month" type="month" aria-label="查看月份" @change="load" /></label><button v-if="data.month.canFlag" class="text-button" type="button" :aria-expanded="targetOpen" @click="targetOpen = !targetOpen">{{ data.month.target ? '修改目标' : '设置目标' }} ›</button></div>
        <div class="mileage-value"><strong>{{ data.month.km }}</strong><span>公里</span></div>
        <div v-if="data.month.target" class="target-summary"><div class="progress" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100" aria-label="跑量目标进度"><i :style="{ width: progressPercent + '%' }"></i></div><p><span>目标 {{ data.month.target }} 公里</span><b>已完成 {{ targetPercent }}%</b></p></div>
        <p v-else class="no-target">为这个月定个目标，按自己的节奏跑。</p>
        <div class="run-metrics"><div><b>{{ data.month.count }}</b><span>跑步次数</span></div><div><b>{{ data.month.days }}</b><span>运动天数</span></div><div><b>{{ data.month.paceLabel || '—' }}</b><span>平均配速</span></div></div>
        <p v-if="data.month.observe" class="hint">本月观摩，不标记目标是否达成。</p>
      </section>
      <section v-if="targetOpen && data.month.canFlag" class="surface editor"><div class="section-heading"><h2>本月目标</h2><button type="button" class="close-button" aria-label="收起目标设置" @click="targetOpen = false">收起</button></div><form class="stack" @submit.prevent="saveFlag"><label>目标跑量<input v-model="target" inputmode="decimal" placeholder="本月目标，公里" /></label><span class="field-label">性别</span><div class="choices"><button type="button" :class="{ on: gender === '男' }" @click="gender = '男'">男</button><button type="button" :class="{ on: gender === '女' }" @click="gender = '女'">女</button><button type="button" :class="{ on: gender === '' }" @click="gender = ''">不填</button></div><p class="hint">不填性别时，按本团下限里较高的一项计算。</p><button class="primary" type="submit">保存目标</button></form></section>
      <button class="primary record-button" type="button" :aria-expanded="recordOpen" @click="recordOpen = !recordOpen">{{ recordOpen ? '收起记录' : '＋ 记录跑步' }}</button>
      <p class="manual-note">当前支持手动记录，尚不支持跑表自动同步</p>
      <section v-if="recordOpen" class="surface editor"><div class="section-heading"><h2>记录一次跑步</h2></div><form class="stack" @submit.prevent="create"><div class="choices"><button type="button" :class="{ on: form.type === 'run' }" @click="form.type = 'run'">跑步</button><button type="button" :class="{ on: form.type === 'trail' }" @click="form.type = 'trail'">越野</button></div><label>开始时间<input v-model="form.startedAt" placeholder="例如 2026-10-27 06:30" /></label><div class="field-pair"><label>距离（公里）<input v-model="form.distanceKm" inputmode="decimal" placeholder="例如 10" /></label><label>用时<input v-model="form.duration" placeholder="例如 0:50:00" /></label></div><div class="field-pair"><label>爬升（米）<input v-model="form.climb" inputmode="numeric" placeholder="可填 0" /></label><label>城市<input v-model="form.city" maxlength="20" placeholder="选填" /></label></div><label class="file-pick">{{ shot ? '已选择运动截图' : '添加运动截图（选填）' }}<input type="file" accept="image/jpeg,image/png,image/webp" @change="pickShot" /></label><button class="primary" type="submit">保存记录</button></form></section>
      <div class="section-heading records-heading"><h2>运动记录</h2><span>{{ data.runs.length }} 条</span></div>
      <article v-for="item in data.runs" :key="item.id" class="surface run-record"><div class="section-heading"><h3>{{ item.typeLabel }}</h3><button class="text-button" type="button" :aria-expanded="expandedRun === item.id" @click="expandedRun = expandedRun === item.id ? null : item.id">{{ expandedRun === item.id ? '收起' : '编辑记录' }}</button></div><p class="run-date">{{ item.startedAt }}<template v-if="item.city"> · {{ item.city }}</template></p><div class="record-data"><div><b>{{ item.distanceKm }}</b><span>公里</span></div><div><b>{{ item.durationLabel }}</b><span>用时</span></div><div><b>{{ item.paceLabel || '—' }}</b><span>配速</span></div></div><p class="hint">{{ item.sourceLabel }} · 跑量 {{ item.volumeKm }} 公里 · 爬升 {{ item.climb }} 米</p><p v-if="item.note" class="hint">{{ item.note }}</p><p v-for="club in item.clubs" :key="club.name" class="hint">{{ club.counted ? '计入' : '未计入' }} {{ club.name }}</p><img v-if="item.shot" class="shot" :src="shotSrc(item.id)" alt="运动记录截图"/><form v-if="expandedRun === item.id" class="stack record-editor" @submit.prevent="saveRow(item)"><div class="field-pair"><label>运动类型<select v-model="item.type"><option value="run">跑步</option><option value="trail">越野</option></select></label><label>城市<input v-model="item.city" maxlength="20" placeholder="城市" /></label></div><button class="primary" type="submit">保存修改</button><button class="delete-button" type="button" @click="remove(item)">删除这条记录</button></form></article>
      <section v-if="!data.runs.length" class="surface empty-state"><h3>从今天的一次跑步开始</h3><p>点击“记录跑步”，保存距离、用时和路线城市。</p></section>
      <p class="year-note">今年 {{ data.year.km }} 公里 · 累计 {{ data.total.km }} 公里，{{ data.total.count }} 次</p>
    </template>
    <p v-else class="loading-copy">正在读取运动记录…</p><p v-if="message" class="message">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api, runShotSrc, upload } from "../api";
import { useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
const router = useRouter();
const recordOpen = ref(false);
const targetOpen = ref(false);
const expandedRun = ref(null);
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
const message = ref("");
const month = ref(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
const gender = ref("");
const target = ref("");
const shot = ref(null);
const form = ref({ type: "run", startedAt: "", distanceKm: "", duration: "", climb: "0", city: "" });

function shotSrc(id) {
  return runShotSrc(id);
}

async function load() {
  if (!ready.value) return;
  message.value = "";
  try {
    data.value = await api("/runs?month=" + encodeURIComponent(month.value));
    gender.value = data.value.month.gender || "";
    target.value = data.value.month.target ? String(data.value.month.target) : "";
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem("marathon_token");
      localStorage.removeItem("marathon_name");
      ready.value = false;
      data.value = null;
    } else message.value = err.message;
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
    await api("/runs/" + item.id, { method: "PUT", body: JSON.stringify({ type: item.type, city: item.city }) });
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
:deep(.page-header) { margin: 0 -12px; }
.exercise { padding: 0 12px 20px; color: #1f2026; }.surface { padding: 16px; margin-bottom: 12px; border-radius: 12px; background: #fff; }.hero-top,.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.month-select { display: flex; flex-direction: column; gap: 5px; color: #8a8e99; font-size: 12px; }.month-select input { max-width: 150px; padding: 0; border: 0; background: transparent; color: #1f2026; font-size: 14px; }.text-button { min-height: 32px; flex: none; color: #ff0a30; font-size: 12px; }.mileage-value { display: flex; align-items: baseline; gap: 8px; margin: 16px 0; }.mileage-value strong { font-size: 48px; line-height: 1.15; letter-spacing: -1px; font-weight: 700; }.mileage-value > span { color: #8a8e99; font-size: 14px; }.progress { height: 6px; border-radius: 4px; overflow: hidden; background: #f0f1f6; }.progress i { display: block; height: 100%; border-radius: inherit; background: #ff0a30; }.target-summary p { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0 0; color: #8a8e99; font-size: 12px; }.target-summary b { color: #ff0a30; font-weight: 400; }.no-target { margin: 0; color: #8a8e99; font-size: 12px; line-height: 20px; }.run-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding-top: 20px; margin-top: 18px; border-top: 1px solid #f0f1f5; }.run-metrics div { text-align: center; }.run-metrics div:first-child { text-align: left; }.run-metrics div:last-child { text-align: right; }.run-metrics b { display: block; font-size: 20px; line-height: 28px; font-weight: 600; }.run-metrics span { display: block; margin-top: 4px; color: #8a8e99; font-size: 12px; }.primary { min-height: 44px; padding: 0 16px; border-radius: 8px; background: #ff0a30; color: #fff; font-size: 15px; font-weight: 600; }.record-button { width: 100%; }.manual-note { margin: 8px 0 20px; text-align: center; color: #8a8e99; font-size: 11px; line-height: 18px; }.section-heading h2,.section-heading h3 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }.section-heading > span { color: #8a8e99; font-size: 12px; }.records-heading { margin: 20px 4px 12px; }.records-heading h2 { font-size: 18px; }.run-date { margin: 6px 0 14px; color: #8a8e99; font-size: 12px; line-height: 18px; }.record-data { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }.record-data b { display: block; font-size: 18px; font-weight: 600; line-height: 26px; }.record-data span { display: block; margin-top: 3px; color: #8a8e99; font-size: 11px; }.hint { margin: 10px 0 0; color: #8a8e99; font-size: 12px; line-height: 19px; }.stack { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }.stack label,.field-label { min-width: 0; color: #8a8e99; font-size: 12px; }.stack input,.stack select { width: 100%; min-width: 0; height: 44px; margin-top: 6px; padding: 0 12px; border: 0; border-radius: 8px; background: #f5f6fa; color: #1f2026; font-size: 15px; }.field-pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }.choices { display: flex; gap: 8px; }.choices button { min-width: 62px; min-height: 36px; padding: 0 12px; border-radius: 8px; background: #f0f1f6; color: #1f2026; font-size: 14px; }.choices button.on { color: #ff0a30; background: #fff0f3; }.close-button { min-height: 32px; color: #8a8e99; font-size: 12px; }.stack .file-pick { position: relative; display: grid; place-items: center; min-height: 44px; overflow: hidden; border-radius: 8px; color: #1f2026; background: #f0f1f6; font-size: 13px; }.file-pick input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }.record-editor { margin-top: 16px; padding-top: 12px; border-top: 1px solid #f0f1f5; }.delete-button { min-height: 40px; color: #8a8e99; font-size: 13px; }.shot { display: block; width: 100%; margin-top: 12px; border-radius: 8px; }.guest-state,.empty-state { padding: 28px 20px; text-align: center; }.guest-state h2 { margin: 12px 0 0; font-size: 20px; line-height: 28px; font-weight: 600; }.guest-state p,.empty-state p { margin: 8px 0 20px; color: #8a8e99; font-size: 12px; line-height: 20px; }.guest-state .primary { width: 100%; }.guest-mark { display: grid; place-items: center; width: 56px; height: 56px; margin: auto; border-radius: 50%; background: #fff0f3; color: #ff0a30; font-size: 30px; }.empty-state h3 { margin: 0; font-size: 16px; }.year-note,.loading-copy { margin: 16px 4px; color: #8a8e99; font-size: 12px; line-height: 20px; }.message { margin: 12px 4px; color: #ff0a30; font-size: 12px; line-height: 20px; }
@media(max-width:350px){.surface{padding:14px}.mileage-value strong{font-size:44px}.record-data{gap:8px}.record-data b{font-size:16px}.target-summary p{font-size:11px}.field-pair{gap:8px}}
</style>
