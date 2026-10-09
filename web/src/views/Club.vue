<template>
  <main>
    <header class="topbar">
      <router-link to="/clubs" aria-label="返回">返回</router-link>
      <h1>跑团</h1>
      <span></span>
    </header>

    <p v-if="phase === 'loading'" class="state">正在打开跑团</p>
    <div v-else-if="phase === 'error'" class="state">
      <p class="err">{{ message }}</p>
      <button class="text-btn" type="button" @click="load">重试</button>
      <router-link class="text-link" to="/clubs">返回跑团</router-link>
    </div>

    <template v-else-if="club">
      <section class="detail">
        <h1 class="hero-name">{{ club.name }}</h1>
      </section>
      <section class="block">
        <div class="code-row">
          <div>
            <p class="kicker">口令</p>
            <b class="code">{{ club.code }}</b>
          </div>
          <button class="text-btn" type="button" @click="copyCode">复制口令</button>
        </div>
        <p class="help">发到微信群。团员在跑团页输入口令加入。</p>
        <p v-if="codeOk" class="ok" role="status">{{ codeOk }}</p>
        <p v-if="codeError" class="err">{{ codeError }}</p>
        <p class="kicker" style="margin-top: 14px">成员 {{ members.length }}</p>
        <div class="tags">
          <span v-for="member in members" :key="member.id">{{ member.nickname }}</span>
        </div>
      </section>

      <section v-if="!board.length" class="block">
        <h2>团赛历</h2>
        <p class="help">还没有人标比赛。到赛历打开一场，标上想跑或已报名。</p>
      </section>
      <section v-for="(item, index) in board" :key="item.race.id" class="block">
        <h2 v-if="index === 0">团赛历</h2>
        <router-link class="race-row" :to="'/races/' + item.race.id + '?code=' + club.code">
          <div>
            <p class="name">{{ item.race.name }}</p>
            <p class="meta">{{ item.race.raceDate }} · {{ item.race.city }}</p>
          </div>
          <span class="trail" :class="{ soon: item.race.open && item.race.daysLeft <= 3 }">{{ item.race.deadlineLabel }}</span>
        </router-link>
        <p>{{ item.summary }}</p>
        <p v-if="unpaidText(item)" class="help">还没缴：{{ unpaidText(item) }}</p>
        <p v-if="item.squad && item.squad.text" class="help">{{ item.squad.text }}</p>
        <p v-if="item.alternativeNote" class="help">{{ item.alternativeNote }}</p>
        <router-link v-for="alt in item.alternatives || []" :key="alt.id" class="race-row" :to="'/races/' + alt.id">
          <div>
            <p class="name">{{ alt.name }}</p>
          </div>
          <span class="trail">{{ alt.deadlineLabel }}</span>
        </router-link>
        <pre class="share-text">{{ item.text }}</pre>
        <button class="primary" type="button" @click="copyCard(item)">复制发到群</button>
        <p v-if="copiedId === item.race.id && note" class="ok" role="status">{{ note }}</p>
        <p v-if="copiedId === item.race.id && copyError" class="err">{{ copyError }}</p>
        <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate">
          <span>{{ mark.nickname }}</span>
          <b>{{ mark.status }}</b>
        </div>
      </section>

      <section class="block">
        <h2>团练签到</h2>
        <p class="help">只记今天谁到了，不记公里，也不代替报名状态。</p>
        <form class="stack" @submit.prevent="checkIn">
          <label class="label" for="check-note">一句说明，可不填</label>
          <input id="check-note" v-model="checkNote" maxlength="40" placeholder="例如 夜跑" />
          <button class="primary" type="submit" :disabled="checkBusy">{{ checkBusy ? "正在记下…" : checkedIn ? "改这一句" : "签到" }}</button>
        </form>
        <button v-if="checkedIn" class="undo" type="button" :disabled="checkBusy" @click="undoCheckin">撤销今天</button>
        <p v-if="checkOk" class="ok" role="status">{{ checkOk }}</p>
        <p v-if="checkMessage" class="err">{{ checkMessage }}</p>
        <p v-if="!checkins.length" class="help">近两周还没有签到。</p>
        <div v-for="day in checkins" :key="day.date">
          <p class="kicker" style="margin-top: 12px">{{ day.label }}</p>
          <div v-for="row in day.rows" :key="day.date + '-' + row.userId" class="mate">
            <span>{{ row.nickname }}</span>
            <b>{{ row.note }}</b>
          </div>
        </div>
      </section>

      <section v-if="ranks.length" class="block">
        <h2>团内最好成绩</h2>
        <p class="help">每人每个项目只留最好的一场。本人填写，未核验。</p>
        <div v-for="group in ranks" :key="group.distance">
          <p class="kicker" style="margin-top: 12px">{{ group.label }}</p>
          <router-link v-for="row in group.rows" :key="group.distance + row.nickname" class="mate" :to="'/races/' + row.raceId">
            <span>{{ row.place }} {{ row.nickname }}</span>
            <b>{{ row.clock }}</b>
          </router-link>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { copyText } from "../copy";

const route = useRoute();
const phase = ref("loading");
const club = ref(null);
const members = ref([]);
const board = ref([]);
const ranks = ref([]);
const checkins = ref([]);
const checkedIn = ref(false);
const checkNote = ref("");
const checkBusy = ref(false);
const checkMessage = ref("");
const checkOk = ref("");
const message = ref("");
const note = ref("");
const copyError = ref("");
const copiedId = ref("");
const codeOk = ref("");
const codeError = ref("");

function unpaidText(item) {
  return (item.unpaid || [])
    .map((mark) => (typeof mark === "string" ? mark : mark.nickname))
    .filter(Boolean)
    .join("、");
}

function applyCheckins(data) {
  checkins.value = data.checkins || [];
  checkedIn.value = Boolean(data.checkedIn);
  checkNote.value = data.myNote || "";
}

async function load() {
  phase.value = "loading";
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id);
    club.value = data.club;
    members.value = data.members || [];
    board.value = data.board || [];
    ranks.value = data.ranks || [];
    applyCheckins(data);
    phase.value = "ready";
  } catch (err) {
    phase.value = "error";
    message.value = err.message;
  }
}

async function copyCode() {
  codeOk.value = "";
  codeError.value = "";
  try {
    await copyText(club.value.code);
    codeOk.value = "口令已复制。发到微信群即可。";
  } catch (err) {
    codeError.value = "没有复制成功。选中上面的口令即可。";
  }
}

async function copyCard(card) {
  note.value = "";
  copyError.value = "";
  copiedId.value = card.race.id;
  try {
    await copyText(card.text);
    note.value = "已复制。贴到微信群即可。";
  } catch (err) {
    copyError.value = "没有复制成功。选中下面的文字即可。";
  }
}

async function checkIn() {
  checkMessage.value = "";
  checkOk.value = "";
  checkBusy.value = true;
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", {
      method: "POST",
      body: JSON.stringify({ note: checkNote.value.trim() })
    });
    applyCheckins(data);
    checkOk.value = "已记下今天的签到。";
  } catch (err) {
    checkMessage.value = err.message;
  } finally {
    checkBusy.value = false;
  }
}

async function undoCheckin() {
  checkMessage.value = "";
  checkOk.value = "";
  checkBusy.value = true;
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", { method: "DELETE" });
    applyCheckins(data);
    checkOk.value = "已撤销今天的签到。";
  } catch (err) {
    checkMessage.value = err.message;
  } finally {
    checkBusy.value = false;
  }
}

onMounted(load);
</script>
