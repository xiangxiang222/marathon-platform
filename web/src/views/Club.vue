<template>
  <main>
    <router-link class="back" to="/sport">返回运动</router-link>
    <div v-if="club" class="detail">
      <div class="hero-name">{{ club.name }}</div>
      <div class="row"><span>口令，发到微信群</span><b>{{ club.code }}</b></div>
      <div class="tags" style="margin-top:8px">
        <span v-for="member in members" :key="member.id">{{ member.nickname }}</span>
      </div>
    </div>
    <p v-if="club && !board.length" class="empty">还没有人标比赛。打开一场，标上想跑或已报名。</p>
    <div v-for="item in board" :key="item.race.id" class="block">
      <router-link :to="'/races/' + item.race.id" class="card">
        <Poster :id="item.race.id" />
        <div class="copy">
          <p>{{ item.race.name }}</p>
          <div class="foot"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
        </div>
      </router-link>
      <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate">
        <span>{{ mark.nickname }}</span><b>{{ mark.status }}</b>
      </div>
    </div>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import Poster from "../components/Poster.vue";

const route = useRoute();
const club = ref(null);
const members = ref([]);
const board = ref([]);
const message = ref("");

onMounted(async () => {
  try {
    const data = await api("/clubs/" + route.params.id);
    club.value = data.club;
    members.value = data.members;
    board.value = data.board;
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.block :deep(.poster) { height: 120px; border-radius: 8px; }
</style>
