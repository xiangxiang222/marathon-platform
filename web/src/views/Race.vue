<template>
  <main>
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事</h1>
      <span></span>
    </header>
    <div v-if="race" class="pass" :class="'tone-' + tone">
      <div class="pass-date">
        <b>{{ parts.day }}</b>
        <span>{{ parts.month }}月</span>
      </div>
      <div class="pass-copy">
        <span class="pass-pill">{{ race.regStatus }}</span>
        <h1>{{ race.name }}</h1>
        <p>{{ placeLine }}<template v-if="race.distanceLabels.length"> · {{ race.distanceLabels.join(" / ") }}</template></p>
      </div>
    </div>
    <div v-if="race" class="detail">
      <div class="row"><span>比赛日</span><b>{{ race.raceDate }}</b></div>
      <div class="row"><span>地点</span><b>{{ locationLine }}</b></div>
      <div class="row"><span>项目</span><b>{{ race.distanceLabels.join(" / ") }}</b></div>
      <div class="row"><span>{{ race.deadlineName }}</span><b :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</b></div>
      <p v-if="race.gradeLabel" class="src">{{ race.gradeLabel }}</p>
      <p v-if="race.organizer" class="src">主办 {{ race.organizer }}</p>
      <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt }}</template></p>
      <div v-if="race.phone" class="row"><span>咨询</span><b>{{ race.phone }}</b></div>
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
    <div v-if="drawRates.length" class="block">
      <h2>历年中签</h2>
      <p class="src">按公布的报名人数和名额计算。来源写在每一届下面。</p>
      <div v-for="item in drawRates" :key="item.id" class="mate">
        <span>{{ item.label }} · 报名 {{ item.applicants }} · 名额 {{ item.quota }} · {{ item.rateText }}</span>
        <b>来源 {{ item.source }}</b>
      </div>
    </div>
    <div v-if="race && race.links.length" class="block">
      <h2>报名和查询</h2>
      <p class="src">这些都打开赛事自己的页面。</p>
      <a v-for="link in race.links" :key="link.key" class="jump" :class="{ main: link.primary }" :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
    </div>
    <div v-if="race" class="block">
      <h2>站内报名</h2>
      <div class="slot"><span>报名和付款</span><b>尚未开通</b></div>
      <p class="src">合作赛事以后在这里报名。现在仍打开赛事自己的页面。不填写身份证。</p>
    </div>
    <div v-if="showFacts" class="block">
      <h2>项目</h2>
      <div v-if="projectLabels.length" class="chips">
        <span v-for="label in projectLabels" :key="label" class="chip">{{ label }}</span>
      </div>
      <div v-if="race.startAt" class="row"><span>起跑</span><b>{{ race.startAt }}</b></div>
      <div v-if="race.fee" class="row"><span>报名费</span><b>{{ race.fee }}</b></div>
      <div v-if="race.scale" class="row"><span>规模</span><b>{{ race.scale }}</b></div>
    </div>
    <div v-if="race && (race.guideText || race.guide.length)" class="block">
      <h2>竞赛规程</h2>
      <p v-if="race.guide.length" class="src">按组委会公布的原图往下看。奖金、关门时间和参赛资格以组委会原文为准。</p>
      <pre v-if="race.guideText" class="guide-text">{{ race.guideText }}</pre>
      <button v-for="sheet in race.guide" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
        <img :src="sheetSrc(sheet.id)" alt="竞赛规程" />
      </button>
    </div>
    <div v-if="dayNotes.length || routeSheets.length || (race && race.pacerSheets && race.pacerSheets.length)" class="block">
      <h2>比赛日</h2>
      <div v-for="item in dayNotes" :key="item.label" class="day-note">
        <h3>{{ item.label }}</h3>
        <p v-if="item.text">{{ item.text }}</p>
        <div v-if="item.label === '路线' && routeSheets.length" class="pacer-photos">
          <button v-for="sheet in routeSheets" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
            <img :src="sheetSrc(sheet.id)" alt="路线图" />
          </button>
        </div>
      </div>
      <div v-if="race && race.pacerSheets && race.pacerSheets.length" class="pacer-photos">
        <button v-for="sheet in race.pacerSheets" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
          <img :src="sheetSrc(sheet.id)" alt="配速员" />
        </button>
      </div>
    </div>
    <div v-if="race" class="block">
      <h2>酒店</h2>
      <div class="slot"><span>赛事周订房</span><b>尚未开通</b></div>
      <p class="src">这里不显示房价，也不跳转。</p>
    </div>
    <div v-if="race && race.liveSheet" class="block">
      <h2>直播</h2>
      <p class="src">扫组委会的二维码。</p>
      <button class="sheet" type="button" @click="openSheet(race.liveSheet.id)">
        <img :src="sheetSrc(race.liveSheet.id)" alt="直播二维码" />
      </button>
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
      <p v-if="!ready" class="empty">先到「我的」登录，再标状态。标完同团的人能看见。</p>
      <div v-else class="statuses">
        <button v-for="item in statuses" :key="item" type="button" class="status" :class="{ on: myStatus === item }" @click="mark(item)">
          {{ item }}
        </button>
      </div>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
    <div v-if="drawText" class="block">
      <h2>中签卡片</h2>
      <div class="poster-card">
        <p v-for="(line, index) in drawLines" :key="index">{{ line }}</p>
      </div>
      <button class="primary" type="button" @click="savePoster">保存图片</button>
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
      <p class="src">手记的成绩标为未核验。可以附一张证书或奖牌照片。</p>
      <div class="slot"><span>识别证书</span><b>尚未开通</b></div>
      <p class="src">照片可以留下，成绩仍由自己填写。</p>
      <p v-for="item in myResults" :key="item.distance" class="src">{{ item.distanceLabel }} {{ item.clock }} · 配速 {{ item.pace }}<template v-if="item.pb"> · PB</template> · {{ item.verifyLabel }}</p>
      <p v-if="myResult && myResult.story">{{ myResult.story }}</p>
      <img v-if="myResult && myResult.hasProof" class="proof" :src="proofSrc" alt="" />
      <p v-if="myResult && myResult.proofLabel" class="src">{{ myResult.proofLabel }} · 未核验</p>
      <div class="statuses">
        <button
          v-for="(label, i) in race.distanceLabels"
          :key="race.distances[i]"
          type="button"
          class="status"
          :class="{ on: distance === race.distances[i] }"
          @click="pickDistance(race.distances[i])"
        >
          {{ label }}
        </button>
      </div>
      <form class="result-form" @submit.prevent="saveResult">
        <input v-model="clock" placeholder="3:29:59" />
        <input v-model="story" maxlength="200" placeholder="这场想记的一句" />
        <button class="primary" type="submit">记下成绩</button>
      </form>
      <div v-if="myResult" class="proof-actions">
        <label>证书照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onProof('certificate', $event)" /></label>
        <label>奖牌照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onProof('medal', $event)" /></label>
        <button v-if="myResult.hasProof" class="undo" type="button" @click="removeProof">去掉照片</button>
      </div>
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
    <button v-if="viewer" class="viewer" type="button" @click="viewer = ''">
      <img :src="viewer" alt="放大查看" />
    </button>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, raceSheetSrc, resultProofSrc, upload } from "../api";
import { copyText } from "../copy";
import { dateParts, toneOf } from "../tone";
const route = useRoute();
const race = ref(null);
const tone = computed(() => toneOf(race.value));
const parts = computed(() => dateParts(race.value && race.value.raceDate));
const placeLine = computed(() => {
  if (!race.value) return "";
  return race.value.province === race.value.city ? race.value.city : race.value.province + " · " + race.value.city;
});
const locationLine = computed(() => {
  if (!race.value) return "";
  const spot = race.value.place;
  if (!spot || spot === race.value.city || spot === race.value.province) return placeLine.value;
  return placeLine.value + " · " + spot;
});
const projectLabels = computed(() => {
  if (!race.value) return [];
  return [...race.value.distanceLabels, ...race.value.kindLabels, ...race.value.groups];
});
const showFacts = computed(() => {
  if (!race.value) return false;
  return race.value.kindLabels.length || race.value.groups.length || race.value.fee || race.value.scale || race.value.startAt;
});
const routeSheets = computed(() => (race.value && race.value.routeSheets) || []);
const dayNotes = computed(() => {
  if (!race.value) return [];
  return [
    ["路线", race.value.route, routeSheets.value.length > 0],
    ["领物", race.value.pickup, false],
    ["配速员", race.value.pacers, false]
  ].filter((item) => item[1] || item[2]).map(([label, text]) => ({ label, text }));
});
const viewer = ref("");
function sheetSrc(id) {
  return raceSheetSrc(id);
}
function openSheet(id) {
  viewer.value = sheetSrc(id);
}
const statuses = ref([]);
const myStatus = ref("");
const clubs = ref([]);
const cards = ref([]);
const conflicts = ref([]);
const alternatives = ref([]);
const alternativeNote = ref("");
const drawText = ref("");
const drawRates = ref([]);
const drawNote = ref("");
const drawError = ref("");
const myResult = ref(null);
const myResults = ref([]);
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
  drawRates.value = data.drawRates || [];
  myResults.value = data.myResults || [];
  if (!distance.value) {
    const first = myResults.value[0];
    if (first) distance.value = first.distance;
    else if (data.race.distances.length) distance.value = data.race.distances[0];
  }
  pickDistance(distance.value);
}

function pickDistance(next) {
  distance.value = next;
  const found = myResults.value.find((item) => item.distance === next) || null;
  myResult.value = found;
  if (found) {
    clock.value = found.clock;
    story.value = found.story || "";
  }
}

const proofSrc = computed(() => (race.value && myResult.value && myResult.value.hasProof ? resultProofSrc(race.value.id, myResult.value.distance) : ""));

async function onProof(kind, event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  resultMessage.value = "";
  try {
    await upload("/me/races/" + route.params.id + "/result/proof/" + kind + "?distance=" + encodeURIComponent(distance.value), file);
    resultMessage.value = kind === "medal" ? "奖牌照片已上传" : "证书照片已上传";
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

async function removeProof() {
  resultMessage.value = "";
  try {
    await api("/me/races/" + route.params.id + "/result/proof?distance=" + encodeURIComponent(distance.value), { method: "DELETE" });
    await load();
  } catch (err) {
    resultMessage.value = err.message;
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

const drawLines = computed(() => drawText.value.split("\n").filter(Boolean));

function savePoster() {
  drawNote.value = "";
  drawError.value = "";
  const lines = drawLines.value;
  const canvas = document.createElement("canvas");
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#007aff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  let y = 180;
  lines.forEach((line, index) => {
    ctx.font = index === 0 ? "700 64px sans-serif" : "500 36px sans-serif";
    ctx.fillText(line, 64, y, 622);
    y += index === 0 ? 120 : 72;
  });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "中签.png";
  link.click();
  drawNote.value = "图片已保存";
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
.detail-poster :deep(.poster) { aspect-ratio: 16 / 9; height: auto; border-radius: 0; }
.share-text { margin: 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.poster-card { margin-top: 8px; padding: 28px 20px; border-radius: 16px; background: #007aff; color: #fff; }
.poster-card p { margin: 0; font-size: 16px; line-height: 1.45; }
.poster-card p:first-child { font-size: 28px; font-weight: 700; }
.poster-card p + p { margin-top: 10px; }
.src { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.note { color: #007aff; font-size: 13px; padding: 0 16px; }
.warn { margin: 10px 0 0; color: #9a5b12; font-size: 13px; line-height: 1.45; }
.copy-err { padding: 0 16px; }
.primary { margin-top: 8px; }
.result-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.result-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
.proof { display: block; width: 100%; margin-top: 8px; border-radius: 12px; }
.proof-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.proof-actions label { position: relative; overflow: hidden; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--chip); color: var(--accent); font-size: 14px; font-weight: 650; line-height: 36px; }
.proof-actions input { position: absolute; inset: 0; opacity: 0; }
.jump { display: block; margin-top: 8px; height: 44px; border-radius: 12px; background: var(--chip); color: var(--accent); font-weight: 600; font-size: 16px; line-height: 44px; text-align: center; }
.jump.main { background: var(--accent); color: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 10px; border-radius: 8px; background: var(--chip); font-size: 13px; font-weight: 600; }
.sheet { display: block; width: 100%; min-height: 0; margin: 8px 0 0; padding: 0; border-radius: 12px; overflow: hidden; background: var(--bg); }
.sheet img { display: block; width: 100%; }
.day-note { margin-top: 12px; }
.day-note h3 { margin: 0 0 4px; font-size: 13px; font-weight: 650; color: var(--muted); }
.day-note p { margin: 0; font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
.guide-text { margin: 8px 0 0; white-space: pre-wrap; font: inherit; font-size: 15px; line-height: 1.55; }
.viewer { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.88); }
.viewer img { max-width: 100%; max-height: 100%; }
</style>
