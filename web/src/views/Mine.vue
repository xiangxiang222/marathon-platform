<template>
  <div>
    <header class="page-head">
      <h1>我的</h1>
      <p v-if="!ready">记下之后，可以标报名状态，同团的人能看见。</p>
    </header>

    <section class="block">
      <form v-if="!ready" class="stack" @submit.prevent="enter">
        <label class="label" for="mine-name">你在团里的名字</label>
        <input id="mine-name" v-model="draft" maxlength="20" placeholder="例如 阿宁" />
        <p class="help">同团的人会看到这个名字。1 到 20 个字。</p>
        <button class="primary" type="submit" :disabled="busy">{{ busy ? "正在记下…" : "记下名字" }}</button>
      </form>
      <template v-else>
        <p class="kicker">你在团里的名字</p>
        <p class="hero-name">{{ nickname }}</p>
      </template>
      <p v-if="ok" class="ok" role="status">{{ ok }}</p>
      <p v-if="message" class="err">{{ message }}</p>
    </section>

    <template v-if="ready">
      <p v-if="phase === 'loading'" class="state">正在读取你的赛历</p>
      <div v-else-if="phase === 'error'" class="state">
        <p class="err">{{ loadError }}</p>
        <button class="text-btn" type="button" @click="load">重试</button>
      </div>
      <template v-else>
        <section v-if="conflicts.length" class="block">
          <h2>全马隔得太近</h2>
          <p v-for="item in conflicts" :key="item.text" class="warn">{{ item.text }}</p>
        </section>

        <section v-if="reminders.length" class="block">
          <h2>你标过的场，明天有节点</h2>
          <router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind" :to="'/races/' + item.race.id">
            <b>{{ item.hit.reason }}</b>
            <span>{{ item.race.name }}</span>
          </router-link>
        </section>

        <section v-if="urgent.length" class="block">
          <h2>先处理</h2>
          <router-link v-for="item in urgent" :key="item.race.id" class="plan-row" :to="'/races/' + item.race.id">
            <div>
              <p class="name"><em>{{ item.status }}</em>{{ item.race.name }}</p>
              <p class="meta">{{ item.race.raceDate }} · {{ item.race.city }} · {{ item.race.deadlineLabel }}</p>
            </div>
          </router-link>
        </section>

        <section v-if="rest.length || !plans.length" class="block">
          <h2>{{ urgent.length ? "其他标记" : "我标过的场" }}</h2>
          <router-link v-for="item in rest" :key="item.race.id" class="plan-row" :to="'/races/' + item.race.id">
            <div>
              <p class="name"><em>{{ item.status }}</em>{{ item.race.name }}</p>
              <p class="meta">{{ item.race.raceDate }} · {{ item.race.city }} · {{ item.race.deadlineLabel }}</p>
            </div>
          </router-link>
          <p v-if="!plans.length" class="help">还没有标记。到赛历打开一场，标上想跑或已报名。</p>
        </section>

        <section class="block">
          <h2>成绩</h2>
          <template v-if="results.length">
            <p class="result-line">完赛 {{ career.finished }} 场</p>
            <p class="meta">半程 {{ career.pb.half || "还没有" }} · 全程 {{ career.pb.full || "还没有" }}</p>
            <p class="footline">足迹 {{ career.provinces.length }} 个省、{{ career.cities.length }} 个市 · 本年比赛 {{ career.yearKm }} 公里</p>
            <div v-if="places.length" class="tags" style="margin-top: 8px">
              <span v-for="name in places" :key="name">{{ name }}</span>
            </div>
            <router-link v-for="item in results" :key="item.race.id" class="plan-row" :to="'/races/' + item.race.id">
              <div>
                <p class="name">{{ item.race.raceDate }} {{ item.race.name }}</p>
                <p class="meta">{{ item.distanceLabel }} {{ item.clock }} · 配速 {{ item.pace }}<span v-if="item.pb" class="pb">PB</span></p>
              </div>
            </router-link>
            <p class="help">本人填写，未核验。</p>
          </template>
          <p v-else class="help">还没有成绩。比完后在赛事页记下。完赛场数和最好成绩会出现在这里。成绩是本人填写，未核验。</p>
        </section>
      </template>
    </template>
    <footer class="legal">{{ company }} · {{ icp }}</footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { splitPlans } from "../product";
import { useSession } from "../session";

const { nickname, ready, save } = useSession();
const draft = ref("");
const plans = ref([]);
const results = ref([]);
const career = ref({ finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 });
const conflicts = ref([]);
const reminders = ref([]);
const phase = ref("loading");
const busy = ref(false);
const message = ref("");
const ok = ref("");
const loadError = ref("");
const company = ref("北京华创科技有限公司");
const icp = ref("京ICP备2026060284号-2");
const groups = computed(() => splitPlans(plans.value));
const urgent = computed(() => groups.value.urgent);
const rest = computed(() => groups.value.rest);
const places = computed(() => {
  const names = [];
  for (const item of results.value) {
    if (item.race.province && !names.includes(item.race.province)) names.push(item.race.province);
    if (item.race.city && item.race.city !== item.race.province && !names.includes(item.race.city)) names.push(item.race.city);
  }
  return names;
});

async function load() {
  if (!ready.value) return;
  phase.value = "loading";
  loadError.value = "";
  try {
    const data = await api("/me");
    save(localStorage.getItem("marathon_token"), data.user.nickname);
    plans.value = data.plans || [];
    results.value = data.results || [];
    career.value = data.career || career.value;
    conflicts.value = data.conflicts || [];
    reminders.value = data.reminders || [];
    phase.value = "ready";
  } catch (err) {
    phase.value = "error";
    loadError.value = err.message;
  }
}

async function enter() {
  message.value = "";
  ok.value = "";
  const name = draft.value.trim();
  if (!name || name.length > 20) {
    message.value = "昵称用 1 到 20 个字";
    return;
  }
  busy.value = true;
  try {
    const data = await api("/session", { method: "POST", body: JSON.stringify({ nickname: name }) });
    save(data.token, data.user.nickname);
    draft.value = "";
    ok.value = "名字已记下。";
    await load();
  } catch (err) {
    message.value = err.message;
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    const meta = await api("/meta");
    company.value = meta.company;
    icp.value = meta.icp;
  } catch (err) {
    /* 备案用页面里的默认值。 */
  }
  await load();
});
</script>
