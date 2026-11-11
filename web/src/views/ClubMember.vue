<template>
  <main class="club-member-page">
    <header class="member-topbar"><router-link :to="backLink" aria-label="返回跑量看板"><RunnerIcon name="back" /></router-link><span>跑者主页</span><span></span></header>
    <div v-if="error" class="member-state" role="alert"><h2>暂时无法查看</h2><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
    <div v-else-if="!profile" class="member-state" role="status">正在打开跑者主页…</div>
    <template v-else>
      <section class="member-profile"><span class="profile-avatar"><img v-if="profile.user.avatar" :src="profile.user.avatar" alt="" /><template v-else>{{ profile.user.nickname.slice(0, 1) }}</template></span><div class="profile-name"><h1>{{ profile.user.nickname }}</h1><span v-if="profile.mine" class="me-label">我</span></div><p class="profile-group">{{ profile.user.groupName || '未分组' }}<template v-if="profile.group?.pace"> · {{ profile.group.pace }}</template></p><p v-if="profile.user.joinedAt" class="profile-joined">{{ profile.user.joinedAt.slice(0, 10) }} 加入跑团</p><div class="intro-heading"><h2>跑者介绍</h2><button v-if="profile.mine && !editing" type="button" @click="startEdit">{{ profile.user.introduction ? '编辑介绍' : '写下介绍' }}</button></div><form v-if="editing" class="intro-editor" @submit.prevent="saveIntroduction"><textarea v-model="introduction" maxlength="300" rows="4" aria-label="跑者介绍" placeholder="写写你的跑步经历、目标，或喜欢的路线" /><span>{{ introduction.length }} / 300</span><p v-if="saveError" role="alert">{{ saveError }}</p><div><button type="button" :disabled="saving" @click="editing = false">取消</button><button type="submit" class="save-intro" :disabled="saving">{{ saving ? '保存中…' : '保存介绍' }}</button></div></form><p v-else class="profile-intro">{{ profile.user.introduction || '这位跑友还没有填写介绍。' }}</p><p v-if="profile.group?.description" class="group-description">{{ profile.group.name }} · {{ profile.group.description }}</p></section>
      <section class="member-volume"><div class="section-heading"><h2>团内跑量</h2><span>本团已计入记录</span></div><nav class="profile-range" aria-label="成员跑量时间范围"><button v-for="item in ranges" :key="item.id" type="button" :class="{ on: range === item.id }" :aria-pressed="range === item.id" @click="pickRange(item.id)">{{ item.label }}</button></nav><div class="profile-period"><button type="button" aria-label="上一统计周期" :disabled="loading || range === 'all'" @click="shiftDate(-1)">‹</button><label><span>{{ profile.period.label }}</span><input v-if="range !== 'all'" type="date" v-model="date" :max="today" aria-label="选择成员跑量统计日期" @change="load" /></label><button type="button" aria-label="下一统计周期" :disabled="loading || !canAdvanceMileage(range, date, today)" @click="shiftDate(1)">›</button></div><div class="personal-volume" :aria-busy="loading"><span>{{ range === 'all' ? '累计跑量' : '本期跑量' }} <small>公里</small></span><strong>{{ number(profile.stats.km) }}</strong><div class="personal-metrics"><div><b>{{ profile.stats.times }}</b><span>运动次数</span></div><div><b>{{ profile.stats.days }}</b><span>运动天数</span></div><div><b>{{ duration(profile.stats.durationSec) }}</b><span>运动时长</span></div></div><div class="personal-pace"><span>平均配速</span><b>{{ profile.stats.paceLabel || '—' }} <small v-if="profile.stats.paceLabel">/km</small></b></div></div><p class="volume-note">按跑团计入规则统计，不包含其他跑团数据与私人收藏。</p></section>
      <section class="member-runs"><div class="section-heading"><h2>运动明细</h2><span>本周期最近 20 次</span></div><article v-for="run in profile.recentRuns || []" :key="run.id" class="member-run"><span class="member-run-date">{{ run.startedAt.slice(5, 10).replace('-', '.') }}<small>{{ run.startedAt.slice(11, 16) }}</small></span><div><b>{{ run.typeLabel }}</b><span>{{ run.durationLabel }}<template v-if="run.paceLabel"> · {{ run.paceLabel }} /km</template></span></div><strong>{{ number(run.km) }}<small>公里</small></strong></article><p v-if="!profile.recentRuns?.length" class="runs-empty">这个周期还没有计入的跑量记录。</p></section>
    </template>
  </main>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useClubSession } from '../useClubSession';
import RunnerIcon from '../components/RunnerIcon.vue';
import { beijingDay, validMileageDate, canAdvanceMileage, moveMileageDate } from '../club-mileage-utils';
const route = useRoute();
const ranges = [{ id: 'day', label: '日' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }, { id: 'all', label: '累计' }];
const today = beijingDay();
const range = ref(ranges.some(x => x.id === route.query.range) ? route.query.range : 'month');
const date = ref(validMileageDate(route.query.date, today));
const profile = ref(null), loading = ref(false), error = ref(''), editing = ref(false), introduction = ref(''), saving = ref(false), saveError = ref('');
let version = 0;
function reset() { version++; profile.value = null; error.value = ''; editing.value = false; introduction.value = ''; saving.value = false; saveError.value = ''; }
const key = () => route.params.id + ':' + route.params.uid;
const session = useClubSession(reset, key);
const backLink = computed(() => ({ path: '/clubs/' + route.params.id, query: { tab: 'km', range: range.value, date: date.value } }));
const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
function duration(value) { const minutes = Math.floor(Number(value || 0) / 60); return Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm'; }
async function load() { date.value = validMileageDate(date.value, today); const current = ++version; loading.value = true; error.value = ''; try { const data = await session.request('/clubs/' + route.params.id + '/members/' + route.params.uid + '/profile?' + new URLSearchParams({ range: range.value, date: date.value })); if (current === version) profile.value = data; } catch (e) { if (!e.stale && current === version) { profile.value = null; error.value = e.message; } } finally { if (current === version) loading.value = false; } }
function pickRange(value) { range.value = value; void load(); }
function shiftDate(direction) { date.value = moveMileageDate(range.value, date.value, direction, today); void load(); }
function startEdit() { introduction.value = profile.value.user.introduction || ''; saveError.value = ''; editing.value = true; }
async function saveIntroduction() { if (saving.value || !profile.value?.mine) return; const stamp = session.capture(); saving.value = true; saveError.value = ''; try { const data = await session.request('/me/introduction', { method: 'PUT', body: JSON.stringify({ introduction: introduction.value.trim() }) }); if (session.current(stamp)) { profile.value.user.introduction = data.introduction; editing.value = false; } } catch (e) { if (!e.stale && session.current(stamp)) saveError.value = e.message; } finally { if (session.current(stamp)) saving.value = false; } }
watch(key, load, { immediate: true });
watch(session.token, load);
onBeforeUnmount(() => { version++; });
</script>
<style scoped>
.club-member-page{min-height:100dvh;background:var(--bg);padding-bottom:28px;color:var(--ink)}
.member-topbar{display:grid;grid-template-columns:38px 1fr 38px;align-items:center;min-height:64px;background:#fff;padding:0 17px;font-size:15px;text-align:center;font-weight:550}
.member-topbar a{display:flex;align-items:center;min-height:44px}
.member-topbar svg{width:22px;height:22px}
.member-profile{padding:24px 23px 22px;background:#fff}
.profile-avatar{display:grid;place-items:center;width:70px;height:70px;margin:0 auto 16px;border-radius:22px;background:#edf4f9;color:#7f9aad;font-size:28px;font-weight:550;overflow:hidden}
.profile-avatar img{width:100%;height:100%;object-fit:cover}
.profile-name{display:flex;justify-content:center;align-items:center;gap:7px}
.profile-name h1{margin:0;font-size:25px;font-weight:600;letter-spacing:-.5px;overflow-wrap:anywhere;text-align:center;line-height:1.4}
.me-label{padding:2px 5px;border-radius:5px;background:var(--accent-soft);color:var(--accent);font-size:11px;flex:none}
.profile-group{color:#6c8797;font-size:13px;text-align:center;line-height:1.8;margin:9px 0 4px}
.profile-joined{font-size:11px;text-align:center;color:var(--muted);margin:0}
.intro-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #f0f0f3;margin-top:23px;padding-top:14px}
.intro-heading h2{font-size:13px;font-weight:550;margin:0}
.intro-heading button{min-height:36px;width:auto;font-size:12px;color:var(--accent)}
.profile-intro{font-size:13px;color:var(--muted);line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0}
.group-description{font-size:12px;color:#7f9299;padding:11px 13px;background:#f6f9fa;border-radius:9px;line-height:1.8;margin:15px 0 0;overflow-wrap:anywhere}
.member-volume{margin:23px 16px 0}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 14px}
.section-heading h2{font-size:18px;margin:0;font-weight:600}
.section-heading>span{font-size:11px;color:var(--muted)}
.profile-range{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;background:#fff;border-radius:11px}
.profile-range button{font-size:14px;min-height:38px;border-radius:8px;color:var(--muted)}
.profile-range button.on{color:var(--accent);background:var(--accent-soft);font-weight:550}
.profile-period{display:flex;align-items:center;gap:10px;margin:10px 0}
.profile-period button{width:32px;min-height:36px;font-size:22px;color:var(--muted)}
button:disabled{opacity:.4}
.profile-period label{position:relative;overflow:hidden;flex:1;min-width:0;display:grid;place-items:center;min-height:36px;color:var(--muted);font-size:12px;text-align:center;line-height:1.6}
.profile-period input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
.personal-volume{border-radius:17px;background:linear-gradient(130deg,#f0f7fb,#fff 80%);padding:23px 21px 0}
.personal-volume>span{font-size:12px;color:#7b91a1}
.personal-volume>span>small{margin-left:6px;color:var(--muted);font-size:11px}
.personal-volume>strong{display:block;font-size:53px;letter-spacing:-1.7px;font-weight:650;font-variant-numeric:tabular-nums;margin:13px 0 25px;line-height:1.2;overflow-wrap:anywhere}
.personal-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding-bottom:21px}
.personal-metrics>div{display:grid;gap:7px}
.personal-metrics b{font-size:17px;font-weight:550;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.personal-metrics span{font-size:11px;color:var(--muted)}
.personal-pace{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-top:1px solid #e9edf0;font-size:12px;color:var(--muted)}
.personal-pace b{font-size:17px;color:var(--ink);font-weight:550}
.personal-pace small{font-size:11px;color:var(--muted);font-weight:400}
.volume-note{font-size:11px;line-height:1.8;color:#96969e;margin:14px 3px}
.member-state{padding:65px 23px;text-align:center;color:var(--muted);font-size:13px;line-height:1.9}
.member-state h2{font-size:20px;color:var(--ink);font-weight:550}
.member-state button{width:auto;min-height:40px;padding:0 15px;background:var(--accent-soft);color:var(--accent);border-radius:9px;font-size:12px}
.intro-editor{margin-top:9px}
.intro-editor textarea{width:100%;resize:vertical;padding:11px 12px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:13px;line-height:1.8;color:var(--ink);background:#fafafb}
.intro-editor>span{display:block;text-align:right;font-size:11px;color:var(--muted);margin-top:6px}
.intro-editor>p{font-size:12px;color:var(--accent);line-height:1.8}
.intro-editor>div{display:flex;justify-content:flex-end;gap:9px}
.intro-editor button{width:auto;min-height:38px;padding:0 13px;font-size:12px;color:var(--muted)}
.intro-editor button.save-intro{background:var(--accent);color:#fff;border-radius:8px}
@media(max-width:350px){.member-profile{padding:22px 18px}
.member-volume{margin-right:12px;margin-left:12px}
.personal-volume{padding-right:18px;padding-left:18px}
.personal-volume>strong{font-size:47px}
.personal-metrics{gap:7px}
.personal-metrics b{font-size:15px}
}

.member-runs{margin:21px 16px 0;padding:19px 17px 8px;border-radius:16px;background:#fff}
.member-runs .section-heading{margin-bottom:10px}
.member-runs .section-heading h2{font-size:16px}
.member-run{display:flex;align-items:center;gap:12px;padding:17px 0;border-top:1px solid #f0f0f3}
.member-run-date{display:grid;gap:5px;font-size:13px;font-variant-numeric:tabular-nums}
.member-run-date small{font-size:11px;color:var(--muted)}
.member-run>div{flex:1;min-width:0;display:grid;gap:7px}
.member-run>div>b{font-size:13px;font-weight:500}
.member-run>div>span{font-size:11px;color:var(--muted);line-height:1.6}
.member-run>strong{font-size:21px;font-weight:600;letter-spacing:-.5px;font-variant-numeric:tabular-nums;text-align:right}
.member-run>strong small{display:block;font-size:11px;color:var(--muted);font-weight:400;letter-spacing:0;margin-top:5px}
.runs-empty{padding:20px 0;text-align:center;color:var(--muted);font-size:12px;line-height:1.8}
@media(max-width:350px){.member-runs{margin-right:12px;margin-left:12px;padding:17px 14px 8px}
.member-run{gap:9px}
}

</style>
