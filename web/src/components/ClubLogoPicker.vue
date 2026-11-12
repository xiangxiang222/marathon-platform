<template>
  <div class="logo-field"><div class="logo-field-heading">跑团头像 / Logo <small>选填</small></div><div class="logo-picker"><ClubLogo :src="modelValue" :name="name" class="logo-preview" /><div class="logo-picker-copy"><div class="logo-actions"><label class="logo-choose" :class="{ disabled: disabled || busy }"><span>{{ busy ? '正在处理…' : modelValue ? '更换 Logo' : '上传 Logo' }}</span><input type="file" aria-label="上传跑团 Logo" accept="image/jpeg,image/png,image/webp" :disabled="disabled || busy" @change="choose" /></label><button v-if="modelValue" class="logo-remove" type="button" :disabled="disabled || busy" @click="remove">移除</button></div><p>支持 JPG、PNG、WebP，保存后显示在跑团名片中。</p></div></div><p v-if="message" class="logo-message" role="status">{{ message }}</p></div>
</template>
<script setup>
import { onBeforeUnmount, ref } from 'vue';
import ClubLogo from './ClubLogo.vue';
import { prepareClubLogo } from '../club-logo';
const props = defineProps({ modelValue: { type:String, default:'' }, name: { type:String, default:'团' }, disabled:Boolean });
const emit = defineEmits(['update:modelValue', 'busy']);
const busy = ref(false), message = ref('');
let version = 0, alive = true;
async function choose(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file || props.disabled || busy.value) return;
  const token = localStorage.getItem('marathon_token'), selected = ++version;
  if (!token) return;
  busy.value = true; message.value = ''; emit('busy', true);
  try { const data = await prepareClubLogo(file); if (alive && selected === version && token === localStorage.getItem('marathon_token')) { emit('update:modelValue', data); message.value = 'Logo 已选好，提交后生效。'; } }
  catch (error) { if (alive && selected === version && token === localStorage.getItem('marathon_token')) message.value = error.message; }
  finally { if (alive && selected === version) { busy.value = false; emit('busy', false); } }
}
function remove() { if (props.disabled || busy.value) return; version++; emit('update:modelValue', ''); message.value = '已移除，提交后生效。'; }
onBeforeUnmount(() => { alive = false; version++; });
</script>
<style scoped>
.logo-field { margin-bottom:24px; }.logo-field-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:12px; color:var(--ink); font-size:14px; }.logo-field-heading small { color:var(--muted); font-size:12px; }.logo-picker { display:flex; align-items:center; gap:12px; }.logo-preview { width:64px; height:64px; border-radius:12px; font-size:24px; }.logo-picker-copy { min-width:0; flex:1; }.logo-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }.logo-field .logo-choose,.logo-remove { position:relative; display:inline-flex; align-items:center; justify-content:center; width:auto; min-height:44px; margin:0; padding:8px 12px; border:1px solid var(--line); border-radius:8px; color:var(--ink); background:var(--card); font-size:13px; font-weight:500; cursor:pointer; }.logo-field .logo-choose input { position:absolute; inset:0; width:100%; height:100%; min-height:0; margin:0; opacity:0; cursor:pointer; }.logo-field .logo-choose span { font-size:13px; }.logo-remove { color:var(--muted); }.logo-picker p,.logo-message { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }.logo-message { margin-top:8px; color:var(--accent); }.logo-choose.disabled { opacity:.55; cursor:default; }
</style>
