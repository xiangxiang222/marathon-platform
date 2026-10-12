<template>
  <main class="admin">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛历后台</h1>
      <span></span>
    </header>
    <div v-if="!authed" class="block login">
      <h2>赛历后台</h2>
      <p class="hint">用用户名和密码进入。</p>
      <form class="check-form" @submit.prevent="enter">
        <input v-model="username" autocomplete="username" placeholder="用户名" />
        <input v-model="password" type="password" autocomplete="current-password" placeholder="密码" />
        <button class="primary" type="submit">进入</button>
      </form>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
    <template v-else>
      <p v-if="message" class="banner" :class="{ ok: saved }">{{ message }}</p>
      <div class="desk">
      <div class="desk-main">
      <div class="block">
        <h2>赛历</h2>
        <p class="hint">这些是已经收进赛历的场。自动拉取还在，新的场会补进来。官网没有的，可以手动添加。删掉的场记到已忽略，不会马上又加回来。</p>
        <button type="button" class="add" @click="startDraft">手动添加一场</button>
        <form class="check-form inline-form" @submit.prevent="loadCatalog">
          <input v-model="catalogQuery" placeholder="搜名称、城市" />
          <button class="primary" type="submit">筛选</button>
        </form>
        <div class="statuses">
          <button type="button" class="status" :class="{ on: catalogWhen === 'upcoming' }" @click="setCatalogWhen('upcoming')">即将开赛</button>
          <button type="button" class="status" :class="{ on: catalogWhen === 'all' }" @click="setCatalogWhen('all')">全部</button>
        </div>
        <p v-if="catalogReady" class="hint">{{ catalog.length }} 场</p>
        <div class="race-list">
          <div v-for="item in catalog" :key="item.id" class="race-row" :class="{ on: book && book.id === item.id }">
            <button type="button" class="race-open" @click="openGuide(item.id)">
              <strong>{{ item.raceDate }} · {{ item.city }}</strong>
              <span>{{ item.name }}</span>
            </button>
            <button type="button" class="remove" @click="removeRace(item)">删除</button>
          </div>
        </div>
        <p v-if="catalogReady && !catalog.length" class="empty">这个范围还没有场。</p>
      </div>
      </div>
      <div class="desk-official">
      <div class="block">
        <h2>官网赛历</h2>
        <button class="undo" type="button" @click="logout">退出</button>
        <p class="hint">每一届单独存。中国马拉松官网这场一直有链接。赛事自己的网站，官网给了才记下；没给就空着，也不拿往年的网站来填。每天再对一次，名称、日期、主办、赛事网站有变会标出来。报名时间仍要另写来源，已经记下的截止时间不会被盖掉。</p>
        <form class="check-form inline-form" @submit.prevent="search">
          <input v-model="q" placeholder="向官网查名称，例如璧山" />
          <button class="primary" type="submit">查官网</button>
        </form>
        <button class="undo" type="button" @click="syncAll">拉取即将开赛的场</button>
        <div class="statuses">
          <button v-for="item in filters" :key="item.value" type="button" class="status" :class="{ on: filter === item.value }" @click="setFilter(item.value)">
            {{ item.label }}
          </button>
        </div>
        <p v-if="busy" class="hint">正在向官网要赛历。</p>
        <form class="check-form" @submit.prevent="changePassword">
          <input v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" />
          <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，至少 8 位" />
          <button class="undo" type="submit">修改密码</button>
        </form>
      </div>
      <div v-for="row in rows" :key="row.officialId" class="block">
        <h2>{{ row.name }}</h2>
        <p class="hint">{{ row.raceDate }} · {{ row.province }} {{ row.city }} · {{ row.gradeLabel || "未标类别" }} · {{ row.items || "项目未写" }}</p>
        <p v-if="row.organizer" class="hint">主办 {{ row.organizer }}</p>
        <p v-if="row.scale" class="hint">规模 {{ row.scale }}</p>
        <p v-if="row.webUrl" class="hint"><a :href="row.webUrl" target="_blank" rel="noopener">今年的赛事网站</a></p>
        <p v-else class="hint">{{ row.webNote }}</p>
        <p v-if="row.priorWeb && row.priorWeb.webUrl !== row.webUrl" class="hint">
          <a :href="row.priorWeb.webUrl" target="_blank" rel="noopener">{{ row.priorWeb.raceDate.slice(0, 4) }} 届网站</a>
        </p>
        <p v-for="change in row.changes" :key="change.id" class="warn">{{ change.label }}：{{ change.oldValue || "空" }} → {{ change.newValue || "空" }}</p>
        <p v-if="row.match && !row.raceId" class="hint">赛历里已有这场：{{ row.match.name }}</p>
        <p v-if="row.diffNote" class="warn">{{ row.diffNote }}</p>
        <p class="hint"><a :href="row.detailUrl" target="_blank" rel="noopener">打开官网这场</a></p>
        <button v-if="row.status !== 'published'" class="primary" type="button" @click="publish(row)">
          {{ row.match ? "对上已有赛历" : "收入赛历" }}
        </button>
        <button v-if="row.status !== 'ignored'" class="undo" type="button" @click="ignore(row)">忽略</button>
        <button v-if="row.diffNote" class="undo" type="button" @click="apply(row)">采用官网这次的名称、日期和赛事网站</button>
        <router-link v-if="row.raceId" class="hint link" :to="'/races/' + row.raceId">打开赛历这场</router-link>
        <form v-if="row.raceId" class="check-form node-form" @submit.prevent="saveNodes(row)">
          <input v-model="row.regStart" placeholder="报名开始 2026-09-07" />
          <input v-model="row.deadline" placeholder="报名截止 2026-10-28" />
          <input v-model="row.drawAt" placeholder="出签" />
          <input v-model="row.payDeadline" placeholder="缴费截止" />
          <input v-model="row.nodeSource" class="span" placeholder="来源，例如最酷，2026-09-07" />
          <button class="primary" type="submit">保存报名节点</button>
        </form>
      </div>
      <p v-if="ready && !rows.length" class="empty">这个范围还没有场。</p>
      </div>
      <aside class="desk-side">
      <div class="block">
        <h2>{{ draft ? "手动添加" : "编辑这场" }}</h2>
        <p v-if="!book && !draft" class="hint">点列表里的一场来改，或手动添加官网没有的场。规程用组委会的原图。站内不报名、不付款。</p>
        <form v-if="draft" class="check-form" @submit.prevent="createRace">
          <p class="hint">先记下名称、比赛日和地点。报名时间、链接和规程创建后再补。</p>
          <div class="pair">
            <label class="field span"><span>赛事名称</span><input v-model="draft.name" placeholder="例如 2026 沂水 10 公里" /></label>
            <label class="field"><span>比赛日</span><input v-model="draft.raceDate" placeholder="2026-11-15" /></label>
            <label class="field"><span>起跑</span><input v-model="draft.startAt" placeholder="07:00，可以先空着" /></label>
            <label class="field"><span>省份</span><input v-model="draft.province" placeholder="山东" /></label>
            <label class="field"><span>城市</span><input v-model="draft.city" placeholder="临沂" /></label>
            <label class="field span"><span>地点</span><input v-model="draft.place" placeholder="起点或景区" /></label>
          </div>
          <p class="hint">计时项目</p>
          <div class="checks">
            <label v-for="item in distanceChoices" :key="item.key"><input v-model="draft.distances" type="checkbox" :value="item.key" /> {{ item.label }}</label>
          </div>
          <p class="hint">类型</p>
          <div class="checks">
            <label v-for="item in kindChoices" :key="item.key"><input v-model="draft.kinds" type="checkbox" :value="item.key" /> {{ item.label }}</label>
          </div>
          <label class="field"><span>其他组别</span><input v-model="draft.groups" placeholder="用顿号分开，例如 25公里、50公里" /></label>
          <button class="primary" type="submit">加入赛历</button>
          <button class="undo" type="button" @click="draft = null">取消</button>
        </form>
        <template v-if="book">
          <p class="hint">来源 {{ book.source || "还没写" }}<template v-if="book.updatedAt"> · 更新于 {{ book.updatedAt }}</template></p>
          <router-link class="hint link" :to="'/races/' + book.id">在赛历里打开</router-link>
          <form class="check-form guide-form" @submit.prevent="saveGuide">
            <section class="section">
              <h3>基本信息</h3>
              <div class="pair">
                <label class="field span"><span>赛事名称</span><input v-model="book.name" /></label>
                <label class="field"><span>比赛日</span><input v-model="book.raceDate" placeholder="2026-11-01" /></label>
                <label class="field"><span>起跑</span><input v-model="book.startAt" placeholder="07:00" /></label>
                <label class="field"><span>省份</span><input v-model="book.province" /></label>
                <label class="field"><span>城市</span><input v-model="book.city" /></label>
                <label class="field span"><span>地点</span><input v-model="book.place" placeholder="起点、会展中心或景区" /></label>
                <label class="field span"><span>主办</span><input v-model="book.organizer" placeholder="组委会或公司" /></label>
                <label class="field"><span>类别</span>
                  <select v-model="book.grade">
                    <option v-for="item in gradeChoices" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
              </div>
            </section>
            <section class="section">
              <h3>项目、规模和费用</h3>
              <p class="hint">计时项目</p>
              <div class="checks">
                <label v-for="item in distanceChoices" :key="item.key"><input v-model="book.distances" type="checkbox" :value="item.key" /> {{ item.label }}</label>
              </div>
              <p class="hint">类型</p>
              <div class="checks">
                <label v-for="item in kindChoices" :key="item.key"><input v-model="book.kinds" type="checkbox" :value="item.key" /> {{ item.label }}</label>
              </div>
              <div class="pair">
                <label class="field span"><span>其他组别</span><input v-model="book.groups" placeholder="用顿号分开，例如 25公里、50公里" /></label>
                <label class="field"><span>规模</span><input v-model="book.scale" placeholder="全程 35000 人" /></label>
                <label class="field"><span>报名费</span><input v-model="book.fee" placeholder="中国籍 200 元" /></label>
                <label class="field span"><span>咨询电话</span><input v-model="book.phone" placeholder="只写号码" /></label>
              </div>
            </section>
            <section class="section">
              <h3>报名和查询</h3>
              <p class="hint">日期空着就保持原来的。改了报名时间，要写这次的来源。链接打开赛事自己的页面，这里不报名、不付款。官网和中国马拉松官网的链接空着保存，会留下原来的。</p>
              <div class="pair">
                <label class="field"><span>报名开始</span><input v-model="book.regStart" placeholder="2026-09-07" /></label>
                <label class="field"><span>报名截止</span><input v-model="book.deadline" placeholder="2026-10-28" /></label>
                <label class="field"><span>截止叫什么</span><input v-model="book.deadlineName" placeholder="报名截止" /></label>
                <label class="field"><span>查询中签</span><input v-model="book.drawAt" placeholder="2026-10-22" /></label>
                <label class="field"><span>缴费截止</span><input v-model="book.payDeadline" placeholder="2026-10-25" /></label>
                <label class="field"><span>号码公布</span><input v-model="book.bibAt" placeholder="2026-12-10" /></label>
                <label class="field span"><span>这次的来源</span><input v-model="book.nodeSource" placeholder="规程或官网，写上看到的日期" /></label>
                <label class="field span"><span>报名</span><input v-model="book.signupUrl" placeholder="https://" /></label>
                <label class="field"><span>查中签</span><input v-model="book.drawUrl" placeholder="https://" /></label>
                <label class="field"><span>查号码</span><input v-model="book.bibUrl" placeholder="https://" /></label>
                <label class="field"><span>查成绩或证书</span><input v-model="book.resultUrl" placeholder="https://" /></label>
                <label class="field"><span>直播</span><input v-model="book.liveUrl" placeholder="https://" /></label>
                <label class="field"><span>赛事官网</span><input v-model="book.eventUrl" placeholder="https://" /></label>
                <label class="field span"><span>中国马拉松官网这场</span><input v-model="book.officialUrl" placeholder="https://" /></label>
              </div>
            </section>
            <section class="section">
              <h3>比赛日</h3>
              <div class="pair">
                <label class="field span"><span>路线</span><textarea v-model="book.route" rows="3" placeholder="写一句能看懂的"></textarea></label>
                <label class="field span"><span>领物须知</span><textarea v-model="book.pickup" rows="3"></textarea></label>
                <label class="field span"><span>配速员</span><textarea v-model="book.pacers" rows="3"></textarea></label>
              </div>
            </section>
            <button class="primary" type="submit">保存这场</button>
          </form>
          <section class="section">
            <h3>竞赛规程</h3>
            <p class="hint">按组委会原图一页一张，最多 16 页。奖金和关门时间留在图里。</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadSheet($event, 'guide')" />
            <div class="sheets">
              <div v-for="sheet in book.guide" :key="sheet.id" class="sheet-row">
                <img :src="raceSheetSrc(sheet.id)" alt="规程" />
                <button class="undo" type="button" @click="removeSheet(sheet.id)">删除这一页</button>
              </div>
            </div>
          </section>
          <section class="section">
            <h3>直播二维码</h3>
            <p class="hint">再传一张会换掉上一张。</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadSheet($event, 'live')" />
            <div v-if="book.liveSheet" class="sheet-row">
              <img :src="raceSheetSrc(book.liveSheet.id)" alt="直播二维码" />
              <button class="undo" type="button" @click="removeSheet(book.liveSheet.id)">删除二维码</button>
            </div>
          </section>
        </template>
      </div>
      </aside>
      </div>
    </template>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { adminUpload, api, raceSheetSrc } from "../api";

const token = ref(sessionStorage.getItem("marathon_admin") || "");
const username = ref("");
const password = ref("");
const currentPassword = ref("");
const nextPassword = ref("");
const authed = ref(false);
const q = ref("");
const filter = ref("pending");
const rows = ref([]);
const message = ref("");
const saved = ref(false);
const busy = ref(false);
const ready = ref(false);
const catalog = ref([]);
const catalogQuery = ref("");
const catalogWhen = ref("upcoming");
const catalogReady = ref(false);
const book = ref(null);
const draft = ref(null);
const nodeOrigin = ref("");
const distanceChoices = [
  { key: "full", label: "马拉松" },
  { key: "half", label: "半程" },
  { key: "10k", label: "10公里" },
  { key: "5k", label: "5公里" }
];
const kindChoices = [
  { key: "trail", label: "越野" },
  { key: "ultra", label: "超马" },
  { key: "family", label: "亲子跑" },
  { key: "fun", label: "欢乐跑" }
];
const gradeChoices = [
  { value: "", label: "不标" },
  { value: "A", label: "A 类" },
  { value: "B", label: "B 类" },
  { value: "C", label: "C 类" },
  { value: "TEN", label: "系列赛" }
];
const filters = [
  { label: "待确认", value: "pending" },
  { label: "有变化", value: "changed" },
  { label: "已收入", value: "published" },
  { label: "已忽略", value: "ignored" }
];

function admin(path, options = {}) {
  return api(path, { ...options, adminToken: token.value });
}

function fail(err) {
  saved.value = false;
  message.value = err.message;
}

async function enter() {
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    token.value = data.token;
    password.value = "";
    sessionStorage.setItem("marathon_admin", token.value);
    await Promise.all([load(), loadCatalog()]);
    authed.value = true;
  } catch (err) {
    authed.value = false;
    fail(err);
  }
}

async function logout() {
  try {
    await admin("/admin/logout", { method: "POST", body: "{}" });
  } catch (err) {
    /* 会话失效也离开页面 */
  }
  token.value = "";
  sessionStorage.removeItem("marathon_admin");
  authed.value = false;
  message.value = "";
  saved.value = false;
}

async function changePassword() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/password", {
      method: "POST",
      body: JSON.stringify({ current: currentPassword.value, next: nextPassword.value })
    });
    currentPassword.value = "";
    nextPassword.value = "";
    saved.value = true;
    message.value = "密码已修改";
  } catch (err) {
    fail(err);
  }
}

async function load() {
  const data = await admin("/admin/official?status=" + filter.value + (q.value ? "&q=" + encodeURIComponent(q.value) : ""));
  rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
  ready.value = true;
}

async function setFilter(value) {
  filter.value = value;
  message.value = "";
  saved.value = false;
  try {
    await load();
  } catch (err) {
    fail(err);
  }
}

async function search() {
  message.value = "";
  saved.value = false;
  busy.value = true;
  try {
    const data = await admin("/admin/official/sync", { method: "POST", body: JSON.stringify({ name: q.value }) });
    rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
    ready.value = true;
    saved.value = true;
    message.value = data.changed ? "官网有 " + data.changed + " 场和上次记下的不一样" : "已向官网对过，没有新的变化";
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

async function syncAll() {
  q.value = "";
  filter.value = "pending";
  await search();
}

async function publish(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/publish", { method: "POST", body: "{}" });
    await Promise.all([load(), loadCatalog()]);
  } catch (err) {
    fail(err);
  }
}

async function ignore(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/ignore", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function apply(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/apply", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function saveNodes(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + row.raceId, {
      method: "PUT",
      body: JSON.stringify({
        regStart: row.regStart,
        deadline: row.deadline,
        drawAt: row.drawAt,
        payDeadline: row.payDeadline,
        source: row.nodeSource
      })
    });
    saved.value = true;
    message.value = "报名节点已记下";
  } catch (err) {
    fail(err);
  }
}

function dayOf(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function blankBook(race) {
  return {
    id: race.id,
    name: race.name,
    raceDate: race.raceDate || "",
    province: race.province,
    city: race.city,
    place: race.place,
    distances: [...race.distances],
    kinds: [...race.kinds],
    groups: (race.groups || []).join("、"),
    startAt: race.startAt || "",
    bibAt: race.bibAt || "",
    scale: race.scale || "",
    fee: race.fee || "",
    phone: race.phone || "",
    signupUrl: (race.links.find((item) => item.key === "signup") || {}).url || "",
    drawUrl: (race.links.find((item) => item.key === "draw") || {}).url || "",
    bibUrl: (race.links.find((item) => item.key === "bib") || {}).url || "",
    resultUrl: (race.links.find((item) => item.key === "result") || {}).url || "",
    liveUrl: (race.links.find((item) => item.key === "live") || {}).url || "",
    eventUrl: race.eventUrl || "",
    officialUrl: race.officialUrl || "",
    organizer: race.organizer || "",
    grade: ["A", "B", "C", "TEN"].includes(race.grade) ? race.grade : "",
    source: race.source || "",
    updatedAt: race.updatedAt || "",
    route: race.route || "",
    pickup: race.pickup || "",
    pacers: race.pacers || "",
    guide: race.guide || [],
    liveSheet: race.liveSheet || null,
    regStart: dayOf(race.regStart),
    deadline: dayOf(race.deadline),
    drawAt: dayOf(race.drawAt),
    payDeadline: dayOf(race.payDeadline),
    deadlineName: race.known && race.deadlineName && race.deadlineName !== "报名" ? race.deadlineName : "",
    nodeSource: ""
  };
}

function nodesKey(row) {
  return [row.regStart, row.deadline, row.drawAt, row.payDeadline, row.deadlineName].join("|");
}

function startDraft() {
  book.value = null;
  draft.value = {
    name: "",
    raceDate: "",
    startAt: "",
    province: "",
    city: "",
    place: "",
    distances: [],
    kinds: [],
    groups: ""
  };
}

async function createRace() {
  const row = draft.value;
  message.value = "";
  saved.value = false;
  try {
    const data = await admin("/admin/races", { method: "POST", body: JSON.stringify(row) });
    draft.value = null;
    catalogQuery.value = "";
    catalogWhen.value = row.raceDate >= new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) ? "upcoming" : "all";
    await loadCatalog();
    const opened = await api("/races/" + data.id);
    book.value = blankBook(opened.race);
    nodeOrigin.value = nodesKey(book.value);
    saved.value = true;
    message.value = "已加入赛历，可以继续补报名和规程";
  } catch (err) {
    fail(err);
  }
}

async function loadCatalog() {
  const data = await admin(
    "/admin/races?when=" + catalogWhen.value + (catalogQuery.value ? "&q=" + encodeURIComponent(catalogQuery.value) : "")
  );
  catalog.value = data.races || [];
  catalogReady.value = true;
}

async function setCatalogWhen(value) {
  catalogWhen.value = value;
  try {
    await loadCatalog();
  } catch (err) {
    fail(err);
  }
}

async function removeRace(item) {
  if (!window.confirm("从赛历去掉「" + item.name + "」？标过这场的记录也会去掉，之后不会自动加回来。")) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + item.id, { method: "DELETE" });
    if (book.value && book.value.id === item.id) book.value = null;
    saved.value = true;
    message.value = "已从赛历去掉";
    await loadCatalog();
  } catch (err) {
    fail(err);
  }
}

async function openGuide(id) {
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/races/" + id);
    draft.value = null;
    book.value = blankBook(data.race);
    nodeOrigin.value = nodesKey(book.value);
  } catch (err) {
    fail(err);
  }
}

async function saveGuide() {
  message.value = "";
  saved.value = false;
  const row = book.value;
  if (!row.name.trim()) return fail(new Error("先写赛事名称"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.raceDate.trim())) return fail(new Error("比赛日写成 2026-11-01 这样"));
  if (!row.city.trim() && !row.place.trim()) return fail(new Error("先写城市或地点"));
  if (!row.distances.length && !row.kinds.length && !row.groups.trim()) return fail(new Error("先标一个项目"));
  const nodesTouched = nodesKey(row) !== nodeOrigin.value || row.nodeSource.trim();
  if (nodesTouched && !row.nodeSource.trim()) return fail(new Error("改了报名时间，要写来源"));
  if (nodesTouched && ![row.regStart, row.deadline, row.drawAt, row.payDeadline].some((item) => item.trim())) {
    return fail(new Error("先填写要记的节点"));
  }
  try {
    if (nodesTouched) {
      await admin("/admin/races/" + row.id, {
        method: "PUT",
        body: JSON.stringify({
          regStart: row.regStart,
          deadline: row.deadline,
          drawAt: row.drawAt,
          payDeadline: row.payDeadline,
          deadlineName: row.deadlineName,
          source: row.nodeSource
        })
      });
    }
    const data = await admin("/admin/races/" + row.id + "/guide", {
      method: "PUT",
      body: JSON.stringify({
        name: row.name,
        province: row.province,
        city: row.city,
        place: row.place,
        organizer: row.organizer,
        grade: row.grade,
        distances: row.distances,
        kinds: row.kinds,
        groups: row.groups,
        startAt: row.startAt,
        bibAt: row.bibAt,
        scale: row.scale,
        fee: row.fee,
        phone: row.phone,
        signupUrl: row.signupUrl,
        drawUrl: row.drawUrl,
        bibUrl: row.bibUrl,
        resultUrl: row.resultUrl,
        liveUrl: row.liveUrl,
        eventUrl: row.eventUrl,
        officialUrl: row.officialUrl,
        raceDate: row.raceDate,
        route: row.route,
        pickup: row.pickup,
        pacers: row.pacers
      })
    });
    book.value = blankBook(data.race);
    nodeOrigin.value = nodesKey(book.value);
    saved.value = true;
    message.value = nodesTouched ? "这场和报名节点都记下了" : "这场已记下";
    await loadCatalog();
  } catch (err) {
    fail(err);
  }
}

async function uploadSheet(event, kind) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !book.value) return;
  message.value = "";
  saved.value = false;
  try {
    await adminUpload("/admin/races/" + book.value.id + "/sheets?kind=" + kind, file, token.value);
    await openGuide(book.value.id);
    saved.value = true;
    message.value = kind === "live" ? "直播二维码已换上" : "规程加了一页";
  } catch (err) {
    fail(err);
  }
}

async function removeSheet(id) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + book.value.id + "/sheets/" + id, { method: "DELETE" });
    await openGuide(book.value.id);
  } catch (err) {
    fail(err);
  }
}

if (token.value) {
  Promise.all([load(), loadCatalog()])
    .then(() => {
      authed.value = true;
    })
    .catch(() => {
      token.value = "";
      sessionStorage.removeItem("marathon_admin");
      authed.value = false;
    });
}
</script>

<style scoped>
.hint { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.warn { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input, .check-form textarea, .check-form select { width: 100%; border: 1px solid #e6e8ec; border-radius: 8px; padding: 8px 10px; background: #fff; font: inherit; }
.check-form input, .check-form select { height: 36px; padding: 0 10px; }
.section { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.section h3 { margin: 0 0 8px; font-size: 15px; font-weight: 650; }
.pair { display: grid; grid-template-columns: 1fr; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field > span { font-size: 12px; color: var(--muted); }
.add { margin-top: 8px; color: var(--accent); font-weight: 650; background: transparent; }
.checks { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 14px; }
.checks label { display: flex; align-items: center; gap: 4px; }
.race-list { max-height: 52vh; overflow: auto; margin-top: 4px; }
.race-row { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); }
.race-row.on { background: rgba(0, 122, 255, 0.06); }
.race-open { flex: 1; min-width: 0; text-align: left; padding: 10px 4px; background: transparent; }
.race-open strong { display: block; color: var(--muted); font-size: 12px; font-weight: 600; }
.race-open span { display: block; font-size: 15px; font-weight: 650; }
.remove { flex: none; color: var(--red); font-size: 14px; padding: 8px; background: transparent; }
.sheet-row { margin-top: 8px; }
.sheet-row img { width: 100%; border-radius: 8px; }
.primary { margin-top: 8px; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.statuses { margin-top: 8px; }
.link { display: inline-block; }
a { color: #007aff; }
.banner { margin: 0 16px; padding: 10px 12px; border-radius: 12px; background: #fff; color: var(--red); font-size: 14px; }
.banner.ok { color: #007aff; }
.desk { display: flex; flex-direction: column; }
.desk-side { order: 2; }
.desk-official { order: 3; }
@media (min-width: 900px) {
  .login { max-width: 420px; margin: 64px auto; }
  .desk { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr); align-items: start; }
  .desk-official { grid-column: 1 / -1; }
  .desk-side { position: sticky; top: 64px; max-height: calc(100vh - 88px); overflow: auto; }
  .inline-form { flex-direction: row; align-items: center; }
  .inline-form input { flex: 1; }
  .inline-form .primary { width: auto; margin-top: 0; padding: 0 16px; white-space: nowrap; }
  .pair { grid-template-columns: 1fr 1fr; }
  .pair .span { grid-column: 1 / -1; }
  .sheets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
}
</style>
