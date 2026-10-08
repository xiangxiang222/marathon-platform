<template>
  <section class="profile">
    <div class="avatar">{{ initial }}</div>
    <div>
      <div style="font-size:18px;font-weight:700">{{ nickname || "未命名" }}</div>
      <div style="color:#8a8f98;font-size:12px;margin-top:4px">同团能看见你标的报名状态</div>
    </div>
  </section>
  <div class="block" style="margin:12px">
    <div v-if="nickname" class="stats">
      <div><b>{{ plans.length }}</b><span>标过的场</span></div>
      <div><b>{{ paid }}</b><span>已缴费</span></div>
      <div><b>{{ clubs.length }}</b><span>跑团</span></div>
    </div>
    <form v-else class="nick" @submit.prevent="enter">
      <div class="field">
        <input v-model="draft" placeholder="怎么称呼你" />
        <button class="primary" type="submit">进入</button>
      </div>
      <p v-if="message" class="err">{{ message }}</p>
    </form>
    <div class="shortcuts">
      <router-link to="/"><div class="bubble" style="background:#5b8def">历</div>赛历</router-link>
      <router-link to="/clubs"><div class="bubble" style="background:#2ad4cf">团</div>跑团</router-link>
      <router-link to="/mine"><div class="bubble" style="background:#f0a04b">报</div>我的报名</router-link>
    </div>
  </div>
  <div class="page">
    <router-link v-for="item in plans" :key="item.race.id" :to="'/races/' + item.race.id" class="block" style="display:block">
      <div class="reg">{{ item.status }}</div>
      <div class="title">{{ item.race.name }}</div>
      <div class="meta"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
    </router-link>
  </div>
  <footer class="foot">{{ company }}<br />{{ icp }}</footer>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";

const nickname = ref(localStorage.getItem("marathon_name") || "");
const draft = ref("");
const plans = ref([]);
const clubs = ref([]);
const message = ref("");
const company = ref("北京华创科技有限公司");
const icp = ref("京ICP备2026060284号-2");
const initial = computed(() => (nickname.value || "我").slice(0, 1));
const paid = computed(() => plans.value.filter((item) => item.status === "已缴费").length);

async function load() {
  const meta = await api("/meta");
  company.value = meta.company;
  icp.value = meta.icp;
  if (!localStorage.getItem("marathon_token")) return;
  const data = await api("/me");
  nickname.value = data.user.nickname;
  plans.value = data.plans;
  clubs.value = data.clubs;
}

async function enter() {
  message.value = "";
  try {
    const data = await api("/session", { method: "POST", body: JSON.stringify({ nickname: draft.value }) });
    localStorage.setItem("marathon_token", data.token);
    localStorage.setItem("marathon_name", data.user.nickname);
    nickname.value = data.user.nickname;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>
