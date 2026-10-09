<template>
  <main>
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事</h1>
      <span></span>
    </header>
    <div v-if="race" class="detail-poster"><Poster :id="race.id" :name="race.name" :city="race.city" :date="race.raceDate" /></div>
    <div v-if="race" class="detail">
      <div class="reg" :class="{ off: !race.open }">{{ race.regStatus }}</div>
      <h1>{{ race.name }}</h1>
      <div class="row"><span>比赛日</span><b>{{ race.raceDate }}</b></div>
      <div class="row"><span>地点</span><b>{{ race.province === race.city ? race.city : race.province + " · " + race.city }}</b></div>
      <div class="row"><span>项目</span><b>{{ race.distanceLabels.join(" / ") }}</b></div>
      <div class="row"><span>{{ race.deadlineName }}</span><b :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</b></div>
      <p v-if="race.gradeLabel" class="src">{{ race.gradeLabel }}</p>
      <p v-if="race.organizer" class="src">主办 {{ race.organizer }}</p>
      <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt }}</template></p>
      <p v-if="race.eventUrl" class="src"><a :href="race.eventUrl" target="_blank" rel="noopener">赛事网站</a></p>
      <p v-if="race.officialUrl" class="src"><a :href="race.officialUrl" target="_blank" rel="noopener">中国马拉松官网这场</a></p>
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
    <div v-if="drawText" class="block">
      <h2>中签卡片</h2>
      <pre class="share-text">{{ drawText }}</pre>
      <button class="primary" type="button" @click="copyDraw">复制卡片</button>
      <p v-if="drawNote" class="note">{{ drawNote }}</p>
      <p v-if="drawError" class="err">{{ drawError }}</p>
    </div>
    <div v-if="alternatives.length" class="block">
      <h2>同期还开着</h2>
      <p class="src">{{ alternativeNote }}</p>
      <router-link v-for="item in alternatives" :key="item.id" class="mate" :to="'/races/' + item.id">
        <span>{{ item.name }}</span>
        <b>{{ item.deadlineLabel }}</b>
      </router-link>
    </div>
    <div v-if="ready && race" class="block">
      <h2>成绩</h2>
      <p v-if="myResult" class="src">{{ myResult.distanceLabel }} {{ myResult.clock }} · 配速 {{ myResult.pace }}<template v-if="myResult.pb"> · PB</template></p>
      <p v-if="myResult && myResult.story">{{ myResult.story }}</p>
      <div class="statuses">
        <button
          v-for="(label, i) in race.distanceLabels"
          :key="race.distances[i]"
          type="button"
          class="status"
          :class="{ on: distance === race.distances[i] }"
          @click="distance = race.distances[i]"
        >
          {{ label }}
        </button>
      </div>
      <form class="result-form" @submit.prevent="saveResult">
        <input v-model="clock" placeholder="3:29:59" />
        <input v-model="story" maxlength="200" placeholder="这场想记的一句" />
        <button class="primary" type="submit">记下成绩</button>
      </form>
      <p v-if="resultMessage" class="err">{{ resultMessage }}</p>
    </div>
    <div v-for="club in clubs" :key="club.id" class="block">
      <h2>{{ club.name }}</h2>
      <p v-if="squadLine(club)" class="warn">{{ squadLine(club) }}</p>
      <div v-if="!club.mates.length" class="empty">团里还没人标这场</div>
      <div v-for="mate in club.mates" :key="mate.nickname" class="mate">
        <span>{{ mate.nickname }}</span><b>{{ mate.status }}</b>
      </div>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
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
const alternatives = ref([]);
const alternativeNote = ref("");
const drawText = ref("");
const drawNote = ref("");
const drawError = ref("");
const myResult = ref(null);
const distance = ref("");
const clock = ref("");
const story = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const message = ref("");
const resultMessage = ref("");
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
  alternatives.value = data.alternatives || [];
  alternativeNote.value = data.alternativeNote || "";
  drawText.value = data.drawText || "";
  myResult.value = data.myResult || null;
  if (data.myResult) {
    distance.value = data.myResult.distance;
    clock.value = data.myResult.clock;
    story.value = data.myResult.story || "";
  } else if (!distance.value && data.race.distances.length) {
    distance.value = data.race.distances[0];
  }
}

async function saveResult() {
  resultMessage.value = "";
  try {
    await api("/me/races/" + route.params.id + "/result", {
      method: "PUT",
      body: JSON.stringify({ distance: distance.value, time: clock.value, story: story.value })
    });
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

function squadLine(club) {
  const card = cards.value.find((item) => item.club && item.club.id === club.id);
  return card && card.squad ? card.squad.text : "";
}

async function copyDraw() {
  drawNote.value = "";
  drawError.value = "";
  try {
    await copyText(drawText.value);
    drawNote.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    drawError.value = "没有复制成功，可以直接选中上面的文字";
  }
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

watch(
  () => route.params.id,
  (id, prev) => {
    if (!prev || id === prev) return;
    distance.value = "";
    clock.value = "";
    story.value = "";
    load();
  }
);

onMounted(load);
</script>

<style scoped>
.detail-poster :deep(.poster) { height: 220px; border-radius: 0; }
.share-text { margin: 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.src { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.note { color: #00b7ae; font-size: 13px; padding: 0 16px; }
.warn { margin: 10px 0 0; color: #9a5b12; font-size: 13px; line-height: 1.45; }
.copy-err { padding: 0 16px; }
.primary { margin-top: 8px; }
.result-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.result-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
</style>
