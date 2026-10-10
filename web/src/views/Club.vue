<template>
  <main>
    <header class="topbar">
      <router-link to="/sport" aria-label="返回">‹</router-link>
      <h1>跑团</h1>
      <span></span>
    </header>
    <div v-if="club" class="detail">
      <div class="hero-name">{{ club.name }}</div>
      <div class="row"><span>口令，发到微信群</span><b>{{ club.code }}</b></div>
      <div class="tags" style="margin-top:8px">
        <span v-for="member in members" :key="member.id">{{ member.nickname }}</span>
      </div>
    </div>
    <div v-if="club" class="block">
      <h2>团练签到</h2>
      <p class="rank-label">只记今天谁到了，不记公里。</p>
      <form class="check-form" @submit.prevent="checkIn">
        <input v-model="checkNote" maxlength="40" placeholder="可写一句，比如夜跑" />
        <button class="primary" type="submit">{{ checkedIn ? "改一句" : "签到" }}</button>
      </form>
      <button v-if="checkedIn" class="undo" type="button" @click="undoCheckin">撤销今天</button>
      <p v-if="!checkins.length" class="rank-label">今天还没有人签到。</p>
      <div v-for="day in checkins" :key="day.date">
        <p class="rank-label">{{ day.label }}</p>
        <div v-for="row in day.rows" :key="day.date + '-' + row.userId" class="mate">
          <span>{{ row.nickname }}</span>
          <b>{{ row.note }}</b>
        </div>
      </div>
      <p v-if="checkMessage" class="err">{{ checkMessage }}</p>
    </div>
    <div v-if="ranks.length" class="block">
      <h2>团内成绩</h2>
      <p class="rank-label">每人每项只留最好的一场。</p>
      <div v-for="group in ranks" :key="group.distance">
        <p class="rank-label">{{ group.label }}</p>
        <router-link v-for="row in group.rows" :key="group.distance + row.nickname" class="mate" :to="'/races/' + row.raceId">
          <span>{{ row.place }} {{ row.nickname }}</span>
          <b>{{ row.clock }}</b>
        </router-link>
      </div>
    </div>
    <p v-if="club && !board.length && !ranks.length" class="empty">还没有人标比赛。打开一场，标上想跑或已报名。</p>
    <div v-for="item in board" :key="item.race.id" class="block">
      <router-link :to="'/races/' + item.race.id" class="card">
        <div class="copy">
          <p>{{ item.race.name }}</p>
          <div class="foot"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
        </div>
      </router-link>
      <p v-if="item.squad && item.squad.text" class="squad">{{ item.squad.text }}</p>
      <p v-if="item.alternativeNote" class="squad">{{ item.alternativeNote }}</p>
      <router-link v-for="alt in item.alternatives || []" :key="alt.id" class="mate" :to="'/races/' + alt.id">
        <span>{{ alt.name }}</span><b>{{ alt.deadlineLabel }}</b>
      </router-link>
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
const route = useRoute();
const club = ref(null);
const members = ref([]);
const board = ref([]);
const ranks = ref([]);
const checkins = ref([]);
const checkedIn = ref(false);
const checkNote = ref("");
const checkMessage = ref("");
const message = ref("");
const note = ref("");

function applyCheckins(data) {
  checkins.value = data.checkins || [];
  checkedIn.value = Boolean(data.checkedIn);
  checkNote.value = data.myNote || "";
}

async function checkIn() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", {
      method: "POST",
      body: JSON.stringify({ note: checkNote.value })
    });
    applyCheckins(data);
  } catch (err) {
    checkMessage.value = err.message;
  }
}

async function undoCheckin() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", { method: "DELETE" });
    applyCheckins(data);
  } catch (err) {
    checkMessage.value = err.message;
  }
}

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
    ranks.value = data.ranks || [];
    applyCheckins(data);
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.block :deep(.poster) { aspect-ratio: 5 / 2; height: auto; border-radius: 8px; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.rank-label { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.squad { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.note { font-size: 12px; color: #007aff; }
.primary { margin-top: 8px; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
</style>
