<template>
  <main class="activity-create">
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回跑团">‹</router-link>
      <h1>发布训练</h1>
      <button class="draft-action" type="button" @click="saveDraft">存草稿</button>
    </header>

    <div class="create-wrap">
      <nav class="steps" aria-label="发布进度">
        <button v-for="(label, index) in stepLabels" :key="label" type="button"
          :class="{ active: step === index, complete: step > index }" @click="goStep(index)">
          <i>{{ step > index ? '✓' : index + 1 }}</i><span>{{ label }}</span>
        </button>
      </nav>

      <p v-if="loading" class="state">正在载入跑团…</p>
      <section v-else-if="error && !club" class="state error-state">
        <p>{{ error }}</p><button type="button" class="outline" @click="load">重试</button>
      </section>
      <template v-else-if="club">
        <div class="club-line"><span class="club-mark">{{ club.name.slice(0, 1) }}</span><span>{{ club.name }}</span>
          <span class="club-role">跑团训练</span></div>

        <section v-if="step === 0" class="step-panel">
          <div class="step-heading"><span>01 / 03 · 基本信息</span><h2>这次跑什么？</h2><p class="timezone-note">活动时间按北京时间填写</p></div>
          <div class="field-label">训练类型</div>
          <div class="templates">
            <button v-for="item in templates" :key="item.id" type="button"
              :class="['template', { selected: form.trainingType === item.id }]" @click="chooseTemplate(item)">
              <span class="template-icon">{{ item.mark }}</span><strong>{{ item.label }}</strong><small>{{ item.hint }}</small>
            </button>
          </div>
          <div class="form-grid">
            <label class="field wide"><span>训练标题 <b>*</b></span>
              <input v-model.trim="form.title" maxlength="40" required :placeholder="selectedTemplate.titleHint" />
            </label>
            <label class="field"><span>开始时间 <b>*</b></span><input v-model="form.startsAt" type="datetime-local" required /></label>
            <label class="field"><span>结束时间</span><input v-model="form.endsAt" type="datetime-local" /></label>
            <label class="field wide"><span>训练地点 <b>*</b></span><input v-model.trim="form.place" maxlength="40" required placeholder="公园、操场或路线起点" /></label>
            <label class="field"><span>集合时间</span><input v-model.trim="form.gatherAt" maxlength="40" placeholder="例：提前 10 分钟" /></label>
            <label class="field"><span>集合点 <b>*</b></span><input v-model.trim="form.gatherPlace" maxlength="40" required placeholder="例：东门入口" /></label>
            <label class="field"><span>计划距离（公里）</span><input v-model="form.plannedKm" type="number" min="0.1" max="200" step="0.1" placeholder="可选" /></label>
            <label class="field"><span>活动期次</span><input v-model.trim="form.issue" maxlength="40" placeholder="可选" /></label>
          </div>
        </section>

        <section v-if="step === 1" class="step-panel">
          <div class="step-heading"><span>02 / 03 · 分组与安排</span><h2>让每个人找到合适的节奏</h2><p class="timezone-note">活动时间按北京时间填写</p></div>
          <div class="group-heading"><div><b>训练分组</b><small>报名时由成员自己选择，不会自动分配</small></div>
            <button class="add-group" type="button" :disabled="form.groups.length >= 12" @click="addGroup">＋ 添加分组</button></div>
          <div v-if="form.groups.length" class="group-list">
            <div v-for="(group, index) in form.groups" :key="index" class="group-editor">
              <div class="group-index">{{ String(index + 1).padStart(2, '0') }}</div>
              <label class="field"><span>组名</span><input v-model.trim="group.name" maxlength="20" placeholder="例：轻松跑组" /></label>
              <label class="field"><span>配速或目标</span><input v-model.trim="group.pace" maxlength="40" placeholder="例：6'30–7'00 /km" /></label>
              <label class="field"><span>名额（0 为不限）</span><input v-model.number="group.capacity" type="number" min="0" max="500" /></label>
              <label class="field group-kind"><span>分组类型</span><select v-model="group.kind"><option v-for="item in groupKinds" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
              <button class="remove-group" type="button" :aria-label="'删除' + group.name" @click="removeGroup(index)">×</button>
            </div>
          </div>
          <button v-else class="empty-groups" type="button" @click="addGroup">＋ 添加第一个分组</button>

          <div class="form-grid detail-fields">
            <label class="field"><span>报名截止</span><input v-model="form.signupUntil" type="datetime-local" /></label>
            <label class="field"><span>取消报名截止</span><input v-model="form.cancelUntil" type="datetime-local" /></label>
            <label class="field wide"><span>训练安排</span><textarea v-model="form.workout" maxlength="2000" rows="5" placeholder="热身、主训练内容、放松安排…"></textarea><small>{{ form.workout.length }}/2000</small></label>
            <label class="field wide"><span>参与须知</span><textarea v-model="form.notice" maxlength="1000" rows="3" placeholder="装备、补给或集合提醒…"></textarea><small>{{ form.notice.length }}/1000</small></label>
            <label class="field wide"><span>路线说明</span><input v-model.trim="form.route" maxlength="200" placeholder="路线、折返点或导航提示" /></label>
          </div>
          <details class="advanced"><summary>活动规则与说明</summary>
            <div class="form-grid">
              <label class="field wide"><span>补充说明</span><textarea v-model="form.note" maxlength="2000" rows="3"></textarea></label>
              <label class="field"><span>成团人数</span><input v-model.number="form.minPeople" type="number" min="1" max="500" /></label>
              <label class="field"><span>计分最低里程（公里）</span><input v-model.number="form.minKm" type="number" min="0.1" max="100" step="0.1" /></label>
              <label class="field"><span>完成积分</span><input v-model.number="form.points" type="number" min="0" max="100" /></label>
            </div>
          </details>
        </section>

        <section v-if="step === 2" class="step-panel preview-panel">
          <div class="step-heading"><span>03 / 03 · 发布前确认</span><h2>训练信息预览</h2></div>
          <div class="preview-hero"><span class="preview-type">{{ trainingLabel }}</span>
            <h3>{{ form.title || '未命名训练' }}</h3>
            <div class="preview-km"><strong>{{ form.plannedKm || '—' }}</strong><span>KM</span></div>
            <p>{{ formatWhen(form.startsAt) || '请设置开始时间' }}<template v-if="form.place"> · {{ form.place }}</template></p>
          </div>
          <div class="preview-facts">
            <div><small>集合</small><b>{{ form.gatherAt || '未设置' }}<template v-if="form.gatherPlace"> · {{ form.gatherPlace }}</template></b></div>
            <div><small>报名截止</small><b>{{ formatWhen(form.signupUntil) || '开始前可报名' }}</b></div>
            <div><small>跑团</small><b>{{ club.name }}</b></div>
          </div>
          <section v-if="form.groups.some((g) => g.name.trim())" class="preview-groups">
            <h4>训练分组</h4><div v-for="group in form.groups.filter((g) => g.name.trim())" :key="group.name" class="preview-group">
              <b>{{ group.name }}</b><span>{{ group.pace || groupKindLabel(group.kind) }}</span><small>{{ group.capacity > 0 ? group.capacity + ' 人名额' : '不限名额' }}</small></div>
          </section>
          <p v-if="form.workout" class="preview-copy"><b>训练安排</b>{{ form.workout }}</p>
          <p v-if="form.notice" class="preview-copy"><b>参与须知</b>{{ form.notice }}</p>
          <label class="review-check"><input v-model="form.review" type="checkbox" /> 活动相册内容需要管理员审核</label>
        </section>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="actions">
          <button v-if="step > 0" class="outline" type="button" @click="step -= 1">上一步</button>
          <span v-else class="draft-status">{{ draftMessage }}</span>
          <button v-if="step < 2" class="primary" type="button" @click="nextStep">继续 <span>→</span></button>
          <button v-else class="primary publish" type="button" :disabled="submitting" @click="publish">{{ submitting ? '正在发布…' : '确认发布训练' }}</button>
        </div>
      </template>
    </div>

    <div v-if="restoreAvailable" class="restore-toast" role="status">
      <span>发现这支跑团的未完成草稿</span>
      <button type="button" @click="restoreDraft">恢复</button><button type="button" @click="discardDraft">忽略</button>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";

const route = useRoute();
const router = useRouter();
const clubId = computed(() => String(route.params.id || ""));
const club = ref(null);
const step = ref(0);
const loading = ref(true);
const submitting = ref(false);
const error = ref("");
const draftMessage = ref("");
const restoreAvailable = ref(false);
const draftKey = ref("");
let loadVersion = 0;
const stepLabels = ["基本信息", "分组安排", "预览发布"];
const groupKinds = [
  { id: "pace", label: "配速组" }, { id: "finish", label: "完赛组" },
  { id: "volunteer", label: "志愿者" }, { id: "other", label: "其他" }
];
const templates = [
  { id: "easy", mark: "E", label: "轻松跑", hint: "恢复与有氧", titleHint: "例：周三轻松跑" },
  { id: "long", mark: "L", label: "长距离", hint: "耐力训练", titleHint: "例：周末长距离" },
  { id: "interval", mark: "I", label: "间歇跑", hint: "速度训练", titleHint: "例：周三间歇跑" },
  { id: "custom", mark: "+", label: "自定义", hint: "自由安排", titleHint: "填写训练标题" }
];

function blankForm() {
  return {
    trainingType: "custom", title: "", place: "", startsAt: "", endsAt: "", plannedKm: "",
    issue: "", gatherPlace: "", gatherAt: "", route: "", cancelUntil: "", signupUntil: "",
    workout: "", notice: "", note: "", minPeople: 3, minKm: 5, points: 1, review: false,
    groups: []
  };
}

const form = reactive(blankForm());
const trainingLabel = computed(() => templates.find((item) => item.id === form.trainingType)?.label || "自定义训练");
const selectedTemplate = computed(() => templates.find((item) => item.id === form.trainingType) || templates[templates.length - 1]);
let accountToken = null;

function currentToken() {
  try { return localStorage.getItem("marathon_token"); }
  catch { return null; }
}

function sameAccount() {
  if (currentToken() === accountToken) return true;
  error.value = "登录账号已变化，请重新打开发布页";
  return false;
}

function setForm(value) {
  Object.keys(form).forEach((key) => { delete form[key]; });
  Object.assign(form, value);
  form.groups = (value.groups || []).map((group) => ({
    name: group.name || "", kind: group.kind || "pace", pace: group.pace || "", capacity: Number(group.capacity) || 0
  }));
}

function toLocal(value) {
  return String(value || "").replace(" ", "T").slice(0, 16);
}

function copyValues(activity, groups, fallbackGroups) {
  const base = blankForm();
  return {
    ...base,
    trainingType: activity.trainingType || "custom",
    title: activity.title || "",
    place: activity.place || "",
    startsAt: "", endsAt: "", signupUntil: "", cancelUntil: "",
    plannedKm: activity.plannedKm == null ? "" : String(activity.plannedKm),
    issue: "", gatherPlace: activity.gatherPlace || "", gatherAt: activity.gatherAt || "",
    route: activity.route || "", workout: activity.workout || "", notice: activity.notice || "",
    note: activity.note || "", minPeople: activity.minPeople || 3, minKm: activity.minKm || 5,
    points: activity.points == null ? 1 : activity.points, review: !!activity.review,
    groups: (groups?.length ? groups : (fallbackGroups?.length ? fallbackGroups : base.groups)).map((group) => ({ name: group.name || "", kind: group.kind || "pace", pace: group.pace || "", capacity: Number(group.capacity) || 0 }))
  };
}

function groupKindLabel(kind) {
  return groupKinds.find((item) => item.id === kind)?.label || "配速组";
}

function checkDraft() {
  restoreAvailable.value = false;
  if (!draftKey.value || route.query.copy) return;
  try {
    if (localStorage.getItem(draftKey.value)) restoreAvailable.value = true;
  } catch {
    draftMessage.value = "浏览器暂不允许读取本地草稿";
  }
}

async function load() {
  const version = ++loadVersion;
  const id = clubId.value;
  const token = currentToken();
  loading.value = true;
  error.value = "";
  club.value = null;
  step.value = 0;
  restoreAvailable.value = false;
  try {
    const [clubData, me] = await Promise.all([api("/clubs/" + id), api("/me")]);
    if (version !== loadVersion || id !== clubId.value) return;
    if (currentToken() !== token) throw new Error("登录账号已变化，请重新打开发布页");
    if (!clubData.club.staff) throw new Error("只有跑团管理员可以发布训练");
    club.value = clubData.club;
    accountToken = token;
    draftKey.value = "marathon_activity_draft:" + id + ":" + me.user.id;
    setForm(blankForm());
    if (clubData.groups?.length) {
      form.groups = clubData.groups.map((group) => ({ name: group.name || "", kind: "pace", pace: group.pace || "", capacity: Number(group.capacity) || 0 }));
    }
    if (route.query.copy) {
      const source = await api("/clubs/" + id + "/activities/" + encodeURIComponent(route.query.copy));
      if (version !== loadVersion || id !== clubId.value) return;
      setForm(copyValues(source.activity, source.groups, form.groups));
      draftMessage.value = "已复制活动内容；日期和报名状态需要重新设置";
    } else {
      checkDraft();
    }
  } catch (err) {
    if (version === loadVersion && id === clubId.value) error.value = err.message;
  } finally {
    if (version === loadVersion && id === clubId.value) loading.value = false;
  }
}

function saveDraft() {
  if (!draftKey.value || !sameAccount()) return;
  try {
    localStorage.setItem(draftKey.value, JSON.stringify({ version: 1, form: JSON.parse(JSON.stringify(form)), step: step.value }));
    draftMessage.value = "草稿已保存在此设备";
    restoreAvailable.value = false;
  } catch {
    error.value = "草稿保存失败，请检查浏览器存储空间";
  }
}

function restoreDraft() {
  if (!sameAccount()) return;
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey.value) || "{}");
    if (draft.version !== 1 || !draft.form) throw new Error("格式不正确");
    setForm(draft.form);
    step.value = Math.max(0, Math.min(2, Number(draft.step) || 0));
    draftMessage.value = "已恢复草稿";
  } catch {
    error.value = "草稿无法读取，请忽略后重新填写";
  }
  restoreAvailable.value = false;
}

function discardDraft() {
  if (!sameAccount()) return;
  try {
    localStorage.removeItem(draftKey.value);
    restoreAvailable.value = false;
  } catch {
    error.value = "草稿未能删除，请检查浏览器存储权限";
  }
}

function chooseTemplate(item) {
  form.trainingType = item.id;
}

function addGroup() {
  if (form.groups.length < 12) form.groups.push({ name: "", kind: "pace", pace: "", capacity: 0 });
}

function removeGroup(index) {
  form.groups.splice(index, 1);
}

function validateFirst() {
  if (!form.title.trim()) return "请填写训练标题";
  if (!form.startsAt) return "请设置开始时间";
  if (!form.place.trim() || !form.gatherPlace.trim()) return "请填写训练地点和具体集合点";
  const start = new Date(form.startsAt).getTime();
  const end = form.endsAt ? new Date(form.endsAt).getTime() : 0;
  const signup = form.signupUntil ? new Date(form.signupUntil).getTime() : 0;
  const cancel = form.cancelUntil ? new Date(form.cancelUntil).getTime() : 0;
  if (!Number.isFinite(start) || (form.endsAt && !Number.isFinite(end)) || (form.signupUntil && !Number.isFinite(signup)) || (form.cancelUntil && !Number.isFinite(cancel))) return "请检查日期和时间是否有效";
  if (end && end < start) return "结束时间不能早于开始时间";
  if (signup && signup > start) return "报名截止不能晚于开始时间";
  if (cancel && cancel > start) return "取消报名截止不能晚于开始时间";
  if (form.plannedKm !== "" && (!Number.isFinite(Number(form.plannedKm)) || Number(form.plannedKm) < 0.1 || Number(form.plannedKm) > 200)) return "计划距离须在 0.1 到 200 公里之间";
  return "";
}

function validateGroups() {
  const names = form.groups.map((group) => group.name.trim()).filter(Boolean);
  if (new Set(names).size !== names.length) return "分组名称不能重复";
  if (!form.groups.length) return "请至少添加一个活动组别";
  if (form.groups.length > 12) return "一场活动最多设置 12 个组别";
  if (form.groups.some((group) => !group.name.trim() || group.name.trim().length > 20 || group.pace.trim().length > 40 || !groupKinds.some((kind) => kind.id === group.kind) || !Number.isInteger(Number(group.capacity)) || Number(group.capacity) < 0 || Number(group.capacity) > 500)) return "请检查每个分组的名称、类型、配速和名额";
  if (!Number.isInteger(Number(form.minPeople)) || form.minPeople < 1 || form.minPeople > 500 || !Number.isFinite(Number(form.minKm)) || form.minKm < 0.1 || form.minKm > 100 || !Number.isInteger(Number(form.points)) || form.points < 0 || form.points > 100) return "请检查活动规则的数值范围";
  return "";
}

function nextStep() {
  error.value = step.value === 0 ? validateFirst() : validateGroups();
  if (!error.value) step.value = Math.min(2, step.value + 1);
}

function goStep(index) {
  if (index < step.value) step.value = index;
  else if (index === step.value + 1) nextStep();
}

function formatWhen(value) {
  if (!value) return "";
  return value.replace("T", " ");
}

function serializeWhen(value) {
  return value ? value.replace("T", " ") : "";
}

async function publish() {
  if (!sameAccount()) return;
  error.value = validateFirst() || validateGroups();
  if (error.value || submitting.value) return;
  submitting.value = true;
  try {
    const body = {
      ...form,
      startsAt: serializeWhen(form.startsAt), endsAt: serializeWhen(form.endsAt),
      signupUntil: serializeWhen(form.signupUntil), cancelUntil: serializeWhen(form.cancelUntil),
      plannedKm: form.plannedKm === "" ? "" : Number(form.plannedKm),
      groups: form.groups.filter((group) => group.name.trim()).map((group) => ({ ...group, name: group.name.trim(), pace: group.pace.trim(), capacity: Number(group.capacity) || 0 }))
    };
    const data = await api("/clubs/" + clubId.value + "/activities", { method: "POST", body: JSON.stringify(body) });
    try { localStorage.removeItem(draftKey.value); } catch { /* Publishing succeeded; local draft cleanup is best-effort. */ }
    restoreAvailable.value = false;
    await router.replace("/clubs/" + clubId.value + "/activities/" + data.activity.id);
  } catch (err) {
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}

watch(() => [route.params.id, route.query.copy], load);
onMounted(load);
onUnmounted(() => { loadVersion += 1; });
</script>

<style scoped>
.activity-create { min-height: 100vh; padding-bottom: calc(24px + env(safe-area-inset-bottom)); color: #1f2026; background: #f5f6fa; }
.topbar { position: sticky; z-index: 5; top: 0; display: grid; grid-template-columns: 42px 1fr 80px; align-items: center; min-height: 54px; padding: 0 16px; border-bottom: 1px solid #eceef2; background: rgba(255, 255, 255, .96); }
.topbar > a { display: grid; place-items: center; width: 34px; height: 36px; color: #1f2026; font-size: 28px; line-height: 1; }
.topbar h1 { margin: 0; font-size: 16px; font-weight: 650; }
.draft-action { justify-self: end; min-height: 34px; padding: 0 8px; color: #ff0a30; font-size: 13px; font-weight: 650; }
.create-wrap { width: min(100%, 900px); margin: 0 auto; padding: 20px 22px 34px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 24px; border-bottom: 1px solid #dfe1e7; }
.steps button { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 5px 13px; color: #8a8e99; text-align: left; font-size: 13px; }
.steps button::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; background: transparent; content: ""; }
.steps button.active { color: #1f2026; font-weight: 650; }
.steps button.active::after, .steps button.complete::after { background: #ff0a30; }
.steps i { display: grid; flex: none; place-items: center; width: 24px; aspect-ratio: 1; border: 1px solid #d7d9df; border-radius: 50%; color: #777b85; font-size: 11px; font-style: normal; }
.steps .active i, .steps .complete i { border-color: #ff0a30; color: #fff; background: #ff0a30; }
.club-line { display: flex; align-items: center; gap: 9px; margin: 0 0 24px; color: #686c76; font-size: 13px; }
.club-mark { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 7px; color: #ff0a30; background: #fff0f3; font-weight: 700; }
.club-role { margin-left: auto; color: #8a8e99; font-size: 12px; }
.step-heading { margin-bottom: 20px; }
.step-heading > span { color: #ff0a30; font-size: 11px; font-weight: 700; }
.step-heading h2 { margin: 5px 0 0; font-size: 25px; line-height: 1.25; font-weight: 720; }
.timezone-note { margin: 6px 0 0; color: #858a98; font-size: 12px; }
.field-label { margin: 0 0 9px; font-size: 13px; font-weight: 650; }
.templates { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 20px; }
.template { display: grid; min-width: 0; min-height: 107px; grid-template-rows: 30px auto auto; gap: 2px; justify-items: start; padding: 11px 12px; border: 1px solid #e2e4e9; border-radius: 6px; background: #fff; text-align: left; }
.template.selected { border-color: #ff0a30; box-shadow: inset 0 0 0 1px #ff0a30; }
.template-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 6px; color: #ff0a30; background: #fff0f3; font-size: 13px; font-weight: 750; }
.template strong { align-self: end; font-size: 14px; }
.template small { color: #8a8e99; font-size: 11px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.field { display: flex; position: relative; min-width: 0; flex-direction: column; gap: 6px; color: #595d66; font-size: 12px; }
.field > span { font-weight: 600; }
.field > span b { color: #ff0a30; }
.field input, .field select, .field textarea { width: 100%; min-width: 0; min-height: 42px; border: 1px solid #e0e2e8; border-radius: 5px; outline: none; padding: 9px 11px; color: #1f2026; background: #fff; font-size: 14px; }
.field textarea { min-height: 90px; resize: vertical; line-height: 1.5; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #ff0a30; box-shadow: 0 0 0 2px #ff0a301c; }
.field input[type="datetime-local"] { padding: 8px; }
.field > small { align-self: flex-end; margin-top: -3px; color: #8a8e99; font-size: 11px; }
.wide { grid-column: 1 / -1; }
.group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
.group-heading > div { display: grid; gap: 2px; }
.group-heading b { font-size: 14px; }
.group-heading small { color: #8a8e99; font-size: 11px; }
.add-group { min-height: 34px; padding: 0 10px; color: #ff0a30; font-size: 12px; font-weight: 650; white-space: nowrap; }
.add-group:disabled { color: #a7a9b0; }
.group-list { display: grid; gap: 8px; }
.group-editor { position: relative; display: grid; grid-template-columns: 32px minmax(110px,1.05fr) minmax(130px,1.5fr) minmax(90px,.8fr) minmax(105px,.9fr) 28px; align-items: end; gap: 10px; padding: 12px 10px; border: 1px solid #e6e7eb; border-radius: 6px; background: #fff; }
.group-index { align-self: center; color: #ff0a30; font-size: 12px; font-weight: 700; }
.group-editor .field input { min-height: 38px; font-size: 13px; }
.group-editor .field select { min-height: 38px; padding: 7px; font-size: 13px; }
.remove-group { align-self: center; width: 28px; height: 32px; color: #8a8e99; font-size: 22px; }
.empty-groups { width: 100%; min-height: 56px; border: 1px dashed #cfd2da; border-radius: 6px; color: #ff0a30; background: #fff; font-size: 13px; }
.detail-fields { margin-top: 20px; }
.advanced { margin-top: 18px; border-top: 1px solid #e2e4e9; border-bottom: 1px solid #e2e4e9; }
.advanced summary { padding: 13px 0; color: #595d66; font-size: 13px; font-weight: 600; cursor: pointer; }
.advanced .form-grid { padding-bottom: 16px; }
.preview-panel { border-top: 3px solid #ff0a30; }
.preview-hero { position: relative; min-height: 200px; padding: 23px 24px; overflow: hidden; color: #fff; background: #1f2026; }
.preview-hero::after { position: absolute; top: -33px; right: -24px; width: 180px; height: 180px; border: 1px solid #ffffff20; border-radius: 50%; box-shadow: 0 0 0 23px #ffffff08, 0 0 0 47px #ffffff06; content: ""; }
.preview-type { color: #ff4966; font-size: 11px; font-weight: 750; }
.preview-hero h3 { position: relative; z-index: 1; max-width: 70%; margin: 12px 0 4px; overflow-wrap: anywhere; font-size: 24px; line-height: 1.2; }
.preview-km { display: flex; align-items: baseline; gap: 7px; }
.preview-km strong { color: #fff; font-size: 58px; line-height: 1; font-weight: 750; }
.preview-km span { color: #c6c8ce; font-size: 13px; font-weight: 700; }
.preview-hero p { margin: 15px 0 0; color: #c6c8ce; font-size: 13px; }
.preview-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 17px; background: #fff; }
.preview-facts > div { display: grid; min-width: 0; gap: 3px; padding: 13px 14px; border-right: 1px solid #eceef2; }
.preview-facts > div:last-child { border: 0; }
.preview-facts small { color: #8a8e99; font-size: 11px; }
.preview-facts b { overflow-wrap: anywhere; font-size: 12px; font-weight: 600; }
.preview-groups { margin-top: 20px; }
.preview-groups h4 { margin: 0 0 8px; font-size: 14px; }
.preview-group { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px 12px; border-top: 1px solid #e4e6eb; background: #fff; }
.preview-group b { font-size: 13px; }
.preview-group span, .preview-group small { overflow-wrap: anywhere; color: #777b85; font-size: 12px; }
.preview-copy { display: grid; gap: 5px; margin: 18px 0 0; padding: 13px 14px; border-left: 2px solid #ff0a30; color: #595d66; background: #fff; white-space: pre-wrap; font-size: 13px; line-height: 1.55; }
.preview-copy b { color: #1f2026; font-size: 12px; }
.review-check { display: flex; align-items: center; gap: 9px; margin-top: 18px; color: #595d66; font-size: 13px; }
.review-check input { width: 17px; height: 17px; accent-color: #ff0a30; }
.actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e4e9; }
.draft-status { min-width: 0; color: #858993; font-size: 12px; }
.primary, .outline { display: inline-flex; align-items: center; justify-content: center; gap: 14px; min-height: 44px; padding: 0 20px; border-radius: 5px; font-size: 14px; font-weight: 650; }
.primary { margin-left: auto; color: #fff; background: #ff0a30; }
.primary span { font-size: 19px; font-weight: 400; }
.primary:disabled { opacity: .6; }
.outline { border: 1px solid #dfe1e7; color: #42454d; background: #fff; }
.publish { min-width: 190px; }
.form-error { margin: 14px 0 -12px; color: #c30025; font-size: 13px; }
.state { padding: 40px 0; color: #777b85; text-align: center; }
.error-state { color: #c30025; }
.error-state .outline { margin: 10px auto; }
.restore-toast { position: fixed; z-index: 8; right: max(16px, calc((100vw - 860px) / 2)); bottom: 18px; left: max(16px, calc((100vw - 860px) / 2)); display: flex; align-items: center; gap: 14px; min-height: 54px; padding: 8px 14px; border: 1px solid #e5e6eb; border-radius: 6px; background: #fff; box-shadow: 0 8px 28px #20212a1c; font-size: 13px; }
.restore-toast span { flex: 1; min-width: 0; }
.restore-toast button { flex: none; color: #ff0a30; font-size: 12px; font-weight: 650; }
@media (max-width: 620px) {
  .create-wrap { padding: 16px 16px 30px; }
  .steps { margin-bottom: 20px; }
  .steps button { gap: 6px; font-size: 11px; }
  .steps i { width: 21px; }
  .step-heading h2 { font-size: 22px; }
  .templates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .template { min-height: 87px; grid-template-columns: 29px 1fr; grid-template-rows: 28px auto; align-items: center; column-gap: 8px; }
  .template-icon { grid-row: 1 / span 2; }
  .template strong { align-self: end; }
  .template small { grid-column: 2; }
  .form-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .wide { grid-column: auto; }
  .group-editor { grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 28px; gap: 8px; padding: 10px 8px; }
  .group-editor .field:nth-of-type(2) { grid-column: 2 / 4; }
  .group-editor .field:nth-of-type(3) { grid-column: 2 / 4; }
  .group-editor .group-kind { grid-column: 2 / 4; }
  .group-editor .remove-group { grid-column: 4; grid-row: 1; }
  .preview-facts { grid-template-columns: 1fr; }
  .preview-facts > div { grid-template-columns: 95px 1fr; align-items: baseline; border-right: 0; border-bottom: 1px solid #eceef2; }
  .preview-facts > div:last-child { border-bottom: 0; }
  .preview-group { grid-template-columns: 1fr 1fr; }
  .preview-group small { grid-column: 2; }
  .preview-group span { grid-column: 1; grid-row: 2; }
  .restore-toast { bottom: 10px; gap: 10px; font-size: 12px; }
  .actions { position: sticky; bottom: 0; z-index: 4; margin: 22px -16px 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #e4e6eb; background: #f5f6fa; }
  .publish { min-width: 0; }
}
</style>
