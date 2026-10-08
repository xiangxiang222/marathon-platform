<template>
  <header class="top"><div class="hero-name" style="color:#fff;margin:0">跑团赛历</div></header>
  <main class="page">
    <div class="block">
      <h2>建一个团</h2>
      <div class="field">
        <input v-model="name" placeholder="跑团名称" />
        <button class="primary" @click="create">创建</button>
      </div>
    </div>
    <div class="block">
      <h2>用口令加入</h2>
      <div class="field">
        <input v-model="code" placeholder="6 位口令" />
        <button class="primary" @click="join">加入</button>
      </div>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
    <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="block" style="display:block">
      <h2>{{ club.name }}</h2>
      <div class="row"><span>口令</span><b>{{ club.code }}</b></div>
    </router-link>
    <div v-if="ready && !clubs.length" class="empty">还没有跑团。建一个，把口令发到微信群。</div>
    <div v-if="!ready" class="empty">先到「我的」里起个昵称。</div>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();
const name = ref("");
const code = ref("");
const clubs = ref([]);
const message = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));

async function load() {
  if (!ready.value) return;
  const data = await api("/me");
  clubs.value = data.clubs;
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
