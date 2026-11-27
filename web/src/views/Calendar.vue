<template>
  <main class="calendar">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事日历</h1>
      <button type="button" @click="goToday">回到今天</button>
    </header>
    <section class="calendar-board" aria-label="月度赛事日历">
    <div class="month">
      <button type="button" aria-label="上个月" @click="shift(-1)">‹</button>
      <b>{{ year }}年{{ month }}月</b>
      <button type="button" aria-label="下个月" @click="shift(1)">›</button>
    </div>
    <div class="week">
      <span v-for="name in weeks" :key="name" :class="{ end: name === '日' || name === '六' }">{{ name }}</span>
    </div>
    <div class="grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="cell"
        :class="{ out: !cell.inMonth, today: cell.today, picked: cell.date === picked }"
        :disabled="!cell.inMonth"
        :aria-label="cell.date + (cell.count ? ' ' + cell.count + '场赛事' : '')"
        :aria-pressed="cell.date === picked"
        @click="picked = cell.date"
      >
        <span class="num">{{ cell.today ? "今" : cell.day }}</span>
        <span class="lunar">{{ cell.lunar }}</span>
        <span class="count">{{ cell.count ? cell.count + '场' : '' }}</span>
      </button>
    </div>
    </section>
    <section class="day-races" aria-label="选中日期的赛事">
      <header class="day-heading"><div><h2>{{ pickedTitle }}</h2><span>{{ weekday }}<template v-if="ready"> · {{ dayRaces.length }} 场</template></span></div><button v-if="dayRaces.length" class="poster-btn" type="button" @click="openPoster">生成当天长图</button></header>
      <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
      <p v-else-if="!ready" class="none" role="status">正在加载赛事…</p>
      <div v-for="race in dayRaces" :key="race.id" class="calendar-race-row"><router-link class="race" :to="'/races/' + race.id">
        <b>{{ race.name }}</b>
        <span>{{ [race.city || race.province, race.distanceLabels?.join(' / ')].filter(Boolean).join(' · ') }}</span>
        <em>{{ race.regStatus }}</em>
        <small v-if="race.myStatus" class="my-status">我的状态 · {{ race.myStatus }}</small>
      </router-link><FollowRaceButton :race-id="race.id" :race-name="race.name" :following="!!race.following" @change="value => race.following = value" /></div>
      <p v-if="ready && !loadError && !dayRaces.length" class="none">这一天没有赛事</p>
    </section>
    <div v-if="posterUrl" class="poster-layer" @click="closePoster">
      <div class="poster-scroll">
        <img :src="posterUrl" alt="当天赛事长图" @click.stop />
      </div>
      <p class="poster-hint">长按图片可以保存</p>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { lunarLabel } from "../lunar";
import { renderDayPoster } from "../day-poster";
import FollowRaceButton from '../components/FollowRaceButton.vue';

const weeks = ["日", "一", "二", "三", "四", "五", "六"];
const today = cstParts();
const year = ref(today.y);
const month = ref(today.m);
const picked = ref(iso(today));
const races = ref([]);
const ready = ref(false);
const loadError = ref("");
let loadSeq = 0;
const posterUrl = ref("");

const cells = computed(() => {
  const first = new Date(Date.UTC(year.value, month.value - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const counts = {};
  for (const race of races.value) counts[race.raceDate] = (counts[race.raceDate] || 0) + 1;
  const todayIso = iso(cstParts());
  const rows = [];
  for (let i = 0; i < 42; i += 1) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth() + 1;
    const d = cur.getUTCDate();
    const date = iso({ y, m, d });
    const inMonth = y === year.value && m === month.value;
    rows.push({
      date,
      day: d,
      inMonth,
      today: date === todayIso,
      lunar: lunarLabel(y, m, d),
      count: inMonth ? counts[date] || 0 : 0
    });
  }
  return rows;
});

const dayRaces = computed(() => ready.value ? races.value.filter((race) => race.raceDate === picked.value) : []);
const weekday = computed(() => ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][new Date(picked.value + "T00:00:00Z").getUTCDay()]);
const pickedTitle = computed(() => {
  const [, m, d] = picked.value.split("-");
  return Number(m) + "月" + Number(d) + "日";
});

function cstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function iso(parts) {
  return parts.y + "-" + String(parts.m).padStart(2, "0") + "-" + String(parts.d).padStart(2, "0");
}

function monthKey() {
  return year.value + "-" + String(month.value).padStart(2, "0");
}

async function load() {
  const key = monthKey();
  const seq = ++loadSeq;
  ready.value = false;
  races.value = [];
  loadError.value = "";
  try {
    const data = await api("/races?status=all&month=" + key);
    if (seq !== loadSeq || key !== monthKey()) return;
    races.value = data.races || [];
    ready.value = true;
  } catch (err) {
    if (seq !== loadSeq) return;
    loadError.value = err.message || "赛事加载失败";
  }
}

function pickedParts() {
  const [y, m, d] = picked.value.split("-").map(Number);
  return { y, m, d };
}

function openPoster() {
  if (!dayRaces.value.length) return;
  const parts = pickedParts();
  const canvas = document.createElement("canvas");
  renderDayPoster(canvas, {
    date: picked.value,
    lunar: lunarLabel(parts.y, parts.m, parts.d),
    races: dayRaces.value
  });
  posterUrl.value = canvas.toDataURL("image/png");
}

function closePoster() {
  posterUrl.value = "";
}

function shift(delta) {
  const next = new Date(Date.UTC(year.value, month.value - 1 + delta, 1));
  year.value = next.getUTCFullYear();
  month.value = next.getUTCMonth() + 1;
  const now = cstParts();
  picked.value = now.y === year.value && now.m === month.value ? iso(now) : iso({ y: year.value, m: month.value, d: 1 });
  load();
}

function goToday() {
  const now = cstParts();
  const sameMonth = year.value === now.y && month.value === now.m;
  picked.value = iso(now);
  if (sameMonth && !loadError.value) return;
  year.value = now.y;
  month.value = now.m;
  load();
}

onMounted(load);
</script>

<style scoped>
.calendar{--purple:#55388c;--wash:#f3eefc;--muted:#62586f;min-height:100vh;padding:0 0 24px;background:#f7f6fa;color:#22202a}
.calendar .topbar{position:relative;z-index:auto;display:grid;grid-template-columns:58px 1fr auto;align-items:start;min-height:104px;padding:10px 14px 30px;background:linear-gradient(112deg,#e8def9,#dcd0f3 52%,#f8f5fc);color:#22202a}
.calendar .topbar h1{align-self:center;margin:0;color:inherit;font-size:20px;text-align:center}
.calendar .topbar a,.topbar button{min-width:44px;min-height:44px;color:inherit}.topbar button{border-radius:22px;padding:0 10px;background:#ffffffb3;color:var(--purple);font-size:13px}
.calendar-board,.day-races{position:relative;margin:0 16px;background:#fff;border-radius:20px;box-shadow:0 4px 18px #3624510b}
.calendar-board{z-index:1;margin-top:-24px;padding:4px 4px 8px}.month{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 9px}.month b{font-size:19px;font-weight:650}.month button{min-width:44px;min-height:44px;font-size:24px;color:var(--purple)}
.week,.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;padding:0;text-align:center}.week{padding:8px 0;color:var(--muted);font-size:12px}.week .end{color:var(--purple)}
.cell{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;min-height:54px;padding:3px 0;border-radius:10px}.num{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;font-size:15px}.out .num,.out .lunar{color:#94919a}.today .num{font-weight:650;color:var(--purple)}.picked{background:var(--wash)}.picked .num{background:var(--purple);color:#fff}.lunar,.count{min-height:12px;color:var(--muted);font-size:11px;line-height:1.2;white-space:nowrap}.count{color:var(--purple);font-weight:600}
.day-races{margin-top:12px;padding:12px}.day-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 8px}.day-heading h2{margin:0;font-size:20px;line-height:1.35}.day-heading span{color:var(--muted);font-size:13px}.poster-btn,.load-error button{flex:none;min-height:44px;padding:0 10px;border-radius:22px;background:var(--wash);color:var(--purple);font-size:13px}
.calendar-race-row{display:flex;gap:6px;align-items:center;min-width:0;padding:4px 0;border-top:1px solid #efecf2}.calendar-race-row>.race{flex:1;min-width:0;min-height:44px;padding:8px 4px;overflow-wrap:anywhere}.race b{display:block;font-size:15px;font-weight:650;line-height:1.5}.race span,.race em,.my-status{display:block;color:var(--muted);font-size:12px;line-height:1.6;font-style:normal}.race em,.my-status{color:var(--purple)}.none{padding:16px 0;text-align:center;color:var(--muted);font-size:14px}.load-error{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;color:var(--muted);font-size:14px}
.calendar button:focus-visible{outline:2px solid #8469bb;outline-offset:-2px}
@media(max-width:375px){.calendar-board{margin-inline:4px;padding-inline:2px}}
.poster-layer{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;background:rgba(0,0,0,.56)}.poster-scroll{flex:1;overflow:auto;padding:16px 22px 8px}.poster-scroll img{display:block;width:100%;height:auto;border-radius:12px}.poster-hint{margin:0;padding:8px 0 calc(16px + env(safe-area-inset-bottom,0px));text-align:center;color:#fff;font-size:12px}
</style>
