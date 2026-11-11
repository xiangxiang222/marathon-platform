<template>
  <main class="mine">
    <PageHeader title="我的" subtitle="每一程，都有记录" />
    <section v-if="nickname" class="account-hero">
      <div class="who-top">
        <img v-if="avatar" class="face" :src="avatar" :alt="nickname + ' 的头像'" />
        <span v-else class="face" aria-hidden="true">{{ nickname.slice(0, 1) }}</span>
        <div class="who-main"><h2 class="nick">{{ nickname }}</h2><p class="club-line">{{ clubs.length ? clubs.map(item => item.name).join(' · ') : '和志同道合的人一起跑' }}</p><span v-if="leader" class="role">建团资格</span></div>
        <button class="hero-settings" type="button" aria-label="查看个人资料" @click="section = 'profile'">›</button>
      </div>
      <div class="account-stats"><button type="button" @click="section = 'plans'"><b>{{ plans.length }}</b><span>已标记赛事</span></button><button type="button" @click="section = 'results'"><b>{{ finished }}</b><span>已完赛</span></button><router-link to="/clubs"><b>{{ clubs.length }}</b><span>已加入跑团</span></router-link></div>
    </section>
    <section v-else class="account-hero guest-hero">
      <div class="who-top"><span class="face guest-face" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><div class="who-main"><h2>跑过的每一步，都值得记录</h2><p>登录后收藏赛事、记录成绩，加入跑团</p></div></div>
      <button class="primary hero-login" type="button" :aria-expanded="authOpen" @click="openAuth">{{ authOpen ? '收起登录' : '登录 / 注册' }}</button>
    </section>
    <section v-if="!nickname && authOpen" class="sheet auth">
      <nav class="subtabs"><button type="button" :class="{ on: authTab === 'login' }" @click="setTab('login')">账号登录</button><button type="button" :class="{ on: authTab === 'register' }" @click="setTab('register')">注册账号</button></nav>
      <p class="hint">{{ authTab === 'login' ? '使用已注册的昵称和密码登录。' : '首次使用请设置昵称和密码。旧账号请使用原密码登录。' }}</p>
      <form class="auth-form" @submit.prevent="submitAuth">
        <input v-model="draft" autocomplete="username" placeholder="昵称" aria-label="昵称" />
        <input v-model="password" type="password" :autocomplete="authTab === 'login' ? 'current-password' : 'new-password'" placeholder="密码，至少 8 位" />
        <input v-if="authTab === 'register'" v-model="password2" type="password" autocomplete="new-password" placeholder="再输入一次密码" />
        <template v-if="authTab === 'login'"><button type="button" class="captcha" @click="loadCaptcha"><img v-if="captchaImage" :src="captchaImage" alt="验证码" /><span v-else>{{ captchaLoading ? '加载中…' : '点击获取验证码' }}</span></button><input v-model="captcha" autocomplete="off" maxlength="4" placeholder="上图字符" /></template>
        <div class="auth-legal"><label><input v-model="legalAccepted" type="checkbox" /><span>我已阅读并同意用户协议，并已阅读隐私政策</span></label><p><router-link to="/legal/terms" target="_blank" rel="noopener noreferrer">《用户协议》</router-link><router-link to="/legal/privacy" target="_blank" rel="noopener noreferrer">《隐私政策》</router-link></p><small>账号服务暂面向已满14周岁的用户。运动资料、文件与领奖地址等可选信息，将在使用对应功能时另行说明。</small></div>
        <button class="primary" type="submit">{{ authTab === 'login' ? '登录' : '注册' }}</button>
      </form><p v-if="authTab === 'login'" class="hint">旧账号未设置密码或无法登录？请联系平台管理员核验身份后恢复账号。</p><p v-if="message" :class="ok ? 'success' : 'err'">{{ message }}</p>
    </section>
    <nav v-if="section !== 'overview'" class="quick-links" aria-label="常用功能"><router-link v-for="item in quickLinks" :key="item.to" :to="item.to"><img :src="item.icon" alt="" /><span>{{ item.label }}</span></router-link></nav>
    <nav class="main-tabs" aria-label="个人中心"><button type="button" :class="{ on: section === 'overview' }" @click="section = 'overview'">总览</button><button type="button" :class="{ on: section === 'plans' }" @click="section = 'plans'">我的赛事</button><button type="button" :class="{ on: section === 'results' }" @click="section = 'results'">完赛记录</button><button type="button" :class="{ on: section === 'profile' }" @click="section = 'profile'">个人资料</button></nav>
    <RunnerDashboard v-if="section === 'overview' && nickname" :data="runnerData" :plans="plans" :loading="runnerLoading" :error="runnerError" @retry="loadRunner"/>
    <section v-else-if="section === 'overview'" class="sheet empty-state"><h3>积累每一公里，珍藏每次完赛</h3><p>运动趋势、赛事生涯、城市护照和荣誉收藏，都从一次出发开始。</p><router-link to="/">去发现下一场比赛 ›</router-link></section>
    <template v-else-if="section === 'plans'">
      <section v-if="conflicts.length" class="sheet"><h3>比赛安排提醒</h3><p v-for="item in conflicts" :key="item.text" class="notice">{{ item.text }}</p></section>
      <section v-if="reminders.length" class="sheet"><h3>截止提醒</h3><router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind-line" :to="'/races/' + item.race.id"><b>{{ item.hit.reason }}</b><span>{{ item.race.name }}</span><i>›</i></router-link></section>
      <section v-if="plans.length" class="sheet plan-list"><router-link v-for="item in plans" :key="item.race.id" class="plan-row" :to="'/races/' + item.race.id"><div><span class="plan-state">{{ item.status }}</span><h3>{{ item.race.name }}</h3><p>{{ item.race.raceDate }}<template v-if="item.race.city"> · {{ item.race.city }}</template></p></div><i>›</i></router-link></section>
      <section v-else class="sheet empty-state"><h3>{{ nickname ? '下一场，想去哪里跑？' : '把想跑的比赛放进这里' }}</h3><p>{{ nickname ? '在赛事详情页标记报名或中签状态，随时查看参赛安排。' : '登录后，你标记的比赛会自动汇总在这里。' }}</p><router-link to="/">去看赛事 ›</router-link></section>
    </template>
    <template v-else-if="section === 'results'">
      <section class="sheet career-summary"><div><span>完赛场数</span><b>{{ nickname ? finished : '—' }}<small> 场</small></b></div><div><span>半马最好成绩</span><b class="clock">{{ career.pb.half || '—' }}</b></div><div><span>全马最好成绩</span><b class="clock">{{ career.pb.full || '—' }}</b></div></section>
      <nav class="subtabs result-tabs"><button type="button" :class="{ on: tab === 'honor' }" @click="tab = 'honor'">成绩</button><button type="button" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">证书影像</button><button type="button" :class="{ on: tab === 'time' }" @click="tab = 'time'">赛事足迹</button></nav>
      <section v-if="tab === 'honor'" class="sheet">
        <div v-if="years.length" class="chips"><button type="button" :class="{ on: mapYear === '' }" @click="mapYear = ''">全部</button><button v-for="year in years" :key="year" type="button" :class="{ on: mapYear === year }" @click="mapYear = year">{{ year }}</button></div>
        <div v-for="group in honorGroups" :key="group.year" class="result-group"><h3>{{ group.year }}</h3><router-link v-for="item in group.items" :key="item.race.id + item.distance" class="result-row" :to="'/races/' + item.race.id"><b>{{ item.clock }}<small v-if="item.pb"> PB</small></b><span>{{ item.race.name }}</span><p>{{ item.race.raceDate }}</p></router-link></div>
        <p v-if="!results.length" class="empty-copy">在赛事详情页记下完赛成绩，留住你的每次突破。</p>
      </section>
      <section v-else-if="tab === 'photo'" class="sheet"><router-link v-for="item in proofResults" :key="item.race.id + item.distance" class="proof-card" :to="'/races/' + item.race.id"><img :src="proofSrc(item.race.id, item.distance)" :alt="item.race.name + ' 成绩影像'"/><b>{{ item.proofLabel }} · 未核验</b><span>{{ item.race.name }}</span></router-link><p v-if="!proofResults.length" class="empty-copy">在赛事详情页上传证书或奖牌照片，建立自己的完赛相册。</p></section>
      <section v-else class="sheet"><p v-if="career.finished" class="hint">跑过 {{ career.provinces.length }} 个省、{{ career.cities.length }} 个城市 · 本年比赛 {{ career.yearKm }} 公里</p><div class="chips"><button v-for="item in [{id:'all',label:'全部'},{id:'road',label:'路跑'},{id:'trail',label:'越野'},{id:'other',label:'其他'}]" :key="item.id" type="button" :class="{ on: kindFilter === item.id }" @click="kindFilter = item.id">{{ item.label }}</button></div><router-link v-for="item in timeline" :key="item.race.id + item.distance" class="result-row" :to="'/races/' + item.race.id"><p>{{ item.race.raceDate }}</p><span>{{ item.race.name }}</span><b>{{ item.clock }}</b></router-link><p v-if="!timeline.length" class="empty-copy">你的赛事足迹，从第一条完赛记录开始。</p></section>
    </template>
    <section v-else-if="nickname" class="sheet settings">
      <button class="setting-row" type="button" :aria-expanded="profileOpen" @click="profileOpen = !profileOpen"><span>修改头像与昵称</span><i>{{ profileOpen ? '⌄' : '›' }}</i></button>
      <form v-if="profileOpen" class="auth-form profile-form" @submit.prevent="saveProfile"><label>昵称<input v-model="nicknameEdit" maxlength="20" autocomplete="nickname" /></label><div class="avatar-edit"><img v-if="avatarEdit" :src="avatarEdit" alt="头像预览" /><span v-else class="avatar-empty">{{ nicknameEdit.slice(0, 1) || '跑' }}</span><label class="avatar-choice">选择头像<input type="file" accept="image/jpeg,image/png,image/webp" @change="chooseAvatar" /></label></div><button class="primary" type="submit">保存资料</button><p v-if="profileMessage" :class="profileSaved ? 'success' : 'err'">{{ profileMessage }}</p></form>
      <button class="setting-row" type="button" :aria-expanded="passwordOpen" @click="togglePassword"><span>{{ hasPassword ? '修改密码' : '设置登录密码' }}</span><i>{{ passwordOpen ? '⌄' : '›' }}</i></button>
      <form v-if="passwordOpen" class="auth-form" @submit.prevent="savePassword"><p class="hint">{{ hasPassword ? '请填写当前密码和新密码。' : '设置后，可使用昵称与密码在其他设备登录。' }}</p><input v-if="hasPassword" v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" /><input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，8 到 128 位" /><input v-model="nextPassword2" type="password" autocomplete="new-password" placeholder="再输入一次" /><button class="primary" type="submit">保存密码</button><button class="secondary" type="button" @click="cancelPassword">取消</button></form>
      <p v-if="message" :class="ok ? 'success' : 'err'">{{ message }}</p><router-link v-for="club in clubs" :key="club.id" class="setting-row club-setting" :to="'/clubs/' + club.id"><span>{{ club.name }}<small>{{ club.roleLabel }}</small></span><i>›</i></router-link><button type="button" class="logout" @click="logout">退出登录</button>
    </section>
    <section v-else class="sheet empty-state"><h3>你的资料，由你管理</h3><p>登录后设置头像、昵称和账号密码。</p><button class="text-action" type="button" @click="openAuth">去登录 ›</button></section>
    <router-link v-if="section === 'overview'" class="feedback-entry" :to="feedbackUnread ? '/feedback?mine=1' : '/feedback'"><span class="feedback-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-9a10 10 0 0 1 10-10h1M17 3v8m-4-4h8"/></svg></span><span><b>共创建议<span v-if="feedbackUnread" class="feedback-entry-unread">{{ feedbackUnread > 99 ? '99+' : feedbackUnread }} 条新进度</span></b><small>提建议 · 为好想法投票 · 查看采纳进度</small></span><i aria-hidden="true">↗</i></router-link>
    <footer class="legal"><nav aria-label="协议与隐私"><router-link to="/legal/terms">用户协议</router-link><router-link to="/legal/privacy">隐私政策</router-link><router-link to="/legal/collection">个人信息收集清单</router-link><router-link to="/legal/sharing">第三方信息共享清单</router-link><router-link to="/legal/rights">个人信息权利</router-link></nav><p>{{ company }} · {{ icp }}</p></footer>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, resultProofSrc } from "../api";
import PageHeader from "../components/PageHeader.vue";
import RunnerDashboard from "../components/RunnerDashboard.vue";

import calendarIcon from "../assets/quick/calendar.svg";
import radarIcon from "../assets/quick/radar.svg";
import clubsIcon from "../assets/quick/clubs.svg";
import newsIcon from "../assets/quick/news.svg";
const router = useRouter();
const section = ref("overview");
const feedbackUnread = ref(0);
const runnerData = ref(null), runnerLoading = ref(Boolean(localStorage.getItem("marathon_token"))), runnerError = ref("");
let runnerRequest = 0, accountRequest = 0;
async function loadRunner() {
  if (!localStorage.getItem("marathon_token")) return;
  const id = ++runnerRequest;
  runnerLoading.value = true;
  runnerError.value = "";
  try { const data = await api("/me/runner"); if (id === runnerRequest) { runnerData.value = data; applyRunnerCareer(); } }
  catch (err) { if (id === runnerRequest) { if (err.status === 401) logout(); else runnerError.value = err.message; } }
  finally { if (id === runnerRequest) runnerLoading.value = false; }
}
onBeforeUnmount(() => { runnerRequest++; accountRequest++; });
function applyRunnerCareer() {
  const data = runnerData.value;
  if (!data) return;
  const summary = data.career;
  career.value = { finished: summary.finished, provinces: summary.provinces || [], cities: summary.cities || [], pb: { full: summary.pb?.find(item => item.distance === 'full')?.clock || '', half: summary.pb?.find(item => item.distance === 'half')?.clock || '' }, yearKm: summary.trends?.find(item => String(item.year) === data.asOf.slice(0, 4))?.km || 0 };
  results.value = results.value.map(item => ({ ...item, pb: item.race.kind === 'road' && (data.results.find(next => next.race.id === item.race.id && next.distance === item.distance)?.race.meet !== 'online') && item.race.raceDate <= data.asOf && summary.pb.some(best => best.distance === item.distance && best.seconds === item.seconds) }));
}
const authOpen = ref(Boolean(localStorage.getItem("marathon_return_after_login")));
const quickLinks = [{to:"/calendar",label:"赛事日历",icon:calendarIcon},{to:"/radar",label:"拿奖雷达",icon:radarIcon},{to:"/clubs",label:"发现跑团",icon:clubsIcon},{to:"/news",label:"赛事资讯",icon:newsIcon}];
function openAuth() { authOpen.value = !authOpen.value; if (authOpen.value && authTab.value === "login" && !captchaImage.value) loadCaptcha(); }
watch(section, next => { if (next !== "profile") { profileOpen.value = false; cancelPassword(); } });
const nickname = ref(localStorage.getItem("marathon_token") ? localStorage.getItem("marathon_name") || "" : "");
const avatar = ref("");
const avatarEdit = ref("");
const nicknameEdit = ref("");
const profileOpen = ref(false);
const profileMessage = ref("");
const profileSaved = ref(false);
const leader = ref(false);
const clubs = ref([]);
const hasPassword = ref(false);
const authTab = ref("login");
const draft = ref("");
const password = ref("");
const password2 = ref("");
const legalAccepted = ref(false), legalVersion = ref("2026-11-01.1");
async function loadLegalVersion() { try { const data = await api('/legal'); if (data.version && data.version !== legalVersion.value) { legalVersion.value = data.version; legalAccepted.value = false; } } catch (_) {} }
const captcha = ref("");
const captchaToken = ref("");
const captchaImage = ref("");
const captchaLoading = ref(false);
const passwordOpen = ref(false);
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
const proofResults = computed(() => results.value.filter((item) => item.hasProof));
function proofSrc(id, distance) {
  return resultProofSrc(id, distance);
}
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
  const accountId = ++accountRequest;
  const sessionToken = localStorage.getItem("marathon_token");
  api("/meta").then(meta => { company.value = meta.company; icp.value = meta.icp; }).catch(() => {});
  if (!localStorage.getItem("marathon_token")) {
    feedbackUnread.value = 0;
    nickname.value = "";
    avatar.value = "";
    localStorage.removeItem("marathon_name");
    if (authOpen.value) await loadCaptcha();
    return;
  }
  try {
    const data = await api("/me");
    if (accountId !== accountRequest || sessionToken !== localStorage.getItem("marathon_token")) return;
    nickname.value = data.user.nickname;
    nicknameEdit.value = data.user.nickname;
    avatar.value = data.user.avatar || "";
    avatarEdit.value = data.user.avatar || "";
    leader.value = Boolean(data.user.leader);
    hasPassword.value = Boolean(data.user.hasPassword);
    clubs.value = data.clubs || [];
    plans.value = data.plans || [];
    results.value = data.results || [];
    career.value = data.career || career.value;
    applyRunnerCareer();
    conflicts.value = data.conflicts || [];
    reminders.value = data.reminders || [];
    localStorage.setItem("marathon_name", data.user.nickname);
    loadRunner();
    api("/me/feedback/summary").then(summary => { if (accountId === accountRequest && sessionToken === localStorage.getItem("marathon_token")) feedbackUnread.value = Number(summary.unread) || 0; }).catch(() => {});
  } catch (err) {
    if (accountId !== accountRequest || sessionToken !== localStorage.getItem("marathon_token")) return;
    if (err.status === 401) logout();
    else { message.value = err.message; runnerLoading.value = false; runnerError.value = err.message; }
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
  authOpen.value = false;
  localStorage.setItem("marathon_token", data.token);
  localStorage.setItem("marathon_name", data.user.nickname);
  avatar.value = data.user.avatar || "";
  nickname.value = data.user.nickname;
  password.value = "";
  password2.value = "";
  captcha.value = "";
  message.value = "";
}

function logout() {
  legalAccepted.value = false;
  accountRequest++;
  runnerRequest++;
  runnerData.value = null;
  feedbackUnread.value = 0;
  runnerLoading.value = false;
  runnerError.value = "";
  localStorage.removeItem("marathon_token");
  localStorage.removeItem("marathon_name");
  nickname.value = "";
  avatar.value = "";
  avatarEdit.value = "";
  nicknameEdit.value = "";
  profileOpen.value = false;
  leader.value = false;
  hasPassword.value = false;
  clubs.value = [];
  plans.value = [];
  results.value = [];
  conflicts.value = [];
  reminders.value = [];
  passwordOpen.value = false;
  currentPassword.value = "";
  nextPassword.value = "";
  nextPassword2.value = "";
  message.value = "";
  ok.value = false;
  authTab.value = "login";
  authOpen.value = false;
  section.value = "overview";
  career.value = { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 };
}

async function submitAuth() {
  message.value = "";
  ok.value = false;
  if (!legalAccepted.value) { message.value = "请先阅读用户协议与隐私政策，自主勾选后继续。"; return; }
  if (authTab.value === "register" && password.value !== password2.value) {
    message.value = "两次密码不一致";
    return;
  }
  try {
    const path = authTab.value === "login" ? "/auth/login" : "/auth/register";
    const body = { nickname: draft.value, password: password.value, legalConsent: { version: legalVersion.value, accepted: true } };
    if (authTab.value === "login") {
      body.captchaToken = captchaToken.value;
      body.captcha = captcha.value;
    }
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    saveSession(data);
    await load();
    const returnPath = localStorage.getItem("marathon_return_after_login") || "";
    if (returnPath === "/legal/rights" || returnPath === "/history" || returnPath.startsWith("/clubs/") || /^\/runner(?:\?view=(?:stats|career|footprints|honors|media|devices|help))?$/.test(returnPath) || /^\/feedback(?:\/\d+)?(?:\?(?:compose|mine)=1)?$/.test(returnPath) || (returnPath === "/radar" || returnPath === "/sport" || /^\/races\/[^/?#]+(?:\?plan=1)?$/.test(returnPath))) {
      localStorage.removeItem("marathon_return_after_login");
      await router.replace(returnPath);
    }
  } catch (err) {
    message.value = err.message;
    if (authTab.value === "login") loadCaptcha();
  }
}

function chooseAvatar(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  profileMessage.value = "";
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    profileMessage.value = "请选择 JPG、PNG 或 WebP 图片";
    event.target.value = "";
    return;
  }
  const source = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 240 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(source);
    let quality = 0.78;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 58000 && quality > 0.35) {
      quality -= 0.1;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 58000) {
      profileMessage.value = "图片仍然过大，请换一张头像";
      return;
    }
    avatarEdit.value = data;
    profileMessage.value = "头像已选择，保存后团友可见";
  };
  image.onerror = () => {
    URL.revokeObjectURL(source);
    profileMessage.value = "无法读取这张图片";
  };
  image.src = source;
  event.target.value = "";
}

async function saveProfile() {
  profileMessage.value = "";
  profileSaved.value = false;
  try {
    const data = await api("/me/profile", {
      method: "PUT",
      body: JSON.stringify({ nickname: nicknameEdit.value.trim(), avatar: avatarEdit.value })
    });
    nickname.value = data.user.nickname;
    nicknameEdit.value = data.user.nickname;
    avatar.value = data.user.avatar || "";
    avatarEdit.value = data.user.avatar || "";
    localStorage.setItem("marathon_name", data.user.nickname);
    profileSaved.value = true;
    profileMessage.value = "个人资料已保存";
  } catch (err) {
    profileMessage.value = err.message;
  }
}

function togglePassword() {
  if (passwordOpen.value) cancelPassword();
  else {
    passwordOpen.value = true;
    message.value = "";
    ok.value = false;
  }
}

function cancelPassword() {
  passwordOpen.value = false;
  currentPassword.value = "";
  nextPassword.value = "";
  nextPassword2.value = "";
  message.value = "";
  ok.value = false;
}

async function savePassword() {
  message.value = "";
  ok.value = false;
  if (nextPassword.value.length < 8 || nextPassword.value.length > 128) {
    message.value = "密码须为 8 到 128 位";
    return;
  }
  if (nextPassword.value !== nextPassword2.value) {
    message.value = "两次输入的密码不一致";
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
    passwordOpen.value = false;
    ok.value = true;
    message.value = "密码已更新";
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(() => { load(); loadLegalVersion(); });
</script>

<style scoped>
.auth-form .auth-legal{padding:5px 0 9px}.auth-form .auth-legal label{display:flex;align-items:flex-start;gap:9px;color: var(--muted);font-size:12px;line-height:1.9;cursor:pointer}.auth-form .auth-legal input[type=checkbox]{width:17px;height:17px;min-height:17px;flex:none;margin:3px 0 0;accent-color:var(--accent)}.auth-legal p{display:flex;flex-wrap:wrap;gap:10px;margin:7px 0 6px;padding-left:26px;font-size:12px;line-height:1.9}.auth-legal a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}.auth-legal small{display:block;padding-left:26px;color:var(--muted);font-size:12px;line-height:1.9}.legal nav{display:flex;flex-wrap:wrap;gap:2px 15px}.legal nav a{min-height:36px;display:flex;align-items:center;color:var(--muted);font-size:12px}.legal p{margin:8px 0;line-height:1.8}
.mine { padding: 0 12px 16px; color: var(--ink); }
.feedback-entry-unread{display:inline-block;margin-left:6px;padding:1px 5px;vertical-align:middle;border-radius:5px;background:var(--accent);color:white;font-size:12px;font-weight:500;line-height:1.7}.feedback-entry b{display:flex!important;align-items:center;gap:3px;flex-wrap:wrap}.feedback-entry small{color:var(--muted)!important;font-size:12px!important}
.feedback-entry {display:flex;align-items:center;gap:12px;margin:16px 0 12px;padding:18px;border: 1px solid var(--line);border-radius: 18px;background: var(--card);color: var(--ink)}.feedback-entry-icon{display:grid;place-items:center;width:35px;height:37px;border-radius:11px;background:var(--accent-soft);color:var(--accent);flex:none}.feedback-entry-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.feedback-entry>span:nth-child(2){flex:1;min-width:0}.feedback-entry b{display:block;font-size:14px;font-weight:600;line-height:1.7}.feedback-entry small{display:block;font-size:12px;line-height:1.9;color:var(--muted);margin-top:3px}.feedback-entry i{font-size:22px;color:var(--accent);font-style:normal;flex:none}
:deep(.page-header) { margin: 0 -12px; }
.account-hero { border: 1px solid var(--line); background: #fff; }
.account-hero, .sheet, .quick-links { margin: 0 0 12px; padding: 18px; border-radius: 18px; background: #fff; box-shadow: none;  border: 1px solid var(--line);}.who-top { display: flex; align-items: center; gap: 12px; }.face { display: grid; place-items: center; width: 58px; height: 58px; flex: none; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 24px; font-weight: 600; object-fit: cover; }.who-main { flex: 1; min-width: 0; }.nick { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; overflow-wrap: anywhere; }.club-line, .guest-hero p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 18px; }.role { display: inline-block; margin-top: 5px; padding: 1px 5px; background: var(--accent-soft); color: var(--accent); border-radius: 6px; font-size: 12px; }.hero-settings { align-self: center; color: var(--muted); font-size: 26px; }.account-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 20px; }.account-stats button, .account-stats a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }.account-stats b { font-size: 24px; line-height: 30px; font-weight: 700; }.account-stats span { color: var(--muted); font-size: 12px; }.guest-hero h2 { margin: 0; font-size: 22px; line-height: 1.5; font-weight: 600; }.guest-face svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.6; }.hero-login { width: 100%; margin-top: 16px; }
.quick-links { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); padding: 14px 6px; }.quick-links a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; font-size: 12px; }.quick-links img { width: 36px; height: 36px; }.main-tabs { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0 0 16px; border-bottom: 1px solid var(--line); }.main-tabs button { position: relative; min-height: 46px; color: var(--muted); font-size: 14px; font-weight: 600; }.main-tabs button.on { color: var(--accent); }.main-tabs button.on::after { content: ''; position: absolute; left: calc(50% - 12px); bottom: 0; width: 24px; height: 2px; background: var(--accent); border-radius: 2px; }
h3 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }.hint, .empty-copy { margin: 8px 0; color: var(--muted); font-size: 12px; line-height: 20px; }.notice { margin: 8px 0 0; color: var(--accent); font-size: 12px; line-height: 20px; }.remind-line { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; }.remind-line:last-child { border: 0; padding-bottom: 0; }.remind-line b { flex: none; color: var(--accent); font-weight: 500; }.remind-line span { flex: 1; min-width: 0; }.remind-line i, .plan-row i, .setting-row i { flex: none; color: var(--muted); font-size: 22px; font-style: normal; }.plan-list { padding-top: 0; padding-bottom: 0; }.plan-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--line); }.plan-row:last-child { border: 0; }.plan-row > div { flex: 1; min-width: 0; }.plan-row h3 { margin: 6px 0; }.plan-row p, .result-row p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }.plan-state { display: inline-block; padding: 2px 6px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 12px; }.empty-state { padding: 28px 20px; text-align: center; }.empty-state p { margin: 8px 0 16px; color: var(--muted); font-size: 12px; line-height: 20px; }.empty-state a, .text-action { color: var(--accent); font-size: 14px; }
.career-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }.career-summary span { display: block; color: var(--muted); font-size: 12px; }.career-summary b { display: block; margin-top: 8px; font-size: 24px; font-weight: 600; }.career-summary small { font-size: 12px; font-weight: 400; }.career-summary .clock { padding-top: 6px; font-size: 16px; }.subtabs { display: flex; align-items: center; gap: 20px; }.subtabs button { min-height: 40px; color: var(--muted); font-size: 14px; }.subtabs button.on { color: var(--accent); font-weight: 600; }.result-tabs { margin: -4px 12px 8px; }.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }.chips button { min-height: 30px; padding: 0 10px; border-radius: 6px; background: var(--card); color: var(--muted); font-size: 12px;  border: 1px solid var(--line);}.chips button.on { background: var(--accent-soft); color: var(--accent); }.result-group + .result-group { margin-top: 20px; }.result-group h3 { font-size: 14px; }.result-row { display: flex; flex-direction: column; gap: 6px; padding: 14px 0; border-bottom: 1px solid var(--line); }.result-row:last-child { border: 0; }.result-row b { color: var(--accent); font-size: 18px; font-weight: 600; }.result-row small { font-size: 12px; }.result-row span { font-size: 14px; line-height: 22px; }.proof-card { display: block; margin-bottom: 16px; }.proof-card img { display: block; width: 100%; border-radius: 8px; }.proof-card b, .proof-card span { display: block; margin-top: 6px; font-size: 13px; }.proof-card span { color: var(--muted); }
.settings { padding-top: 0; }.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 56px; border-bottom: 1px solid var(--line); text-align: left; font-size: 15px; }.setting-row span { min-width: 0; overflow-wrap: anywhere; }.setting-row small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }.logout { width: 100%; min-height: 44px; margin-top: 12px; color: var(--muted); font-size: 14px; }.auth-form { display: flex; flex-direction: column; gap: 10px; padding: 12px 0; }.auth-form input { display: block; width: 100%; min-width: 0; height: 44px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--bg); font-size: 15px; outline: none; }.auth-form > label { color: var(--muted); font-size: 12px; }.auth-form > label input { margin-top: 6px; }.primary { min-height: 44px; padding: 0 16px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 15px; font-weight: 600; }.secondary { min-height: 40px; border-radius: 8px; background: var(--chip); font-size: 14px; }.captcha { display: grid; place-items: center; min-height: 48px; background: var(--bg); border-radius: 8px; color: var(--muted); font-size: 12px; }.captcha img { height: 44px; max-width: 100%; }.avatar-edit { display: flex; align-items: center; gap: 12px; }.avatar-edit img, .avatar-empty { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; color: var(--accent); background: var(--accent-soft); font-size: 20px; }.avatar-choice { padding: 10px 12px; border-radius: 8px; background: var(--chip); font-size: 13px; cursor: pointer; }.avatar-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }.success, .err { margin: 8px 0 0; font-size: 12px; line-height: 20px; }.success { color: var(--ink); }.err { color: var(--accent); }.legal { padding: 10px 4px; color: var(--muted); font-size: 12px; }
@media(max-width:350px) { .account-hero, .sheet { padding: 14px; }.settings { padding-top: 0; }.guest-hero h2 { font-size: 22px;  line-height: 1.5;}.face { width: 50px; height: 50px; }.quick-links { padding: 12px 2px; }.quick-links a { font-size: 12px; }.main-tabs button { font-size: 13px; }.career-summary .clock { font-size: 14px; } }


/* The personal area uses lilac and peach as a quiet, welcoming identity. */
.mine { background:transparent; }
.account-hero { background:linear-gradient(130deg,#f3eeff,#fcfaff 64%,#fff);border-color:#e5d9ed;box-shadow:var(--card-shadow,0 7px 24px #72608712); }
.account-hero .face { background:#ffffffc7;color:#a33931;box-shadow:0 0 0 4px #ffffff73; }.account-hero .hero-settings { background:#ffffff9c; }.account-stats { border-color:#e1d5e8; }.account-stats b { color:#6a4a92; }
.career-summary { background:#fff;border-color:#efdfc6; }
.feedback-entry { background:#fff;border-color:#dde5f5; }.feedback-entry-icon { background:#fff;color:#577fac; }
.quick-links a:nth-child(4n+1) { background:var(--sky-soft,#eaf4ff); }.quick-links a:nth-child(4n+2) { background:var(--sun-soft,#fff4d7); }.quick-links a:nth-child(4n+3) { background:var(--mint-soft,#e9f7f2); }.quick-links a:nth-child(4n) { background:var(--lilac-soft,#f2edff); }
.plan-state { background:var(--peach-soft,#fff0e7); }.empty-state { background:#fff; }
:deep(.week-card) { background:#fff;border-color:#d4e6df;box-shadow:var(--card-shadow,0 6px 20px #4079610a); }
:deep(.week-number) { color:#2b7560; }:deep(.career-card) { background:#fff;border-color:#eddfcb; }:deep(.next-race) { background:#fff;border-color:#dce6f4; }:deep(.history-entry) { background:#fff;border-color:#e1d8f0; }
:deep(.entry-icon.footprints) { background:var(--sky-soft,#eaf4ff);color:#3d79a9; }:deep(.entry-icon.honors) { background:var(--sun-soft,#fff4d7);color:#a47825; }:deep(.entry-icon.media) { background:var(--lilac-soft,#f2edff);color:#8062a6; }:deep(.entry-icon.devices) { background:var(--mint-soft,#e9f7f2);color:#367f65; }
</style>
