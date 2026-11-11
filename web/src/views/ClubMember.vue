<template>
  <main class="club-member-page">
    <header class="member-topbar"><router-link :to="backLink" :aria-label="backLabel"><RunnerIcon name="back" /></router-link><span>跑者主页</span><span class="profile-header-mark" aria-hidden="true"><RunnerIcon name="footprints" /></span></header>
    <section v-if="error && !profile" class="member-state" role="alert"><span class="state-symbol"><RunnerIcon name="stats" /></span><h2>暂时无法查看</h2><p>{{ error }}</p><button type="button" @click="load">重新加载</button></section>
    <section v-else-if="!profile" class="member-state" role="status"><span class="profile-skeleton"></span><p>正在打开跑者主页…</p></section>
    <template v-else>
      <section class="member-profile">
        <div class="profile-identity"><span class="profile-avatar"><img v-if="profile.user.avatar" :src="profile.user.avatar" alt="" /><template v-else>{{ profile.user.nickname.slice(0, 1) }}</template></span><div class="profile-identity-copy"><div class="profile-name"><h1>{{ profile.user.nickname }}</h1><span v-if="profile.mine" class="me-label">我</span></div><p class="profile-role"><span v-if="profile.user.roleLabel">{{ profile.user.roleLabel }}</span><span>{{ profile.user.groupName || '未分组' }}</span></p><p v-if="profile.user.joinedAt" class="profile-joined">{{ profile.user.joinedAt.slice(0, 10) }} 加入跑团</p></div></div>
        <div class="profile-key-metrics"><button type="button" @click="openLifetimeMileage"><b>{{ number(lifetime.km) }}</b><span>团内累计 · km</span></button><button type="button" @click="openLifetimeMileage"><b>{{ lifetime.times || 0 }}</b><span>累计运动</span></button><button type="button" @click="pickTab('results')"><b>{{ profile.summary?.finishedRaceCount || 0 }}</b><span>完赛赛事</span></button></div>
      </section>
      <nav class="profile-tabs" aria-label="跑者主页栏目"><button v-for="item in tabs" :key="item.id" type="button" :class="{ on: tab === item.id }" :aria-current="tab === item.id ? 'page' : undefined" @click="pickTab(item.id)">{{ item.label }}</button></nav>
      <p v-if="error" class="profile-inline-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
      <div class="profile-content">
        <template v-if="tab === 'info'">
          <section class="profile-card intro-card"><div class="section-heading intro-heading"><h2>关于这位跑者</h2><button v-if="profile.mine && !editing" type="button" @click="startEdit">{{ profile.user.introduction ? '编辑介绍' : '写下介绍' }} <span>↗</span></button></div><form v-if="editing" class="intro-editor" @submit.prevent="saveIntroduction"><textarea v-model="introduction" maxlength="300" rows="5" aria-label="跑者介绍" placeholder="写写你的跑步经历、目标，或喜欢的路线" /><span>{{ introduction.length }} / 300</span><p v-if="saveError" role="alert">{{ saveError }}</p><div><button type="button" :disabled="saving" @click="editing = false">取消</button><button type="submit" class="save-intro" :disabled="saving">{{ saving ? '保存中…' : '保存介绍' }}</button></div></form><p v-else class="profile-intro">{{ profile.user.introduction || (profile.mine ? '写下你的跑步故事，让团友更了解你。' : '这位跑友还没有填写介绍。') }}</p></section>
          <section class="profile-card group-profile-card"><span class="section-kicker">日常的节奏</span><div class="section-heading"><h2>{{ profile.group?.name || '尚未加入训练组' }}</h2><span class="group-emblem"><RunnerIcon name="footprints" /></span></div><p v-if="profile.group?.pace" class="group-target"><small>常用配速</small><b>{{ profile.group.pace }}</b></p><p class="group-description">{{ profile.group?.description || (profile.group ? '和组内跑友一起，按自己的节奏积累。' : '由跑团管理员安排常设训练组，活动报名仍可独立选择组别。') }}</p></section>
          <section class="profile-card info-facts"><div><span>团内身份</span><b>{{ profile.user.roleLabel || '成员' }}</b></div><div><span>加入时间</span><b>{{ profile.user.joinedAt?.slice(0, 10) || '—' }}</b></div><div><span>参赛标记</span><button type="button" @click="pickTab('races')">{{ profile.summary?.raceCount || 0 }} 场赛事 <i>›</i></button></div><div><span>团内影像</span><button type="button" @click="pickTab('album')">{{ photoCount }} 张照片<template v-if="videoCount"> · {{ videoCount }} 段视频</template> <i>›</i></button></div></section>
        </template>
        <template v-else-if="tab === 'mileage'">
          <section class="member-volume"><div class="section-heading"><h2>团内跑量</h2><span>本团已计入记录</span></div><nav class="profile-range" aria-label="成员跑量时间范围"><button v-for="item in ranges" :key="item.id" type="button" :class="{ on: range === item.id }" :aria-pressed="range === item.id" @click="pickRange(item.id)">{{ item.label }}</button></nav><div class="profile-period"><button type="button" aria-label="上一统计周期" :disabled="loading || range === 'all'" @click="shiftDate(-1)">‹</button><label><span>{{ profile.period.label }}</span><input v-if="range !== 'all'" type="date" v-model="date" :max="today" aria-label="选择成员跑量统计日期" @change="loadPeriod" /></label><button type="button" aria-label="下一统计周期" :disabled="loading || !canAdvanceMileage(range, date, today)" @click="shiftDate(1)">›</button></div><div class="personal-volume" :aria-busy="loading"><span>{{ range === 'all' ? '累计跑量' : '本期跑量' }} <small>公里</small></span><strong>{{ number(profile.stats.km) }}</strong><div class="personal-metrics"><div><b>{{ profile.stats.times }}</b><span>运动次数</span></div><div><b>{{ profile.stats.days }}</b><span>运动天数</span></div><div><b>{{ duration(profile.stats.durationSec) }}</b><span>运动时长</span></div></div><div class="personal-pace"><span>平均配速</span><b>{{ profile.stats.paceLabel || '—' }} <small v-if="profile.stats.paceLabel">/km</small></b></div></div><p class="volume-note">按本团计入规则统计 · 北京时间</p></section>
          <section class="profile-card member-runs"><div class="section-heading"><h2>运动明细</h2><span>本周期最近 20 次</span></div><article v-for="run in profile.recentRuns || []" :key="run.id" class="member-run"><span class="member-run-date">{{ run.startedAt.slice(5, 10).replace('-', '.') }}<small>{{ run.startedAt.slice(11, 16) }}</small></span><div><b>{{ run.typeLabel }}</b><span>{{ run.durationLabel }}<template v-if="run.paceLabel"> · {{ run.paceLabel }} /km</template></span></div><strong>{{ number(run.km) }}<small>公里</small></strong></article><div v-if="!profile.recentRuns?.length" class="quiet-empty"><RunnerIcon name="stats" /><h3>这个周期，等待下一次出发</h3><p>计入本团的运动记录会出现在这里。</p></div></section>
        </template>
        <template v-else-if="tab === 'races'">
          <section class="chapter-heading"><div><h2>赛道上的约定</h2><p>{{ profile.summary?.raceCount || 0 }} 场参赛标记 · {{ profile.summary?.upcomingRaceCount || 0 }} 场即将到来</p></div><span class="chapter-icon peach"><RunnerIcon name="calendar" /></span></section>
          <nav class="content-filters" aria-label="成员赛事筛选"><button v-for="item in raceFilters" :key="item.id" type="button" :class="{ on: raceFilter === item.id }" :aria-pressed="raceFilter === item.id" @click="raceFilter = item.id">{{ item.label }}</button></nav>
          <router-link v-for="item in visibleRaces" :key="item.race.id" class="profile-race-card" :to="'/races/' + item.race.id"><div class="race-card-meta"><span>{{ item.race.raceDate }}</span><span class="race-status" :class="raceTone(item.status)">{{ item.status }}</span></div><h3>{{ item.race.name }}</h3><p>{{ raceLocation(item.race) }}<span v-if="item.race.kind"> · {{ item.race.kind === 'trail' ? '越野赛' : '路跑赛事' }}</span></p><div class="race-card-bottom"><span>{{ item.results?.length ? item.results.map(row => row.distanceLabel).join(' / ') : item.status === '想跑' ? '心愿清单' : '参赛进度已记录' }}</span><b>{{ item.hasResult ? '查看赛事与成绩' : '查看赛事' }} <i>›</i></b></div></router-link>
          <section v-if="!visibleRaces.length" class="profile-card quiet-empty"><RunnerIcon name="calendar" /><h3>{{ raceFilter ? '这个状态下还没有赛事' : '新的赛道，值得期待' }}</h3><p>{{ raceFilter ? '换个状态看看其他参赛记录。' : '公开赛事中的参赛标记会显示在这里。' }}</p><button v-if="raceFilter" type="button" @click="raceFilter = ''">查看全部赛事</button></section>
        </template>
        <template v-else-if="tab === 'results'">
          <section class="chapter-heading"><div><h2>每一次超越，都有记录</h2><p>{{ profile.summary?.resultCount || 0 }} 条成绩记录 · {{ personalBests.length }} 项个人最佳</p></div><span class="chapter-icon sun"><RunnerIcon name="honors" /></span></section>
          <section v-if="personalBests.length" class="pb-section"><div class="section-heading"><h2>个人最佳 <small>PB</small></h2><span>已记录的线下路跑成绩</span></div><div class="pb-grid"><router-link v-for="item in personalBests" :key="item.distance" class="pb-card" :to="'/races/' + item.race.id"><div><span>{{ item.distanceLabel }}</span><i>PB</i></div><strong>{{ item.clock }}</strong><p>{{ item.race.name }}</p><small>{{ item.race.raceDate }} <span>›</span></small></router-link></div></section>
          <section class="profile-card result-history"><div class="section-heading"><h2>成绩履历</h2><select v-if="resultDistances.length" v-model="resultDistance" aria-label="筛选成绩项目"><option value="">全部项目</option><option v-for="item in resultDistances" :key="item.id" :value="item.id">{{ item.label }}</option></select></div><router-link v-for="item in visibleResults" :key="item.race.id + ':' + item.distance" class="result-row" :to="'/races/' + item.race.id"><span class="result-year">{{ item.race.raceDate?.slice(0, 4) }}<small>{{ item.race.raceDate?.slice(5).replace('-', '.') }}</small></span><span class="result-copy"><b>{{ item.race.name }}</b><span>{{ item.distanceLabel }}<template v-if="item.pace"> · {{ item.pace }} /km</template></span></span><span class="result-clock"><strong>{{ item.clock }}</strong><small v-if="item.pb">个人最佳 PB</small></span></router-link><div v-if="!visibleResults.length" class="quiet-empty"><RunnerIcon name="honors" /><h3>每一份努力，值得记录</h3><p>{{ resultDistance ? '还没有这个项目的成绩，试试其他项目。' : '已记录的公开赛事成绩会展示在这里。' }}</p></div></section>
        </template>
        <template v-else-if="tab === 'album'">
          <section class="chapter-heading"><div><h2>一起跑过的时刻</h2><p>{{ photoCount }} 张照片<template v-if="videoCount"> · {{ videoCount }} 段视频</template> · 本团共享影像</p></div><span class="chapter-icon lilac"><RunnerIcon name="media" /></span></section>
          <section v-for="album in profile.albums || []" :key="album.id" class="profile-album"><div class="section-heading"><div><h2>{{ album.title }}</h2><p>{{ album.date }} · {{ album.photoCount }} 张照片<template v-if="album.videoCount"> / {{ album.videoCount }} 段视频</template></p></div><router-link :to="'/clubs/' + route.params.id + '/activities/' + album.id + '/album'" :aria-label="'打开' + album.title + '完整相册'">{{ profile.mine ? '管理相册' : '相册' }} ›</router-link></div><div class="album-grid"><button v-for="(item, index) in album.items" :key="item.id" type="button" class="album-tile" :class="{ video: item.kind === 'video' }" :aria-label="'查看' + album.title + '的' + (item.kind === 'video' ? '视频' : '照片') + (index + 1)" @click="openMedia(album, item)"><template v-if="item.kind === 'video'"><RunnerIcon name="media" /><span class="video-play">▶</span><small>视频</small></template><img v-else :src="photoUrl(item)" :alt="album.title + ' · 照片 ' + (index + 1)" loading="lazy" /></button></div></section><section v-if="!profile.albums?.length" class="profile-card quiet-empty"><RunnerIcon name="media" /><h3>把一起跑的日子，留在这里</h3><p>这位跑友在本团活动中分享的照片和视频会显示在这里。</p></section>
        </template>
      </div>
      <footer class="member-privacy"><RunnerIcon name="lock" /><span>团内可见的跑者档案</span></footer>
    </template>
    <Teleport to="body"><div v-if="lightbox" ref="lightboxRoot" class="member-lightbox" role="dialog" aria-modal="true" aria-label="团内影像预览" tabindex="-1" @click.self="closeMedia" @keydown.esc.prevent="closeMedia" @keydown.left.prevent="moveMedia(-1)" @keydown.right.prevent="moveMedia(1)" @keydown.tab="trapPreviewFocus"><header><div><b>{{ lightbox.album.title }}</b><span>{{ lightbox.index + 1 }} / {{ lightbox.album.items.length }} · {{ lightbox.album.date }}</span></div><button type="button" aria-label="关闭影像预览" @click="closeMedia">×</button></header><div class="lightbox-content"><video v-if="currentMedia.kind === 'video'" :key="currentMedia.id" :src="photoUrl(currentMedia)" controls playsinline preload="metadata"></video><img v-else :src="photoUrl(currentMedia)" :alt="lightbox.album.title" /></div><nav v-if="lightbox.album.items.length > 1" class="lightbox-nav" aria-label="影像翻页"><button type="button" aria-label="上一张影像" :disabled="lightbox.index === 0" @click="moveMedia(-1)">‹</button><span>{{ currentMedia.kind === 'video' ? '视频' : '照片' }}</span><button type="button" aria-label="下一张影像" :disabled="lightbox.index === lightbox.album.items.length - 1" @click="moveMedia(1)">›</button></nav></div></Teleport>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mediaSrc } from '../api';
import { useClubSession } from '../useClubSession';
import RunnerIcon from '../components/RunnerIcon.vue';
import { memberReturnTo } from '../member-profile-navigation';
import { beijingDay, validMileageDate, canAdvanceMileage, moveMileageDate } from '../club-mileage-utils';
const route = useRoute(), router = useRouter();
const tabs = [{ id: 'info', label: '资料' }, { id: 'mileage', label: '跑量' }, { id: 'races', label: '赛事' }, { id: 'results', label: '成绩' }, { id: 'album', label: '相册' }];
const ranges = [{ id: 'day', label: '日' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }, { id: 'all', label: '累计' }];
const raceFilters = [{ id: '', label: '全部' }, { id: 'upcoming', label: '待参赛' }, { id: 'finished', label: '已完赛' }, { id: 'wanted', label: '想跑' }];
const today = beijingDay();
const tab = ref(tabs.some(x => x.id === route.query.profileTab) ? route.query.profileTab : 'info');
const range = ref(ranges.some(x => x.id === route.query.range) ? route.query.range : 'month');
const date = ref(validMileageDate(route.query.date, today));
const profile = ref(null), loading = ref(false), error = ref(''), editing = ref(false), introduction = ref(''), saving = ref(false), saveError = ref('');
const raceFilter = ref(''), resultDistance = ref(''), lightbox = ref(null), lightboxRoot = ref(null);
let version = 0, previewTrigger = null, bodyOverflow = '';
function closeMedia() { if (!lightbox.value) return; lightbox.value = null; document.body.style.overflow = bodyOverflow; previewTrigger?.focus(); previewTrigger = null; }
function reset() { version++; closeMedia(); profile.value = null; error.value = ''; editing.value = false; introduction.value = ''; saving.value = false; saveError.value = ''; raceFilter.value = ''; resultDistance.value = ''; }
const key = () => route.params.id + ':' + route.params.uid;
const session = useClubSession(reset, key);
const backLink = computed(() => memberReturnTo(route.query.returnTo, route.params.id));
const backLabel = computed(() => backLink.value.includes('tab=km') ? '返回跑量看板' : backLink.value.includes('view=members') || backLink.value.includes('tab=people') ? '返回成员列表' : '返回跑团');
const lifetime = computed(() => profile.value?.mileage?.all || { km: 0, times: 0 });
const personalBests = computed(() => profile.value?.summary?.pb || profile.value?.pbs || []);
const visibleRaces = computed(() => (profile.value?.races || []).filter(item => raceFilter.value === 'finished' ? item.race.raceDate <= today && (item.status === '完赛' || item.hasResult) : raceFilter.value === 'wanted' ? item.status === '想跑' : raceFilter.value === 'upcoming' ? item.race.raceDate > today && !['想跑', '未中签', '弃赛', '未完赛', '完赛'].includes(item.status) : true));
const resultDistances = computed(() => [...new Map((profile.value?.results || []).map(item => [item.distance, { id: item.distance, label: item.distanceLabel }])).values()]);
const visibleResults = computed(() => (profile.value?.results || []).filter(item => !resultDistance.value || item.distance === resultDistance.value));
const photoCount = computed(() => profile.value?.summary?.photoCount || 0), videoCount = computed(() => profile.value?.summary?.videoCount || 0);
const currentMedia = computed(() => lightbox.value?.album.items[lightbox.value.index]);
const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
function duration(value) { const minutes = Math.floor(Number(value || 0) / 60); return Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm'; }
function raceLocation(race) { return [race.province, race.city].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ') || '比赛地点待补充'; }
function raceTone(status) { return ['完赛', '已缴费', '已领物', '中签'].includes(status) ? 'mint' : ['未中签', '未完赛', '弃赛'].includes(status) ? 'muted' : status === '想跑' ? 'lilac' : 'peach'; }
function photoUrl(item) { return mediaSrc(item.id); }
async function updateNavigation() { const query = { ...route.query, profileTab: tab.value, range: range.value, date: date.value }; await router.replace({ path: route.path, query }); }
async function pickTab(value) { closeMedia(); tab.value = value; await updateNavigation(); }
async function load() { date.value = validMileageDate(date.value, today); const current = ++version; loading.value = true; error.value = ''; try { const data = await session.request('/clubs/' + route.params.id + '/members/' + route.params.uid + '/profile?' + new URLSearchParams({ range: range.value, date: date.value })); if (current === version) profile.value = data; } catch (e) { if (!e.stale && current === version) { profile.value = null; error.value = e.message; } } finally { if (current === version) loading.value = false; } }
function loadPeriod() { date.value = validMileageDate(date.value, today); void updateNavigation(); void load(); }
function pickRange(value) { range.value = value; loadPeriod(); }
function shiftDate(direction) { date.value = moveMileageDate(range.value, date.value, direction, today); loadPeriod(); }
function openLifetimeMileage() { range.value = 'all'; tab.value = 'mileage'; loadPeriod(); }
function startEdit() { introduction.value = profile.value.user.introduction || ''; saveError.value = ''; editing.value = true; }
async function saveIntroduction() { if (saving.value || !profile.value?.mine) return; const stamp = session.capture(); saving.value = true; saveError.value = ''; try { const data = await session.request('/me/introduction', { method: 'PUT', body: JSON.stringify({ introduction: introduction.value.trim() }) }); if (session.current(stamp)) { profile.value.user.introduction = data.introduction; editing.value = false; } } catch (e) { if (!e.stale && session.current(stamp)) saveError.value = e.message; } finally { if (session.current(stamp)) saving.value = false; } }
async function openMedia(album, item) { previewTrigger = document.activeElement; bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; lightbox.value = { album, index: album.items.findIndex(row => row.id === item.id) }; await nextTick(); lightboxRoot.value?.focus(); }
function moveMedia(direction) { if (!lightbox.value) return; const index = lightbox.value.index + direction; if (index >= 0 && index < lightbox.value.album.items.length) lightbox.value = { ...lightbox.value, index }; }
function trapPreviewFocus(event) { const elements = [...lightboxRoot.value.querySelectorAll('button:not(:disabled),video[controls]')]; if (!elements.length) { event.preventDefault(); return; } const first = elements[0], last = elements.at(-1), active = document.activeElement; if (event.shiftKey && (active === first || active === lightboxRoot.value)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (active === last || active === lightboxRoot.value)) { event.preventDefault(); first.focus(); } }
watch(key, () => { tab.value = tabs.some(x => x.id === route.query.profileTab) ? route.query.profileTab : 'info'; range.value = ranges.some(x => x.id === route.query.range) ? route.query.range : 'month'; date.value = validMileageDate(route.query.date, today); void load(); }, { immediate: true });
watch(() => route.query.profileTab, value => { if (tabs.some(item => item.id === value)) tab.value = value; });
watch(session.token, load);
onBeforeUnmount(() => { version++; closeMedia(); });
</script>

<style scoped>
.club-member-page { min-height:100dvh; padding-bottom:22px; color:var(--ink); background:var(--bg); }
.club-member-page button { width:auto; font:inherit; cursor:pointer; }
.club-member-page button:disabled { opacity:.4; cursor:default; }
.member-topbar { display:grid; grid-template-columns:38px 1fr 38px; align-items:center; min-height:62px; padding:0 18px; background:#fff; text-align:center; font-size:15px; font-weight:550; }
.member-topbar > a { display:flex; align-items:center; min-height:44px; }
.member-topbar svg { width:22px; height:22px; }
.profile-header-mark { justify-self:end; color:#bac6cf; }
.profile-header-mark svg { width:20px; height:20px; }
.member-profile { padding:18px 22px 0; background:linear-gradient(130deg,#f3f8fb,#fff 74%); }
.profile-identity { display:flex; align-items:center; gap:16px; }
.profile-avatar { display:grid; place-items:center; flex:none; width:72px; height:72px; border:3px solid #fff; border-radius:23px; background:#e8f0f6; color:#7994aa; font-size:29px; font-weight:550; overflow:hidden; box-shadow:0 4px 12px #536e8510; }
.profile-avatar img { width:100%; height:100%; object-fit:cover; }
.profile-identity-copy { flex:1; min-width:0; }
.profile-name { display:flex; align-items:center; gap:7px; }
.profile-name h1 { margin:0; font-size:25px; font-weight:650; letter-spacing:-.6px; overflow-wrap:anywhere; line-height:1.4; }
.me-label { flex:none; padding:2px 5px; border-radius:5px; background:var(--accent-soft); color:var(--accent); font-size:11px; }
.profile-role { display:flex; flex-wrap:wrap; align-items:center; gap:0; margin:7px 0 0; color:#758b98; font-size:12px; line-height:1.7; }
.profile-role span + span::before { content:'·'; margin:0 6px; color:#b6c1c9; }
.profile-joined { margin:5px 0 0; font-size:11px; color:var(--muted); }
.profile-key-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; padding:23px 0 21px; margin-top:19px; border-top:1px solid #edf1f4; }
.profile-key-metrics button { display:grid; justify-items:center; gap:7px; min-width:0; padding:0; text-align:center; background:transparent; }
.profile-key-metrics button+button { border-left:1px solid #edf0f3; }
.profile-key-metrics b { font-size:23px; font-weight:600; letter-spacing:-.6px; font-variant-numeric:tabular-nums; line-height:1.2; overflow-wrap:anywhere; }
.profile-key-metrics span { font-size:11px; color:var(--muted); }
.profile-tabs { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); padding:0 14px; background:#fff; border-bottom:1px solid #eeeef1; }
.profile-tabs button { position:relative; min-height:54px; min-width:0; padding:0 3px; color:var(--muted); font-size:14px; }
.profile-tabs button.on { color:var(--ink); font-weight:600; }
.profile-tabs button.on::after { content:''; position:absolute; bottom:0; left:calc(50% - 9px); width:18px; height:2px; border-radius:2px; background:var(--accent); }
.profile-content { padding:20px 16px 0; }
.profile-card { padding:19px 18px; margin-bottom:14px; border:0; border-radius:17px; background:#fff; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 13px; }
.section-heading h2 { margin:0; font-size:16px; font-weight:600; line-height:1.5; overflow-wrap:anywhere; }
.section-heading > span { flex:none; font-size:11px; color:var(--muted); }
.section-heading > button,.section-heading > a { display:inline-flex; align-items:center; gap:5px; flex:none; min-height:30px; padding:0; color:var(--accent); font-size:12px; }
.section-heading h2 small { font-size:11px; margin-left:4px; color:#ad8750; }
.intro-heading { margin-bottom:9px; }
.intro-heading h2 { font-size:15px; }
.profile-intro { margin:0; color:var(--muted); font-size:13px; line-height:1.95; white-space:pre-wrap; overflow-wrap:anywhere; }
.group-profile-card { background:linear-gradient(125deg,#eef7f3,#fff 85%); }
.section-kicker { display:block; margin-bottom:7px; color:#81968b; font-size:11px; letter-spacing:.6px; }
.group-profile-card .section-heading { margin-bottom:12px; }
.group-profile-card h2 { font-size:20px; letter-spacing:-.4px; }
.group-emblem { display:grid; place-items:center; width:31px; height:31px; border-radius:10px; color:#85a89a; background:#e7f1eb; }
.group-emblem svg { width:18px; height:18px; }
.group-target { display:flex; align-items:baseline; gap:10px; margin:0 0 10px; }
.group-target small { color:#81968b; font-size:11px; }
.group-target b { color:#426c5e; font-size:15px; font-weight:500; }
.group-description { margin:0; color:var(--muted); font-size:12px; line-height:1.9; overflow-wrap:anywhere; }
.info-facts { padding-top:2px; padding-bottom:2px; }
.info-facts > div { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:55px; font-size:12px; }
.info-facts > div+div { border-top:1px solid #f0f0f3; }
.info-facts span { flex:none; color:var(--muted); }
.info-facts b { font-size:12px; font-weight:400; color:var(--ink-secondary); text-align:right; }
.info-facts button { min-height:44px; padding:0; background:transparent; color:var(--ink-secondary); font-size:12px; text-align:right; line-height:1.7; }
.info-facts i { margin-left:5px; color:#aaaab2; font-size:18px; font-style:normal; }
.member-volume { margin-bottom:20px; }
.member-volume > .section-heading { padding:0 2px; }
.member-volume > .section-heading h2 { font-size:18px; }
.profile-range { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; padding:4px; border-radius:11px; background:#fff; }
.profile-range button { min-height:38px; min-width:0; padding:0 4px; border-radius:8px; color:var(--muted); font-size:14px; }
.profile-range button.on { color:var(--accent); background:var(--accent-soft); font-weight:550; }
.profile-period { display:flex; align-items:center; gap:10px; margin:10px 0; }
.profile-period button { width:32px; min-height:36px; padding:0; color:var(--muted); font-size:22px; }
.profile-period label { position:relative; display:grid; place-items:center; flex:1; min-width:0; min-height:36px; overflow:hidden; color:var(--muted); text-align:center; font-size:12px; line-height:1.6; }
.profile-period input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.personal-volume { padding:23px 21px 0; border-radius:17px; background:linear-gradient(130deg,#f0f7fb,#fff 80%); }
.personal-volume > span { color:#7b91a1; font-size:12px; }
.personal-volume > span > small { margin-left:6px; color:var(--muted); font-size:11px; }
.personal-volume > strong { display:block; margin:13px 0 25px; font-size:53px; font-weight:650; letter-spacing:-1.7px; line-height:1.2; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.personal-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; padding-bottom:21px; }
.personal-metrics > div { display:grid; gap:7px; }
.personal-metrics b { font-size:17px; font-weight:550; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.personal-metrics span { font-size:11px; color:var(--muted); }
.personal-pace { display:flex; align-items:center; justify-content:space-between; padding:16px 0; border-top:1px solid #e9edf0; color:var(--muted); font-size:12px; }
.personal-pace b { color:var(--ink); font-size:17px; font-weight:550; }
.personal-pace small { color:var(--muted); font-size:11px; font-weight:400; }
.volume-note { margin:12px 3px 0; color:#96969e; font-size:11px; line-height:1.8; }
.member-runs { padding-bottom:8px; }
.member-runs .section-heading { margin-bottom:10px; }
.member-run { display:flex; align-items:center; gap:12px; padding:17px 0; border-top:1px solid #f0f0f3; }
.member-run-date { display:grid; gap:5px; font-size:13px; font-variant-numeric:tabular-nums; }
.member-run-date small { color:var(--muted); font-size:11px; }
.member-run > div { display:grid; gap:7px; flex:1; min-width:0; }
.member-run > div > b { font-size:13px; font-weight:500; }
.member-run > div > span { color:var(--muted); font-size:11px; line-height:1.6; }
.member-run > strong { font-size:21px; font-weight:600; letter-spacing:-.5px; text-align:right; font-variant-numeric:tabular-nums; }
.member-run > strong small { display:block; margin-top:5px; color:var(--muted); font-size:11px; font-weight:400; letter-spacing:0; }
.chapter-heading { display:flex; align-items:center; justify-content:space-between; gap:15px; margin:3px 2px 18px; }
.chapter-heading > div { min-width:0; }
.chapter-heading h2 { margin:0; font-size:21px; line-height:1.5; letter-spacing:-.5px; font-weight:600; overflow-wrap:anywhere; }
.chapter-heading p { margin:8px 0 0; color:var(--muted); font-size:11px; line-height:1.7; }
.chapter-icon { display:grid; place-items:center; flex:none; width:42px; height:42px; border-radius:14px; }
.chapter-icon svg { width:24px; height:24px; }
.chapter-icon.peach { color:#c97c63; background:#fff0e8; }
.chapter-icon.sun { color:#b48b49; background:#fff5dc; }
.chapter-icon.lilac { color:#9584bc; background:#f1edf9; }
.content-filters { display:flex; gap:8px; margin-bottom:15px; }
.content-filters button { flex:1; min-width:0; min-height:34px; padding:0 9px; border:1px solid #e8e8ed; border-radius:8px; color:var(--muted); background:#fff; font-size:12px; }
.content-filters button.on { color:var(--accent); border-color:#f1c7c1; background:#fff4f1; }
.profile-race-card { display:block; padding:17px 18px 0; margin-bottom:12px; border-radius:15px; color:var(--ink); background:#fff; }
.race-card-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--muted); font-size:11px; }
.race-status { padding:3px 7px; border-radius:5px; font-size:11px; }
.race-status.mint { color:#43856c; background:#edf7f0; }
.race-status.peach { color:#bc7e59; background:#fff2e8; }
.race-status.lilac { color:#927cad; background:#f4effa; }
.race-status.muted { color:#93939c; background:#f5f5f7; }
.profile-race-card h3 { margin:12px 0 8px; font-size:17px; line-height:1.6; font-weight:550; overflow-wrap:anywhere; }
.profile-race-card > p { color:var(--muted); font-size:11px; line-height:1.8; margin:0 0 15px; }
.race-card-bottom { display:flex; align-items:center; justify-content:space-between; gap:9px; min-height:48px; border-top:1px solid #f1f1f4; font-size:11px; line-height:1.7; }
.race-card-bottom > span { min-width:0; color:#92929b; }
.race-card-bottom > b { flex:none; color:var(--accent); font-size:11px; font-weight:400; }
.race-card-bottom i { color:#caa29b; margin-left:5px; font-size:17px; font-style:normal; }
.pb-section { margin:0 0 22px; }
.pb-section > .section-heading { margin:0 2px 13px; }
.pb-section > .section-heading > span { font-size:10px; }
.pb-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.pb-card { display:block; min-width:0; padding:16px 14px 13px; border-radius:14px; color:var(--ink); background:linear-gradient(140deg,#fff8e9,#fff 80%); }
.pb-card > div { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.pb-card > div > span { font-size:12px; color:#8d795e; }
.pb-card i { color:#b39056; font-size:11px; font-style:italic; font-weight:600; letter-spacing:.5px; }
.pb-card strong { display:block; margin:17px 0 12px; font-size:27px; font-weight:650; letter-spacing:-1px; line-height:1.15; font-variant-numeric:tabular-nums; }
.pb-card p { margin:0 0 11px; color:var(--muted); font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.pb-card > small { display:flex; align-items:center; justify-content:space-between; gap:5px; color:#9c9a96; font-size:10px; }
.pb-card > small > span { font-size:16px; }
.result-history { padding:18px 15px 5px; }
.result-history .section-heading { padding:0 2px; margin-bottom:11px; }
.result-history select { max-width:46%; min-width:0; padding:7px 8px; border:1px solid #e9e9ef; border-radius:7px; background:#fff; color:var(--muted); font-size:11px; }
.result-row { display:flex; align-items:center; gap:11px; padding:18px 0; border-top:1px solid #f0f0f3; color:var(--ink); }
.result-year { display:grid; flex:none; gap:5px; font-size:12px; font-weight:500; font-variant-numeric:tabular-nums; }
.result-year small { color:var(--muted); font-size:10px; font-weight:400; }
.result-copy { display:grid; flex:1; min-width:0; gap:7px; }
.result-copy b { font-size:12px; font-weight:500; line-height:1.7; overflow-wrap:anywhere; }
.result-copy > span { color:var(--muted); font-size:10px; line-height:1.5; }
.result-clock { display:grid; flex:none; gap:7px; text-align:right; }
.result-clock strong { font-size:18px; font-weight:600; letter-spacing:-.5px; font-variant-numeric:tabular-nums; }
.result-clock small { color:#b48c47; font-size:10px; }
.profile-album { margin-bottom:24px; }
.profile-album > .section-heading { margin:0 2px 12px; }
.profile-album .section-heading > div { min-width:0; }
.profile-album .section-heading h2 { font-size:15px; line-height:1.7; }
.profile-album .section-heading p { margin:5px 0 0; color:var(--muted); font-size:10px; line-height:1.7; }
.profile-album .section-heading > a { color:#8e869e; font-size:11px; }
.album-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
.album-grid .album-tile { position:relative; display:grid; place-items:center; width:100%; min-width:0; aspect-ratio:1; padding:0; overflow:hidden; border-radius:10px; background:#eaf0f5; }
.album-tile > img { width:100%; height:100%; object-fit:cover; }
.album-tile.video { color:#a99cc0; background:linear-gradient(140deg,#ebe9f7,#f3eff8); }
.album-tile.video > svg { width:39px; height:39px; opacity:.3; }
.video-play { position:absolute; top:calc(50% - 13px); left:calc(50% - 13px); display:grid; place-items:center; width:26px; height:26px; border-radius:50%; padding-left:2px; background:#fff9; color:#8c79aa; font-size:10px; }
.album-tile > small { position:absolute; right:6px; bottom:5px; color:#8c7b9f; font-size:10px; }
.quiet-empty { padding:29px 15px; text-align:center; }
.quiet-empty > svg { width:29px; height:29px; color:#bcc8d2; }
.quiet-empty h3 { margin:17px 0 8px; color:var(--ink-secondary); font-size:15px; font-weight:500; line-height:1.7; }
.quiet-empty p { color:var(--muted); font-size:12px; line-height:1.9; margin:0; }
.quiet-empty > button { min-height:38px; margin-top:10px; padding:0; color:var(--accent); font-size:12px; }
.member-privacy { display:flex; justify-content:center; align-items:center; gap:5px; padding:12px 16px 0; color:#9b9ba4; font-size:10px; }
.member-privacy svg { width:12px; height:12px; }
.member-state { padding:65px 23px; text-align:center; color:var(--muted); font-size:13px; line-height:1.9; }
.member-state h2 { font-size:20px; color:var(--ink); font-weight:550; }
.member-state button { width:auto; min-height:40px; padding:0 15px; background:var(--accent-soft); color:var(--accent); border-radius:9px; font-size:12px; }
.state-symbol,.profile-skeleton { display:grid; place-items:center; width:65px; height:65px; margin:0 auto 15px; border-radius:20px; background:#eaf0f5; color:#9faebb; }
.state-symbol svg { width:28px; height:28px; }
.profile-skeleton { animation:profile-pulse 1.5s ease-in-out infinite; }
.profile-inline-error { margin:14px 16px 0; padding:10px 13px; background:#fff1ef; color:var(--accent); border-radius:9px; font-size:12px; line-height:1.7; }
.profile-inline-error button { color:var(--accent); font-size:12px; text-decoration:underline; }
.intro-editor { margin-top:9px; }
.intro-editor textarea { box-sizing:border-box; width:100%; resize:vertical; padding:11px 12px; border:1px solid var(--line); border-radius:9px; font:inherit; font-size:13px; line-height:1.8; color:var(--ink); background:#fafafb; }
.intro-editor > span { display:block; text-align:right; font-size:11px; color:var(--muted); margin-top:6px; }
.intro-editor > p { font-size:12px; color:var(--accent); line-height:1.8; }
.intro-editor > div { display:flex; justify-content:flex-end; gap:9px; }
.intro-editor button { min-height:38px; padding:0 13px; font-size:12px; color:var(--muted); }
.intro-editor button.save-intro { background:var(--accent); color:#fff; border-radius:8px; }
.member-lightbox { position:fixed; inset:0; z-index:100; display:flex; flex-direction:column; box-sizing:border-box; padding:20px max(17px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)); outline:0; background:#1c2128f5; color:#fff; }
.member-lightbox > header { display:flex; justify-content:space-between; align-items:center; gap:15px; width:min(900px,100%); margin:0 auto 14px; }
.member-lightbox > header > div { min-width:0; display:grid; gap:7px; }
.member-lightbox header b { font-size:14px; font-weight:500; line-height:1.7; overflow-wrap:anywhere; }
.member-lightbox header span { color:#b1b8c0; font-size:11px; }
.member-lightbox header button { flex:none; width:36px; min-height:40px; padding:0; border-radius:9px; color:#d3d8de; font-size:27px; }
.lightbox-content { display:flex; align-items:center; justify-content:center; flex:1; min-height:0; }
.lightbox-content > img,.lightbox-content > video { display:block; max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; }
.lightbox-nav { display:flex; justify-content:space-between; align-items:center; gap:15px; width:min(650px,100%); margin:15px auto 0; }
.lightbox-nav button { width:44px; min-height:42px; border:1px solid #ffffff23; border-radius:10px; color:#e0e3e8; background:#ffffff08; font-size:25px; }
.lightbox-nav button:disabled { opacity:.25; }
.lightbox-nav span { color:#adb5bf; font-size:11px; }
@keyframes profile-pulse { 50% { opacity:.45; } }
@media(prefers-reduced-motion:reduce) { .profile-skeleton { animation:none; } }
@media(min-width:650px) { .profile-content { padding:25px 24px 0; } .member-profile { padding-right:28px; padding-left:28px; } .profile-identity { gap:20px; } .profile-key-metrics { margin-top:24px; } .profile-card { padding:23px; } .pb-grid { gap:14px; } .pb-card { padding:22px; } .pb-card strong { font-size:34px; } .album-grid { gap:11px; } .result-copy b { font-size:14px; } .result-clock strong { font-size:22px; } }
@media(max-width:350px) { .member-topbar { padding:0 14px; } .member-profile { padding:16px 17px 0; } .profile-identity { gap:12px; } .profile-avatar { width:62px; height:62px; border-radius:20px; font-size:25px; } .profile-name h1 { font-size:23px; } .profile-key-metrics b { font-size:21px; } .profile-key-metrics span { font-size:10px; } .profile-content { padding:18px 12px 0; } .profile-card { padding:18px 15px; } .personal-volume { padding-right:18px; padding-left:18px; } .personal-volume > strong { font-size:47px; } .personal-metrics { gap:7px; } .personal-metrics b { font-size:15px; } .member-run { gap:9px; } .chapter-heading h2 { font-size:19px; } .chapter-heading p { font-size:10px; } .chapter-icon { width:35px; height:35px; border-radius:11px; } .chapter-icon svg { width:21px; height:21px; } .pb-grid { gap:8px; } .pb-card { padding:15px 11px 12px; } .pb-card strong { font-size:24px; } .pb-card p { font-size:10px; } .result-history { padding:17px 12px 4px; } .result-row { gap:8px; } .result-copy b { font-size:11px; } .result-clock strong { font-size:16px; } .result-clock small { font-size:10px; } .album-grid { gap:5px; } .album-grid .album-tile { border-radius:8px; } }
</style>
