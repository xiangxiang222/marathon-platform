<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>成绩统计</h1>
      <span></span>
    </header>
    <template v-if="call">
      <div class="block">
        <h2>{{ call.title }}</h2>
        <p class="rank-label">{{ call.raceDate }} · 截止 {{ call.deadlineLabel }}<template v-if="call.closed"> · 已截止</template></p>
        <p v-if="call.note" class="rank-label">{{ call.note }}</p>
        <p class="sum">{{ call.summary }}</p>
        <pre class="share-text">{{ call.shareText }}</pre>
        <button class="primary" type="button" @click="copy(call.shareText, '文字已复制，可以贴到微信群')">复制到微信群</button>
        <button class="undo" type="button" @click="copy(call.boardText, '成绩榜已复制')">复制成绩榜</button>
      </div>
      <form v-if="!call.closed" class="block" @submit.prevent="submitOwn">
        <h2>填写</h2>
        <div class="checks">
          <label v-for="opt in options" :key="opt.id"><input v-model="distance" type="radio" name="distance" :value="opt.id" /> {{ opt.label }}</label>
        </div>
        <input v-model="time" placeholder="1:32:10 或 45:30" />
        <button class="primary" type="submit">提交</button>
        <label v-if="ownRow" class="file-pick">证书或截图<input type="file" accept="image/jpeg,image/png,image/webp" @change="onSheet" /></label>
      </form>
      <p v-else class="block rank-label">已经截止。要改自己的成绩，请让团长把截止延后。</p>
      <div v-for="group in call.groups" :key="group.distance" class="block">
        <h2>{{ group.label }}</h2>
        <div v-for="row in group.rows" :key="row.id" class="mate" :class="{ mine: row.mine }">
          <span>{{ row.place }} {{ row.nickname }}<template v-if="row.mine"> · 我</template><template v-if="row.staffFilled"> · 管理员补录</template></span>
          <b>
            {{ row.clock }}<template v-if="row.tag"> {{ row.tag }}</template>
            <button v-if="staff || (row.mine && !call.closed)" class="undo" type="button" @click="remove(row)">删除</button>
          </b>
        </div>
        <p v-for="row in group.rows" :key="'img' + row.id">
          <img v-if="row.hasSheet" class="sheet" :src="sheetSrc(row.id)" alt="" />
        </p>
      </div>
      <p v-if="!call.groups.length" class="empty">还没有人填写。</p>
      <form v-if="staff" class="block" @submit.prevent="saveDeadline">
        <h2>管理</h2>
        <input v-model="deadline" placeholder="截止 2026-11-22 22:00" />
        <button class="primary" type="submit">改截止</button>
      </form>
      <form v-if="staff" class="block" @submit.prevent="fillFor">
        <p class="rank-label">给不会操作的成员补一条。</p>
        <select v-model="forUser">
          <option value="">选成员</option>
          <option v-for="member in call.members" :key="member.id" :value="member.id">{{ member.nickname }}</option>
        </select>
        <div class="checks">
          <label v-for="opt in options" :key="'s' + opt.id"><input v-model="forDistance" type="radio" name="forDistance" :value="opt.id" /> {{ opt.label }}</label>
        </div>
        <input v-model="forTime" placeholder="成绩" />
        <button class="primary" type="submit">补录</button>
      </form>
    </template>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message" class="err">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, callSheetSrc, upload } from "../api";
import { copyText } from "../copy";

const route = useRoute();
const clubId = route.params.id;
const call = ref(null);
const staff = ref(false);
const distance = ref("");
const time = ref("");
const deadline = ref("");
const forUser = ref("");
const forDistance = ref("");
const forTime = ref("");
const message = ref("");
const note = ref("");

const labels = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };

const options = computed(() => {
  if (!call.value) return [];
  return (call.value.distances || []).map((id) => ({
    id,
    label: id === "other" ? (call.value.otherKm || "") + "公里" : labels[id] || id
  }));
});

const ownRow = computed(() => {
  if (!call.value) return null;
  for (const group of call.value.groups || []) {
    const row = group.rows.find((item) => item.mine && item.distance === distance.value);
    if (row) return row;
  }
  return null;
});

function sheetSrc(id) {
  return callSheetSrc(id);
}

async function load() {
  const data = await api("/clubs/" + clubId + "/calls/" + route.params.cid);
  call.value = data.call;
  deadline.value = data.call.deadline.replace("T", " ");
  if (!distance.value && data.call.distances.length) distance.value = data.call.distances[0];
  if (!forDistance.value && data.call.distances.length) forDistance.value = data.call.distances[0];
  const club = await api("/clubs/" + clubId);
  staff.value = Boolean(club.club && club.club.staff);
}

async function submitOwn() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/calls/" + call.value.id + "/rows", {
      method: "POST",
      body: JSON.stringify({ distance: distance.value, time: time.value })
    });
    call.value = data.call;
    note.value = "已记下";
  } catch (err) {
    message.value = err.message;
  }
}

async function fillFor() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/calls/" + call.value.id + "/rows", {
      method: "POST",
      body: JSON.stringify({ userId: Number(forUser.value), distance: forDistance.value, time: forTime.value })
    });
    call.value = data.call;
    note.value = "已补录";
  } catch (err) {
    message.value = err.message;
  }
}

async function remove(row) {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/calls/" + call.value.id + "/rows/" + row.id, { method: "DELETE" });
    call.value = data.call;
  } catch (err) {
    message.value = err.message;
  }
}

async function saveDeadline() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/calls/" + call.value.id, {
      method: "PUT",
      body: JSON.stringify({ deadline: deadline.value, note: call.value.note })
    });
    call.value = data.call;
    note.value = "截止已改";
  } catch (err) {
    message.value = err.message;
  }
}

async function onSheet(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !ownRow.value) return;
  message.value = "";
  try {
    const data = await upload("/clubs/" + clubId + "/calls/" + call.value.id + "/rows/" + ownRow.value.id + "/sheet", file);
    call.value = data.call;
    note.value = "截图已上传";
  } catch (err) {
    message.value = err.message;
  }
}

async function copy(text, ok) {
  note.value = "";
  message.value = "";
  try {
    await copyText(text);
    note.value = ok;
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
.sum { margin: 10px 0 0; font-weight: 600; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.primary { margin-top: 8px; }
.undo { width: auto; margin: 8px 0 0; height: 32px; padding: 0 12px; background: transparent; color: var(--muted); }
.note { font-size: 12px; color: var(--accent); padding: 0 16px; }
.checks { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; }
.block input, .block select { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--chip); }
.mine { background: var(--accent-soft); border-radius: 8px; padding-left: 8px; padding-right: 8px; }
.sheet { width: 100%; margin-top: 8px; border-radius: 8px; }
.file-pick { display: inline-block; margin-top: 8px; color: var(--accent); }
.file-pick input { display: none; }
</style>
