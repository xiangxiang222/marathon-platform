<template>
  <main class="mine">
    <PageHeader :title="section === 'settings' ? '设置' : '我的'" :subtitle="section === 'settings' ? '管理账号与使用偏好' : '每一程，都有记录'">
      <button v-if="section !== 'settings'" class="header-settings" type="button" aria-label="设置" @click="openSettings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.7 2.1-1.9 1.1L4.2 6l-2 3.5 1.3 1.8v2.2L2.2 15l2 3.5 2.2-.2 1.9 1.1L9 21h4l.7-1.6 1.9-1.1 2.2.2 2-3.5-1.3-1.5v-2.2l1.3-1.8-2-3.5-2.2.2-1.9-1.1L13 3Z"/><circle cx="11" cy="12" r="3"/></svg><span>设置</span></button>
      <button v-else class="header-settings" type="button" aria-label="返回我的" @click="closeSettings">‹ 返回</button>
    </PageHeader>
    <section v-if="section === 'settings'" class="sheet account-settings" aria-label="账号设置">
      <h2>账号与隐私</h2>
      <button v-if="nickname" class="setting-row" type="button" @click="section = 'profile'"><span>个人资料与账号<small>头像、昵称与登录密码</small></span><i aria-hidden="true">›</i></button>
      <router-link class="setting-row" to="/legal/privacy"><span>隐私政策</span><i aria-hidden="true">›</i></router-link>
      <router-link class="setting-row" to="/legal/rights"><span>个人信息权利</span><i aria-hidden="true">›</i></router-link>
      <button v-if="nickname" class="logout" type="button" @click="logout">退出登录</button>
      <button v-else class="primary settings-login" type="button" @click="settingsLogin">登录 / 注册</button>
    </section>
    <template v-else>
    <section v-if="nickname" class="account-hero">
      <div class="identity-panel">
        <div class="identity-copy">
          <span class="identity-kicker">个人档案</span>
          <div class="who-top">
            <img v-if="avatar" class="face" :src="avatar" :alt="nickname + ' 的头像'" />
            <span v-else class="face" aria-hidden="true">{{ nickname.slice(0, 1) }}</span>
            <div class="who-main"><h2 class="nick">{{ nickname }}</h2><p class="club-line">{{ clubs.length ? clubs[0].name + (clubs.length > 1 ? ` 等 ${clubs.length} 个跑团` : '') : '尚未加入跑团' }}</p><span v-if="leader" class="role">建团资格</span></div>
          </div>
        </div>

      </div>
      <div class="account-stats"><button type="button" @click="section = 'plans'"><b>{{ plans.length }}</b><span>已标记赛事</span></button><button type="button" @click="section = 'results'"><b>{{ finished }}</b><span>已完赛</span></button><router-link to="/clubs"><b>{{ clubs.length }}</b><span>已加入跑团</span></router-link></div>
    </section>
    <section v-else class="account-hero guest-hero">
      <div class="identity-panel guest-identity">
        <div class="identity-copy"><span class="identity-kicker">个人中心</span><h2>我的运动与赛事</h2><p>管理运动记录、参赛计划与跑团。</p></div>

      </div>
      <div class="guest-actions"><p>登录后收藏赛事、记录成绩，和跑团一起出发。</p><button class="primary hero-login" type="button" :aria-expanded="authOpen" @click="openAuth">{{ authOpen ? '收起登录' : '登录 / 注册' }}</button></div>
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
    <nav class="main-tabs" aria-label="个人中心"><button type="button" :class="{ on: section === 'overview' }" @click="section = 'overview'">总览</button><button type="button" :class="{ on: section === 'plans' }" @click="section = 'plans'">我的赛事</button><button type="button" :class="{ on: section === 'results' }" @click="section = 'results'">完赛记录</button><button type="button" :class="{ on: section === 'profile' }" @click="section = 'profile'">个人资料</button></nav>
    <RunnerDashboard v-if="section === 'overview' && nickname" :data="runnerData" :plans="plans" :loading="runnerLoading" :error="runnerError" @retry="loadRunner"><template #career-actions><div class="compact-poster"><span>{{ posterAvailable ? '已收录自己的完赛成绩' : '记录完赛后可制作成绩海报' }}</span><router-link v-if="posterAvailable" :to="posterRoute">制作成绩海报 <i aria-hidden="true">↗</i></router-link><button v-else type="button" @click="section = 'results'">去记录成绩 ›</button></div></template></RunnerDashboard>
    <section v-else-if="section === 'overview'" class="sheet empty-state"><h3>登录，查看自己的运动档案</h3><p>跑量、参赛计划与完赛成绩集中管理。</p><router-link to="/">去发现下一场比赛 ›</router-link></section>
    <template v-else-if="section === 'plans'">
      <section v-if="conflicts.length" class="sheet"><h3>比赛安排提醒</h3><p v-for="item in conflicts" :key="item.text" class="notice">{{ item.text }}</p></section>
      <section v-if="reminders.length" class="sheet"><h3>截止提醒</h3><router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind-line" :to="'/races/' + item.race.id"><b>{{ item.hit.reason }}</b><span>{{ item.race.name }}</span><i>›</i></router-link></section>
      <section v-if="plans.length" class="sheet plan-list"><router-link v-for="item in plans" :key="item.race.id" class="plan-row" :to="'/races/' + item.race.id"><div><span class="plan-state">{{ item.status }}</span><h3>{{ item.race.name }}</h3><p>{{ item.race.raceDate }}<template v-if="item.race.city"> · {{ item.race.city }}</template></p></div><i>›</i></router-link></section>
      <section v-else class="sheet empty-state"><h3>{{ nickname ? '下一场，想去哪里跑？' : '把想跑的比赛放进这里' }}</h3><p>{{ nickname ? '在赛事详情页标记报名或中签状态，随时查看参赛安排。' : '登录后，你标记的比赛会自动汇总在这里。' }}</p><router-link to="/">去看赛事 ›</router-link></section>
    </template>
    <template v-else-if="section === 'results'">
      <section class="sheet career-summary"><div><span>完赛场数</span><b>{{ nickname ? finished : '—' }}<small> 场</small></b></div><div><span>半马最好成绩</span><b class="clock">{{ career.pb.half || '—' }}</b></div><div><span>全马最好成绩</span><b class="clock">{{ career.pb.full || '—' }}</b></div><div v-if="nickname" class="compact-poster"><span>{{ posterAvailable ? '把自己的成绩，留作纪念' : '在赛事详情页记下完赛成绩，即可制作海报' }}</span><router-link v-if="posterAvailable" :to="posterRoute">制作成绩海报 <i aria-hidden="true">↗</i></router-link><router-link v-else to="/">去看赛事 ›</router-link></div></section>
      <nav class="subtabs result-tabs"><button type="button" :class="{ on: tab === 'honor' }" @click="tab = 'honor'">成绩</button><button type="button" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">证书影像</button><button type="button" :class="{ on: tab === 'time' }" @click="tab = 'time'">赛事足迹</button></nav>
      <section v-if="tab === 'honor'" class="sheet">
        <div v-if="years.length" class="chips"><button type="button" :class="{ on: mapYear === '' }" @click="mapYear = ''">全部</button><button v-for="year in years" :key="year" type="button" :class="{ on: mapYear === year }" @click="mapYear = year">{{ year }}</button></div>
        <div v-for="group in honorGroups" :key="group.year" class="result-group"><h3>{{ group.year }}</h3><router-link v-for="item in group.items" :key="item.race.id + item.distance" class="result-row" :to="'/races/' + item.race.id"><b>{{ item.clock }}<small v-if="item.pb"> PB</small></b><span>{{ item.race.name }}</span><p>{{ item.race.raceDate }}</p></router-link></div>
        <p v-if="!results.length" class="empty-copy">在赛事详情页记下完赛成绩，留住你的每次突破。</p>
      </section>
      <section v-else-if="tab === 'photo'" class="sheet"><router-link v-for="item in proofResults" :key="item.race.id + item.distance" class="proof-card" :to="'/races/' + item.race.id"><img :src="proofSrc(item.race.id, item.distance)" :alt="item.race.name + ' 成绩影像'"/><b>{{ item.proofLabel }} · 未核验</b><span>{{ item.race.name }}</span></router-link><p v-if="!proofResults.length" class="empty-copy">在赛事详情页上传证书或奖牌照片，建立自己的完赛相册。</p></section>
      <section v-else class="sheet"><p v-if="career.finished" class="hint">跑过 {{ career.provinces.length }} 个省、{{ career.cities.length }} 个城市 · 本年比赛 {{ career.yearKm }} 公里</p><div class="chips"><button v-for="item in [{id:'all',label:'全部'},{id:'road',label:'路跑'},{id:'trail',label:'越野'},{id:'other',label:'其他'}]" :key="item.id" type="button" :class="{ on: kindFilter === item.id }" @click="kindFilter = item.id">{{ item.label }}</button></div><router-link v-for="item in timeline" :key="item.race.id + item.distance" class="result-row" :to="'/races/' + item.race.id"><p>{{ item.race.raceDate }}</p><span>{{ item.race.name }}</span><b>{{ item.clock }}</b></router-link><p v-if="!timeline.length" class="empty-copy">你的赛事足迹，从第一条完赛记录开始。</p></section>
    </template>
    <section v-else-if="nickname" class="settings profile-settings">
      <div class="profile-settings-intro"><span class="profile-settings-kicker">账号与身份</span><h2 class="profile-settings-title">个人资料</h2><p class="profile-settings-note">管理你的头像、昵称和登录方式</p></div>
      <div class="profile-section">
        <div class="profile-section-title"><span class="profile-section-icon profile-section-icon-user" aria-hidden="true"></span><div><h3>公开资料</h3><small>跑团成员可以看到这些信息</small></div></div>
        <button class="setting-row profile-row" type="button" :aria-expanded="profileOpen" @click="profileOpen = !profileOpen"><span>修改头像与昵称<small>{{ nickname }} · 点击编辑资料</small></span><i>{{ profileOpen ? '⌄' : '›' }}</i></button>
      </div>
      <form v-if="profileOpen" class="auth-form profile-form" @submit.prevent="saveProfile"><label>昵称<input v-model="nicknameEdit" maxlength="20" autocomplete="nickname" /></label><div class="avatar-edit"><img v-if="avatarEdit" :src="avatarEdit" alt="头像预览" /><span v-else class="avatar-empty">{{ nicknameEdit.slice(0, 1) || '跑' }}</span><label class="avatar-choice">选择头像<input type="file" accept="image/jpeg,image/png,image/webp" @change="chooseAvatar" /></label></div><button class="primary" type="submit">保存资料</button><p v-if="profileMessage" :class="profileSaved ? 'success' : 'err'">{{ profileMessage }}</p></form>
      <div class="profile-section">
        <div class="profile-section-title"><span class="profile-section-icon profile-section-icon-lock" aria-hidden="true"></span><div><h3>账号安全</h3><small>保护你的赛事与运动记录</small></div></div>
        <button class="setting-row profile-row" type="button" :aria-expanded="passwordOpen" @click="togglePassword"><span>{{ hasPassword ? '修改密码' : '设置登录密码' }}<small>{{ hasPassword ? '定期更新密码，保障账号安全' : '设置密码后可在其他设备登录' }}</small></span><i>{{ passwordOpen ? '⌄' : '›' }}</i></button>
      </div>
      <form v-if="passwordOpen" class="auth-form" @submit.prevent="savePassword"><p class="hint">{{ hasPassword ? '请填写当前密码和新密码。' : '设置后，可使用昵称与密码在其他设备登录。' }}</p><input v-if="hasPassword" v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" /><input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，8 到 128 位" /><input v-model="nextPassword2" type="password" autocomplete="new-password" placeholder="再输入一次" /><button class="primary" type="submit">保存密码</button><button class="secondary" type="button" @click="cancelPassword">取消</button></form>
      <p v-if="message" :class="ok ? 'success' : 'err'">{{ message }}</p>
      <div v-if="clubs.length" class="profile-section profile-clubs-section">
        <div class="profile-section-title"><span class="profile-section-icon profile-section-icon-club" aria-hidden="true"></span><div><h3>我的跑团</h3><small>你加入的跑团与身份</small></div></div>
        <router-link v-for="club in clubs" :key="club.id" class="setting-row club-setting profile-row" :to="'/clubs/' + club.id"><span>{{ club.name }}<small>{{ club.roleLabel }}</small></span><i>›</i></router-link>
      </div>
    </section>
    <section v-else class="sheet empty-state"><h3>你的资料，由你管理</h3><p>登录后设置头像、昵称和账号密码。</p><button class="text-action" type="button" @click="openAuth">去登录 ›</button></section>
    <router-link v-if="section === 'overview'" class="feedback-entry" :to="feedbackUnread ? '/feedback?mine=1' : '/feedback'"><span class="feedback-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-9a10 10 0 0 1 10-10h1M17 3v8m-4-4h8"/></svg></span><span><b>共创建议<span v-if="feedbackUnread" class="feedback-entry-unread">{{ feedbackUnread > 99 ? '99+' : feedbackUnread }} 条新进度</span></b><small>提建议 · 为好想法投票 · 查看采纳进度</small></span><i aria-hidden="true">↗</i></router-link>
    </template>
    <footer class="legal"><nav aria-label="协议与隐私"><router-link to="/legal/terms">用户协议</router-link><router-link to="/legal/privacy">隐私政策</router-link><router-link to="/legal/collection">个人信息收集清单</router-link><router-link to="/legal/sharing">第三方信息共享清单</router-link><router-link to="/legal/rights">个人信息权利</router-link></nav><p>{{ company }} · {{ icp }}</p></footer>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, resultProofSrc } from "../api";
import PageHeader from "../components/PageHeader.vue";
import RunnerDashboard from "../components/RunnerDashboard.vue";
import { normalizeResults } from "../achievement-model";
const passportImage = `${import.meta.env.BASE_URL}images/art-passport.png`;
const posterImage = `${import.meta.env.BASE_URL}images/art-poster.png`;

import calendarIcon from "../assets/quick/calendar.svg";
import radarIcon from "../assets/quick/radar.svg";
import clubsIcon from "../assets/quick/clubs.svg";
import newsIcon from "../assets/quick/news.svg";
const router = useRouter();
const section = ref("overview");
let settingsReturn = "overview";
function openSettings() { settingsReturn = section.value; section.value = "settings"; }
function closeSettings() { section.value = settingsReturn === "settings" ? "overview" : settingsReturn; }
function settingsLogin() { closeSettings(); if (!authOpen.value) openAuth(); }
const posterRoute = { path: "/achievement-poster", query: { returnTo: "/mine", mode: "results" } };
const posterAvailable = computed(() => Boolean(nickname.value) && normalizeResults(runnerData.value).length > 0);
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
const quickLinks = [{to:"/calendar",label:"赛事日历",icon:calendarIcon},{to:"/radar",label:"拿奖雷达",icon:radarIcon},{to:"/clubs",label:"发现跑团",icon:clubsIcon},{to:"/news",label:"跑圈资讯",icon:newsIcon}];
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
  localStorage.removeItem("marathon_avatar");
  localStorage.removeItem("marathon_return_after_login");
  nickname.value = "";
  avatar.value = "";
  avatarEdit.value = "";
  nicknameEdit.value = "";
  profileOpen.value = false;
  profileMessage.value = "";
  profileSaved.value = false;
  draft.value = "";
  password.value = "";
  password2.value = "";
  captcha.value = "";
  captchaToken.value = "";
  captchaImage.value = "";
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
  const sessionToken = localStorage.getItem("marathon_token");
  const accountId = accountRequest;
  if (!sessionToken) return;
  profileMessage.value = "";
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    profileMessage.value = "请选择 JPG、PNG 或 WebP 图片";
    event.target.value = "";
    return;
  }
  const source = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (accountId !== accountRequest || sessionToken !== localStorage.getItem("marathon_token")) { URL.revokeObjectURL(source); return; }
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
    if (accountId === accountRequest && sessionToken === localStorage.getItem("marathon_token")) profileMessage.value = "无法读取这张图片";
  };
  image.src = source;
  event.target.value = "";
}

async function saveProfile() {
  const sessionToken = localStorage.getItem("marathon_token");
  const accountId = accountRequest;
  if (!sessionToken) return;
  profileMessage.value = "";
  profileSaved.value = false;
  try {
    const data = await api("/me/profile", {
      method: "PUT",
      body: JSON.stringify({ nickname: nicknameEdit.value.trim(), avatar: avatarEdit.value })
    });
    if (accountId !== accountRequest || sessionToken !== localStorage.getItem("marathon_token")) return;
    nickname.value = data.user.nickname;
    nicknameEdit.value = data.user.nickname;
    avatar.value = data.user.avatar || "";
    avatarEdit.value = data.user.avatar || "";
    localStorage.setItem("marathon_name", data.user.nickname);
    profileSaved.value = true;
    profileMessage.value = "个人资料已保存";
  } catch (err) {
    if (accountId === accountRequest && sessionToken === localStorage.getItem("marathon_token")) profileMessage.value = err.message;
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
  const sessionToken = localStorage.getItem("marathon_token");
  const accountId = accountRequest;
  if (!sessionToken) return;
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
    if (accountId !== accountRequest || sessionToken !== localStorage.getItem("marathon_token")) return;
    hasPassword.value = true;
    currentPassword.value = "";
    nextPassword.value = "";
    nextPassword2.value = "";
    passwordOpen.value = false;
    ok.value = true;
    message.value = "密码已更新";
  } catch (err) {
    if (accountId === accountRequest && sessionToken === localStorage.getItem("marathon_token")) message.value = err.message;
  }
}

onMounted(() => { load(); loadLegalVersion(); });
</script>

<style scoped>
.auth-form .auth-legal{padding:5px 0 9px}.auth-form .auth-legal label{display:flex;align-items:flex-start;gap:9px;color: var(--muted);font-size:12px;line-height:1.9;cursor:pointer}.auth-form .auth-legal input[type=checkbox]{width:17px;height:17px;min-height:17px;flex:none;margin:3px 0 0;accent-color:var(--accent)}.auth-legal p{display:flex;flex-wrap:wrap;gap:10px;margin:7px 0 6px;padding-left:26px;font-size:12px;line-height:1.9}.auth-legal a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}.auth-legal small{display:block;padding-left:26px;color:var(--muted);font-size:12px;line-height:1.9}.legal nav{display:flex;flex-wrap:wrap;gap:2px 15px}.legal nav a{min-height:36px;display:flex;align-items:center;color:var(--muted);font-size:12px}.legal p{margin:8px 0;line-height:1.8}
.feedback-entry-unread{display:inline-block;margin-left:6px;padding:1px 5px;vertical-align:middle;border-radius:5px;background:var(--accent);color:white;font-size:12px;font-weight:500;line-height:1.7}.feedback-entry b{display:flex!important;align-items:center;gap:3px;flex-wrap:wrap}.feedback-entry small{color:var(--muted)!important}
.feedback-entry {display:flex;align-items:center;gap:12px;margin:16px 0 12px;color: var(--ink)}.feedback-entry-icon{display:grid;place-items:center;width:35px;height:37px;border-radius:11px;flex:none}.feedback-entry-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.feedback-entry>span:nth-child(2){flex:1;min-width:0}.feedback-entry b{display:block;font-size:14px;font-weight:600;line-height:1.7}.feedback-entry small{display:block;line-height:1.9;color:var(--muted);margin-top:3px}.feedback-entry i{font-size:24px;color:var(--accent);font-style:normal;flex:none}
.account-hero, .sheet, .quick-links { margin: 0 0 12px; padding: 18px; border-radius:12px; background: #fff; box-shadow:none;  border: 1px solid var(--line);}.face { place-items: center; font-weight: 600; }.club-line, .guest-hero p { margin: 5px 0 0; color: var(--muted); font-size:12px; line-height: 18px; }.hero-settings { align-self: center; color: var(--muted); font-size:24px; }.account-stats { margin-top: 20px; }.account-stats button, .account-stats a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }.guest-hero h2 { line-height: 1.5; }.guest-face svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.6; }.hero-login { width: 100%; margin-top: 16px; }
.quick-links { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); padding: 14px 6px; }.quick-links a { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; font-size:12px; }.quick-links img { width: 36px; height: 36px; }.main-tabs { grid-template-columns: repeat(4,minmax(0,1fr)); border-bottom: 1px solid var(--line); }
h3 { margin: 0; font-size:16px; line-height: 24px; font-weight: 600; }.hint, .empty-copy { margin: 8px 0; color: var(--muted); font-size:12px; line-height: 20px; }.notice { margin: 8px 0 0; color: var(--accent); font-size:12px; line-height: 20px; }.remind-line { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size:14px; }.remind-line:last-child { border: 0; padding-bottom: 0; }.remind-line b { flex: none; color: var(--accent); font-weight: 500; }.remind-line span { flex: 1; min-width: 0; }.remind-line i, .plan-row i, .setting-row i { flex: none; color: var(--muted); font-size:24px; font-style: normal; }.plan-list { padding-top: 0; padding-bottom: 0; }.plan-row { display: flex; align-items: center; gap: 12px; }.plan-row:last-child { border: 0; }.plan-row > div { flex: 1; min-width: 0; }.plan-row h3 { margin: 6px 0; }.plan-row p, .result-row p { margin: 4px 0 0; color: var(--muted); font-size:12px; }.plan-state { display: inline-block; background: var(--accent-soft); color: var(--accent); }.empty-state { padding: 28px 20px; text-align: center; }.empty-state p { margin: 8px 0 16px; color: var(--muted); font-size:12px; line-height: 20px; }.empty-state a, .text-action { color: var(--accent); font-size:14px; }
.career-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }.career-summary span { display: block; color: var(--muted); font-size:12px; }.career-summary b { display: block; margin-top: 8px; font-weight: 600; }.career-summary small { font-size:12px; font-weight: 400; }.career-summary .clock { padding-top: 6px; font-size:16px; }.subtabs { display: flex; align-items: center; gap: 20px; }.subtabs button { min-height: 40px; color: var(--muted); font-size:14px; }.subtabs button.on { color: var(--accent); font-weight: 600; }.result-tabs { margin: -4px 12px 8px; }.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }.chips button { min-height: 30px; padding: 0 10px; border-radius:6px; background: var(--card); color: var(--muted); font-size:12px;  border: 1px solid var(--line);}.chips button.on { background: var(--accent-soft); color: var(--accent); }.result-group + .result-group { margin-top: 20px; }.result-group h3 { font-size:14px; }.result-row { display: flex; flex-direction: column; gap: 6px; padding: 14px 0; border-bottom: 1px solid var(--line); }.result-row:last-child { border: 0; }.result-row b { color: var(--accent); font-size:18px; font-weight: 600; }.result-row small { font-size:12px; }.result-row span { font-size:14px; line-height: 22px; }.proof-card { display: block; margin-bottom: 16px; }.proof-card img { display: block; width: 100%; border-radius:8px; }.proof-card b, .proof-card span { display: block; margin-top: 6px; font-size:14px; }.proof-card span { color: var(--muted); }
.settings { padding-top: 0; }.setting-row { gap: 12px; font-size:14px; }.setting-row span { min-width: 0; overflow-wrap: anywhere; }.setting-row small { display: block; margin-top: 3px; }.logout { width: 100%; min-height: 44px; margin-top: 12px; color: var(--muted); font-size:14px; }.auth-form { display: flex; flex-direction: column; gap: 10px; padding: 12px 0; }.auth-form input { display: block; width: 100%; min-width: 0; height: 44px; padding: 0 12px; border: 0; border-radius:8px; background: var(--bg); font-size:14px; outline: none; }.auth-form > label { color: var(--muted); font-size:12px; }.auth-form > label input { margin-top: 6px; }.primary { min-height: 44px; padding: 0 16px; border-radius:8px; background: var(--accent); color: #fff; font-size:14px; font-weight: 600; }.secondary { min-height: 40px; border-radius:8px; background: var(--chip); font-size:14px; }.captcha { display: grid; place-items: center; min-height: 48px; background: var(--bg); border-radius:8px; color: var(--muted); font-size:12px; }.captcha img { height: 44px; max-width: 100%; }.avatar-edit { display: flex; align-items: center; gap: 12px; }.avatar-edit img, .avatar-empty { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; color: var(--accent); background: var(--accent-soft); font-size:18px; }.avatar-choice { padding: 10px 12px; border-radius:8px; background: var(--chip); font-size:14px; cursor: pointer; }.avatar-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }.success, .err { margin: 8px 0 0; font-size:12px; line-height: 20px; }.success { color: var(--ink); }.err { color: var(--accent); }.legal { padding: 10px 4px; color: var(--muted); font-size:12px; }
@media(max-width:350px) { .account-hero, .sheet { padding: 14px; }.settings { padding-top: 0; }.guest-hero h2 {  line-height: 1.5;}.quick-links { padding: 12px 2px; }.quick-links a { font-size:12px; }.career-summary .clock { font-size:14px; } }


/* Settings and poster tools share the same quiet account-page hierarchy. */
.header-settings{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:none;min-width:44px;min-height:44px;padding:0 7px;color:var(--ink);font-size:14px;font-weight:500}.header-settings svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.account-settings h2{margin:0 0 12px;font-size:16px;font-weight:600}.account-settings .setting-row{min-height:60px}.account-settings .logout{display:flex;align-items:center;justify-content:center;min-height:48px;margin-top:24px;border:1px solid var(--line);border-radius:12px;color:var(--accent);background:var(--card,#fff);font-weight:500}.settings-login{width:100%;margin-top:20px}.compact-poster{font-size:12px;line-height:1.6}.compact-poster>a,.compact-poster>button{display:inline-flex;align-items:center;gap:5px;font-weight:500}.compact-poster i{font-style:normal}.career-summary>.compact-poster{grid-column:1/-1}.career-summary .compact-poster span{display:inline;color:var(--muted)}

.mine > .account-hero, .mine > .account-settings { position: relative; margin-top: -20px; }

/* Archive content uses the same hierarchy as race detail and exercise. */
.sheet,.quick-links,.feedback-entry{border-radius:12px}.main-tabs button,.subtabs button,.chips button,.setting-row,.primary,.secondary,.avatar-choice,.text-action,.compact-poster>a,.compact-poster>button{min-height:44px;font-size:14px}.setting-row{font-size:16px;line-height:1.6}.account-settings h2,.sheet h3{font-size:18px;line-height:1.5}.plan-row h3,.result-row span{font-size:16px;line-height:1.6}.auth-form input{height:46px;font-size:14px;border-radius:10px}.primary,.secondary,.avatar-choice,.account-settings .logout{border-radius:10px}.career-summary .clock{font-size:18px}.empty-state p{font-size:14px;line-height:1.75}

/* A compact identity panel leads into the personal workspace. */
.mine{max-width:760px;margin:0 auto;font-family:inherit}
.mine>.account-hero,.mine>.account-settings{margin-top:0}
.account-hero{padding:0}
.cover-frame{position:relative;isolation:isolate;height:166px;overflow:hidden;background:#1a1a1a}
.cover-image{position:absolute;z-index:-2;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 54%}
.cover-shade{position:absolute;z-index:-1;inset:0;background:#fff}
.cover-copy,.guest-cover-copy{position:absolute;inset:auto 18px 17px;color:#fff}
.cover-kicker{display:block;margin-bottom:11px;color:rgba(255,255,255,.84);font-size:12px;font-weight:600;line-height:1.4;letter-spacing:normal}
.face{place-items:center;font-weight:600}.nick{color:#fff}
.club-line{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.role{line-height:1.4}
.account-stats button,.account-stats a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;min-height:44px}
.account-stats button+button,.account-stats button+a{border-left:1px solid var(--line)}
.account-stats b{font-variant-numeric:tabular-nums}
.account-stats span{line-height:1.4;white-space:nowrap}
.guest-cover{height:176px}.guest-cover-copy{inset:18px auto auto 18px;max-width:calc(100% - 36px)}
.guest-cover-copy .cover-kicker{margin-bottom:18px}.guest-cover-copy h2{margin:0;font-size:24px;line-height:1.35;font-weight:600}
.guest-cover-copy p{margin:6px 0 0;color:rgba(255,255,255,.88);font-size:14px;line-height:1.55}.guest-actions>p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}
.hero-login{width:100%;min-height:46px;margin-top:12px;border-radius:8px;font-size:14px;font-weight:500}
.primary{min-height:44px;border-radius:8px;font-size:14px;font-weight:500}
.main-tabs{position:relative;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}
.sheet{margin:0 0 14px}
.sheet h3{font-size:18px;line-height:1.4;font-weight:600}.hint,.empty-copy{font-size:13px;line-height:1.65}
.plan-row h3,.result-row span{font-size:16px;line-height:1.5;font-weight:500}
.career-summary{grid-template-columns:repeat(3,minmax(0,1fr));padding:15px 12px}.career-summary .clock{padding-top:3px;font-size:16px;white-space:nowrap;font-variant-numeric:tabular-nums}.career-summary b{font-variant-numeric:tabular-nums}
.result-tabs{gap:14px;margin:0 0 8px;overflow-x:auto;scrollbar-width:none}.result-tabs::-webkit-scrollbar{display:none}.result-tabs button{flex:none;min-height:44px;font-size:14px}
.chips{gap:6px}.chips button{min-height:34px;padding:0 11px;border-radius:6px;font-size:12px}.result-row{padding:13px 0}.result-row span{overflow-wrap:anywhere}
.settings{padding-top:2px}.setting-row{font-size:15px}.auth-form{gap:10px}.auth-form input{height:46px;border:1px solid var(--line);border-radius:8px;background:var(--field-bg);font-size:14px}.captcha{min-height:48px;border-radius:8px}
.quick-links{grid-template-columns:repeat(4,minmax(0,1fr));padding:9px 4px;border:1px solid var(--line);border-radius:10px}.quick-links a{min-height:54px;justify-content:center;font-size:12px}.quick-links img{width:28px;height:28px}
.feedback-entry{min-height:62px;margin:12px 0 0}.feedback-entry b{font-size:14px}.feedback-entry small{line-height:1.5}.feedback-entry-unread{font-size:12px}
.legal{padding:14px 2px}.legal nav a{min-height:32px;font-size:12px}
@media(max-width:350px){.mine{padding-right:12px;padding-left:12px}:deep(.page-header){margin-right:-12px;margin-left:-12px}.cover-frame{height:152px}.guest-cover{height:164px}.cover-copy,.guest-cover-copy{right:14px;left:14px;bottom:14px}.guest-cover-copy{top:15px;bottom:auto}.guest-cover-copy h2{font-size:22px}.account-stats{padding-right:0;padding-left:0}.career-summary{padding:13px 9px}.career-summary .clock{font-size:15px}.result-tabs{gap:10px}}
.identity-panel{align-items:center;gap:8px;color:var(--ink)}
.identity-copy{flex:1}.identity-kicker{margin-bottom:12px;color:var(--muted);font-size:12px;font-weight:400;line-height:1.5}
.profile-art{display:block;flex:none;width:80px;height:88px;object-fit:contain}
.identity-panel .face{width:45px;height:45px;border:0;background:var(--accent-soft);color:var(--accent);font-size:18px}
.identity-panel .nick{font-size:18px;line-height:1.35;color:var(--ink)}
.identity-panel .club-line{margin-top:5px;color:var(--muted);font-size:12px;line-height:1.5}
.identity-panel .role{background:var(--accent-soft);color:var(--accent)}
.guest-identity{min-height:130px}.guest-identity h2{margin:0;font-size:22px;line-height:1.35;font-weight:600}.guest-identity p{margin:7px 0 0;font-size:12px;line-height:1.6;color:var(--muted)}
.guest-actions{padding-top:10px}
.compact-poster>.poster-art{display:block;flex:none;width:38px;height:40px;object-fit:contain}
@media(max-width:350px){.identity-panel{padding-left:14px}.identity-panel .who-top{gap:8px}.identity-panel .face{width:40px;height:40px;font-size:17px}.identity-panel .nick{font-size:17px}.profile-art{width:64px;height:78px}.guest-identity h2{font-size:20px}.compact-poster>.poster-art{width:32px;height:36px}}
.legal nav a{min-height:44px;font-size:12px}.legal p{font-size:12px}.chips button{min-height:44px}.setting-row{font-size:16px}

.account-hero { margin-bottom: 12px; }
.identity-kicker { margin-bottom: 9px; }
.profile-art { width: 66px; height: 75px; }
.main-tabs { margin-bottom: 12px; }
.main-tabs button { height: 38px; }
.main-tabs button.on { border-radius:8px; }
.main-tabs button.on::after { display: none; }
.plan-list { padding: 0 13px; }
.plan-row { gap: 8px; }
.plan-row h3 { margin: 5px 0 0; }
.plan-row p { margin-top: 5px; line-height: 1.5; }
.plan-state { line-height: 1.5; }
.plan-row i { color: #999; font-size:22px; }
.profile-settings.sheet { padding: 0; border: 0; border-radius:0; background: transparent; }
.profile-settings-kicker { color: var(--accent); font-size:12px; line-height: 1.5; }
.profile-settings-title { margin: 3px 0 0; color: var(--ink); font-weight: 600; line-height: 1.4; }
.profile-settings-note { margin: 3px 0 0; color: #999; line-height: 1.6; }
.profile-section { margin-bottom: 10px; }
.profile-section-title { display: flex; align-items: center; gap: 8px; padding-bottom: 9px; }
.profile-section-title > div { min-width: 0; }
.profile-section-title h3 { margin: 0; color: #777; line-height: 1.5; }
.profile-section-title small { margin-top: 2px; color: #999; font-size:12px; line-height: 1.5; }
.profile-section-icon { position: relative; width: 32px; height: 32px; flex: none; border-radius:10px; background: #f5f5f5; color: #ff1838; }
.profile-section-icon::before,.profile-section-icon::after { display: block; position: absolute; box-sizing: border-box; content: ''; }
.profile-section-icon-user::before { top: 7px; left: 13px; width: 7px; height: 7px; border: 1.5px solid currentColor; border-radius: 50%; }
.profile-section-icon-user::after { bottom: 6px; left: 9px; width: 15px; height: 9px; border: 1.5px solid currentColor; border-radius:8px 8px 3px 3px; }
.profile-section-icon-lock { color: #ff1838; background: #f5f5f5; }
.profile-section-icon-lock::before { top: 6px; left: 11px; width: 10px; height: 11px; border: 1.5px solid currentColor; border-radius:7px 7px 0 0; }
.profile-section-icon-lock::after { top: 14px; left: 8px; width: 16px; height: 12px; border: 1.5px solid currentColor; border-radius:3px; background: #f5f5f5; }
.profile-section-icon-club { color: #777; background: #f5f5f5; }
.profile-section-icon-club::before { top: 7px; left: 11px; width: 8px; height: 8px; border: 1.5px solid currentColor; border-radius: 50%; }
.profile-section-icon-club::after { bottom: 6px; left: 7px; width: 19px; height: 10px; border: 1.5px solid currentColor; border-radius:9px 9px 3px 3px; }
.profile-row { min-height: 56px; padding: 9px 1px 0; gap: 8px; border-top: 1px solid #f5f5f5; border-bottom: 0; font-size:14px; font-weight: 500; }
.profile-row small { margin-top: 4px; color: #999; font-size:12px; font-weight: 400; line-height: 1.6; }
.profile-row i { color: #999; font-size:22px; }
.profile-settings .auth-form { margin: -4px 0 10px; padding: 14px; border: 1px solid var(--line); border-radius:12px; background: #fff; }
.profile-clubs-section { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.profile-clubs-section .profile-section-title { grid-column: 1 / -1; padding-bottom: 2px; }
.profile-clubs-section .profile-row { min-height: 70px; padding: 10px 8px; border: 0; border-radius:10px; background: #f5f5f5; font-size:13px; }
.profile-clubs-section .profile-row small { margin-top: 3px; font-size:12px; }
.profile-clubs-section .profile-row i { font-size:18px; }
@media(max-width:350px) { .profile-art { width: 59px; height: 70px; } .profile-clubs-section { gap: 6px; } .profile-clubs-section .profile-row { padding: 8px 7px; font-size:12px; } }
</style>

<style scoped src="../personal-ui.css"></style>
