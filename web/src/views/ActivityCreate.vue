<template>
  <main class="activity-create">
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId" aria-label="返回跑团">‹</router-link>
      <h1>{{ templateMode ? (editingTemplate ? '编辑训练模板' : '创建训练模板') : '发布训练' }}</h1>
      <button class="draft-action" type="button" @click="templateMode ? leaveTemplateEditor() : saveDraft()">{{ templateMode ? '返回活动' : '存草稿' }}</button>
    </header>

    <div class="create-wrap">
      <nav class="steps" aria-label="发布进度">
        <button v-for="(label, index) in (templateMode ? templateStepLabels : stepLabels)" :key="label" type="button"
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
          <span class="club-role">{{ templateMode ? '跑团共享模板' : '跑团训练' }}</span></div>
        <div v-if="templateMode" class="editing-banner"><span class="editing-symbol">↗</span><div><b>{{ editingTemplate ? '正在编辑跑团模板' : '把常用训练，变成下次的起点' }}</b><p>仅保存训练内容与常用时刻；每次使用时重新确认日期。</p></div></div>
        <div v-if="templateMessage" class="template-message" role="status">{{ templateMessage }}</div>

        <section v-if="step === 0" class="step-panel">
          <div class="step-heading"><span>01 / 03 · 基本信息</span><h2>这次跑什么？</h2><p class="timezone-note">活动时间按北京时间填写</p></div>
          <section v-if="!templateMode" class="template-library">
            <div class="template-library-heading"><div><span class="small-kicker">A GOOD START</span><h3>从模板开始</h3><p>内容先备好，日期这次定。</p></div><button type="button" class="text-button" @click="enterTemplateEditor()">＋ 创建模板</button></div>
            <div class="templates" aria-label="基础训练模板">
              <button v-for="item in templates" :key="item.id" type="button" :class="['template', { selected: appliedTemplateKey === 'preset:' + item.id }]" :aria-pressed="appliedTemplateKey === 'preset:' + item.id" @click="chooseTemplate(item)"><span class="template-icon">{{ item.mark }}</span><strong>{{ item.label }}</strong><small>{{ item.hint }}</small><span class="template-check" v-if="appliedTemplateKey === 'preset:' + item.id">✓</span></button>
            </div>
            <button type="button" class="blank-start" @click="clearTemplate">不使用模板，从空白开始 →</button>
            <div class="saved-heading"><b>跑团的常用模板 <small>{{ sharedTemplates.length }}</small></b><button type="button" class="text-button" @click="openTemplateSave">将当前内容存为模板 ↗</button></div>
            <p v-if="templatesLoading" class="template-hint" role="status">正在读取跑团模板…</p>
            <div v-else-if="templatesError" class="template-load-error"><span>{{ templatesError }}</span><button type="button" @click="loadTemplates">重试</button></div>
            <div v-else-if="sharedTemplates.length" class="saved-templates">
              <article v-for="item in sharedTemplates" :key="item.id" class="saved-template" :class="{ selected: appliedTemplateKey === 'saved:' + item.id }"><button type="button" class="saved-template-use" @click="applySavedTemplate(item)"><span class="saved-template-mark">↗</span><strong>{{ item.name }}</strong><small>{{ templateSummary(item) }}</small></button><div class="saved-template-tools"><button type="button" @click="applySavedTemplate(item)">使用模板</button><button type="button" @click="enterTemplateEditor(item)">编辑</button><button type="button" @click="askDeleteTemplate(item)">删除</button></div></article>
            </div>
            <p v-else class="template-hint">把常用地点、配速分组和训练安排存下来，全团管理员都能复用。</p>
          </section>
          <div v-else class="template-editor-name"><span class="small-kicker">CLUB TEMPLATE</span><label class="field"><span>模板名称 <b>*</b></span><input v-model.trim="templateName" maxlength="30" placeholder="例：周三间歇训练" /></label><label class="field"><span>训练类型</span><select v-model="form.trainingType"><option value="custom">自由训练</option><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.label }}</option></select></label></div>
          <div class="form-section-title"><span>01</span><h3>{{ templateMode ? '常用训练内容' : '这一次的安排' }}</h3><small v-if="!templateMode">必填项已标记 *</small></div>
          <label v-if="!templateMode && activeTiming.startTime" class="reuse-date-row"><span><b>常用时刻 {{ activeTiming.startTime }}</b><small>选择本次日期，即可带入时间与截止安排</small></span><input type="date" aria-label="选择本次活动日期" @change="applyTemplateDate" /></label>
          <div class="form-grid">
            <label class="field wide"><span>训练标题 <b v-if="!templateMode">*</b><small v-else>留空时使用模板名称</small></span>
              <input v-model.trim="form.title" maxlength="40" :required="!templateMode" :placeholder="selectedTemplate.titleHint" />
            </label>
            <label v-if="!templateMode" class="field wide"><span>开始时间 <b>*</b><small>北京时间</small></span><input v-model="form.startsAt" type="datetime-local" required /><small v-if="activeTiming.startTime">模板常用时刻 {{ activeTiming.startTime }}，请选择并确认本次日期与时刻。</small></label>
            <label v-else class="field"><span>常用开始时刻</span><input v-model="activeTiming.startTime" type="time" /></label>
            <label v-if="templateMode" class="field"><span>训练时长（分钟）</span><input v-model="activeTiming.durationMinutes" type="number" min="0" max="10080" placeholder="可选" /></label>
            <label class="field wide"><span>训练地点 <b v-if="!templateMode">*</b></span><input v-model.trim="form.place" maxlength="40" :required="!templateMode" placeholder="公园、操场或路线起点" /></label>
            <label class="field"><span>集合时间</span><input v-model.trim="form.gatherAt" maxlength="40" placeholder="例：提前 10 分钟" /></label>
            <label class="field"><span>集合点 <b v-if="!templateMode">*</b></span><input v-model.trim="form.gatherPlace" maxlength="40" :required="!templateMode" placeholder="例：东门入口" /></label>
            <label class="field"><span>计划距离（公里）</span><input v-model="form.plannedKm" type="number" min="0.1" max="200" step="0.1" placeholder="可选" /></label>
          </div>
          <details v-if="!templateMode" class="advanced basic-options"><summary><span>更多时间与期次</span><small>结束时间、活动期次</small></summary><div class="form-grid">
            <label class="field"><span>结束时间</span><input v-model="form.endsAt" type="datetime-local" /></label>
            <label class="field"><span>活动期次</span><input v-model.trim="form.issue" maxlength="40" placeholder="可选，每次活动单独填写" /></label>
          </div></details>
          <div class="template-tip"><span>↗</span><p>{{ templateMode ? '地点可以先留空，使用模板发布活动时再补充。' : '常用内容可以保存成跑团模板，下次只需确认日期。' }}</p><button v-if="!templateMode" type="button" @click="openTemplateSave">存为模板</button>
          </div>
        </section>

        <section v-if="step === 1" class="step-panel">
          <div class="step-heading"><span>02 / 03 · 分组与安排</span><h2>让每个人找到合适的节奏</h2><p class="timezone-note">活动时间按北京时间填写</p></div>
          <div class="group-heading"><div><b>训练分组</b><small>报名时由成员自己选择，不会自动分配</small></div>
            <button class="add-group" type="button" :disabled="form.groups.length >= 12" @click="addGroup">＋ 添加分组</button></div>
          <div v-if="form.groups.length" class="group-list">
            <div v-for="(group, index) in form.groups" :key="index" class="group-editor">
              <div class="group-card-heading"><span class="group-index">GROUP {{ String(index + 1).padStart(2, '0') }}</span><button class="remove-group" type="button" :aria-label="'删除' + (group.name || '第' + (index + 1) + '组')" @click="removeGroup(index)">删除 <span>×</span></button></div>
              <div class="group-fields"><label class="field"><span>组名 <b>*</b></span><input v-model.trim="group.name" maxlength="20" placeholder="例：轻松跑组" /></label><label class="field"><span>分组类型</span><select v-model="group.kind"><option v-for="item in groupKinds" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label class="field"><span>配速或目标</span><input v-model.trim="group.pace" maxlength="40" placeholder="例：6′30″–7′00″ /km" /></label><label class="field"><span>名额 <small>0 为不限</small></span><input v-model.number="group.capacity" type="number" min="0" max="500" /></label></div>
            </div>
          </div>
          <button v-else class="empty-groups" type="button" @click="addGroup">＋ 添加第一个分组</button>

          <div class="form-grid detail-fields">
            <label v-if="templateMode" class="field"><span>提前多少分钟截止报名</span><input v-model="activeTiming.signupLeadMinutes" type="number" min="0" max="43200" placeholder="留空：开始前可报名" /></label>
            <label v-else class="field"><span>报名截止</span><input v-model="form.signupUntil" type="datetime-local" /></label>
            <label v-if="templateMode" class="field"><span>提前多少分钟截止取消</span><input v-model="activeTiming.cancelLeadMinutes" type="number" min="0" max="43200" placeholder="留空：沿用活动规则" /></label>
            <label v-else class="field"><span>取消报名截止</span><input v-model="form.cancelUntil" type="datetime-local" /></label>
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
          <div class="step-heading"><span>03 / 03 · {{ templateMode ? '保存前确认' : '发布前确认' }}</span><h2>{{ templateMode ? '模板信息预览' : '训练信息预览' }}</h2></div>
          <div class="preview-hero"><span class="preview-type">{{ trainingLabel }}</span>
            <h3>{{ form.title || '未命名训练' }}</h3>
            <div class="preview-km"><strong>{{ form.plannedKm || '—' }}</strong><span>KM</span></div>
            <p>{{ templateMode ? (activeTiming.startTime ? '常用时刻 ' + activeTiming.startTime : '日期在使用时确认') : formatWhen(form.startsAt) || '请设置开始时间' }}<template v-if="form.place"> · {{ form.place }}</template></p>
          </div>
          <div class="preview-facts">
            <div><small>集合</small><b>{{ form.gatherAt || '未设置' }}<template v-if="form.gatherPlace"> · {{ form.gatherPlace }}</template></b></div>
            <div><small>报名截止</small><b>{{ templateMode ? (activeTiming.signupLeadMinutes != null && activeTiming.signupLeadMinutes !== '' ? '开始前 ' + activeTiming.signupLeadMinutes + ' 分钟' : '开始前可报名') : formatWhen(form.signupUntil) || '开始前可报名' }}</b></div>
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
          <span v-else class="draft-status">{{ templateMode ? '保存到跑团，全团管理员可用' : draftMessage || '可先存草稿，稍后继续' }}</span>
          <button v-if="step < 2" class="primary" type="button" @click="nextStep">继续 <span>→</span></button>
          <button v-else-if="templateMode" class="primary publish" type="button" :disabled="templateSaving" @click="openTemplateSave">保存训练模板 <span>↗</span></button>
          <button v-else class="primary publish" type="button" :disabled="submitting" @click="publish">{{ submitting ? '正在发布…' : '确认发布训练' }}</button>
        </div>
      </template>
    </div>

    <div v-if="templateSaveOpen || pendingDeleteTemplate" class="template-modal" @click.self="closeTemplateModal" @keydown.esc="closeTemplateModal"><section class="template-sheet" role="dialog" aria-modal="true" :aria-labelledby="pendingDeleteTemplate ? 'delete-template-title' : 'save-template-title'"><button type="button" class="sheet-close" aria-label="关闭" :disabled="templateSaving" @click="closeTemplateModal">×</button><template v-if="pendingDeleteTemplate"><span class="small-kicker">CLUB TEMPLATE</span><h2 id="delete-template-title">删除这个训练模板？</h2><p>“{{ pendingDeleteTemplate.name }}”将从跑团模板库移除，已发布活动不受影响。</p><p v-if="templateActionError" class="form-error" role="alert">{{ templateActionError }}</p><div class="sheet-actions"><button type="button" class="outline" :disabled="templateSaving" @click="closeTemplateModal">保留模板</button><button type="button" class="primary" :disabled="templateSaving" @click="deleteTemplate">{{ templateSaving ? '正在删除…' : '确认删除' }}</button></div></template><template v-else><span class="small-kicker">SAVE FOR YOUR NEXT RUN</span><h2 id="save-template-title">{{ editingTemplate && templateMode ? '更新跑团模板' : '给常用训练起个名字' }}</h2><p>保存地点、分组、配速与训练安排；日期和活动期次每次单独确认。</p><label class="field"><span>模板名称</span><input v-model.trim="templateName" maxlength="30" placeholder="例：周三间歇训练" @keydown.enter.prevent="saveTemplate" /></label><p v-if="templateActionError" class="form-error" role="alert">{{ templateActionError }}</p><button type="button" class="primary sheet-submit" :disabled="templateSaving" @click="saveTemplate">{{ templateSaving ? '正在保存…' : editingTemplate && templateMode ? '保存修改' : '保存到跑团模板' }}</button></template></section></div>
    <div v-if="restoreAvailable && !templateMode" class="restore-toast" role="status">
      <span>发现这支跑团的未完成草稿</span>
      <button type="button" @click="restoreDraft">恢复</button><button type="button" @click="discardDraft">忽略</button>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { trainingPresets, blankTiming, extractTiming, templateConfig, formFromTemplate, timingFromTemplate, applyRelativeTiming } from '../activity-template-utils';

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
const templates = trainingPresets;
const templateStepLabels = ['模板内容', '分组安排', '预览保存'];
const sharedTemplates = ref([]), templatesLoading = ref(false), templatesError = ref('');
const templateMode = ref(false), editingTemplate = ref(null), templateName = ref('');
const templateSaveOpen = ref(false), templateSaving = ref(false), templateActionError = ref('');
const pendingDeleteTemplate = ref(null), templateMessage = ref(''), appliedTemplateKey = ref('');
const activeTiming = reactive(blankTiming());
let templatesVersion = 0, activitySnapshot = null;

function blankForm() {
  return {
    trainingType: "custom", title: "", place: "", startsAt: "", endsAt: "", plannedKm: "",
    issue: "", gatherPlace: "", gatherAt: "", route: "", cancelUntil: "", signupUntil: "",
    workout: "", notice: "", note: "", minPeople: 3, minKm: 5, points: 1, review: false,
    groups: [{ name: '自由训练组', kind: 'other', pace: '', capacity: 0 }]
  };
}

const form = reactive(blankForm());
const trainingLabel = computed(() => templates.find((item) => item.id === form.trainingType)?.label || "自定义训练");
const selectedTemplate = computed(() => templates.find((item) => item.id === form.trainingType) || { titleHint: '填写训练标题' });
let accountToken = null, settingForm = false;

function currentToken() {
  try { return localStorage.getItem("marathon_token"); }
  catch { return null; }
}

function sameAccount() {
  if (currentToken() === accountToken) return true;
  error.value = "登录账号已变化，请重新打开发布页";
  club.value = null; sharedTemplates.value = []; templateSaveOpen.value = false; pendingDeleteTemplate.value = null;
  return false;
}

function setForm(value) {
  settingForm = true;
  Object.keys(form).forEach((key) => { delete form[key]; });
  Object.assign(form, blankForm(), value);
  form.groups = (value.groups || []).map((group) => ({
    name: group.name || "", kind: group.kind || "pace", pace: group.pace || "", capacity: Number(group.capacity) || 0
  }));
  settingForm = false;
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
  submitting.value = false;
  error.value = "";
  club.value = null;
  accountToken = null;
  sharedTemplates.value = []; templatesError.value = ''; templatesVersion += 1;
  templateMode.value = false; editingTemplate.value = null; templateSaveOpen.value = false;
  pendingDeleteTemplate.value = null; templateSaving.value = false; templateMessage.value = '';
  templateName.value = ''; appliedTemplateKey.value = ''; activitySnapshot = null;
  Object.assign(activeTiming, blankTiming());
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
      if (currentToken() !== token) throw new Error('登录账号已变化，请重新打开发布页');
      setForm(copyValues(source.activity, source.groups, form.groups));
      draftMessage.value = "已复制活动内容；日期和报名状态需要重新设置";
    } else {
      checkDraft();
    }
    void loadTemplates();
  } catch (err) {
    if (version === loadVersion && id === clubId.value) {
      error.value = err.message;
      if (currentToken() !== token) { club.value = null; sharedTemplates.value = []; }
    }
  } finally {
    if (version === loadVersion && id === clubId.value) loading.value = false;
  }
}

function saveDraft() {
  if (!draftKey.value || !sameAccount()) return;
  try {
    localStorage.setItem(draftKey.value, JSON.stringify({ version: 1, form: JSON.parse(JSON.stringify(form)), step: step.value, timing: { ...activeTiming }, templateKey: appliedTemplateKey.value }));
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
    Object.assign(activeTiming, blankTiming(), draft.timing || {});
    appliedTemplateKey.value = draft.templateKey || '';
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

function clearTemplate() {
  if (!sameAccount()) return;
  setForm(blankForm()); Object.assign(activeTiming, blankTiming()); appliedTemplateKey.value = '';
  templateMessage.value = '从空白开始填写本次训练。'; error.value = '';
}

function chooseTemplate(item) {
  if (!sameAccount()) return;
  setForm(formFromTemplate(item.config, blankForm()));
  Object.assign(activeTiming, blankTiming());
  appliedTemplateKey.value = 'preset:' + item.id;
  error.value = '';
  templateMessage.value = '已带入' + item.label + '的训练安排与分组，请确认本次日期、地点和训练强度。';
}

function validScope(version, id, token) {
  return version === loadVersion && id === clubId.value && token === accountToken && token === currentToken();
}

async function loadTemplates() {
  if (!club.value || !sameAccount()) return;
  const version = loadVersion, id = clubId.value, token = accountToken, request = ++templatesVersion;
  templatesLoading.value = true; templatesError.value = '';
  try {
    const data = await api('/clubs/' + id + '/activity-templates');
    if (validScope(version, id, token) && request === templatesVersion) sharedTemplates.value = data.templates || [];
  } catch (err) {
    if (validScope(version, id, token) && request === templatesVersion) templatesError.value = '模板暂时无法读取，可继续填写活动。' + (err.message ? ' ' + err.message : '');
  } finally {
    if (validScope(version, id, token) && request === templatesVersion) templatesLoading.value = false;
  }
}

function applyTemplateDate(event) {
  if (!sameAccount() || !activeTiming.startTime) return;
  const date = event.target.value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) form.startsAt = date + 'T' + activeTiming.startTime;
}

function templateSummary(item) {
  const config = item.config || {};
  return [config.plannedKm ? config.plannedKm + ' km' : trainingLabelFor(config.trainingType), (config.groups?.length || 0) + ' 个分组', config.startTime || '日期每次确认'].join(' · ');
}
function trainingLabelFor(type) { return templates.find(item => item.id === type)?.label || '自由训练'; }

function applySavedTemplate(item) {
  if (!sameAccount()) return;
  setForm(formFromTemplate(item.config || {}, blankForm()));
  Object.assign(activeTiming, timingFromTemplate(item.config || {}));
  appliedTemplateKey.value = 'saved:' + item.id;
  error.value = ''; step.value = 0;
  templateMessage.value = '已使用“' + item.name + '”；请选择本次活动日期，期次已清空。';
}

function enterTemplateEditor(item = null) {
  if (!sameAccount()) return;
  if (!templateMode.value) activitySnapshot = { form: JSON.parse(JSON.stringify(form)), step: step.value, timing: { ...activeTiming }, key: appliedTemplateKey.value };
  templateMode.value = true; editingTemplate.value = item ? JSON.parse(JSON.stringify(item)) : null;
  templateName.value = item?.name || '';
  setForm(item ? formFromTemplate(item.config || {}, blankForm()) : blankForm());
  Object.assign(activeTiming, item ? timingFromTemplate(item.config || {}) : blankTiming());
  step.value = 0; error.value = ''; templateMessage.value = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function leaveTemplateEditor() {
  if (templateSaving.value || !sameAccount()) return;
  templateMode.value = false; editingTemplate.value = null; templateSaveOpen.value = false;
  if (activitySnapshot) {
    setForm(activitySnapshot.form); step.value = activitySnapshot.step;
    Object.assign(activeTiming, activitySnapshot.timing); appliedTemplateKey.value = activitySnapshot.key;
    activitySnapshot = null;
  }
  error.value = '';
}

function validateReusable() {
  if (form.plannedKm !== '' && form.plannedKm != null && (!Number.isFinite(Number(form.plannedKm)) || Number(form.plannedKm) < .1 || Number(form.plannedKm) > 200)) return '计划距离须在 0.1 到 200 公里之间';
  return validateGroups();
}

function validateTiming() {
  if (activeTiming.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(activeTiming.startTime)) return '请检查常用开始时刻';
  for (const [key, max] of [['durationMinutes', 10080], ['signupLeadMinutes', 43200], ['cancelLeadMinutes', 43200]]) {
    const value = activeTiming[key];
    if (value !== '' && value != null && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > max)) return '请检查模板时长与提前截止分钟数';
  }
  return '';
}

function openTemplateSave() {
  if (!sameAccount()) return;
  templateActionError.value = validateReusable() || (templateMode.value ? validateTiming() : '');
  if (!templateMode.value) templateName.value = form.title.trim().slice(0, 30);
  templateSaveOpen.value = true;
}

function closeTemplateModal() {
  if (templateSaving.value) return;
  templateSaveOpen.value = false; pendingDeleteTemplate.value = null; templateActionError.value = '';
}

async function saveTemplate() {
  if (!sameAccount() || templateSaving.value) return;
  const name = templateName.value.trim();
  templateActionError.value = !name || [...name].length > 30 ? '模板名称用 1 到 30 个字' : validateReusable() || (templateMode.value ? validateTiming() : '');
  if (templateActionError.value) return;
  const version = loadVersion, id = clubId.value, token = accountToken;
  const editing = templateMode.value ? editingTemplate.value : null;
  const config = templateConfig(form, templateMode.value || !form.startsAt ? activeTiming : extractTiming(form));
  config.title ||= name;
  templateSaving.value = true; ++templatesVersion; templatesLoading.value = false;
  try {
    const data = await api('/clubs/' + id + '/activity-templates' + (editing ? '/' + editing.id : ''), {
      method: editing ? 'PUT' : 'POST', body: JSON.stringify({ name, config, ...(editing ? { version: editing.version } : {}) })
    });
    if (!validScope(version, id, token)) return;
    const saved = data.template;
    sharedTemplates.value = [saved, ...sharedTemplates.value.filter(item => item.id !== saved.id)];
    templateSaveOpen.value = false; templateSaving.value = false;
    if (templateMode.value) leaveTemplateEditor();
    templateMessage.value = '已保存“' + saved.name + '”，跑团管理员下次可直接使用。';
  } catch (err) {
    if (validScope(version, id, token)) {
      templateActionError.value = err.status === 409 ? '模板已被其他管理员修改。模板库已刷新，请返回活动并重新点击编辑。' : err.message;
      if (err.status === 409) void loadTemplates();
    }
  } finally {
    if (validScope(version, id, token)) templateSaving.value = false;
  }
}

function askDeleteTemplate(item) {
  if (!sameAccount()) return;
  pendingDeleteTemplate.value = item; templateActionError.value = '';
}
async function deleteTemplate() {
  if (!sameAccount() || templateSaving.value || !pendingDeleteTemplate.value) return;
  const version = loadVersion, id = clubId.value, token = accountToken, item = pendingDeleteTemplate.value;
  templateSaving.value = true; ++templatesVersion; templatesLoading.value = false;
  try {
    await api('/clubs/' + id + '/activity-templates/' + item.id, { method: 'DELETE' });
    if (!validScope(version, id, token)) return;
    sharedTemplates.value = sharedTemplates.value.filter(template => template.id !== item.id);
    pendingDeleteTemplate.value = null; templateMessage.value = '已删除“' + item.name + '”。';
  } catch (err) {
    if (validScope(version, id, token)) templateActionError.value = err.message;
  } finally {
    if (validScope(version, id, token)) templateSaving.value = false;
  }
}

function addGroup() {
  if (form.groups.length < 12) form.groups.push({ name: "", kind: "pace", pace: "", capacity: 0 });
}

function removeGroup(index) {
  form.groups.splice(index, 1);
}

function validateFirst() {
  if (templateMode.value) {
    if (!templateName.value.trim()) return '请填写模板名称';
    if (form.plannedKm !== '' && (!Number.isFinite(Number(form.plannedKm)) || Number(form.plannedKm) < 0.1 || Number(form.plannedKm) > 200)) return '计划距离须在 0.1 到 200 公里之间';
    return validateTiming();
  }
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
  error.value = step.value === 0 ? validateFirst() : validateGroups() || (templateMode.value ? validateTiming() : '');
  if (!error.value) { step.value = Math.min(2, step.value + 1); templateMessage.value = ''; }
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
  const version = loadVersion, id = clubId.value, token = accountToken, key = draftKey.value;
  try {
    const body = {
      ...form,
      startsAt: serializeWhen(form.startsAt), endsAt: serializeWhen(form.endsAt),
      signupUntil: serializeWhen(form.signupUntil), cancelUntil: serializeWhen(form.cancelUntil),
      plannedKm: form.plannedKm === "" ? "" : Number(form.plannedKm),
      groups: form.groups.filter((group) => group.name.trim()).map((group) => ({ ...group, name: group.name.trim(), pace: group.pace.trim(), capacity: Number(group.capacity) || 0 }))
    };
    const data = await api("/clubs/" + id + "/activities", { method: "POST", body: JSON.stringify(body) });
    if (!validScope(version, id, token)) return;
    try { localStorage.removeItem(key); } catch { /* Publishing succeeded; local draft cleanup is best-effort. */ }
    restoreAvailable.value = false;
    await router.replace("/clubs/" + id + "/activities/" + data.activity.id);
  } catch (err) {
    if (validScope(version, id, token)) error.value = err.message;
  } finally {
    if (validScope(version, id, token)) submitting.value = false;
  }
}

watch(step, () => window.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' });
watch(() => form.startsAt, () => {
  if (!settingForm && !templateMode.value && appliedTemplateKey.value.startsWith('saved:')) applyRelativeTiming(form, activeTiming);
}, { flush: 'sync' });
watch(() => [route.params.id, route.query.copy], load);
onMounted(load);
onUnmounted(() => { loadVersion += 1; templatesVersion += 1; });
</script>

<style scoped>
.activity-create { min-height: 100vh; padding-bottom: 110px; color: var(--ink); background: var(--bg); }
.activity-create button { font: inherit; cursor: pointer; }
.activity-create button:disabled { cursor: default; opacity: .5; }
.topbar { position: sticky; z-index: 5; top: 0; display: grid; grid-template-columns: 40px 1fr auto; align-items: center; min-height: 62px; padding: 0 18px; border: 0; background: #f5f5f5f5; backdrop-filter: blur(16px); }
.topbar > a { display: grid; place-items: center; width: 34px; min-height: 44px; color: var(--ink); font-size: 31px; line-height: 1; }
.topbar h1 { margin: 0; font-size: 16px; font-weight: 600; }
.activity-create .draft-action { justify-self: end; min-height: 44px; padding: 0 4px; color: var(--accent); font-size: 12px; font-weight: 600; white-space: nowrap; }
.create-wrap { width: min(100%, 900px); margin: 0 auto; padding: 10px 22px 34px; }
.steps { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin: 0 0 23px; padding: 16px 4px; border-bottom: 1px solid var(--line); }
.steps button { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; min-height: 32px; color: var(--muted); text-align: left; font-size: 13px; white-space: nowrap; }
.steps button+button::before { position: absolute; left: -13px; top: 16px; width: 14px; height: 1px; background: #ebebed; content: ''; }
.steps button.active { color: var(--ink); font-weight: 600; }
.steps i { display: grid; flex: none; place-items: center; width: 25px; height: 25px; border: 1px solid var(--line); border-radius: 50%; color: var(--muted); font-size: 12px; font-style: normal; font-variant-numeric: tabular-nums; }
.steps .active i { border-color: var(--accent); color: #fff; background: var(--accent); box-shadow: 0 3px 8px #e1251b18; }
.steps .complete i { color: var(--accent); background: #fff2f0; border-color: #f5c4bf; }
.club-line { display: flex; align-items: center; gap: 8px; margin: 0 1px 22px; color: var(--ink); font-size: 12px; }
.club-mark { display: grid; flex: none; place-items: center; width: 25px; height: 25px; border-radius: 8px 8px 8px 3px; color: #fff; background: var(--accent); font-weight: 600; }
.club-role { margin-left: auto; color: var(--muted); font-size: 12px; }
.step-heading { margin: 0 0 24px; }
.step-heading > span, .small-kicker { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 1.5px; }
.step-heading > span { display: none; }
.step-heading h2 { margin: 0; color: var(--ink); font-size: 26px; line-height: 1.4; font-weight:600; letter-spacing: -.6px; }
.timezone-note { margin: 7px 0 0; color: var(--muted); font-size: 12px; }
.template-library { overflow: hidden; margin: 0 0 27px; padding: 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--card);  border-color: var(--line);}
.template-library-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.template-library-heading h3 { margin: 5px 0 0; color: var(--ink); font-size: 19px; font-weight: 600; }
.template-library-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.activity-create .text-button { display: inline-flex; align-items: center; justify-content: flex-start; width: auto; min-height: 38px; padding: 0; color: var(--accent); font-size: 12px; font-weight: 550; white-space: nowrap; }
.templates { display: flex; gap: 9px; overflow-x: auto; margin: 19px -20px 17px; padding: 1px 20px 8px; scrollbar-width: thin; scrollbar-color: #e3e3e6 transparent; scroll-snap-type: x proximity; }
.template { position: relative; display: grid; flex: 0 0 126px; min-width: 0; min-height: 119px; gap: 7px; justify-items: start; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--ink); text-align: left; scroll-snap-align: start;  border-color: var(--line);}
.template.selected { border-color: #f5c4bf; background: var(--accent-soft); box-shadow: none; }
.template-icon { display: grid; place-items: center; width: 26px; height: 26px; color: var(--accent); font-size: 20px; font-weight: 700; font-style: italic; }
.template strong { align-self: end; font-size: 14px; font-weight: 600; }
.template small { color: var(--muted); font-size: 12px; }
.template-check { position: absolute; top: 12px; right: 12px; color: var(--accent); font-size: 13px; }
.activity-create .blank-start { display: flex; align-items: center; min-height: 38px; padding: 0; margin: -6px 0 10px; color: var(--muted); font-size: 12px; }
.saved-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0 10px; padding-top: 3px; border-top: 1px solid var(--line); }
.saved-heading > b { color: var(--ink); font-size: 12px; font-weight: 600; }
.saved-heading small { margin-left: 5px; color: var(--muted); font-size: 12px; font-weight: 400; }
.saved-heading .text-button { font-size: 12px; }
.template-hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.template-load-error { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.template-load-error span { flex: 1; }
.template-load-error button { flex: none; min-height: 44px; color: var(--accent); }
.saved-templates { display: flex; gap: 10px; margin: 10px -20px -3px; padding: 0 20px 9px; overflow-x: auto; scrollbar-width: thin; }
.saved-template { flex: 0 0 245px; min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: #fff;  border-color: var(--line);}
.saved-template.selected { border-color: #f5c4bf; }
.saved-template-use { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 7px; width: 100%; padding: 15px 12px; text-align: left; }
.saved-template-mark { grid-row: span 2; color: var(--muted); font-size: 21px; }
.saved-template-use strong { overflow-wrap: anywhere; color: var(--ink); font-size: 13px; font-weight: 600; }
.saved-template-use small { color: var(--muted); font-size: 12px; line-height: 1.7; }
.saved-template-tools { display: flex; align-items: center; gap: 0; padding: 0 10px; border-top: 1px solid var(--line); }
.saved-template-tools button { min-height: 38px; padding: 0 7px; color: var(--muted); font-size: 12px; }
.saved-template-tools button:first-child { margin-right: auto; color: var(--accent); font-weight: 600; }
.form-section-title { display: flex; align-items: center; gap: 8px; margin-bottom: 17px; }
.form-section-title > span { color: var(--muted); font-size: 12px; font-weight: 600; }
.form-section-title h3 { margin: 0; color: var(--ink-secondary); font-size: 16px; font-weight: 600; }
.form-section-title > small { margin-left: auto; color: var(--muted); font-size: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px 16px; padding: 22px; border: 1px solid var(--line); border-radius: 18px; background: #fff;  border-color: var(--line);}
.field { display: flex; position: relative; min-width: 0; flex-direction: column; gap: 9px; color: var(--muted); font-size: 12px; }
.field > span { display: flex; align-items: center; gap: 5px; font-weight: 600; line-height: 1.5;  font-size: 13px; color: var(--ink-secondary);}
.field > span b { color: var(--accent); font-weight: 500; }
.field > span small { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 400; }
.field input, .field select, .field textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 46px; border: 1px solid var(--line); border-radius: 11px; outline: none; padding: 11px 12px; color: var(--ink); background: var(--field-bg); font: inherit; font-size: 14px; }
.field input::placeholder, .field textarea::placeholder { color: var(--muted); }
.field textarea { min-height: 108px; resize: vertical; line-height: 1.8; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px #e1251b0c; }
.field input[type='datetime-local'] { padding: 10px; appearance: none; }
.field > small { margin-top: -2px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.wide { grid-column: 1 / -1; }
.template-tip { display: flex; align-items: center; gap: 9px; margin-top: 14px; padding: 0 3px; color: var(--muted); }
.template-tip > span { color: var(--muted); font-size: 20px; }
.template-tip p { flex: 1; margin: 0; font-size: 12px; line-height: 1.7; }
.template-tip button { flex: none; min-height: 44px; padding: 0 0 0 8px; color: var(--accent); font-size: 12px; }
.reuse-date-row { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--accent-soft);  border-color: #f3d2ce;}
.reuse-date-row > span { display: grid; gap: 5px; flex: 1; }
.reuse-date-row b { color: var(--ink-secondary); font-size: 12px; }
.reuse-date-row small { color: var(--muted); font-size: 12px; line-height: 1.6; }
.reuse-date-row input { min-width: 0; width: 128px; min-height: 44px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); background: #fff; font: inherit; font-size: 12px; }
.group-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0 0 16px; }
.group-heading > div { display: grid; gap: 7px; min-width: 0; }
.group-heading b { color: var(--ink); font-size: 16px; }
.group-heading small { color: var(--muted); font-size: 12px; line-height: 1.7; }
.add-group { flex: none; min-height: 40px; padding: 0 13px; border: 1px solid var(--line); border-radius:12px; color: var(--accent); background: var(--card); font-size: 12px!important; font-weight: 600; white-space: nowrap;  border-color: var(--line);}
.group-list { display: grid; gap: 15px; }
.group-editor { overflow: hidden; padding: 0 20px 20px; border: 1px solid var(--line); border-radius: 18px; background: #fff;  border-color: var(--line);}
.group-card-heading { display: flex; align-items: center; justify-content: space-between; min-height: 56px; margin-bottom: 17px; border-bottom: 1px solid var(--line); }
.group-index { color: var(--accent); font-size: 12px; font-weight: 600; letter-spacing: 1.4px; }
.remove-group { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 0; color: var(--muted); font-size: 12px!important; }
.remove-group span { font-size: 20px; }
.group-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 17px 14px; }
.empty-groups { width: 100%; min-height: 90px; border: 1px dashed var(--line); border-radius: 18px; color: var(--muted); background: #fffafa; font-size: 13px!important; }
.detail-fields { margin-top: 22px; }
.advanced { margin-top: 15px; padding: 0 19px; border: 1px solid var(--line); border-radius: 18px; background: #fff;  border-color: var(--line);}
.advanced summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; color: var(--ink-secondary); font-size: 13px; font-weight: 550; cursor: pointer; list-style: none; }
.advanced summary::-webkit-details-marker { display: none; }
.advanced summary::after { content: '+'; color: var(--muted); font-size: 21px; font-weight: 400; }
.advanced[open] summary::after { content: '−'; }
.advanced summary small { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 400; }
.advanced .form-grid { padding: 6px 0 20px; border: 0; border-radius: 18px;  border-color: var(--line);}
.preview-hero { position: relative; min-height: 220px; padding: 24px; overflow: hidden; border-radius: 18px 18px 0 0; color: var(--ink); background: linear-gradient(120deg,#fff 50%,#fff8f7); border: 1px solid var(--line);}
.preview-hero::after { position: absolute; top: -33px; right: -24px; width: 180px; height: 260px; border: 1px solid #ffe3df; border-radius: 90px; transform: rotate(25deg); box-shadow: 0 0 0 18px #fff2f080,0 0 0 36px #fff2f04d; content: ''; }
.preview-type { color: var(--accent); font-size: 12px; font-weight: 600; }
.preview-hero h3 { position: relative; z-index: 1; max-width: 85%; margin: 14px 0 12px; overflow-wrap: anywhere; font-size: 25px; line-height: 1.4; }
.preview-km { display: flex; align-items: baseline; gap: 7px; }
.preview-km strong { color: var(--accent); font-size: 52px; line-height: 1; font-weight: 600; }
.preview-km span { color: var(--muted); font-size: 12px; }
.preview-hero p { position: relative; z-index: 1; margin: 16px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.preview-facts { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin: 0 0 17px; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 18px 18px; background: #fff; }
.preview-facts > div { display: grid; min-width: 0; gap: 7px; padding: 17px 14px; border-right: 1px solid var(--line); }
.preview-facts > div:last-child { border: 0; }
.preview-facts small { color: var(--muted); font-size: 12px; }
.preview-facts b { overflow-wrap: anywhere; color: var(--ink-secondary); font-size: 12px; line-height: 1.8; font-weight: 550; }
.preview-groups { margin-top: 22px; }
.preview-groups h4 { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
.preview-group { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 16px; border-bottom: 1px solid var(--line); background: #fff; }
.preview-group b { color: var(--ink); font-size: 13px; }
.preview-group span, .preview-group small { overflow-wrap: anywhere; color: var(--muted); font-size: 12px; }
.preview-copy { display: grid; gap: 8px; margin: 18px 0 0; padding: 18px; border: 1px solid var(--line); border-radius: 17px; color: var(--muted); background: #fff; white-space: pre-wrap; font-size: 13px; line-height: 1.85; }
.preview-copy b { color: var(--ink-secondary); font-size: 13px; }
.review-check { display: flex; align-items: center; gap: 9px; margin-top: 20px; color: var(--muted); font-size: 12px; line-height: 1.8; }
.review-check input { flex: none; width: 17px; height: 17px; accent-color: var(--accent); }
.actions { position: fixed; z-index: 6; right: max(0px,calc((100vw - 430px)/2)); bottom: 0; left: max(0px,calc((100vw - 430px)/2)); display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 13px 22px calc(13px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: #ffffffee; backdrop-filter: blur(16px); }
.draft-status { min-width: 0; max-width: 52%; color: var(--muted); font-size: 12px; line-height: 1.7; }
.activity-create .primary, .activity-create .outline { display: inline-flex; align-items: center; justify-content: center; gap: 17px; width: auto; min-width: 104px; min-height: 46px; padding: 10px 21px; border-radius:12px; font-size: 13px; font-weight: 600; line-height: 1.5;  color: var(--ink-secondary); border-color: var(--line);}
.activity-create .primary { margin-left: auto; color: #fff; background: var(--accent); border: 1px solid transparent; }
.primary span { font-size: 19px; font-weight: 400; }
.activity-create .outline { border: 1px solid var(--line); color: var(--ink-secondary); background: #fff;  border-color: var(--line);}
.activity-create .publish { min-width: 170px; }
.form-error { margin: 15px 0; color: var(--accent); font-size: 12px; line-height: 1.8; }
.state { padding: 40px 0; color: var(--muted); text-align: center; font-size: 13px; }
.error-state { color: var(--muted); }
.error-state .outline { margin: 10px auto; }
.restore-toast { position: fixed; z-index: 8; right: max(16px,calc((100vw - 860px)/2)); bottom: calc(86px + env(safe-area-inset-bottom)); left: max(16px,calc((100vw - 860px)/2)); display: flex; align-items: center; gap: 13px; min-height: 58px; padding: 10px 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); box-shadow: 0 8px 24px #0000000a; font-size: 12px;  border-color: var(--line);}
.restore-toast span { flex: 1; min-width: 0; color: var(--muted); line-height: 1.7; }
.restore-toast button { flex: none; min-height: 38px; color: var(--accent); font-size: 12px; font-weight: 600; }
.editing-banner { display: flex; align-items: center; gap: 12px; margin-bottom: 23px; padding: 16px; border: 1px solid var(--line); border-radius: 17px; background: #fff2f0; }
.editing-symbol { font-size: 26px; color: var(--muted); }
.editing-banner b { color: var(--muted); font-size: 13px; font-weight: 600; }
.editing-banner p { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.template-editor-name { display: grid; grid-template-columns: minmax(0,1fr) 140px; gap: 15px; margin-bottom: 24px; padding: 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--accent-soft);  border-color: #f3d2ce;}
.template-editor-name > .small-kicker { grid-column: 1/-1; }
.template-message { margin-bottom: 20px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 13px; background: #fafafa; color: var(--muted); font-size: 12px; line-height: 1.8; }
.template-modal { position: fixed; z-index: 50; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 16px; background: #00000066; backdrop-filter: blur(3px); }
.template-sheet { position: relative; width: min(470px,100%); max-height: 85dvh; overflow-y: auto; padding: 30px 24px 24px; border-radius: 18px; background: var(--card); }
.sheet-close { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 38px; min-height: 38px; color: var(--muted); font-size: 25px!important; }
.template-sheet h2 { margin: 12px 0; color: var(--ink); font-size: 22px; line-height: 1.5; }
.template-sheet > p { margin: 0 0 24px; color: var(--muted); font-size: 12px; line-height: 1.9; }
.template-sheet .form-error { margin: 12px 0; color: var(--accent); }
.activity-create .sheet-submit { width: 100%; margin-top: 22px; }
.sheet-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; }
.activity-create :is(button,a,input,textarea,select,summary):focus-visible { outline: 2px solid #e1251b; outline-offset: 3px; }
@media (max-width: 620px) {
  .create-wrap { padding: 8px 16px 30px; }
  .steps { gap: 8px; padding: 13px 0 17px; margin-bottom: 21px; }
  .steps button { gap: 6px; font-size: 12px; }
  .steps i { width: 22px; height: 22px; }
  .steps button+button::before { left: -8px; width: 9px; }
  .step-heading h2 { font-size: 26px; }
  .template-library { padding: 17px;  border-radius: 18px; border-color: var(--line);}
  .template-library-heading h3 { font-size: 18px;  color: var(--ink);}
  .template-library-heading { align-items: flex-start; }
  .template-library-heading .text-button { align-self: center; }
  .templates { margin-right: -17px; margin-left: -17px; padding-right: 17px; padding-left: 17px; }
  .template { flex-basis: 112px; min-height: 116px; padding: 12px;  border-radius: 12px; background: var(--card); color: var(--ink); border-color: var(--line);}
  .saved-templates { margin-right: -17px; margin-left: -17px; padding-right: 17px; padding-left: 17px; }
  .saved-template { flex-basis: 237px;  border-color: var(--line); border-radius: 12px;}
  .form-grid { grid-template-columns: minmax(0,1fr); gap: 20px; padding: 20px 17px;  border-radius: 18px; border-color: var(--line);}
  .wide { grid-column: auto; }
  .group-editor { padding: 0 17px 19px;  border-color: var(--line); border-radius: 18px;}
  .group-fields { gap: 16px 11px; }
  .group-heading { gap: 8px; }
  .group-heading small { max-width: 180px; }
  .add-group { padding: 0 10px;  color: var(--accent); background: var(--card); border-color: var(--line);}
  .preview-facts { grid-template-columns: 1fr; }
  .preview-facts > div { grid-template-columns: 76px minmax(0,1fr); align-items: baseline; border-right: 0; border-bottom: 1px solid var(--line); }
  .preview-facts > div:last-child { border-bottom: 0; }
  .preview-group { grid-template-columns: 1fr 1fr; }
  .preview-group small { grid-column: 2; }
  .preview-group span { grid-column: 1; grid-row: 2; }
  .actions { padding-right: 16px; padding-left: 16px; }
  .activity-create .publish { min-width: 0; padding-right: 18px; padding-left: 18px; }
  .template-editor-name { grid-template-columns: 1fr; padding: 18px;  border-radius: 18px; background: var(--accent-soft); border-color: #f3d2ce;}
  .template-sheet { padding: 29px 20px 22px;  border-radius: 18px; background: var(--card);}
  .template-sheet h2 { font-size: 21px;  color: var(--ink);}
  .reuse-date-row { flex-wrap: wrap;  border-color: #f3d2ce; background: var(--accent-soft); border-radius: 12px;}
  .reuse-date-row input { width: 100%; }
}
@media (max-width: 350px) {
  .create-wrap { padding-right: 12px; padding-left: 12px; }
  .topbar { padding-right: 12px; padding-left: 12px; }
  .step-heading h2 { font-size: 26px; }
  .template-library-heading .text-button { font-size: 12px; }
  .small-kicker { letter-spacing: 1px; }
  .group-heading { align-items: flex-start; }
  .group-heading small { max-width: 145px; }
  .group-fields { grid-template-columns: 1fr; }
  .group-heading .add-group { min-height: 36px;  color: var(--accent); background: var(--card); border-color: var(--line);}
  .draft-status { max-width: 46%; }
  .actions { gap: 8px; padding-right: 12px; padding-left: 12px; }
  .activity-create .primary, .activity-create .outline { min-width: 87px; padding-right: 16px; padding-left: 16px; }
  .activity-create .sheet-actions .primary, .activity-create .sheet-actions .outline { flex: 1; min-width: 0; }
}


/* Each reusable training frame has its own light colour, never a new action colour. */
.activity-create { background:transparent; }
.activity-create .topbar { background:#fffaf6dd;backdrop-filter:blur(16px); }
.steps { border-color:#e3e5ee; }.steps i { background:#eaf0f9;color:#526b91; }.steps .active i { background:var(--accent);color:#fff; }.steps .complete i { background:#dff3e9;color:#27795d; }
.club-line { background:#ffffff91;border-color:#ffffffb5;border-radius:12px; }
.step-heading { padding:18px 20px;background:linear-gradient(115deg,#fff7ef,#fff);border:1px solid #f0dfcc;border-radius:18px;margin-bottom:22px; }
.template:nth-child(3n+1) { background:#fff;border-color:#d5eade; }.template:nth-child(3n+2) { background:#fff;border-color:#d4e4f6; }.template:nth-child(3n) { background:#fff;border-color:#e1d5f4; }
.template.selected { border-color:var(--accent);box-shadow:0 0 0 1px #e1251b; }.template-icon { background:#eaf7ef;color:#32795f; }.template:nth-child(3n+2) .template-icon { background:#eaf4ff;color:#3f78a5; }.template:nth-child(3n) .template-icon { background:#f2edff;color:#7854ac; }
.saved-template { background:#fff;border-color:#ede2d2; }.saved-template-mark { background:var(--sun-soft,#fff4d7);color:#9a7028; }
.editing-banner { background:var(--lilac-soft,#f2edff);border-color:#dfd5ef; }.group-card-heading { background:#fff;border-bottom-color:#e0ebe7; }.group-index { background:#fff;color:#367b6a; }
.advanced { background:#f2f7fc;border-color:#dfe8f1; }.preview-hero { background:linear-gradient(125deg,#fff2e5,#fff);border-color:#f0d8c7; }
.preview-facts { background:#fff; }.template-tip { background:var(--sun-soft,#fff4d7);border-color:#eedfb8; }
@media(max-width:350px) { .step-heading { padding:16px; }.step-heading h2 { font-size:24px; }.group-card-heading { gap:8px; }.template-library-heading { gap:10px; } }
</style>
