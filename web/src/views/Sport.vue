<template>
  <main class="clubs-page">
    <header class="club-hero"><h1>跑团</h1></header>
    <section class="club-services" aria-labelledby="club-services-title">
      <div class="section-heading"><h2 id="club-services-title">跑团服务</h2><span v-if="ready && mineLoaded">已加入 {{ clubs.length }} 个跑团</span></div>
      <router-link v-if="!ready" class="club-primary" to="/mine">登录查看我的跑团</router-link>
      <a v-else-if="!mineLoaded || clubs.length" class="club-primary" href="#my-run-clubs">查看我的跑团</a>
      <a v-else class="club-primary" href="#discover-clubs">发现跑团</a>
      <div class="club-services-links">
        <a v-if="!ready || !mineLoaded || clubs.length" href="#discover-clubs">发现跑团 <span aria-hidden="true">›</span></a>
        <router-link class="create-club" to="/clubs/new" :aria-label="application ? '继续创建跑团，打开填写页' : '创建跑团，打开填写页'">{{ application ? '继续创建跑团' : '创建跑团' }} <span aria-hidden="true">›</span></router-link>
      </div>
    </section>

    <section v-if="ready" id="my-run-clubs" class="my-clubs service-group" aria-labelledby="my-club-title">
      <div class="section-heading"><h2 id="my-club-title">我的跑团</h2></div>
      <div v-if="mineError" class="directory-message error" role="status"><p>{{ mineError }}</p><button type="button" @click="loadMine">重新加载</button></div>
      <p v-else-if="!mineLoaded" class="loading-state" role="status">正在载入跑团…</p>
      <div v-if="clubs.length" class="my-club-directory">
        <div v-if="clubs.length > 4" class="my-club-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <input v-model="mineQuery" aria-label="搜索我的跑团" placeholder="搜索名称、城市或团号" />
          <button v-if="mineQuery" type="button" aria-label="清空我的跑团搜索" @click="mineQuery = ''">清空</button>
        </div>
        <p v-if="searchingMine" class="my-search-count" role="status">找到 {{ matchingMyClubs.length }} 个跑团</p>
        <div id="my-club-list" class="my-club-list">
          <article v-for="club in shownMyClubs" :key="club.id" class="my-club">
            <router-link class="club-main" :to="'/clubs/' + club.id" :aria-label="'进入' + club.name"><ClubLogo class="club-letter" :src="club.logo" :name="club.name" /><div class="club-copy"><h3>{{ club.name }}</h3><small class="my-club-meta"><span class="my-club-city">{{ club.city || "城市待补充" }}</span><span v-if="club.members !== undefined">· {{ club.members }}人</span><span v-if="club.roleLabel" class="my-role" :class="{ leader: club.role === 'owner' || club.role === 'manager' }">{{ club.roleLabel }}</span></small></div></router-link>
            <div class="club-quick-actions"><router-link :to="'/clubs/' + club.id + '?tab=act'" :aria-label="club.name + '团练'"><span>团练</span></router-link><router-link :to="'/clubs/' + club.id + '?tab=race'" :aria-label="club.name + '赛事'"><span>赛事</span></router-link></div>
          </article>
        </div>
        <p v-if="searchingMine && !matchingMyClubs.length" class="my-search-empty">没有匹配的跑团，试试名称、城市或团号。</p>
        <button v-if="clubs.length > 4 && !searchingMine" class="my-clubs-toggle" type="button" :aria-expanded="mineExpanded" aria-controls="my-club-list" @click="mineExpanded = !mineExpanded">{{ mineExpanded ? '收起跑团' : '展开其余 ' + (clubs.length - 4) + ' 个跑团' }}<span aria-hidden="true">{{ mineExpanded ? '⌃' : '⌄' }}</span></button>
      </div>
      <p v-else-if="mineLoaded && !mineError" class="hint">还没有加入跑团，可以搜索跑团或输入朋友分享的口令。</p>
    </section>

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
          <div class="city-row"><label class="city-filter"><span class="city-pin" aria-hidden="true"></span><span>活动城市</span><input v-model="city" aria-label="筛选活动城市" maxlength="30" placeholder="不限城市" @keyup.enter="search" /></label><button v-if="city.trim()" class="city-reset" type="button" aria-label="清除城市筛选" @click="clearCity">不限</button><button class="city-apply" type="button" aria-label="应用城市筛选" @click="search">筛选<span aria-hidden="true">⌄</span></button></div>
        </div>
        <p v-if="mode === 'code'" class="hint">输入口令查看跑团介绍，再申请加入。</p>
        <p v-if="mode === 'code' && message" class="directory-message" role="status">{{ message }}</p>
        <div v-if="mode === 'search'" class="club-results">
          <div class="results-heading"><h3>搜索结果</h3><span v-if="!loading && !directoryError">{{ directoryTotal }} 个跑团</span></div>
          <p v-if="directoryContext" class="directory-context">{{ directoryContext }}</p>
          <div v-if="directoryError" class="directory-message error" role="status"><p>{{ directoryError }}</p><button type="button" @click="retrySearch">重新加载</button></div>
          <p v-if="loading && !openClubs.length" class="hint" role="status">正在查找跑团…</p>
          <div v-for="club in shownClubs" :key="club.id" class="club-hit">
            <ClubLogo class="club-letter result-letter" :src="club.logo" :name="club.name" />
            <div class="club-copy"><router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><strong>{{ club.name }}</strong><small>{{ club.city || "城市待补充" }}<template v-if="club.members !== undefined"> · {{ club.members }} 位成员</template></small></router-link><ClubVerificationBadge :club="club" /></div>
            <router-link class="result-action" :class="{ pending: club.pending && !club.joined, joined: club.joined }" :aria-label="club.joined ? '进入' + club.name : club.pending ? club.name + '审核中' : '查看介绍：' + club.name" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><span>{{ club.joined ? '进入' : club.pending ? '审核中' : '查看' }}</span><RunnerIcon v-if="!club.pending || club.joined" name="arrow" /></router-link>
          </div>
          <p v-if="!loading && !directoryError && !openClubs.length" class="hint empty-directory">{{ directoryContext ? '没有找到符合条件的跑团' : '暂无公开跑团，可以用口令查看跑团介绍。' }}</p>
        </div>
        <button v-if="mode === 'search' && (moreCount || page < pages)" class="more" type="button" :disabled="loading" @click="more">{{ loading ? "正在加载…" : moreCount ? "查看其余 " + moreCount + " 个跑团" : "加载更多跑团" }}</button>
      </div>
    </section>

    <router-link v-if="ready" class="my-reports-link" to="/clubs/reports">跑团身份反馈与申诉 ›</router-link>
  </main>
</template>

<script setup>
import ClubLogo from "../components/ClubLogo.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useClubSession } from "../useClubSession";
import RunnerIcon from "../components/RunnerIcon.vue";
import ClubVerificationBadge from "../components/ClubVerificationBadge.vue";
const router = useRouter();
const loading = ref(false), directoryError = ref(""), application = ref(null), code = ref(""), query = ref(""), city = ref(""), showAll = ref(false), mode = ref("search"), clubs = ref([]), openClubs = ref([]), listedQuery = ref(""), listedCity = ref(""), message = ref(""), page = ref(1), pages = ref(1), directoryTotal = ref(0);
const mineQuery = ref(""), mineExpanded = ref(false), mineLoaded = ref(false), mineError = ref("");
let queryTimer, loadSeq = 0, mineSeq = 0, retryAppend = false;
function reset() { loadSeq++; mineSeq++; clearTimeout(queryTimer); code.value = ""; query.value = ""; city.value = ""; mineQuery.value = ""; mineExpanded.value = false; mineLoaded.value = false; mineError.value = ""; showAll.value = false; mode.value = "search"; listedQuery.value = ""; listedCity.value = ""; page.value = 1; pages.value = 1; directoryTotal.value = 0; clubs.value = []; openClubs.value = []; application.value = null; message.value = ""; loading.value = false; directoryError.value = ""; }
const { token, request, capture, current } = useClubSession(reset);
const ready = computed(() => Boolean(token.value));
const searchingMine = computed(() => Boolean(mineQuery.value.trim()));
const matchingMyClubs = computed(() => {
  const needle = mineQuery.value.trim().replace(/^#/, "").toLocaleLowerCase();
  return clubs.value.filter(club => [club.name, club.city, club.cityLabel, club.leader, club.roleLabel, club.id].some(value => String(value ?? "").toLocaleLowerCase().includes(needle)));
});
const shownMyClubs = computed(() => searchingMine.value ? matchingMyClubs.value : mineExpanded.value ? clubs.value : clubs.value.slice(0, 4));
const pendingClubs = computed(() => openClubs.value.filter(club => club.pending && !club.joined));
const shownClubs = computed(() => showAll.value ? openClubs.value : openClubs.value.slice(0, 6));
const moreCount = computed(() => showAll.value ? 0 : Math.max(0, openClubs.value.length - 6));
const directoryContext = computed(() => [listedQuery.value && '关键词「' + listedQuery.value + '」', listedCity.value].filter(Boolean).join(' · '));
async function loadMine() {
  if (!ready.value) return;
  const seq = ++mineSeq, stamp = capture();
  mineError.value = "";
  try {
    const me = await request('/me');
    if (seq !== mineSeq || !current(stamp)) return;
    clubs.value = (me.clubs || []).map(club => ({ ...club, members: club.members ?? club.memberCount }));
    mineLoaded.value = true;
    application.value = me.applications?.[0] || null;
  } catch (err) {
    if (seq === mineSeq && !err.stale && current(stamp)) mineError.value = err.message;
  }
}
async function load(append = false, q = query.value.trim(), location = city.value.trim()) {
  const seq = ++loadSeq, stamp = capture(), nextPage = append ? page.value + 1 : 1;
  loading.value = true; directoryError.value = ""; retryAppend = append;
  listedQuery.value = q; listedCity.value = location;
  if (!append) { openClubs.value = []; page.value = 1; pages.value = 1; directoryTotal.value = 0; }
  try {
    const directory = await request('/clubs/directory?' + new URLSearchParams({ q, city: location, page: String(nextPage), pageSize: '20' }));
    if (seq !== loadSeq || !current(stamp)) return;
    const rows = directory.clubs || [];
    openClubs.value = append ? [...openClubs.value, ...rows.filter(club => !openClubs.value.some(item => item.id === club.id))] : rows;
    page.value = directory.page || 1; pages.value = directory.pages || 1;
    directoryTotal.value = directory.total ?? openClubs.value.length;
  } catch (err) { if (!err.stale && seq === loadSeq && current(stamp)) directoryError.value = err.message; }
  finally { if (seq === loadSeq && current(stamp)) loading.value = false; }
}
function pick(next) { mode.value = next; message.value = ""; }
function onQuery() { showAll.value = false; message.value = ""; loadSeq++; clearTimeout(queryTimer); queryTimer = setTimeout(search, query.value.trim() ? 250 : 0); }
function search() { clearTimeout(queryTimer); message.value = ""; showAll.value = false; return load(); }
function clearCity() { city.value = ""; return search(); }
function retrySearch() { return load(retryAppend, listedQuery.value, listedCity.value); }
function more() { if (moreCount.value) { showAll.value = true; return; } if (!loading.value && page.value < pages.value) { showAll.value = true; load(true, listedQuery.value, listedCity.value); } }
function join() { message.value = ""; if (!code.value.trim()) { message.value = '填写群里的跑团口令'; return; } router.push('/clubs/invite/' + encodeURIComponent(code.value.trim())); }
watch(token, () => { loadMine(); load(); }, { immediate: true });
onBeforeUnmount(() => { clearTimeout(queryTimer); loadSeq++; });
</script>

<style scoped>
.clubs-page{--accent:#55388c;--accent-soft:#f3eefc;--ink:#302740;--muted:#655d70;--line:#eae6ef;--field-bg:#f8f6fb;background:#f7f5fa;color:var(--ink);padding-bottom:20px;font-size:14px}
.club-hero{position:relative;min-height:140px;padding:22px 20px 54px;background:radial-gradient(ellipse at 76% 5%,#fcf9ff 0%,#ffffff00 56%),linear-gradient(110deg,#e0d5f3,#e9e2f6 60%,#f3eefc);color:var(--ink)}
.club-hero::after{position:absolute;inset:6px 19px auto auto;width:124px;height:104px;background:url('/images/art-clubs.png') center/contain no-repeat;opacity:.72;content:'';pointer-events:none}
.club-hero h1{position:relative;z-index:1;margin:0;font-size:30px;line-height:1.3;color:inherit}
.club-services,.my-clubs,.pending-clubs,.discover{margin:0 16px 12px;border-radius:18px;background:#fff}
.club-services{position:relative;margin-top:-36px;padding:16px;box-shadow:0 8px 24px #37264d14}
.club-services .section-heading h2{font-size:20px}
.club-services-links{display:flex;gap:8px;margin-top:8px}
.club-services-links a{display:flex;flex:1;align-items:center;justify-content:center;gap:4px;min-height:44px;padding:5px;border-radius:11px;background:var(--accent-soft);color:var(--accent);text-align:center;overflow-wrap:anywhere}
.clubs-page button,.clubs-page a{box-sizing:border-box}.clubs-page button{min-height:44px;font-weight:500}.clubs-page button:focus-visible,.clubs-page a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.my-clubs,.pending-clubs,.discover{padding:14px 16px 10px}.section-heading,.directory-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.section-heading h2,.directory-heading h2{margin:0;font-size:16px;font-weight:600;line-height:1.4}.section-heading>span,.directory-heading>span{font-size:12px;color:var(--muted)}
.loading-state,.hint,.my-search-count,.my-search-empty{color:var(--muted);font-size:12px;line-height:1.7}.loading-state{padding:12px 0}.club-services .club-primary{display:flex;align-items:center;justify-content:center;min-height:48px;padding:8px 12px;border-radius:24px;background:linear-gradient(110deg,#7453b5,var(--accent));color:#fff;font-weight:600}.club-letter{display:grid;place-items:center;flex:none;width:40px;height:40px;border:0;border-radius:8px;background:var(--field-bg);color:var(--ink);font-size:18px;font-weight:500;overflow:hidden}
.my-club-search,.club-search{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 8px 0 12px;border:1px solid transparent;border-radius:8px;background:var(--field-bg)}.my-club-search input,.club-search input{flex:1;width:0;min-width:0;height:44px;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px}.my-club-search button{min-width:44px;padding:0 6px;color:var(--muted);font-size:12px}.my-club-search:focus-within,.club-search:focus-within{border-color:#aa97c7}.search-glyph{position:relative;flex:none;width:12px;height:12px;margin-right:2px;border:1.5px solid #999;border-radius:50%}.search-glyph:after{position:absolute;right:-4px;bottom:-2px;width:5px;height:1.5px;background:#999;transform:rotate(45deg);content:''}
.my-club-list{display:flex;flex-direction:column}.my-club{position:relative;display:flex;align-items:center;gap:8px;min-height:76px}.my-club+.my-club:before,.club-hit+.club-hit:before{position:absolute;top:0;right:0;left:50px;height:1px;background:var(--line);content:''}.club-main{display:flex;flex:1;align-items:center;gap:10px;min-width:0;min-height:64px;padding:8px 0}.club-copy{flex:1;min-width:0}.club-copy h3,.club-copy strong{display:block;margin:0;color:var(--ink);font-size:15px;font-weight:550;line-height:1.45;overflow-wrap:anywhere}.club-copy small{display:block;margin-top:4px;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.6;text-overflow:ellipsis;white-space:nowrap}.club-copy .my-club-meta{display:flex;align-items:center;gap:4px}.my-club-meta>span{flex:none}.my-club-meta .my-club-city{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.my-role{padding:0 4px;border-radius:3px;color:var(--muted);background:var(--field-bg);font-size:12px;line-height:18px}.my-role.leader{color:var(--accent);background:var(--accent-soft)}.club-quick-actions{display:flex;flex:none;gap:4px}.club-quick-actions a{display:flex;align-items:center;justify-content:center;width:44px;min-height:44px;font-size:12px;color:#555}.club-quick-actions a>span{display:flex;align-items:center;justify-content:center;width:42px;min-height:30px;border:1px solid var(--line);border-radius:6px}.my-clubs-toggle,.more{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;border:0;border-top:1px solid var(--line);color:var(--accent);background:transparent;font-size:12px}.my-clubs-toggle span{color:var(--muted)}
.pending-row{display:flex;align-items:center;gap:8px;min-height:52px;font-size:14px}.pending-row+ .pending-row{border-top:1px solid var(--line)}.pending-row>span:nth-child(2){display:grid;flex:1;min-width:0}.pending-row small,.pending-row b{color:var(--muted);font-size:12px;font-weight:400}.pending-indicator{width:5px;height:5px;background:var(--accent);border-radius:50%}
.directory-tools{min-width:0}.modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:3px;gap:4px;margin-bottom:12px;border-radius:13px;background:var(--accent-soft)}.modes button{min-height:44px;padding:0 6px;border-radius:10px;color:var(--muted);font-size:14px}.modes button.on{background:#fff;color:var(--accent);font-weight:600;box-shadow:0 1px 4px #3c29620f}.search-row{display:flex;flex-direction:column;gap:4px}.club-search button{display:flex;align-items:center;justify-content:center;flex:0 0 56px;width:56px;height:44px;padding:0;background:transparent;color:#fff;font-size:14px}.club-search button>span{display:flex;align-items:center;justify-content:center;width:56px;height:34px;background:var(--accent);border-radius:8px}.city-row{display:flex;align-items:center;gap:6px;min-height:44px;border-bottom:1px solid var(--line)}.city-filter{display:flex;align-items:center;flex:1;gap:8px;min-width:0;min-height:44px;color:var(--muted);font-size:12px}.city-filter>span{flex:none;white-space:nowrap}.city-filter input{flex:1;width:0;min-width:0;height:42px;padding:0;border:0;background:transparent;color:var(--ink);font-size:12px}.city-pin{width:10px;height:12px;border:1px solid #999;border-radius:7px 7px 7px 0;transform:rotate(-45deg)}.city-reset,.city-apply{display:flex;align-items:center;justify-content:center;flex:none;min-width:44px;gap:3px;padding:0;color:var(--accent);font-size:12px}.city-reset{color:var(--muted)}.results-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;color:var(--muted);font-size:12px}.results-heading h3{margin:0;color:var(--ink);font-size:15px}.directory-context{padding:7px 9px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.club-hit{position:relative;display:flex;align-items:center;gap:10px;min-height:76px;padding:8px 0}.result-letter{width:40px;height:40px}.result-action{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex:none;min-width:44px;min-height:44px;color:var(--muted);background:transparent;font-size:12px}.result-action svg{width:13px;height:13px}.result-action.joined{color:var(--accent)}.result-action.pending span{padding:4px 6px;border-radius:5px;background:var(--field-bg);font-size:12px}.directory-message{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}.directory-message p{flex:1;line-height:1.7}.directory-message.error,.directory-message button{color:var(--accent)}.directory-message button{font-size:12px}.identity-badge{min-height:44px!important;padding:0!important;font-size:12px!important}.my-reports-link{display:flex;align-items:center;justify-content:center;min-height:44px;color:var(--muted);font-size:12px}
@media(min-width:760px){.club-services,.my-clubs,.pending-clubs,.discover{margin-inline:24px}.club-quick-actions{gap:8px}}
@media(max-width:350px){.club-main{gap:8px}.club-quick-actions{gap:2px}.club-quick-actions a>span{width:40px}}
</style>
