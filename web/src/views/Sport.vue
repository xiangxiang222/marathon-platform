<template>
  <main class="clubs-page">
    <header class="clubs-header"><div><p class="page-eyebrow">和跑友一起出发</p><h1>跑团<span>与同频的人，一起跑</span></h1></div><router-link to="/clubs/new" class="find-shortcut"><RunnerIcon name="add" />创建跑团</router-link></header>

    <section class="my-clubs">
      <div class="section-heading"><h2>我的跑团</h2><span v-if="ready">{{ clubs.length }} 个跑团 · 随时切换</span></div>
      <p v-if="loading && !clubs.length" class="loading-state" role="status">正在载入跑团…</p>
      <div v-if="!ready" class="club-panel login-guide">
        <span class="club-letter" aria-hidden="true">团</span>
        <div><h3>和跑友一起，跑得更远</h3><p>登录后查看我的跑团、申请加入并参加团内活动。收到口令也可以先查看跑团介绍。</p></div>
        <router-link class="club-primary" to="/mine">登录</router-link>
      </div>
      <router-link v-for="club in clubs" :key="club.id" :to="'/clubs/' + club.id" class="club-panel my-club">
        <span class="club-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
        <div class="club-copy"><h3>{{ club.name }}</h3><small>{{ club.city || "城市待补充" }} · 负责人 {{ club.leader || "待补充" }} · #{{ club.id }}</small><p><span class="role-badge">{{ club.roleLabel }}</span><span v-if="club.members !== undefined">{{ club.members }} 位成员</span><span v-else>查看活动与跑友</span></p></div>
        <span class="enter-club" aria-hidden="true"><RunnerIcon name="arrow" /></span>
      </router-link>
      <div v-if="ready && !loading && !clubs.length && !loadFailed" class="club-panel no-club"><h3>还没有加入跑团</h3><p>搜一搜熟悉的跑团，或填写朋友分享的口令。</p></div>
    </section>

    <section v-if="pendingClubs.length" class="pending-clubs"><div class="section-heading"><h2>申请进度</h2><span>{{ pendingClubs.length }} 个待审核</span></div><router-link v-for="club in pendingClubs" :key="club.id" class="pending-row" :to="'/clubs/' + club.id + '/public'"><span class="pending-indicator"></span><span>{{ club.name }}<small>申请已送达团长与管理</small></span><b>待审核 ›</b></router-link></section>
    <section id="discover-clubs" class="discover club-panel">
      <div class="section-heading"><h2>找跑团</h2></div>
      <div class="modes" role="tablist" aria-label="查找方式">
        <button type="button" role="tab" :aria-selected="mode === 'search'" :class="{ on: mode === 'search' }" @click="pick('search')">搜索跑团</button>
        <button type="button" role="tab" :aria-selected="mode === 'code'" :class="{ on: mode === 'code' }" @click="pick('code')">跑团口令</button>
      </div>
      <div v-if="mode === 'code'" class="club-search">
        <span class="search-glyph" aria-hidden="true"></span>
        <input v-model="code" aria-label="跑团口令" placeholder="输入朋友分享的跑团口令" @keyup.enter="join" />
        <button type="button" @click="join">查看</button>
      </div>
      <div v-else class="club-search">
        <span class="search-glyph" aria-hidden="true"></span>
        <input v-model="query" aria-label="搜索跑团" placeholder="搜索名称、团长或团号" @input="onQuery" @keyup.enter="search" />
        <button type="button" @click="search">搜索</button>
      </div>
      <label v-if="mode === 'search'" class="city-filter">活动城市<input v-model="city" aria-label="筛选活动城市" maxlength="30" placeholder="全部城市" @input="onQuery" @keyup.enter="search" /></label>
      <p class="hint">{{ mode === 'code' ? '先查看跑团介绍，再申请加入。' : '找到跑团后，申请由团长或跑团管理审核。' }}</p>
      <div v-if="message" class="directory-message" :class="{ error: loadFailed }" role="status"><p>{{ message }}</p><button v-if="loadFailed" type="button" @click="search">重新加载</button></div>
      <div v-if="mode === 'search'" class="club-results">
        <div v-for="club in shownClubs" :key="club.id" class="club-hit">
          <router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">
            <span class="club-letter result-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
            <span class="club-copy"><strong>{{ club.name }}</strong><small>{{ club.city || "城市待补充" }} · 负责人 {{ club.leader || "待补充" }}</small><small>团号 #{{ club.id }}<template v-if="club.members !== undefined"> · {{ club.members }} 位成员</template></small><small v-if="club.intro">{{ club.intro }}</small></span>
          </router-link>
          <ClubVerificationBadge :club="club" />
          <router-link class="result-action" :class="{ pending: club.pending && !club.joined }" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'">{{ club.joined ? '进入' : club.pending ? '待审核' : '查看介绍' }}</router-link>
        </div>
        <p v-if="!loading && !loadFailed && !query.trim() && !openClubs.length" class="hint empty-directory">暂时没有其他跑团，试试朋友分享的口令。</p>
      </div>
      <button v-if="mode === 'search' && (moreCount || page < pages)" class="more" type="button" :disabled="loading" @click="more">{{ loading ? "正在加载…" : moreCount ? "查看其余 " + moreCount + " 个跑团" : "加载更多跑团" }}</button>
    </section>

    <section class="create-club club-panel open-create"><div><h2>和同频的跑友，在这里集合</h2><p>任何已登录跑友都能创建。名称可以重复，团号始终属于这个跑团。</p><p v-if="application">之前申请的「{{ application.name }}」可由你确认后继续创建。</p></div><router-link class="club-primary" to="/clubs/new">{{ application ? '继续创建' : '创建跑团' }} →</router-link></section>
    <router-link v-if="ready" class="my-reports-link" to="/clubs/reports">我的身份反馈与申诉 ›</router-link>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useClubSession } from "../useClubSession";
import RunnerIcon from "../components/RunnerIcon.vue";
import ClubVerificationBadge from "../components/ClubVerificationBadge.vue";
const router = useRouter();
const loading = ref(false), loadFailed = ref(false), application = ref(null), code = ref(""), query = ref(""), city = ref(""), showAll = ref(false), mode = ref("search"), clubs = ref([]), openClubs = ref([]), listedQuery = ref(""), listedCity = ref(""), message = ref(""), page = ref(1), pages = ref(1);
let queryTimer, loadSeq = 0;
function reset() { loadSeq++; code.value = ""; clubs.value = []; openClubs.value = []; application.value = null; message.value = ""; loading.value = false; loadFailed.value = false; }
const { token, request, capture, current } = useClubSession(reset);
const ready = computed(() => Boolean(token.value));
const pendingClubs = computed(() => openClubs.value.filter(club => club.pending && !club.joined));
const shownClubs = computed(() => query.value.trim() !== listedQuery.value || city.value.trim() !== listedCity.value ? [] : showAll.value ? openClubs.value : openClubs.value.slice(0, 6));
const moreCount = computed(() => showAll.value ? 0 : Math.max(0, openClubs.value.length - 6));
async function load(append = false) {
  const seq = ++loadSeq, stamp = capture(), q = query.value.trim(), location = city.value.trim(), nextPage = append ? page.value + 1 : 1;
  loading.value = true; loadFailed.value = false;
  try {
    const jobs = [request('/clubs/directory?' + new URLSearchParams({ q, city: location, page: String(nextPage), pageSize: '20' }))];
    if (ready.value && !append) jobs.push(request('/me'));
    const [directory, me] = await Promise.all(jobs);
    if (seq !== loadSeq || !current(stamp)) return;
    listedQuery.value = q; listedCity.value = location;
    if (me) { clubs.value = (me.clubs || []).map(club => ({ ...club, members: directory.clubs?.find(item => item.id === club.id)?.members })); application.value = me.applications?.[0] || null; }
    if (!ready.value) clubs.value = [];
    openClubs.value = append ? [...openClubs.value, ...(directory.clubs || [])].filter((club, index, rows) => rows.findIndex(item => item.id === club.id) === index) : directory.clubs || [];
    page.value = directory.page || 1; pages.value = directory.pages || 1;
    if (!openClubs.value.length && q) message.value = '没有找到这个跑团';
  } catch (err) { if (!err.stale && seq === loadSeq && current(stamp)) { loadFailed.value = true; message.value = err.message; } }
  finally { if (seq === loadSeq && current(stamp)) loading.value = false; }
}
function pick(next) { mode.value = next; message.value = ""; }
function onQuery() { showAll.value = false; message.value = ""; loadSeq++; clearTimeout(queryTimer); queryTimer = setTimeout(search, query.value.trim() ? 250 : 0); }
function search() { clearTimeout(queryTimer); message.value = ""; showAll.value = false; return load(); }
function more() { if (moreCount.value) { showAll.value = true; return; } if (!loading.value && page.value < pages.value) { showAll.value = true; load(true); } }
function join() { message.value = ""; if (!code.value.trim()) { message.value = '填写群里的跑团口令'; return; } router.push('/clubs/invite/' + encodeURIComponent(code.value.trim())); }
watch(token, () => load(), { immediate: true });
onBeforeUnmount(() => { clearTimeout(queryTimer); loadSeq++; });
</script>

<style scoped>
.clubs-page { min-height: 100vh; padding-bottom: 20px; background: var(--bg); }
.clubs-page button, .clubs-page .club-primary, .clubs-page .result-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; line-height: 1.2; }
.clubs-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 24px; padding: 26px 18px 4px; background: var(--bg); border-bottom: 0; }
.page-eyebrow { margin: 0 0 7px; color: var(--accent); font-size: 12px; font-weight: 600; letter-spacing: 1px; }
.clubs-header h1 { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--ink); font-size: 26px; font-weight:600; line-height: 1.3; }
.clubs-header h1 span { color: var(--muted); font-size: 12px; font-weight: 450; }
.find-shortcut { display:inline-flex;align-items:center;justify-content:center;min-height:44px; flex: none; gap: 4px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; color: var(--ink-secondary); font-size: 12px; font-weight: 600;  border-color: var(--line);}
.find-shortcut svg { width: 16px; height: 16px; }
.my-clubs, .pending-clubs { margin: 0 16px 24px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 1px 12px; }
.section-heading h2 { margin: 0; color: var(--ink); font-size: 18px; font-weight:600; }
.section-heading > span { color: var(--muted); font-size: 12px; }
.club-panel { padding: 17px; border-radius: 18px; background: #fff;  border: 1px solid var(--line);}
.my-club { display: flex; align-items: center; gap: 13px; min-height: 94px; margin-top: 10px; border: 1px solid var(--line); color: var(--ink); transition: border-color .15s; }
.my-club:hover { border-color: #f0b7c1; }
.club-letter { display: grid; place-items: center; flex: none; width: 47px; height: 47px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 22px; font-weight: 700; }
.my-club:nth-of-type(3n) .club-letter { background: var(--chip); color: var(--ink-secondary);  border-radius: 12px;}
.my-club:nth-of-type(3n+1) .club-letter { background: var(--accent-soft); color: var(--accent);  border-radius: 12px;}
.club-copy { flex: 1; min-width: 0; }
.club-copy h3, .club-copy strong, .login-guide h3, .no-club h3 { margin: 0; color: var(--ink); font-size: 16px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.club-copy p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 7px 0 0; color: var(--muted); font-size: 12px; }
.role-badge { display: inline-flex; align-items: center; padding: 2px 6px; border: 1px solid var(--line); border-radius: 6px; color: var(--accent); font-size: 12px; line-height: 1.3;  border-color: #f3d2ce;}
.enter-club { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--field-bg); color: var(--muted); }
.enter-club svg { width: 15px; height: 15px; }
.login-guide { display: grid; grid-template-columns: 47px minmax(0,1fr); gap: 12px; border: 1px solid var(--line); }
.login-guide p, .no-club p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.login-guide .club-primary { grid-column: 1/-1; margin-top: 4px; }
.club-primary { padding: 0 16px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; }
.no-club { padding: 25px 20px; border: 1px dashed #dedfe6; background: #ffffff90; text-align: center; }
.pending-row { display: flex; align-items: center; gap: 10px; min-height: 72px; margin-top: 8px; padding: 14px; border-radius: 13px; background: #fff; color: var(--ink-secondary); font-size: 13px; }
.pending-row > span:nth-child(2) { display: grid; flex: 1; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.pending-row small { color: var(--muted); font-size: 12px; }
.pending-row b { flex: none; color: #c87825; font-size: 12px; font-weight: 450; }
.pending-indicator { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #d5a769; }
.discover, .create-club { margin: 0 16px 16px; }
.discover { scroll-margin-top: 16px; }
.hint { margin: 11px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.modes { display: flex; gap: 22px; margin: 0 0 15px; border-bottom: 1px solid var(--line); }
.clubs-page .modes button { position: relative; padding: 0 1px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 550; }
.modes button.on { color: var(--ink); font-weight: 600; }
.modes button.on::after { content: ''; position: absolute; right: 35%; bottom: -1px; left: 35%; height: 3px; border-radius: 3px; background: var(--accent); }
.club-search { display: flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--field-bg); }
.search-glyph { position: relative; flex: none; width: 13px; height: 13px; margin-right: 3px; border: 1.5px solid var(--muted); border-radius: 50%; }
.search-glyph::after { content: ''; position: absolute; right: -4px; bottom: -2px; width: 5px; height: 1.5px; border-radius: 1px; background: var(--muted); transform: rotate(45deg); }
.club-search input { flex: 1; width: 0; height: 44px; min-height: 0; padding: 0; border: 0; background: transparent; font-size: 12px; }
.club-search:focus-within { border-color: #f18ba0; }
.club-search input:focus { outline: none; }
.club-search button { flex: none; padding: 0 0 0 6px; color: var(--accent); font-size: 12px; font-weight: 600; }
.club-results { margin-top: 11px; }
.club-hit { display: flex; align-items: center; gap: 10px; min-height: 83px; border-bottom: 1px solid var(--line); }
.club-hit:last-child { border-bottom: 0; }
.result-identity { display: flex; flex: 1; min-width: 0; align-items: center; gap: 11px; }
.result-letter { width: 37px; height: 37px; border-radius: 12px 12px 12px 4px; font-size: 17px; background: #f3f4f7; color: var(--muted); }
.club-copy strong { font-size: 14px; font-weight: 550; }
.club-copy small { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.6; overflow-wrap: anywhere; }
.result-action { flex: none; padding: 0 9px; border-radius: 9px; color: var(--accent); background: var(--accent-soft); font-size: 12px; }
.result-action.pending, .pending-label { color: #c87825; background: #fafafa; }
.more { display: flex!important; width: 100%; margin-top: 13px; border-top: 1px solid var(--chip); color: var(--muted); font-size: 12px; }
.create-toggle { justify-content: space-between!important; width: 100%; padding: 0; text-align: left; }
.create-toggle b { display: block; color: var(--ink-secondary); font-size: 14px; font-weight: 550; }
.create-toggle small { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; }
.create-toggle i { color: var(--muted); font-size: 23px; font-style: normal; font-weight: 300; }
.create-content { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--line); }
.create-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.create-form input { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field-bg); font-size: 13px; }
.application { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 14px; }
.pending-label { padding: 3px 7px; border-radius: 5px; font-size: 12px; font-weight: 450; }
.loading-state { margin: 0; padding: 25px 15px; color: var(--muted); font-size: 12px; text-align: center; }
.directory-message { display: flex; align-items: center; gap: 8px; padding: 10px 0; color: var(--muted); font-size: 12px; }
.directory-message p { flex: 1; margin: 0; }
.directory-message.error { color: var(--accent); }
.directory-message button { color: var(--accent); font-size: 12px; }
@media (max-width: 350px) { .clubs-header { padding: 26px 18px 4px;  background: var(--bg); border-bottom: 0;} .clubs-header h1 span { display: block; width: 100%; margin-top: 3px; font-size: 12px; } .find-shortcut { padding: 0 10px;  border-color: var(--line); border-radius: 12px; color: var(--ink-secondary);} .club-panel { padding: 14px;  border-radius: 18px; border: 1px solid var(--line);} .my-clubs,.pending-clubs { margin-right: 12px; margin-left: 12px; } .discover,.create-club { margin-right: 12px; margin-left: 12px; } .club-copy h3 { font-size: 15px; } .my-club { gap: 10px; } .club-search input { font-size: 12px; } }
.city-filter{display:flex;align-items:center;gap:12px;margin-top:12px;color:var(--muted);font-size:12px}.city-filter input{flex:1;min-width:0;min-height:44px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:var(--field-bg);font-size:12px}.open-create h2{font-size:16px;margin:0 0 9px}.open-create p{font-size:12px;line-height:1.85;color:var(--muted);margin:0 0 12px}.open-create .club-primary{width:100%;margin-top:5px}.my-reports-link{display:flex;justify-content:center;align-items:center;min-height:44px;font-size:12px;color:var(--muted)}.club-hit:has(.identity-badge){flex-wrap:wrap;gap:2px 9px;padding:12px 0}.club-hit:has(.identity-badge) .result-identity{flex-basis:calc(100% - 85px)}


/* A fresh club directory, with a warm invitation to create a new group. */
.clubs-page { background:transparent; }.clubs-header { margin-bottom:18px;padding:22px 18px;background:linear-gradient(125deg,#eef8f2,#fff);border:1px solid #d4e8dd;border-radius:0 0 20px 20px; }.clubs-header h1 { color:#2e6556; }
.club-panel.my-club { background:#fff;border-color:#dce9e2;box-shadow:var(--card-shadow,0 4px 16px #454c7008); }.club-panel.my-club:nth-of-type(2n) { background:#fff;border-color:#dde8f4; }
.my-club .club-letter { background:var(--mint-soft,#e9f7f2);color:#337d62; }.my-club:nth-of-type(2n) .club-letter { background:var(--sky-soft,#eaf4ff);color:#3a76a5; }.login-guide,.no-club { background:#fff;border-color:#ecdcc9; }
.discover { background:#fff;border-color:#e2daf0; }.pending-clubs { background:var(--sun-soft,#fff4d7);border-color:#eddfbb; }.result-letter { background:var(--lilac-soft,#f2edff);color:#7960a0; }
@media(max-width:350px) { .clubs-header { padding:20px 14px;gap:10px; }.clubs-header h1 { font-size:25px; } }
</style>
