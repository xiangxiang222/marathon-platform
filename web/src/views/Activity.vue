<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回">‹</router-link>
      <h1>活动</h1>
      <span></span>
    </header>
    <div v-if="activity" class="pass tone-open">
      <div class="pass-copy">
        <span class="pass-pill">{{ activity.statusLabel }}</span>
        <h1>{{ activity.title }}</h1>
        <p v-if="activity.issue">{{ activity.issue }}</p>
        <p>{{ activity.timeLabel }}</p>
      </div>
    </div>
    <div v-if="activity" class="block">
      <p v-if="activity.gatherAt" class="hint">集合时间 {{ activity.gatherAt }}</p>
      <p v-if="activity.gatherPlace" class="hint">集合点 {{ activity.gatherPlace }}</p>
      <p v-if="activity.place" class="hint">地点 {{ activity.place }}</p>
      <p v-if="activity.plannedKm" class="hint">计划里程 {{ activity.plannedKm }} 公里</p>
      <p v-if="activity.route" class="hint">路线 {{ activity.route }}</p>
      <p class="hint">
        {{ activity.signupCount }} 人报名
        <template v-if="activity.capacity"> / {{ activity.capacity }}</template>
        <template v-if="activity.gendered"> · 男 {{ activity.men }} · 女 {{ activity.women }}</template>
      </p>
      <p v-if="activity.cancelHint" class="hint">{{ activity.cancelHint }}</p>
    </div>
    <div v-for="group in groups" :key="group.id" class="block">
      <h2>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></h2>
      <p class="hint">
        {{ group.kindLabel }} · {{ group.signed }}<template v-if="group.capacity">/{{ group.capacity }}</template><template v-else> · 不限</template>
        <template v-if="group.men || group.women"> · 男 {{ group.men }} · 女 {{ group.women }}</template>
      </p>
      <div v-for="person in group.people" :key="person.userId" class="mate">
        <span>{{ person.pacer ? "领跑 " : "" }}{{ person.nickname }}<template v-if="person.mine"> · 我</template></span>
        <b>
          <template v-if="person.level">{{ person.level }}</template>
          <template v-if="person.gender"> {{ person.gender }}</template>
          <template v-if="person.together"> · 一起玩过 {{ person.together }} 次</template>
        </b>
      </div>
      <p v-if="!group.people.length" class="hint">还没有人。</p>
    </div>
    <div v-if="activity && !groups.length && signups.length" class="block">
      <h2>名单</h2>
      <div v-for="person in signups" :key="person.userId" class="mate">
        <span>{{ person.nickname }}</span>
        <b><template v-if="person.level">{{ person.level }}</template></b>
      </div>
    </div>
    <div v-if="activity" class="block">
      <h2>说明</h2>
      <p class="note-text">{{ activity.note || "团长还没有写说明。" }}</p>
      <p class="hint">{{ activity.rule }}</p>
    </div>
    <div v-if="activity" class="block">
      <router-link v-if="activity.action.enabled && activity.action.kind === 'signup'" class="primary link" :to="'/clubs/' + clubId + '/activities/' + activityId + '/signup'">报名</router-link>
      <button v-else-if="activity.action.enabled" class="primary" type="button" @click="cancel">取消报名</button>
      <button v-else class="primary" type="button" disabled>{{ activity.action.label }}</button>
      <button v-if="activity.mine.signed && activity.mine.groupId" class="undo" type="button" @click="pacer(!activity.mine.pacer)">{{ activity.mine.pacer ? "不领跑了" : "我来领跑" }}</button>
    </div>
    <router-link v-if="album" class="block album-link" :to="'/clubs/' + clubId + '/activities/' + activityId + '/album'">
      <img v-if="album.coverId" :src="src(album.coverId)" alt="" />
      <div>
        <h2>查看相册</h2>
        <p class="hint">{{ album.photoCount }} 张照片 · {{ album.videoCount }} 个视频</p>
      </div>
    </router-link>
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
    <div v-if="staff" class="block">
      <button class="undo" type="button" @click="editing = !editing">{{ editing ? "收起" : "改这场" }}</button>
      <form v-if="editing && draft" class="check-form" @submit.prevent="save">
        <input v-model="draft.title" maxlength="40" placeholder="标题" />
        <input v-model="draft.issue" maxlength="40" placeholder="期次，可不填" />
        <input v-model="draft.startsAt" placeholder="开始 2026-10-14 05:00" />
        <input v-model="draft.endsAt" placeholder="结束 2026-10-14 06:30，可不填" />
        <input v-model="draft.gatherAt" maxlength="40" placeholder="集合时间，可不填" />
        <input v-model="draft.gatherPlace" maxlength="40" placeholder="集合点" />
        <input v-model="draft.place" maxlength="40" placeholder="地点" />
        <input v-model="draft.plannedKm" inputmode="decimal" placeholder="计划里程，公里，可不填" />
        <input v-model="draft.route" maxlength="200" placeholder="路线" />
        <input v-model="draft.cancelUntil" placeholder="取消报名截止，可不填" />
        <textarea v-model="draft.note" maxlength="2000" placeholder="说明"></textarea>
        <div class="pair">
          <label>成团人数<input v-model.number="draft.minPeople" type="number" min="1" max="500" /></label>
          <label>里程公里<input v-model.number="draft.minKm" type="number" min="0.1" max="100" step="0.1" /></label>
          <label>这场积分<input v-model.number="draft.points" type="number" min="0" max="100" /></label>
        </div>
        <button class="primary" type="submit">保存</button>
      </form>
      <form class="check-form" @submit.prevent="addGroup">
        <input v-model="groupName" maxlength="20" placeholder="加一组，例如 A2" />
        <select v-model="groupKind">
          <option value="pace">配速组</option>
          <option value="finish">完赛组</option>
          <option value="volunteer">志愿者</option>
          <option value="other">非训练</option>
        </select>
        <input v-model="groupPace" maxlength="40" placeholder="配速或目标，可不填" />
        <input v-model.number="groupCap" type="number" min="0" max="500" placeholder="名额，0 表示不限" />
        <button class="primary" type="submit">加一组</button>
      </form>
      <button class="undo" type="button" @click="endActivity">结束这场</button>
      <button class="undo" type="button" @click="cancelActivity">取消这场</button>
    </div>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, mediaSrc } from "../api";

const route = useRoute();
const clubId = route.params.id;
const activityId = route.params.aid;
const activity = ref(null);
const groups = ref([]);
const signups = ref([]);
const checks = ref([]);
const album = ref(null);
const staff = ref(false);
const km = ref("");
const checkNote = ref("");
const message = ref("");
const editing = ref(false);
const draft = ref(null);
const groupName = ref("");
const groupKind = ref("pace");
const groupPace = ref("");
const groupCap = ref(0);

function src(id) {
  return mediaSrc(id);
}

function fillDraft() {
  const row = activity.value;
  draft.value = {
    title: row.title,
    issue: row.issue,
    startsAt: row.startsAt.replace("T", " "),
    endsAt: row.endsAt ? row.endsAt.replace("T", " ") : "",
    gatherAt: row.gatherAt,
    gatherPlace: row.gatherPlace,
    place: row.place,
    plannedKm: row.plannedKm == null ? "" : row.plannedKm,
    route: row.route,
    cancelUntil: row.cancelUntil ? row.cancelUntil.replace("T", " ") : "",
    note: row.note,
    minPeople: row.minPeople,
    minKm: row.minKm,
    points: row.points
  };
}

async function load() {
  const data = await api("/clubs/" + clubId + "/activities/" + activityId);
  activity.value = data.activity;
  groups.value = data.groups || [];
  signups.value = data.signups || [];
  checks.value = data.checks || [];
  album.value = data.album;
  staff.value = !!data.staff;
  if (data.activity.mine.km != null) km.value = String(data.activity.mine.km);
  if (editing.value) fillDraft();
}

async function cancel() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/signup", { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function pacer(on) {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/pacer", {
      method: "POST",
      body: JSON.stringify({ on })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function check() {
  message.value = "";
  try {
    const data = await api("/clubs/" + clubId + "/activities/" + activityId + "/check", {
      method: "POST",
      body: JSON.stringify({ km: Number(km.value), note: checkNote.value })
    });
    message.value = data.awarded ? "这场已记分" : "已记下。人数或里程还不够，这场先不计分";
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function save() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId, {
      method: "PUT",
      body: JSON.stringify(draft.value)
    });
    editing.value = false;
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function addGroup() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName.value, kind: groupKind.value, pace: groupPace.value, capacity: Number(groupCap.value) || 0 })
    });
    groupName.value = "";
    groupPace.value = "";
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function endActivity() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/end", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function cancelActivity() {
  message.value = "";
  if (!window.confirm("取消这场？名单还在，不能再报名。")) return;
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/cancel", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>

<style scoped>
.hint { margin: 0 0 8px; color: #8d949c; font-size: 13px; line-height: 1.45; }
.award { color: #248a3d; }
.note-text { margin: 0 0 8px; white-space: pre-wrap; line-height: 1.5; }
.check-form { display: flex; flex-direction: column; gap: 8px; }
.check-form input, .check-form textarea, .check-form select { width: 100%; border: 0; border-radius: 10px; padding: 10px 12px; background: rgba(118, 118, 128, 0.12); }
.check-form textarea { min-height: 96px; }
.link { display: grid; place-items: center; text-decoration: none; }
.undo { margin-top: 8px; color: #8d949c; }
.album-link { display: flex; gap: 12px; align-items: center; text-decoration: none; color: inherit; }
.album-link img { width: 72px; height: 72px; object-fit: cover; border-radius: 12px; }
.pair { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.pair label { font-size: 12px; color: #8d949c; }
button.primary:disabled { opacity: 0.45; }
</style>
