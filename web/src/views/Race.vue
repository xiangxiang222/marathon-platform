<template>
  <main>
    <router-link class="back" to="/">返回赛历</router-link>
    <div v-if="race" class="detail-poster"><Poster :id="race.id" /></div>
    <div v-if="race" class="detail">
      <div class="reg" :class="{ off: !race.open }">{{ race.regStatus }}</div>
      <h1>{{ race.name }}</h1>
      <div class="row"><span>比赛日</span><b>{{ race.raceDate }}</b></div>
      <div class="row"><span>地点</span><b>{{ race.province === race.city ? race.city : race.province + " · " + race.city }}</b></div>
      <div class="row"><span>项目</span><b>{{ race.distanceLabels.join(" / ") }}</b></div>
      <div class="row"><span>{{ race.deadlineName }}</span><b :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</b></div>
      <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt }}</template></p>
      <p v-for="item in conflicts" :key="item.text" class="warn">{{ item.text }}</p>
    </div>
    <div v-if="race && race.nodes.length" class="block">
      <h2>时间节点</h2>
      <div v-for="node in race.nodes" :key="node.key" class="mate">
        <span>{{ node.label }}</span>
        <b :class="{ soon: node.soon }">{{ node.at }}<template v-if="node.text"> · {{ node.text }}</template></b>
      </div>
    </div>
    <div v-for="card in cards" :key="card.club.id" class="block">
      <h2>发到微信群 · {{ card.club.name }}</h2>
      <pre class="share-text">{{ card.text }}</pre>
      <button class="primary" type="button" @click="copyCard(card)">复制卡片</button>
    </div>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="copyError" class="err copy-err">{{ copyError }}</p>
    <p v-if="race && ready && !cards.length" class="empty">建好跑团后，这里会生成能发到群里的卡片。</p>
    <div v-if="race" class="block">
      <h2>我这场</h2>
      <p v-if="!ready" class="empty">先到「我的」里起个昵称，再标状态。标完同团的人能看见。</p>
      <div v-else class="statuses">
        <button v-for="item in statuses" :key="item" type="button" class="status" :class="{ on: myStatus === item }" @click="mark(item)">
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
import { copyText } from "../copy";
import Poster from "../components/Poster.vue";

const route = useRoute();
const race = ref(null);
const statuses = ref([]);
const myStatus = ref("");
const clubs = ref([]);
const cards = ref([]);
const conflicts = ref([]);
const ready = ref(!!localStorage.getItem("marathon_token"));
const message = ref("");
const note = ref("");
const copyError = ref("");

async function load() {
  const data = await api("/races/" + route.params.id);
  race.value = data.race;
  statuses.value = data.statuses;
  myStatus.value = data.myStatus;
  clubs.value = data.clubs;
  cards.value = data.cards || [];
  conflicts.value = data.conflicts || [];
}

async function copyCard(card) {
  note.value = "";
  copyError.value = "";
  try {
    await copyText(card.text);
    note.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    copyError.value = "没有复制成功，可以直接选中上面的文字";
  }
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

<style scoped>
.detail-poster :deep(.poster) { height: 220px; }
.share-text { margin: 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.src { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.note { color: #12b3ae; font-size: 13px; padding: 0 16px; }
.warn { margin: 10px 0 0; color: #9a5b12; font-size: 13px; line-height: 1.45; }
.copy-err { padding: 0 16px; }
.primary { margin-top: 8px; }
</style>
