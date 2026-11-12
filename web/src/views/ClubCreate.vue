<template>
  <main class="club-form-page service-page">
    <header class="topbar"><router-link to="/clubs" aria-label="返回跑团">‹</router-link><h1>创建跑团</h1><span></span></header>
    <div class="club-form-wrap"><p class="club-form-eyebrow">和志同道合的人一起跑</p><h2 class="club-form-title">填写跑团资料</h2><p class="club-form-lead">填写名称和活动城市，创建后即可邀请跑友。团名可以重复，请核对城市、负责人和团号。</p>
      <div v-if="!token" class="club-form-panel"><h2>和跑友的下一程，从这里开始</h2><p class="club-form-hint">登录后即可创建，无需申请建团资格。</p><button class="club-form-primary" type="button" @click="login">登录并创建</button></div>
      <div v-else class="club-form-grid with-preview">
        <form class="club-form-panel" @submit.prevent="create">
          <p v-if="application" class="club-form-note">你之前申请的「{{ application.name }}」可以直接创建。确认名称与城市后，点击下方按钮即可继续。</p>
          <ClubLogoPicker :key="token" v-model="logo" :name="name" :disabled="saving" @busy="logoBusy = $event" />
          <label><span>跑团名称 <small>必填 · {{ name.length }}/20</small></span><input v-model="name" aria-label="跑团名称" required maxlength="20" placeholder="给一起跑步的人，一个名字" :disabled="saving" autocomplete="off" /></label>
          <div v-if="name.trim() && (matches.length || matchLoading || matchError)" class="same-name" aria-live="polite"><p v-if="matchLoading">正在看看有没有熟悉的跑团…</p><p v-else-if="matchError">暂时无法检查同名，你仍可创建。</p><template v-else><strong>找到 {{ matches.length }} 个名称相近的跑团</strong><p>名称可以重复，看看是否已有你要找的跑团。</p><div v-for="club in matches" :key="club.id" class="same-name-row"><router-link :to="'/clubs/' + club.id + '/public'" target="_blank" rel="noopener noreferrer"><b>{{ club.name }}</b><small>{{ club.city || '城市待补充' }} · 负责人 {{ club.leader || '待补充' }} · #{{ club.id }}</small></router-link><ClubVerificationBadge :club="club" /></div></template></div>
          <label><span>活动城市 <small>必填</small></span><input v-model="city" aria-label="活动城市" required maxlength="30" placeholder="如：杭州 · 西湖，或跨城／线上" :disabled="saving" autocomplete="address-level2" /><small>让跑友更容易找到你们；城市与名称都不需要抢占。</small></label>
          <label><span>一句话介绍 <small>选填 · {{ intro.length }}/80</small></span><textarea v-model="intro" aria-label="一句话介绍" maxlength="80" rows="3" placeholder="比如：每周三晚，一起绕湖慢跑" :disabled="saving" /></label>
          <p class="club-form-hint">创建后即可邀请跑友，入团申请由你审核。每个账号 24 小时内可创建 1 个，同时最多担任 3 个跑团的团长。</p>
          <p v-if="error" class="club-form-error" role="alert">{{ error }}</p>
          <button class="club-form-primary" type="submit" :disabled="saving || logoBusy">{{ saving ? '正在创建…' : application ? '确认并继续创建' : '创建跑团' }} <span aria-hidden="true">→</span></button>
          <p class="club-form-hint">组织身份核验是可选项，创建后即可使用基础功能。</p>
        </form>
        <aside class="create-preview"><div class="preview-caption">你的跑团名片 <span>实时预览</span></div><div class="preview-card"><div class="preview-track" aria-hidden="true"></div><p class="club-form-eyebrow">每一次出发，都有人同行</p><ClubLogo class="preview-letter" :src="logo" :name="name" /><h3>{{ name.trim() || '你的跑团名称' }}</h3><p>{{ city.trim() || '活动城市' }}</p><p class="preview-intro">{{ intro.trim() || '每一次出发，都有人同行。' }}</p><footer><span>公开负责人<br><b>{{ nickname || '你' }}</b></span><span>公开团号<br><b>创建后自动生成</b></span></footer></div><p class="club-form-hint">团号和邀请链接始终指向你的跑团。<br>同名组织可以独立创建，也可以分别核验管理关系。</p></aside>
      </div>
    </div>
  </main>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useClubSession } from '../useClubSession';
import ClubLogo from '../components/ClubLogo.vue';
import ClubLogoPicker from '../components/ClubLogoPicker.vue';
import ClubVerificationBadge from '../components/ClubVerificationBadge.vue';
import '../club-forms.css';
const router = useRouter();
const logo = ref(''), logoBusy = ref(false);
const name = ref(''), city = ref(''), intro = ref(''), nickname = ref(''), application = ref(null), error = ref(''), saving = ref(false), matches = ref([]), matchLoading = ref(false), matchError = ref(false);
let matchVersion = 0, timer, requestId = '', requestBody = '';
function reset() { logo.value = ''; logoBusy.value = false; name.value = ''; city.value = ''; intro.value = ''; nickname.value = ''; application.value = null; error.value = ''; saving.value = false; matches.value = []; matchLoading.value = false; matchError.value = false; matchVersion++; clearTimeout(timer); requestId = ''; requestBody = ''; }
const { token, request, capture, current } = useClubSession(reset);
function login() { localStorage.setItem('marathon_return_after_login', '/clubs/new'); router.push('/mine'); }
async function loadMe() { if (!token.value) return; try { const data = await request('/me'); nickname.value = data.user?.nickname || ''; application.value = data.applications?.find(item => item.status === 'pending' || !item.status) || null; if (application.value && !name.value) name.value = application.value.name; } catch (err) { if (!err.stale) error.value = err.message; } }
async function suggestions() { const version = ++matchVersion; matches.value = []; matchError.value = false; if (!name.value.trim()) { matchLoading.value = false; return; } matchLoading.value = true; try { const data = await request('/clubs/directory?' + new URLSearchParams({ q: name.value.trim(), pageSize: '3' })); if (version === matchVersion) matches.value = data.clubs || []; } catch (err) { if (!err.stale && version === matchVersion) matchError.value = true; } finally { if (version === matchVersion) matchLoading.value = false; } }
async function create() { if (saving.value || logoBusy.value || !token.value) return; const stamp = capture(); if (!current(stamp)) return; const payload = { name: name.value.trim(), city: city.value.trim(), intro: intro.value.trim(), ...(logo.value ? { logo: logo.value } : {}), ...(application.value ? { applicationId: application.value.id } : {}) }; if (!payload.name || !payload.city) { error.value = '请填写跑团名称和活动城市。'; return; } const body = JSON.stringify(payload); if (body !== requestBody) { requestBody = body; requestId = globalThis.crypto?.randomUUID?.() || `club-${Date.now()}-${Math.random().toString(36).slice(2)}`; } saving.value = true; error.value = ''; try { const data = await request('/clubs', { method: 'POST', body: JSON.stringify({ ...payload, requestId }) }); if (current(stamp)) await router.push('/clubs/' + data.club.id + '?created=1'); } catch (err) { if (!err.stale && current(stamp)) error.value = err.message; } finally { if (current(stamp)) saving.value = false; } }
watch(name, () => { clearTimeout(timer); matchVersion++; matches.value = []; matchLoading.value = false; matchError.value = false; timer = setTimeout(suggestions, 300); });
watch(token, loadMe, { immediate: true }); onBeforeUnmount(() => clearTimeout(timer));
</script>
<style scoped>
.create-title-break{display:none}@media(max-width:500px){.create-title-break{display:block}}
.same-name{padding:14px;border:1px solid var(--line);border-radius:11px;margin:-5px 0 22px;background:var(--card);color:var(--muted);font-size:12px;line-height:1.8}.same-name p{font-size:12px;margin:6px 0}.same-name-row{display:flex;align-items:center;justify-content:space-between;gap:5px;border-top:1px solid var(--line);padding:9px 0}.same-name-row>a{min-width:0;overflow-wrap:anywhere}.same-name-row b{display:block;font-size:12px;font-weight:500}.same-name-row small{display:block;color:var(--muted);font-size:12px;line-height:1.8}.create-preview{min-width:0}.preview-caption{display:flex;justify-content:space-between;margin:2px 4px 12px;font-size:12px;color:var(--muted)}.preview-caption span{font-size:12px}.preview-card{position:relative;overflow:hidden;padding:25px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.preview-track{position:absolute;right:-110px;top:15px;width:250px;height:250px;border:22px double var(--line);border-radius:50%;pointer-events:none}.preview-card>*:not(.preview-track){position:relative}.preview-letter{display:grid;place-items:center;width:55px;height:55px;border:1px solid var(--line);border-radius:12px;background:white;color:var(--accent);font-size:24px;margin:24px 0 16px}.preview-card h3{margin:0;font-size:24px;line-height:1.5;overflow-wrap:anywhere}.preview-card>p:not(.club-form-eyebrow){font-size:12px;color:var(--muted);line-height:1.9;overflow-wrap:anywhere}.preview-intro{margin:22px 0}.preview-card footer{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);margin-top:28px;padding-top:18px;font-size:12px;color:var(--muted);line-height:1.9}.preview-card footer b{font-weight:500;color:var(--muted)}
.club-form-panel { border-color:var(--line); border-radius:12px; }
.club-form-title { max-width:22em; font-size:24px; line-height:1.4; }
.club-form-panel h2 { font-size:20px; }


.club-form-page { background:transparent; }.club-form-page>.topbar { background:transparent; }.club-form-eyebrow { color:var(--accent); }.club-form-panel { background:var(--card);border-color:var(--line);box-shadow:none; }.preview-card { background:var(--card);border-color:var(--line); }.preview-track { border-color:var(--line); }.same-name { background:var(--field-bg);border-color:var(--line); }

/* Shared typography and controls for club services. */

.club-form-page { color:var(--ink); background:var(--bg); }
.club-form-title { font-size:24px; font-weight:600; letter-spacing:normal; }
.club-form-eyebrow { color:var(--muted); font-size:12px; letter-spacing:normal; }
.club-form-panel,.preview-card { border:1px solid var(--line); border-radius:12px; background:var(--card); box-shadow:none; }
.club-form-panel h2 { font-size:18px; font-weight:600; }
.club-form-note,.club-private-tag,.same-name { border-color:var(--line); background:var(--field-bg); color:var(--muted); }
.preview-track { display:none; }
.preview-card h3 { font-size:22px; font-weight:600; }

</style>

<style scoped src="../service-ui.css"></style>
