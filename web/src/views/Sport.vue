<template>
  <main class="clubs-page">
    <header class="clubs-header"><div><p class="page-eyebrow">BETTER TOGETHER</p><h1>跑团<span>与同频的人，一起跑</span></h1></div><button type="button" class="find-shortcut" @click="focusDiscover"><RunnerIcon name="add" />找跑团</button></header>

    <section class="my-clubs">
      <div class="section-heading"><h2>我的跑团</h2><span v-if="ready">{{ clubs.length }} 个跑团 · 随时切换</span></div>
      <p v-if="loading && !clubs.length" class="loading-state" role="status">正在载入跑团…</p>
      <div v-if="!ready" class="club-panel login-guide">
        <span class="club-letter" aria-hidden="true">团</span>
        <div><h3>和跑友一起，跑得更远</h3><p>登录后查看我的跑团、申请加入并参加团内活动。收到口令也可以先查看跑团介绍。</p></div>
        <router-link class="club-primary" to="/mine">登录</router-link>
      </div>
      <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="club-panel my-club">
        <span class="club-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
        <div class="club-copy"><h3>{{ club.name }}</h3><p><span class="role-badge">{{ club.roleLabel }}</span><span v-if="club.members !== undefined">{{ club.members }} 位成员</span><span v-else>查看活动与跑友</span></p></div>
        <span class="enter-club" aria-hidden="true"><RunnerIcon name="arrow" /></span>
      </router-link>
      <div v-if="ready && !loading && !clubs.length && !loadFailed" class="club-panel no-club"><h3>还没有加入跑团</h3><p>搜一搜熟悉的跑团，或填写朋友分享的口令。</p></div>
    </section>

    <section v-if="pendingClubs.length" class="pending-clubs"><div class="section-heading"><h2>申请进度</h2><span>{{ pendingClubs.length }} 个待审核</span></div><router-link v-for="club in pendingClubs" :key="club.id" class="pending-row" :to="'/clubs/' + club.id + '/public'"><span class="pending-indicator"></span><span>{{ club.name }}<small>申请已送达团长与管理</small></span><b>待审核 ›</b></router-link></section>
    <section id="discover-clubs" class="discover club-panel">
      <div class="section-heading"><h2>找跑团</h2></div>
      <div class="modes" role="tablist" aria-label="查找方式">
        <button type="button" role="tab" :aria-selected="mode === 'search'" :class="{ on: mode === 'search' }" @click="pick('search')">搜索跑团</button>
        <button type="button" role="tab" :aria-selected="mode === 'code'" :class="{ on: mode === 'code' }" @click="pick('code')">跑团口令</button>
      </div>
      <div v-if="mode === 'code'" class="club-search">
        <span class="search-glyph" aria-hidden="true"></span>
        <input v-model="code" aria-label="跑团口令" placeholder="输入朋友分享的跑团口令" @keyup.enter="join" />
        <button type="button" @click="join">查看</button>
      </div>
      <div v-else class="club-search">
        <span class="search-glyph" aria-hidden="true"></span>
        <input v-model="query" aria-label="搜索跑团" placeholder="搜索跑团名称、团长" @input="onQuery" @keyup.enter="search" />
        <button type="button" @click="search">搜索</button>
      </div>
      <p class="hint">{{ mode === 'code' ? '先查看跑团介绍，再申请加入。' : '找到跑团后，申请由团长或跑团管理审核。' }}</p>
      <div v-if="message" class="directory-message" :class="{ error: loadFailed }" role="status"><p>{{ message }}</p><button v-if="loadFailed" type="button" @click="search">重新加载</button></div>
      <div v-if="mode === 'search'" class="club-results">
        <div v-for="club in shownClubs" :key="club.id" class="club-hit">
          <router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">
            <span class="club-letter result-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
            <span class="club-copy"><strong>{{ club.name }}</strong><small>{{ club.members }} 位成员<template v-if="club.leader"> · 团长 {{ club.leader }}</template></small></span>
          </router-link>
          <router-link class="result-action" :class="{ pending: club.pending && !club.joined }" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">{{ club.joined ? '进入' : club.pending ? '待审核' : '查看介绍' }}</router-link>
        </div>
        <p v-if="!loading && !loadFailed && !query.trim() && !openClubs.length" class="hint empty-directory">暂时没有其他跑团，试试朋友分享的口令。</p>
      </div>
      <button v-if="mode === 'search' && moreCount" class="more" type="button" @click="showAll = true">查看其余 {{ moreCount }} 个跑团</button>
    </section>

    <section class="create-club club-panel">
      <button class="create-toggle" type="button" :aria-expanded="creating" @click="creating = !creating"><span><b>创建跑团</b><small>让同频的跑友在这里集合</small></span><i>{{ creating ? '−' : '+' }}</i></button>
      <div v-if="creating" class="create-content">
        <p v-if="!ready" class="hint">登录后查看建团申请。<router-link to="/mine">去登录</router-link></p>
        <p v-else-if="!leader" class="hint">暂未开放建团申请。如需创建跑团，请联系平台管理员。</p>
        <template v-else>
          <p class="hint">提交申请，通过后即可管理成员、活动和组别。</p>
          <div v-if="application" class="application"><span>{{ application.name }}</span><b class="pending-label">待审核</b></div>
          <form v-else class="create-form" @submit.prevent="create"><input v-model="name" aria-label="跑团名称" placeholder="填写跑团名称" /><button class="club-primary" type="submit">提交申请</button></form>
        </template>
        <p v-if="foundingMessage" class="err">{{ foundingMessage }}</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import RunnerIcon from "../components/RunnerIcon.vue";

const router = useRouter();
const name = ref("");
const loading = ref(false);
const loadFailed = ref(false);
const leader = ref(false);
const creating = ref(false);
const application = ref(null);
const code = ref("");
const query = ref("");
const showAll = ref(false);
const mode = ref("search");
const foundingMessage = ref("");
const clubs = ref([]);
const openClubs = ref([]);
const listedQuery = ref("");
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const pendingClubs = computed(() => openClubs.value.filter((club) => club.pending && !club.joined));
async function focusDiscover() { await nextTick(); document.getElementById("discover-clubs")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
const shownClubs = computed(() => {
  if (query.value.trim() !== listedQuery.value) return [];
  return !showAll.value ? openClubs.value.slice(0, 6) : openClubs.value;
});
const moreCount = computed(() => {
  if (query.value.trim() !== listedQuery.value) return 0;
  return !showAll.value ? Math.max(0, openClubs.value.length - 6) : 0;
});
let queryTimer = 0;
let loadSeq = 0;

async function load() {
  const q = query.value.trim();
  const seq = ++loadSeq;
  loading.value = true;
  loadFailed.value = false;
  try {
    const requests = [api("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))];
    if (ready.value) requests.push(api("/me"));
    const [directory, data] = await Promise.all(requests);
    if (seq !== loadSeq) return;
    listedQuery.value = q;
    clubs.value = (data?.clubs || []).map((club) => ({
      ...club,
      members: (directory.clubs || []).find((item) => item.id === club.id)?.members ?? clubs.value.find((item) => item.id === club.id)?.members
    }));
    leader.value = Boolean(data?.user && data.user.leader);
    application.value = (data?.applications && data.applications[0]) || null;
    openClubs.value = (directory.clubs || []).filter((item) => q || !item.joined);
  } catch (err) {
    if (seq !== loadSeq) return;
    loadFailed.value = true;
    throw err;
  } finally { if (seq === loadSeq) loading.value = false; }
}

function pick(next) {
  mode.value = next;
  message.value = "";
  if (next === "search" && query.value.trim() && !openClubs.value.length) message.value = "没有找到这个跑团";
}

async function create() {
  foundingMessage.value = "";
  try {
    const data = await api("/clubs", { method: "POST", body: JSON.stringify({ name: name.value }) });
    if (data.pending) {
      name.value = "";
      foundingMessage.value = "已提交，等跑团管理员通过";
      await load();
      return;
    }
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    foundingMessage.value = err.message;
  }
}

function onQuery() {
  showAll.value = false;
  message.value = "";
  clearTimeout(queryTimer);
  queryTimer = setTimeout(search, query.value.trim() ? 200 : 0);
}

async function search() {
  clearTimeout(queryTimer);
  message.value = "";
  try {
    await load();
    if (query.value.trim() && !openClubs.value.length) message.value = "没有找到这个跑团";
  } catch (err) {
    message.value = err.message;
  }
}

async function join() {
  message.value = "";
  if (!code.value.trim()) {
    message.value = "填写群里的跑团口令";
    return;
  }
  router.push("/clubs/invite/" + encodeURIComponent(code.value.trim()));
}

onUnmounted(() => { clearTimeout(queryTimer); loadSeq++; });
onMounted(async () => {
  try {
    await load();
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.clubs-page { min-height: 100vh; padding-bottom: 20px; background: #f5f6f8; }
.clubs-page button, .clubs-page .club-primary, .clubs-page .result-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; line-height: 1.2; }
.clubs-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 24px; padding: 29px 19px 23px; background: linear-gradient(125deg,#fff 60%,#fff4f5); border-bottom: 1px solid #f0e9ec; }
.page-eyebrow { margin: 0 0 7px; color: #ad7e88; font-size: 9px; font-weight: 600; letter-spacing: 2px; }
.clubs-header h1 { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; color: #222630; font-size: 28px; font-weight: 750; line-height: 1.3; }
.clubs-header h1 span { color: #9a9198; font-size: 10px; font-weight: 450; }
.find-shortcut { flex: none; gap: 4px; padding: 0 12px; border: 1px solid #f1d5db; border-radius: 11px; background: #fff; color: var(--accent); font-size: 12px; font-weight: 600; }
.find-shortcut svg { width: 16px; height: 16px; }
.my-clubs, .pending-clubs { margin: 0 16px 24px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 1px 12px; }
.section-heading h2 { margin: 0; color: #252a35; font-size: 18px; font-weight: 700; }
.section-heading > span { color: #9b9fa8; font-size: 10px; }
.club-panel { padding: 17px; border-radius: 16px; background: #fff; }
.my-club { display: flex; align-items: center; gap: 13px; min-height: 94px; margin-top: 10px; border: 1px solid #eff0f3; color: var(--ink); transition: border-color .15s; }
.my-club:hover { border-color: #f0b7c1; }
.club-letter { display: grid; place-items: center; flex: none; width: 47px; height: 47px; border-radius: 15px 15px 15px 5px; background: #fff0f3; color: #ed4d67; font-size: 22px; font-weight: 700; }
.my-club:nth-of-type(3n) .club-letter { background: #eef2f7; color: #7f96af; }
.my-club:nth-of-type(3n+1) .club-letter { background: #f5eff6; color: #a388ab; }
.club-copy { flex: 1; min-width: 0; }
.club-copy h3, .club-copy strong, .login-guide h3, .no-club h3 { margin: 0; color: #292e39; font-size: 16px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.club-copy p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 7px 0 0; color: #9197a2; font-size: 11px; }
.role-badge { display: inline-flex; align-items: center; padding: 2px 6px; border: 1px solid #f0d5dc; border-radius: 5px; color: #b87080; font-size: 10px; line-height: 1.3; }
.enter-club { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: #f7f8fa; color: #aab0ba; }
.enter-club svg { width: 15px; height: 15px; }
.login-guide { display: grid; grid-template-columns: 47px minmax(0,1fr); gap: 12px; border: 1px solid #efe5e9; }
.login-guide p, .no-club p { margin: 8px 0 0; color: #8e95a1; font-size: 12px; line-height: 1.8; }
.login-guide .club-primary { grid-column: 1/-1; margin-top: 4px; }
.club-primary { padding: 0 16px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; }
.no-club { padding: 25px 20px; border: 1px dashed #dedfe6; background: #ffffff90; text-align: center; }
.pending-row { display: flex; align-items: center; gap: 10px; min-height: 72px; margin-top: 8px; padding: 14px; border-radius: 13px; background: #fff; color: #555e6c; font-size: 13px; }
.pending-row > span:nth-child(2) { display: grid; flex: 1; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.pending-row small { color: #a2a7b0; font-size: 11px; }
.pending-row b { flex: none; color: #bd9560; font-size: 11px; font-weight: 450; }
.pending-indicator { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #d5a769; }
.discover, .create-club { margin: 0 16px 16px; }
.discover { scroll-margin-top: 16px; }
.hint { margin: 11px 0 0; color: #949aa5; font-size: 11px; line-height: 1.8; }
.modes { display: flex; gap: 22px; margin: 0 0 15px; border-bottom: 1px solid #f0f1f5; }
.clubs-page .modes button { position: relative; padding: 0 1px; background: transparent; color: #9298a3; font-size: 13px; font-weight: 550; }
.modes button.on { color: #333945; font-weight: 650; }
.modes button.on::after { content: ''; position: absolute; right: 35%; bottom: -1px; left: 35%; height: 3px; border-radius: 3px; background: var(--accent); }
.club-search { display: flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 12px; border: 1px solid #eceef2; border-radius: 11px; background: #f7f8fa; }
.search-glyph { position: relative; flex: none; width: 13px; height: 13px; margin-right: 3px; border: 1.5px solid #a5acb7; border-radius: 50%; }
.search-glyph::after { content: ''; position: absolute; right: -4px; bottom: -2px; width: 5px; height: 1.5px; border-radius: 1px; background: #a5acb7; transform: rotate(45deg); }
.club-search input { flex: 1; width: 0; height: 44px; min-height: 0; padding: 0; border: 0; background: transparent; font-size: 12px; }
.club-search:focus-within { border-color: #f18ba0; }
.club-search input:focus { outline: none; }
.club-search button { flex: none; padding: 0 0 0 6px; color: var(--accent); font-size: 12px; font-weight: 650; }
.club-results { margin-top: 11px; }
.club-hit { display: flex; align-items: center; gap: 10px; min-height: 83px; border-bottom: 1px solid #f0f1f5; }
.club-hit:last-child { border-bottom: 0; }
.result-identity { display: flex; flex: 1; min-width: 0; align-items: center; gap: 11px; }
.result-letter { width: 37px; height: 37px; border-radius: 12px 12px 12px 4px; font-size: 17px; background: #f3f4f7; color: #8c94a5; }
.club-copy strong { font-size: 14px; font-weight: 550; }
.club-copy small { display: block; margin-top: 6px; color: #9ba1ac; font-size: 10px; font-weight: 400; line-height: 1.6; overflow-wrap: anywhere; }
.result-action { flex: none; padding: 0 9px; border-radius: 9px; color: #cf536a; background: #fff2f5; font-size: 11px; }
.result-action.pending, .pending-label { color: #ae8c60; background: #faf5ed; }
.more { display: flex!important; width: 100%; margin-top: 13px; border-top: 1px solid #f1f2f5; color: #9299a5; font-size: 12px; }
.create-toggle { justify-content: space-between!important; width: 100%; padding: 0; text-align: left; }
.create-toggle b { display: block; color: #4c5360; font-size: 14px; font-weight: 550; }
.create-toggle small { display: block; margin-top: 7px; color: #a4a9b2; font-size: 11px; }
.create-toggle i { color: #a3aab5; font-size: 23px; font-style: normal; font-weight: 300; }
.create-content { margin-top: 16px; padding-top: 10px; border-top: 1px solid #eff0f4; }
.create-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.create-form input { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #edf0f4; border-radius: 10px; background: #f7f8fa; font-size: 13px; }
.application { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 14px; }
.pending-label { padding: 3px 7px; border-radius: 5px; font-size: 11px; font-weight: 450; }
.loading-state { margin: 0; padding: 25px 15px; color: #a0a6b1; font-size: 12px; text-align: center; }
.directory-message { display: flex; align-items: center; gap: 8px; padding: 10px 0; color: #9299a5; font-size: 12px; }
.directory-message p { flex: 1; margin: 0; }
.directory-message.error { color: #c2546b; }
.directory-message button { color: var(--accent); font-size: 12px; }
@media (max-width: 350px) { .clubs-header { padding: 24px 15px 20px; } .clubs-header h1 span { display: block; width: 100%; margin-top: 3px; font-size: 10px; } .find-shortcut { padding: 0 10px; } .club-panel { padding: 14px; } .my-clubs,.pending-clubs { margin-right: 12px; margin-left: 12px; } .discover,.create-club { margin-right: 12px; margin-left: 12px; } .club-copy h3 { font-size: 15px; } .my-club { gap: 10px; } .club-search input { font-size: 11px; } }
</style>
