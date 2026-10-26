<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>队内赛</h1>
      <span></span>
    </header>
    <template v-if="race">
      <div class="block">
        <h2>{{ race.title }}</h2>
        <p class="rank-label">{{ race.startsLabel }}<template v-if="race.place"> · {{ race.place }}</template> · {{ race.distanceLabel }}</p>
        <p class="rank-label">{{ race.statusLabel }} · 报名截止 {{ race.deadlineLabel }}</p>
        <p v-if="race.note" class="rank-label">{{ race.note }}</p>
        <p class="rank-label">{{ race.finishPoints ? "完赛每人 " + race.finishPoints + " 分" : "这场完赛不记分" }}</p>
        <pre class="share-text">{{ race.shareText }}</pre>
        <button class="primary" type="button" @click="copy(race.shareText)">复制到微信群</button>
      </div>
      <form v-if="race.canSignup || race.canCancel" class="block" @submit.prevent="signup">
        <h2>报名</h2>
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
          <span>{{ row.place }} {{ row.nickname }}<template v-if="row.mine"> · 我</template></span>
          <b>{{ row.clock || row.outcomeLabel }}<template v-if="row.tag"> {{ row.tag }}</template></b>
        </div>
      </div>
      <form v-if="race.canStaffResult" class="block" @submit.prevent="saveStaff">
        <h2>管理</h2>
        <select v-model="forUser">
          <option value="">选已报名的人</option>
          <option v-for="row in signed" :key="row.userId" :value="row.userId">{{ row.nickname }}</option>
        </select>
        <input v-model="staffTime" placeholder="成绩，或下面标状态" />
        <button class="primary" type="submit">改正成绩</button>
        <button class="undo" type="button" @click="staffMark('dnf')">未完赛</button>
        <button class="undo" type="button" @click="staffMark('dns')">未出发</button>
        <button v-if="race.canEnd" class="primary" type="button" @click="endRace">结束并记分</button>
        <button v-if="race.canCancelRace" class="undo" type="button" @click="cancelRace">取消这场</button>
      </form>
    </template>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message" class="err">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, savedName } from "../api";
import { copyText } from "../copy";

const route = useRoute();
const clubId = route.params.id;
const race = ref(null);
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

onMounted(async () => {
  try {
    await load();
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.rank-label { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.primary { margin-top: 8px; }
.undo { width: auto; margin: 8px 8px 0 0; height: 32px; padding: 0 12px; background: transparent; color: var(--muted); }
.note { font-size: 12px; color: var(--accent); padding: 0 16px; }
.checks { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; }
.block input, .block select { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--chip); }
.mine { background: var(--accent-soft); border-radius: 8px; padding-left: 8px; padding-right: 8px; }
</style>
