<template>
  <main class="not-found">
    <span class="missing-code" aria-hidden="true">404</span>
    <h1>这个页面暂时找不到了</h1>
    <p>链接可能有误，或内容已经调整。回到赛事或跑团继续查看。</p>
    <router-link class="primary" to="/">查看赛事</router-link>
    <router-link class="secondary" to="/clubs">发现跑团</router-link>
  </main>
</template>

<style scoped>
.not-found { max-width: 440px; margin: auto; padding: 100px 24px 48px; text-align: center; }
.missing-code { color: var(--accent); font-size: 64px; line-height: 1.2; font-weight: 700; }
.not-found h1 { margin: 20px 0 10px; font-size: 22px; }
.not-found p { color: var(--muted); font-size: 14px; line-height: 1.8; }
.not-found a { display: block; margin-top: 12px; padding: 13px; border-radius: 8px; text-decoration: none; }
.not-found .primary { color: #fff; background: var(--accent); }
.secondary { color: var(--ink); background: var(--chip); }
</style>
