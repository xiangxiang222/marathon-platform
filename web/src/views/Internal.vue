<template>
  <main class="club-detail-page service-page">
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>队内赛</h1>
      <span></span>
    </header>
    <template v-if="race">
      <div class="block detail-hero">
        <span class="detail-kicker">跑出状态 · 队内赛</span>
        <h2>{{ race.title }}</h2>
        <p class="rank-label">{{ race.startsLabel }}<template v-if="race.place"> · {{ race.place }}</template> · {{ race.distanceLabel }}</p>
        <p class="rank-label">{{ race.statusLabel }} · 报名截止 {{ race.deadlineLabel }}</p>
        <p v-if="race.note" class="rank-label">{{ race.note }}</p>
        <p class="rank-label">{{ race.finishPoints ? "完赛每人 " + race.finishPoints + " 分" : "这场完赛不记分" }}</p>
        <details class="share-fold"><summary>邀请跑友 · 查看报名文字</summary><pre class="share-text">{{ race.shareText }}</pre><button class="undo" type="button" @click="copy(race.shareText)">复制到微信群</button></details>
      </div>
      <form v-if="race.canSignup || race.canCancel" class="block" @submit.prevent="signup">
        <h2>选择组别，加入比赛</h2>
        <p class="rank-label">{{ nickname }}</p>
        <div class="checks">
          <label v-for="group in race.groups" :key="group.id">
            <input v-model="groupId" type="radio" name="group" :value="group.id" :disabled="group.full && groupId !== group.id" />
            {{ group.name }}<template v-if="group.capacity"> {{ group.taken }}/{{ group.capacity }}</template><template v-else> 不限</template>
          </label>
        </div>
        <button v-if="race.canSignup" class="primary" type="submit">报名</button>
        <button v-if="race.canCancel" class="undo" type="button" @click="cancelSignup">取消报名</button>
      </form>
      <form v-if="race.canResult" class="block" @submit.prevent="saveMine">
        <h2>完赛用时</h2>
        <input v-model="time" placeholder="45:30 或 3:29:59" />
        <button class="primary" type="submit">提交</button>
        <button class="undo" type="button" @click="mark('dnf')">未完赛</button>
      </form>
      <div v-for="group in race.groups" :key="group.id" class="block">
        <h2>{{ group.name }}</h2>
        <p v-if="!group.rows.length" class="rank-label">还没有人报名。</p>
        <div v-for="row in group.rows" :key="row.userId" class="mate" :class="{ mine: row.mine }">
          <router-link :to="memberLink(row.userId)" class="member-name-link">{{ row.place }} {{ row.nickname }}<template v-if="row.mine"> · 我</template></router-link>
          <b>{{ row.clock || row.outcomeLabel }}<template v-if="row.tag"> {{ row.tag }}</template></b>
        </div>
      </div>
      <details v-if="race.canStaffResult || race.canEnd || race.canCancelRace" class="block management-fold">
        <summary>队内赛管理</summary><form v-if="race.canStaffResult" @submit.prevent="saveStaff">
        <select v-model="forUser">
          <option value="">选已报名的人</option>
          <option v-for="row in signed" :key="row.userId" :value="row.userId">{{ row.nickname }}</option>
        </select>
        <input v-model="staffTime" placeholder="成绩，或下面标状态" />
        <button class="primary" type="submit">改正成绩</button>
        <button class="undo" type="button" @click="staffMark('dnf')">未完赛</button>
        <button class="undo" type="button" @click="staffMark('dns')">未出发</button>
        </form><button v-if="race.canEnd" class="primary" type="button" @click="endRace">结束并记分</button>
        <button v-if="race.canCancelRace" class="undo" type="button" @click="cancelRace">取消这场</button>
      </details>
    </template>
    <section v-else class="block detail-state" aria-live="polite">
      <p v-if="loading">正在打开队内赛…</p>
      <div v-else role="alert"><p>{{ message || '队内赛暂时无法打开' }}</p><button class="primary" type="button" @click="retry">重新加载</button></div>
    </section>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="race && message" class="err">{{ message }}</p>
  </main>
</template>

<script setup>
import { memberProfileLink } from "../member-profile-navigation";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, savedName } from "../api";
import { copyText } from "../copy";
import "../club-detail.css";

const route = useRoute();
const memberLink = uid => memberProfileLink(route.params.id, uid, { returnTo: route.fullPath });
const clubId = route.params.id;
const race = ref(null);
const loading = ref(true);
const groupId = ref(0);
const time = ref("");
const forUser = ref("");
const staffTime = ref("");
const message = ref("");
const note = ref("");
const nickname = savedName();

const signed = computed(() => {
  if (!race.value) return [];
  const rows = [];
  for (const group of race.value.groups || []) rows.push(...group.rows);
  return rows;
});

async function load() {
  const data = await api("/clubs/" + clubId + "/internals/" + route.params.rid);
  race.value = data.race;
  if (!groupId.value) {
    const open = (data.race.groups || []).find((group) => !group.full) || (data.race.groups || [])[0];
    groupId.value = data.race.mine ? data.race.mine.groupId : open ? open.id : 0;
  }
  if (data.race.mine && data.race.mine.clock) time.value = data.race.mine.clock;
}

async function signup() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/internals/" + race.value.id + "/signup", {
      method: "POST",
      body: JSON.stringify({ groupId: groupId.value })
    });
    race.value = data.race;
    note.value = "已报名";
  } catch (err) {
    message.value = err.message;
  }
}

async function cancelSignup() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/internals/" + race.value.id + "/signup", { method: "DELETE" });
    race.value = data.race;
    note.value = "已取消报名";
  } catch (err) {
    message.value = err.message;
  }
}

async function sendResult(body) {
  const data = await api("/clubs/" + clubId + "/internals/" + race.value.id + "/results", {
    method: "POST",
    body: JSON.stringify(body)
  });
  race.value = data.race;
}

async function saveMine() {
  message.value = "";
  try {
    await sendResult({ time: time.value });
    note.value = "已记下";
  } catch (err) {
    message.value = err.message;
  }
}

async function mark(outcome) {
  message.value = "";
  try {
    await sendResult({ outcome });
    note.value = "已记下";
  } catch (err) {
    message.value = err.message;
  }
}

async function saveStaff() {
  message.value = "";
  try {
    await sendResult({ userId: Number(forUser.value), time: staffTime.value });
    note.value = "已改正";
  } catch (err) {
    message.value = err.message;
  }
}

async function staffMark(outcome) {
  message.value = "";
  try {
    await sendResult({ userId: Number(forUser.value), outcome });
    note.value = "已改正";
  } catch (err) {
    message.value = err.message;
  }
}

async function endRace() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/internals/" + race.value.id + "/end", { method: "POST", body: "{}" });
    race.value = data.race;
    note.value = "已结束";
  } catch (err) {
    message.value = err.message;
  }
}

async function cancelRace() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/internals/" + race.value.id + "/cancel", { method: "POST", body: "{}" });
    race.value = data.race;
    note.value = "已取消";
  } catch (err) {
    message.value = err.message;
  }
}

async function copy(text) {
  note.value = "";
  message.value = "";
  try {
    await copyText(text);
    note.value = "文字已复制，可以贴到微信群";
  } catch (err) {
    message.value = "没有复制成功，可以直接选中上面的文字";
  }
}

async function retry() {
  loading.value = true;
  message.value = "";
  try {
    await load();
  } catch (err) {
    race.value = null;
    message.value = err.message;
  } finally {
    loading.value = false;
  }
}
onMounted(retry);
</script>

<style scoped>
.rank-label { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.primary { margin-top: 8px; }
.undo { width: auto; margin: 8px 8px 0 0; height: 32px; padding: 0 12px; background: transparent; color: var(--muted); }
.note { font-size: 12px; color: var(--accent); padding: 0 16px; }
.checks { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; }
.block input:not([type="radio"]):not([type="file"]), .block select { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--chip); }
.mine { background: var(--accent-soft); border-radius: 8px; padding-left: 8px; padding-right: 8px; }
.club-detail-page .block h2 { font-size:20px; line-height:1.45; }
.club-detail-page .block h3 { font-size:16px; line-height:1.5; }
.club-detail-page .block :is(input:not([type="radio"]):not([type="checkbox"]):not([type="file"]),textarea,select) { border:1px solid var(--line); border-radius:12px; background:var(--field-bg); font-size:14px; }


.club-detail-page { background:transparent; }.club-detail-page>.topbar { background:transparent; }.club-detail-page .detail-hero { background:var(--card);border-color:var(--line);box-shadow:none; }.club-detail-page .detail-kicker { color:var(--muted); }.club-detail-page .detail-actions .undo { background:var(--field-bg);border-color:var(--line); }
.member-name-link{min-width:0;color:var(--ink);overflow-wrap:anywhere;text-decoration:none}.member-name-link:hover{color:var(--accent)}
</style>

<style scoped src="../service-ui.css"></style>
