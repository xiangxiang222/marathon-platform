<template>
  <header class="large">
    <div>
      <h1>跑团</h1>
      <p>用口令进，或搜跑团名</p>
    </div>
  </header>
  <section v-if="!query.trim()" class="panel">
    <h3>我标过的</h3>
    <div class="stats3">
      <div><b>{{ plans.length }}</b><span>标过的场</span></div>
      <div><b>{{ paid }}</b><span>已缴费</span></div>
      <div><b>{{ clubs.length }}</b><span>跑团</span></div>
    </div>
  </section>
  <div class="block">
    <template v-if="!(mode === 'search' && query.trim())">
      <h2>加入跑团</h2>
      <p class="hint">两种方式选一种。</p>
      <div class="modes">
        <button type="button" :class="{ on: mode === 'search' }" @click="pick('search')">搜跑团</button>
        <button type="button" :class="{ on: mode === 'code' }" @click="pick('code')">用口令</button>
      </div>
      <p v-if="mode === 'code'" class="hint">填群里的口令，马上进团。</p>
      <p v-else class="hint">边输入边列出来。跑团名以输入开头的排在前面，也可以搜团长或跑团管理。先显示 6 个。</p>
    </template>
    <div v-if="mode === 'code'" class="field">
      <input v-model="code" placeholder="口令" @keyup.enter="join" />
      <button class="primary" type="button" @click="join">加入</button>
    </div>
    <div v-else class="field">
      <input v-model="query" placeholder="跑团名、团长" @input="onQuery" @keyup.enter="search" />
    </div>
    <p v-if="message" class="err">{{ message }}</p>
  </div>
  <div v-if="mode === 'search' && query.trim()" class="hits">
    <div v-for="club in shownClubs" :key="club.id" class="hit">
      <span>{{ club.name }}</span>
      <em>{{ club.members }} 人<template v-if="club.leader"> · {{ club.leader }}</template></em>
      <router-link v-if="club.joined" :to="'/clubs/' + club.id">已加入</router-link>
      <b v-else-if="club.pending">等待审核</b>
      <button v-else type="button" @click="apply(club)">申请加入</button>
    </div>
  </div>
  <button v-if="mode === 'search' && moreCount" class="more" type="button" @click="showAll = true">还有 {{ moreCount }} 个，显示全部</button>
  <template v-if="!query.trim()">
  <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="block" style="display:block">
    <h2>{{ club.name }}</h2>
    <div class="row"><span>{{ club.roleLabel }} · 口令</span><b>{{ club.code }}</b></div>
  </router-link>
  </template>
  <p v-if="ready && mode === 'search' && !query.trim() && !clubs.length && !openClubs.length" class="empty">还没有可加入的跑团。</p>
  <p v-if="!ready" class="empty">先到「我的」登录。</p>
  <div v-if="!query.trim()" class="block">
    <h2>创建跑团</h2>
    <p v-if="leader" class="hint">提交后等待审核。通过后，你是这个团的团长，可以在手机上管理成员、活动和组别。</p>
    <p v-else class="hint">当前没有建团资格，无法申请创建跑团。请联系管理员开启。</p>
    <p v-if="foundingMessage" class="err">{{ foundingMessage }}</p>
    <div v-if="leader && application" class="row"><span>{{ application.name }}</span><b>等待审核</b></div>
    <div v-else-if="leader" class="field">
      <input v-model="name" placeholder="跑团名称" />
      <button class="primary" type="button" @click="create">提交</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();
const name = ref("");
const leader = ref(false);
const application = ref(null);
const code = ref("");
const query = ref("");
const showAll = ref(false);
const mode = ref("search");
const foundingMessage = ref("");
const clubs = ref([]);
const openClubs = ref([]);
const listedQuery = ref("");
const plans = ref([]);
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const paid = computed(() => plans.value.filter((item) => item.status === "已缴费").length);
const shownClubs = computed(() => {
  if (query.value.trim() !== listedQuery.value) return [];
  return query.value.trim() && !showAll.value ? openClubs.value.slice(0, 6) : openClubs.value;
});
const moreCount = computed(() => {
  if (query.value.trim() !== listedQuery.value) return 0;
  return query.value.trim() && !showAll.value ? Math.max(0, openClubs.value.length - 6) : 0;
});
let queryTimer = 0;
let loadSeq = 0;

async function load() {
  if (!ready.value) return;
  const q = query.value.trim();
  const seq = ++loadSeq;
  const [data, directory] = await Promise.all([api("/me"), api("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))]);
  if (seq !== loadSeq) return;
  listedQuery.value = q;
  clubs.value = data.clubs;
  plans.value = data.plans;
  leader.value = Boolean(data.user && data.user.leader);
  application.value = (data.applications && data.applications[0]) || null;
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
    message.value = "填口令";
    return;
  }
  try {
    const data = await api("/clubs/join", { method: "POST", body: JSON.stringify({ code: code.value }) });
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    message.value = err.message;
  }
}

async function apply(club) {
  message.value = "";
  try {
    const data = await api("/clubs/join", { method: "POST", body: JSON.stringify({ clubId: club.id }) });
    if (data.pending) {
      message.value = "已提交，等团长或跑团管理通过";
      await load();
      return;
    }
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    message.value = err.message;
  }
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
.hint { margin: 0 0 8px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.modes { display: flex; gap: 8px; margin: 0 0 10px; }
.modes button { height: 32px; padding: 0 14px; border-radius: 999px; background: var(--chip); color: var(--ink); font-size: 14px; font-weight: 600; }
.modes button.on { background: var(--accent); color: #fff; }
.row .primary { width: auto; }
.more { display: block; width: calc(100% - 32px); margin: 0 16px 12px; height: 40px; border-radius: 12px; background: #fff; color: var(--accent); font-weight: 650; }
</style>
