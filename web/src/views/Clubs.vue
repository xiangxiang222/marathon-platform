<template>
  <div>
    <header class="page-head">
      <h1>跑团</h1>
      <p>看本团谁报了哪场。口令发到微信群就能加入。</p>
    </header>

    <section v-if="!ready" class="block">
      <h2>你在团里的名字</h2>
      <p class="help">记下之后才能建团或加入。同团的人会看到这个名字。</p>
      <form class="stack" @submit.prevent="enter">
        <label class="label" for="nick">你在团里的名字</label>
        <input id="nick" v-model="draft" maxlength="20" placeholder="例如 阿宁" />
        <p class="help">1 到 20 个字。</p>
        <button class="primary" type="submit" :disabled="busy">{{ busy ? "正在记下…" : "记下名字" }}</button>
      </form>
      <p v-if="ok" class="ok" role="status">{{ ok }}</p>
      <p v-if="message" class="err">{{ message }}</p>
    </section>

    <template v-else>
      <section class="block">
        <h2>建一个团</h2>
        <form class="stack" @submit.prevent="create">
          <label class="label" for="club-name">跑团名称</label>
          <input id="club-name" v-model="name" maxlength="20" placeholder="例如 滨河夜跑" />
          <p class="help">1 到 20 个字。创建后会得到口令。</p>
          <button class="primary" type="submit" :disabled="busy">{{ busy ? "正在创建…" : "创建跑团" }}</button>
        </form>
        <p v-if="createError" class="err">{{ createError }}</p>
      </section>
      <section class="block">
        <h2>用口令加入</h2>
        <form class="stack" @submit.prevent="join">
          <label class="label" for="club-code">跑团口令</label>
          <input id="club-code" v-model="code" maxlength="12" placeholder="例如 A1B2C3" autocapitalize="characters" />
          <button class="primary" type="submit" :disabled="busy">{{ busy ? "正在加入…" : "加入" }}</button>
        </form>
        <p v-if="joinError" class="err">{{ joinError }}</p>
      </section>

      <p v-if="phase === 'loading'" class="state">正在读取跑团</p>
      <div v-else-if="phase === 'error'" class="state">
        <p class="err">{{ message }}</p>
        <button class="text-btn" type="button" @click="load">重试</button>
      </div>
      <p v-else-if="!clubs.length" class="state">还没有跑团。建一个，把口令发到微信群。</p>
      <ul v-else class="list">
        <li v-for="club in clubs" :key="club.id">
          <router-link class="race-row" :to="'/clubs/' + club.id">
            <div>
              <p class="name">{{ club.name }}</p>
              <p class="meta">口令 {{ club.code }} · 打开看谁标了哪场</p>
            </div>
          </router-link>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useSession } from "../session";

const router = useRouter();
const { ready, save } = useSession();
const draft = ref("");
const name = ref("");
const code = ref("");
const clubs = ref([]);
const phase = ref("loading");
const busy = ref(false);
const message = ref("");
const ok = ref("");
const createError = ref("");
const joinError = ref("");

async function load() {
  if (!ready.value) return;
  phase.value = "loading";
  message.value = "";
  try {
    const data = await api("/me");
    clubs.value = data.clubs || [];
    phase.value = "ready";
  } catch (err) {
    phase.value = "error";
    message.value = err.message;
  }
}

async function enter() {
  message.value = "";
  ok.value = "";
  const nickname = draft.value.trim();
  if (!nickname || nickname.length > 20) {
    message.value = "昵称用 1 到 20 个字";
    return;
  }
  busy.value = true;
  try {
    const data = await api("/session", { method: "POST", body: JSON.stringify({ nickname }) });
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

async function create() {
  createError.value = "";
  const clubName = name.value.trim();
  if (!clubName || clubName.length > 20) {
    createError.value = "跑团名用 1 到 20 个字";
    return;
  }
  busy.value = true;
  try {
    const data = await api("/clubs", { method: "POST", body: JSON.stringify({ name: clubName }) });
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    createError.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function join() {
  joinError.value = "";
  const clubCode = code.value.trim().toUpperCase();
  if (!clubCode) {
    joinError.value = "没有这个跑团口令";
    return;
  }
  busy.value = true;
  try {
    const data = await api("/clubs/join", { method: "POST", body: JSON.stringify({ code: clubCode }) });
    router.push("/clubs/" + data.club.id);
  } catch (err) {
    joinError.value = err.message;
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>
