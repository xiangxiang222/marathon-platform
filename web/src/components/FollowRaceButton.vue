<template>
  <span class="follow-control">
    <button type="button" class="follow-race" :class="{ following: value }" :disabled="busy" :aria-pressed="value" :aria-label="(value ? '取消关注' : '关注') + raceName" @click.stop.prevent="toggle">
      <span aria-hidden="true">{{ value ? '★' : '☆' }}</span>{{ busy ? '保存中' : value ? '已关注' : '关注' }}
    </button>
    <span v-if="error" class="follow-error" role="alert">{{ error }}</span>
  </span>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
const props = defineProps({ raceId: { type: [String, Number], required: true }, raceName: { type: String, default: '这场比赛' }, following: Boolean });
const emit = defineEmits(['change']);
const router = useRouter(), value = ref(!!props.following), busy = ref(false), error = ref('');
let sequence = 0, disposed = false;
watch(() => [props.raceId, props.following], () => { sequence++; value.value = !!props.following; busy.value = false; error.value = ''; });
function sync(event) { if (String(event.detail.id) === String(props.raceId)) value.value = !!event.detail.following; }
window.addEventListener('race-follow-changed', sync);
onBeforeUnmount(() => { disposed = true; sequence++; window.removeEventListener('race-follow-changed', sync); });
async function toggle() {
  if (busy.value) return;
  const token = localStorage.getItem('marathon_token');
  if (!token) {
    localStorage.setItem('marathon_return_after_login', '/races/' + encodeURIComponent(props.raceId) + '?follow=1');
    router.push('/mine');
    return;
  }
  const id = String(props.raceId), ticket = ++sequence, following = !value.value;
  busy.value = true; error.value = '';
  try {
    await api('/me/races/' + encodeURIComponent(id) + '/follow', { method: 'PUT', body: JSON.stringify({ following }) });
    if (disposed || ticket !== sequence || token !== localStorage.getItem('marathon_token')) return;
    value.value = following;
    window.dispatchEvent(new CustomEvent('race-follow-changed', { detail: { id, following } }));
    emit('change', following);
  } catch (err) { if (!disposed && ticket === sequence && token === localStorage.getItem('marathon_token')) error.value = err.message; }
  finally { if (!disposed && ticket === sequence) busy.value = false; }
}
</script>
<style scoped>
.follow-control{display:inline-flex;flex-direction:column;align-items:flex-end;gap:3px;max-width:100%}.follow-race{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:44px;min-width:64px;padding:8px 10px;border:1px solid #eee;border-radius:9px;background:#fff;color:#777;font-size:12px;line-height:1.4;white-space:nowrap}.follow-race.following{color:#ff1838;background:#fff1f3;border-color:#ffe0e5}.follow-race:disabled{opacity:.6}.follow-race:focus-visible{outline:2px solid #ff1838;outline-offset:2px}.follow-race>span{font-size:16px}.follow-error{max-width:145px;color:#b8384b;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
</style>
