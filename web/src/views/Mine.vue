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
        <button class="primary" type="submit">{{ authTab === 'login' ? '登录' : '注册' }}</button>
      </form><p v-if="authTab === 'login'" class="hint">旧账号未设置密码或无法登录？请联系平台管理员核验身份后恢复账号。</p><p v-if="message" :class="ok ? 'success' : 'err'">{{ message }}</p>
    </section>
    <nav class="quick-links" aria-label="常用功能"><router-link v-for="item in quickLinks" :key="item.to" :to="item.to"><img :src="item.icon" alt="" /><span>{{ item.label }}</span></router-link></nav>
    <nav class="main-tabs" aria-label="个人中心"><button type="button" :class="{ on: section === 'plans' }" @click="section = 'plans'">我的赛事</button><button type="button" :class="{ on: section === 'results' }" @click="section = 'results'">完赛记录</button><button type="button" :class="{ on: section === 'profile' }" @click="section = 'profile'">个人资料</button></nav>
    <template v-if="section === 'plans'">
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
    <footer class="legal">{{ company }} · {{ icp }}</footer>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, resultProofSrc } from "../api";
import PageHeader from "../components/PageHeader.vue";

import calendarIcon from "../assets/quick/calendar.svg";
import radarIcon from "../assets/quick/radar.svg";
import clubsIcon from "../assets/quick/clubs.svg";
import newsIcon from "../assets/quick/news.svg";
const router = useRouter();
const section = ref("plans");
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
  const meta = await api("/meta");
  company.value = meta.company;
  icp.value = meta.icp;
  if (!localStorage.getItem("marathon_token")) {
    nickname.value = "";
    avatar.value = "";
    localStorage.removeItem("marathon_name");
    if (authOpen.value) await loadCaptcha();
    return;
  }
  try {
    const data = await api("/me");
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
  section.value = "plans";
  career.value = { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 };
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
    const returnPath = localStorage.getItem("marathon_return_after_login") || "";
    if (returnPath.startsWith("/clubs/") || (returnPath === "/radar" || returnPath === "/sport" || /^\/races\/[^/?#]+(?:\?plan=1)?$/.test(returnPath))) {
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

onMounted(load);
</script>

<style scoped>
.mine { padding: 0 12px 16px; color: #1f2026; }
:deep(.page-header) { margin: 0 -12px; }
.account-hero, .sheet, .quick-links { margin: 0 0 12px; padding: 16px; border-radius: 12px; background: #fff; box-shadow: none; }.who-top { display: flex; align-items: center; gap: 12px; }.face { display: grid; place-items: center; width: 58px; height: 58px; flex: none; border-radius: 50%; background: #fff0f3; color: #ff0a30; font-size: 24px; font-weight: 600; object-fit: cover; }.who-main { flex: 1; min-width: 0; }.nick { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; overflow-wrap: anywhere; }.club-line, .guest-hero p { margin: 5px 0 0; color: #8a8e99; font-size: 12px; line-height: 18px; }.role { display: inline-block; margin-top: 5px; padding: 1px 5px; background: #fff0f3; color: #ff0a30; border-radius: 4px; font-size: 11px; }.hero-settings { align-self: center; color: #b9bdc7; font-size: 26px; }.account-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 20px; }.account-stats button, .account-stats a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }.account-stats b { font-size: 24px; line-height: 30px; font-weight: 700; }.account-stats span { color: #8a8e99; font-size: 12px; }.guest-hero h2 { margin: 0; font-size: 18px; line-height: 26px; font-weight: 600; }.guest-face svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.6; }.hero-login { width: 100%; margin-top: 16px; }
.quick-links { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); padding: 14px 6px; }.quick-links a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; font-size: 12px; }.quick-links img { width: 36px; height: 36px; }.main-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin: 0 0 12px; border-bottom: 1px solid #e9ebf1; }.main-tabs button { position: relative; min-height: 46px; color: #8a8e99; font-size: 16px; font-weight: 600; }.main-tabs button.on { color: #ff0a30; }.main-tabs button.on::after { content: ''; position: absolute; left: calc(50% - 12px); bottom: 0; width: 24px; height: 3px; background: #ff0a30; border-radius: 2px; }
h3 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }.hint, .empty-copy { margin: 8px 0; color: #8a8e99; font-size: 12px; line-height: 20px; }.notice { margin: 8px 0 0; color: #ff0a30; font-size: 12px; line-height: 20px; }.remind-line { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid #f0f1f5; font-size: 13px; }.remind-line:last-child { border: 0; padding-bottom: 0; }.remind-line b { flex: none; color: #ff0a30; font-weight: 500; }.remind-line span { flex: 1; min-width: 0; }.remind-line i, .plan-row i, .setting-row i { flex: none; color: #b9bdc7; font-size: 22px; font-style: normal; }.plan-list { padding-top: 0; padding-bottom: 0; }.plan-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid #f0f1f5; }.plan-row:last-child { border: 0; }.plan-row > div { flex: 1; min-width: 0; }.plan-row h3 { margin: 6px 0; }.plan-row p, .result-row p { margin: 4px 0 0; color: #8a8e99; font-size: 12px; }.plan-state { display: inline-block; padding: 2px 6px; border-radius: 4px; background: #fff0f3; color: #ff0a30; font-size: 11px; }.empty-state { padding: 28px 20px; text-align: center; }.empty-state p { margin: 8px 0 16px; color: #8a8e99; font-size: 12px; line-height: 20px; }.empty-state a, .text-action { color: #ff0a30; font-size: 14px; }
.career-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }.career-summary span { display: block; color: #8a8e99; font-size: 11px; }.career-summary b { display: block; margin-top: 8px; font-size: 24px; font-weight: 600; }.career-summary small { font-size: 11px; font-weight: 400; }.career-summary .clock { padding-top: 6px; font-size: 16px; }.subtabs { display: flex; align-items: center; gap: 20px; }.subtabs button { min-height: 40px; color: #8a8e99; font-size: 14px; }.subtabs button.on { color: #ff0a30; font-weight: 600; }.result-tabs { margin: -4px 12px 8px; }.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }.chips button { min-height: 30px; padding: 0 10px; border-radius: 6px; background: #f0f1f6; color: #8a8e99; font-size: 12px; }.chips button.on { background: #fff0f3; color: #ff0a30; }.result-group + .result-group { margin-top: 20px; }.result-group h3 { font-size: 14px; }.result-row { display: flex; flex-direction: column; gap: 6px; padding: 14px 0; border-bottom: 1px solid #f0f1f5; }.result-row:last-child { border: 0; }.result-row b { color: #ff0a30; font-size: 18px; font-weight: 600; }.result-row small { font-size: 11px; }.result-row span { font-size: 14px; line-height: 22px; }.proof-card { display: block; margin-bottom: 16px; }.proof-card img { display: block; width: 100%; border-radius: 8px; }.proof-card b, .proof-card span { display: block; margin-top: 6px; font-size: 13px; }.proof-card span { color: #8a8e99; }
.settings { padding-top: 0; }.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 56px; border-bottom: 1px solid #f0f1f5; text-align: left; font-size: 15px; }.setting-row span { min-width: 0; overflow-wrap: anywhere; }.setting-row small { display: block; margin-top: 3px; color: #8a8e99; font-size: 12px; }.logout { width: 100%; min-height: 44px; margin-top: 12px; color: #8a8e99; font-size: 14px; }.auth-form { display: flex; flex-direction: column; gap: 10px; padding: 12px 0; }.auth-form input { display: block; width: 100%; min-width: 0; height: 44px; padding: 0 12px; border: 0; border-radius: 8px; background: #f5f6fa; font-size: 15px; outline: none; }.auth-form > label { color: #8a8e99; font-size: 12px; }.auth-form > label input { margin-top: 6px; }.primary { min-height: 44px; padding: 0 16px; border-radius: 8px; background: #ff0a30; color: #fff; font-size: 15px; font-weight: 600; }.secondary { min-height: 40px; border-radius: 8px; background: #f0f1f6; font-size: 14px; }.captcha { display: grid; place-items: center; min-height: 48px; background: #f5f6fa; border-radius: 8px; color: #8a8e99; font-size: 12px; }.captcha img { height: 44px; max-width: 100%; }.avatar-edit { display: flex; align-items: center; gap: 12px; }.avatar-edit img, .avatar-empty { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; color: #ff0a30; background: #fff0f3; font-size: 20px; }.avatar-choice { padding: 10px 12px; border-radius: 8px; background: #f0f1f6; font-size: 13px; cursor: pointer; }.avatar-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }.success, .err { margin: 8px 0 0; font-size: 12px; line-height: 20px; }.success { color: #1f2026; }.err { color: #ff0a30; }.legal { padding: 10px 4px; color: #a5a9b2; font-size: 10px; }
@media(max-width:350px) { .account-hero, .sheet { padding: 14px; }.settings { padding-top: 0; }.guest-hero h2 { font-size: 16px; }.face { width: 50px; height: 50px; }.quick-links { padding: 12px 2px; }.quick-links a { font-size: 11px; }.main-tabs button { font-size: 15px; }.career-summary .clock { font-size: 14px; } }
</style>
