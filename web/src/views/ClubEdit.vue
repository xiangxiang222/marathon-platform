<template>
  <main class="club-form-page service-page club-edit-page">
    <header class="topbar"><router-link :to="backPath" aria-label="取消编辑跑团资料">‹</router-link><h1>编辑跑团资料</h1><span></span></header>
    <div class="club-form-wrap"><h2 class="club-form-title">让跑友更了解你们</h2><p class="club-form-lead">修改名称、活动城市、简介和 Logo，保存后更新跑团名片。</p>
      <div v-if="!token" class="club-form-panel"><h2>登录后管理跑团资料</h2><p class="club-form-hint">仅团长可以编辑。请登录具有管理权限的账号。</p><button class="club-form-primary" type="button" @click="login">登录并继续</button></div>
      <div v-else-if="loading" class="club-form-panel" role="status">正在读取跑团资料…</div>
      <div v-else-if="!owner" class="club-form-panel"><h2>{{ denied ? '仅团长可以编辑跑团资料' : '暂时无法读取跑团资料' }}</h2><p class="club-form-hint" role="alert">{{ error }}</p><button v-if="!denied" class="club-form-secondary" type="button" @click="load">重新加载</button><router-link class="club-form-link" :to="backPath">返回跑团 ›</router-link></div>
      <form v-else class="club-form-panel" @submit.prevent="save">
        <ClubLogoPicker :key="token" v-model="logo" :name="name" :disabled="saving" @busy="logoBusy = $event" />
        <label><span>跑团名称 <small>必填 · {{ name.length }}/20</small></span><input v-model="name" aria-label="跑团名称" required maxlength="20" :disabled="saving" /></label>
        <label><span>活动城市 <small>必填 · 最多 30 字</small></span><input v-model="city" aria-label="活动城市" required maxlength="30" :disabled="saving" /></label>
        <label><span>一句话介绍 <small>选填 · {{ intro.length }}/80</small></span><textarea v-model="intro" aria-label="一句话介绍" maxlength="80" rows="3" :disabled="saving" /></label>
        <p class="club-form-hint">名称可以重复，团号和邀请链接保持不变。已核验的跑团更改名称或城市后，平台会重新核验组织资料。</p>
        <p v-if="error" class="club-form-error" role="alert">{{ error }}</p>
        <div class="edit-actions"><router-link class="club-form-secondary" :to="backPath">取消</router-link><button class="club-form-primary" type="submit" :disabled="saving || logoBusy">{{ saving ? '正在保存…' : '保存资料' }}</button></div>
      </form>
    </div>
  </main>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClubSession } from '../useClubSession';
import ClubLogoPicker from '../components/ClubLogoPicker.vue';
import '../club-forms.css';
const route = useRoute(), router = useRouter();
const name = ref(''), city = ref(''), intro = ref(''), logo = ref(''), logoBusy = ref(false), owner = ref(false), loading = ref(false), saving = ref(false), denied = ref(false), error = ref('');
const backPath = computed(() => '/clubs/' + encodeURIComponent(route.params.id) + '?tab=people&view=manage');
let loadVersion = 0;
function reset() { loadVersion++; name.value = ''; city.value = ''; intro.value = ''; logo.value = ''; logoBusy.value = false; owner.value = false; loading.value = false; saving.value = false; denied.value = false; error.value = ''; }
const { token, request, capture, current } = useClubSession(reset, () => String(route.params.id));
function login() { localStorage.setItem('marathon_return_after_login', route.path); router.push('/mine'); }
async function load() {
  if (!token.value) return;
  const stamp = capture(), version = ++loadVersion;
  if (!current(stamp)) return;
  owner.value = false; loading.value = true; error.value = ''; denied.value = false;
  try {
    const data = await request('/clubs/' + encodeURIComponent(route.params.id));
    if (!current(stamp) || version !== loadVersion) return;
    if (data.club?.owner !== true) { denied.value = true; error.value = '当前账号不是这个跑团的团长。'; return; }
    owner.value = true; name.value = data.club.name || ''; city.value = data.club.city || ''; intro.value = data.club.intro || ''; logo.value = data.club.logo || '';
  } catch (err) { if (!err.stale && current(stamp) && version === loadVersion) { error.value = err.message; denied.value = err.status === 403; } }
  finally { if (current(stamp) && version === loadVersion) loading.value = false; }
}
async function save() {
  const stamp = capture();
  if (!current(stamp) || !token.value || !owner.value || loading.value || saving.value || logoBusy.value) return;
  const payload = { name:name.value.trim(), city:city.value.trim(), intro:intro.value.trim(), logo:logo.value };
  if (!payload.name || !payload.city) { error.value = '请填写跑团名称和活动城市。'; return; }
  saving.value = true; error.value = '';
  try { await request('/clubs/' + encodeURIComponent(route.params.id), { method:'PUT', body:JSON.stringify(payload) }); if (current(stamp)) await router.replace(backPath.value); }
  catch (err) { if (!err.stale && current(stamp)) { error.value = err.message; if (err.status === 403) { owner.value = false; denied.value = true; } } }
  finally { if (current(stamp)) saving.value = false; }
}
watch(() => [token.value, route.params.id], load, { immediate:true });
</script>
<style scoped>
.club-edit-page { color:var(--ink); background:var(--bg); }.club-form-title { font-size:24px; font-weight:600; }.edit-actions { display:grid; grid-template-columns:1fr 2fr; gap:12px; margin-top:24px; }.edit-actions .club-form-primary,.edit-actions .club-form-secondary { display:flex; align-items:center; justify-content:center; width:100%; min-height:44px; margin:0; padding:12px; font-size:14px; border-radius:8px; }
</style>
<style scoped src="../service-ui.css"></style>
