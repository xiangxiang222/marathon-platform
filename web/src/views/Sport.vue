<template>
  <header class="large">
    <div>
      <h1>跑团</h1>
      <p>团长建团要审核。有口令直接进，没有就申请</p>
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
    <h2>建一个团</h2>
    <p v-if="leader" class="hint">只有团长能提交。通过后你是团长，可以在手机上管理成员、活动和组别。</p>
    <p v-else class="hint">只有团长可以建团。请跑团管理员先把你设为团长。</p>
    <div v-if="leader && application" class="row"><span>{{ application.name }}</span><b>等待审核</b></div>
    <div v-else-if="leader" class="field">
      <input v-model="name" placeholder="跑团名称" />
      <button class="primary" type="button" @click="create">提交</button>
    </div>
  </div>
  <div class="block">
    <h2>加入跑团</h2>
    <p class="hint">有口令直接进。不填口令就申请，等团长或跑团管理通过。</p>
    <div class="field">
      <input v-model="code" placeholder="口令，可空" />
      <button class="primary" type="button" @click="join">用口令加入</button>
    </div>
    <p v-if="message" class="err">{{ message }}</p>
  </div>
  <div v-for="club in openClubs" :key="club.id" class="block">
    <h2>{{ club.name }}</h2>
    <div class="row">
      <span>{{ club.members }} 人</span>
      <b v-if="club.pending">等待审核</b>
      <button v-else class="primary" type="button" @click="apply(club)">申请加入</button>
    </div>
  </div>
  <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="block" style="display:block">
    <h2>{{ club.name }}</h2>
    <div class="row"><span>口令</span><b>{{ club.code }}</b></div>
  </router-link>
  <p v-if="ready && !clubs.length && !openClubs.length" class="empty">还没有跑团。建一个，把口令发到微信群。别人也可以不填口令来申请。</p>
  <p v-if="!ready" class="empty">先到「我的」里起个昵称。</p>
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
const clubs = ref([]);
const openClubs = ref([]);
const plans = ref([]);
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const paid = computed(() => plans.value.filter((item) => item.status === "已缴费").length);

async function load() {
  if (!ready.value) return;
  const [data, directory] = await Promise.all([api("/me"), api("/clubs/directory")]);
  clubs.value = data.clubs;
  plans.value = data.plans;
  leader.value = Boolean(data.user && data.user.leader);
  application.value = (data.applications && data.applications[0]) || null;
  openClubs.value = (directory.clubs || []).filter((item) => !item.joined);
}

async function create() {
  message.value = "";
  try {
    const data = await api("/clubs", { method: "POST", body: JSON.stringify({ name: name.value }) });
    if (data.pending) {
      name.value = "";
      message.value = "已提交，等跑团管理员通过";
      await load();
      return;
    }
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    message.value = err.message;
  }
}

async function join() {
  message.value = "";
  if (!code.value.trim()) {
    message.value = "填口令，或在下面选一个团申请";
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
.row .primary { width: auto; }
</style>
