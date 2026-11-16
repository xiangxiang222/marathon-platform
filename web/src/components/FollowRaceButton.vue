<template>
  <span class="follow-control" :class="{ 'follow-detail': appearance === 'detail', 'follow-list': appearance === 'list' }">
    <button type="button" class="follow-race" :class="{ following: value }" :disabled="busy" :aria-pressed="value" :aria-label="(value ? '取消关注' : '关注') + raceName" @click.stop.prevent="toggle">
      <img v-if="appearance === 'list'" class="follow-art" :src="value ? followActiveIcon : followIcon" alt="" aria-hidden="true" /><svg v-else class="follow-icon" viewBox="0 0 20 20" aria-hidden="true" fill="none"><path v-if="value" d="m4 10 4 4 8-8"/><path v-else d="M6 3.5h8a1 1 0 0 1 1 1V17l-5-3-5 3V4.5a1 1 0 0 1 1-1Z"/></svg>{{ busy ? '保存中' : value ? '已关注' : '关注' }}
    </button>
    <span v-if="error" class="follow-error" role="alert">{{ error }}</span>
  </span>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import followIcon from '../assets/race-actions/follow.svg';
import followActiveIcon from '../assets/race-actions/follow-active.svg';
const props = defineProps({ raceId: { type: [String, Number], required: true }, raceName: { type: String, default: '这场比赛' }, following: Boolean, appearance: { type: String, default: 'compact' } });
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
.follow-icon{width:16px;height:16px;flex:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.follow-detail .follow-race{min-height:44px;min-width:88px;padding:10px 14px;border:1px solid #ff1838;border-radius:24px;color:#ff1838;background:#fff;font-size:13px;font-weight:500;gap:5px}.follow-detail .follow-race.following{border-color:#ececef;background:#f6f6f8;color:#777}.follow-detail .follow-error{max-width:135px}.follow-detail{flex-shrink:0}
.follow-list .follow-race{gap:5px;min-width:88px;min-height:44px;padding:6px 8px;border:1px solid transparent;border-radius:11px;background:transparent;color:#796a72;font-size:12px;font-weight:500;line-height:1.6}
.follow-list .follow-art{display:block;flex:none;width:27px;height:27px;object-fit:contain}
.follow-list .follow-race.following{border-color:#ffe5e9;background:#fff2f4;color:#c63c57}
.follow-list .follow-error{max-width:128px;padding:2px 3px;color:#b63d55;font-size:12px;line-height:1.7;text-align:right}
</style>
