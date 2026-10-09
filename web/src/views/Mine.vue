<template>
  <div class="mine">
    <div class="chrome">
      <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h12M4 17h16" /></svg>
      <div class="tools">
        <svg viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>
        <svg viewBox="0 0 24 24"><path d="M5 6h14v10H8l-3 3V6z" /></svg>
        <svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 13v4a2 2 0 0 0 2 2h1v-6H4" /></svg>
      </div>
    </div>

    <section v-if="conflicts.length" class="sheet warn">
      <div class="head"><h3>全马间隔</h3></div>
      <p v-for="item in conflicts" :key="item.text">{{ item.text }}</p>
    </section>
    <section v-if="reminders.length" class="sheet">
      <div class="head"><h3>截止提醒</h3></div>
      <router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind-line" :to="'/races/' + item.race.id">
        <b>{{ item.hit.reason }}</b> {{ item.race.name }}
      </router-link>
    </section>

    <section class="who">
      <div class="face" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#d7dbe2" /><circle cx="18" cy="21" r="2" fill="#fff" /><circle cx="30" cy="21" r="2" fill="#fff" /><path d="M17 28c2 2.4 4.2 3.4 7 3.4s5-1 7-3.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" /></svg>
      </div>
      <div class="who-main">
        <div v-if="nickname" class="nick">{{ nickname }}</div>
        <form v-else class="nick-form" @submit.prevent="enter">
          <input v-model="draft" placeholder="怎么称呼你" />
          <button type="submit">进入</button>
        </form>
        <p v-if="message" class="err">{{ message }}</p>
      </div>
      <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
    </section>

    <div class="shortcuts">
      <a href="#road">
        <span class="orb order"><svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h4" /></svg></span>
        我的订单
      </a>
      <router-link to="/?kind=offline">
        <span class="orb flag"><svg viewBox="0 0 24 24"><path d="M7 4v16M7 5h9l-2 3 2 3H7" /></svg></span>
        线下赛
      </router-link>
      <router-link to="/?kind=online">
        <span class="orb cup"><svg viewBox="0 0 24 24"><path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 14v3M9 20h6" /></svg></span>
        线上赛
      </router-link>
      <router-link to="/">
        <span class="orb person"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3" /><path d="M7 19c1.2-3 2.8-4.5 5-4.5s3.8 1.5 5 4.5" /></svg></span>
        报名查询
      </router-link>
      <a href="#wall">
        <span class="orb score"><svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg></span>
        我的成绩
      </a>
    </div>

    <div id="wall" class="walls">
      <button type="button" :class="{ on: tab === 'honor' }" @click="tab = 'honor'">荣誉墙<svg viewBox="0 0 16 16"><path d="M8 1.2l4.2 4.2L8 14.8 3.8 5.4z" /></svg></button>
      <i></i>
      <button type="button" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">影像墙<svg viewBox="0 0 16 16"><path d="M3 4.5h2l1-1.5h4l1 1.5h2v8H3z" /><circle cx="8" cy="8.5" r="2" /></svg></button>
      <i></i>
      <button type="button" :class="{ on: tab === 'time' }" @click="tab = 'time'">时光轴<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2L10.2 10" /></svg></button>
    </div>

    <div class="promo">
      <svg viewBox="0 0 680 168" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="promoBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2a74ff" />
            <stop offset="0.55" stop-color="#3d9bff" />
            <stop offset="1" stop-color="#7fd0ff" />
          </linearGradient>
        </defs>
        <rect width="680" height="168" fill="url(#promoBg)" />
        <path d="M0 96c120-40 220-10 340 20s220 10 340-30v82H0z" fill="#fff" opacity="0.14" />
        <path d="M0 120c140-30 240 10 360 24 90 10 200-8 320-36v60H0z" fill="#fff" opacity="0.1" />
        <text x="28" y="58" fill="#fff" font-size="30" font-weight="700">赛历提醒</text>
        <text x="28" y="88" fill="#fff" font-size="14" opacity="0.92">截止日期写在每张卡片右侧</text>
        <rect x="28" y="108" width="96" height="28" rx="14" fill="rgba(255,255,255,.22)" />
        <text x="46" y="127" fill="#fff" font-size="13">去看看</text>
        <g transform="translate(500,18) rotate(-18)">
          <path d="M8 46c22-2 48-2 62 6 6 3 8 8 4 12-18 4-40 4-58 0-8-2-12-8-8-18z" fill="#111" />
          <path d="M18 40c16-12 36-14 50-6 4 2 6 8 2 10-16 2-34 0-46-6-4-2-6-4-6 2z" fill="#2a2a2c" />
        </g>
        <g transform="translate(430,36) rotate(-8)">
          <path d="M6 44c24-2 52 0 66 8 5 3 6 8 2 11-20 4-44 2-62-2-8-2-12-8-6-17z" fill="#e8fff2" />
          <path d="M16 38c18-12 40-12 54-4 4 3 5 8 1 10-18 1-36-2-48-8-4-2-7-4-7 2z" fill="#fff" />
        </g>
        <g transform="translate(455,62) rotate(6)">
          <path d="M6 40c22-2 48 0 62 8 5 3 6 7 2 10-18 4-40 2-56-2-8-2-12-7-8-16z" fill="#d6ff4a" />
          <path d="M16 34c16-10 36-10 48-3 4 2 5 7 1 9-16 1-32-1-44-7-4-2-6-4-5 1z" fill="#f3ff9a" />
        </g>
      </svg>
    </div>

    <section class="sheet week">
      <div class="head">
        <h3>运动统计 <span>查看 ›</span></h3>
        <span class="link">查看周报 ›</span>
      </div>
      <div class="week-grid">
        <div>
          <div class="label">本周运动（分钟）</div>
          <div class="big">0</div>
          <div class="metrics">
            <div><b>0.00</b><span>跑步(公里)</span></div>
            <div><b>0.00</b><span>骑行(公里)</span></div>
            <div><b>0</b><span>消耗(kcal)</span></div>
          </div>
        </div>
        <div class="chart">
          <div class="cols"><i v-for="n in 7" :key="n"></i></div>
          <div class="days"><span v-for="day in days" :key="day">{{ day }}</span></div>
        </div>
      </div>
    </section>

    <section class="sheet">
      <div class="head"><h3>数据中心</h3><span class="link">查看 ›</span></div>
      <div class="center">
        <div><b>0.00</b><span>当月运动(公里)</span></div>
        <div><b>0</b><span>运动时长(分钟)</span></div>
        <div><b>0.00</b><span>累计运动(公里)</span></div>
      </div>
    </section>

    <section id="road" class="sheet">
      <div class="head"><h3>路跑赛事</h3><router-link class="link" to="/">查看 ›</router-link></div>
      <div class="pair">
        <div>
          <span class="medal"><svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="5" /><path d="M9 4l3 6 3-6" /></svg></span>
          <div class="k">完赛场数</div>
          <div class="v">{{ finished }}<small> 场</small></div>
        </div>
        <div>
          <span class="medal bib"><svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="14" rx="2" /><path d="M9 8h6M12 17v4" /></svg></span>
          <div class="k">最好成绩</div>
          <div class="line"><span>半程</span><b>--</b></div>
          <div class="line"><span>全程</span><b>--</b></div>
        </div>
      </div>
    </section>
    <div v-if="tab === 'honor' && plans.length" class="marks">
      <router-link v-for="item in plans" :key="item.race.id" :to="'/races/' + item.race.id">
        <b>{{ item.status }}</b>{{ item.race.name }}
      </router-link>
    </div>
    <p v-else-if="tab === 'photo'" class="quiet">还没有影像</p>
    <div v-else-if="tab === 'time'" class="marks">
      <router-link v-for="item in plans" :key="item.race.id" :to="'/races/' + item.race.id">{{ item.race.raceDate }} {{ item.race.name }}</router-link>
      <p v-if="!plans.length" class="quiet">还没有标记</p>
    </div>
    <footer class="legal">{{ company }} · {{ icp }}</footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";

const nickname = ref(localStorage.getItem("marathon_name") || "");
const draft = ref("");
const plans = ref([]);
const conflicts = ref([]);
const reminders = ref([]);
const finished = computed(() => plans.value.filter((item) => item.status === "完赛").length);
const message = ref("");
const tab = ref("honor");
const company = ref("北京华创科技有限公司");
const icp = ref("京ICP备2026060284号-2");
const days = ["一", "二", "三", "四", "五", "六", "日"];

async function load() {
  const meta = await api("/meta");
  company.value = meta.company;
  icp.value = meta.icp;
  if (!localStorage.getItem("marathon_token")) return;
  const data = await api("/me");
  nickname.value = data.user.nickname;
  plans.value = data.plans;
  conflicts.value = data.conflicts || [];
  reminders.value = data.reminders || [];
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
.mine { background: #fff; color: #222; padding-bottom: 8px; }
.chrome, .tools { display: flex; align-items: center; }
.chrome { justify-content: space-between; padding: 10px 16px 0; }
.tools { gap: 18px; }
.chrome svg, .chev { width: 22px; height: 22px; stroke: #222; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.who { display: flex; align-items: center; gap: 12px; padding: 14px 16px 6px; }
.face { width: 58px; height: 58px; flex: none; }
.face svg { width: 58px; height: 58px; display: block; }
.who-main { flex: 1; min-width: 0; }
.nick { font-size: 18px; font-weight: 650; }
.chev { margin-left: auto; stroke: #c5cad1; }
.nick-form { display: flex; gap: 8px; }
.nick-form input { height: 32px; border: 1px solid #e6e8ec; border-radius: 16px; padding: 0 12px; width: 140px; outline: none; }
.nick-form button { height: 32px; padding: 0 12px; border-radius: 16px; background: #2ad4cf; color: #fff; }
.err { color: #e35d5d; font-size: 12px; margin: 4px 0 0; }
.shortcuts { display: flex; justify-content: space-between; padding: 16px 10px 8px; }
.shortcuts a { width: 64px; text-align: center; font-size: 12px; color: #333; }
.orb { width: 48px; height: 48px; margin: 0 auto 6px; border-radius: 50%; display: grid; place-items: center; }
.orb svg { width: 22px; height: 22px; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.order { background: #e7f1ff; } .order svg { stroke: #5b8def; }
.flag { background: #ffe8ea; } .flag svg { stroke: #ff5a6a; fill: #ff5a6a; }
.cup { background: #e5f8ea; } .cup svg { stroke: #3dbe6e; }
.person { background: #fff1e4; } .person svg { stroke: #ff9a3c; }
.score { background: #eee8ff; } .score svg { stroke: #8b7cf7; }
.walls { display: flex; align-items: center; justify-content: space-around; margin: 8px 8px 0; padding: 4px 0 8px; }
.walls button { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; color: #222; font-weight: 650; }
.walls svg { width: 14px; height: 14px; }
.walls button:nth-child(1) svg { fill: #7c6cf0; stroke: none; }
.walls button:nth-child(3) svg { fill: none; stroke: #ff8a3d; stroke-width: 1.4; }
.walls button:nth-child(5) svg { fill: none; stroke: #5b8def; stroke-width: 1.4; }
.walls i { width: 1px; height: 14px; background: #e6e8ec; }
.marks { padding: 0 16px 8px; }
.marks a { display: block; font-size: 13px; padding: 6px 0; color: #333; }
.marks b { color: #14b8b3; font-weight: 650; margin-right: 6px; }
.quiet { text-align: center; color: #8d949c; font-size: 13px; margin: 0 0 8px; }
.promo { margin: 8px 12px 12px; border-radius: 12px; overflow: hidden; height: 92px; }
.promo svg { width: 100%; height: 92px; display: block; }
.promo text { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
.sheet { margin: 0 12px 12px; background: #f7f8fa; border-radius: 12px; padding: 12px 12px 14px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.head h3 span, .link { color: #8d949c; font-size: 13px; font-weight: 400; }
.week-grid { display: grid; grid-template-columns: minmax(0, 1fr) 118px; gap: 10px; align-items: end; margin-top: 8px; }
.label { color: #8d949c; font-size: 12px; }
.big { font-size: 36px; font-weight: 650; line-height: 1.05; margin: 4px 0 8px; }
.metrics { display: flex; justify-content: space-between; gap: 6px; }
.metrics b { display: block; font-size: 15px; }
.metrics span, .center span, .k, .line span { color: #8d949c; font-size: 10px; white-space: nowrap; }
.chart { display: flex; flex-direction: column; justify-content: flex-end; }
.cols { height: 72px; display: flex; align-items: flex-end; justify-content: space-between; }
.cols i { width: 9px; height: 58px; border-radius: 5px; background: #e4e7ec; }
.days { display: flex; justify-content: space-between; margin-top: 4px; color: #b0b6be; font-size: 10px; }
.days span { width: 12px; text-align: center; }
.center { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; padding: 14px 0 4px; }
.center b { display: block; font-size: 26px; font-weight: 650; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.pair > div { position: relative; background: #fff; border-radius: 10px; min-height: 78px; padding: 10px 12px; }
.medal { position: absolute; right: 10px; top: 10px; width: 28px; height: 28px; border-radius: 50%; background: #fff4e5; display: grid; place-items: center; }
.medal svg { width: 16px; height: 16px; fill: none; stroke: #f0a04b; stroke-width: 1.6; }
.bib { background: #eef2ff; }
.bib svg { stroke: #7d8cff; }
.k { font-size: 13px; color: #666; }
.v { margin-top: 8px; font-size: 22px; font-weight: 700; }
.v small { font-size: 13px; font-weight: 500; }
.line { display: flex; justify-content: space-between; margin-top: 6px; font-size: 13px; }
.legal { text-align: center; color: #c5cad1; font-size: 11px; padding: 4px 12px 8px; }
.warn p, .remind-line { margin: 8px 0 0; font-size: 13px; line-height: 1.45; }
.warn p { color: #9a5b12; }
.remind-line { display: block; color: #333; }
.remind-line b { color: #9a5b12; margin-right: 6px; }
</style>
