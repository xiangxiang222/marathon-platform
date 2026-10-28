<template>
  <main class="clubs-page">
    <PageHeader title="跑团" subtitle="找到同频的跑友" />

    <section class="my-clubs">
      <div class="section-heading"><h2>我的跑团</h2><span v-if="ready">{{ clubs.length }} 个跑团</span></div>
      <div v-if="!ready" class="club-panel login-guide">
        <span class="club-letter" aria-hidden="true">团</span>
        <div><h3>和跑友一起，跑得更远</h3><p>登录后查看我的跑团、申请加入并参加团内活动。收到口令也可以先查看跑团介绍。</p></div>
        <router-link class="club-primary" to="/mine">登录</router-link>
      </div>
      <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="club-panel my-club">
        <span class="club-letter" aria-hidden="true">团</span>
        <div class="club-copy"><h3>{{ club.name }}</h3><p><span class="role-badge">{{ club.roleLabel }}</span><span v-if="club.members !== undefined">{{ club.members }} 位成员</span><span v-else>口令 {{ club.code }}</span></p></div>
        <span class="enter-club">进入 <i>›</i></span>
      </router-link>
      <div v-if="ready && !clubs.length" class="club-panel no-club"><h3>还没有加入跑团</h3><p>搜一搜熟悉的跑团，或填写朋友分享的口令。</p></div>
    </section>

    <section class="discover club-panel">
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
      <p v-if="message" class="err">{{ message }}</p>
      <div v-if="mode === 'search'" class="club-results">
        <div v-for="club in shownClubs" :key="club.id" class="club-hit">
          <router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">
            <span class="club-letter result-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
            <span class="club-copy"><strong>{{ club.name }}</strong><small>{{ club.members }} 位成员<template v-if="club.leader"> · 团长 {{ club.leader }}</template></small></span>
          </router-link>
          <router-link class="result-action" :class="{ pending: club.pending && !club.joined }" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">{{ club.joined ? '进入' : club.pending ? '待审核' : '查看介绍' }}</router-link>
        </div>
        <p v-if="!query.trim() && !openClubs.length" class="hint empty-directory">暂时没有其他跑团，试试朋友分享的口令。</p>
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
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import PageHeader from "../components/PageHeader.vue";

const router = useRouter();
const name = ref("");
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

onMounted(async () => {
  try {
    await load();
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.clubs-page { min-height: 100vh; background: var(--bg, #f5f6fa); padding-bottom: 20px; }
.my-clubs { margin: 0 16px 20px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-heading h2 { margin: 0; color: var(--ink); font-size: 18px; font-weight: 700; }
.section-heading > span { color: var(--muted); font-size: 12px; }
.club-panel { padding: 16px; border-radius: 12px; background: #fff; }
.my-club { display: flex; align-items: center; gap: 12px; margin-top: 10px; color: var(--ink); }
.club-letter { display: grid; place-items: center; flex: none; width: 46px; height: 46px; border-radius: 12px; background: var(--accent-soft, #fff0f3); color: var(--accent); font-size: 22px; font-weight: 600; }
.club-copy { flex: 1; min-width: 0; }
.club-copy h3, .club-copy strong, .login-guide h3, .no-club h3 { margin: 0; color: var(--ink); font-size: 16px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.club-copy p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 7px 0 0; color: var(--muted); font-size: 12px; }
.role-badge { padding: 2px 6px; border-radius: 5px; background: var(--accent-soft, #fff0f3); color: var(--accent); font-size: 11px; }
.enter-club { flex: none; color: var(--accent); font-size: 13px; }
.enter-club i { margin-left: 4px; color: var(--muted); font-size: 20px; font-style: normal; vertical-align: -1px; }
.login-guide { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 12px; }
.login-guide p, .no-club p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.login-guide .club-primary { grid-column: 1 / -1; }
.club-primary { display: grid; place-items: center; min-height: 40px; padding: 0 16px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; }
.discover, .create-club { margin: 0 16px 16px; }
.hint { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.modes { display: flex; gap: 24px; margin: 0 0 14px; border-bottom: 1px solid var(--line); }
.modes button { position: relative; height: 42px; padding: 0 2px; background: transparent; color: var(--muted); font-size: 15px; font-weight: 600; }
.modes button.on { color: var(--accent); }
.modes button.on::after { content: ""; position: absolute; right: 0; bottom: 0; left: 0; height: 3px; border-radius: 2px; background: var(--accent); }
.club-search { display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 0 12px; border-radius: 10px; background: var(--bg); }
.search-glyph { position: relative; flex: none; width: 14px; height: 14px; margin-right: 3px; border: 1.6px solid var(--muted); border-radius: 50%; }
.search-glyph::after { content: ""; position: absolute; right: -5px; bottom: -2px; width: 6px; height: 1.6px; border-radius: 1px; background: var(--muted); transform: rotate(45deg); }
.club-search input { width: 0; height: 44px; min-height: 0; flex: 1; padding: 0; border: 0; background: transparent; font-size: 14px; }
.club-search:focus-within { box-shadow: inset 0 0 0 1px var(--accent); }
.club-search input:focus { outline: none; }
.club-search button { flex: none; padding: 0 0 0 6px; color: var(--accent); background: transparent; font-size: 14px; font-weight: 600; }
.club-results { margin-top: 10px; }
.club-hit { display: flex; align-items: center; gap: 10px; min-height: 76px; border-bottom: 1px solid var(--line); }
.club-hit:last-child { border-bottom: 0; }
.result-identity { display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px; color: inherit; }
.result-letter { width: 40px; height: 40px; border-radius: 10px; font-size: 18px; }
.club-copy small { display: block; overflow: hidden; margin-top: 5px; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.result-action { flex: none; padding: 7px 10px; border-radius: 8px; background: var(--accent-soft, #fff0f3); color: var(--accent); font-size: 12px; }
.result-action.pending, .pending-label { color: #7962ce; background: #f4f0ff; }
.more { display: block; width: 100%; margin-top: 12px; height: 40px; border-radius: 8px; background: var(--bg); color: var(--accent); font-size: 13px; font-weight: 600; }
.create-toggle { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 0; background: transparent; text-align: left; }
.create-toggle b { display: block; color: var(--ink); font-size: 16px; font-weight: 600; }
.create-toggle small { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; }
.create-toggle i { color: var(--muted); font-size: 24px; font-style: normal; }
.create-content { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.create-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.create-form input { width: 100%; min-height: 40px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--bg); }
.application { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 14px; }
.pending-label { padding: 3px 7px; border-radius: 5px; font-size: 12px; font-weight: 400; }
</style>
