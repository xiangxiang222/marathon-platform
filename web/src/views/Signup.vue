<template>
  <main class="signup-page">
    <header class="topbar">
      <router-link :to="activityPath" aria-label="返回活动">‹</router-link>
      <h1>活动报名</h1>
      <span></span>
    </header>

    <p v-if="loading" class="state">正在载入活动…</p>
    <section v-else-if="loadError" class="state state-error" role="alert">
      <p>{{ loadError }}</p>
      <button class="quiet-button" type="button" @click="load">重试</button>
    </section>

    <template v-else-if="activity">
      <section v-if="success" class="success-panel" aria-live="polite">
        <span class="success-mark" aria-hidden="true">✓</span>
        <p class="eyebrow">报名已确认</p>
        <h2>{{ activity.title }}</h2>
        <p class="success-copy">{{ viewerName }}，你的名字已加入活动名单。</p>
        <dl class="summary-list">
          <div><dt>活动时间</dt><dd>{{ activity.timeLabel }}</dd></div>
          <div v-if="activity.gatherAt || activity.gatherPlace"><dt>集合</dt><dd>{{ [activity.gatherAt, activity.gatherPlace].filter(Boolean).join(" · ") }}</dd></div>
          <div v-if="activity.place"><dt>地点</dt><dd>{{ activity.place }}</dd></div>
          <div v-if="chosenGroup"><dt>组别</dt><dd>{{ chosenGroup.name }}<template v-if="chosenGroup.pace"> · {{ chosenGroup.pace }}</template></dd></div>
          <div><dt>性别</dt><dd>{{ gender || "未填写" }}</dd></div>
          <div><dt>跑步水平</dt><dd>{{ selectedLevel ? selectedLevel.id + " · " + selectedLevel.text : "未填写" }}</dd></div>
        </dl>
        <p v-if="activity.cancelHint" class="cancel-note">{{ activity.cancelHint }}</p>
        <router-link class="primary summary-link" :to="activityPath">查看活动名单</router-link>
      </section>

      <form v-else class="signup-form" @submit.prevent="submit">
        <section class="event-heading">
          <p class="eyebrow">{{ clubName || "跑团活动" }}</p>
          <h2>{{ activity.title }}</h2>
          <p class="event-meta">{{ activity.timeLabel }}<template v-if="activity.plannedKm"> · {{ activity.plannedKm }} km</template></p>
          <p v-if="activity.gatherAt || activity.gatherPlace" class="event-meta">集合 {{ [activity.gatherAt, activity.gatherPlace].filter(Boolean).join(" · ") }}</p>
        </section>

        <section class="form-section">
          <div class="section-title"><h3>选择跑团组别</h3><span>请选择一项</span></div>
          <div v-if="groups.length" class="group-list" role="radiogroup" aria-label="活动组别">
            <button v-for="group in groups" :key="group.id" class="group-option" :class="{ selected: groupId === group.id, unavailable: group.full }" type="button" role="radio" :aria-checked="groupId === group.id" :disabled="group.full" @click="groupId = group.id">
              <span class="radio-mark" aria-hidden="true"></span>
              <span class="group-copy"><strong>{{ group.name }}</strong><small>{{ group.pace || group.kindLabel || "活动组" }}</small></span>
              <span class="capacity">{{ group.full ? "已满" : group.capacity ? `${group.signed}/${group.capacity} 人` : `${group.signed} 人` }}</span>
            </button>
          </div>
          <p v-else class="no-groups">本场不分组，确认后直接报名。</p>
          <p v-if="groups.length && !groupId" class="field-error">报名之前请先选择组别。</p>
        </section>

        <section class="form-section optional-section">
          <button class="disclosure" type="button" :aria-expanded="showProfile" @click="showProfile = !showProfile">
            <span><strong>个人信息</strong><small>性别和跑步水平均可不填，仅活动组织者可见，用于现场协调</small></span><span aria-hidden="true">{{ showProfile ? "−" : "+" }}</span>
          </button>
          <div v-if="showProfile" class="profile-fields">
            <fieldset><legend>性别</legend><div class="choice-row">
              <button v-for="item in genders" :key="item" type="button" class="choice" :class="{ chosen: gender === item }" :aria-pressed="gender === item" @click="gender = gender === item ? '' : item">{{ item }}</button>
            </div></fieldset>
            <fieldset><legend>跑步水平</legend><div class="level-list">
              <button v-for="item in levels" :key="item.id" type="button" class="level-option" :class="{ chosen: level === item.id }" :aria-pressed="level === item.id" @click="level = level === item.id ? '' : item.id"><strong>{{ item.id }}</strong><span>{{ item.text }}</span></button>
            </div></fieldset>
          </div>
        </section>

        <section class="terms-line"><span class="free-mark">免费活动</span><span>报名不涉及付款或保险购买。</span></section>
        <p v-if="activity.notice" class="notice">{{ activity.notice }}</p>
        <p v-if="!canSignup" class="signup-unavailable" role="status">{{ activity.action?.label || "当前无法报名" }}</p>
        <p v-if="submitError" class="field-error" role="alert">{{ submitError }}</p>
        <div class="submit-dock">
          <p>{{ canSignup ? (activity.signupHint || "活动开始前可报名") : (activity.action?.label || "当前无法报名") }}</p>
          <button class="primary" type="submit" :disabled="submitting || !canSignup || (groups.length > 0 && !groupId)">{{ submitting ? "正在提交…" : "确认报名" }}</button>
        </div>
      </form>
    </template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";

const route = useRoute();
const router = useRouter();
const activity = ref(null);
const groups = ref([]);
const levels = ref([]);
const viewerName = ref("");
const clubName = ref("");
const groupId = ref(0);
const gender = ref("");
const level = ref("");
const showProfile = ref(false);
const loading = ref(false);
const submitting = ref(false);
const loadError = ref("");
const submitError = ref("");
const success = ref(false);
const genders = ["男", "女"];
const activityPath = computed(() => `/clubs/${route.params.id}/activities/${route.params.aid}`);
const canSignup = computed(() => activity.value?.action?.enabled === true && activity.value?.action?.kind === "signup");
const chosenGroup = computed(() => groups.value.find((item) => item.id === groupId.value) || null);
const selectedLevel = computed(() => levels.value.find((item) => item.id === level.value) || null);
let request = 0;

async function load() {
  const current = ++request;
  const clubId = String(route.params.id || "");
  const activityId = String(route.params.aid || "");
  loading.value = true;
  loadError.value = "";
  submitError.value = "";
  success.value = false;
  activity.value = null;
  groupId.value = 0;
  gender.value = "";
  level.value = "";
  try {
    const data = await api(`/clubs/${clubId}/activities/${activityId}`);
    if (current !== request) return;
    activity.value = data.activity;
    groups.value = data.groups || [];
    levels.value = data.levels || [];
    viewerName.value = data.viewerName || "跑友";
    clubName.value = data.club?.name || "";
    if (data.activity.mine?.signed) {
      await router.replace(activityPath.value);
    }
  } catch (error) {
    if (current === request) loadError.value = error.message || "活动载入失败";
  } finally {
    if (current === request) loading.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  if (!canSignup.value) {
    submitError.value = activity.value?.action?.label || "当前无法报名";
    return;
  }
  if (groups.value.length && !chosenGroup.value) {
    submitError.value = "请选择一个组别后继续。";
    return;
  }
  submitting.value = true;
  submitError.value = "";
  try {
    await api(`${activityPath.value}/signup`, {
      method: "POST",
      body: JSON.stringify({ groupId: groupId.value || 0, gender: gender.value, level: level.value })
    });
    success.value = true;
  } catch (error) {
    submitError.value = error.message || "报名未能提交，请重试。";
  } finally {
    submitting.value = false;
  }
}

watch(() => `${route.params.id || ""}:${route.params.aid || ""}`, load, { immediate: true });
</script>

<style scoped>
.signup-page { min-height: 100vh; padding-bottom: 96px; color: #1f2026; }
.state { margin: 24px 16px; padding: 18px; background: #fff; color: #646875; }
.state-error { color: #b42336; }
.state p { margin: 0 0 12px; }
.quiet-button { min-height: 36px; padding: 0 12px; color: #1f2026; background: #f0f1f5; }
.signup-form { padding: 0 16px; }
.event-heading { margin: 4px 0 18px; padding: 22px 20px; color: #fff; background: #1f2026; border-left: 5px solid #ff0a30; }
.eyebrow { margin: 0 0 7px; color: #ff7188; font-size: 12px; font-weight: 700; }
.event-heading h2 { margin: 0; font-size: 25px; line-height: 1.24; overflow-wrap: anywhere; }
.event-meta { margin: 10px 0 0; color: #d0d1d6; font-size: 13px; }
.form-section { margin-top: 18px; padding: 18px; background: #fff; }
.section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.section-title h3 { margin: 0; font-size: 16px; }
.section-title span { color: #8a8e99; font-size: 12px; }
.group-list { display: grid; gap: 8px; }
.group-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 60px; padding: 9px 11px; border: 1px solid #e7e8ed; background: #fff; text-align: left; }
.group-option.selected { border-color: #ff0a30; background: #fff5f6; }
.group-option.unavailable { color: #a2a4ac; background: #f7f7f9; }
.radio-mark { display: grid; flex: none; place-items: center; width: 18px; height: 18px; border: 1px solid #c7c9d0; border-radius: 50%; }
.selected .radio-mark { border: 5px solid #ff0a30; }
.group-copy { display: grid; flex: 1; min-width: 0; gap: 3px; }
.group-copy strong { font-size: 14px; overflow-wrap: anywhere; }
.group-copy small, .capacity { color: #777b86; font-size: 12px; }
.capacity { flex: none; }
.no-groups { margin: 0; padding: 12px; color: #646875; background: #f5f6fa; font-size: 13px; }
.field-error { margin: 10px 0 0; color: #bd233b; font-size: 13px; }
.optional-section { padding: 0 18px; }
.disclosure { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 60px; text-align: left; }
.disclosure > span:first-child { display: grid; gap: 3px; }
.disclosure strong { font-size: 14px; }
.disclosure small { color: #858894; font-size: 12px; }
.disclosure > span:last-child { color: #ff0a30; font-size: 22px; }
.profile-fields { padding: 0 0 18px; border-top: 1px solid #f0f1f5; }
.profile-fields fieldset { min-width: 0; margin: 14px 0 0; padding: 0; border: 0; }
.profile-fields legend { margin-bottom: 8px; color: #5f626d; font-size: 12px; }
.choice-row { display: flex; gap: 8px; }
.choice { min-width: 66px; min-height: 36px; padding: 0 12px; color: #535660; background: #f3f4f7; font-size: 13px; }
.choice.chosen, .level-option.chosen { color: #c50025; background: #fff0f3; outline: 1px solid #ff0a30; }
.level-list { display: grid; gap: 6px; }
.level-option { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 6px 10px; background: #f5f6fa; text-align: left; }
.level-option strong { width: 32px; color: #1f2026; font-size: 13px; }
.level-option span { color: #666a75; font-size: 12px; }
.terms-line { display: flex; align-items: center; gap: 9px; margin: 16px 2px 0; color: #777b86; font-size: 12px; }
.free-mark { padding: 3px 6px; color: #196d47; background: #eaf6ef; font-weight: 700; }
.notice { margin: 12px 2px 0; color: #575b66; font-size: 13px; white-space: pre-wrap; }
.signup-unavailable { margin: 12px 2px 0; padding: 10px 12px; color: #8b3948; background: #fff0f2; font-size: 13px; }
.submit-dock { position: fixed; z-index: 10; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px max(16px, calc((100vw - 430px) / 2 + 16px)) calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid #ececf0; background: rgba(255, 255, 255, .97); }
.submit-dock p { flex: 1; min-width: 0; margin: 0; color: #717580; font-size: 11px; }
.submit-dock .primary { width: auto; min-width: 132px; height: 44px; margin: 0; padding: 0 18px; border-radius: 4px; background: #ff0a30; font-weight: 700; }
.submit-dock .primary:disabled { opacity: .45; }
.success-panel { margin: 12px 16px; padding: 24px 20px; background: #fff; }
.success-mark { display: grid; place-items: center; width: 42px; height: 42px; color: #fff; background: #168b50; font-size: 23px; font-weight: 700; }
.success-panel .eyebrow { margin-top: 18px; color: #168b50; }
.success-panel h2 { margin: 0; font-size: 23px; line-height: 1.25; overflow-wrap: anywhere; }
.success-copy { margin: 8px 0 20px; color: #666a75; font-size: 14px; }
.summary-list { margin: 0; border-top: 1px solid #ececf0; }
.summary-list div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid #ececf0; }
.summary-list dt { color: #858894; font-size: 12px; }
.summary-list dd { min-width: 0; margin: 0; color: #1f2026; font-size: 13px; overflow-wrap: anywhere; }
.cancel-note { margin: 16px 0; color: #666a75; font-size: 12px; }
.summary-link { display: grid; place-items: center; min-height: 44px; margin-top: 20px; border-radius: 4px; background: #ff0a30; color: #fff; font-weight: 700; }
@media (min-width: 700px) {
  .signup-page { max-width: 760px; margin: 0 auto; padding-bottom: 32px; }
  .signup-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 0 16px; }
  .event-heading { grid-column: 1 / -1; margin-bottom: 0; }
  .form-section { min-width: 0; }
  .optional-section { padding: 0 18px; }
  .terms-line, .notice, .signup-unavailable, .signup-form > .field-error { grid-column: 1 / -1; }
  .submit-dock { position: static; grid-column: 1 / -1; margin-top: 18px; padding: 0; border: 0; background: transparent; }
  .success-panel { margin: 20px auto; max-width: 560px; padding: 30px; }
}
</style>
