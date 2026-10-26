<template>
  <main class="intro-page">
    <header class="topbar">
      <router-link to="/clubs" aria-label="返回跑团">‹</router-link>
      <h1>跑团介绍</h1>
      <span></span>
    </header>

    <section v-if="loading" class="intro-state">正在打开跑团…</section>
    <section v-else-if="club" class="intro-content">
      <div class="intro-identity">
        <span class="club-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
        <div><h2>{{ club.name }}</h2><p class="intro-leader">团长 {{ club.leader || "跑团管理员" }}</p></div>
      </div>
      <div class="intro-count"><b>{{ club.memberCount }}</b> 位成员</div>
      <p class="intro-access">跑团赛事、训练安排、成员参赛信息和跑量榜仅对已加入成员开放。</p>

      <p v-if="club.joined" class="intro-status joined">你已加入这个跑团</p>
      <p v-else-if="club.pending" class="intro-status pending">申请已提交，等待团长或跑团管理审核</p>
      <button v-if="club.joined" class="intro-primary" type="button" @click="router.push('/clubs/' + club.id)">进入跑团</button>
      <button v-else-if="club.pending" class="intro-primary waiting" type="button" disabled>等待审核</button>
      <button v-else class="intro-primary" type="button" :disabled="applying" @click="apply">
        {{ applying ? "正在提交" : ready ? "申请加入" : "登录并申请加入" }}
      </button>
      <button class="intro-secondary" type="button" @click="copyInvite">复制邀请链接</button>
      <p class="intro-foot">申请通过后即可查看团内成员和活动。</p>
      <p v-if="message" class="intro-error">{{ message }}</p>
    </section>
    <section v-else class="intro-state error">{{ message || "没有找到这个跑团" }}</section>
  </main>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { copyText } from "../copy";

const route = useRoute();
const router = useRouter();
const club = ref(null);
const loading = ref(true);
const applying = ref(false);
const message = ref("");
let loadVersion = 0;
const ready = computed(() => Boolean(localStorage.getItem("marathon_token")));

function invitePath() {
  if (route.params.code) return "/clubs/invite/" + encodeURIComponent(route.params.code);
  return "/clubs/" + encodeURIComponent(route.params.id) + "/public";
}

async function load() {
  const version = ++loadVersion;
  club.value = null;
  message.value = "";
  loading.value = true;
  const path = route.params.code
    ? "/clubs/invite/" + encodeURIComponent(route.params.code)
    : "/clubs/" + encodeURIComponent(route.params.id) + "/public";
  try {
    const data = await api(path);
    if (version !== loadVersion) return;
    club.value = data.club;
    if (route.query.apply === "1" && ready.value) await submitApplication();
  } catch (err) {
    if (version === loadVersion) message.value = err.message;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function apply() {
  if (!ready.value) {
    localStorage.setItem("marathon_return_after_login", invitePath() + "?apply=1");
    await router.push("/mine");
    return;
  }
  await submitApplication();
}

async function submitApplication() {
  if (!club.value || applying.value) return;
  applying.value = true;
  message.value = "";
  try {
    const data = await api("/clubs/join", {
      method: "POST",
      body: JSON.stringify({ clubId: Number(club.value.id) })
    });
    if (data.joined) {
      await router.replace("/clubs/" + club.value.id);
      return;
    }
    club.value.pending = true;
  } catch (err) {
    message.value = err.message;
    if (err.status === 401) {
      localStorage.removeItem("marathon_token");
      localStorage.removeItem("marathon_name");
      localStorage.setItem("marathon_return_after_login", invitePath() + "?apply=1");
      await router.push("/mine");
    }
  } finally {
    applying.value = false;
  }
}

async function copyInvite() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = window.location.origin + base + invitePath();
  try {
    await copyText(url);
    message.value = "邀请链接已复制";
  } catch (err) {
    message.value = "复制失败，请从浏览器地址栏复制链接";
  }
}

watch(() => [route.params.id, route.params.code, route.query.apply], load, { immediate: true });
</script>

<style scoped>
.intro-page { min-height: 100vh; padding-bottom: 28px; background: var(--bg, #f5f6fa); }
.intro-content { margin: 16px; padding: 20px 16px; background: #fff; border-radius: 12px; }
.intro-identity { display: flex; align-items: center; gap: 12px; }
.intro-identity > div { flex: 1; min-width: 0; }
.club-letter { display: grid; place-items: center; flex: none; width: 52px; height: 52px; border-radius: 12px; color: var(--accent); background: var(--accent-soft, #fff0f3); font-size: 24px; font-weight: 600; }
.intro-content h2 { margin: 0; color: var(--ink); font-size: 20px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.intro-leader { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
.intro-count { margin-top: 20px; color: var(--muted); font-size: 12px; }
.intro-count b { color: var(--ink); font-size: 18px; font-weight: 600; }
.intro-access { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.7; }
.intro-status { display: inline-block; margin: 16px 0 0; padding: 5px 8px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
.joined { color: var(--accent); background: var(--accent-soft, #fff0f3); }
.pending { color: #7962ce; background: #f4f0ff; }
.intro-primary, .intro-secondary { width: 100%; min-height: 44px; margin-top: 18px; padding: 0 14px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.intro-primary { color: #fff; background: var(--accent); }
.intro-primary:disabled { opacity: .68; }
.intro-primary.waiting { color: var(--muted); background: var(--chip); }
.intro-secondary { margin-top: 9px; color: var(--ink); background: var(--chip); }
.intro-foot { margin: 12px 0 0; color: var(--muted); text-align: center; font-size: 12px; }
.intro-state { padding: 100px 24px; color: var(--muted); text-align: center; font-size: 15px; }
.intro-state.error, .intro-error { color: var(--accent); }
.intro-error { margin: 14px 0 0; font-size: 13px; }
</style>
