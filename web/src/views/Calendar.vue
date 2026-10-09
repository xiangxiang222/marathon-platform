<template>
  <main class="calendar">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>日历</h1>
      <span></span>
    </header>
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
        :aria-label="cell.date + (cell.count ? ' ' + cell.count + '场' : '')"
        @click="picked = cell.date"
      >
        <span class="num">{{ cell.today ? "今" : cell.day }}</span>
        <span class="lunar">{{ cell.lunar }}</span>
        <span class="count">{{ cell.count ? cell.count + "场" : "" }}</span>
      </button>
    </div>
    <p v-if="phase === 'loading'" class="state">正在读取这个月</p>
    <div v-else-if="phase === 'error'" class="state">
      <p class="err">{{ message }}</p>
      <button class="text-btn" type="button" @click="load">重试</button>
    </div>
    <section v-else class="day-races">
      <h2>{{ pickedTitle }}</h2>
      <router-link v-for="race in dayRaces" :key="race.id" class="race" :to="'/races/' + race.id">
        <b>{{ race.name }}</b>
        <span>{{ race.city }}<template v-if="race.distanceLabels.length"> · {{ race.distanceLabels.join(" / ") }}</template></span>
        <em>{{ race.regStatus }}</em>
      </router-link>
      <p v-if="!dayRaces.length" class="none">这一天没有赛事</p>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { lunarLabel } from "../lunar";

const weeks = ["日", "一", "二", "三", "四", "五", "六"];
const today = cstParts();
const year = ref(today.y);
const month = ref(today.m);
const picked = ref(iso(today));
const races = ref([]);
const phase = ref("loading");
const message = ref("");

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
const pickedTitle = computed(() => {
  const [, m, d] = picked.value.split("-");
  return Number(m) + "月" + Number(d) + "日 · " + dayRaces.value.length + "场";
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
  phase.value = "loading";
  message.value = "";
  try {
    const data = await api("/races?status=all&month=" + key);
    if (key !== monthKey()) return;
    races.value = data.races || [];
    phase.value = "ready";
  } catch (err) {
    if (key !== monthKey()) return;
    phase.value = "error";
    message.value = err.message || "这个月没有读出来";
  }
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
.calendar { background: #fff; min-height: 100vh; color: #1c1c1e; }
.month { display: flex; align-items: center; justify-content: center; gap: 28px; padding: 4px 0 2px; }
.month b { font-size: 16px; font-weight: 600; }
.month button { width: 32px; font-size: 22px; color: #666; }
.week, .grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.week { padding: 8px 4px 2px; text-align: center; font-size: 13px; }
.week .end { color: #e23b3b; }
.grid { padding: 0 2px 8px; }
.cell {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 0 2px;
}
.num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #f3f4f6;
  font-size: 15px;
}
.cell.out .num { background: transparent; color: #c8ccd3; }
.cell.today .num { background: #fff; color: #e23b3b; box-shadow: inset 0 0 0 1.5px #e23b3b; }
.cell.picked:not(.today) .num { background: #e23b3b; color: #fff; }
.lunar, .count { font-size: 10px; line-height: 1.2; min-height: 13px; }
.lunar { color: #b4b8c0; }
.count { color: #e23b3b; }
.day-races { border-top: 8px solid #f6f7f9; padding: 4px 16px 28px; }
.day-races h2 { margin: 14px 0 4px; font-size: 16px; font-weight: 650; }
.race { display: block; padding: 12px 0; border-bottom: 1px solid #f0f1f4; }
.race b { display: block; font-size: 16px; font-weight: 650; line-height: 1.35; }
.race span, .race em { display: block; margin-top: 4px; color: #8b939c; font-size: 12px; font-style: normal; }
.none { color: #8b939c; text-align: center; padding: 28px 0; }
</style>
