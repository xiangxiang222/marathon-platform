<template>
  <main class="race-page">
    <header class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1>赛事</h1>
      <span></span>
    </header>
    <section v-if="!race" class="race-state" :class="{ 'race-state-error': loadError }" :role="loadError ? 'alert' : 'status'">
      <p>{{ loading ? '正在加载赛事…' : (loadError || '没有找到这场赛事') }}</p>
      <button v-if="!loading" type="button" class="retry-button" @click="retryLoad">重新加载</button>
      <router-link v-if="!loading" to="/">返回赛事列表</router-link>
    </section>
    <button v-if="race?.coverSheet && !coverFailed" class="race-cover" type="button" aria-label="查看赛事封面" @click="openSheet(race.coverSheet.id)"><img :src="sheetSrc(race.coverSheet.id)" :alt="race.name + '赛事封面'" fetchpriority="high" @error="coverFailed = true" /><span>查看封面 <span aria-hidden="true">↗</span></span></button>
    <section v-if="race" class="pass race-hero" :class="['tone-' + tone, { 'has-cover': race.coverSheet && !coverFailed }]" aria-labelledby="race-title">
      <svg v-if="!race.coverSheet || coverFailed" class="race-hero-lines" viewBox="0 0 430 280" fill="none" aria-hidden="true"><path d="M330-60h40a85 85 0 0 1 85 85v85a85 85 0 0 1-85 85h-40a85 85 0 0 1-85-85V25a85 85 0 0 1 85-85Z"/><path d="M330-42h40a67 67 0 0 1 67 67v85a67 67 0 0 1-67 67h-40a67 67 0 0 1-67-67V25a67 67 0 0 1 67-67Z"/><path d="M330-24h40a49 49 0 0 1 49 49v85a49 49 0 0 1-49 49h-40a49 49 0 0 1-49-49V25a49 49 0 0 1 49-49Z"/><path d="M277 248v-41h26v41m6 0v-72h23v72m8 0v-54h36v54m9 0v-92h28v92m-150 0h167"/><path d="M246 207h-25v41h-28m67-203h160M260 53h160"/></svg>
      <div class="pass-copy">
        <div class="race-hero-eyebrow"><span>{{ race.raceDate ? race.raceDate.slice(0, 4) + ' 年度赛事' : '赛事日历' }}</span><span class="pass-pill">{{ publicStage }}</span></div>
        <h1 id="race-title">{{ race.name }}</h1>
        <p class="race-hero-date"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2"/><path d="M6 2.5v4m8-4v4M3 8.5h14"/></svg><strong>{{ race.raceDate || '比赛日期未录入' }}</strong><span v-if="race.startAt">{{ race.startAt }} 起跑</span></p>
        <p class="race-hero-place"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 6c0 3.5-5 8-5 8S3 9.5 3 6a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6" r="1.5"/></svg>{{ locationLine || '举办地点未录入' }}</p>
        <div v-if="projectLabels.length" class="race-hero-projects" aria-label="赛事项目"><span v-for="label in projectLabels" :key="label">{{ label }}</span></div><p v-else class="race-project-missing">赛事项目尚未录入</p>
        <button v-if="coverFailed" type="button" class="cover-retry" @click="coverFailed = false">封面暂时无法加载 · 重试</button>
        <div class="race-extra-facts"><span>{{ race.meet === 'online' ? '线上赛' : '线下赛' }}</span><span>{{ typeLabel }}</span><span v-if="race.gradeLabel">{{ race.gradeLabel }}</span></div>
      </div>
    </section>
    <div v-if="race" class="detail race-overview">
      <div class="race-follow-row">
        <span class="follow-copy"><strong>{{ following ? '已收进我的赛事' : '关注这场比赛' }}</strong><small>{{ following ? '与参赛计划分别管理' : '收藏赛事，接收站内节点提醒' }}</small></span>
        <FollowRaceButton appearance="list" :race-id="race.id" :race-name="race.name" :following="following" @change="value => following = value" />
      </div>
      <p v-for="item in conflicts" :key="item.text" class="warn">{{ item.text }}</p>
    </div>
    <section v-if="race" class="official-actions" aria-labelledby="official-actions-title">
      <div class="official-heading"><span id="official-actions-title">官方报名与查询</span><span class="official-stage">{{ publicStage }}</span></div><p v-if="nextMoment && nextMoment.key !== 'race'" class="official-moment"><span>{{ nextMoment.label }}</span><strong>{{ nextMoment.at }}</strong><small v-if="nextMoment.text">{{ nextMoment.text }}</small></p>
      <a v-if="primaryOfficial" class="official-primary" :href="primaryOfficial.url" target="_blank" rel="noopener" @click="onOfficialOpen(primaryOfficial)"><span>{{ primaryOfficial.label }}</span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg></a>
      <p v-else class="official-unavailable">{{ officialHint }}</p>
      <nav v-if="secondaryOfficial.length" class="official-secondary" aria-label="官方查询入口"><a v-for="link in secondaryOfficial" :key="link.key" :href="link.url" target="_blank" rel="noopener" @click="onOfficialOpen(link)">{{ link.label }}<span aria-hidden="true">›</span></a></nav>
      <details v-if="signupQr" class="signup-code" @click="prepareFold"><summary>手机扫码报名<span aria-hidden="true">＋</span></summary><img v-if="!qrFailed" :src="signupQr" alt="官方报名页二维码" loading="lazy" @error="qrFailed = true" /><p v-else class="src">二维码暂时无法加载。<button type="button" class="media-retry" @click="qrFailed = false">重试</button></p><p class="src">扫描二维码前往已录入的官方报名页。</p></details>
      <div v-if="askSignup" class="ask"><span>已在官方渠道提交报名？</span><button class="undo" type="button" :disabled="planBusy" @click="confirmSigned">{{ ready ? '记为已报名' : '登录后记录' }}</button><button class="undo" type="button" @click="askSignup = false">稍后再记</button></div>
      <p class="official-note">报名与缴费在官方渠道完成，个人计划单独记录。</p>
    </section>
    <div v-if="tabs.length" class="tabs" role="tablist">
      <button v-for="item in tabs" :key="item.id" type="button" role="tab" :id="'race-tab-' + item.id" :aria-selected="tab === item.id" :tabindex="tab === item.id ? 0 : -1" aria-controls="race-content" class="tab" :class="{ on: tab === item.id }" @click="pickTab(item.id)" @keydown="moveTab($event, item.id)">{{ item.label }}</button>
    </div>
    <div v-if="race" id="race-content" ref="raceTabPanel" class="race-tab-content" :style="{ minHeight: tabContentMinHeight + 'px' }" role="tabpanel" :aria-labelledby="'race-tab-' + tab">
    <template v-if="race && tab === 'signup'">
      <div v-if="race.nodes.some(node => node.key !== 'race')" class="block race-timeline-card">
        <div class="race-section-heading"><h2>重要时间</h2><span>报名 · 参赛节点</span></div>
        <div class="timeline">
          <div v-for="node in sortedNodes" :key="node.key" class="tl" :class="{ 'is-past': node.past, 'is-next': node.key === nextMoment?.key, 'is-today': node.today }">
            <span class="dot"></span>
            <b>{{ node.at }}</b>
            <span>{{ node.label }}<small v-if="node.today">今天</small><small v-else-if="node.key === nextMoment?.key">下一节点</small></span>
          </div>
        </div>
      </div>
      <div class="block race-project-card">
        <h2>参赛项目与费用</h2>
        <div class="row"><span>距离</span><b>{{ (race.distanceLabels || []).join(' / ') || '未录入' }}</b></div>
        <div v-if="race.groups?.length" class="row"><span>其他组别</span><b>{{ race.groups.join(' / ') }}</b></div>
        <div class="row"><span>报名费</span><b>{{ race.fee || '未录入' }}</b></div>
        <div v-if="race.scale" class="row"><span>赛事规模</span><b>{{ race.scale }}</b></div>
        <div v-if="race.phone" class="row"><span>咨询电话</span><a :href="'tel:' + race.phone">{{ race.phone }}</a></div>
      </div>
      <div v-if="drawRates.length" class="block">
        <h2>历年中签</h2>
        <p class="src">依据已公布的报名人数与名额计算。</p>
        <div v-for="item in drawRates" :key="item.id" class="mate">
          <span>{{ item.label }} · 报名 {{ item.applicants }} · 名额 {{ item.quota }} · {{ item.rateText }}</span>
          <details class="draw-rate-source" @click="prepareFold"><summary>资料来源</summary>{{ item.source }}</details>
        </div>
      </div>
    <router-link v-if="race?.archiveId" class="race-archive-entry" :to="{path:'/race-catalog/'+race.archiveId,query:{fromRaceId:String(race.id)}}"><span class="archive-entry-icon" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M5 6h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H5V6Zm18 0h-5a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h4V6Z"/><path d="M8 10h3m-3 4h3m8-4h1m-1 4h1"/></svg></span><span class="archive-entry-copy"><span>赛事档案</span><strong>历年赛事档案</strong><small>赛道、奖牌与历年记录</small></span><span class="archive-entry-arrow" aria-hidden="true">›</span></router-link>
    <section v-if="race" class="block race-plan" :class="{ 'is-open': ready && planOpen }" aria-labelledby="race-plan-title">
      <div class="plan-heading"><h2 id="race-plan-title"><img class="plan-heading-art" :src="myStatus ? planActiveIcon : planIcon" alt="" />我的参赛计划</h2><span class="plan-privacy"><svg v-if="!sharedClubIds.length" viewBox="0 0 16 16" aria-hidden="true" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7"/></svg>{{ sharedClubIds.length ? sharedClubIds.length + ' 个跑团可见' : '仅自己可见' }}</span></div>
      <div class="plan-summary">
        <div class="plan-summary-copy"><span class="plan-summary-label">{{ myStatus ? '当前状态' : '为下一场，留个位置' }}</span><strong class="plan-status" :class="{ 'is-empty': !myStatus }">{{ myStatus || '还没有参赛计划' }}</strong></div>
        <button v-if="!ready" class="plan-action" type="button" @click="loginForPlan">登录后标记<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></button>
        <button v-else class="plan-action" type="button" :aria-label="planOpen ? '收起参赛状态' : myStatus ? '修改参赛状态' : '标记参赛状态'" :aria-expanded="planOpen" aria-controls="race-plan-editor" @click="togglePlan">{{ planOpen ? '收起' : myStatus ? '修改' : '添加计划' }}<svg viewBox="0 0 16 16" aria-hidden="true" :class="{ expanded: planOpen }"><path d="m6 4 4 4-4 4"/></svg></button>
      </div>
      <div v-if="ready && planOpen" id="race-plan-editor" class="plan-editor">
        <nav class="plan-stages" aria-label="参赛阶段"><button v-for="(stage, index) in planStages" :key="stage.id" type="button" :class="{ selected: planStage === stage.id, current: stageFor(myStatus) === stage.id && myStatus }" :aria-label="(index + 1) + ' ' + stage.label" :aria-pressed="planStage === stage.id" @click="pickPlanStage(stage.id)"><small aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</small><span>{{ stageLabels[stage.id] }}</span></button></nav>
        <div class="plan-field-heading"><span>选择当前状态</span><small>{{ planBusy ? '正在保存…' : '选择后自动保存' }}</small></div>
        <div class="statuses plan-options" :class="{ 'single-option': activeStage.statuses.length === 1 }">
          <button v-for="item in activeStage.statuses" :key="item" type="button" class="status" :class="{ on: myStatus === item }" :aria-label="item" :aria-pressed="myStatus === item" :disabled="planBusy" @click="choosePlan(item)"><span class="status-copy"><strong>{{ item }}</strong><small aria-hidden="true">{{ statusHints[item] }}</small></span><span class="status-indicator" aria-hidden="true"><svg v-if="myStatus === item" viewBox="0 0 16 16"><path d="m4 8 2.5 2.5L12 5"/></svg></span></button>
        </div>
        <p class="plan-stage-hint">{{ activeStage.hint }}</p>
        <div v-if="myStatus" class="plan-proof">
          <div class="plan-proof-heading"><strong>报名凭证</strong><span>可选</span></div>
          <p class="src">报名截图仅本人可见，不会同步给跑团。</p>
          <img v-if="hasSheet" class="proof" :src="signupSrc" alt="报名截图" />
          <div class="proof-actions">
            <label class="plan-upload"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none"><path d="M6 5.5 7.5 3h5L14 5.5h2a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z"/><circle cx="10" cy="10.5" r="3"/></svg>{{ hasSheet ? '更换报名截图' : '上传报名截图' }}<input type="file" aria-label="上传报名截图" accept="image/jpeg,image/png,image/webp" :disabled="planBusy" @change="onSignup" /></label>
            <button v-if="hasSheet" class="undo" type="button" :disabled="planBusy" @click="removeSignup">移除截图</button>
          </div>
        </div>
        <button v-if="myStatus" class="undo remove-plan" type="button" :disabled="planBusy" @click="removePlan">移除参赛计划</button>
      </div>
      <p v-else class="plan-summary-note">{{ myStatus ? '报名、领物到完赛，按自己的进度记录。' : '从想跑到完赛，把每一步留在这里。' }}</p>
      <p class="plan-footnote">个人记录 · 实际报名与参赛资格以官方为准</p>
      <p v-if="message" class="plan-feedback" :class="{ 'is-error': sharingError && sharingError === message }" role="status">{{ message }}</p>
    </section>
    <section v-if="race && ready" class="block race-companionship" aria-labelledby="club-sync-title">
      <button type="button" class="club-sync-toggle" aria-label="同步设置与同行需求" :aria-expanded="companionOpen" aria-controls="club-sync-panel" @click="toggleCompanion">
        <span class="club-sync-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2.5a5.5 5.5 0 0 1 11 0V20M17 5a3 3 0 0 1 0 6m1 3a4.5 4.5 0 0 1 3 4v2"/></svg></span>
        <span class="club-sync-heading"><strong id="club-sync-title">同步到跑团</strong><small :title="sharedClubNames">{{ sharedClubNames || '让跑友知道你的参赛安排' }}</small></span>
        <span class="club-sync-state"><span :class="{ 'is-shared': sharedClubIds.length }">{{ sharedClubIds.length ? '已同步 ' + sharedClubIds.length + ' 团' : '仅自己可见' }}</span><svg viewBox="0 0 16 16" aria-hidden="true" :class="{ expanded: companionOpen }"><path d="m6 4 4 4-4 4"/></svg></span>
      </button>
      <div v-if="companionOpen" id="club-sync-panel" class="companion-editor">
        <template v-if="clubs.length">
          <div class="club-sync-label"><strong>选择同步范围</strong><span>可多选</span></div>
          <fieldset class="club-sharing" :disabled="planBusy || !myStatus"><legend class="visually-hidden">同步到哪些跑团</legend>
            <label v-for="club in clubs" :key="club.id" class="club-choice-card" :class="{ 'is-selected': sharingDraft.includes(Number(club.id)), 'is-disabled': planBusy || !myStatus }">
              <input v-model="sharingDraft" class="club-choice-input" type="checkbox" :value="Number(club.id)" :aria-label="club.name" />
              <span class="club-choice-avatar" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
              <span class="club-choice-copy"><strong>{{ club.name }}</strong><small>{{ club.mates?.length ? club.mates.length + ' 位团友已分享参赛计划' : '与团友同步参赛进度' }}</small></span>
              <span class="club-choice-check" aria-hidden="true"><svg v-if="sharingDraft.includes(Number(club.id))" viewBox="0 0 16 16"><path d="m4 8 2.5 2.5L12 5"/></svg></span>
            </label>
          </fieldset>
          <p v-if="!myStatus" class="club-sync-notice">先添加参赛计划，再选择同步跑团。</p>
          <div class="club-sync-footer"><span><strong>{{ sharingDraft.length }}</strong> 个跑团<small>{{ sharingDirty ? '有更改待保存' : sharedClubIds.length ? '后续状态自动同步' : '当前仅自己可见' }}</small></span><button type="button" class="primary sharing-save" :disabled="!myStatus || planBusy || !sharingDirty" @click="saveSharing">{{ planBusy ? '保存中…' : '保存同步范围' }}</button></div>
          <p class="club-sync-caption">保存后，仅所选跑团可见。同步不会报名团内活动。</p>
        </template>
        <div v-else class="club-sync-empty"><strong>找到一起参赛的伙伴</strong><p>加入跑团后，可在这里选择同步范围。</p><router-link class="companionship-link" to="/clubs">发现跑团 <span aria-hidden="true">›</span></router-link></div>
        <form v-if="myStatus && clubs.length" class="companion-form" @submit.prevent="saveCompanion"><label for="companion-note">我的同行需求<span>选填</span></label><textarea id="companion-note" aria-label="我的同行需求" v-model="companionDraft" maxlength="200" rows="2" placeholder="想拼车、约好领物，或赛后一起合影…" :disabled="planBusy"></textarea><span class="src">{{ companionDraft.length }}/200 · 仅已同步的跑团可见</span><button type="submit" class="undo" :disabled="planBusy || companionDraft === companionNote">保存同行需求</button></form>
      </div>
      <p v-if="sharingMessage" class="src" role="status">{{ sharingMessage }}</p>
      <p v-if="sharingError" class="err" role="alert">{{ sharingError }}</p>
    </section>

    <section v-if="race" class="outings-fold"><button type="button" class="outings-fold-toggle" aria-label="展开或收起同行安排" :aria-expanded="outingsOpen" aria-controls="outings-detail" @click="toggleOutings"><span><strong>本场同行安排</strong><small>拼车、集合与领物，和伙伴约好再出发</small></span><span aria-hidden="true">{{ outingsOpen ? '⌃' : '›' }}</span></button><div id="outings-detail" v-show="outingsOpen"><RaceOutings :race-id="race.id" :clubs="clubs" :ready="ready" /></div></section>
      <section v-if="cards.length" class="block race-share">
        <button class="share-toggle" type="button" :aria-expanded="shareOpen" aria-controls="race-share-options" @click="toggleShare"><span>分享赛事到跑团</span><span aria-hidden="true">{{ shareOpen ? '⌃' : '›' }}</span></button>
        <p class="src">选择跑团，复制这场比赛的参赛动态到微信群。</p>
        <div v-if="shareOpen" id="race-share-options" class="share-content">
          <div class="share-options" role="radiogroup" aria-label="选择分享跑团">
            <button v-for="card in cards" :key="card.club.id" class="share-option" type="button" role="radio" :aria-checked="selectedShare?.club.id === card.club.id" @click="selectShare(card)"><span class="share-radio" aria-hidden="true"></span><span class="share-option-copy"><b>{{ card.club.name }}</b><small>{{ card.summary || '分享这场赛事与跑团参赛动态' }}</small></span></button>
          </div>
          <button class="primary share-submit" type="button" :disabled="!selectedShare" @click="copyCard(selectedShare)">复制到微信群</button>
          <p v-if="note" class="share-feedback" role="status">{{ note }}</p>
          <p v-if="copyError" class="err" role="alert">{{ copyError }}</p>
          <pre v-if="copyError && selectedShare" class="share-copy-fallback">{{ selectedShare.text }}</pre>
        </div>
      </section>
      <details v-if="clubs.length" class="block race-mates" @click="prepareFold"><summary><span>团友参赛记录<small>仅展示主动同步的个人标记</small></span><span aria-hidden="true">＋</span></summary>
        <p v-if="!activeCompanionClubs.length" class="src">还没有团友同步本场参赛计划。</p>
        <section v-for="club in activeCompanionClubs" :key="club.id" class="club-mates-group"><h3>{{ club.name }}</h3><p v-if="squadLine(club)" class="warn">{{ squadLine(club) }}</p><div v-for="mate in club.mates" :key="mate.userId || mate.nickname" class="mate companion-mate"><span>{{ mate.nickname }}<small v-if="mate.note">{{ mate.note }}</small></span><b>{{ mate.status }}</b></div><button class="companionship-link" type="button" @click="openOutings(club.id)">查看本团同行安排 <span aria-hidden="true">›</span></button></section>
        <p class="src">个人标记不会自动取得参赛资格，也不会报名跑团活动。</p>
      </details>
      <details v-if="race.organizer || race.source || race.eventUrl || race.officialUrl" class="block race-source" @click="prepareFold"><summary>主办与资料信息<span>按需查看 ›</span></summary>
        <p v-if="race.organizer" class="src">主办 {{ race.organizer }}</p>
        <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt.slice(0, 10) }}</template></p>
        <p v-if="safeOfficialUrl(race.eventUrl)" class="src"><a :href="race.eventUrl" target="_blank" rel="noopener">赛事网站</a></p>
        <p v-if="safeOfficialUrl(race.officialUrl)" class="src"><a :href="race.officialUrl" target="_blank" rel="noopener">中国马拉松赛事信息</a></p>
      </details>
    </template>
    <template v-if="race && tab === 'guide'">
      <p v-if="!dayNotes.length && !routeSheets.length && !race.pacerSheets.length && !guideBlocks.length && !race.guide.length" class="block quiet-state">参赛指南尚未录入，后续资料将在这里更新。</p>
      <nav class="guide-index" aria-label="参赛指南目录"><button v-for="section in guideSections" :key="section.id" type="button" @click="goToGuide(section.id)">{{ section.label }}<span :class="{ missing: !section.hasContent }">{{ section.hasContent ? '查看' : '未录入' }}</span></button></nav>
      <section id="guide-route" class="block guide-section"><h2>赛道与路线</h2><p v-if="race.route" class="guide-note">{{ race.route }}</p><p v-if="!race.route && !routeSheets.length" class="src">路线资料尚未录入。</p><div class="pacer-photos"><RaceMedia v-for="(sheet, index) in routeSheets" :key="sheet.id" :src="sheetSrc(sheet.id)" :alt="'路线图 ' + (index + 1)" @open="openSheet(sheet.id)" /></div></section>
      <section id="guide-pickup" class="block guide-section"><h2>领物与比赛日</h2><div v-if="race.startAt" class="row"><span>比赛日起跑</span><b>{{ race.startAt }}</b></div><p class="guide-note" :class="{ src: !race.pickup }">{{ race.pickup || '领物及比赛日安排尚未录入。' }}</p></section>
      <section id="guide-pacers" class="block guide-section"><h2>配速与官方领跑员</h2><p v-if="race.pacers" class="guide-note">{{ race.pacers }}</p><p v-if="!race.pacers && !race.pacerSheets.length" class="src">配速资料尚未录入。</p><div class="pacer-photos"><RaceMedia v-for="(sheet, index) in race.pacerSheets" :key="sheet.id" :src="sheetSrc(sheet.id)" :alt="'配速资料 ' + (index + 1)" @open="openSheet(sheet.id)" /></div></section>

      <div id="guide-rules" class="block guide-section">
        <h2>竞赛规程</h2>
        <p class="src">{{ guideBlocks.length || race.guide.length ? '参赛资格、奖励及关门安排，以组委会规程为准。' : '竞赛规程尚未录入。' }}</p>
        <div v-if="guideBlocks.length" class="guide-md">
          <p v-for="block in guideBlocks" :key="block.i" :class="'md md-' + block.kind">
            <span v-if="block.mark" class="md-mark">{{ block.mark }}</span>
            <template v-for="run in block.runs" :key="run.j">
              <strong v-if="run.strong">{{ run.text }}</strong>
              <template v-else>{{ run.text }}</template>
            </template>
          </p>
        </div>
        <template v-if="race.guide.length">
          <h3>原页</h3>
          <p v-if="guideBlocks.length" class="src">正文在上面。原页留着对照。</p>
          <p v-else class="src">正文还没整理，下面是组委会公布的原页。</p>
          <RaceMedia v-for="(sheet, index) in race.guide" :key="sheet.id" :src="sheetSrc(sheet.id)" :alt="'竞赛规程 · 第 ' + (index + 1) + ' 页'" @open="openSheet(sheet.id)" />
        </template>
      </div>
    </template>
    <template v-if="race && tab === 'news'">
      <p v-if="!articles.length && !race.liveSheet && !alternatives.length" class="block quiet-state">还没有发布相关资讯</p>
      <div v-if="articles.length" class="block">
        <h2>相关资讯</h2>
        <router-link v-for="item in articles" :key="item.id" class="mate" :to="'/news/' + item.id">
          <span>{{ item.title }}</span>
          <b>{{ item.publishedAt }}</b>
        </router-link>
      </div>
      <div v-if="race.liveSheet" class="block">
        <h2>直播</h2>
        <p class="src">扫组委会的二维码。</p>
        <RaceMedia :src="sheetSrc(race.liveSheet.id)" alt="直播二维码" @open="openSheet(race.liveSheet.id)" />
      </div>
      <div v-if="alternatives.length" class="block">
        <h2>同期还开着</h2>
        <p class="src">{{ alternativeNote }}</p>
        <router-link v-for="item in alternatives" :key="item.id" class="mate" :to="'/races/' + item.id">
          <span>{{ item.name }}</span>
          <b>{{ item.deadlineLabel }}</b>
        </router-link>
      </div>
    </template>
    <template v-if="race && tab === 'result'">
      <section v-if="officialResultLink" class="block official-result"><div class="race-section-heading"><h2>官方成绩与证书</h2><span>组委会查询入口</span></div><a class="jump" :href="officialResultLink.url" target="_blank" rel="noopener">前往官方查询</a></section>
      <section v-if="!ready" class="block quiet-state"><h2>把这一程，留给自己</h2><p>登录后记录完赛成绩、证书与比赛感受。</p><button type="button" class="primary" @click="loginForResult">登录后记录成绩</button></section>
      <div v-if="drawText" class="block">
        <h2>中签卡片</h2>
        <div class="poster-card">
          <p v-for="(line, index) in drawLines" :key="index">{{ line }}</p>
        </div>
        <button class="primary" type="button" @click="savePoster">保存图片</button>
        <button class="primary" type="button" @click="copyDraw">复制卡片</button>
        <p v-if="drawNote" class="note">{{ drawNote }}</p>
        <p v-if="drawError" class="err">{{ drawError }}</p>
      </div>
      <div v-if="ready" class="block">
        <h2>我的手记成绩</h2>
        <p class="src">个人手记与官方查询分开。手记标为未核验，可附证书或奖牌照片。</p>

        <p v-for="item in myResults" :key="item.distance" class="src">{{ item.distanceLabel }} {{ item.clock }} · 配速 {{ item.pace }}<template v-if="item.pb"> · PB</template> · {{ item.verifyLabel }}</p>
        <p v-if="myResult && myResult.story">{{ myResult.story }}</p>
        <img v-if="myResult && myResult.hasProof" class="proof" :src="proofSrc" alt="" />
        <p v-if="myResult && myResult.proofLabel" class="src">{{ myResult.proofLabel }} · 未核验</p>
        <div class="statuses">
          <button
            v-for="(label, i) in race.distanceLabels"
            :key="race.distances[i]"
            type="button"
            class="status"
            :class="{ on: distance === race.distances[i] }"
            @click="pickDistance(race.distances[i])"
          >
            {{ label }}
          </button>
        </div>
        <form class="result-form" @submit.prevent="saveResult">
          <label>完赛用时<input v-model="clock" aria-label="完赛用时" placeholder="3:29:59" inputmode="numeric" required /></label>
          <label>比赛手记<span>选填</span><input v-model="story" aria-label="比赛手记" maxlength="200" placeholder="这场想记的一句" /></label>
          <button class="primary" type="submit">记下成绩</button>
        </form>
        <div v-if="myResult" class="proof-actions">
          <label>证书照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onProof('certificate', $event)" /></label>
          <label>奖牌照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onProof('medal', $event)" /></label>
          <button v-if="myResult.hasProof" class="undo" type="button" @click="removeProof">去掉照片</button>
          <button class="undo" type="button" @click="removeResult">去掉这项成绩</button>
        </div>
        <p v-if="resultMessage" class="err">{{ resultMessage }}</p>
      </div>
    </template>
    </div>
    <dialog ref="imageDialog" class="race-image-viewer" aria-label="赛事图片预览" @cancel.prevent="closeViewer" @click.self="closeViewer">
      <div class="viewer-toolbar"><span>{{ viewerLabel }}<small v-if="gallery.length > 1">{{ viewerIndex + 1 }} / {{ gallery.length }}</small></span><button type="button" autofocus class="viewer-close" aria-label="关闭图片预览" @click="closeViewer">关闭 ×</button></div>
      <div class="viewer-canvas" :class="{ 'is-zoomed': viewerZoom }"><img v-if="viewer && !viewerFailed" :src="viewer" :alt="viewerLabel" @error="viewerFailed = true" /><div v-else-if="viewerFailed" class="viewer-error" role="status"><p>这张图片暂时无法加载</p><button type="button" @click="retryViewer">重新加载</button></div></div>
      <div class="viewer-controls"><button v-if="gallery.length > 1" type="button" aria-label="上一张图片" @click="stepViewer(-1)">‹ 上一张</button><button type="button" :aria-pressed="viewerZoom" @click="viewerZoom = !viewerZoom">{{ viewerZoom ? '适应屏幕' : '查看原图' }}</button><button v-if="gallery.length > 1" type="button" aria-label="下一张图片" @click="stepViewer(1)">下一张 ›</button></div>
    </dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, raceSheetSrc, resultProofSrc, signupSheetSrc, upload } from "../api";
import { copyText } from "../copy";
import { toneOf } from "../tone";
import { parseGuide } from "../guide-md";
import FollowRaceButton from '../components/FollowRaceButton.vue';
import RaceOutings from '../components/RaceOutings.vue';
import RaceMedia from '../components/RaceMedia.vue';
import planIcon from '../assets/race-actions/plan.svg';
import planActiveIcon from '../assets/race-actions/plan-active.svg';
import { planStages, stageFor } from '../participation';
const route = useRoute();
const router = useRouter();
const planOpen = ref(route.query.plan === "1");
const shareOpen = ref(false);
const following = ref(false), planStage = ref('interest'), planBusy = ref(false);
const companionOpen = ref(false);
const outingsOpen = ref(route.hash === '#race-outings');
const coverFailed = ref(false), qrFailed = ref(false);
const imageDialog = ref(null);
const sharedClubIds = ref([]), sharingDraft = ref([]), companionNote = ref(''), companionDraft = ref('');
const sharingMessage = ref(''), sharingError = ref('');
const activeStage = computed(() => planStages.find(stage => stage.id === planStage.value) || planStages[0]);
const stageLabels = { interest: '意向', registration: '报名', confirmed: '参赛', finished: '赛后' };
const statusHints = { '想跑': '先记下这场', '已报名': '报名申请已交', '待抽签': '等一个好消息', '中签': '已获得名额', '未中签': '下次再出发', '确认参赛': '行程已确定', '已缴费': '报名费已付', '已领物': '准备好出发', '完赛': '留住这一程', '未完赛': '每次出发都算', '弃赛': '这次先休息' };
const sharingDirty = computed(() => [...sharingDraft.value].sort().join(',') !== [...sharedClubIds.value].sort().join(','));
const activeCompanionClubs = computed(() => clubs.value.filter(club => club.mates?.length));
const sharedClubNames = computed(() => { const names = clubs.value.filter(club => sharedClubIds.value.includes(Number(club.id))).map(club => club.name); return names.length ? '已同步到：' + names.join('、') + '。' : ''; });
let actionSequence = 0, disposed = false;
async function planAction(suffix, body) {
  if (planBusy.value) return false;
  const id = String(route.params.id), token = localStorage.getItem('marathon_token'), ticket = ++actionSequence;
  planBusy.value = true; message.value = ''; sharingError.value = ''; sharingMessage.value = '';
  try {
    await api('/me/races/' + encodeURIComponent(id) + suffix, { method: 'PUT', body: JSON.stringify(body) });
    if (disposed || ticket !== actionSequence || id !== String(route.params.id) || token !== localStorage.getItem('marathon_token')) return false;
    await load({ replaceSharing: suffix === '/sharing', replaceCompanion: suffix === '/companionship' });
    return !disposed && ticket === actionSequence && id === String(route.params.id) && token === localStorage.getItem('marathon_token');
  } catch (err) { if (!disposed && ticket === actionSequence && id === String(route.params.id) && token === localStorage.getItem('marathon_token')) { sharingError.value = err.message; message.value = err.message; } return false; }
  finally { if (!disposed && ticket === actionSequence) planBusy.value = false; }
}
async function saveSharing() {
  if (!await planAction('/sharing', { clubIds: sharingDraft.value })) return;
  keepPosition(() => { companionOpen.value = false; });
  sharingMessage.value = sharedClubIds.value.length ? '已更新同步范围，后续参赛状态会自动同步。' : '已设为仅自己可见。';
}
async function saveCompanion() { if (await planAction('/companionship', { note: companionDraft.value })) sharingMessage.value = '同行需求已保存。'; }
async function removePlan() {
  if (planBusy.value || !window.confirm('移除参赛计划？关注的比赛和已记录的成绩会保留，跑团不再同步这条计划。')) return;
  const id = String(route.params.id), token = localStorage.getItem('marathon_token'), ticket = ++actionSequence;
  planBusy.value = true;
  try { await api('/me/races/' + encodeURIComponent(id), { method: 'DELETE' }); if (!disposed && ticket === actionSequence && id === String(route.params.id) && token === localStorage.getItem('marathon_token')) { await load({ replaceSharing: true, replaceCompanion: true }); if (!disposed && ticket === actionSequence) message.value = '已移除参赛计划。'; } }
  catch (err) { if (!disposed && ticket === actionSequence && token === localStorage.getItem('marathon_token')) message.value = err.message; }
  finally { if (!disposed && ticket === actionSequence) planBusy.value = false; }
}
function loginForPlan() {
  localStorage.setItem("marathon_return_after_login", "/races/" + encodeURIComponent(route.params.id) + "?plan=1");
  router.push("/mine");
}
function loginForResult() {
  localStorage.setItem("marathon_return_after_login", "/races/" + encodeURIComponent(route.params.id) + "?tab=result");
  router.push("/mine");
}
async function choosePlan(status) {
  if (await mark(status)) message.value = "已标记为「" + status + "」";
}
const race = ref(null);
const tone = computed(() => toneOf(race.value));
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const locationLine = computed(() => [...new Set([race.value?.province, race.value?.city, race.value?.district, race.value?.place].filter(Boolean))].join(' · '));
const projectLabels = computed(() => [...new Set([...(race.value?.distanceLabels || []), ...(race.value?.groups || [])])]);
const typeLabel = computed(() => {
  const labels = race.value?.kindLabels || [];
  return labels.length ? labels.join(' / ') : race.value?.kind === 'trail' ? '越野' : '路跑';
});
const publicStage = computed(() => {
  const row = race.value;
  if (!row) return '';
  if (row.raceDate && row.raceDate < today()) return '已结束';
  if (row.raceDate === today()) return '比赛日';
  if (row.regStart && row.regStart.slice(0, 10) > today()) return '报名未开始';
  if (!row.deadline) return '报名时间未录入';
  return row.open ? '报名中' : '报名已截止';
});
const sortedNodes = computed(() => [...(race.value?.nodes || [])].sort((a, b) => a.at.localeCompare(b.at)));
const nextMoment = computed(() => {
  const rows = sortedNodes.value.filter(node => !node.past || node.today);
  return rows.find(node => node.key !== 'race') || rows.find(node => node.key === 'race') || null;
});
const routeSheets = computed(() => (race.value && race.value.routeSheets) || []);
const guideBlocks = computed(() => parseGuide(race.value && race.value.guideText));
const dayNotes = computed(() => {
  if (!race.value) return [];
  return [
    ["路线", race.value.route, routeSheets.value.length > 0],
    ["领物", race.value.pickup, false],
    ["配速员", race.value.pacers, false]
  ].filter((item) => item[1] || item[2]).map(([label, text]) => ({ label, text }));
});
const guideSections = computed(() => [
  { id: 'route', label: '赛道路线', hasContent: !!race.value?.route || routeSheets.value.length > 0 },
  { id: 'pickup', label: '领物安排', hasContent: !!race.value?.pickup },
  { id: 'pacers', label: '配速资料', hasContent: !!race.value?.pacers || race.value?.pacerSheets?.length > 0 },
  { id: 'rules', label: '竞赛规程', hasContent: guideBlocks.value.length > 0 || race.value?.guide?.length > 0 }
]);
function goToGuide(id) { document.getElementById('guide-' + id)?.scrollIntoView({ behavior: 'auto', block: 'start' }); }
const viewer = ref(''), viewerFailed = ref(false), viewerZoom = ref(false);
const gallery = computed(() => {
  const row = race.value;
  if (!row) return [];
  return [
    ...(row.coverSheet ? [{ ...row.coverSheet, label: '赛事封面' }] : []),
    ...routeSheets.value.map((sheet, index) => ({ ...sheet, label: '路线图 ' + (index + 1) })),
    ...(row.pacerSheets || []).map((sheet, index) => ({ ...sheet, label: '配速资料 ' + (index + 1) })),
    ...(row.guide || []).map((sheet, index) => ({ ...sheet, label: '竞赛规程 · 第 ' + (index + 1) + ' 页' })),
    ...(row.liveSheet ? [{ ...row.liveSheet, label: '直播二维码' }] : [])
  ].map(sheet => ({ ...sheet, src: sheetSrc(sheet.id) }));
});
const viewerIndex = computed(() => Math.max(0, gallery.value.findIndex(sheet => sheet.src === viewer.value)));
const viewerLabel = computed(() => gallery.value[viewerIndex.value]?.label || '赛事图片');
let imageBodyOverflow, imageScrollY = 0;
watch(viewer, async value => {
  viewerFailed.value = false; viewerZoom.value = false;
  if (!value) return;
  if (!imageDialog.value?.open) {
    imageScrollY = window.scrollY;
    imageBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    if (viewer.value) imageDialog.value?.showModal();
    window.scrollTo(0, imageScrollY);
  }
});
function closeViewer() {
  imageDialog.value?.close();
  viewer.value = '';
  if (imageBodyOverflow !== undefined) document.body.style.overflow = imageBodyOverflow;
  imageBodyOverflow = undefined;
  nextTick(() => window.scrollTo(0, imageScrollY));
}
function stepViewer(step) {
  if (!gallery.value.length) return;
  viewer.value = gallery.value[(viewerIndex.value + step + gallery.value.length) % gallery.value.length].src;
}
function retryViewer() { viewerFailed.value = false; }
onBeforeUnmount(() => { if (imageBodyOverflow !== undefined) document.body.style.overflow = imageBodyOverflow; });
function sheetSrc(id) { return raceSheetSrc(id); }
function openSheet(id) { viewer.value = sheetSrc(id); }
const myStatus = ref("");
const hasSheet = ref(false);
const askSignup = ref(false);
const clubs = ref([]);
const cards = ref([]);
const selectedShareId = ref("");
const selectedShare = computed(() => cards.value.find(card => String(card.club?.id) === selectedShareId.value) || cards.value[0] || null);
function selectShare(card) { selectedShareId.value = String(card.club.id); note.value = ""; copyError.value = ""; }
const conflicts = ref([]);
const alternatives = ref([]);
const alternativeNote = ref("");
const drawText = ref("");
const drawRates = ref([]);
const drawNote = ref("");
const drawError = ref("");
const myResult = ref(null);
const myResults = ref([]);
const distance = ref("");
const clock = ref("");
const story = ref("");
const ready = ref(!!localStorage.getItem("marathon_token"));
const message = ref("");
const resultMessage = ref("");
const note = ref("");
const copyError = ref("");
const articles = ref([]);
const loading = ref(true);
const loadError = ref("");
let loadSequence = 0;

async function load(options = {}) {
  const id = String(route.params.id || "");
  const token = localStorage.getItem('marathon_token');
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = "";
  try {
    const [data, news] = await Promise.all([
      api("/races/" + id),
      api("/races/" + id + "/news").catch(() => ({ news: [] }))
    ]);
    if (disposed || sequence !== loadSequence || id !== String(route.params.id || "") || token !== localStorage.getItem('marathon_token')) return;
    articles.value = news.news || [];
    race.value = { ...data.race, nodes: data.race.nodes || [], distanceLabels: data.race.distanceLabels || [], distances: data.race.distances || [], kindLabels: data.race.kindLabels || [], groups: data.race.groups || [], guide: data.race.guide || [], pacerSheets: data.race.pacerSheets || [] };
    myStatus.value = data.myStatus || '';
    planStage.value = stageFor(myStatus.value);
    following.value = !!data.following;
    const keepSharingDraft = sharingDirty.value && !options.replaceSharing;
    const keepCompanionDraft = companionDraft.value !== companionNote.value && !options.replaceCompanion;
    sharedClubIds.value = data.sharedClubIds || [];
    if (!keepSharingDraft) sharingDraft.value = [...sharedClubIds.value];
    companionNote.value = data.companionNote || '';
    if (!keepCompanionDraft) companionDraft.value = companionNote.value;
    hasSheet.value = Boolean(data.hasSheet);
    clubs.value = data.clubs || [];
    cards.value = data.cards || [];
    conflicts.value = data.conflicts || [];
    alternatives.value = data.alternatives || [];
    alternativeNote.value = data.alternativeNote || "";
    drawText.value = data.drawText || "";
    drawRates.value = data.drawRates || [];
    myResults.value = data.myResults || [];
    if (!distance.value) {
      const first = myResults.value[0];
      if (first) distance.value = first.distance;
      else if (data.race.distances?.length) distance.value = data.race.distances[0];
    }
    pickDistance(distance.value);
  } catch (error) {
    if (disposed || sequence !== loadSequence || id !== String(route.params.id || "") || token !== localStorage.getItem('marathon_token')) return;
    if (!race.value) loadError.value = error.message || "赛事暂时无法加载，请重试";
    throw error;
  } finally {
    if (sequence === loadSequence && id === String(route.params.id || "")) loading.value = false;
  }
}

function retryLoad() {
  const id = String(route.params.id || "");
  load().catch((error) => {
    if (id === String(route.params.id || "") && race.value) message.value = error.message;
  });
}

function pickDistance(next) {
  distance.value = next;
  const found = myResults.value.find((item) => item.distance === next) || null;
  myResult.value = found;
  if (found) {
    clock.value = found.clock;
    story.value = found.story || "";
  }
}

const proofSrc = computed(() => (race.value && myResult.value && myResult.value.hasProof ? resultProofSrc(race.value.id, myResult.value.distance) : ""));
const signupSrc = computed(() => (race.value && hasSheet.value ? signupSheetSrc(race.value.id) : ""));
const initialTab = () => ["signup", "guide", "news", "result"].includes(route.query.tab) ? route.query.tab : "signup";
const tab = ref(initialTab());
const raceTabPanel = ref(null);
const tabContentMinHeight = ref(0);
const signupQr = computed(() => race.value?.signupHost && officialLinks.value.some(link => link.key === 'signup') ? '/marathon/api/races/' + encodeURIComponent(race.value.id) + '/signup-qr' : '');
function safeOfficialUrl(value) { return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value); }
const officialLinks = computed(() => (race.value?.links || []).filter(item => safeOfficialUrl(item.url)));
const officialResultLink = computed(() => officialLinks.value.find(item => item.key === 'result'));
const primaryOfficial = computed(() => {
  if (!race.value) return null;
  const row = race.value, date = today();
  const find = key => officialLinks.value.find(link => link.key === key);
  const ended = row.regStatus === '已结束' || row.raceDate && row.raceDate < date;
  const upcomingSignup = row.regStart && row.regStart.slice(0, 10) > date;
  const paymentPeriod = !ended && !upcomingSignup && row.payDeadline && row.payDeadline.slice(0, 10) >= date && row.drawAt && row.drawAt.slice(0, 10) <= date;
  let key = ended && find('result') ? 'result'
    : paymentPeriod && find('signup') ? 'signup'
    : !upcomingSignup && !row.open && row.bibAt && row.bibAt.slice(0, 10) <= date && find('bib') ? 'bib'
    : !upcomingSignup && !row.open && row.drawAt && row.drawAt.slice(0, 10) <= date && find('draw') ? 'draw'
    : row.open && find('signup') ? 'signup' : null;
  if (!key) key = ['signup', 'draw', 'bib', 'result', 'live'].find(key => find(key));
  if (key) return { ...find(key), label: key === 'signup' ? paymentPeriod ? '查看官方报名与缴费信息' : row.open && !upcomingSignup && !ended ? '前往官方报名' : '查看官方报名信息' : { draw: '查询中签结果', bib: '查询参赛号码', result: '查询官方成绩与证书', live: '查看官方直播' }[key] };
  const url = [row.eventUrl, row.officialUrl].find(safeOfficialUrl);
  return url ? { key: 'website', label: '查看赛事官方信息', url } : null;
});
const secondaryOfficial = computed(() => officialLinks.value.filter(link => link.key !== primaryOfficial.value?.key).map(link => ({ ...link, label: { signup: '报名信息', draw: '中签查询', bib: '号码查询', result: '成绩与证书', live: '官方直播' }[link.key] || link.label })));
const officialHint = computed(() => race.value?.open ? '官方报名链接尚未录入，可关注赛事，稍后再来查看。' : '官方报名与查询入口尚未录入。');
function onOfficialOpen(link) {
  if (link.key === 'signup' && race.value?.open) askSignup.value = true;
}
const tabs = computed(() => {
  if (!race.value) return [];
  const list = [{ id: "signup", label: "赛事信息" }];
  list.push({ id: "guide", label: "参赛指南" });
  list.push({ id: "news", label: "赛事资讯" });
  list.push({ id: "result", label: "我的成绩" });
  return list;
});

function keepPosition(update) {
  const scrollY = window.scrollY;
  const panelTop = raceTabPanel.value ? raceTabPanel.value.getBoundingClientRect().top + scrollY : 0;
  tabContentMinHeight.value = Math.max(tabContentMinHeight.value, Math.ceil(scrollY + window.innerHeight - panelTop));
  update();
  nextTick(() => { if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY); });
}
function pickPlanStage(id) { keepPosition(() => { planStage.value = id; }); }
function togglePlan() { keepPosition(() => { planOpen.value = !planOpen.value; }); }
function toggleCompanion() { keepPosition(() => { companionOpen.value = !companionOpen.value; }); }
function toggleOutings() { keepPosition(() => { outingsOpen.value = !outingsOpen.value; }); }
function toggleShare() { keepPosition(() => { shareOpen.value = !shareOpen.value; }); }
function prepareFold(event) {
  if (event.target.closest('summary')) keepPosition(() => {});
}

function pickTab(id) {
  if (id === tab.value) return;
  const scrollY = window.scrollY;
  const panelTop = raceTabPanel.value?.getBoundingClientRect().top || 0;
  tabContentMinHeight.value = Math.max(tabContentMinHeight.value, Math.ceil(window.innerHeight - panelTop));
  tab.value = id;
  nextTick(() => {
    if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY);
  });
}

function moveTab(event, id) {
  const index = tabs.value.findIndex(item => item.id === id);
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.value.length - 1 : step ? (index + step + tabs.value.length) % tabs.value.length : -1;
  if (next < 0) return;
  event.preventDefault();
  const target = tabs.value[next];
  pickTab(target.id);
  nextTick(() => document.getElementById("race-tab-" + target.id)?.focus());
}

watch(tabs, (list) => {
  if (list.length && !list.some((item) => item.id === tab.value)) tab.value = "signup";
});

function openSignup(url) {
  askSignup.value = true;
  window.open(url, "_blank", "noopener");
}

async function confirmSigned() {
  if (!ready.value) {
    loginForPlan();
    return;
  }
  if (myStatus.value && myStatus.value !== "想跑") {
    message.value = "这场已经标成「" + myStatus.value + "」";
    askSignup.value = false;
    return;
  }
  const saved = await mark("已报名");
  if (!saved) return;
  askSignup.value = false;
  message.value = "已标成已报名";
}

async function onSignup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || planBusy.value) return;
  const id = String(route.params.id), token = localStorage.getItem('marathon_token'), ticket = ++actionSequence;
  planBusy.value = true;
  message.value = "";
  try {
    await upload("/me/races/" + encodeURIComponent(id) + "/sheet", file);
    if (disposed || ticket !== actionSequence || id !== String(route.params.id) || token !== localStorage.getItem('marathon_token')) return;
    await load();
    if (!disposed && ticket === actionSequence) message.value = "报名截图已上传";
  } catch (err) {
    if (!disposed && ticket === actionSequence && token === localStorage.getItem('marathon_token')) message.value = err.message;
  } finally { if (!disposed && ticket === actionSequence) planBusy.value = false; }
}

async function removeSignup() {
  if (planBusy.value) return;
  const id = String(route.params.id), token = localStorage.getItem('marathon_token'), ticket = ++actionSequence;
  planBusy.value = true;
  message.value = "";
  try {
    await api("/me/races/" + encodeURIComponent(id) + "/sheet", { method: "DELETE" });
    if (disposed || ticket !== actionSequence || id !== String(route.params.id) || token !== localStorage.getItem('marathon_token')) return;
    await load();
  } catch (err) {
    if (!disposed && ticket === actionSequence && token === localStorage.getItem('marathon_token')) message.value = err.message;
  } finally { if (!disposed && ticket === actionSequence) planBusy.value = false; }
}

async function removeResult() {
  if (!myResult.value) return;
  if (!window.confirm("去掉这项成绩？同一场的其他项目还留着。")) return;
  resultMessage.value = "";
  try {
    await api("/me/races/" + route.params.id + "/result?distance=" + encodeURIComponent(distance.value), { method: "DELETE" });
    distance.value = "";
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

async function onProof(kind, event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  resultMessage.value = "";
  try {
    await upload("/me/races/" + route.params.id + "/result/proof/" + kind + "?distance=" + encodeURIComponent(distance.value), file);
    resultMessage.value = kind === "medal" ? "奖牌照片已上传" : "证书照片已上传";
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

async function removeProof() {
  resultMessage.value = "";
  try {
    await api("/me/races/" + route.params.id + "/result/proof?distance=" + encodeURIComponent(distance.value), { method: "DELETE" });
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

async function saveResult() {
  resultMessage.value = "";
  try {
    await api("/me/races/" + route.params.id + "/result", {
      method: "PUT",
      body: JSON.stringify({ distance: distance.value, time: clock.value, story: story.value })
    });
    await load();
  } catch (err) {
    resultMessage.value = err.message;
  }
}

function squadLine(club) {
  const card = cards.value.find((item) => item.club && item.club.id === club.id);
  return card && card.squad ? card.squad.text : "";
}
async function openOutings(clubId) {
  tab.value = 'signup'; outingsOpen.value = true;
  await router.replace({ path: route.path, query: { ...route.query, clubId: clubId ? String(clubId) : undefined }, hash: '#race-outings' });
  await nextTick();
  document.getElementById('race-outings')?.scrollIntoView({ behavior: 'auto', block: 'start' });
}

const drawLines = computed(() => drawText.value.split("\n").filter(Boolean));

function savePoster() {
  drawNote.value = "";
  drawError.value = "";
  const lines = drawLines.value;
  const canvas = document.createElement("canvas");
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e1251b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  let y = 180;
  lines.forEach((line, index) => {
    ctx.font = index === 0 ? "700 64px sans-serif" : "500 36px sans-serif";
    ctx.fillText(line, 64, y, 622);
    y += index === 0 ? 120 : 72;
  });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "中签.png";
  link.click();
  drawNote.value = "图片已保存";
}

async function copyDraw() {
  drawNote.value = "";
  drawError.value = "";
  try {
    await copyText(drawText.value);
    drawNote.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    drawError.value = "没有复制成功，可以直接选中上面的文字";
  }
}

async function copyCard(card) {
  note.value = "";
  copyError.value = "";
  try {
    await copyText(card.text);
    note.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    copyError.value = "没有复制成功，可以直接选中上面的文字";
  }
}

async function mark(status) {
  return planAction('', { status });
}

watch(
  () => route.params.id,
  (id, prev) => {
    if (!prev || id === prev) return;
    actionSequence++; loadSequence++;
    planBusy.value = false;
    companionOpen.value = false;
    following.value = false; sharedClubIds.value = []; sharingDraft.value = [];
    companionNote.value = ''; companionDraft.value = ''; sharingError.value = ''; sharingMessage.value = '';
    myStatus.value = ''; clubs.value = []; cards.value = [];
    race.value = null;
    message.value = "";
    distance.value = "";
    clock.value = "";
    story.value = "";
    tab.value = initialTab();
    tabContentMinHeight.value = 0;
    planOpen.value = route.query.plan === "1";
    outingsOpen.value = route.hash === '#race-outings';
    coverFailed.value = false; qrFailed.value = false;
    if (viewer.value) closeViewer();
    shareOpen.value = false;
    selectedShareId.value = "";
    load().catch((err) => { if (String(id) === String(route.params.id || "")) message.value = err.message; });
  }
);

onMounted(() => {
  const id = String(route.params.id || "");
  load().then(async () => {
    if (ready.value && route.query.follow === '1' && id === String(route.params.id || '')) {
      const saved = await planAction('/follow', { following: true });
      if (saved) { message.value = '已关注这场比赛。'; router.replace({ path: route.path, query: { ...route.query, follow: undefined } }); }
    }
  }).catch((err) => { if (id === String(route.params.id || "")) message.value = err.message; });
});
onBeforeUnmount(() => { disposed = true; loadSequence++; actionSequence++; });
</script>

<style scoped>
.race-follow-row{display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid #eee;margin-top:12px;padding-top:12px}.race-follow-row>span{font-size:12px;line-height:1.7;color:#777}.plan-stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.plan-stages button{min-width:0;min-height:64px;padding:9px 2px;background:#f7f7f8;border-radius:8px;font-size:12px;line-height:1.5;color:#777;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px}.plan-stages small{font-size:12px;line-height:20px;border-radius:50%;width:20px;height:20px;background:#eaeaec;color:#777}.plan-stages .selected{background:#fff1f3;color:#ff1838}.plan-stages .selected small{background:#ff1838;color:#fff}.plan-stages .current{box-shadow:inset 0 0 0 1px #ffc8d1}.race-page button:disabled{opacity:.45;cursor:default}.companion-form{display:flex;flex-direction:column;gap:8px;margin-top:20px;padding-top:18px;border-top:1px solid #eee}.companion-form>label{font-size:14px;font-weight:500}.companion-form textarea{resize:vertical;border:1px solid #e5e5e5;border-radius:8px;padding:10px;font-size:14px;line-height:1.7;min-width:0;width:100%;box-sizing:border-box}.companion-form>button{align-self:flex-start}.companion-mate>span{min-width:0;flex:1;overflow-wrap:anywhere}.companion-mate small{display:block;color:#777;font-size:12px;line-height:1.7;margin-top:5px}.companionship-link{display:flex;align-items:center;min-height:44px;color:#ff1838;font-size:14px;line-height:1.7;margin-top:8px}.remove-plan{margin-top:12px}.visually-hidden{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap}
.race-archive-entry{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px;margin:12px 16px;padding:14px 16px;background:#fff0f2;border-radius:12px}.race-archive-entry strong{display:block;font-size:14px;font-weight:500}.race-archive-entry small{display:block;font-size:12px;color:#777;margin-top:4px}.race-archive-entry>span:last-child{font-size:24px;color:#ff1838}

.race-state { display: grid; justify-items: center; gap: 12px; margin: 20px 16px; padding: 32px 20px; border-radius: 12px; background: #fff; color: var(--muted); text-align: center; font-size: 14px; }
.race-state p { margin: 0; line-height: 1.6; }
.race-state-error p { color: var(--accent); }
.retry-button { min-height: 40px; padding: 0 20px; border-radius: 10px; background: var(--accent); color: #fff; font-weight: 600; }
.race-state a { color: var(--muted); font-size: 12px; }
.pass { align-items: flex-start; padding: 24px 18px; }
.pass-date { padding: 12px 8px; border-radius: 12px; background: var(--chip); }
.pass h1 { font-size: 24px; line-height: 1.4; }
.pass-pill { background: var(--accent-soft); color: var(--accent); }
.plan-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.plan-heading h2 { margin: 0; font-size: 18px; }
.plan-status { flex: none; padding: 4px 8px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 12px; }
.plan-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 12px 0 0; background: transparent; color: var(--ink); text-align: left; font-size: 14px; font-weight: 600; }
.plan-action span { color: var(--muted); font-size: 24px; font-weight: 400; line-height: 1; }
.plan-editor { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.club-share { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.club-share h3 { margin: 0 0 8px; font-size: 14px; }
.race-plan .src { font-size: 14px; line-height: 1.6; }

.detail-poster :deep(.poster) { aspect-ratio: 16 / 9; height: auto; border-radius: 0; }
.share-text { margin: 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.poster-card { margin-top: 8px; padding: 24px 20px; border-radius: 12px; background: var(--accent-soft); color: var(--ink);  border: 1px solid var(--line);}
.poster-card p { margin: 0; font-size: 16px; line-height: 1.45; }
.poster-card p:first-child { font-size: 24px; font-weight: 600; color: var(--accent); }
.poster-card p + p { margin-top: 10px; }
.src { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.note { color: var(--accent); font-size: 14px; padding: 0 16px; }
.warn { margin: 10px 0 0; color: var(--orange); font-size: 14px; line-height: 1.45; }
.copy-err { padding: 0 16px; }
.primary { margin-top: 8px; }
.result-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.result-form input { height: 40px; border: 0; border-radius: 10px; padding: 0 12px; background: var(--chip); }
.proof { display: block; width: 100%; margin-top: 8px; border-radius: 12px; }
.ask { margin-top: 12px; }
.ask p { margin: 0 0 8px; font-weight: 600; }
.ask .undo { margin-left: 8px; height: 40px; padding: 0 16px; color: var(--muted); }
.proof-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.proof-actions label { position: relative; overflow: hidden; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--chip); color: var(--accent); font-size: 14px; font-weight: 600; line-height: 36px; }
.proof-actions input { position: absolute; inset: 0; opacity: 0; }
.jump { display: block; margin-top: 8px; height: 44px; border-radius: 12px; background: var(--chip); color: var(--accent); font-weight: 600; font-size: 14px; line-height: 44px; text-align: center; }
.jump.main { background: var(--accent); color: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 10px; border-radius: 8px; background: var(--chip); font-size: 14px; font-weight: 600; }
.sheet { display: block; width: 100%; min-height: 0; margin: 8px 0 0; padding: 0; border-radius: 12px; overflow: hidden; background: var(--bg); }
.sheet img { display: block; width: 100%; }
.day-note { margin-top: 12px; }
.tabs { display: flex; gap: 12px; margin: 12px 16px 0; padding: 0 12px; border-radius: 12px; background: #fff; }
.tab { position: relative; flex: 1; height: 46px; border: 0; background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; white-space: nowrap; }
.tab.on { color: var(--accent); }
.tab.on::after { content: ""; position: absolute; right: 12px; bottom: 0; left: 12px; height: 2px; border-radius: 2px; background: var(--accent); }
.timeline { display: flex; gap: 8px; overflow-x: auto; }
.tl { flex: 1; min-width: 92px; text-align: center; }
.tl .dot { display: block; width: 8px; height: 8px; margin: 0 auto 8px; border-radius: 50%; background: var(--accent); }
.tl b, .tl span { display: block; }
.tl b { font-size: 14px; }
.tl span { margin-top: 4px; color: var(--muted); font-size: 12px; }
.signup-qr { display: block; width: 180px; height: 180px; margin: 12px auto 0; background: #fff; }
.day-note h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--muted); }
.day-note p { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.guide-md .md { margin: 10px 0 0; font-size: 14px; line-height: 1.6; }
.guide-md .md-h1 { margin-top: 4px; font-size: 24px; font-weight: 600; line-height: 1.35; }
.guide-md .md-h2 { margin-top: 18px; font-size: 18px; font-weight: 600; line-height: 1.35; }
.guide-md .md-h3 { margin-top: 14px; font-size: 18px; font-weight: 600; line-height: 1.4; }
.guide-md .md-h4 { margin-top: 12px; font-size: 16px; font-weight: 600; line-height: 1.4; }
.guide-md .md-mark { margin-right: 6px; color: var(--muted); }
.viewer { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.88); }
.viewer img { max-width: 100%; max-height: 100%; }


/* Detail pages keep one reading scale and one share action. */
.race-page{background:var(--bg);color:var(--ink);letter-spacing:normal;font-size:14px}.race-page>.topbar{background:#fff}.topbar h1{font-size:16px;letter-spacing:normal}.pass,.block,.detail{border:0;border-radius:12px;background:#fff;box-shadow:none}.pass{margin:12px 16px;padding:16px;background:linear-gradient(135deg,#fff0f2,#fffafa)}.pass h1{font-size:20px;font-weight:600;letter-spacing:normal;line-height:1.4}.pass-date{background:#fff;border:0}.pass-date b{font-size:24px;color:var(--ink);letter-spacing:normal}.pass-pill{background:var(--accent-soft);color:var(--accent);border:0}.pass-copy p{font-size:12px;line-height:1.7}.race-page h2{font-size:18px;font-weight:600;line-height:1.5;letter-spacing:normal}.row{font-size:14px;line-height:1.7;gap:16px}.row>b{font-weight:500;min-width:0;overflow-wrap:anywhere}.src{font-size:12px;line-height:1.7}.warn{font-size:12px;line-height:1.7;color:var(--accent);background:var(--accent-soft);border:0}.day-note{padding:12px 0;background:transparent;border:0}.day-note h3{font-size:14px;color:var(--ink)}.day-note p{font-size:14px;line-height:1.7}.race-page button,.race-page input,.race-page select,.race-page textarea{letter-spacing:normal}.race-page .primary,.race-page .jump,.race-page .status,.race-page .undo,.race-page .proof-actions label,.race-page .retry-button{min-height:44px;height:auto;border-radius:8px;font-size:14px;line-height:1.5;padding:11px 16px}.race-page .primary{background:var(--accent)}.race-page .statuses{display:flex;flex-wrap:wrap;gap:8px}.race-page .status{margin:0}.result-form input,.result-form select{height:46px;font-size:14px;border-radius:8px}.proof-actions label{display:flex;align-items:center}.plan-action{min-height:44px;padding:10px 0;font-size:14px;font-weight:500}.tabs{gap:4px;margin:16px 16px 0;padding:0 8px;border-radius:12px}.tab{height:48px;font-size:14px;font-weight:500}.mate{font-size:14px;line-height:1.7;gap:12px}.mate>b{font-size:12px;line-height:1.7;font-weight:400}.share-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:44px;padding:0;background:transparent;text-align:left;color:var(--ink);font-size:18px;font-weight:600}.share-toggle>span:last-child{font-size:24px;color:var(--muted);font-weight:400}.race-share>.src{margin-top:2px}.share-content{margin-top:16px}.share-options{display:grid;gap:0;border-top:1px solid var(--line)}.share-option{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:14px 0;text-align:left;border-bottom:1px solid var(--line);background:transparent;color:var(--ink)}.share-radio{display:block;flex:none;width:18px;height:18px;border:1.5px solid var(--line);border-radius:50%;box-sizing:border-box}.share-option[aria-checked=true] .share-radio{border:5px solid var(--accent)}.share-option-copy{display:grid;gap:4px;min-width:0}.share-option-copy>b{font-size:16px;font-weight:500;line-height:1.6;overflow-wrap:anywhere}.share-option-copy>small{font-size:12px;color:var(--muted);line-height:1.7;overflow-wrap:anywhere}.race-share .share-submit{width:100%;min-height:46px;margin-top:16px}.share-feedback{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.7}.share-copy-fallback{margin:12px 0 0;white-space:pre-wrap;font:inherit;font-size:14px;line-height:1.7;color:var(--ink)}.guide-md .md-h1{font-size:18px}.guide-md .md-h3{font-size:16px}.guide-md .md-h4{font-size:14px}.poster-card p:first-child{font-size:24px;letter-spacing:normal}
</style>

<style scoped src="../race-plan.css"></style>
<style scoped src="../race-detail.css"></style>
