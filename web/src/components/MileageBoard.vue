<template>
  <section class="block">
    <h2>跑量</h2>
    <p class="hint">只记跑步和越野。不计积分，团练签到也不记公里。</p>
    <p v-if="board" class="hint">{{ board.members }} 人 · 已计入 {{ board.totalKm }} 公里 · {{ board.totalCount }} 次</p>
    <div class="modes">
      <button v-for="item in ranges" :key="item.id" type="button" :class="{ on: range === item.id }" @click="pickRange(item.id)">{{ item.label }}</button>
    </div>
    <input v-model="query" placeholder="搜昵称" @input="schedule" />
  </section>
  <section v-if="board" class="block">
    <h2>排行榜</h2>
    <p v-if="!board.rank.length" class="hint">这段还没有计入的跑量。</p>
    <div v-for="row in board.rank" :key="row.userId" class="line" :class="{ top: row.place <= 3 }">
      <b>{{ row.place }}</b>
      <span>{{ row.nickname }} · {{ row.group }}</span>
      <em>{{ row.km }} 公里</em>
    </div>
  </section>
  <section v-if="board" class="block">
    <h2>分组榜</h2>
    <p v-if="!board.groups.length" class="hint">还没有分组跑量。</p>
    <div v-for="row in board.groups" :key="row.name" class="line">
      <span>{{ row.name }}</span>
      <em>{{ row.km }} 公里</em>
    </div>
  </section>
  <section v-if="board" class="block">
    <h2>动态</h2>
    <article v-for="item in board.feed" :key="item.id" class="run">
      <p>{{ item.nickname }} · {{ item.typeLabel }} · {{ item.startedAt }}</p>
      <p class="hint">跑量 {{ item.volumeKm }} 公里 · 里程 {{ item.distanceKm }} · 用时 {{ item.durationLabel }}<template v-if="item.paceLabel"> · {{ item.paceLabel }}</template> · 爬升 {{ item.climb }} 米</p>
      <p v-if="item.challenge" class="hint">质疑：{{ item.challenge }}</p>
      <img v-if="item.shot" class="shot" :src="shotSrc(item.id)" alt="" />
      <div v-if="!item.mine" class="field">
        <input v-model="reasons[item.id]" maxlength="80" placeholder="写一句质疑" />
        <button type="button" @click="challenge(item)">质疑</button>
      </div>
      <div v-if="board.staff" class="modes">
        <button type="button" @click="decide(item, false)">不计入</button>
        <button type="button" @click="decide(item, true)">继续计入</button>
      </div>
    </article>
    <p v-if="!board.feed.length" class="hint">这段还没有计入的记录。</p>
  </section>
  <section class="block">
    <h2>报表</h2>
    <div class="modes">
      <button v-for="item in kinds" :key="item.id" type="button" :class="{ on: kind === item.id }" @click="pickKind(item.id)">{{ item.label }}</button>
    </div>
    <p v-if="report" class="hint">{{ report.title }}。平均配速只算跑步。时长去掉秒。合计不加天数。</p>
    <div v-if="report" class="table">
      <div class="line head"><span>排名</span><span>姓名</span><span>跑量</span><span>天/次数</span><span>时长</span><span>配速</span><span v-if="kind === 'month'">Flag</span></div>
      <div v-for="row in report.rows" :key="row.userId" class="line">
        <span>{{ row.place }}</span><span>{{ row.nickname }}</span><span>{{ row.km }}</span><span>{{ row.dayText }}</span><span>{{ row.durationLabel }}</span><span>{{ row.paceLabel || "—" }}</span><span v-if="kind === 'month'">{{ row.flag }}</span>
      </div>
      <div class="line total"><span></span><span>合计</span><span>{{ report.total.km }}</span><span>{{ report.total.dayText }}</span><span>{{ report.total.durationLabel }}</span><span>{{ report.total.paceLabel || "—" }}</span><span v-if="kind === 'month'">—</span></div>
    </div>
  </section>
  <section v-if="board && board.rules" class="block">
    <h2>本团规则</h2>
    <p class="hint">{{ board.rules.note }}</p>
    <form class="stack" @submit.prevent="saveRules">
      <label>生效日<input v-model="board.rules.effectiveOn" :disabled="!board.owner" placeholder="2026-10-01" /></label>
      <label class="check"><input v-model="board.rules.manualOk" :disabled="!board.owner" type="checkbox" />允许手填</label>
      <label class="check"><input v-model="board.rules.runOn" :disabled="!board.owner" type="checkbox" />跑步计入</label>
      <div class="field">
        <input v-model.number="board.rules.runMin" :disabled="!board.owner" type="number" min="0.1" step="0.1" />
        <input v-model.number="board.rules.runMax" :disabled="!board.owner" type="number" min="0.1" step="0.1" />
      </div>
      <p class="hint">跑步最短、最长，公里。</p>
      <div class="field">
        <input v-model="board.rules.paceFast" :disabled="!board.owner" placeholder="最快 3:00" />
        <input v-model="board.rules.paceSlow" :disabled="!board.owner" placeholder="最慢 15:00" />
      </div>
      <label class="check"><input v-model="board.rules.trailOn" :disabled="!board.owner" type="checkbox" />越野计入</label>
      <label class="check"><input v-model="board.rules.trailClimbAdd" :disabled="!board.owner" type="checkbox" />越野跑量累加爬升，每 100 米加 1 公里</label>
      <div class="field">
        <input v-model.number="board.rules.trailMin" :disabled="!board.owner" type="number" min="0.1" step="0.1" />
        <input v-model.number="board.rules.trailClimb" :disabled="!board.owner" type="number" min="0" step="1" />
      </div>
      <p class="hint">越野最短公里、最低爬升米。</p>
      <div class="field">
        <input v-model.number="board.rules.flagFemale" :disabled="!board.owner" type="number" min="0" step="1" />
        <input v-model.number="board.rules.flagMale" :disabled="!board.owner" type="number" min="0" step="1" />
      </div>
      <p class="hint">月度下限，先女后男。</p>
      <label class="check"><input v-model="board.rules.observe" :disabled="!board.owner" type="checkbox" />当月入团自动观摩</label>
      <button v-if="board.owner" class="primary" type="submit">保存规则</button>
    </form>
  </section>
  <section v-if="board && board.owner" class="block">
    <h2>跑量分组</h2>
    <p class="hint">和活动报名的组别分开。一个人在团里只有一个。</p>
    <form class="stack" @submit.prevent="addGroup">
      <input v-model="groupName" maxlength="20" placeholder="分组名，最多 10 个汉字" />
      <div class="field">
        <input v-model.number="groupCap" type="number" min="0" max="500" placeholder="人数，0 不限" />
        <input v-model.number="groupSort" type="number" min="0" max="999" placeholder="编号" />
      </div>
      <button class="primary" type="submit">加一组</button>
    </form>
    <div v-for="group in board.manageGroups" :key="group.id" class="line">
      <span>{{ group.name }} · {{ group.members }} 人</span>
      <button type="button" @click="removeGroup(group)">删除</button>
    </div>
    <form class="field" @submit.prevent="assign">
      <select v-model="assignUser">
        <option value="">选成员</option>
        <option v-for="person in board.people" :key="person.id" :value="person.id">{{ person.nickname }}</option>
      </select>
      <select v-model="assignGroup">
        <option value="0">不分组</option>
        <option v-for="group in board.manageGroups" :key="group.id" :value="String(group.id)">{{ group.name }}</option>
      </select>
      <button type="submit">放入</button>
    </form>
    <button class="primary" type="button" @click="exportFile">导出这个范围</button>
    <label class="check"><input v-model="includeEmpty" type="checkbox" />没有记录的成员也导出</label>
  </section>
  <p v-if="message" class="err">{{ message }}</p>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { api, download, runShotSrc } from "../api";

const props = defineProps({ clubId: { type: [Number, String], required: true } });
const ranges = [
  { id: "today", label: "今日" },
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "year", label: "今年" },
  { id: "all", label: "累计" }
];
const kinds = [
  { id: "week", label: "周报" },
  { id: "month", label: "月报" },
  { id: "year", label: "年报" }
];
const board = ref(null);
const report = ref(null);
const range = ref("month");
const kind = ref("month");
const query = ref("");
const message = ref("");
const reasons = ref({});
const groupName = ref("");
const groupCap = ref(0);
const groupSort = ref(0);
const assignUser = ref("");
const assignGroup = ref("0");
const includeEmpty = ref(false);
let timer = 0;

function shotSrc(id) {
  return runShotSrc(id);
}

async function load() {
  board.value = await api("/clubs/" + props.clubId + "/mileage?range=" + range.value + "&q=" + encodeURIComponent(query.value.trim()));
  report.value = await api("/clubs/" + props.clubId + "/mileage/report?kind=" + kind.value);
}

function pickRange(next) {
  range.value = next;
  load().catch((err) => {
    message.value = err.message;
  });
}

function pickKind(next) {
  kind.value = next;
  api("/clubs/" + props.clubId + "/mileage/report?kind=" + kind.value)
    .then((data) => {
      report.value = data;
    })
    .catch((err) => {
      message.value = err.message;
    });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    load().catch((err) => {
      message.value = err.message;
    });
  }, 200);
}

async function challenge(item) {
  message.value = "";
  try {
    await api("/clubs/" + props.clubId + "/mileage/runs/" + item.id + "/challenge", {
      method: "POST",
      body: JSON.stringify({ reason: reasons.value[item.id] || "" })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function decide(item, counted) {
  message.value = "";
  try {
    await api("/clubs/" + props.clubId + "/mileage/runs/" + item.id + "/decision", {
      method: "POST",
      body: JSON.stringify({ counted })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function saveRules() {
  message.value = "";
  try {
    const saved = await api("/clubs/" + props.clubId + "/mileage/rules", {
      method: "PUT",
      body: JSON.stringify({
        ...board.value.rules,
        trailClimb: Math.round(Number(board.value.rules.trailClimb))
      })
    });
    board.value.rules = saved.rules;
    message.value = saved.rules.note;
  } catch (err) {
    message.value = err.message;
  }
}

async function addGroup() {
  message.value = "";
  try {
    await api("/clubs/" + props.clubId + "/mileage/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName.value, capacity: Number(groupCap.value) || 0, sort: Number(groupSort.value) || 0 })
    });
    groupName.value = "";
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function removeGroup(group) {
  message.value = "";
  try {
    await api("/clubs/" + props.clubId + "/mileage/groups/" + group.id, { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function assign() {
  message.value = "";
  if (!assignUser.value) return;
  try {
    await api("/clubs/" + props.clubId + "/mileage/members/" + assignUser.value, {
      method: "PUT",
      body: JSON.stringify({ groupId: Number(assignGroup.value) })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function exportFile() {
  message.value = "";
  try {
    const empty = includeEmpty.value ? "&empty=1" : "";
    await download("/clubs/" + props.clubId + "/mileage/export?kind=" + kind.value + empty, "跑量.csv");
  } catch (err) {
    message.value = err.message;
  }
}

watch(() => props.clubId, () => {
  load().catch((err) => {
    message.value = err.message;
  });
});

onMounted(() => {
  load().catch((err) => {
    message.value = err.message;
  });
});
</script>

<style scoped>
.hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.modes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.modes button { height: 32px; padding: 0 12px; border-radius: 999px; background: var(--chip); font-weight: 650; }
.modes button.on { background: var(--accent); color: #fff; }
.stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.stack input, .field input, .field select, section > input { height: 40px; border: 0; border-radius: 12px; padding: 0 12px; background: var(--chip); }
section > input { width: 100%; margin-top: 10px; box-sizing: border-box; }
.field { display: flex; gap: 8px; margin-top: 8px; }
.field input, .field select { flex: 1; min-width: 0; }
.field button, .line button { height: 36px; padding: 0 12px; border-radius: 12px; background: #fff; }
.line { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #eef0f3; }
.line.top b { color: var(--accent); }
.line b { width: 24px; }
.line em { font-style: normal; font-weight: 650; }
.table .line { font-size: 12px; }
.table .head { color: var(--muted); }
.run { padding: 8px 0; border-bottom: 1px solid #eef0f3; }
.shot { width: 100%; margin-top: 8px; border-radius: 12px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.err { color: #e35d5d; padding: 0 16px; }
</style>
