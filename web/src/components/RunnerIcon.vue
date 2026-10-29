<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'stats'"><path d="M4 20h16M6 16v-4m6 4V5m6 11V9"/><path d="m5 7 5-4 5 3 4-3"/></template>
    <template v-else-if="name === 'career'"><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v6m-4 2h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/></template>
    <template v-else-if="name === 'footprints'"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></template>
    <template v-else-if="name === 'honors'"><path d="m7 3 5 8 5-8M3 3h5m8 0h5"/><circle cx="12" cy="15.5" r="5.5"/><path d="m12 12.5.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9 14.6l2-.3Z"/></template>
    <template v-else-if="name === 'media'"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="8" cy="10" r="1.4"/><path d="m4 17 5-5 4 4 3-3 5 5M8 2h8"/></template>
    <template v-else-if="name === 'devices'"><rect x="7" y="6" width="10" height="12" rx="3"/><path d="m9 6 1-4h4l1 4m-6 12 1 4h4l1-4m-5-5 2 1 2-3"/></template>
    <template v-else-if="name === 'help'"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9C12.4 11.6 12 12 12 13m0 3h.01"/></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></template>
    <template v-else-if="name === 'add'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'back'"><path d="m14 5-7 7 7 7"/></template>
    <template v-else-if="name === 'arrow'"><path d="m9 5 7 7-7 7"/></template>
    <template v-else><path d="m4 13 4 4L20 5"/></template>
  </svg>
</template>
<script setup>
defineProps({ name: { type: String, default: 'stats' } });
</script>
