<template>
  <main class="not-found">
    <div class="recovery-label"><span aria-hidden="true">↗</span><span>页面访问</span></div>
    <h1>这个页面暂时找不到了</h1>
    <p>链接可能有误，或内容已经调整。回到赛事或跑团继续查看。</p>
    <div class="recovery-actions"><router-link class="primary" to="/">查看赛事</router-link>
    <router-link class="secondary" to="/clubs">发现跑团</router-link></div>
  </main>
</template>

<style scoped>
.not-found { max-width: 440px; margin: auto; padding: 100px 24px 48px; text-align: center; }
.missing-code { color: var(--accent); font-size:40px; line-height: 1.2; font-weight: 600; }
.not-found h1 { margin: 20px 0 10px; font-size:22px; }
.not-found p { color: var(--muted); font-size:14px; line-height: 1.8; }
.not-found a { display: block; margin-top: 12px; padding: 13px; border-radius:12px; text-decoration: none;  font-size:14px;}
.not-found .primary { color: #fff; background: var(--accent); }
.secondary { color: var(--ink); background: var(--chip); }


.not-found { background:transparent; }.missing-code { color:var(--muted);text-shadow:3px 3px 0 #f5f5f5; }
</style>

<style scoped src="../personal-ui.css"></style>
<style scoped>
.not-found { max-width:480px; padding:56px 16px; text-align:left; }.recovery-label { display:flex; gap:10px; align-items:center; padding:16px; border-radius:12px; background:linear-gradient(135deg,#fff0f2,#fff); font-size:12px; color:var(--muted); }.recovery-label>span:first-child { color:var(--accent); font-size:24px; }.not-found h1 { margin-top:24px; font-size:24px; font-weight:600; }.recovery-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:24px; }.recovery-actions a { margin:0; min-height:44px; padding:12px; border-radius:8px; text-align:center; }.recovery-actions .secondary { background:#fff; border:1px solid var(--line); }
</style>
