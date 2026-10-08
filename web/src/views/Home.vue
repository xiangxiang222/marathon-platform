<template>
  <header class="top">
    <form class="search" @submit.prevent="load">
      <span>⌕</span>
      <input v-model="q" placeholder="搜比赛、城市" />
      <button type="submit">搜索</button>
    </form>
  </header>
  <div class="filters">
    <select class="chip" v-model="city" @change="load">
      <option value="">比赛地点</option>
      <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
    </select>
    <select class="chip" v-model="month" @change="load">
      <option value="">比赛时间</option>
      <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
    </select>
    <button class="chip" :class="{ on: distance === 'full' }" @click="toggle('full')">马拉松</button>
    <button class="chip" :class="{ on: distance === 'half' }" @click="toggle('half')">半程马拉松</button>
  </div>
  <div v-if="soon.length" class="banner">临近截止：{{ soon.map((r) => r.name.replace(/^20\d\d/, "")).join("、") }}</div>
  <main class="page">
    <div v-if="error" class="empty">{{ error }}</div>
    <div v-else-if="!races.length" class="empty">这组条件下没有还在报名的比赛</div>
    <div v-else class="grid">
      <router-link v-for="race in races" :key="race.id" :to="'/races/' + race.id" class="card">
        <div class="poster" :style="{ background: poster(race.id) }">{{ race.city }}</div>
        <div class="card-body">
          <div class="reg" :class="{ off: !race.open }">{{ race.regStatus }}</div>
          <div class="title">{{ race.name }}</div>
          <div class="tags">
            <span v-for="label in race.distanceLabels" :key="label" class="tag">{{ label }}</span>
          </div>
          <div class="meta">
            <span>{{ race.raceDate }}</span>
            <span :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</span>
          </div>
        </div>
      </router-link>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";

const q = ref("");
const city = ref("");
const month = ref("");
const distance = ref("");
const races = ref([]);
const cities = ref([]);
const months = ref([]);
const error = ref("");
const soon = computed(() => races.value.filter((r) => r.open && r.daysLeft <= 3));

function poster(id) {
  const hues = { "caa-10k": 262, chaoyang: 198, tmsk: 18, bishan: 152, songshanhu: 210, yuxi: 230, jinjiang: 330, hailing: 188, huangyaguan: 28 };
  const h = hues[id] ?? 174;
  return `linear-gradient(145deg, hsl(${h} 70% 46%), hsl(${(h + 28) % 360} 75% 38%))`;
}

function toggle(value) {
  distance.value = distance.value === value ? "" : value;
  load();
}

async function load() {
  error.value = "";
  const params = new URLSearchParams();
  if (q.value) params.set("q", q.value);
  if (city.value) params.set("city", city.value);
  if (month.value) params.set("month", month.value);
  if (distance.value) params.set("distance", distance.value);
  try {
    const data = await api("/races?" + params.toString());
    races.value = data.races;
    cities.value = data.cities;
    months.value = data.months;
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>
