<template>
  <main class="clubs-page">
    <header class="clubs-header"><h1>跑团</h1><p class="page-eyebrow">和同频的人，一起出发</p></header>

    <section class="my-clubs">
      <div class="section-heading"><h2>我的跑团</h2><span v-if="ready">{{ clubs.length }} 个</span></div>
      <p v-if="loading && !clubs.length" class="loading-state" role="status">正在载入跑团…</p>
      <div v-if="!ready" class="login-guide">
        <span class="club-letter" aria-hidden="true">团</span>
        <div><h3>登录后查看我的跑团</h3><p>团练、赛事与跑步记录都在这里</p></div>
        <router-link class="club-primary" to="/mine">登录</router-link>
      </div>
      <div v-else-if="clubs.length" class="my-club-directory">
        <div v-if="clubs.length > 4" class="my-club-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <input v-model="mineQuery" aria-label="搜索我的跑团" placeholder="搜索名称、城市或团号" />
          <button v-if="mineQuery" type="button" aria-label="清空我的跑团搜索" @click="mineQuery = ''">清空</button>
        </div>
        <p v-if="searchingMine" class="my-search-count" role="status">找到 {{ matchingMyClubs.length }} 个跑团</p>
        <div id="my-club-list" class="my-club-list">
          <article v-for="club in shownMyClubs" :key="club.id" class="my-club">
            <router-link class="club-main" :to="'/clubs/' + club.id" :aria-label="'进入' + club.name"><span class="club-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span><div class="club-copy"><h3>{{ club.name }}</h3><small class="my-club-meta"><span class="my-club-city">{{ club.city || "城市待补充" }}</span><span v-if="club.members !== undefined">· {{ club.members }}人</span><span v-if="club.roleLabel" class="my-role" :class="{ leader: club.role === 'owner' || club.role === 'manager' }">{{ club.roleLabel }}</span></small></div></router-link>
            <div class="club-quick-actions"><router-link :to="'/clubs/' + club.id + '?tab=act'" :aria-label="club.name + '团练'"><span>团练</span></router-link><router-link :to="'/clubs/' + club.id + '?tab=race'" :aria-label="club.name + '赛事'"><span>赛事</span></router-link></div>
          </article>
        </div>
        <p v-if="searchingMine && !matchingMyClubs.length" class="my-search-empty">没有匹配的跑团，试试名称、城市或团号。</p>
        <button v-if="clubs.length > 4 && !searchingMine" class="my-clubs-toggle" type="button" :aria-expanded="mineExpanded" aria-controls="my-club-list" @click="mineExpanded = !mineExpanded">{{ mineExpanded ? '收起跑团' : '展开其余 ' + (clubs.length - 4) + ' 个跑团' }}<span aria-hidden="true">{{ mineExpanded ? '⌃' : '⌄' }}</span></button>
      </div>
      <div v-else-if="ready && !loading && !loadFailed" class="no-club"><div><strong>跑团生活，从一起出发开始</strong><span>搜一搜熟悉的跑团，或输入朋友分享的口令</span></div><a href="#discover-clubs" class="text-link">去发现 ›</a></div>
    </section>

    <router-link class="create-club" to="/clubs/new"><span class="create-mark"><RunnerIcon name="add" /></span><span><strong>{{ application ? '继续创建跑团' : '创建一个新跑团' }}</strong><small>{{ application ? '继续之前未完成的申请' : '把一起跑步的人聚在一起' }}</small></span><b>›</b></router-link>

    <section v-if="pendingClubs.length" class="pending-clubs"><div class="section-heading"><h2>入团审核</h2><span>{{ pendingClubs.length }} 个待处理</span></div><router-link v-for="club in pendingClubs" :key="club.id" class="pending-row" :to="'/clubs/' + club.id + '/public'"><span class="pending-indicator"></span><span>{{ club.name }}<small>申请已提交</small></span><b>审核中 ›</b></router-link></section>

    <section id="discover-clubs" class="discover">
      <div class="directory-heading"><h2>发现跑团</h2><span>找同城跑友</span></div>
      <div class="directory-tools">
        <div class="modes" role="tablist" aria-label="查找方式">
          <button type="button" role="tab" :aria-selected="mode === 'search'" :class="{ on: mode === 'search' }" @click="pick('search')">搜索跑团</button>
          <button type="button" role="tab" :aria-selected="mode === 'code'" :class="{ on: mode === 'code' }" @click="pick('code')">口令加入</button>
        </div>
        <div v-if="mode === 'code'" class="club-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <input v-model="code" aria-label="跑团口令" placeholder="输入朋友分享的跑团口令" @keyup.enter="join" />
          <button type="button" @click="join"><span>查看</span></button>
        </div>
        <div v-else class="search-row">
          <div class="club-search">
            <span class="search-glyph" aria-hidden="true"></span>
            <input v-model="query" aria-label="搜索跑团" placeholder="跑团名称、负责人或团号" @input="onQuery" @keyup.enter="search" />
            <button type="button" @click="search"><span>搜索</span></button>
          </div>
          <div class="city-row"><label class="city-filter"><span class="city-pin" aria-hidden="true"></span><span>活动城市</span><input v-model="city" aria-label="筛选活动城市" maxlength="30" placeholder="不限城市" @input="onQuery" @keyup.enter="search" /></label><button v-if="city.trim()" class="city-reset" type="button" aria-label="清除城市筛选" @click="clearCity">不限</button><button class="city-apply" type="button" aria-label="应用城市筛选" @click="search">筛选<span aria-hidden="true">⌄</span></button></div>
        </div>
        <p v-if="mode === 'code'" class="hint">输入口令查看跑团介绍，再申请加入。</p>
        <div v-if="message" class="directory-message" :class="{ error: loadFailed }" role="status"><p>{{ message }}</p><button v-if="loadFailed" type="button" @click="search">重新加载</button></div>
        <div v-if="mode === 'search'" class="club-results">
          <div v-for="club in shownClubs" :key="club.id" class="club-hit">
            <span class="club-letter result-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
            <div class="club-copy"><router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><strong>{{ club.name }}</strong><small>{{ club.city || "城市待补充" }}<template v-if="club.members !== undefined"> · {{ club.members }} 位成员</template></small></router-link><ClubVerificationBadge :club="club" /></div>
            <router-link class="result-action" :class="{ pending: club.pending && !club.joined, joined: club.joined }" :aria-label="club.joined ? '进入' + club.name : club.pending ? club.name + '审核中' : '查看介绍：' + club.name" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><span>{{ club.joined ? '进入' : club.pending ? '审核中' : '查看' }}</span><RunnerIcon v-if="!club.pending || club.joined" name="arrow" /></router-link>
          </div>
          <p v-if="!loading && !loadFailed && !query.trim() && !openClubs.length" class="hint empty-directory">暂时没有其他跑团，试试朋友分享的口令。</p>
        </div>
        <button v-if="mode === 'search' && (moreCount || page < pages)" class="more" type="button" :disabled="loading" @click="more">{{ loading ? "正在加载…" : moreCount ? "查看其余 " + moreCount + " 个跑团" : "加载更多跑团" }}</button>
      </div>
    </section>

    <router-link v-if="ready" class="my-reports-link" to="/clubs/reports">跑团身份反馈与申诉 ›</router-link>
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
const mineQuery = ref(""), mineExpanded = ref(false);
let queryTimer, loadSeq = 0;
function reset() { loadSeq++; clearTimeout(queryTimer); code.value = ""; query.value = ""; city.value = ""; mineQuery.value = ""; mineExpanded.value = false; showAll.value = false; mode.value = "search"; listedQuery.value = ""; listedCity.value = ""; page.value = 1; pages.value = 1; clubs.value = []; openClubs.value = []; application.value = null; message.value = ""; loading.value = false; loadFailed.value = false; }
const { token, request, capture, current } = useClubSession(reset);
const ready = computed(() => Boolean(token.value));
const searchingMine = computed(() => Boolean(mineQuery.value.trim()));
const matchingMyClubs = computed(() => {
  const needle = mineQuery.value.trim().replace(/^#/, "").toLocaleLowerCase();
  return clubs.value.filter(club => [club.name, club.city, club.cityLabel, club.leader, club.roleLabel, club.id].some(value => String(value ?? "").toLocaleLowerCase().includes(needle)));
});
const shownMyClubs = computed(() => searchingMine.value ? matchingMyClubs.value : mineExpanded.value ? clubs.value : clubs.value.slice(0, 4));
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
    if (me) { clubs.value = (me.clubs || []).map(club => ({ ...club, members: club.members ?? club.memberCount ?? directory.clubs?.find(item => item.id === club.id)?.members })); application.value = me.applications?.[0] || null; }
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
function clearCity() { city.value = ""; return search(); }
function more() { if (moreCount.value) { showAll.value = true; return; } if (!loading.value && page.value < pages.value) { showAll.value = true; load(true); } }
function join() { message.value = ""; if (!code.value.trim()) { message.value = '填写群里的跑团口令'; return; } router.push('/clubs/invite/' + encodeURIComponent(code.value.trim())); }
watch(token, () => load(), { immediate: true });
onBeforeUnmount(() => { clearTimeout(queryTimer); loadSeq++; });
</script>

<style scoped>
.clubs-page { --bg:#f5f5f5; --card:#fff; --ink:#1a1a1a; --ink-secondary:#555555; --muted:#777777; --accent:#ff1838; --accent-soft:#fff0f2; --line:#eeeeee; --field-bg:#f5f5f5; min-height:100vh; padding-bottom:24px; background:var(--bg); color:var(--ink); }
.clubs-page button,.clubs-page a { -webkit-tap-highlight-color:transparent; }
.clubs-page button { min-height:44px; font:inherit; cursor:pointer; }
.clubs-page :is(a,button,input):focus-visible { outline:2px solid #ffb6c0; outline-offset:3px; }
.clubs-header{padding:16px 16px 22px;background:var(--accent);color:#fff}
.clubs-title-line { display:flex; align-items:center; gap:11px; }
.clubs-header h1{margin:0;font-size:24px;font-weight:600;line-height:1.3;letter-spacing:normal}
.page-eyebrow{margin:6px 0 0;color:#ffffffd9;font-size:12px;line-height:1.5}
.my-clubs,.pending-clubs{margin:12px 16px 24px;padding:16px 16px 4px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:none}
.section-heading { display:flex; align-items:center; gap:8px; min-height:25px; margin:0 1px 12px; }
.section-heading h2,.directory-heading h2 { margin:0; color:var(--ink); font-size:18px; font-weight:600; line-height:1.4; }
.section-heading > span{margin-left:auto;color:var(--muted);font-size:12px;line-height:1.4}
.text-link { margin-left:auto; color:#ff1838; font-size:12px; white-space:nowrap; }
.loading-state { margin:0; padding:12px 0; color:var(--muted); font-size:12px; }
.login-guide { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:10px; padding:6px 0 14px; }
.club-letter{display:grid;place-items:center;flex:none;width:40px;height:40px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--field-bg);color:var(--ink);font-size:18px;font-weight:500}
.login-guide h3 { margin:0; font-size:14px; font-weight:600; line-height:1.5; }
.login-guide p { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
.club-primary { display:inline-flex; align-items:center; justify-content:center; min-width:52px; min-height:44px; padding:0 11px; border:1px solid #ffdce2; border-radius:9px; background:var(--accent-soft); color:var(--accent); font-size:13px; font-weight:600; }
.my-club-search { display:flex; align-items:center; gap:10px; min-height:44px; margin-bottom:5px; padding:0 12px; border:1px solid transparent; border-radius:10px; background:var(--field-bg); }
.my-club-search input { width:0; min-width:0; height:42px; flex:1; padding:0; border:0; outline:0; background:transparent; color:var(--ink); font:inherit; font-size:13px; }
.my-club-search input::placeholder,.club-search input::placeholder,.city-filter input::placeholder { color:#999999; }
.my-club-search button { flex:none; min-width:44px; margin-right:-8px; padding:0 7px; border:0; background:transparent; color:var(--muted); font-size:12px; }
.my-club-search:focus-within { border-color:#ffb6c0; }
.my-search-count { margin:10px 0 2px; color:var(--muted); font-size:12px; line-height:1.5; }
.my-search-empty { margin:0; padding:20px 0; color:var(--muted); font-size:13px; line-height:1.6; }
.my-club-list { display:flex; flex-direction:column; }
.my-club{position:relative;display:flex;align-items:center;gap:10px;min-width:0;min-height:80px;color:var(--ink)}
.my-club + .my-club::before { position:absolute; top:0; right:0; left:50px; height:1px; background:var(--line); content:""; }
.club-main { display:flex; flex:1; align-items:center; gap:10px; min-width:0; min-height:64px; padding:8px 0; }
.club-main > .club-copy { flex:1; min-width:0; }
.club-copy { min-width:0; }
.club-copy h3{margin:0;overflow:hidden;color:var(--ink);font-size:15px;font-weight:500;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}
.club-copy small { display:block; margin-top:4px; overflow:hidden; color:var(--muted); font-size:12px; line-height:1.5; text-overflow:ellipsis; white-space:nowrap; }
.club-copy .my-club-meta { display:flex; align-items:center; gap:4px; min-height:19px; overflow:hidden; }
.my-club-meta > span { flex:none; }
.my-club-meta .my-club-city { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.my-role{padding:0 4px;border:1px solid var(--line);border-radius:3px;background:#fff;color:var(--muted);font-size:12px;line-height:18px}
.my-role.leader{border-color:#ffdce2;background:var(--accent-soft);color:var(--accent)}
.club-quick-actions { display:flex; flex:none; align-items:center; gap:4px; }
.club-quick-actions a { display:flex; align-items:center; justify-content:center; width:44px; min-height:44px; color:#555555; font-size:12px; }
.club-quick-actions a > span { display:flex; align-items:center; justify-content:center; width:42px; min-height:30px; border:1px solid #eeeeee; border-radius:8px; background:#fff; }
.club-quick-actions a:active > span { border-color:#ffb6c0; background:#f5f5f5; }
.club-main:active,.result-identity:active { opacity:.72; }
.my-clubs-toggle { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; margin-top:2px; padding:0 8px; border:0; border-top:1px solid var(--line); background:transparent; color:#ff1838; font-size:12px; }
.my-clubs-toggle span { color:#999999; font-size:16px; line-height:1; }
.no-club { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 0 16px; }
.no-club div { display:grid; gap:5px; min-width:0; }
.no-club strong { font-size:14px; font-weight:600; line-height:1.5; }
.no-club span { color:var(--muted); font-size:12px; line-height:1.5; }
.pending-clubs { padding-bottom:12px; }
.pending-clubs .section-heading { margin-bottom:6px; }
.pending-clubs h2 { font-size:16px; }
.pending-row { display:flex; align-items:center; gap:9px; min-height:52px; padding:4px 0; color:var(--ink-secondary); font-size:13px; }
.pending-row + .pending-row { border-top:1px solid var(--line); }
.pending-row > span:nth-child(2) { display:grid; flex:1; gap:3px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pending-row small { color:var(--muted); font-size:12px; }
.pending-row b { flex:none; color:#777777; font-size:12px; font-weight:500; }
.pending-indicator { width:6px; height:6px; flex:none; border-radius:50%; background:#999999; }
.discover { margin:0 16px 16px; scroll-margin-top:14px; }
.directory-heading { display:flex; align-items:center; justify-content:space-between; margin:0 1px 12px; }
.directory-heading > span{color:var(--muted);font-size:12px}
.directory-tools{padding:0 16px 4px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:none}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 0 14px;padding:0;border-radius:0;background:#fff;border-bottom:1px solid var(--line)}
.modes button{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:48px;padding:0 8px;border:0;border-radius:0;background:transparent;color:var(--muted);font-size:14px}
.modes button.on{background:#fff;color:var(--accent);font-weight:500;box-shadow:none}
.modes button.on::before{position:absolute;bottom:0;left:calc(50% - 10px);width:20px;height:2px;background:var(--accent);content:""}
.search-row { display:flex; flex-direction:column; gap:4px; }
.club-search { display:flex; align-items:center; gap:9px; min-height:46px; padding:0 7px 0 12px; border:1px solid #eeeeee; border-radius:10px; background:#fff; }
.search-glyph { position:relative; flex:none; width:12px; height:12px; margin-right:2px; border:1.5px solid #999999; border-radius:50%; }
.search-glyph::after { position:absolute; right:-4px; bottom:-2px; width:5px; height:1.5px; border-radius:1px; background:#999999; content:""; transform:rotate(45deg); }
.club-search input { width:0; min-width:0; height:44px; flex:1; padding:0; border:0; outline:0; background:transparent; color:var(--ink); font:inherit; font-size:13px; }
.club-search button { display:flex; align-items:center; justify-content:center; flex:0 0 52px; width:52px; height:44px; min-width:0; padding:0; border:0; border-radius:8px; background:transparent; color:#fff; font-size:12px; font-weight:600; line-height:1.4; }
.club-search button > span { display:flex; align-items:center; justify-content:center; width:52px; height:32px; border-radius:8px; background:var(--accent); }
.club-search:focus-within { border-color:#ffb6c0; }
.club-search button:active > span { background:#e91432; }
.city-row { display:flex; align-items:center; gap:6px; min-height:44px; border-bottom:1px solid var(--line); }
.city-filter { display:flex; flex:1; align-items:center; gap:8px; min-width:0; min-height:44px; color:var(--muted); font-size:12px; }
.city-filter > span { flex:none; white-space:nowrap; }
.city-pin { position:relative; width:10px; height:12px; border:1.3px solid #999999; border-radius:7px 7px 7px 0; transform:rotate(-45deg); }
.city-pin::after { position:absolute; top:3px; left:3px; width:2px; height:2px; border-radius:50%; background:#999999; content:""; }
.city-filter input { width:0; flex:1; min-width:0; height:42px; padding:0 0 0 2px; border:0; outline:0; background:transparent; color:var(--ink); font:inherit; font-size:12px; }
.city-row:focus-within { border-color:#ffb6c0; }
.city-reset,.city-apply { display:flex; align-items:center; justify-content:center; gap:3px; flex:none; min-width:44px; padding:0 3px; border:0; background:transparent; color:#ff1838; font-size:12px; }
.city-reset { color:var(--muted); }
.club-results { margin-top:2px; }
.club-hit { position:relative; display:flex; align-items:center; gap:10px; min-height:78px; padding:10px 0; }
.club-hit + .club-hit::before { position:absolute; top:0; right:0; left:48px; height:1px; background:var(--line); content:""; }
.result-identity { display:block; min-width:0; }
.result-letter { width:38px; height:38px; border-radius:11px; font-size:16px; }
.club-hit > .club-copy { flex:1; min-width:0; }
.club-copy strong{display:block;overflow:hidden;color:var(--ink);font-size:15px;font-weight:500;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}
.result-action{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;flex:none;min-width:48px;min-height:44px;padding:0;color:var(--accent);font-size:13px;font-weight:400}
.result-action svg { width:13px; height:13px; color:#999999; }
.result-action.joined { color:#ff1838; }
.result-action.joined svg { color:#ff1838; }
.result-action.pending span { padding:4px 6px; border-radius:6px; background:#f5f5f5; color:#777777; font-size:12px; }
.result-action:active { opacity:.6; }
.identity-badge { justify-content:flex-start; min-height:44px!important; padding:0!important; color:#ff1838!important; font-size:12px!important; }
.hint { margin:10px 0; color:var(--muted); font-size:12px; line-height:1.6; }
.directory-message { display:flex; align-items:center; gap:8px; padding:10px 0; color:var(--muted); font-size:12px; }
.directory-message p { flex:1; margin:0; line-height:1.6; }
.directory-message.error { color:var(--accent); }
.directory-message button { flex:none; padding:0; border:0; background:transparent; color:var(--accent); font-size:12px; }
.more { display:flex!important; align-items:center; width:100%; justify-content:center; min-height:44px; padding:0; border:0; border-top:1px solid var(--line); background:transparent; color:#ff1838; font-size:12px; }
.create-club{display:flex;align-items:center;gap:12px;margin:0 16px 24px;padding:16px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);box-shadow:none}
.create-mark{display:grid;place-items:center;flex:none;width:36px;height:36px;border:0;border-radius:8px;background:var(--accent-soft);color:var(--accent)}
.create-mark svg { width:19px; height:19px; }
.create-club > span:nth-child(2) { display:grid; flex:1; gap:4px; min-width:0; }
.create-club strong { font-size:15px; font-weight:500; line-height:1.5; }
.create-club small { color:var(--muted); font-size:12px; line-height:1.5; }
.create-club > b { display:grid; place-items:center; width:26px; height:26px; flex:none; border-radius:50%; background:#fff; color:var(--muted); font-size:20px; font-weight:400; }
.create-club:active { border-color:var(--line); }
.my-reports-link { display:flex; align-items:center; justify-content:center; min-height:44px; color:#999999; font-size:12px; }
@media(max-width:350px) {
  .clubs-header{padding:16px 16px 22px;background:var(--accent);color:#fff}
  .my-clubs,.pending-clubs{margin:12px 16px 24px;padding:16px 16px 4px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:none}
  .my-club{position:relative;display:flex;align-items:center;gap:10px;min-width:0;min-height:80px;color:var(--ink)}
  .club-main { gap:8px; }
  .club-main > .club-letter{display:grid;place-items:center;flex:none;width:40px;height:40px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--field-bg);color:var(--ink);font-size:18px;font-weight:500}
  .club-quick-actions { gap:2px; }
  .club-quick-actions a { width:44px; }
  .club-quick-actions a > span { width:40px; }
  .my-club + .my-club::before { left:44px; }
  .directory-tools{padding:0 16px 4px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:none}
  .club-search { gap:7px; padding-left:10px; }
  .club-search input { font-size:12px; }
  .club-hit { gap:8px; }
  .result-letter { width:36px; height:36px; }
}
</style>
