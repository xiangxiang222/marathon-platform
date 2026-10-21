<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId + '/activities/' + activityId" aria-label="返回">‹</router-link>
      <h1>相册</h1>
      <span></span>
    </header>
    <div v-if="activity" class="block">
      <h2>{{ activity.title }}</h2>
      <p class="hint">{{ activity.dateLabel }}<template v-if="activity.place"> · {{ activity.place }}</template></p>
      <p class="hint">{{ photoCount }} 张照片 · {{ videoCount }} 个视频</p>
      <div class="tools">
        <button type="button" class="status" :class="{ on: tab === 'photo' }" @click="tab = 'photo'">照片</button>
        <button type="button" class="status" :class="{ on: tab === 'video' }" @click="tab = 'video'">视频</button>
        <button type="button" class="undo" @click="flipOrder">{{ order === "new" ? "从新到旧" : "从早到晚" }}</button>
        <button type="button" class="undo" @click="layout = layout === 'grid' ? 'fall' : 'grid'">{{ layout === "grid" ? "宫格" : "瀑布流" }}</button>
      </div>
      <div class="tools">
        <button type="button" class="undo" @click="makeCard">分享图片</button>
        <button v-if="staff" type="button" class="undo" @click="managing = !managing">{{ managing ? "完成" : "管理" }}</button>
        <button v-if="staff" type="button" class="undo" @click="toggleReview">{{ review ? "审核已开" : "审核关闭" }}</button>
      </div>
      <p v-if="review" class="hint">新上传的先待审核。别人看不到，上传的人自己能看到。</p>
      <div v-if="visible.length" class="album" :class="layout">
        <button v-for="item in visible" :key="item.id" type="button" class="shot" @click="openItem(item)">
          <img v-if="item.kind === 'photo'" :src="src(item.id)" alt="" />
          <span v-else class="play">视频</span>
          <em v-if="item.pending">待审核</em>
          <i v-if="managing">{{ picked[item.id] ? "已选" : "选" }}</i>
        </button>
      </div>
      <p v-else class="hint">还没有照片。团员可以上传。</p>
      <div v-if="managing" class="tools">
        <button type="button" class="undo" @click="removePicked">删除所选</button>
        <button type="button" class="undo" @click="approvePicked">通过所选</button>
      </div>
      <label class="primary file">
        上传照片或视频
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" @change="onFiles" />
      </label>
      <p class="hint">照片不超过 8MB，视频不超过 40MB。还剩 {{ photoLeft }} 张照片、{{ videoLeft }} 个视频。</p>
    </div>
    <div v-if="viewer" class="viewer" @click="viewer = null">
      <button v-if="viewerIndex > 0" type="button" class="nav prev" @click.stop="step(-1)">‹</button>
      <div @click.stop>
        <img v-if="viewer.kind === 'photo'" :src="src(viewer.id)" alt="" />
        <video v-else :src="src(viewer.id)" controls autoplay playsinline></video>
        <p>{{ viewer.nickname }} · {{ viewer.at }}<template v-if="viewer.pending"> · 待审核</template></p>
        <button v-if="viewer.mine || staff" type="button" class="undo light" @click="removeOne(viewer)">删除</button>
        <button v-if="staff && viewer.pending" type="button" class="undo light" @click="approveOne(viewer)">通过</button>
        <button v-if="staff && viewer.kind === 'photo' && !viewer.pending" type="button" class="undo light" @click="makeCover(viewer)">设为封面</button>
      </div>
      <button v-if="viewerIndex < visible.length - 1" type="button" class="nav next" @click.stop="step(1)">›</button>
    </div>
    <div v-if="card" class="viewer" @click="card = ''">
      <img :src="card" alt="相册分享" />
    </div>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, mediaSrc, upload } from "../api";
import { albumCard } from "../share-card";

const route = useRoute();
const clubId = route.params.id;
const activityId = route.params.aid;
const activity = ref(null);
const items = ref([]);
const photoCount = ref(0);
const videoCount = ref(0);
const photoLeft = ref(400);
const videoLeft = ref(20);
const coverId = ref(0);
const review = ref(false);
const staff = ref(false);
const tab = ref("photo");
const order = ref("new");
const layout = ref("grid");
const managing = ref(false);
const picked = ref({});
const viewer = ref(null);
const card = ref("");
const message = ref("");

const visible = computed(() => items.value.filter((item) => item.kind === tab.value));
const viewerIndex = computed(() => visible.value.findIndex((item) => viewer.value && item.id === viewer.value.id));

function src(id) {
  return mediaSrc(id);
}

async function flipOrder() {
  order.value = order.value === "new" ? "old" : "new";
  await load();
}

async function load() {
  const data = await api("/clubs/" + clubId + "/activities/" + activityId + "/album?order=" + (order.value === "old" ? "old" : "new"));
  activity.value = data.activity;
  items.value = data.items || [];
  photoCount.value = data.photoCount || 0;
  videoCount.value = data.videoCount || 0;
  photoLeft.value = data.photoLeft;
  videoLeft.value = data.videoLeft;
  coverId.value = data.coverId || 0;
  review.value = !!data.review;
  staff.value = !!data.staff;
}

function openItem(item) {
  if (managing.value) {
    picked.value = { ...picked.value, [item.id]: !picked.value[item.id] };
    return;
  }
  viewer.value = item;
}

function step(delta) {
  const next = visible.value[viewerIndex.value + delta];
  if (next) viewer.value = next;
}

async function onFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  message.value = "";
  for (const file of files) {
    try {
      const data = await upload("/clubs/" + clubId + "/activities/" + activityId + "/media", file);
      if (data.media && data.media.pending) message.value = "已上传，等团长或跑团管理通过";
    } catch (err) {
      message.value = err.message;
      break;
    }
  }
  await load();
}

async function removeOne(item) {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/media/" + item.id, { method: "DELETE" });
    viewer.value = null;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function approveOne(item) {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/media/" + item.id + "/approve", { method: "POST", body: "{}" });
    viewer.value = null;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function makeCover(item) {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/activities/" + activityId + "/cover", {
      method: "POST",
      body: JSON.stringify({ mediaId: item.id })
    });
    coverId.value = data.coverId;
    message.value = "已设为封面";
  } catch (err) {
    message.value = err.message;
  }
}

async function removePicked() {
  const ids = Object.keys(picked.value).filter((id) => picked.value[id]);
  for (const id of ids) {
    try {
      await api("/clubs/" + clubId + "/activities/" + activityId + "/media/" + id, { method: "DELETE" });
    } catch (err) {
      message.value = err.message;
      break;
    }
  }
  picked.value = {};
  await load();
}

async function approvePicked() {
  const ids = Object.keys(picked.value).filter((id) => picked.value[id]);
  for (const id of ids) {
    const item = items.value.find((row) => String(row.id) === String(id));
    if (!item || !item.pending) continue;
    try {
      await api("/clubs/" + clubId + "/activities/" + activityId + "/media/" + id + "/approve", { method: "POST", body: "{}" });
    } catch (err) {
      message.value = err.message;
      break;
    }
  }
  picked.value = {};
  await load();
}

async function toggleReview() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId, {
      method: "PUT",
      body: JSON.stringify({ review: !review.value })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function makeCard() {
  message.value = "";
  try {
    card.value = await albumCard({
      title: activity.value.title,
      date: activity.value.dateLabel,
      place: activity.value.place,
      count: photoCount.value,
      coverUrl: coverId.value ? src(coverId.value) : ""
    });
  } catch (err) {
    message.value = "图片没有生成";
  }
}

onMounted(load);
</script>

<style scoped>
.hint { margin: 0 0 8px; color: #8d949c; font-size: 13px; line-height: 1.45; }
.tools { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.file { display: grid; place-items: center; position: relative; overflow: hidden; margin-top: 12px; }
.file input { position: absolute; inset: 0; opacity: 0; }
.album { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.album.fall { display: block; column-count: 2; column-gap: 8px; }
.album.fall .shot { width: 100%; margin: 0 0 8px; break-inside: avoid; aspect-ratio: auto; }
.album.fall .shot img { height: auto; }
.shot { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #e8f2ff; }
.shot img, .play { width: 100%; height: 100%; object-fit: cover; display: grid; place-items: center; color: #007aff; font-weight: 700; }
.shot em, .shot i { position: absolute; left: 6px; bottom: 4px; font-style: normal; color: #fff; font-size: 11px; }
.shot i { right: 6px; left: auto; }
.undo { color: #8d949c; }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.86); z-index: 40; display: grid; place-items: center; padding: 24px; }
.viewer img, .viewer video { max-width: min(430px, 100%); max-height: 70vh; border-radius: 12px; }
.viewer p { color: #fff; text-align: center; }
.light { color: #fff; }
.nav { position: absolute; top: 45%; width: 40px; height: 40px; border-radius: 20px; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 24px; }
.prev { left: 8px; }
.next { right: 8px; }
</style>
