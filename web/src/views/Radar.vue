<template>
  <main class="radar-page">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>拿奖雷达</h1>
      <span></span>
    </header>
    <section v-if="!signedIn" class="block radar-login">
      <h2>找到适合你的拿奖赛事</h2>
      <p class="hint">登录后，结合个人目标成绩与赛事奖项，查看适合你的比赛。</p>
      <button class="primary" type="button" @click="login">登录后使用</button>
    </section>
    <section v-else class="block">
      <div class="radar-heading"><span class="radar-kicker">拿奖雷达</span><h2>我的跑步目标</h2><p class="hint">结合目标成绩、年龄组与参赛地区，寻找适合你的比赛。</p></div>
      <form class="stack" @submit.prevent="save">
        <div class="field-label">基本资料 <small>选填</small></div><div class="radar-label">性别</div>
        <div class="modes">
          <button type="button" :class="{ on: gender === '' }" @click="gender = ''">不填</button>
          <button type="button" :class="{ on: gender === '男' }" @click="gender = '男'">男</button>
          <button type="button" :class="{ on: gender === '女' }" @click="gender = '女'">女</button>
        </div>
        <label>出生年月<span>选填</span><input v-model="birth" placeholder="例如 1986-06" /></label>
        <label>所属省份<span>选填</span><select v-model="province">
          <option value="">省份，可空</option>
          <option v-for="item in regions" :key="item.name" :value="item.name">{{ item.name }}</option>
        </select></label>
        <div class="field-label target-heading">目标成绩 <small>留空使用已有 PB</small></div>
        <label>全马目标<span>选填</span><input v-model="targets.full" placeholder="例如 3:30:00，留空使用 PB" /></label>
        <label>半马目标<span>选填</span><input v-model="targets.half" placeholder="例如 1:40:00" /></label>
        <label>10 公里目标<span>选填</span><input v-model="targets['10k']" placeholder="例如 00:45:00" /></label>
        <label>5 公里目标<span>选填</span><input v-model="targets['5k']" placeholder="例如 00:22:00" /></label>
        <button class="primary" type="submit">保存</button>
      </form>
      <details class="radar-notes"><summary>计算依据与资料说明</summary><p class="hint">{{ note }} 天气和赛道修正尚未开通。</p><p class="hint">性别、出生年月和省份用于匹配年龄组和本地籍，不收身份证。出生月份与比赛月相同时，按小一岁计算。</p></details>
      <p v-if="message" class="err">{{ message }}</p>
    </section>
    <section v-if="signedIn" class="block">
      <div class="radar-results-heading"><h2>适合我的奖项</h2><span>{{ rows.length }} 项匹配</span></div>
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
import { useRouter } from "vue-router";
import { regions } from "../regions";

const router = useRouter();
const signedIn = ref(Boolean(localStorage.getItem("marathon_token")));
function login() {
  localStorage.setItem("marathon_return_after_login", "/radar");
  router.push("/mine");
}

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
  if (!signedIn.value) return;
  const data = await api("/radar");
  note.value = data.note;
  apply(data.profile);
  rows.value = data.rows;
  ready.value = true;
  message.value = "";
}

async function save() {
  if (!signedIn.value) { login(); return; }
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
    if (err.status === 401) {
      signedIn.value = false;
      localStorage.removeItem("marathon_token");
      localStorage.removeItem("marathon_name");
      return;
    }
    message.value = err.message;
  });
});
</script>

<style scoped>
.radar-page{padding-bottom:24px}.hint{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.8}.block h2{font-size:18px;color:var(--ink)}.stack{display:grid;gap:16px;margin-top:24px}.stack label{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:14px}.stack label>span{color:var(--muted);font-size:12px}.stack input,.stack select{grid-column:1/-1;width:100%;min-width:0;height:44px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:var(--field-bg);font-size:14px}.field-label{font-size:14px}.modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.modes button{min-height:44px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:14px;color:var(--muted)}.modes button.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}.primary{width:100%;min-height:44px;border-radius:8px;background:var(--accent);color:#fff;font-size:14px;font-weight:500}.radar-login .primary{margin-top:20px}.slot{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding:12px 0;border-block:1px solid var(--line);font-size:14px}.slot b{color:var(--muted);font-size:12px;font-weight:400}.run{padding:16px 0;border-bottom:1px solid var(--line)}.run p{margin:8px 0 0;font-size:14px;line-height:1.7}.run p:first-child{font-size:15px;font-weight:500}.run .hint{font-size:12px}.err{color:var(--accent);font-size:14px}
.radar-page>.block { border:0; margin:12px 16px; padding:16px; border-radius:12px; background:#fff; }
.radar-heading h2 { margin:6px 0 0; font-size:24px; }.radar-kicker { font-size:12px; color:var(--accent); }
.stack { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:20px; }.stack>.modes,.stack>.field-label,.stack>.primary,.stack>.radar-label { grid-column:1/-1; }
.stack .field-label { display:flex; justify-content:space-between; font-size:16px; font-weight:600; }.field-label small { font-size:12px; font-weight:400; color:var(--muted); }.radar-label { font-size:14px; }.target-heading { padding-top:16px; border-top:1px solid var(--line); }
.radar-notes { margin-top:16px; font-size:12px; color:var(--muted); }.radar-notes summary { display:flex; align-items:center; min-height:44px; cursor:pointer; }.radar-notes summary:after { content:'⌄'; margin-left:auto; }
.radar-results-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }.radar-results-heading h2 { margin:0; }.radar-results-heading>span { font-size:12px; color:var(--muted); }
</style>
