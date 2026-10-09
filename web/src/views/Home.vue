<template>
  <header class="teal">
    <form class="search" @submit.prevent="load">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input v-model="q" placeholder="搜索赛事名称" />
      <i class="split"></i>
      <button type="submit">搜索</button>
    </form>
    <div class="quick4">
      <button type="button" @click="setKind('road')">
        <span class="ico"><svg viewBox="0 0 24 24"><path d="M13 4a2 2 0 1 1-1.2 3.6L8 14l-2 6M11 11l4 1 2 6M14 12l3-2" /></svg></span>
        路跑赛事
      </button>
      <button type="button" @click="setKind('online')">
        <span class="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" /><path d="M12 8v4l3 2" /></svg></span>
        线上赛
      </button>
      <button type="button" @click="setKind('offline')">
        <span class="ico"><svg viewBox="0 0 24 24"><path d="M6 20V5h8l-1.5 3L14 11H6" /></svg></span>
        线下赛
      </button>
      <button type="button" @click="setKind('trail')">
        <span class="ico"><svg viewBox="0 0 24 24"><path d="M3 18l5-7 4 4 3-5 6 8" /></svg></span>
        越野赛事
      </button>
    </div>
  </header>
  <section class="sheet">
    <div class="cats">
      <button v-for="item in cats" :key="item.label" type="button" @click="item.run()">
        <span class="swatch" :class="item.tone" v-html="item.icon"></span>
        {{ item.label }}
      </button>
    </div>
    <router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind" :to="'/races/' + item.race.id">
      <b>{{ item.hit.reason }}</b>
      <span>{{ item.race.name }}</span>
    </router-link>
    <div class="banner">
      <div>
        <b>{{ soonest ? soonest.name : "跑团赛历" }}</b>
        <span>{{ soonest ? soonest.raceDate + " · " + soonest.deadlineLabel : "截止日期写在每张卡片上" }}</span>
      </div>
      <div class="dots"><i class="on"></i><i></i><i></i></div>
    </div>
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
            <button type="button" class="ghost" @click="draftStatus = 'open'">重置</button>
            <button type="button" class="ok" @click="confirmStatus">确认</button>
          </div>
        </div>
      </div>
    <div v-if="races.length" class="grid">
      <router-link v-for="race in races" :key="race.id" class="card" :to="'/races/' + race.id">
        <Poster :id="race.id" />
        <div class="copy">
          <p><em>{{ race.regStatus }}</em>{{ race.name }}</p>
          <div class="tags"><span v-for="tag in race.distanceLabels" :key="tag">{{ tag }}</span></div>
          <div class="foot">
            <span class="cal">
              <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              {{ race.raceDate }}
            </span>
            <span :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
          </div>
        </div>
      </router-link>
    </div>
    <p v-else class="empty">这个分类还没有赛历</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import Poster from "../components/Poster.vue";

const route = useRoute();
const q = ref("");
const city = ref("");
const month = ref("");
const full = ref(false);
const half = ref(false);
const ten = ref(false);
const kind = ref("road");
const status = ref("open");
const draftStatus = ref("open");
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
  { label: "未开始", value: "soon" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未公布", value: "unannounced" }
];

const icon = (path) => `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
const cats = [
  { label: "马拉松", tone: "full", icon: icon("M14 5.2a1.4 1.4 0 1 1-2.4 1.4M7 19.5l3-5 2 1.2 1.4-3 3.2 2.2M9 10.5l2.2-2.2 2.4 1.2"), run: () => setDistance("full") },
  { label: "半程", tone: "half", icon: icon("M5 16c2-6 5-9 7-9s5 3 7 9M8 16h8"), run: () => setDistance("half") },
  { label: "10公里", tone: "ten", icon: `<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle">10</text></svg>`, run: () => setDistance("10k") },
  { label: "越野", tone: "trail", icon: icon("M3 18l5-7 4 4 3-5 6 8H3"), run: () => setKind("trail") },
  { label: "线上赛", tone: "online", icon: icon("M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3v4l2.5 1.5"), run: () => setKind("online") },
  { label: "线下赛", tone: "offline", icon: icon("M6 20V5h8l-1.6 3.2L14 11.5H6"), run: () => setKind("offline") },
  { label: "亲子", tone: "family", icon: icon("M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 1a2.2 2.2 0 1 0 0-4.4A2.2 2.2 0 0 0 16 11zM4 19c.6-2.4 2.2-3.6 4-3.6s3.4 1.2 4 3.6M12 19c.5-2 1.8-3 3.4-3S18.4 17 19 19"), run: () => setKind("family") },
  { label: "铁三", tone: "tri", icon: icon("M5 17l4-8 3 4 2-3 5 7H5"), run: () => setKind("tri") }
];
const soonest = computed(() => races.value.find((race) => race.open) || null);

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

function setDistance(which) {
  full.value = which === "full";
  half.value = which === "half";
  ten.value = which === "10k";
  kind.value = "road";
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
