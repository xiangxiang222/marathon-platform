<template>
  <header class="topbar">
    <span></span>
    <h1>赛历</h1>
    <router-link to="/calendar" aria-label="日历">历</router-link>
  </header>
  <form class="search" @submit.prevent="load">
    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
    <input v-model="q" placeholder="搜索赛事名称" />
    <button type="submit">搜索</button>
  </form>
  <section class="sheet">
    <router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="post" :to="'/races/' + item.race.id">
      <b>{{ item.hit.reason }}</b>
      <p>{{ item.race.name }}</p>
    </router-link>
    <div class="channels">
      <button v-for="item in channels" :key="item.kind" type="button" :class="{ on: kind === item.kind }" @click="setKind(item.kind)">
        {{ item.label }}
      </button>
    </div>
    <div class="filter-wrap" :class="{ open: sheet }">
      <div class="filter-bar" ref="barEl">
        <button type="button" :class="{ on: city }" @click="openSheet('city')">{{ city || "比赛地点" }} ▾</button>
        <button type="button" :class="{ on: month }" @click="openSheet('time')">{{ monthLabel || "比赛时间" }} ▾</button>
        <button type="button" :class="{ on: full }" @click="toggleDist('full')">马拉松</button>
        <button type="button" :class="{ on: half }" @click="toggleDist('half')">半程马拉松</button>
        <button type="button" :class="{ on: sheet === 'status' }" @click="openSheet('status')">筛选</button>
      </div>
    </div>
    <div v-if="sheet" class="dim" @click="sheet = ''"></div>
    <div v-if="sheet" class="drop" :style="{ top: dropTop + 'px', maxHeight: 'calc(100vh - ' + dropTop + 'px - 12px)' }" @click.stop>
        <div v-if="sheet === 'city'" class="loc">
          <div class="prov">
            <button v-for="item in places" :key="item.name" type="button" :class="{ on: province === item.name }" @click="province = item.name">
              {{ item.name }}
            </button>
          </div>
          <div class="cities">
            <button v-for="name in cityNames" :key="name" type="button" :class="{ on: city === name }" @click="pickCity(name)">{{ name }}</button>
          </div>
        </div>
        <div v-else-if="sheet === 'time'" class="time">
          <button type="button" class="chip" :class="{ on: !month }" @click="clearMonth">不限</button>
          <section v-for="year in years" :key="year">
            <h4>{{ year }}年</h4>
            <div class="months">
              <button v-for="m in 12" :key="year + '-' + m" type="button" :class="{ on: month === ym(year, m) }" @click="pickMonth(year, m)">{{ m }}月</button>
            </div>
          </section>
        </div>
        <div v-else class="status-sheet">
          <h3>赛事状态</h3>
          <div class="pills">
            <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: draftStatus === item.value }" @click="draftStatus = item.value">
              {{ item.label }}
            </button>
          </div>
          <div class="actions">
            <button type="button" class="ghost" @click="draftStatus = 'upcoming'">重置</button>
            <button type="button" class="ok" @click="confirmStatus">确认</button>
          </div>
        </div>
      </div>
    <div v-if="races.length" class="feed">
      <router-link v-for="race in races" :key="race.id" class="post" :to="'/races/' + race.id">
        <b>{{ race.name }}</b>
        <p><em>{{ race.regStatus }}</em>{{ race.city }}<template v-if="race.distanceLabels.length"> · {{ race.distanceLabels.join(" / ") }}</template></p>
        <p>{{ race.raceDate }} · <span :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span></p>
      </router-link>
    </div>
    <p v-else class="empty">这个分类还没有赛历</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";

const route = useRoute();
const q = ref("");
const city = ref("");
const month = ref("");
const full = ref(false);
const half = ref(false);
const ten = ref(false);
const kind = ref("road");
const status = ref("upcoming");
const draftStatus = ref("upcoming");
const sheet = ref("");
const barEl = ref(null);
const dropTop = ref(180);
const races = ref([]);
const reminders = ref([]);
const province = ref("河北");
const years = [2025, 2026, 2027];

const places = [
  { name: "北京", cities: ["北京"] },
  { name: "天津", cities: ["天津"] },
  { name: "河北", cities: ["石家庄", "唐山", "秦皇岛", "邯郸", "邢台", "保定"] },
  { name: "山西", cities: ["太原", "大同"] },
  { name: "内蒙古", cities: ["呼和浩特", "包头"] },
  { name: "辽宁", cities: ["沈阳", "大连"] },
  { name: "吉林", cities: ["长春"] },
  { name: "黑龙江", cities: ["哈尔滨"] },
  { name: "上海", cities: ["上海"] },
  { name: "江苏", cities: ["南京", "无锡", "苏州"] },
  { name: "浙江", cities: ["杭州", "宁波"] },
  { name: "安徽", cities: ["合肥", "黄山"] },
  { name: "福建", cities: ["福州", "厦门", "泉州"] },
  { name: "山东", cities: ["济南", "青岛"] },
  { name: "广东", cities: ["广州", "深圳", "东莞", "阳江"] },
  { name: "重庆", cities: ["重庆"] },
  { name: "四川", cities: ["成都"] },
  { name: "云南", cities: ["昆明", "玉溪"] },
  { name: "陕西", cities: ["西安"] },
  { name: "新疆", cities: ["乌鲁木齐", "图木舒克"] }
];

const channels = [
  { label: "路跑赛事", kind: "road" },
  { label: "线上赛", kind: "online" },
  { label: "线下赛", kind: "offline" },
  { label: "越野赛事", kind: "trail" },
  { label: "海外赛事", kind: "overseas" }
];

const statusOptions = [
  { label: "即将开赛", value: "upcoming" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未公布", value: "unannounced" }
];

const cityNames = computed(() => places.find((item) => item.name === province.value)?.cities || []);
const monthLabel = computed(() => (month.value ? month.value.replace("-", "年") + "月" : ""));

function ym(year, m) {
  return year + "-" + String(m).padStart(2, "0");
}

function distanceParam() {
  const picked = [full.value && "full", half.value && "half", ten.value && "10k"].filter(Boolean);
  return picked.length === 1 ? picked[0] : "";
}

async function load() {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set("q", q.value.trim());
  if (city.value) params.set("city", city.value);
  if (month.value) params.set("month", month.value);
  const distance = distanceParam();
  if (distance) params.set("distance", distance);
  if (kind.value && kind.value !== "road") params.set("kind", kind.value);
  if (kind.value === "road") params.set("kind", "road");
  params.set("status", status.value || "all");
  const data = await api("/races?" + params.toString());
  races.value = data.races;
}

function setKind(next) {
  kind.value = next;
  sheet.value = "";
  load();
}

function toggleDist(which) {
  if (which === "full") full.value = !full.value;
  if (which === "half") half.value = !half.value;
  if (full.value || half.value) ten.value = false;
  load();
}

function placeDrop() {
  nextTick(() => {
    if (barEl.value) dropTop.value = Math.round(barEl.value.getBoundingClientRect().bottom);
  });
}

function openSheet(name) {
  sheet.value = sheet.value === name ? "" : name;
  if (sheet.value) placeDrop();
  if (name === "status") draftStatus.value = status.value;
  if (name === "city" && city.value) {
    const found = places.find((item) => item.cities.includes(city.value));
    if (found) province.value = found.name;
  }
}

function pickCity(name) {
  city.value = city.value === name ? "" : name;
  sheet.value = "";
  load();
}

function pickMonth(year, m) {
  const value = ym(year, m);
  month.value = month.value === value ? "" : value;
  sheet.value = "";
  load();
}

function clearMonth() {
  month.value = "";
  sheet.value = "";
  load();
}

function confirmStatus() {
  status.value = draftStatus.value;
  sheet.value = "";
  load();
}

onMounted(() => {
  if (typeof route.query.kind === "string" && route.query.kind) kind.value = route.query.kind;
  load();
  api("/reminders").then((data) => {
    reminders.value = (data.reminders || []).slice(0, 3);
  }).catch(() => {});
});
</script>
