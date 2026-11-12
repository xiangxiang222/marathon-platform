<template>
  <main class="club-form-page"><header class="topbar"><router-link :to="'/clubs/' + route.params.id" aria-label="返回跑团">‹</router-link><h1>跑团身份</h1><span></span></header>
    <div class="club-form-wrap"><p class="club-form-eyebrow">公开资料与组织关系</p><h2 class="club-form-title">让跑友，认得出你们。</h2><p class="club-form-lead">核对的是组织与页面之间的管理授权关系。<br>核验可选，成员、约跑与团内记录照常使用。</p>
      <div v-if="!token" class="club-form-panel"><p class="club-form-hint">请使用该跑团团长的账号登录后继续。</p><button class="club-form-primary" type="button" @click="login">登录</button></div>
      <p v-else-if="loading" class="club-form-hint" role="status">正在读取跑团身份资料…</p>
      <p v-if="error" class="club-form-error" role="alert">{{ error }}<button v-if="!club && token" type="button" @click="load">重新加载</button></p>
      <template v-if="club">
        <section class="club-form-panel"><p class="club-private-tag">仅团长和平台处理人员可见申请材料</p><h2>{{ club.name }} <ClubVerificationBadge :club="club" /></h2><p class="club-form-hint">{{ club.city || '城市待补充' }} · 负责人 {{ club.leader || '你' }} · 团号 #{{ club.id }}</p>
          <div v-if="moderation" class="club-form-note"><strong>公开展示与复核说明</strong><p>{{ typeof moderation === 'string' ? moderation : moderation.note || moderation.reason }}</p><router-link class="club-form-link" :to="'/clubs/' + club.id + '/report?type=management'">补充说明或申请复核 →</router-link></div>
          <div v-if="verification" class="club-record"><span class="club-record-status">{{ identityStatuses[verification.status] || verification.status }}</span><p>申请 #{{ verification.id }} · {{ identityDate(verification.createdAt) }} 提交</p><p v-if="verification.note">平台回复：{{ verification.note }}</p><p v-if="verification.reviewedAt">最近处理：{{ identityDate(verification.reviewedAt) }}</p></div>
          <p v-if="verification?.status === 'approved' || verification?.status === 'verified'" class="club-form-hint">修改组织名称、授权范围或管理关系后需要重新核验。重新提交期间，原有核验标记会暂停展示。</p>
        </section>
        <form class="club-form-panel identity-application" @submit.prevent="saveProfile"><h2>公开名片资料</h2><p class="club-form-hint">城市与简介公开展示；旧团可以在这里补充城市。名称允许重复，实质更名或更改城市会重新核对原有组织身份。</p><label><span>跑团名称</span><input v-model="profile.name" aria-label="跑团名称" required maxlength="20" :disabled="profileSaving" /></label><label><span>活动城市</span><input v-model="profile.city" aria-label="活动城市" required maxlength="30" :disabled="profileSaving" placeholder="如：杭州 · 西湖，或跨城／线上" /></label><label><span>一句话介绍 <small>选填 · 80 字内</small></span><textarea v-model="profile.intro" maxlength="80" rows="3" :disabled="profileSaving" /></label><p v-if="profileNotice" class="club-form-success" role="status">{{ profileNotice }}</p><button class="club-form-secondary" type="submit" :disabled="profileSaving || saving">{{ profileSaving ? '正在保存…' : '保存公开资料' }}</button></form>
        <form class="club-form-panel identity-application" @submit.prevent="submit"><h2>{{ verification ? '补充或更新核验材料' : '申请组织身份核验' }}</h2><p class="club-form-note">支持民间跑团，无需默认上传完整身份证件。可提供既有公共渠道的控制证明、授权说明，或可交叉核对的组织活动记录。</p>
          <label><span>组织名称 <small>必填</small></span><input v-model="form.organization" aria-label="组织名称" maxlength="80" required :disabled="saving" placeholder="真实组织或分团的名称" /></label>
          <label><span>组织授权范围 <small>必填</small></span><input v-model="form.scope" aria-label="组织授权范围" maxlength="80" required :disabled="saving" placeholder="如：杭州西湖分团，不代表全国总团" /></label>
          <label><span>既有公共渠道链接 <small>选填</small></span><input v-model="form.sourceUrl" aria-label="既有公共渠道链接" type="url" maxlength="1000" :disabled="saving" placeholder="公众号文章、网站或赛事组织页面" /></label>
          <label><span>管理授权与可核对材料 <small>与公共链接至少填写一项</small></span><textarea v-model="form.evidence" aria-label="管理授权与可核对材料" maxlength="4000" rows="6" :disabled="saving" placeholder="说明你与组织的关系、公开渠道如何确认本团号，以及可交叉核对的组织活动记录。请仅提交必要信息，勿粘贴完整证件号码。" /></label>
          <label><span>私密联系方式 <small>仅处理人员可见</small></span><input v-model="form.contact" aria-label="私密联系方式" maxlength="200" required :disabled="saving" placeholder="供核对管理授权的联系方式" /></label>
          <p v-if="notice" class="club-form-success" role="status">{{ notice }}</p><p class="club-form-hint">材料不公开，不参与共创建议投票。仅凭同名、人数或一张群截图，无法确认管理授权。结案原始材料按平台处理规则清理。</p><button class="club-form-primary" type="submit" :disabled="saving">{{ saving ? '正在提交…' : verification ? '提交补充或更新' : '提交核验申请' }}</button>
        </form>
      </template>
    </div>
  </main>
</template>
<script setup>
import { reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClubSession } from '../useClubSession';
import { identityDate, identityStatuses } from '../club-identity';
import ClubVerificationBadge from '../components/ClubVerificationBadge.vue';
import '../club-forms.css';
const route = useRoute(), router = useRouter();
const club = ref(null), verification = ref(null), moderation = ref(null), loading = ref(false), saving = ref(false), error = ref(''), notice = ref('');
const blank = () => ({ organization: '', scope: '', sourceUrl: '', evidence: '', contact: '' });
const form = reactive(blank());
const profile = reactive({ name: '', city: '', intro: '' }), profileSaving = ref(false), profileNotice = ref('');
function reset() { club.value = null; verification.value = null; moderation.value = null; Object.assign(form, blank()); Object.assign(profile, { name: '', city: '', intro: '' }); profileSaving.value = false; profileNotice.value = ''; error.value = ''; notice.value = ''; saving.value = false; loading.value = false; }
const { token, capture, current, request } = useClubSession(reset, () => route.params.id);
function login() { localStorage.setItem('marathon_return_after_login', '/clubs/' + route.params.id + '/identity'); router.push('/mine'); }
function apply(data) { club.value = data.club; verification.value = data.verification || null; moderation.value = data.moderationNote || null; Object.assign(profile, { name: data.club?.name || '', city: data.club?.city || '', intro: data.club?.intro || '' }); Object.assign(form, blank(), data.verification ? Object.fromEntries(Object.keys(blank()).map(key => [key, data.verification[key] || ''])) : { organization: data.club?.name || '', scope: data.club?.city || '' }); }
async function load() { reset(); if (!token.value) return; const stamp = capture(); loading.value = true; try { apply(await request('/clubs/' + route.params.id + '/identity')); } catch (err) { if (!err.stale) error.value = err.message; } finally { if (current(stamp)) loading.value = false; } }
async function submit() { if (!club.value || saving.value || profileSaving.value) return; const stamp = capture(); if (!current(stamp)) return; if (!form.sourceUrl.trim() && !form.evidence.trim()) { error.value = "请提供公共渠道链接或可核对的管理授权说明，至少填写一项。"; return; } saving.value = true; error.value = ''; notice.value = ''; try { await request('/clubs/' + route.params.id + '/identity', { method: 'POST', body: JSON.stringify(form) }); if (!current(stamp)) return; apply(await request('/clubs/' + route.params.id + '/identity')); notice.value = '材料已私密提交。你可以在本页查看进度并补充说明。'; } catch (err) { if (!err.stale && current(stamp)) error.value = err.message; } finally { if (current(stamp)) saving.value = false; } }
async function saveProfile() { if (!club.value || profileSaving.value || saving.value) return; const stamp = capture(); if (!current(stamp)) return; profileSaving.value = true; error.value = ''; profileNotice.value = ''; try { await request('/clubs/' + route.params.id + '/profile', { method: 'PUT', body: JSON.stringify(profile) }); if (!current(stamp)) return; const result = await request('/clubs/' + route.params.id + '/identity'); club.value = result.club; verification.value = result.verification || null; profileNotice.value = '公开名片资料已更新。'; } catch (err) { if (!err.stale && current(stamp)) error.value = err.message; } finally { if (current(stamp)) profileSaving.value = false; } }
watch(() => [token.value, route.params.id], load, { immediate: true });
</script>
<style scoped>.identity-application{margin-top:20px}.identity-application .club-form-note{margin-bottom:22px}.club-record p{margin:8px 0}.club-form-panel h2{overflow-wrap:anywhere}.club-form-panel h2 :deep(.identity-badge){vertical-align:middle}.club-form-panel { border-color:var(--line); border-radius:16px; }
.club-form-panel h2 { font-size:20px; line-height:1.5; }
.club-form-title { font-size:24px; }


.club-form-page { background:transparent; }.club-form-page>.topbar { background:transparent; }.club-form-eyebrow { color:var(--muted); }.club-form-panel { background:var(--card);border-color:var(--line);box-shadow:none; }.club-private-tag { background:var(--sky-soft,var(--field-bg));color:var(--muted);border-color:var(--line); }.club-form-note { background:var(--sun-soft,var(--field-bg));border-color:var(--line); }

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
