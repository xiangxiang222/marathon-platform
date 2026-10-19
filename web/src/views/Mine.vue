<template>
  <div class="mine">
    <header class="large">
      <div>
        <h1>我的</h1>
        <p>成绩、提醒和跑过的场</p>
      </div>
    </header>

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

    <section v-if="nickname" class="who">
      <div class="face" aria-hidden="true">{{ nickname.slice(0, 1) }}</div>
      <div class="who-main">
        <div class="nick">{{ nickname }}</div>
        <p v-if="leader" class="role">建团资格</p>
        <router-link v-for="club in clubs" :key="club.id" class="club-line" :to="'/clubs/' + club.id">{{ club.name }} · {{ club.roleLabel }}</router-link>
        <button type="button" class="quit" @click="logout">退出</button>
      </div>
    </section>
    <section v-else class="who auth">
      <div class="modes">
        <button type="button" :class="{ on: authTab === 'login' }" @click="setTab('login')">登录</button>
        <button type="button" :class="{ on: authTab === 'register' }" @click="setTab('register')">注册</button>
      </div>
      <p class="hint">{{ authTab === "login" ? "用昵称和密码。换手机也能回到同一个人。" : "第一次使用就注册。这个昵称以前只出现过一次、还没设密码的话，会设在原来那个人身上。" }}</p>
      <form class="auth-form" @submit.prevent="submitAuth">
        <input v-model="draft" autocomplete="username" placeholder="昵称" />
        <input v-model="password" type="password" :autocomplete="authTab === 'login' ? 'current-password' : 'new-password'" placeholder="密码，至少 8 位" />
        <input v-if="authTab === 'register'" v-model="password2" type="password" autocomplete="new-password" placeholder="再输入一次密码" />
        <template v-if="authTab === 'login'">
          <button type="button" class="captcha" @click="loadCaptcha">
            <img v-if="captchaImage" :src="captchaImage" alt="验证码" />
            <span v-else>{{ captchaLoading ? "加载中…" : "点击获取验证码" }}</span>
          </button>
          <input v-model="captcha" autocomplete="off" maxlength="4" placeholder="上图字符" />
        </template>
        <button class="go" type="submit">{{ authTab === "login" ? "登录" : "注册" }}</button>
      </form>
      <p v-if="message" :class="ok ? 'ok' : 'err'">{{ message }}</p>
    </section>
    <section v-if="nickname" class="sheet">
      <div class="head"><h3>{{ hasPassword ? "改密码" : "设登录密码" }}</h3></div>
      <p class="hint">{{ hasPassword ? "换手机时用昵称和这个密码登录。" : "设一个密码，换手机也能回到这个人。" }}</p>
      <form class="auth-form" @submit.prevent="savePassword">
        <input v-if="hasPassword" v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" />
        <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，至少 8 位" />
        <input v-model="nextPassword2" type="password" autocomplete="new-password" placeholder="再输入一次" />
        <button class="go" type="submit">保存</button>
      </form>
      <p v-if="message" :class="ok ? 'ok' : 'err'">{{ message }}</p>
    </section>

    <div class="shortcuts">
      <router-link to="/">
        <span class="orb order"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg></span>
        赛历
      </router-link>
      <router-link to="/?kind=offline">
        <span class="orb flag"><svg viewBox="0 0 24 24"><path d="M7 4v16M7 5h9l-2 3 2 3H7" /></svg></span>
        线下赛
      </router-link>
      <router-link to="/?kind=online">
        <span class="orb cup"><svg viewBox="0 0 24 24"><path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 14v3M9 20h6" /></svg></span>
        线上赛
      </router-link>
      <router-link to="/look">
        <span class="orb person"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></span>
        报名中
      </router-link>
      <a href="#wall">
        <span class="orb score"><svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="5" /><path d="M9 4l3 6 3-6" /></svg></span>
        成绩
      </a>
    </div>

    <div id="wall" class="walls">
      <button type="button" :class="{ on: tab === 'honor' }" @click="tab = 'honor'">荣誉墙<svg viewBox="0 0 16 16"><path d="M8 1.2l4.2 4.2L8 14.8 3.8 5.4z" /></svg></button>
      <i></i>
      <button type="button" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">影像墙<svg viewBox="0 0 16 16"><path d="M3 4.5h2l1-1.5h4l1 1.5h2v8H3z" /><circle cx="8" cy="8.5" r="2" /></svg></button>
      <i></i>
      <button type="button" :class="{ on: tab === 'time' }" @click="tab = 'time'">时光轴<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2L10.2 10" /></svg></button>
    </div>

    <div v-if="tab === 'honor'" class="career">
      <div v-if="years.length" class="chips">
        <button type="button" :class="{ on: mapYear === '' }" @click="mapYear = ''">全部</button>
        <button v-for="year in years" :key="year" type="button" :class="{ on: mapYear === year }" @click="mapYear = year">{{ year }}</button>
      </div>
      <div v-if="litPlaces.length" class="chips">
        <span v-for="name in litPlaces" :key="name" class="lit">{{ name }}</span>
      </div>
      <div v-if="litCards.length" class="scroll">
        <router-link v-for="item in litCards" :key="item.race.id" :to="'/races/' + item.race.id">
          <b>{{ item.clock }}</b>
          <span>{{ item.race.city }} · {{ item.race.raceDate }}</span>
          {{ item.race.name }}
        </router-link>
      </div>
      <div v-for="group in honorGroups" :key="group.year" class="marks">
        <p class="year">{{ group.year }}</p>
        <router-link v-for="item in group.items" :key="item.race.id" :to="'/races/' + item.race.id">
          <b>{{ item.clock }}</b>{{ item.race.name }}<span v-if="item.pb" class="pb"> PB</span>
        </router-link>
      </div>
      <p v-if="!results.length" class="quiet">在赛事页记下成绩后，会出现在这里</p>
    </div>
    <p v-else-if="tab === 'photo'" class="quiet">还没有影像</p>
    <div v-else-if="tab === 'time'" class="career">
      <div class="chips">
        <button type="button" :class="{ on: kindFilter === 'all' }" @click="kindFilter = 'all'">全部</button>
        <button type="button" :class="{ on: kindFilter === 'road' }" @click="kindFilter = 'road'">路跑</button>
        <button type="button" :class="{ on: kindFilter === 'trail' }" @click="kindFilter = 'trail'">越野</button>
        <button type="button" :class="{ on: kindFilter === 'other' }" @click="kindFilter = 'other'">其他</button>
      </div>
      <div class="marks">
        <router-link v-for="item in timeline" :key="item.race.id" :to="'/races/' + item.race.id">
          <b>{{ item.race.raceDate }}</b>{{ item.race.name }} {{ item.clock }}<span v-if="item.pb" class="pb"> PB</span>
        </router-link>
        <p v-if="!timeline.length" class="quiet">还没有成绩</p>
      </div>
    </div>

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
          <div class="line"><span>半程</span><b>{{ career.pb.half || "--" }}</b></div>
          <div class="line"><span>全程</span><b>{{ career.pb.full || "--" }}</b></div>
        </div>
      </div>
      <p v-if="career.finished" class="footline">足迹 {{ career.provinces.length }} 个省、{{ career.cities.length }} 个市 · 本年比赛 {{ career.yearKm }} 公里</p>
    </section>
    <footer class="legal">{{ company }} · {{ icp }}</footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";

const nickname = ref(localStorage.getItem("marathon_name") || "");
const leader = ref(false);
const clubs = ref([]);
const hasPassword = ref(false);
const authTab = ref("login");
const draft = ref("");
const password = ref("");
const password2 = ref("");
const captcha = ref("");
const captchaToken = ref("");
const captchaImage = ref("");
const captchaLoading = ref(false);
const currentPassword = ref("");
const nextPassword = ref("");
const nextPassword2 = ref("");
const plans = ref([]);
const results = ref([]);
const career = ref({ finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 });
const conflicts = ref([]);
const reminders = ref([]);
const finished = computed(() => career.value.finished);
const message = ref("");
const ok = ref(false);
const tab = ref("honor");
const mapYear = ref("");
const kindFilter = ref("all");
const years = computed(() => {
  const list = [];
  for (const item of results.value) {
    const year = item.race.raceDate.slice(0, 4);
    if (!list.includes(year)) list.push(year);
  }
  return list;
});
const litCards = computed(() =>
  results.value.filter((item) => !mapYear.value || item.race.raceDate.startsWith(mapYear.value))
);
const litPlaces = computed(() => {
  const names = [];
  for (const item of litCards.value) {
    if (!names.includes(item.race.province)) names.push(item.race.province);
    if (item.race.city !== item.race.province && !names.includes(item.race.city)) names.push(item.race.city);
  }
  return names;
});
const honorGroups = computed(() => {
  const map = new Map();
  for (const item of litCards.value) {
    const year = item.race.raceDate.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(item);
  }
  return [...map.entries()].map(([year, items]) => ({ year, items }));
});
const timeline = computed(() =>
  results.value.filter((item) => {
    const kind = item.race.kind || "road";
    if (kindFilter.value === "all") return true;
    if (kindFilter.value === "road") return kind === "road";
    if (kindFilter.value === "trail") return kind === "trail";
    return kind !== "road" && kind !== "trail";
  })
);
const company = ref("北京华创科技有限公司");
const icp = ref("京ICP备2026060284号-2");
async function load() {
  const meta = await api("/meta");
  company.value = meta.company;
  icp.value = meta.icp;
  if (!localStorage.getItem("marathon_token")) {
    await loadCaptcha();
    return;
  }
  try {
    const data = await api("/me");
    nickname.value = data.user.nickname;
    leader.value = Boolean(data.user.leader);
    hasPassword.value = Boolean(data.user.hasPassword);
    clubs.value = data.clubs || [];
    plans.value = data.plans;
    results.value = data.results || [];
    career.value = data.career || career.value;
    conflicts.value = data.conflicts || [];
    reminders.value = data.reminders || [];
    localStorage.setItem("marathon_name", data.user.nickname);
  } catch (err) {
    if (err.status === 401) logout();
    else message.value = err.message;
  }
}

function setTab(next) {
  authTab.value = next;
  message.value = "";
  ok.value = false;
  if (next === "login") loadCaptcha();
}

async function loadCaptcha() {
  captchaLoading.value = true;
  captchaImage.value = "";
  try {
    const data = await api("/auth/captcha?t=" + Date.now());
    captchaToken.value = data.token;
    captchaImage.value = data.image;
    captcha.value = "";
  } catch (err) {
    message.value = err.message;
  } finally {
    captchaLoading.value = false;
  }
}

function saveSession(data) {
  localStorage.setItem("marathon_token", data.token);
  localStorage.setItem("marathon_name", data.user.nickname);
  nickname.value = data.user.nickname;
  password.value = "";
  password2.value = "";
  captcha.value = "";
  message.value = "";
}

function logout() {
  localStorage.removeItem("marathon_token");
  localStorage.removeItem("marathon_name");
  nickname.value = "";
  leader.value = false;
  hasPassword.value = false;
  clubs.value = [];
  plans.value = [];
  results.value = [];
  conflicts.value = [];
  reminders.value = [];
  currentPassword.value = "";
  nextPassword.value = "";
  nextPassword2.value = "";
  message.value = "";
  ok.value = false;
  authTab.value = "login";
  loadCaptcha();
}

async function submitAuth() {
  message.value = "";
  ok.value = false;
  if (authTab.value === "register" && password.value !== password2.value) {
    message.value = "两次密码不一致";
    return;
  }
  try {
    const path = authTab.value === "login" ? "/auth/login" : "/auth/register";
    const body = { nickname: draft.value, password: password.value };
    if (authTab.value === "login") {
      body.captchaToken = captchaToken.value;
      body.captcha = captcha.value;
    }
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    saveSession(data);
    await load();
  } catch (err) {
    message.value = err.message;
    if (authTab.value === "login") loadCaptcha();
  }
}

async function savePassword() {
  message.value = "";
  ok.value = false;
  if (nextPassword.value !== nextPassword2.value) {
    message.value = "两次密码不一致";
    return;
  }
  try {
    await api("/me/password", {
      method: "PUT",
      body: JSON.stringify({ current: currentPassword.value, password: nextPassword.value })
    });
    hasPassword.value = true;
    currentPassword.value = "";
    nextPassword.value = "";
    nextPassword2.value = "";
    ok.value = true;
    message.value = "密码已保存";
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>

<style scoped>
.mine { background: transparent; color: #1c1c1e; padding-bottom: 8px; }
.who, .shortcuts, .walls { background: #fff; }
.who { display: flex; align-items: center; gap: 12px; margin: 8px 16px 0; padding: 14px 16px; border-radius: 16px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.face {
  width: 58px;
  height: 58px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(145deg, #64d2ff, #007aff);
}
.who-main { flex: 1; min-width: 0; }
.nick { font-size: 18px; font-weight: 650; }
.role { margin: 2px 0 0; color: var(--accent); font-size: 13px; font-weight: 650; }
.club-line { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; }
.chev { margin-left: auto; stroke: #c5cad1; }
.quit { margin-top: 8px; color: var(--muted); font-size: 13px; }
.who.auth { display: block; }
.modes { display: flex; gap: 8px; }
.modes button { height: 32px; padding: 0 14px; border-radius: 999px; background: rgba(118, 118, 128, 0.12); font-size: 14px; font-weight: 650; }
.modes button.on { background: #007aff; color: #fff; }
.auth-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.auth-form input { display: block; width: 100%; height: 40px; border: 0; border-radius: 10px; padding: 0 12px; background: rgba(118, 118, 128, 0.12); outline: none; }
.captcha { height: 44px; border-radius: 10px; background: rgba(118, 118, 128, 0.12); color: var(--muted); }
.captcha img { display: block; height: 44px; margin: 0 auto; }
.go { display: block; width: 100%; height: 40px; border-radius: 12px; background: #007aff; color: #fff; font-weight: 650; }
.hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.err { color: #e35d5d; font-size: 12px; margin: 4px 0 0; }
.ok { color: #248a3d; font-size: 12px; margin: 4px 0 0; }
.shortcuts { display: flex; justify-content: space-between; margin: 12px 16px 0; padding: 14px 8px 12px; border-radius: 16px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.shortcuts a { flex: 1; min-width: 0; text-align: center; font-size: calc(12px * var(--s)); color: #333; }
.orb { width: calc(48px * var(--s)); height: calc(48px * var(--s)); margin: 0 auto 6px; border-radius: 50%; display: grid; place-items: center; }
.orb svg { width: 22px; height: 22px; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.order { background: #e7f1ff; } .order svg { stroke: #5b8def; }
.flag { background: #ffe8ea; } .flag svg { stroke: #ff5a6a; fill: #ff5a6a; }
.cup { background: #e5f8ea; } .cup svg { stroke: #3dbe6e; }
.person { background: #fff1e4; } .person svg { stroke: #ff9a3c; }
.score { background: #eee8ff; } .score svg { stroke: #8b7cf7; }
.walls { display: flex; align-items: center; justify-content: space-around; margin: 12px 16px 0; padding: 12px 0; border-radius: 16px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.walls button { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; color: #222; font-weight: 650; }
.walls svg { width: 14px; height: 14px; }
.walls button:nth-child(1) svg { fill: #7c6cf0; stroke: none; }
.walls button:nth-child(3) svg { fill: none; stroke: #ff8a3d; stroke-width: 1.4; }
.walls button:nth-child(5) svg { fill: none; stroke: #5b8def; stroke-width: 1.4; }
.walls i { width: 1px; height: 14px; background: #e6e8ec; }
.career { padding-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 8px; }
.chips button, .lit { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #f4f5f7; color: #666; }
.chips button.on { background: #007aff; color: #fff; }
.scroll { display: flex; gap: 8px; overflow-x: auto; padding: 0 16px 8px; }
.scroll a { flex: none; width: 168px; background: #f7f8fa; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #333; }
.scroll b { display: block; font-size: 16px; }
.scroll span { display: block; color: #8d949c; margin: 2px 0 4px; }
.year { margin: 4px 0 0; font-size: 12px; color: #8d949c; }
.pb { color: #f0a04b; font-size: 12px; margin-left: 4px; }
.footline { margin: 10px 0 0; color: #8d949c; font-size: 12px; }
.marks { padding: 0 16px 8px; }
.marks a { display: block; font-size: 13px; padding: 6px 0; color: #333; }
.marks b { color: #007aff; font-weight: 650; margin-right: 6px; }
.quiet { text-align: center; color: #8d949c; font-size: 13px; margin: 0 0 8px; }
.promo { margin: 8px 12px 12px; border-radius: 12px; overflow: hidden; height: 92px; }
.promo svg { width: 100%; height: 92px; display: block; }
.promo text { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
.sheet { margin: 12px 16px; background: #fff; border-radius: 16px; padding: 14px 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.head h3 span, .link { color: #8d949c; font-size: 13px; font-weight: 400; }
.week-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(88px, 118px); gap: 10px; align-items: end; margin-top: 8px; }
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
.pair > div { position: relative; background: #f2f2f7; border-radius: 12px; min-height: 78px; padding: 10px 12px; }
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
