<template>
  <main class="calendar">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事日历</h1>
      <span></span>
    </header>
    <section class="calendar-board" aria-label="月度赛事日历">
    <div class="month">
      <button type="button" aria-label="上个月" @click="shift(-1)">‹</button>
      <b>{{ year }}年{{ month }}月</b>
      <button type="button" aria-label="下个月" @click="shift(1)">›</button>
    </div>
    <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
    <p v-else-if="!ready" class="none">正在加载赛事…</p>
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
        @click="picked = cell.date"
      >
        <span class="num">{{ cell.today ? "今" : cell.day }}</span>
        <span class="lunar">{{ cell.lunar }}</span>
        <span class="count">{{ cell.count || "" }}</span>
      </button>
    </div>
    </section>
    <button v-if="ready && dayRaces.length" class="poster-btn" type="button" @click="openPoster">
      <span class="poster-day">{{ dayNum }}</span>
      <span class="poster-copy">
        <b>生成当天长图</b>
        <small>{{ weekday }} · {{ dayRaces.length }} 场</small>
      </span>
      <span class="poster-go" aria-hidden="true">›</span>
    </button>
    <section class="day-races">
      <h2>{{ pickedTitle }}</h2>
      <router-link v-for="race in dayRaces" :key="race.id" class="race" :to="'/races/' + race.id">
        <b>{{ race.name }}</b>
        <span>{{ race.city }}{{ race.distanceLabels.length ? " · " + race.distanceLabels.join(" / ") : "" }}</span>
        <em>{{ race.regStatus }}</em>
      </router-link>
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

const dayRaces = computed(() => races.value.filter((race) => race.raceDate === picked.value));
const dayNum = computed(() => String(Number(picked.value.slice(8))));
const weekday = computed(() => ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][new Date(picked.value + "T00:00:00Z").getUTCDay()]);
const pickedTitle = computed(() => {
  const [, m, d] = picked.value.split("-");
  const count = dayRaces.value.length;
  return Number(m) + "月" + Number(d) + "日" + (ready.value ? " · " + count + "场" : "");
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

onMounted(load);
</script>

<style scoped>
.calendar{min-height:100vh;padding-bottom:24px;background:var(--bg);color:var(--ink)}
.topbar{background:#fff}.topbar h1{font-size:16px;font-weight:600}.calendar-board{margin:12px 16px;background:#fff;border-radius:12px;overflow:hidden}
.month{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 12px}.month b{font-size:18px;font-weight:600}.month button{display:grid;place-items:center;width:44px;height:44px;font-size:24px;color:var(--ink)}
.week,.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));margin:0;padding:0 4px}.week{padding-top:8px;padding-bottom:8px;text-align:center;color:var(--muted);font-size:12px}.week .end{color:var(--accent)}.grid{padding-bottom:12px}
.cell{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;min-height:70px;padding:4px 0 2px;border-radius:6px}.cell:disabled{cursor:default}.num{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:15px;font-weight:500}.out .num,.out .lunar{color:#b0b0b0}.today .num{color:var(--accent);font-weight:600}.picked{background:var(--accent-soft)}.picked .num{background:var(--accent);color:#fff}.lunar,.count{min-height:14px;font-size:12px;line-height:1.2;white-space:nowrap}.lunar{color:var(--muted)}.count{color:var(--accent)}
.day-races{padding:4px 16px 16px}.day-races h2{margin:12px 0;font-size:18px;font-weight:600}.race{display:block;margin-top:8px;padding:14px;border-radius:12px;background:#fff}.race b{display:block;font-size:15px;font-weight:600;line-height:1.5}.race span,.race em{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.6;font-style:normal}.race em{color:var(--accent)}.none{padding:24px 0;text-align:center;color:var(--muted);font-size:14px}.load-error{margin:12px 16px;font-size:14px}.load-error button{min-height:44px;margin-left:8px;color:var(--accent)}
.poster-btn{display:flex;align-items:center;gap:12px;width:calc(100% - 32px);margin:12px 16px 0;padding:12px 14px;border-radius:12px;background:#fff;text-align:left}.poster-day{min-width:36px;color:var(--accent);font-size:28px;font-weight:600;line-height:1.2}.poster-copy{flex:1;min-width:0}.poster-copy b{display:block;font-size:15px;font-weight:500}.poster-copy small{display:block;margin-top:4px;color:var(--muted);font-size:12px}.poster-go{font-size:22px;color:var(--muted)}
.poster-layer{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;background:rgba(0,0,0,.56)}.poster-scroll{flex:1;overflow:auto;padding:16px 22px 8px}.poster-scroll img{display:block;width:100%;height:auto;border-radius:12px}.poster-hint{margin:0;padding:8px 0 calc(16px + env(safe-area-inset-bottom,0px));text-align:center;color:#fff;font-size:12px}
</style>
