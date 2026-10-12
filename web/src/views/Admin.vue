<template>
  <main>
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛历后台</h1>
      <span></span>
    </header>
    <div v-if="!authed" class="block">
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
      <div class="block">
        <h2>官网赛历</h2>
        <button class="undo" type="button" @click="logout">退出</button>
        <p class="hint">每一届单独存。中国马拉松官网这场一直有链接。赛事自己的网站，官网给了才记下；没给就空着，也不拿往年的网站来填。每天再对一次，名称、日期、主办、赛事网站有变会标出来。报名时间仍要另写来源，已经记下的截止时间不会被盖掉。</p>
        <form class="check-form" @submit.prevent="search">
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
        <p v-if="message" :class="saved ? 'hint' : 'err'">{{ message }}</p>
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
        <form v-if="row.raceId" class="check-form" @submit.prevent="saveNodes(row)">
          <input v-model="row.regStart" placeholder="报名开始 2026-09-07" />
          <input v-model="row.deadline" placeholder="报名截止 2026-10-28" />
          <input v-model="row.drawAt" placeholder="出签" />
          <input v-model="row.payDeadline" placeholder="缴费截止" />
          <input v-model="row.nodeSource" placeholder="来源，例如最酷，2026-09-07" />
          <button class="primary" type="submit">保存报名节点</button>
        </form>
      </div>
      <p v-if="ready && !rows.length" class="empty">这个范围还没有场。</p>
      <div class="block">
        <h2>赛事手册</h2>
        <p class="hint">已经收入赛历的场留在这里改。名称、日期和报名截止空着不填，就不会盖掉自动拉到的内容。规程用组委会的原图，一页一张。报名、中签、号码、成绩和直播只记链接，站内不报名、不付款。</p>
        <form class="check-form" @submit.prevent="findRaces">
          <input v-model="guideQuery" placeholder="搜赛历里的名称或城市" />
          <button class="primary" type="submit">找这场</button>
        </form>
        <button v-for="item in guideHits" :key="item.id" class="hit" type="button" @click="openGuide(item.id)">
          {{ item.raceDate }} · {{ item.name }}
        </button>
        <form v-if="book" class="check-form" @submit.prevent="saveGuide">
          <input v-model="book.name" placeholder="赛事名称" />
          <input v-model="book.province" placeholder="省份" />
          <input v-model="book.city" placeholder="城市" />
          <input v-model="book.place" placeholder="地点，例如厦门国际会展中心" />
          <p class="hint">计时项目</p>
          <div class="checks">
            <label v-for="item in distanceChoices" :key="item.key"><input v-model="book.distances" type="checkbox" :value="item.key" /> {{ item.label }}</label>
          </div>
          <p class="hint">类型</p>
          <div class="checks">
            <label v-for="item in kindChoices" :key="item.key"><input v-model="book.kinds" type="checkbox" :value="item.key" /> {{ item.label }}</label>
          </div>
          <input v-model="book.groups" placeholder="其他组别，用顿号分开，例如 25公里、50公里" />
          <input v-model="book.startAt" placeholder="起跑 07:00" />
          <input v-model="book.bibAt" placeholder="号码公布 2026-12-10" />
          <input v-model="book.scale" placeholder="规模，例如全程 35000 人" />
          <input v-model="book.fee" placeholder="报名费，例如中国籍 200 元" />
          <input v-model="book.phone" placeholder="咨询电话" />
          <input v-model="book.signupUrl" placeholder="报名链接 https://" />
          <input v-model="book.drawUrl" placeholder="查中签链接 https://" />
          <input v-model="book.bibUrl" placeholder="查号码链接 https://" />
          <input v-model="book.resultUrl" placeholder="成绩或证书链接 https://" />
          <input v-model="book.liveUrl" placeholder="直播链接 https://" />
          <input v-model="book.eventUrl" placeholder="官网 https://，空着则保留已有网站" />
          <textarea v-model="book.route" rows="3" placeholder="路线，写一句能看懂的"></textarea>
          <textarea v-model="book.pickup" rows="3" placeholder="领物须知"></textarea>
          <textarea v-model="book.pacers" rows="3" placeholder="配速员"></textarea>
          <button class="primary" type="submit">保存手册</button>
        </form>
        <template v-if="book">
          <p class="hint">竞赛规程</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadSheet($event, 'guide')" />
          <div v-for="sheet in book.guide" :key="sheet.id" class="sheet-row">
            <img :src="raceSheetSrc(sheet.id)" alt="规程" />
            <button class="undo" type="button" @click="removeSheet(sheet.id)">删除这一页</button>
          </div>
          <p class="hint">直播二维码，再传一张会换掉上一张</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadSheet($event, 'live')" />
          <div v-if="book.liveSheet" class="sheet-row">
            <img :src="raceSheetSrc(book.liveSheet.id)" alt="直播二维码" />
            <button class="undo" type="button" @click="removeSheet(book.liveSheet.id)">删除二维码</button>
          </div>
        </template>
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
const guideQuery = ref("");
const guideHits = ref([]);
const book = ref(null);
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
    await load();
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
    await load();
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

function blankBook(race) {
  return {
    id: race.id,
    name: race.name,
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
    route: race.route || "",
    pickup: race.pickup || "",
    pacers: race.pacers || "",
    guide: race.guide || [],
    liveSheet: race.liveSheet || null
  };
}

async function findRaces() {
  message.value = "";
  saved.value = false;
  try {
    const data = await admin("/admin/races?q=" + encodeURIComponent(guideQuery.value));
    guideHits.value = data.races || [];
    if (!guideHits.value.length) {
      saved.value = false;
      message.value = "赛历里没有这个名字";
    }
  } catch (err) {
    fail(err);
  }
}

async function openGuide(id) {
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/races/" + id);
    book.value = blankBook(data.race);
  } catch (err) {
    fail(err);
  }
}

async function saveGuide() {
  message.value = "";
  saved.value = false;
  const row = book.value;
  try {
    const data = await admin("/admin/races/" + row.id + "/guide", {
      method: "PUT",
      body: JSON.stringify({
        name: row.name,
        province: row.province,
        city: row.city,
        place: row.place,
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
        route: row.route,
        pickup: row.pickup,
        pacers: row.pacers
      })
    });
    book.value = blankBook(data.race);
    saved.value = true;
    message.value = "手册已记下，报名截止没有改";
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
  load()
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
.check-form input, .check-form textarea { width: 100%; border: 1px solid #e6e8ec; border-radius: 8px; padding: 8px 10px; background: #fff; font: inherit; }
.check-form input { height: 36px; padding: 0 10px; }
.checks { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 14px; }
.checks label { display: flex; align-items: center; gap: 4px; }
.hit { display: block; width: 100%; margin-top: 8px; padding: 8px 0; text-align: left; color: #007aff; }
.sheet-row { margin-top: 8px; }
.sheet-row img { width: 100%; border-radius: 8px; }
.primary { margin-top: 8px; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.statuses { margin-top: 8px; }
.link { display: inline-block; }
a { color: #007aff; }
</style>
