<template>
  <header class="large">
    <div>
      <h1>运动</h1>
      <p>建团、发口令、看谁标了这场</p>
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
    <div class="field">
      <input v-model="name" placeholder="跑团名称" />
      <button class="primary" type="button" @click="create">创建</button>
    </div>
  </div>
  <div class="block">
    <h2>用口令加入</h2>
    <div class="field">
      <input v-model="code" placeholder="6 位口令" />
      <button class="primary" type="button" @click="join">加入</button>
    </div>
    <p v-if="message" class="err">{{ message }}</p>
  </div>
  <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="block" style="display:block">
    <h2>{{ club.name }}</h2>
    <div class="row"><span>口令</span><b>{{ club.code }}</b></div>
  </router-link>
  <p v-if="ready && !clubs.length" class="empty">还没有跑团。建一个，把口令发到微信群。</p>
  <p v-if="!ready" class="empty">先到「我的」里起个昵称。</p>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();
const name = ref("");
const code = ref("");
const clubs = ref([]);
const plans = ref([]);
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const paid = computed(() => plans.value.filter((item) => item.status === "已缴费").length);

async function load() {
  if (!ready.value) return;
  const data = await api("/me");
  clubs.value = data.clubs;
  plans.value = data.plans;
}

async function create() {
  message.value = "";
  try {
    const data = await api("/clubs", { method: "POST", body: JSON.stringify({ name: name.value }) });
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    message.value = err.message;
  }
}

async function join() {
  message.value = "";
  try {
    const data = await api("/clubs/join", { method: "POST", body: JSON.stringify({ code: code.value }) });
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>
