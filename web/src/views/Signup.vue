<template>
  <main>
    <header class="topbar">
      <router-link :to="'/clubs/' + clubId + '/activities/' + activityId" aria-label="返回">‹</router-link>
      <h1>报名</h1>
      <span></span>
    </header>
    <form v-if="activity" class="block" @submit.prevent="submit">
      <h2>{{ activity.title }}</h2>
      <p class="hint">{{ viewerName }}</p>
      <p class="hint">昵称用当前登录的，不在这里改。</p>
      <p class="label">性别</p>
      <div class="groups">
        <button v-for="item in genders" :key="item.id" type="button" class="status" :class="{ on: gender === item.id }" @click="gender = item.id">{{ item.label }}</button>
      </div>
      <p class="label">级别，可不选</p>
      <button v-for="item in levels" :key="item.id" type="button" class="level" :class="{ on: level === item.id }" @click="level = level === item.id ? '' : item.id">
        <b>{{ item.id }}</b>
        <span>{{ item.text }}</span>
      </button>
      <p class="label">组别</p>
      <label v-for="group in groups" :key="group.id" class="choice" :class="{ off: group.full }">
        <input v-model="groupId" type="radio" name="group" :value="group.id" :disabled="group.full" />
        <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
        <b>{{ group.signed }}<template v-if="group.capacity">/{{ group.capacity }}</template><template v-else> · 不限</template><template v-if="group.full"> · 已满</template></b>
      </label>
      <p v-if="!groups.length" class="hint">这场没有分组，直接提交。</p>
      <p v-if="activity.cancelHint" class="hint">{{ activity.cancelHint }}。没有退款。</p>
      <button class="primary" type="submit">提交报名</button>
      <p class="hint">请按自己的情况选择组别。</p>
    </form>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";

const route = useRoute();
const router = useRouter();
const clubId = route.params.id;
const activityId = route.params.aid;
const activity = ref(null);
const groups = ref([]);
const levels = ref([]);
const viewerName = ref("");
const gender = ref("");
const level = ref("");
const groupId = ref(0);
const message = ref("");
const genders = [
  { id: "男", label: "男" },
  { id: "女", label: "女" },
  { id: "", label: "不填" }
];

async function load() {
  const data = await api("/clubs/" + clubId + "/activities/" + activityId);
  activity.value = data.activity;
  groups.value = data.groups || [];
  levels.value = data.levels || [];
  viewerName.value = data.viewerName || "";
  if (data.activity.mine.signed) {
    router.replace("/clubs/" + clubId + "/activities/" + activityId);
    return;
  }
  const open = groups.value.find((group) => !group.full);
  if (open) groupId.value = open.id;
}

async function submit() {
  message.value = "";
  try {
    await api("/clubs/" + clubId + "/activities/" + activityId + "/signup", {
      method: "POST",
      body: JSON.stringify({ groupId: groupId.value || 0, gender: gender.value, level: level.value })
    });
    router.replace("/clubs/" + clubId + "/activities/" + activityId);
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(load);
</script>

<style scoped>
.hint { margin: 8px 0 0; color: #8d949c; font-size: 13px; line-height: 1.45; }
.label { margin: 14px 0 8px; font-size: 13px; color: #8d949c; }
.groups { display: flex; gap: 8px; }
.level, .choice { display: flex; width: 100%; text-align: left; gap: 8px; margin-top: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(118, 118, 128, 0.12); }
.level { flex-direction: column; }
.level b, .choice span { font-weight: 650; }
.level span, .choice b { color: #8d949c; font-weight: 500; font-size: 13px; }
.level.on, .choice:has(input:checked) { background: #e8f2ff; }
.choice.off { opacity: 0.55; }
.choice input { margin-top: 3px; }
.primary { margin-top: 16px; }
</style>
