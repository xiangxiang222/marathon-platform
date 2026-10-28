<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>约跑</h1>
      <span></span>
    </header>
    <section v-if="loading && !meetup" class="recovery-state" role="status">正在加载约跑…</section>
    <section v-else-if="loadError" class="recovery-state" role="alert">
      <p>{{ loadError }}</p><button type="button" class="primary" :disabled="loading" @click="retryLoad">{{ loading ? '正在重试…' : '重新加载' }}</button>
    </section>
    <template v-if="meetup">
      <div class="block">
        <h2>{{ meetup.dateLabel }} {{ meetup.place }}</h2>
        <p class="rank-label">{{ meetup.statusLabel }}</p>
        <p v-if="meetup.note" class="rank-label">{{ meetup.note }}</p>
        <p class="sum">{{ meetup.hint }}</p>
        <pre class="share-text">{{ meetup.shareText }}</pre>
        <button class="primary" type="button" @click="copy(meetup.shareText)">复制到微信群</button>
      </div>
      <div class="block">
        <button v-if="meetup.canJoin" class="primary" type="button" @click="act('join', 'POST')">算我一个</button>
        <button v-if="meetup.canLeave" class="undo" type="button" @click="act('join', 'DELETE')">不算我了</button>
        <button v-if="meetup.canCheck" class="primary" type="button" @click="act('check', 'POST')">打卡</button>
        <button v-if="meetup.canUncheck" class="undo" type="button" @click="act('check', 'DELETE')">撤销打卡</button>
        <label v-if="meetup.canPhoto" class="file-pick">上传合影<input type="file" accept="image/jpeg,image/png,image/webp" @change="onPhoto" /></label>
      </div>
      <div class="block">
        <h2>已打卡 {{ meetup.checkCount }}</h2>
        <p v-if="!meetup.checks.length" class="rank-label">还没有人打卡。</p>
        <div v-for="person in meetup.checks" :key="person.userId" class="mate">
          <span>{{ person.nickname }}<template v-if="person.mine"> · 我</template></span>
        </div>
      </div>
      <div class="block">
        <h2>算我一个 {{ meetup.joins.length }}</h2>
        <p v-if="!meetup.joins.length" class="rank-label">还没有人预报。</p>
        <div v-for="person in meetup.joins" :key="person.userId" class="mate">
          <span>{{ person.nickname }}</span>
        </div>
      </div>
      <div class="block">
        <h2>合影</h2>
        <p v-if="!meetup.photos.length" class="rank-label">还没有合影。至少 1 张，最多 9 张。</p>
        <div v-for="photo in meetup.photos" :key="photo.id">
          <img class="sheet" :src="photoSrc(photo.id)" alt="" />
          <button v-if="photo.mine || meetup.canStaff" class="undo" type="button" @click="removePhoto(photo)">删除</button>
        </div>
      </div>
      <div v-if="meetup.canStaff || meetup.canVoid" class="block">
        <h2>管理</h2>
        <p class="rank-label">7 天内可以补打卡、补合影，再重算。作废会把已经发出的积分扣回。</p>
        <form v-if="meetup.canStaff" class="check-form" @submit.prevent="staffCheck">
          <select v-model="forUser">
            <option value="">选成员补打卡</option>
            <option v-for="person in members" :key="person.id" :value="person.id">{{ person.nickname }}</option>
          </select>
          <button class="primary" type="submit">补打卡</button>
        </form>
        <button v-if="meetup.canStaff" class="undo" type="button" @click="act('resettle', 'POST')">重算</button>
        <button v-if="meetup.canVoid" class="undo" type="button" @click="act('void', 'POST')">作废</button>
      </div>
    </template>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message && message !== loadError" class="err">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, meetupPhotoSrc, upload } from "../api";
import { copyText } from "../copy";

const route = useRoute();
const clubId = route.params.id;
const meetup = ref(null);
const members = ref([]);
const forUser = ref("");
const message = ref("");
const note = ref("");
const loading = ref(false);
const loadError = ref("");

function photoSrc(id) {
  return meetupPhotoSrc(clubId, route.params.mid, id);
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const [data, club] = await Promise.all([
      api("/clubs/" + clubId + "/meetups/" + route.params.mid),
      api("/clubs/" + clubId)
    ]);
    meetup.value = data.meetup;
    members.value = club.members || [];
  } catch (err) {
    loadError.value = err.message;
    throw err;
  } finally {
    loading.value = false;
  }
}

async function retryLoad() {
  message.value = "";
  try {
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function act(path, method) {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/meetups/" + meetup.value.id + "/" + path, { method, body: "{}" });
    meetup.value = data.meetup;
    note.value = path === "void" ? "已作废" : "已记下";
  } catch (err) {
    message.value = err.message;
  }
}

async function staffCheck() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/meetups/" + meetup.value.id + "/check", {
      method: "POST",
      body: JSON.stringify({ userId: Number(forUser.value) })
    });
    meetup.value = data.meetup;
    note.value = "已补打卡";
  } catch (err) {
    message.value = err.message;
  }
}

async function onPhoto(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  message.value = "";
  try {
    const data = await upload("/clubs/" + clubId + "/meetups/" + meetup.value.id + "/photos", file);
    meetup.value = data.meetup;
    note.value = "合影已上传";
  } catch (err) {
    message.value = err.message;
  }
}

async function removePhoto(photo) {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/meetups/" + meetup.value.id + "/photos/" + photo.id, { method: "DELETE" });
    meetup.value = data.meetup;
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

onMounted(retryLoad);
</script>

<style scoped>
.rank-label { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.recovery-state { margin: 16px; padding: 24px 16px; border-radius: 12px; background: #fff; color: var(--muted); text-align: center; font-size: 14px; }
.recovery-state p { margin: 0 0 12px; overflow-wrap: anywhere; }
.sum { margin: 10px 0 0; font-weight: 600; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.primary { margin-top: 8px; }
.undo { width: auto; margin: 8px 8px 0 0; height: 32px; padding: 0 12px; background: transparent; color: var(--muted); }
.note { font-size: 12px; color: var(--accent); padding: 0 16px; }
.block select { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--chip); }
.sheet { width: 100%; margin-top: 8px; border-radius: 8px; }
.file-pick { display: inline-block; margin-top: 8px; color: var(--accent); }
.file-pick input { display: none; }
</style>
