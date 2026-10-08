<template>
  <div class="mine-top">
    <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    <div class="tools">
      <svg viewBox="0 0 24 24"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
      <svg viewBox="0 0 24 24"><path d="M5 6h14v10H8l-3 3V6z" /></svg>
      <svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 13v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" /><path d="M12 18v2" /></svg>
    </div>
  </div>
  <section class="profile">
    <div class="avatar">{{ initial }}</div>
    <div>
      <div class="nick">{{ nickname || "未设置昵称" }}</div>
      <form v-if="!nickname" class="nick-form" @submit.prevent="enter">
        <input v-model="draft" placeholder="怎么称呼你" />
        <button type="submit">进入</button>
      </form>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
  </section>
  <div class="rounds">
    <a href="#plans">
      <div class="bubble"><svg viewBox="0 0 24 24"><path d="M6 7h12v12H6z" /><path d="M9 7V5h6v2M9 12h6M9 15h4" /></svg></div>
      订单
    </a>
    <router-link to="/?kind=offline">
      <div class="bubble"><svg viewBox="0 0 24 24"><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2" /></svg></div>
      线下赛
    </router-link>
    <router-link to="/?kind=online">
      <div class="bubble"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg></div>
      线上赛
    </router-link>
    <router-link to="/">
      <div class="bubble"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M20 20l-3.5-3.5" /></svg></div>
      报名查询
    </router-link>
    <a href="#wall">
      <div class="bubble"><svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg></div>
      我的成绩
    </a>
  </div>
  <div id="wall" class="wall-tabs">
    <button type="button" :class="{ on: tab === 'honor' }" @click="tab = 'honor'">荣誉墙</button>
    <button type="button" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">影像墙</button>
    <button type="button" :class="{ on: tab === 'time' }" @click="tab = 'time'">时光轴</button>
  </div>
  <div class="wall">
    <template v-if="tab === 'honor'">
      <router-link v-for="item in plans" :key="item.race.id" class="honor" :to="'/races/' + item.race.id">
        <Poster :id="item.race.id" />
        <div class="copy">
          <p>{{ item.race.name }}</p>
          <div class="tags"><span>{{ item.status }}</span></div>
          <div class="foot"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
        </div>
      </router-link>
      <p v-if="!plans.length" class="empty">还没有标过的比赛。去赛历里标一场，会出现在这里。</p>
    </template>
    <p v-else-if="tab === 'photo'" class="empty">还没有影像</p>
    <div v-else class="timeline">
      <div v-for="item in plans" :key="item.race.id" class="tl">
        <i></i>
        <router-link :to="'/races/' + item.race.id">
          <b>{{ item.race.raceDate }}</b>
          <div>{{ item.race.name }}</div>
          <div class="sub">{{ item.status }}</div>
        </router-link>
      </div>
      <p v-if="!plans.length" class="empty">时光轴会按比赛日排好你标过的场次</p>
    </div>
  </div>
  <div class="banner">
    <div>
      <b>赛历提醒</b>
      <span>报名截止还剩几天，卡片右侧直接写出来</span>
    </div>
  </div>
  <section class="panel">
    <h3>运动统计</h3>
    <div class="bars">
      <div v-for="n in 7" :key="n" :style="{ height: '8px' }"></div>
    </div>
    <div class="weekdays"><span v-for="day in days" :key="day">{{ day }}</span></div>
  </section>
  <section class="panel">
    <h3>数据中心</h3>
    <div class="stats3">
      <div><b>0.00</b><span>本周里程</span></div>
      <div><b>--</b><span>本周配速</span></div>
      <div><b>0.00</b><span>累计里程</span></div>
    </div>
  </section>
  <section id="plans" class="panel">
    <h3>路跑赛事</h3>
    <div class="race-stat">
      <div><b>0</b><span>完赛场数</span></div>
      <div><b>--</b><span>半程最好</span></div>
      <div><b>--</b><span>全程最好</span></div>
      <div><b>{{ cities }}</b><span>足迹</span></div>
    </div>
  </section>
  <footer class="legal">{{ company }}<br />{{ icp }}</footer>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import Poster from "../components/Poster.vue";

const nickname = ref(localStorage.getItem("marathon_name") || "");
const draft = ref("");
const plans = ref([]);
const message = ref("");
const tab = ref("honor");
const company = ref("北京华创科技有限公司");
const icp = ref("京ICP备2026060284号-2");
const days = ["一", "二", "三", "四", "五", "六", "日"];
const initial = computed(() => (nickname.value || "我").slice(0, 1));
const cities = computed(() => new Set(plans.value.map((item) => item.race.city)).size);

async function load() {
  const meta = await api("/meta");
  company.value = meta.company;
  icp.value = meta.icp;
  if (!localStorage.getItem("marathon_token")) return;
  const data = await api("/me");
  nickname.value = data.user.nickname;
  plans.value = data.plans;
}

async function enter() {
  message.value = "";
  try {
    const data = await api("/session", { method: "POST", body: JSON.stringify({ nickname: draft.value }) });
    localStorage.setItem("marathon_token", data.token);
    localStorage.setItem("marathon_name", data.user.nickname);
    nickname.value = data.user.nickname;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>

<style scoped>
.honor :deep(.poster) { height: 72px; border-radius: 6px; }
</style>
