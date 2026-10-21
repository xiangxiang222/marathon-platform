<template>
  <main>
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>拿奖雷达</h1>
      <span></span>
    </header>
    <section class="block">
      <p class="hint">{{ note }}</p>
      <div class="slot"><span>天气和赛道修正</span><b>尚未开通</b></div>
      <p class="hint">对照仍用已记下的成绩和往届名次。</p>
      <p class="hint">性别、出生年月和省份自己填，用来对年龄组和本地籍。不收身份证。出生月份和比赛月相同的，按小一岁算。</p>
      <form class="stack" @submit.prevent="save">
        <div class="modes">
          <button type="button" :class="{ on: gender === '' }" @click="gender = ''">不填</button>
          <button type="button" :class="{ on: gender === '男' }" @click="gender = '男'">男</button>
          <button type="button" :class="{ on: gender === '女' }" @click="gender = '女'">女</button>
        </div>
        <input v-model="birth" placeholder="出生年月 1986-06，可空" />
        <select v-model="province">
          <option value="">省份，可空</option>
          <option v-for="item in regions" :key="item.name" :value="item.name">{{ item.name }}</option>
        </select>
        <input v-model="targets.full" placeholder="全马目标 3:30:00，空则用 PB" />
        <input v-model="targets.half" placeholder="半马目标，可空" />
        <input v-model="targets['10k']" placeholder="10 公里目标，可空" />
        <input v-model="targets['5k']" placeholder="5 公里目标，可空" />
        <button class="primary" type="submit">保存</button>
      </form>
      <p v-if="message" class="err">{{ message }}</p>
    </section>
    <section class="block">
      <h2>对得上的奖</h2>
      <article v-for="item in rows" :key="item.ruleId" class="run">
        <p><router-link :to="'/races/' + item.race.id">{{ item.race.raceDate }} {{ item.race.name }}</router-link></p>
        <p>{{ item.kindLabel }} · {{ item.title }} · {{ item.amountText }}<template v-if="item.stack"> · 可叠加</template></p>
        <p class="hint">{{ item.reason }}</p>
        <p v-if="item.clockLabel" class="hint">{{ item.clockLabel }}</p>
        <p class="hint">来源 {{ item.source }}<template v-if="item.cutoffSource"> · 往届 {{ item.cutoffSource }}</template></p>
      </article>
      <p v-if="ready && !rows.length" class="hint">还没有对得上的奖。奖项要在后台按规程录入。</p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { regions } from "../regions";

const note = ref("仅供参考。没有往届名次成绩时，不估算概率。");
const gender = ref("");
const birth = ref("");
const province = ref("");
const targets = reactive({ full: "", half: "", "10k": "", "5k": "" });
const rows = ref([]);
const message = ref("");
const ready = ref(false);

function apply(profile) {
  gender.value = profile.gender || "";
  birth.value = profile.birth || "";
  province.value = profile.province || "";
  targets.full = profile.targets.full || "";
  targets.half = profile.targets.half || "";
  targets["10k"] = profile.targets["10k"] || "";
  targets["5k"] = profile.targets["5k"] || "";
}

async function load() {
  const data = await api("/radar");
  note.value = data.note;
  apply(data.profile);
  rows.value = data.rows;
  ready.value = true;
  message.value = "";
}

async function save() {
  message.value = "";
  try {
    await api("/me/radar", {
      method: "PUT",
      body: JSON.stringify({
        gender: gender.value,
        birth: birth.value,
        province: province.value,
        targets: { ...targets }
      })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(() => {
  load().catch((err) => {
    message.value = err.message;
  });
});
</script>

<style scoped>
.hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.stack input, .stack select { height: 40px; border: 0; border-radius: 12px; padding: 0 12px; background: var(--chip); }
.modes { display: flex; gap: 8px; }
.modes button { height: 32px; padding: 0 12px; border-radius: 999px; background: var(--chip); font-weight: 650; }
.modes button.on { background: var(--accent); color: #fff; }
.primary { height: 40px; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 650; }
.run { padding: 8px 0; border-bottom: 1px solid #eef0f3; }
.run a { color: inherit; }
.err { color: #e35d5d; }
</style>
