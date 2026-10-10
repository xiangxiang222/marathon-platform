<template>
  <main class="calendar">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事日历</h1>
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
        :aria-label="cell.date + (cell.count ? ' ' + cell.count + '场赛事' : '')"
        @click="picked = cell.date"
      >
        <span class="num">{{ cell.today ? "今" : cell.day }}</span>
        <span class="lunar">{{ cell.lunar }}</span>
        <span class="count">{{ cell.count || "" }}</span>
      </button>
    </div>
    <section class="day-races">
      <h2>{{ pickedTitle }}</h2>
      <router-link v-for="race in dayRaces" :key="race.id" class="race" :to="'/races/' + race.id">
        <b>{{ race.name }}</b>
        <span>{{ race.city }}{{ race.distanceLabels.length ? " · " + race.distanceLabels.join(" / ") : "" }}</span>
        <em>{{ race.regStatus }}</em>
      </router-link>
      <p v-if="ready && !dayRaces.length" class="none">这一天没有赛事</p>
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
const ready = ref(false);

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
  ready.value = false;
  const data = await api("/races?status=all&month=" + key);
  if (key !== monthKey()) return;
  races.value = data.races || [];
  ready.value = true;
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
.calendar { background: transparent; min-height: 100vh; color: #1c1c1e; }
.month { display: flex; align-items: center; justify-content: center; gap: 28px; padding: 4px 0 2px; }
.month b { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.month button { width: 36px; height: 36px; border-radius: 50%; background: #fff; font-size: 22px; color: #007aff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
.week, .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0; padding: 0; }
.week { padding: 8px 4px 2px; text-align: center; font-size: 13px; }
.week .end { color: #8e8e93; }
.grid { padding: 0 2px 8px; }
.cell {
  min-width: 0;
  min-height: calc(74px * var(--s));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 0 2px;
}
.cell:disabled { cursor: default; }
.num {
  width: calc(28px * var(--s));
  height: calc(28px * var(--s));
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  font-size: calc(15px * var(--s));
  font-weight: 500;
}
.cell.out .num { color: #c8ccd3; }
.cell.out .lunar { color: #e1e4e8; }
.cell.today .num { color: #ff3b30; font-weight: 700; }
.cell.today.picked .num { background: #ff3b30; color: #fff; }
.cell.picked:not(.today) .num { background: #007aff; color: #fff; }
.lunar, .count {
  font-size: clamp(8px, calc((100vw - 12px) / 7 / 5.2), 11px);
  line-height: 1.2;
  min-height: 13px;
  overflow: hidden;
  white-space: nowrap;
}
.lunar { color: #b4b8c0; }
.count { color: #007aff; font-weight: 650; }
.day-races { padding: 4px 16px 28px; }
.day-races h2 { margin: 14px 4px 4px; font-size: 15px; font-weight: 650; color: rgba(60, 60, 67, 0.6); }
.race { display: block; margin-top: 8px; padding: 12px 14px; background: #fff; border-radius: 14px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.race b { display: block; font-size: 16px; font-weight: 650; line-height: 1.35; }
.race span, .race em { display: block; margin-top: 4px; color: #8e949c; font-size: 13px; font-style: normal; }
.race em { color: #007aff; font-weight: 650; }
.none { color: #8e949c; text-align: center; padding: 28px 0; }
</style>
