<template>
  <header class="large">
    <div>
      <h1>运动</h1>
      <p>跑步和越野。</p>
    </div>
  </header>
  <p v-if="!ready" class="empty">先到「我的」登录。</p>
  <template v-else-if="data">
    <section class="panel">
      <div class="stats3">
        <div><b>{{ data.year.km }}</b><span>今年公里</span></div>
        <div><b>{{ data.year.days }}</b><span>今年天数</span></div>
        <div><b>{{ data.year.count }}</b><span>今年次数</span></div>
      </div>
      <p class="hint">累计 {{ data.total.km }} 公里，{{ data.total.count }} 次。</p>
    </section>
    <section class="block">
      <h2>{{ data.month.id }}</h2>
      <div class="field">
        <input v-model="month" placeholder="2026-10" @change="load" />
      </div>
      <div class="stats3">
        <div><b>{{ data.month.km }}</b><span>公里</span></div>
        <div><b>{{ data.month.days }}/{{ data.month.count }}</b><span>天/次数</span></div>
        <div><b>{{ data.month.paceLabel || "—" }}</b><span>跑步配速</span></div>
      </div>
      <p class="hint">用时 {{ data.month.durationLabel }}</p>
      <p v-if="data.month.target" class="hint">
        本月目标 {{ data.month.target }} 公里
        <template v-if="data.month.percent != null">，完成 {{ data.month.percent }}%</template>
        <template v-if="data.month.observe">。本月观摩，不标未达标</template>
        <template v-else-if="data.month.short">。未达标</template>
      </p>
      <p v-else class="hint">还没有本月目标。下限 {{ data.month.floor }} 公里。</p>
      <form v-if="data.month.canFlag" class="stack" @submit.prevent="saveFlag">
        <div class="modes">
          <button type="button" :class="{ on: gender === '男' }" @click="gender = '男'">男</button>
          <button type="button" :class="{ on: gender === '女' }" @click="gender = '女'">女</button>
          <button type="button" :class="{ on: gender === '' }" @click="gender = ''">不填</button>
        </div>
        <p class="hint">不填性别时，按下限里较高的一个。性别自己选。</p>
        <div class="field">
          <input v-model="target" inputmode="decimal" placeholder="本月目标，公里" />
          <button class="primary" type="submit">设立目标</button>
        </div>
      </form>
    </section>
    <section class="block">
      <h2>记一场</h2>
      <p class="hint">类型只有跑步和越野。配速用用时除以里程。</p>
      <form class="stack" @submit.prevent="create">
        <div class="modes">
          <button type="button" :class="{ on: form.type === 'run' }" @click="form.type = 'run'">跑步</button>
          <button type="button" :class="{ on: form.type === 'trail' }" @click="form.type = 'trail'">越野</button>
        </div>
        <input v-model="form.startedAt" placeholder="开始 2026-10-21 06:00" />
        <input v-model="form.distanceKm" inputmode="decimal" placeholder="里程，公里" />
        <input v-model="form.duration" placeholder="用时 0:50:00" />
        <input v-model="form.climb" inputmode="numeric" placeholder="爬升，米，可写 0" />
        <input v-model="form.city" maxlength="20" placeholder="城市，可不填" />
        <label class="file">截图，可不传<input type="file" accept="image/jpeg,image/png,image/webp" @change="pickShot" /></label>
        <button class="primary" type="submit">记下</button>
      </form>
    </section>
    <article v-for="item in data.runs" :key="item.id" class="block">
      <h2>{{ item.typeLabel }} · {{ item.startedAt }}</h2>
      <p class="hint">里程 {{ item.distanceKm }} 公里 · 跑量 {{ item.volumeKm }} 公里</p>
      <p class="hint">用时 {{ item.durationLabel }}<template v-if="item.paceLabel"> · 配速 {{ item.paceLabel }}</template> · 爬升 {{ item.climb }} 米</p>
      <p v-if="item.city" class="hint">{{ item.city }} · {{ item.sourceLabel }}</p>
      <p v-else class="hint">{{ item.sourceLabel }}</p>
      <p v-if="item.note" class="hint">{{ item.note }}</p>
      <p v-for="club in item.clubs" :key="club.name" class="hint">{{ club.counted ? "计入" : "未计入" }} {{ club.name }}</p>
      <img v-if="item.shot" class="shot" :src="shotSrc(item.id)" alt="" />
      <div class="field">
        <select v-model="item.type">
          <option value="run">跑步</option>
          <option value="trail">越野</option>
        </select>
        <input v-model="item.city" maxlength="20" placeholder="城市" />
        <button type="button" @click="saveRow(item)">保存</button>
      </div>
      <button class="undo" type="button" @click="remove(item)">删除这场</button>
    </article>
    <p v-if="data.runs && !data.runs.length" class="empty">这个月还没有记录。</p>
  </template>
  <section class="block">
    <h2>跑表</h2>
    <div class="slot"><span>高驰</span><b>尚未接入</b></div>
    <div class="slot"><span>佳明</span><b>尚未接入</b></div>
    <div class="slot"><span>华为</span><b>尚未接入</b></div>
    <p class="hint">手填可以继续用。顺序是高驰、佳明、华为。</p>
  </section>
  <section class="block">
    <h2>训练计划</h2>
    <div class="slot"><span>按目标成绩排课</span><b>尚未开通</b></div>
  </section>
  <p v-if="message" class="err">{{ message }}</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api, runShotSrc, upload } from "../api";

const ready = ref(!!localStorage.getItem("marathon_token"));
const data = ref(null);
const message = ref("");
const month = ref(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
const gender = ref("");
const target = ref("");
const shot = ref(null);
const form = ref({ type: "run", startedAt: "", distanceKm: "", duration: "", climb: "0", city: "" });

function shotSrc(id) {
  return runShotSrc(id);
}

async function load() {
  if (!ready.value) return;
  message.value = "";
  data.value = await api("/runs?month=" + encodeURIComponent(month.value));
  gender.value = data.value.month.gender || "";
  target.value = data.value.month.target ? String(data.value.month.target) : "";
}

function pickShot(event) {
  shot.value = event.target.files && event.target.files[0] ? event.target.files[0] : null;
}

async function create() {
  message.value = "";
  try {
    const saved = await api("/runs", {
      method: "POST",
      body: JSON.stringify({
        type: form.value.type,
        startedAt: form.value.startedAt,
        distanceKm: Number(form.value.distanceKm),
        duration: form.value.duration,
        climb: Number(form.value.climb || 0),
        city: form.value.city
      })
    });
    if (shot.value) await upload("/runs/" + saved.run.id + "/shot", shot.value);
    shot.value = null;
    form.value = { type: form.value.type, startedAt: "", distanceKm: "", duration: "", climb: "0", city: "" };
    if (saved.note) message.value = saved.note;
    month.value = saved.run.startedAt.slice(0, 7);
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function saveFlag() {
  message.value = "";
  try {
    await api("/runs-flag", {
      method: "PUT",
      body: JSON.stringify({ month: month.value, targetKm: Number(target.value), gender: gender.value })
    });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function saveRow(item) {
  message.value = "";
  try {
    await api("/runs/" + item.id, { method: "PUT", body: JSON.stringify({ type: item.type, city: item.city }) });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

async function remove(item) {
  message.value = "";
  try {
    await api("/runs/" + item.id, { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(() => {
  load().catch((err) => {
    message.value = err.message;
  });
});
</script>

<style scoped>
.hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.stack input, .field select, .field input { height: 40px; border: 0; border-radius: 12px; padding: 0 12px; background: var(--chip); }
.modes { display: flex; gap: 8px; }
.modes button { height: 32px; padding: 0 14px; border-radius: 999px; background: var(--chip); color: var(--ink); font-weight: 650; }
.modes button.on { background: var(--accent); color: #fff; }
.file { position: relative; overflow: hidden; color: var(--muted); font-size: 13px; }
.file input { position: absolute; inset: 0; opacity: 0; }
.shot { width: 100%; margin-top: 8px; border-radius: 12px; }
.field button { height: 40px; padding: 0 12px; border-radius: 12px; background: #fff; }
</style>
