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
      <p v-if="ready && !dayRaces.length" class="none">这一天没有赛事</p>
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
  ready.value = false;
  const data = await api("/races?status=all&month=" + key);
  if (key !== monthKey()) return;
  races.value = data.races || [];
  ready.value = true;
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
.calendar { background: transparent; min-height: 100vh; color: var(--ink); }
.month { display: flex; align-items: center; justify-content: center; gap: 28px; padding: 4px 0 2px; }
.month b { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.month button { width: 36px; height: 36px; border-radius: 50%; background: #fff; font-size: 24px; color: var(--ink); }
.week, .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0; padding: 0; background: #fff; margin: 0 12px; }
.week { border-radius: 12px 12px 0 0; padding: 8px 4px 2px; text-align: center; font-size: 13px; }
.week .end { color: var(--accent); }
.grid { border-radius: 0 0 12px 12px; padding: 0 2px 8px; }
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
  background: var(--bg);
  font-size: calc(15px * var(--s));
  font-weight: 500;
}
.cell.out .num { color: #c8ccd3; }
.cell.out .lunar { color: #e1e4e8; }
.cell.today .num { color: var(--accent); font-weight: 700; }
.cell.today.picked .num { background: var(--accent); color: #fff; }
.cell.picked:not(.today) .num { background: var(--accent); color: #fff; }
.lunar, .count {
  font-size: clamp(8px, calc((100vw - 12px) / 7 / 5.2), 11px);
  line-height: 1.2;
  min-height: 13px;
  overflow: hidden;
  white-space: nowrap;
}
.lunar { color: var(--muted); }
.count { color: var(--accent); font-weight: 600; }
.day-races { padding: 4px 16px 28px; }
.day-races h2 { margin: 14px 4px 4px; font-size: 15px; font-weight: 600; color: var(--muted); }
.race { display: block; margin-top: 8px; padding: 14px 16px; background: #fff; border-radius: 12px; }
.race b { display: block; font-size: 16px; font-weight: 600; line-height: 1.35; }
.race span, .race em { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; font-style: normal; }
.race em { color: var(--accent); font-weight: 600; }
.none { color: var(--muted); text-align: center; padding: 28px 0; }
.poster-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px 14px 18px;
  border-radius: 12px;
  text-align: left;
  color: var(--ink);
  background: #fff;
}
.poster-day { min-width: 44px; font-size: 36px; font-weight: 700; letter-spacing: -1px; line-height: 1; color: var(--accent); }
.poster-copy { flex: 1; min-width: 0; }
.poster-copy b { display: block; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
.poster-copy small { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; }
.poster-go { font-size: 22px; color: var(--muted); }
.poster-layer {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.56);
}
.poster-scroll { flex: 1; overflow: auto; padding: 16px 22px 8px; }
.poster-scroll img { display: block; width: 100%; height: auto; border-radius: 12px; }
.poster-hint { margin: 0; padding: 8px 0 calc(16px + env(safe-area-inset-bottom, 0px)); text-align: center; color: #fff; font-size: 12px; }
</style>
