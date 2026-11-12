<template>
  <main class="activity-page service-page service-session">
    <header class="activity-nav">
      <router-link :to="'/clubs/' + clubId" aria-label="返回跑团">‹</router-link>
      <div><small>{{ clubName || '跑团活动' }}</small><h1>训练详情</h1></div>
      <button class="activity-share" type="button" title="分享活动" @click="share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4M13 4h7v7M10 14 20 4"/></svg><span>分享</span></button>
    </header>

    <p v-if="loading" class="state">正在加载活动…</p>
    <section v-else-if="activity" class="activity-content">
      <section class="event-hero">
        <div class="hero-meta"><span>{{ typeLabel }}</span><span class="status">{{ activity.statusLabel }}</span></div>
        <h2>{{ activity.title }}</h2>
        <div class="session-appointment"><span class="appointment-label">活动时间</span><p>{{ activity.dateLabel }} <b>{{ activity.clockLabel }}</b></p><span class="appointment-label">集合地点</span><p>{{ activity.gatherPlace || activity.place || '待确认' }}<small v-if="activity.gatherAt"> · {{ activity.gatherAt }} 集合</small></p></div>
        <div class="session-my-state"><span>{{ activity.mine.signed ? '我已报名' : activity.action.label }}</span><span v-if="activity.plannedKm">计划 {{ activity.plannedKm }} km</span><span v-if="activity.mine.km != null">已打卡 {{ activity.mine.km }} km</span></div>
        <p v-if="activity.issue" class="hero-issue">{{ activity.issue }}</p>
      </section>

      <section class="quickfacts" aria-label="活动信息">
        <div><span>报名进度</span><b>{{ activity.signupCount }}<small>{{ activity.capacity ? ' / ' + activity.capacity : ' 人' }}</small></b></div>
        <div><span>报名截止</span><b>{{ signupDeadline }}</b></div>
      </section>

      <nav class="detail-tabs" aria-label="活动内容">
        <button v-for="tab in tabs" :key="tab.id" :class="{ selected: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}<small v-if="tab.id === 'groups'">{{ groups.length }}</small></button>
      </nav>

      <section v-if="activeTab === 'overview'" class="detail-panel">
        <div class="panel-heading"><div><span class="eyebrow">活动说明</span><h2>今天怎么跑</h2></div><span v-if="activity.plannedKm" class="distance">{{ activity.plannedKm }} km</span></div>
        <div class="run-facts">
          <div><span class="fact-icon">↗</span><div><small>路线</small><b>{{ activity.route || '集合后由领跑员说明' }}</b></div></div>
          <div><span class="fact-icon">◎</span><div><small>活动地点</small><b>{{ activity.place || '以集合点为准' }}</b></div></div>
          <div><span class="fact-icon">◷</span><div><small>集合点</small><b>{{ activity.gatherPlace || '活动开始时集合' }}</b></div></div>
        </div>
        <div v-if="activity.note || activity.notice" class="briefing">
          <h3>出发前看一眼</h3><p v-if="activity.notice">{{ activity.notice }}</p><p v-if="activity.note">{{ activity.note }}</p>
        </div>
        <div class="crew-preview">
          <div class="panel-heading"><div><span class="eyebrow">同行跑友</span><h2>一起出发的人</h2></div><button @click="activeTab = 'groups'">看分组 →</button></div>
          <div class="avatar-stack"><router-link v-for="person in signups.slice(0, 8)" :key="person.userId" :to="memberLink(person.userId)" :aria-label="'查看' + person.nickname + '的主页'"><img v-if="person.avatar" :src="person.avatar" :alt="person.nickname" @error="fallbackAvatar($event, person)"><span v-else class="avatar-letter">{{ person.nickname.slice(0, 1) }}</span></router-link></div>
          <p>{{ activity.signupCount }} 位跑者报名<template v-if="activity.men || activity.women"> · 男 {{ activity.men }} / 女 {{ activity.women }}</template></p>
        </div>
        <div v-if="checks.length" class="check-list">
          <div class="panel-heading"><div><span class="eyebrow">训练记录</span><h2>训练打卡</h2></div><span class="group-total">{{ checks.length }} 人</span></div>
          <div v-for="row in checks" :key="row.userId" class="runner-row"><span class="avatar-letter">{{ row.nickname.slice(0, 1) }}</span><router-link :to="memberLink(row.userId)" class="member-name-link">{{ row.nickname }}</router-link><span class="runner-tags"><small v-if="row.historical" class="history-label">历史记录</small>{{ row.km }} km<template v-if="row.note"> · {{ row.note }}</template></span></div>
        </div>
        <p v-if="activity.rule" class="integrity-note">{{ activity.rule }}</p>
      </section>

      <section v-else-if="activeTab === 'groups'" class="detail-panel group-panel">
        <div class="panel-heading"><div><span class="eyebrow">分组与配速</span><h2>选择适合自己的节奏</h2></div><span class="group-total">{{ activity.signupCount }} 人</span></div>
        <div v-if="!groups.length && signups.length" class="pace-group">
          <div class="group-title"><div><span class="group-kind">活动成员</span><h3>已报名跑者</h3></div><b>{{ signups.length }}</b></div>
          <div class="roster"><div v-for="person in signups" :key="person.userId" class="runner-row"><img v-if="person.avatar" :src="person.avatar" :alt="''" @error="fallbackAvatar($event, person)"/><span v-else class="avatar-letter">{{ person.nickname.slice(0, 1) }}</span><router-link :to="memberLink(person.userId)" class="member-name-link">{{ person.nickname }}<small v-if="person.mine">我</small></router-link><span class="runner-tags">{{ person.pacer ? '领跑员' : '' }}</span></div></div>
        </div>
        <article v-for="group in groups" :key="group.id" class="pace-group">
          <div class="group-title"><div><span class="group-kind">{{ group.kindLabel }}</span><h3>{{ group.name }}</h3><p v-if="group.pace">{{ group.pace }}</p></div><b>{{ group.signed }}<small> / {{ group.capacity || '∞' }}</small></b></div>
          <div class="capacity-track"><i :style="{ width: group.capacity ? Math.min(100, group.signed / group.capacity * 100) + '%' : (group.signed ? '24%' : '0%') }"></i></div>
          <div v-if="group.people.length" class="roster">
            <div v-for="person in visiblePeople(group)" :key="person.userId" class="runner-row"><img v-if="person.avatar" :src="person.avatar" :alt="''" @error="fallbackAvatar($event, person)"/><span v-else class="avatar-letter">{{ person.nickname.slice(0, 1) }}</span><router-link :to="memberLink(person.userId)" class="member-name-link">{{ person.nickname }}<small v-if="person.mine">我</small></router-link><span class="runner-tags">{{ person.pacer ? '领跑员 · ' : '' }}<template v-if="staff">{{ person.level }} {{ person.gender }}</template></span></div>
            <button v-if="group.people.length > 5" class="more-runners" @click="toggleRoster(group.id)">{{ expandedGroups.includes(group.id) ? '收起名单' : '查看另外 ' + (group.people.length - 5) + ' 人' }}</button>
          </div><p v-else class="empty-roster">还没有人加入这个组</p>
        </article>
        <button v-if="staff" class="subtle-action" @click="showGroupForm = !showGroupForm">{{ showGroupForm ? '收起' : '＋ 添加分组' }}</button>
        <form v-if="staff && showGroupForm" class="admin-form" @submit.prevent="addGroup"><input v-model="groupName" maxlength="20" placeholder="组名，例如 A2" required/><select v-model="groupKind"><option value="pace">配速组</option><option value="finish">完赛组</option><option value="volunteer">志愿者</option><option value="other">非训练</option></select><input v-model="groupPace" maxlength="40" placeholder="配速 / 目标"/><input v-model.number="groupCap" type="number" min="0" max="500" placeholder="人数上限，0不限"/><button class="action-button" :disabled="busy">添加分组</button></form>
      </section>

      <section v-else class="detail-panel plan-panel">
        <div class="panel-heading"><div><span class="eyebrow">训练计划</span><h2>训练安排</h2></div><span class="plan-type">{{ typeLabel }}</span></div>
        <div v-if="activity.workout" class="workout-text">{{ activity.workout }}</div><div v-else class="empty-plan"><span>↗</span><b>训练安排还未补充</b><small>请留意跑团群里的集合通知</small></div>
        <div class="safety-note"><b>跑在能力范围内</b><p>感到不适时可以放慢或停止，和领跑员打声招呼。训练建议仅供参考，以当日状态为准。</p></div>
        <router-link v-if="album" class="album-entry" :to="'/clubs/' + clubId + '/activities/' + activityId + '/album'"><div><span class="eyebrow">活动影像</span><b>活动相册</b><small>{{ album.photoCount }} 张照片 · {{ album.videoCount }} 个视频</small></div><span>→</span></router-link>
      </section>

      <section v-if="activity.mine.signed || staff" class="utility-panel">
        <div class="utility-heading"><b>我的训练记录</b><span>仅对已加入跑团的成员开放</span></div>
        <div v-if="activity.mine.signed && activity.checkAvailable" class="check-row"><input v-model="km" inputmode="decimal" placeholder="打卡里程 km"/><input v-model="checkNote" maxlength="40" placeholder="一句训练记录"/><button class="subtle-action" :disabled="busy" @click="check">{{ activity.mine.km != null ? '更新打卡' : '打卡' }}</button></div>
        <p v-else-if="activity.mine.signed && activity.status === 'cancelled'" class="check-hint">活动已取消，不能打卡</p>
        <div v-else-if="activity.mine.signed" class="check-hint"><span>活动开始后可打卡</span><button type="button" :disabled="busy" @click="load">刷新状态</button></div>
        <div v-if="activity.mine.signed && activity.mine.groupId" class="utility-actions"><button class="subtle-action" @click="pacer(!activity.mine.pacer)">{{ activity.mine.pacer ? '退出领跑' : '申请领跑' }}</button><router-link v-if="album" class="subtle-action" :to="'/clubs/' + clubId + '/activities/' + activityId + '/album'">打开相册</router-link></div>
        <details v-if="staff" class="staff-tools"><summary>组织者工具</summary><div class="utility-actions"><button class="subtle-action" @click="editing = !editing">{{ editing ? '关闭编辑' : '编辑活动' }}</button><button class="subtle-action" @click="endActivity">结束活动</button><button class="subtle-action danger" @click="cancelActivity">取消活动</button></div>
          <form v-if="editing && draft" class="admin-form" @submit.prevent="save"><label>活动标题<input v-model="draft.title" maxlength="40"/></label><label>活动期次<input v-model="draft.issue" maxlength="40"/></label><label>训练类型<select v-model="draft.trainingType"><option v-for="(label, value) in typeLabels" :key="value" :value="value">{{ label }}</option></select></label><label>开始时间<input v-model="draft.startsAt" type="datetime-local"/></label><label>结束时间<input v-model="draft.endsAt" type="datetime-local"/></label><label>集合地点<input v-model="draft.gatherPlace"/></label><label>集合时间<input v-model="draft.gatherAt"/></label><label>活动地点<input v-model="draft.place"/></label><label>计划公里<input v-model.number="draft.plannedKm" type="number" min="0.1" max="200" step="0.1"/></label><label>报名截止<input v-model="draft.signupUntil" type="datetime-local"/></label><label>取消报名截止<input v-model="draft.cancelUntil" type="datetime-local"/></label><label>成团人数<input v-model.number="draft.minPeople" type="number" min="1" max="500"/></label><label>计分最低公里<input v-model.number="draft.minKm" type="number" min="0.1" max="100" step="0.1"/></label><label>完成积分<input v-model.number="draft.points" type="number" min="0" max="100"/></label><label class="wide-field">路线说明<input v-model="draft.route" maxlength="200"/></label><label class="wide-field">训练安排<textarea v-model="draft.workout" maxlength="2000"/></label><label class="wide-field">参与须知<textarea v-model="draft.notice" maxlength="1000"/></label><label class="wide-field">补充说明<textarea v-model="draft.note" maxlength="2000"/></label><label class="check-setting"><input v-model="draft.review" type="checkbox"/> 活动相册内容需要管理员审核</label><button class="action-button" :disabled="busy">保存修改</button></form>
        </details>
      </section>
      <p v-if="message" class="message" role="status">{{ message }}</p>
    </section>
    <p v-else class="state error">{{ message || '没有找到这场活动' }} <button @click="load">重试</button></p>

    <footer v-if="activity" class="sticky-join">
      <div class="join-count"><b>{{ activity.signupCount }}</b><span>人已报名</span></div>
      <router-link v-if="activity.action.enabled && activity.action.kind === 'signup'" class="action-button" :to="'/clubs/' + clubId + '/activities/' + activityId + '/signup'">{{ groups.length ? "选择分组报名" : "报名参加" }} <span>→</span></router-link>
      <button v-else-if="activity.action.enabled" class="action-button secondary" :disabled="busy" @click="cancel">取消我的报名</button>
      <button v-else class="action-button disabled" disabled>{{ activity.action.label }}</button>
    </footer>
  </main>
</template>

<script setup>
import { memberProfileLink } from "../member-profile-navigation";
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const memberLink = uid => memberProfileLink(route.params.id, uid, { returnTo: route.path + '?' + new URLSearchParams({ ...route.query, view: activeTab.value, roster: expandedGroups.value.join(',') }) });
const clubId = computed(() => String(route.params.id || ''));
const activityId = computed(() => String(route.params.aid || ''));
const activity = ref(null), groups = ref([]), signups = ref([]), checks = ref([]), album = ref(null);
const clubName = ref(''), staff = ref(false), activeTab = ref(['overview', 'groups', 'plan'].includes(route.query.view) ? route.query.view : 'overview'), loading = ref(true), busy = ref(false), message = ref('');
const expandedGroups = ref(String(route.query.roster || '').split(',').filter(value => /^\d+$/.test(value)).map(Number)), showGroupForm = ref(false), groupName = ref(''), groupKind = ref('pace'), groupPace = ref(''), groupCap = ref(0);
const editing = ref(false), draft = ref(null), km = ref(''), checkNote = ref('');
const tabs = [{ id: 'overview', label: '活动概览' }, { id: 'groups', label: '配速分组' }, { id: 'plan', label: '训练安排' }];
const typeLabels = { easy: '轻松跑', long: '长距离', interval: '间歇训练', tempo: '节奏跑', social: '社交跑', custom: '跑团训练' };
const typeLabel = computed(() => typeLabels[activity.value?.trainingType] || '跑团训练');
const signupDeadline = computed(() => { const v = activity.value?.signupUntil; return v ? v.slice(5, 10).replace('-', '/') + ' ' + v.slice(11, 16) : '开始前'; });

function fallbackAvatar(event, person) { person.avatar = ''; event.target.onerror = null; }
function visiblePeople(group) { return expandedGroups.value.includes(group.id) ? group.people : group.people.slice(0, 5); }
function toggleRoster(id) { expandedGroups.value = expandedGroups.value.includes(id) ? expandedGroups.value.filter((item) => item !== id) : [...expandedGroups.value, id]; }
function makeDraft(row) { return { title: row.title, issue: row.issue || '', startsAt: row.startsAt, endsAt: row.endsAt, gatherAt: row.gatherAt, gatherPlace: row.gatherPlace, place: row.place, plannedKm: row.plannedKm, route: row.route, cancelUntil: row.cancelUntil, signupUntil: row.signupUntil, workout: row.workout, notice: row.notice, note: row.note, minPeople: row.minPeople, minKm: row.minKm, points: row.points, trainingType: row.trainingType, review: row.review }; }
let requestNo = 0;
async function load() {
  const ticket = ++requestNo; loading.value = true; message.value = '';
  try {
    const data = await api('/clubs/' + clubId.value + '/activities/' + activityId.value);
    if (ticket !== requestNo) return;
    activity.value = data.activity; groups.value = data.groups || []; signups.value = data.signups || []; checks.value = data.checks || []; album.value = data.album; staff.value = !!data.staff; clubName.value = data.club?.name || '';
    draft.value = makeDraft(data.activity); km.value = data.activity.mine?.km == null ? '' : String(data.activity.mine.km);
  } catch (error) { if (ticket === requestNo) message.value = error.message; }
  finally { if (ticket === requestNo) loading.value = false; }
}
async function mutate(path, method = 'POST', body = {}) { if (busy.value) return; busy.value = true; message.value = ''; try { await api('/clubs/' + clubId.value + '/activities/' + activityId.value + path, { method, body: JSON.stringify(body) }); await load(); } catch (error) { message.value = error.message; } finally { busy.value = false; } }
function cancel() { mutate('/signup', 'DELETE'); }
function pacer(on) { mutate('/pacer', 'POST', { on }); }
function check() { if (busy.value || !activity.value?.mine?.signed || !activity.value?.checkAvailable) return; if (!Number(km.value)) { message.value = '请填写有效的打卡里程'; return; } mutate('/check', 'POST', { km: Number(km.value), note: checkNote.value }); }
async function save() { if (busy.value) return; busy.value = true; message.value = ''; try { await api('/clubs/' + clubId.value + '/activities/' + activityId.value, { method: 'PUT', body: JSON.stringify(draft.value) }); editing.value = false; await load(); } catch (error) { message.value = error.message; } finally { busy.value = false; } }
async function addGroup() { if (busy.value) return; busy.value = true; try { await api('/clubs/' + clubId.value + '/activities/' + activityId.value + '/groups', { method: 'POST', body: JSON.stringify({ name: groupName.value, kind: groupKind.value, pace: groupPace.value, capacity: Number(groupCap.value) || 0 }) }); groupName.value = ''; groupPace.value = ''; groupCap.value = 0; showGroupForm.value = false; await load(); } catch (error) { message.value = error.message; } finally { busy.value = false; } }
function endActivity() { if (window.confirm('结束这场活动？')) mutate('/end'); }
function cancelActivity() { if (window.confirm('取消这场活动？已报名成员仍可查看活动说明。')) mutate('/cancel'); }
async function share() { const text = [clubName.value, activity.value?.title, activity.value?.timeLabel, activity.value?.gatherPlace || activity.value?.place, activity.value?.plannedKm ? activity.value.plannedKm + ' km' : '', window.location.href].filter(Boolean).join(' · '); try { await navigator.clipboard.writeText(text); message.value = '活动信息与链接已复制'; } catch { message.value = text; } }
onMounted(load);
watch(() => [route.params.id, route.params.aid], () => { activity.value = null; activeTab.value = ['overview', 'groups', 'plan'].includes(route.query.view) ? route.query.view : 'overview'; load(); });
</script>

<style scoped>
.activity-page{--red:var(--accent);--paper:var(--bg);min-height:100vh;background:var(--paper);color:var(--ink);padding-bottom:96px}
.activity-nav {height:64px;position:sticky;top:0;z-index:5;background:#fff;display:grid;grid-template-columns: 40px 1fr auto;align-items:center;padding: 0 16px;border-bottom:1px solid var(--line)}
.activity-nav>a,.activity-nav>button{border:0;background:transparent;color:var(--ink);font-size:24px;text-decoration:none;text-align:center}
.activity-nav>div{text-align:center}
.activity-nav small{display:block;font-size:12px;color:var(--muted);line-height:1.2}
.activity-nav h1{font-size:16px;margin:2px 0;font-weight:600}
.activity-content{max-width:780px;margin:0 auto;padding:18px 18px 30px}
.event-hero {position:relative;overflow:hidden;isolation:isolate;min-height: 200px;padding: 20px;color: var(--ink);background: var(--card);border-radius:12px; border: 1px solid var(--line);}
.hero-track {position:absolute;z-index:-1;inset:0 0 0 38%;overflow:hidden;opacity: 1;transform:skewX(-23deg)}
.hero-track i {position:absolute;inset:-45% 6%;border: 1px solid var(--line);border-radius:50%;transform:rotate(-16deg)}
.hero-track i:nth-child(2){inset:-26% 14%}
.hero-track i:nth-child(3){inset:-8% 22%}
.hero-track i:nth-child(4){inset:10% 30%}
.event-hero:after {content:'';position:absolute;inset:0;z-index:-1;background: none; display: none;}
.hero-meta{display:flex;gap:8px;align-items:center}
.hero-meta span {padding: 4px 8px;border: 1px solid var(--line);border-radius: 6px;font-size:12px; background: #fff; color: var(--muted);}
.hero-meta .status {height:auto; border-color: var(--line);background: var(--accent-soft); color: var(--accent);}
.hero-km {margin: 22px 0 2px;color: var(--accent);font-size: 40px;font-weight: 600;line-height:1;letter-spacing:normal}
.hero-km small {margin-left:8px;font-size:14px;font-weight:600;letter-spacing:normal; color: var(--accent);}
.event-hero h2 {max-width:560px;margin:10px 0 7px;font-size: 24px;line-height: 1.4; color: var(--ink);}
.hero-date {margin:0;color: var(--muted);font-size:14px}
.hero-date b {color: var(--ink);margin-left:6px}
.hero-issue {margin:12px 0 0;color: var(--muted);font-size:12px}
.quickfacts {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);margin-top:12px;border:1px solid var(--line); border-radius: 12px;}
.quickfacts div{display:flex;flex-direction:column;gap:9px;min-height:84px;padding:15px 14px;background:#fff}
.quickfacts span{font-size:12px;color:var(--muted)}
.quickfacts b{font-size:14px;line-height:1.3}
.quickfacts b small{font-size:12px;color:var(--muted);font-weight:500}
.detail-tabs{position:sticky;top:64px;z-index:4;display:flex;gap:28px;margin-top:18px;padding:0 8px;background:var(--paper);border-bottom:1px solid var(--line)}
.detail-tabs button {display:flex;align-items:center;gap:6px;border:0;border-bottom:2px solid transparent;background:transparent;padding: 14px 2px;color:var(--muted);font-size: 14px;}
.detail-tabs button.selected{border-color:var(--red);color:var(--ink);font-weight:600}
.detail-tabs small{font-size:12px;color:var(--red)}
.detail-panel,.utility-panel {margin-top:14px;padding: 20px;background:#fff;border: 1px solid var(--line);border-radius: 12px;}
.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}
.eyebrow{display:block;color:var(--red);font-size:12px;font-weight:600;letter-spacing:normal}
.panel-heading h2{margin:4px 0 0;font-size:20px;letter-spacing:normal}
.distance{font-size:22px;font-weight:600}
.run-facts{margin-top:22px;border-top:1px solid var(--line)}
.run-facts>div{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.fact-icon {display:grid;place-items:center;width:34px;height:34px;background:var(--accent-soft);color:var(--red);font-size:18px; border-radius: 9px;}
.run-facts small,.run-facts b{display:block}
.run-facts small{margin-bottom:3px;color:var(--muted);font-size:12px}
.run-facts b{font-size:13px}
.briefing {margin-top:20px;padding:16px;background:var(--field-bg);border-left:2px solid var(--red); border-radius: 0 12px 12px 0;}
.briefing h3{margin:0 0 8px;font-size:14px}
.briefing p,.workout-text{white-space:pre-wrap;margin:0 0 8px;color: var(--ink);font-size:13px;line-height:1.75}
.briefing p:last-child{margin-bottom:0}
.crew-preview{margin-top:24px;padding-top:18px;border-top:1px solid var(--line)}
.crew-preview .panel-heading button{border:0;background:transparent;color:var(--red);font-size:12px}
.avatar-stack{display:flex;margin-top:14px}
.avatar-stack img,.avatar-letter{width:34px;height:34px;margin-right:-7px;border:2px solid white;border-radius:50%;object-fit:cover;background:var(--line)}
.avatar-letter{display:grid;place-items:center;color: var(--muted);font-size:13px}
.crew-preview>p{font-size:12px;color:var(--muted)}
.integrity-note{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);line-height:1.5}
.group-total,.plan-type{font-size:12px;color:var(--muted)}
.pace-group {margin-top:14px;padding:18px;border:1px solid var(--line);border-radius: 12px;}
.group-title{display:flex;justify-content:space-between;align-items:flex-start}
.group-kind{font-size:12px;color:var(--red);font-weight:600}
.group-title h3{margin:3px 0;font-size:17px}
.group-title p{margin:0;color:var(--muted);font-size:12px}
.group-title>b{font-size:20px}
.group-title>b small{font-size:12px;color:var(--muted);font-weight:500}
.capacity-track{height:3px;margin:14px 0;background:var(--line)}
.capacity-track i{display:block;height:100%;background:var(--red)}
.runner-row{display:grid;grid-template-columns:28px minmax(80px,1fr) auto;gap:8px;align-items:center;padding:7px 0}
.runner-row img,.runner-row .avatar-letter{width:26px;height:26px;margin:0}
.runner-row b{overflow:hidden;text-overflow:ellipsis;font-size:12px;white-space:nowrap}
.runner-row b small{margin-left:6px;color:var(--red);font-weight:500}
.runner-tags{color:var(--muted);font-size:12px}
.more-runners,.subtle-action{border:0;background:transparent;color:var(--red);font-size:12px;padding:8px 0}
.empty-roster,.empty-plan{color:var(--muted);font-size:12px}
.workout-text{margin-top:22px}
.empty-plan{display:grid;justify-items:center;gap:8px;padding:44px 10px}
.empty-plan>span{font-size:24px;color:var(--red)}
.empty-plan small{color:var(--muted)}
.safety-note {margin:14px 0;padding:14px;background: var(--field-bg);}
.safety-note b{font-size:12px}
.safety-note p{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
.album-entry{display:flex;align-items:center;justify-content:space-between;padding:15px 0;border-top:1px solid var(--line);color:var(--ink);text-decoration:none}
.album-entry b,.album-entry small{display:block;margin-top:4px}
.album-entry b{font-size:14px}
.album-entry small{color:var(--muted);font-size:12px}
.utility-panel{padding:18px 20px}
.utility-heading{display:flex;justify-content:space-between;align-items:center}
.utility-heading b{font-size:13px}
.utility-heading span {font-size: 12px;color:var(--muted); max-width: none; text-align: left;}
.check-row,.utility-actions{display:flex;gap:8px;align-items:center;margin-top:12px}
.check-hint {display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 0;padding:10px 12px;border-radius: 10px;background:var(--bg);color:var(--muted);font-size:12px}
.check-hint button{flex:none;padding:2px 0;border:0;background:transparent;color:var(--red);font:inherit;cursor:pointer}
.history-label {display:inline-block;margin-right:6px;padding:2px 5px;border-radius: 6px;background:var(--chip);color:var(--muted);font-size:12px;font-weight:500}
.check-row input,.admin-form input,.admin-form select,.admin-form textarea {min-width:0;flex:1;border:1px solid var(--line);border-radius: 12px;padding: 11px 12px;background: var(--field-bg);font:inherit;font-size: 14px;}
.staff-tools{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.staff-tools summary {color: var(--ink);font-size: 14px;cursor:pointer; display: flex; align-items: center; justify-content: space-between; min-height: 44px; list-style: none; font-weight: 600;}
.admin-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.admin-form textarea{grid-column:1/-1;min-height:64px}
.action-button{display:flex;justify-content:center;align-items:center;gap:18px;min-height:46px;padding:0 22px;border:0;border-radius:12px;background:var(--red);color:#fff;text-decoration:none;font-weight:600;font-size:14px}
.action-button:disabled{opacity:.6}
.action-button.secondary{background:#fff;color:var(--red);border:1px solid var(--line)}
.action-button.disabled{background:#d6d7dc;color:var(--muted)}
.danger{color:var(--accent)}
.sticky-join{position:fixed;z-index:6;bottom:0;left:50%;display:flex;align-items:center;justify-content:space-between;gap:15px;width:min(430px,100%);padding:12px max(18px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));transform:translateX(-50%);background:#fff;border-top:1px solid var(--line)}
.join-count{display:flex;align-items:baseline;gap:5px;white-space:nowrap}
.join-count b{font-size:20px}
.join-count span{font-size:12px;color:var(--muted)}
.sticky-join .action-button{flex:1;max-width:420px}
.message,.state{max-width:780px;margin:28px auto;padding:18px;color:var(--muted);text-align:center}
.message{color:var(--red)}
.error button{display:block;margin:12px auto;color:var(--red)}

@media(max-width:560px){.activity-content{padding:12px 12px 24px}
.event-hero {min-height: 200px;padding: 20px; background: var(--card); color: var(--ink); border: 1px solid var(--line);}
.hero-km {font-size: 40px; margin: 22px 0 2px; font-weight: 600; color: var(--accent);}
.event-hero h2 {font-size: 24px; line-height: 1.4; color: var(--ink);}
.quickfacts {grid-template-columns:repeat(2,minmax(0,1fr)); border-radius: 12px;}
.quickfacts div{min-height:70px;padding:11px}
.quickfacts b{font-size:12px}
.detail-tabs{gap:22px;margin-top:14px}
.detail-panel{padding:17px 15px}
.panel-heading h2{font-size:18px}
.pace-group {padding:14px 12px; border-radius: 12px;}
.runner-row{grid-template-columns:27px minmax(70px,1fr);}
.runner-tags{grid-column:2;grid-row:2}
.check-row{flex-wrap:wrap}
.check-row input{flex-basis:calc(50% - 6px)}
.check-row button {width: auto;text-align:center; margin-left: auto;}
.utility-heading span {max-width: none;text-align: left;}
.sticky-join{padding-right:14px;padding-left:14px}
.join-count{display:none}
.sticky-join .action-button{max-width:none}
.admin-form{grid-template-columns:1fr}
.admin-form textarea{grid-column:auto}
}


.check-list{margin-top:24px;padding-top:18px;border-top:1px solid var(--line)}

.admin-form>label{display:grid;gap:5px;color:var(--muted);font-size:12px}

.admin-form label input,.admin-form label select,.admin-form label textarea{width:100%}

.admin-form .wide-field,.admin-form .check-setting{grid-column:1/-1}

.admin-form .check-setting{display:flex;align-items:center;gap:8px}

.admin-form .check-setting input{flex:none;width:auto}

.activity-nav>a,.activity-nav>button{display:flex;align-items:center;justify-content:center;min-height:44px;line-height:1.2}
.quickfacts {border-radius: 12px;overflow:hidden}
.activity-nav .activity-share { display:inline-flex; gap:5px; width:auto; min-height:36px; padding:6px 9px; border:1px solid var(--line); border-radius:8px; color:var(--ink-secondary); background:var(--card); font-size:12px; font-weight:500; }
.activity-share svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
.staff-tools summary::after { content:"+"; color:var(--muted); font-size:20px; font-weight:400; }
.staff-tools[open] summary::after { content:"−"; }
.staff-tools summary::-webkit-details-marker { display:none; }
.utility-actions { flex-wrap:wrap; gap:8px 20px; }
.utility-heading { align-items:flex-start; flex-direction:column; gap:4px; }
@media(max-width:560px) { .activity-content { padding:12px 12px 24px; } .event-hero { min-height:248px; background: var(--card); color: var(--ink); border: 1px solid var(--line);} .hero-km { font-size:40px; color: var(--accent);} .event-hero h2 { font-size:24px; color: var(--ink);} .detail-panel,.utility-panel { padding:18px; } }
.activity-page { background:transparent; }
.activity-nav { background:#fff;backdrop-filter:blur(16px);border-color:var(--line); }
.event-hero { background:var(--card);border-color:var(--line);box-shadow:none; }
.hero-track i { border-color:var(--line); }.hero-meta span { background:#ffffffab;border-color:var(--line);color:var(--muted); }.hero-meta .status { background:var(--field-bg);border-color:var(--line);color:var(--muted); }
.quickfacts { overflow:hidden;border-color:var(--line);box-shadow:none; }
.quickfacts>div { background:#fff; }
.detail-tabs { background:#fff;backdrop-filter:blur(14px); }
.run-facts>div:nth-child(2) .fact-icon { background:var(--field-bg);color:var(--muted); }.run-facts>div:nth-child(3) .fact-icon { background:var(--field-bg);color:var(--muted); }
.briefing { background:var(--field-bg);border-left-color:var(--line); }
.pace-group:nth-child(3n+1) { background:#fff; }.pace-group:nth-child(3n+2) { background:#fff; }.pace-group:nth-child(3n) { background:#fff; }
.album-entry { background:#fff;border-color:var(--line); }.safety-note { background:#fff; }
@media(max-width:350px) { .event-hero h2 { overflow-wrap:anywhere; }.quickfacts>div { min-width:0; }.quickfacts b { overflow-wrap:anywhere; } }
.member-name-link{min-width:0;color:var(--ink);overflow-wrap:anywhere;text-decoration:none}.member-name-link:hover{color:var(--accent)} .runner-row>.member-name-link{font-size:13px;font-weight:500;line-height:1.6}.member-name-link small{margin-left:4px;padding:1px 4px;border-radius:4px;color:var(--accent);background:var(--accent-soft);font-size:12px;font-weight:400}.crew-preview .avatar-stack>a{display:flex;min-width:0;flex:none;margin-right:-9px}.crew-preview .avatar-stack>a>img,.crew-preview .avatar-stack>a>.avatar-letter{margin:0}

.hero-track { display: none; }
.event-hero { min-height: 0; padding: 20px; border-radius: 12px; background: var(--card); }
.hero-km { margin: 16px 0 4px; font-size: 40px; font-weight: 600; }
.event-hero h2 { font-size: 24px; font-weight: 600; }
.detail-panel,.utility-panel,.quickfacts { border-radius: 12px; }
</style>

<style scoped src="../service-ui.css"></style>
