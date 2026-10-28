<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'overview' || name === 'dashboard'"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></template>
    <template v-else-if="name === 'races' || name === 'flag'"><path d="M5 21V3m0 1h14l-3.5 4 3.5 4H5"/><path d="M9 4v4h4V4m0 4v4h4V8"/></template>
    <template v-else-if="name === 'news'"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h4v4H7zm8 0h2m-2 4h2M7 16h10"/></template>
    <template v-else-if="name === 'users'"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></template>
    <template v-else-if="name === 'clubs'"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2"/></template>
    <template v-else-if="name === 'joins' || name === 'review'"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 12l2 2 4-4m-6 7h6"/></template>
    <template v-else-if="name === 'runs' || name === 'sport'"><circle cx="15" cy="4" r="2"/><path d="m10 8 4-1 3 4 4 1M3 12l5-3 4 5-3 7m4-7 4 3 2 4"/></template>
    <template v-else-if="name === 'shop'"><rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v8h14v-8M12 9v12M12 9H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z"/></template>
    <template v-else-if="name === 'partner'"><path d="m3 7 4-3 5 3 5-3 4 3-2 8-5 5-4-2-5-4zm5-1 4 3 3-2m-6 9 3-5 6 5M3 7l4 4m14-4-3 4"/></template>
    <template v-else-if="name === 'accounts' || name === 'security'"><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/></template>
    <template v-else-if="name === 'refresh'"><path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6"/></template>
    <template v-else-if="name === 'external'"><path d="M14 3h7v7m0-7L10 14m0-10H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/></template>
    <template v-else-if="name === 'logout'"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-13 5 5-5 5m-7-5h12"/></template>
    <template v-else-if="name === 'menu'"><path d="M4 6h16M4 12h16M4 18h16"/></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M6 18 18 6"/></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14m-5-5 5 5-5 5"/></template>
    <template v-else-if="name === 'check'"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></template>
    <template v-else-if="name === 'sync'"><path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6"/></template>
    <template v-else-if="name === 'chevron'"><path d="m9 5 7 7-7 7"/></template>
    <template v-else><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></template>
  </svg>
</template>

<script setup>
defineProps({ name: { type: String, default: "overview" } });
</script>
