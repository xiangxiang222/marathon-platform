<template>
  <header class="large">
    <div>
      <h1>跑团</h1>
      <p>用口令进，或搜跑团名</p>
    </div>
  </header>
  <section class="panel">
    <h3>我标过的</h3>
    <div class="stats3">
      <div><b>{{ plans.length }}</b><span>标过的场</span></div>
      <div><b>{{ paid }}</b><span>已缴费</span></div>
      <div><b>{{ clubs.length }}</b><span>跑团</span></div>
    </div>
  </section>
  <div class="block">
    <h2>加入跑团</h2>
    <p class="hint">两种方式选一种。</p>
    <div class="modes">
      <button type="button" :class="{ on: mode === 'search' }" @click="pick('search')">搜跑团</button>
      <button type="button" :class="{ on: mode === 'code' }" @click="pick('code')">用口令</button>
    </div>
    <p v-if="mode === 'code'" class="hint">填群里的口令，马上进团。</p>
    <p v-else class="hint">按跑团名、团长或跑团管理找。找到后申请，等团里审核。</p>
    <div v-if="mode === 'code'" class="field">
      <input v-model="code" placeholder="口令" @keyup.enter="join" />
      <button class="primary" type="button" @click="join">加入</button>
    </div>
    <div v-else class="field">
      <input v-model="query" placeholder="跑团名、团长" @keyup.enter="search" />
      <button class="primary" type="button" @click="search">搜索</button>
    </div>
    <p v-if="message" class="err">{{ message }}</p>
  </div>
  <div v-for="club in openClubs" v-show="mode === 'search'" :key="club.id" class="block">
    <h2>{{ club.name }}</h2>
    <div class="row">
      <span>{{ club.members }} 人<span v-if="club.leader"> · 团长 {{ club.leader }}</span></span>
      <router-link v-if="club.joined" :to="'/clubs/' + club.id">已加入</router-link>
      <b v-else-if="club.pending">等待审核</b>
      <button v-else class="primary" type="button" @click="apply(club)">申请加入</button>
    </div>
  </div>
  <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="block" style="display:block">
    <h2>{{ club.name }}</h2>
    <div class="row"><span>{{ club.roleLabel }} · 口令</span><b>{{ club.code }}</b></div>
  </router-link>
  <p v-if="ready && mode === 'search' && !query.trim() && !clubs.length && !openClubs.length" class="empty">还没有可加入的跑团。</p>
  <p v-if="!ready" class="empty">先到「我的」里起个昵称。</p>
  <div class="block">
    <h2>创建跑团</h2>
    <p v-if="leader" class="hint">只有团长能提交。通过后你是团长，可以在手机上管理成员、活动和组别。</p>
    <p v-else class="hint">只有团长可以建团。请跑团管理员先把你设为团长。</p>
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
const mode = ref("search");
const foundingMessage = ref("");
const clubs = ref([]);
const openClubs = ref([]);
const plans = ref([]);
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const paid = computed(() => plans.value.filter((item) => item.status === "已缴费").length);

async function load() {
  if (!ready.value) return;
  const q = query.value.trim();
  const [data, directory] = await Promise.all([api("/me"), api("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))]);
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

async function search() {
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
</style>
