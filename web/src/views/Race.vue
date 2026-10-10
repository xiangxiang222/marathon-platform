<template>
  <main>
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事</h1>
      <span></span>
    </header>

    <p v-if="phase === 'loading'" class="state">正在打开这场</p>
    <div v-else-if="phase === 'error'" class="state">
      <p class="err">{{ message }}</p>
      <button class="text-btn" type="button" @click="load">重试</button>
    </div>

    <template v-else-if="race">
      <div class="detail-poster">
        <Poster cover :id="race.id" :name="race.name" :city="race.city" :date="race.raceDate" />
      </div>
      <section class="detail">
        <div class="reg">{{ race.regStatus }}</div>
        <h1>{{ race.name }}</h1>
        <p class="facts">{{ race.raceDate }} · {{ placeLine(race) }}</p>
        <p v-if="race.distanceLabels.length" class="facts">{{ race.distanceLabels.join(" / ") }}</p>
      </section>

      <section v-if="callout" class="callout" :class="{ soon: callout.soon }">
        <b>{{ callout.label }}</b>
        <span>{{ calloutLine }}</span>
      </section>

      <section v-if="conflicts.length" class="block">
        <p v-for="item in conflicts" :key="item.text" class="warn">{{ item.text }}</p>
      </section>

      <section class="block">
        <h2>我这场</h2>
        <p v-if="showSignup(race, myStatus)">
          <a class="inline-link" :href="race.eventUrl" target="_blank" rel="noopener">去赛事网站报名</a>
        </p>
        <p v-if="showSignup(race, myStatus)" class="help">报名在赛事网站完成。报完回到这里，标成已报名。</p>
        <p v-else-if="race.open && !race.eventUrl && (!myStatus || myStatus === '想跑')" class="help">这场没有记下报名网址。报完后在这里标状态。</p>

        <form v-if="!ready" class="stack" @submit.prevent="enter">
          <label class="label" for="race-name">你在团里的名字</label>
          <input id="race-name" v-model="draft" maxlength="20" placeholder="例如 阿宁" />
          <p class="help">同团的人会看到这个名字。1 到 20 个字。</p>
          <button class="primary" type="submit" :disabled="saving">{{ saving ? "正在记下…" : "记下名字" }}</button>
        </form>
        <p v-else class="help">你在团里的名字：{{ nickname }}</p>

        <p class="help">{{ hint }}</p>
        <p v-if="saving" class="help">正在记下…</p>
        <div v-for="group in groups" :key="group.label" class="status-group">
          <p class="kicker">{{ group.label }}</p>
          <div class="statuses">
            <button
              v-for="item in group.items"
              :key="item"
              type="button"
              class="status"
              :class="{ on: myStatus === item }"
              :disabled="!ready || saving"
              @click="mark(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <p class="help">状态由你自己标，同团可见。这里不代报名。</p>
        <button v-if="ready && myStatus" class="text-btn" type="button" :disabled="saving" @click="drop">不跑这场了</button>
        <p v-if="ok" class="ok" role="status">{{ ok }}</p>
        <p v-if="message" class="err">{{ message }}</p>
      </section>

      <section v-for="card in cards" :key="card.club.id" class="block">
        <h2>{{ card.club.name }}</h2>
        <p>{{ card.summary }}</p>
        <p v-if="card.squad && card.squad.text" class="help">{{ card.squad.text }}</p>
        <p v-if="onlyMe(card)" class="help">目前只有你标了这场。把卡片发到群里，别人就能跟着标。</p>
        <div v-for="markItem in card.marks" :key="markItem.nickname + markItem.status" class="mate">
          <span>{{ markItem.nickname }}</span>
          <b>{{ markItem.status }}</b>
        </div>
        <p v-if="!card.marks.length" class="help">团里还没人标这场</p>
        <pre class="share-text">{{ card.text }}</pre>
        <button class="primary" type="button" @click="copyCard(card)">复制发到群</button>
      </section>
      <p v-if="note" class="ok" role="status">{{ note }}</p>
      <p v-if="copyError" class="err">{{ copyError }}</p>
      <section v-if="ready && !cards.length" class="block">
        <h2>同团</h2>
        <p>你还没有跑团。加入之后，这里会显示谁和你报了同一场。</p>
        <router-link class="text-link" to="/clubs" style="margin: 12px 0 0">去跑团</router-link>
      </section>

      <section v-if="race.nodes.length" class="block">
        <h2>时间节点</h2>
        <div v-for="node in race.nodes" :key="node.key" class="mate">
          <span>{{ node.label }}</span>
          <b :class="{ soon: node.soon, past: node.past }">
            {{ node.at }}<template v-if="node.text"> · {{ node.text }}</template>
          </b>
        </div>
      </section>

      <section v-if="alternatives.length" class="block">
        <h2>日期相近，报名还开着</h2>
        <p v-if="alternativeNote" class="help">{{ alternativeNote }}</p>
        <router-link v-for="item in alternatives" :key="item.id" class="race-row" :to="'/races/' + item.id">
          <div>
            <p class="name">{{ item.name }}</p>
            <p class="meta">{{ item.city }}</p>
          </div>
          <span class="trail">{{ item.deadlineLabel }}</span>
        </router-link>
      </section>

      <section v-if="drawText" class="block">
        <h2>中签了，可以发到群里</h2>
        <pre class="share-text">{{ drawText }}</pre>
        <button class="primary" type="button" @click="copyDraw">复制发到群</button>
        <p v-if="drawNote" class="ok" role="status">{{ drawNote }}</p>
        <p v-if="drawError" class="err">{{ drawError }}</p>
      </section>

      <section v-if="ready" class="block">
        <h2>成绩</h2>
        <p v-if="myResult" class="result-line">
          {{ myResult.distanceLabel }} {{ myResult.clock }} · 配速 {{ myResult.pace }}<span v-if="myResult.pb" class="pb">PB</span>
        </p>
        <p v-if="myResult && myResult.story">{{ myResult.story }}</p>
        <button v-if="!resultOpen" class="ghost" type="button" @click="resultOpen = true">{{ myResult ? "修改成绩" : "记下成绩" }}</button>
        <form v-else class="stack" @submit.prevent="saveResult">
          <p class="kicker">项目</p>
          <div class="statuses">
            <button
              v-for="(label, i) in race.distanceLabels"
              :key="race.distances[i]"
              type="button"
              class="choice"
              :class="{ on: distance === race.distances[i] }"
              @click="distance = race.distances[i]"
            >
              {{ label }}
            </button>
          </div>
          <label class="label" for="clock">成绩</label>
          <input id="clock" v-model="clock" placeholder="例如 3:29:59" />
          <label class="label" for="story">一句记录，可不填</label>
          <input id="story" v-model="story" maxlength="200" placeholder="例如 后程掉速了" />
          <p class="help">本人填写，未核验。保存后这场状态会变成完赛。</p>
          <button class="primary" type="submit" :disabled="savingResult">{{ savingResult ? "正在保存…" : myResult ? "保存修改" : "保存成绩" }}</button>
        </form>
        <p v-if="resultOk" class="ok" role="status">{{ resultOk }}</p>
        <p v-if="resultMessage" class="err">{{ resultMessage }}</p>
      </section>

      <section class="block">
        <h2>资料</h2>
        <p v-if="race.gradeLabel" class="src">{{ race.gradeLabel }}</p>
        <p v-if="race.organizer" class="src">主办 {{ race.organizer }}</p>
        <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt }}</template></p>
        <p v-if="!race.source && !race.organizer && !race.gradeLabel" class="src">这场还没有记下来源。</p>
        <p v-if="race.eventUrl" class="src"><a class="inline-link" :href="race.eventUrl" target="_blank" rel="noopener">赛事网站</a></p>
        <p v-if="race.officialUrl" class="src"><a class="inline-link" :href="race.officialUrl" target="_blank" rel="noopener">中国马拉松官网这场</a></p>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { copyText } from "../copy";
import Poster from "../components/Poster.vue";
import { groupsFor, nextCallout, placeLine, showSignup, statusHint } from "../product";
import { useSession } from "../session";

const route = useRoute();
const { nickname, ready, save } = useSession();
const phase = ref("loading");
const race = ref(null);
const statuses = ref([]);
const myStatus = ref("");
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
const resultOpen = ref(false);
const draft = ref("");
const saving = ref(false);
const savingResult = ref(false);
const message = ref("");
const ok = ref("");
const resultMessage = ref("");
const resultOk = ref("");
const note = ref("");
const copyError = ref("");

const groups = computed(() => groupsFor(statuses.value));
const callout = computed(() => nextCallout(race.value));
const calloutLine = computed(() => {
  if (!callout.value) return "";
  return [callout.value.text, callout.value.at].filter(Boolean).join(" · ");
});
const hint = computed(() => statusHint(myStatus.value, race.value));

function onlyMe(card) {
  return card.marks.length === 1 && card.marks[0].nickname === nickname.value;
}

function applyResult(data) {
  myResult.value = data.myResult || null;
  if (data.myResult) {
    distance.value = data.myResult.distance;
    clock.value = data.myResult.clock;
    story.value = data.myResult.story || "";
    resultOpen.value = true;
  } else if (!distance.value && data.race.distances.length) {
    distance.value = data.race.distances[0];
  }
  const finished = data.myStatus === "完赛" || data.myStatus === "未完赛" || data.race.regStatus === "已结束";
  if (finished) resultOpen.value = true;
}

async function load(options = {}) {
  const quiet = options.quiet && race.value;
  if (!quiet) {
    phase.value = "loading";
    message.value = "";
  }
  try {
    const data = await api("/races/" + route.params.id);
    race.value = data.race;
    statuses.value = data.statuses || [];
    myStatus.value = data.myStatus || "";
    cards.value = data.cards || [];
    conflicts.value = data.conflicts || [];
    alternatives.value = data.alternatives || [];
    alternativeNote.value = data.alternativeNote || "";
    drawText.value = data.drawText || "";
    applyResult(data);
    phase.value = "ready";
  } catch (err) {
    if (quiet) {
      message.value = err.message || "这场没有打开";
      return;
    }
    phase.value = "error";
    message.value = err.message || "这场没有打开";
  }
}

async function enter() {
  message.value = "";
  ok.value = "";
  const name = draft.value.trim();
  if (!name || name.length > 20) {
    message.value = "昵称用 1 到 20 个字";
    return;
  }
  saving.value = true;
  try {
    const data = await api("/session", { method: "POST", body: JSON.stringify({ nickname: name }) });
    save(data.token, data.user.nickname);
    draft.value = "";
    ok.value = "名字已记下。";
    const code = String(route.query.code || "").trim();
    if (code) {
      try {
        await api("/clubs/join", { method: "POST", body: JSON.stringify({ code }) });
      } catch (err) {
        /* 口令无效时仍留下名字，名单稍后单独说明。 */
      }
    }
    await load({ quiet: true });
    ok.value = "名字已记下。";
  } catch (err) {
    message.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function drop() {
  if (!window.confirm("移出这场？已记下的成绩还在。")) return;
  message.value = "";
  ok.value = "";
  saving.value = true;
  try {
    await api("/me/races/" + route.params.id, { method: "DELETE" });
    ok.value = "已移出你的安排";
    await load({ quiet: true });
  } catch (err) {
    message.value = err.message || "没有移出";
  } finally {
    saving.value = false;
  }
}

async function mark(status) {
  if (!ready.value || status === myStatus.value) return;
  message.value = "";
  ok.value = "";
  saving.value = true;
  try {
    await api("/me/races/" + route.params.id, { method: "PUT", body: JSON.stringify({ status }) });
    await load({ quiet: true });
    ok.value = "已记下。同团的人能看见。";
  } catch (err) {
    message.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function saveResult() {
  resultMessage.value = "";
  resultOk.value = "";
  const time = clock.value.trim();
  if (!/^(\d{1,2}):([0-5]\d)(:[0-5]\d)?$/.test(time)) {
    resultMessage.value = "成绩写成 45:30 或 3:29:59";
    return;
  }
  savingResult.value = true;
  try {
    await api("/me/races/" + route.params.id + "/result", {
      method: "PUT",
      body: JSON.stringify({ distance: distance.value, time, story: story.value.trim() })
    });
    await load({ quiet: true });
    resultOk.value = "成绩已记下，这场状态改为完赛。";
    resultOpen.value = true;
  } catch (err) {
    resultMessage.value = err.message;
  } finally {
    savingResult.value = false;
  }
}

async function copyCard(card) {
  note.value = "";
  copyError.value = "";
  try {
    await copyText(card.text);
    note.value = "已复制。贴到微信群即可。";
  } catch (err) {
    copyError.value = "没有复制成功。选中下面的文字即可。";
  }
}

async function copyDraw() {
  drawNote.value = "";
  drawError.value = "";
  try {
    await copyText(drawText.value);
    drawNote.value = "已复制。贴到微信群即可。";
  } catch (err) {
    drawError.value = "没有复制成功。选中下面的文字即可。";
  }
}

onMounted(async () => {
  const code = String(route.query.code || "").trim();
  if (code && ready.value) {
    try {
      await api("/clubs/join", { method: "POST", body: JSON.stringify({ code }) });
    } catch (err) {
      /* 打不开口令时仍展示这场。 */
    }
  }
  await load();
});
</script>
