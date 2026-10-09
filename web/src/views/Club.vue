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
      <p v-if="item.squad && item.squad.text" class="squad">{{ item.squad.text }}</p>
      <pre class="share-text">{{ item.text }}</pre>
      <button class="primary" type="button" @click="copyCard(item)">复制卡片</button>
      <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate">
        <span>{{ mark.nickname }}</span><b>{{ mark.status }}</b>
      </div>
    </div>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { copyText } from "../copy";
import Poster from "../components/Poster.vue";

const route = useRoute();
const club = ref(null);
const members = ref([]);
const board = ref([]);
const message = ref("");
const note = ref("");

async function copyCard(card) {
  note.value = "";
  message.value = "";
  try {
    await copyText(card.text);
    note.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    message.value = "没有复制成功，可以直接选中上面的文字";
  }
}

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
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.squad { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.note { font-size: 12px; }
.note { color: #12b3ae; padding: 0 16px; }
.primary { margin-top: 8px; }
</style>
