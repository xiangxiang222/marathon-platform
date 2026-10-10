<template>
  <main>
    <header class="topbar">
      <router-link to="/sport" aria-label="返回">‹</router-link>
      <h1>跑团</h1>
      <span></span>
    </header>
    <div v-if="club" class="detail">
      <div class="hero-name">{{ club.name }}</div>
      <div class="row"><span>口令，发到微信群</span><b>{{ club.code }}</b></div>
      <div class="tags" style="margin-top:8px">
        <span v-for="member in members" :key="member.id">{{ member.nickname }}</span>
      </div>
    </div>
    <div v-if="club" class="seg">
      <button type="button" :class="{ on: tab === 'race' }" @click="tab = 'race'">比赛</button>
      <button type="button" :class="{ on: tab === 'act' }" @click="tab = 'act'">活动</button>
      <button type="button" :class="{ on: tab === 'people' }" @click="tab = 'people'">成员</button>
    </div>
    <div v-if="club && tab === 'race'" class="block">
      <h2>团练签到</h2>
      <p class="rank-label">只记今天谁到了，不记公里。</p>
      <form class="check-form" @submit.prevent="checkIn">
        <input v-model="checkNote" maxlength="40" placeholder="可写一句，比如夜跑" />
        <button class="primary" type="submit">{{ checkedIn ? "改一句" : "签到" }}</button>
      </form>
      <button v-if="checkedIn" class="undo" type="button" @click="undoCheckin">撤销今天</button>
      <p v-if="!checkins.length" class="rank-label">今天还没有人签到。</p>
      <div v-for="day in checkins" :key="day.date">
        <p class="rank-label">{{ day.label }}</p>
        <div v-for="row in day.rows" :key="day.date + '-' + row.userId" class="mate">
          <span>{{ row.nickname }}</span>
          <b>{{ row.note }}</b>
        </div>
      </div>
      <p v-if="checkMessage" class="err">{{ checkMessage }}</p>
    </div>
    <div v-if="tab === 'race' && ranks.length" class="block">
      <h2>团内成绩</h2>
      <p class="rank-label">每人每项只留最好的一场。</p>
      <div v-for="group in ranks" :key="group.distance">
        <p class="rank-label">{{ group.label }}</p>
        <router-link v-for="row in group.rows" :key="group.distance + row.nickname" class="mate" :to="'/races/' + row.raceId">
          <span>{{ row.place }} {{ row.nickname }}</span>
          <b>{{ row.clock }}</b>
        </router-link>
      </div>
    </div>
    <p v-if="club && tab === 'race' && !board.length && !ranks.length" class="empty">还没有人标比赛。打开一场，标上想跑或已报名。</p>
    <div v-for="item in board" v-show="tab === 'race'" :key="item.race.id" class="block">
      <router-link :to="'/races/' + item.race.id" class="card">
        <div class="copy">
          <p>{{ item.race.name }}</p>
          <div class="foot"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
        </div>
      </router-link>
      <p v-if="tallyLine(item)" class="rank-label">{{ tallyLine(item) }}</p>
      <p v-if="item.squad && item.squad.text" class="squad">{{ item.squad.text }}</p>
      <p v-if="item.alternativeNote" class="squad">{{ item.alternativeNote }}</p>
      <router-link v-for="alt in item.alternatives || []" :key="alt.id" class="mate" :to="'/races/' + alt.id">
        <span>{{ alt.name }}</span><b>{{ alt.deadlineLabel }}</b>
      </router-link>
      <pre class="share-text">{{ item.text }}</pre>
      <button class="primary" type="button" @click="copyCard(item)">复制卡片</button>
      <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate">
        <span>{{ mark.nickname }}</span>
        <b>{{ mark.status }}<template v-if="mark.clock"> · {{ mark.clock }}<template v-if="mark.pb"> PB</template></template></b>
      </div>
    </div>
    <template v-if="club && tab === 'act'">
      <form v-if="club.owner" class="block" @submit.prevent="createActivity">
        <h2>发一场活动</h2>
        <input v-model="actTitle" maxlength="40" placeholder="例如 周日 LSD" />
        <input v-model="actPlace" maxlength="40" placeholder="集合地点" />
        <input v-model="actWhen" placeholder="2026-10-11 05:40" />
        <div class="pair">
          <label>成团人数<input v-model.number="actPeople" type="number" min="1" max="500" /></label>
          <label>里程公里<input v-model.number="actKm" type="number" min="0.1" max="100" step="0.1" /></label>
        </div>
        <p class="rank-label">满这些人数，且每人打卡不少于这个里程，才各得 1 分。人数不够，这场不计分。</p>
        <button class="primary" type="submit">发出去</button>
      </form>
      <router-link v-for="item in activities" :key="item.id" class="block act" :to="'/clubs/' + club.id + '/activities/' + item.id">
        <h2>{{ item.title }}</h2>
        <p class="rank-label">{{ item.startsAt.replace("T", " ") }}<template v-if="item.place"> · {{ item.place }}</template></p>
        <p class="rank-label">{{ item.signupCount }} 人报名 · {{ item.checkCount }} 人打卡<template v-if="item.awarded"> · 已记分</template></p>
        <p class="rank-label">{{ item.rule }}</p>
      </router-link>
      <p v-if="!activities.length" class="empty">还没有活动。每周团练的报名放在这里。</p>
    </template>
    <template v-if="club && tab === 'people'">
      <div class="block">
        <h2>成员</h2>
        <p class="rank-label">我的积分 {{ myPoints }}</p>
        <div v-for="member in members" :key="member.id" class="mate">
          <span>{{ member.nickname }}<template v-if="member.owner"> · 团长</template></span>
          <b>{{ member.points }} 分<button v-if="club.owner && !member.owner" class="undo" type="button" @click="removeMember(member)">移出</button></b>
        </div>
      </div>
      <form v-if="club.owner" class="block" @submit.prevent="createGroup">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <input v-model="groupName" maxlength="20" placeholder="例如 A0" />
        <input v-model="groupPace" maxlength="20" placeholder="配速，例如 530" />
        <input v-model.number="groupCap" type="number" min="0" placeholder="名额，0 表示不限" />
        <button class="primary" type="submit">加一组</button>
      </form>
      <div v-else class="block">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <p v-if="!groups.length" class="rank-label">团长还没分小组。</p>
      </div>
      <div class="block">
        <h2>礼品</h2>
        <p class="rank-label">用积分换，不付款。</p>
        <div v-for="gift in gifts" :key="gift.id" class="mate">
          <span>{{ gift.name }} · {{ gift.cost }} 分 · 剩 {{ gift.stock }}</span>
          <button class="primary" type="button" :disabled="!gift.stock" @click="redeem(gift)">兑换</button>
        </div>
        <form v-if="club.owner" @submit.prevent="createGift">
          <input v-model="giftName" maxlength="20" placeholder="礼品名" />
          <input v-model.number="giftCost" type="number" min="1" placeholder="所需积分" />
          <input v-model.number="giftStock" type="number" min="1" placeholder="库存" />
          <button class="primary" type="submit">上架</button>
        </form>
        <p v-if="!gifts.length && !club.owner" class="rank-label">还没有礼品。</p>
      </div>
    </template>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { copyText } from "../copy";
const route = useRoute();
const router = useRouter();
const tab = ref("race");
const club = ref(null);
const members = ref([]);
const groups = ref([]);
const activities = ref([]);
const gifts = ref([]);
const myPoints = ref(0);
const actTitle = ref("");
const actPlace = ref("");
const actWhen = ref("");
const actPeople = ref(3);
const actKm = ref(5);
const groupName = ref("");
const groupPace = ref("");
const groupCap = ref("0");
const giftName = ref("");
const giftCost = ref("1");
const giftStock = ref("1");
const board = ref([]);
const ranks = ref([]);
const checkins = ref([]);
const checkedIn = ref(false);
const checkNote = ref("");
const checkMessage = ref("");
const message = ref("");
const note = ref("");

function tallyLine(item) {
  const tally = item.tally || {};
  const parts = [];
  for (const key of ["已报名", "待抽签", "中签", "未中签", "已缴费", "已领物", "完赛", "未完赛", "弃赛", "想跑"]) {
    if (tally[key]) parts.push(tally[key] + "人" + key);
  }
  if (item.pbCount) parts.push(item.pbCount + "人 PB");
  return parts.join(" · ");
}

function applyClub(data) {
  club.value = data.club;
  members.value = data.members || [];
  groups.value = data.groups || [];
  activities.value = data.activities || [];
  gifts.value = data.gifts || [];
  myPoints.value = data.myPoints || 0;
  board.value = data.board || [];
  ranks.value = data.ranks || [];
  applyCheckins(data);
}

function applyCheckins(data) {
  checkins.value = data.checkins || [];
  checkedIn.value = Boolean(data.checkedIn);
  checkNote.value = data.myNote || "";
}

async function checkIn() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", {
      method: "POST",
      body: JSON.stringify({ note: checkNote.value })
    });
    applyCheckins(data);
  } catch (err) {
    checkMessage.value = err.message;
  }
}

async function undoCheckin() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", { method: "DELETE" });
    applyCheckins(data);
  } catch (err) {
    checkMessage.value = err.message;
  }
}

async function copyCard(card) {
  note.value = "";
  message.value = "";
  try {
    await copyText(card.text);
    note.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    message.value = "没有复制成功，可以直接选中上面的文字";
  }
}

async function reload() {
  applyClub(await api("/clubs/" + route.params.id));
}

async function createActivity() {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/activities", {
      method: "POST",
      body: JSON.stringify({
        title: actTitle.value,
        place: actPlace.value,
        startsAt: actWhen.value,
        minPeople: actPeople.value,
        minKm: actKm.value
      })
    });
    router.push("/clubs/" + route.params.id + "/activities/" + data.activity.id);
  } catch (err) {
    message.value = err.message;
  }
}

async function createGroup() {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName.value, pace: groupPace.value, capacity: Number(groupCap.value || 0) })
    });
    groupName.value = "";
    groupPace.value = "";
    await reload();
  } catch (err) {
    message.value = err.message;
  }
}

async function createGift() {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/gifts", {
      method: "POST",
      body: JSON.stringify({ name: giftName.value, cost: Number(giftCost.value), stock: Number(giftStock.value) })
    });
    giftName.value = "";
    await reload();
  } catch (err) {
    message.value = err.message;
  }
}

async function redeem(gift) {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/gifts/" + gift.id + "/redeem", { method: "POST", body: "{}" });
    note.value = "已兑换 " + gift.name;
    await reload();
  } catch (err) {
    message.value = err.message;
  }
}

async function removeMember(member) {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/members/" + member.id, { method: "DELETE" });
    await reload();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(async () => {
  try {
    await reload();
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.block :deep(.poster) { aspect-ratio: 5 / 2; height: auto; border-radius: 8px; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.rank-label { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.squad { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.note { font-size: 12px; color: #007aff; }
.primary { margin-top: 8px; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.seg { display: flex; gap: 8px; margin: 0 16px; }
.seg button { flex: 1; height: 34px; border-radius: 10px; background: #fff; color: #8e8e93; font-weight: 650; }
.seg button.on { background: #007aff; color: #fff; }
.act { display: block; }
.block input { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: rgba(118, 118, 128, 0.12); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pair label { font-size: 12px; color: #8d949c; }
.pair input { width: 100%; }
</style>
