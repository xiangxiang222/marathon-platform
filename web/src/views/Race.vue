<template>
  <main class="page">
    <router-link class="back" to="/">返回赛历</router-link>
    <div v-if="race" class="sheet">
      <div class="reg" :class="{ off: !race.open }">{{ race.regStatus }}</div>
      <div class="hero-name">{{ race.name }}</div>
      <div class="row"><span>比赛日</span><b>{{ race.raceDate }}</b></div>
      <div class="row"><span>地点</span><b>{{ race.province }} · {{ race.city }}</b></div>
      <div class="row"><span>项目</span><b>{{ race.distanceLabels.join(" / ") }}</b></div>
      <div class="row"><span>报名截止</span><b :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</b></div>
    </div>
    <div v-if="race" class="block">
      <h2>我这场</h2>
      <p v-if="!ready" class="empty">先到「我的」里起个昵称，再标状态。标完同团的人能看见。</p>
      <div v-else class="statuses">
        <button v-for="item in statuses" :key="item" class="status" :class="{ on: myStatus === item }" @click="mark(item)">
          {{ item }}
        </button>
      </div>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
    <div v-for="club in clubs" :key="club.id" class="block">
      <h2>{{ club.name }}</h2>
      <div v-if="!club.mates.length" class="empty">团里还没人标这场</div>
      <div v-for="mate in club.mates" :key="mate.nickname" class="mate">
        <span>{{ mate.nickname }}</span><b>{{ mate.status }}</b>
      </div>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";

const route = useRoute();
const race = ref(null);
const statuses = ref([]);
const myStatus = ref("");
const clubs = ref([]);
const ready = ref(!!localStorage.getItem("marathon_token"));
const message = ref("");

async function load() {
  const data = await api("/races/" + route.params.id);
  race.value = data.race;
  statuses.value = data.statuses;
  myStatus.value = data.myStatus;
  clubs.value = data.clubs;
}

async function mark(status) {
  message.value = "";
  try {
    await api("/me/races/" + route.params.id, { method: "PUT", body: JSON.stringify({ status }) });
    myStatus.value = status;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>
