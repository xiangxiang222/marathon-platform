<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>活动</h1>
      <span></span>
    </header>
    <div v-if="activity" class="pass tone-open">
      <div class="pass-copy">
        <span class="pass-pill">{{ activity.signupCount }} 人报名</span>
        <h1>{{ activity.title }}</h1>
        <p>{{ when }}<template v-if="activity.place"> · {{ activity.place }}</template></p>
      </div>
    </div>
    <div v-if="activity" class="block">
      <h2>报名</h2>
      <p class="hint">{{ activity.rule }}</p>
      <p v-if="activity.note" class="hint">{{ activity.note }}</p>
      <div v-if="groups.length" class="groups">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          class="status"
          :class="{ on: picked === group.id }"
          @click="picked = group.id"
        >
          {{ group.name }}<template v-if="group.pace"> {{ group.pace }}</template>
          · {{ group.signed }}<template v-if="group.capacity">/{{ group.capacity }}</template>
        </button>
      </div>
      <button class="primary" type="button" @click="signup">{{ activity.mine.signed ? "改组别" : "报名" }}</button>
      <button v-if="activity.mine.signed" class="undo" type="button" @click="cancel">取消报名</button>
      <div v-for="row in signups" :key="row.userId" class="mate">
        <span>{{ row.nickname }}</span>
        <b>{{ row.groupName || "未分组" }}</b>
      </div>
    </div>
    <div v-if="activity" class="block">
      <h2>打卡</h2>
      <p class="hint">先报名。公里数达到 {{ activity.minKm }}，并且够 {{ activity.minPeople }} 人，这场才记分。</p>
      <form class="check-form" @submit.prevent="check">
        <input v-model="km" inputmode="decimal" placeholder="今天跑了多少公里" />
        <input v-model="checkNote" maxlength="40" placeholder="可写一句" />
        <button class="primary" type="submit">{{ activity.mine.km != null ? "改公里" : "打卡" }}</button>
      </form>
      <p v-if="activity.awarded" class="hint award">这场已经记分。</p>
      <div v-for="row in checks" :key="row.userId" class="mate">
        <span>{{ row.nickname }}</span>
        <b :class="{ soon: !row.counts }">{{ row.km }} 公里<template v-if="!row.counts"> · 未达标</template></b>
      </div>
    </div>
    <div v-if="activity" class="block">
      <h2>相册</h2>
      <p class="hint">团员可以上传照片和视频，只有本团能看。</p>
      <label class="primary file">
        上传
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" @change="onFile" />
      </label>
      <div class="album">
        <button v-for="item in media" :key="item.id" type="button" class="shot" @click="openMedia(item)">
          <img v-if="item.kind === 'photo'" :src="src(item.id)" alt="" />
          <span v-else class="play">视频</span>
          <em>{{ item.nickname }}</em>
        </button>
      </div>
      <p v-if="!media.length" class="hint">还没有照片。</p>
    </div>
    <div v-if="viewer" class="viewer" @click="viewer = null">
      <img v-if="viewer.kind === 'photo'" :src="src(viewer.id)" alt="" />
      <video v-else :src="src(viewer.id)" controls autoplay playsinline @click.stop></video>
    </div>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, mediaSrc, upload } from "../api";

const route = useRoute();
const clubId = route.params.id;
const activity = ref(null);
const groups = ref([]);
const signups = ref([]);
const checks = ref([]);
const media = ref([]);
const picked = ref(0);
const km = ref("");
const checkNote = ref("");
const message = ref("");
const viewer = ref(null);
const when = computed(() => (activity.value ? activity.value.startsAt.replace("T", " ") : ""));

function src(id) {
  return mediaSrc(id);
}

async function load() {
  const data = await api("/clubs/" + clubId + "/activities/" + route.params.aid);
  activity.value = data.activity;
  groups.value = data.groups || [];
  signups.value = data.signups || [];
  checks.value = data.checks || [];
  media.value = data.media || [];
  if (data.activity.mine.groupId) picked.value = data.activity.mine.groupId;
  else if (!picked.value && groups.value.length) picked.value = groups.value[0].id;
  if (data.activity.mine.km != null) km.value = String(data.activity.mine.km);
}

async function signup() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + route.params.aid + "/signup", {
      method: "POST",
      body: JSON.stringify({ groupId: picked.value || 0 })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function cancel() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + route.params.aid + "/signup", { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function check() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/activities/" + route.params.aid + "/check", {
      method: "POST",
      body: JSON.stringify({ km: Number(km.value), note: checkNote.value })
    });
    message.value = data.awarded ? "这场已记分" : "已记下。人数或里程还不够，这场先不计分";
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function onFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  message.value = "";
  try {
    await upload("/clubs/" + clubId + "/activities/" + route.params.aid + "/media", file);
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

function openMedia(item) {
  viewer.value = item;
}

onMounted(load);
</script>

<style scoped>
.hint { margin: 0 0 8px; color: #8d949c; font-size: 13px; line-height: 1.45; }
.award { color: #248a3d; }
.groups { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.check-form { display: flex; flex-direction: column; gap: 8px; }
.check-form input, .block input { height: 40px; border: 0; border-radius: 10px; padding: 0 12px; background: rgba(118, 118, 128, 0.12); }
.file { display: inline-grid; place-items: center; position: relative; overflow: hidden; }
.file input { position: absolute; inset: 0; opacity: 0; }
.album { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.shot { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #e8f2ff; }
.shot img, .play { width: 100%; height: 100%; object-fit: cover; display: grid; place-items: center; color: #007aff; font-weight: 700; }
.shot em { position: absolute; left: 6px; bottom: 4px; font-style: normal; color: #fff; font-size: 11px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45); }
.undo { margin-top: 8px; color: #8d949c; }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.86); z-index: 40; display: grid; place-items: center; padding: 24px; }
.viewer img, .viewer video { max-width: min(430px, 100%); max-height: 80vh; border-radius: 12px; }
</style>
