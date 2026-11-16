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
    <div v-if="race" class="pass" :class="'tone-' + tone">
      <div class="pass-date">
        <b>{{ parts.day }}</b>
        <span>{{ parts.month }}月</span>
      </div>
      <div class="pass-copy">
        <span class="pass-pill">赛事 · {{ race.regStatus }}</span>
        <h1>{{ race.name }}</h1>
        <p>{{ placeLine }}<template v-if="projectLabels.length"> · {{ projectLabels.join(" / ") }}</template></p>
      </div>
    </div>
    <div v-if="race" class="detail">
      <div class="row"><span>比赛日</span><b>{{ race.raceDate }}</b></div>
      <div class="row"><span>地点</span><b>{{ locationLine }}</b></div>
      <div class="row"><span>项目</span><b>{{ projectLabels.join(" / ") }}</b></div>
      <div class="row"><span>举办</span><b>{{ race.meet === "online" ? "线上" : "线下" }}</b></div>
      <div class="row"><span>{{ race.deadlineName }}</span><b :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</b></div>
      <div v-if="race.phone" class="row"><span>咨询</span><b>{{ race.phone }}</b></div>
      <p v-if="race.gradeLabel" class="src">{{ race.gradeLabel }}</p>
      <p v-for="item in conflicts" :key="item.text" class="warn">{{ item.text }}</p>
      <div class="race-follow-row">
        <span class="follow-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1Z"/></svg></span>
        <span class="follow-copy"><strong>{{ following ? '已关注这场比赛' : '关注这场比赛' }}</strong><small>收进我的赛事，报名节点会在站内提醒。</small></span>
        <FollowRaceButton appearance="detail" :race-id="race.id" :race-name="race.name" :following="following" @change="value => following = value" />
      </div>
    </div>
    <router-link v-if="race?.archiveId" class="race-archive-entry" :to="{path:'/race-catalog/'+race.archiveId,query:{fromRaceId:String(race.id)}}"><span><strong>报名前，先了解这场比赛</strong><small>历年赛道 · 报名中签 · 完赛与奖牌</small></span><span aria-hidden="true">›</span></router-link>
    <section v-if="race" class="block race-plan" :class="{ 'is-open': ready && planOpen }" aria-labelledby="race-plan-title">
      <div class="plan-heading"><h2 id="race-plan-title">我的参赛计划</h2><span class="plan-privacy"><svg v-if="!sharedClubIds.length" viewBox="0 0 16 16" aria-hidden="true" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7"/></svg>{{ sharedClubIds.length ? sharedClubIds.length + ' 个跑团可见' : '仅自己可见' }}</span></div>
      <div class="plan-summary">
        <div class="plan-summary-copy"><span class="plan-summary-label">{{ myStatus ? '当前状态' : '为下一场，留个位置' }}</span><strong class="plan-status" :class="{ 'is-empty': !myStatus }">{{ myStatus || '还没有参赛计划' }}</strong></div>
        <button v-if="!ready" class="plan-action" type="button" @click="loginForPlan">登录后标记<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></button>
        <button v-else class="plan-action" type="button" :aria-label="planOpen ? '收起参赛状态' : myStatus ? '修改参赛状态' : '标记参赛状态'" :aria-expanded="planOpen" aria-controls="race-plan-editor" @click="planOpen = !planOpen">{{ planOpen ? '收起' : myStatus ? '修改' : '添加计划' }}<svg viewBox="0 0 16 16" aria-hidden="true" :class="{ expanded: planOpen }"><path d="m6 4 4 4-4 4"/></svg></button>
      </div>
      <div v-if="ready && planOpen" id="race-plan-editor" class="plan-editor">
        <nav class="plan-stages" aria-label="参赛阶段"><button v-for="(stage, index) in planStages" :key="stage.id" type="button" :class="{ selected: planStage === stage.id, current: stageFor(myStatus) === stage.id && myStatus }" :aria-label="(index + 1) + ' ' + stage.label" :aria-pressed="planStage === stage.id" @click="planStage = stage.id"><small aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</small><span>{{ stageLabels[stage.id] }}</span></button></nav>
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
      <button type="button" class="club-sync-toggle" aria-label="同步设置与同行需求" :aria-expanded="companionOpen" aria-controls="club-sync-panel" @click="companionOpen = !companionOpen">
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
    <RaceOutings v-if="race" :race-id="race.id" :clubs="clubs" :ready="ready" />
    <div v-if="tabs.length" class="tabs" role="tablist">
      <button v-for="item in tabs" :key="item.id" type="button" class="tab" :class="{ on: tab === item.id }" @click="pickTab(item.id)">{{ item.label }}</button>
    </div>
    <template v-if="race && tab === 'signup'">
      <div v-if="race.nodes.length" class="block">
        <div class="timeline">
          <div v-for="node in race.nodes" :key="node.key" class="tl">
            <span class="dot"></span>
            <b>{{ node.at }}</b>
            <span>{{ node.label }}</span>
          </div>
        </div>
        <p v-for="node in race.nodes.filter((item) => item.text)" :key="node.key + '-text'" class="src">{{ node.label }} {{ node.text }}</p>
      </div>
      <div v-if="showFacts" class="block">
        <h2>项目</h2>
        <div v-if="projectLabels.length" class="chips">
          <span v-for="label in projectLabels" :key="label" class="chip">{{ label }}</span>
        </div>
        <div v-if="race.startAt" class="row"><span>起跑</span><b>{{ race.startAt }}</b></div>
        <div v-if="race.fee" class="row"><span>报名费</span><b>{{ race.fee }}</b></div>
        <div v-if="race.scale" class="row"><span>规模</span><b>{{ race.scale }}</b></div>
      </div>
      <div v-if="drawRates.length" class="block">
        <h2>历年中签</h2>
        <p class="src">按公布的报名人数和名额计算。来源写在每一届下面。</p>
        <div v-for="item in drawRates" :key="item.id" class="mate">
          <span>{{ item.label }} · 报名 {{ item.applicants }} · 名额 {{ item.quota }} · {{ item.rateText }}</span>
          <b>来源 {{ item.source }}</b>
        </div>
      </div>
      <div class="block">
        <h2>官方报名信息</h2>
        <p class="src">{{ signupHint }}</p>
        <img v-if="signupQr" class="signup-qr" :src="signupQr" alt="报名页二维码" />
        <button v-if="signupQr && signupLink" type="button" class="jump main" @click="openSignup(signupLink.url)">打开报名页</button>
        <div v-if="askSignup" class="ask">
          <p>报上了吗</p>
          <button class="primary" type="button" @click="confirmSigned">报上了</button>
          <button class="undo" type="button" @click="askSignup = false">还没有</button>
        </div>
        <p class="src">报名和缴费请以组委会官方页面为准。</p>
      </div>
      <section v-if="cards.length" class="block race-share">
        <button class="share-toggle" type="button" :aria-expanded="shareOpen" aria-controls="race-share-options" @click="shareOpen = !shareOpen"><span>分享赛事到跑团</span><span aria-hidden="true">{{ shareOpen ? '⌃' : '›' }}</span></button>
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
      <div v-if="clubs.length && !activeCompanionClubs.length" class="block companion-empty"><h2>团友参赛记录</h2><p class="src">这里展示团友主动同步的个人参赛记录，目前还没有公开记录。想约伙伴，可直接发起或加入本场同行安排。</p><button class="companionship-link" type="button" @click="openOutings()">查看本场同行安排 ›</button></div>
      <div v-for="club in activeCompanionClubs" :key="club.id" class="block">
        <h2>{{ club.name }} · 参赛记录</h2>
        <p class="src">仅显示主动同步到本团的参赛记录，以下为团友自行标记。</p>
        <p v-if="squadLine(club)" class="warn">{{ squadLine(club) }}</p>
        <div v-if="!club.mates.length" class="empty">还没有团友分享这场参赛计划</div>
        <div v-for="mate in club.mates" :key="mate.userId || mate.nickname" class="mate companion-mate">
          <span>{{ mate.nickname }}<small v-if="mate.note">{{ mate.note }}</small></span><b>{{ mate.status }}</b>
        </div>
        <button class="companionship-link" type="button" @click="openOutings(club.id)">查看本团本场同行安排 ›</button>
      </div>
    </template>
    <template v-if="race && tab === 'guide'">
      <div class="block">
        <h2>竞赛规程</h2>
        <p v-if="guideBlocks.length" class="src">按标题阅读。奖金、关门时间和参赛资格以组委会原文为准。</p>
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
          <button v-for="sheet in race.guide" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
            <img :src="sheetSrc(sheet.id)" alt="竞赛规程原页" />
          </button>
        </template>
      </div>
    </template>
    <template v-if="race && tab === 'news'">
      <div v-if="articles.length" class="block">
        <h2>相关资讯</h2>
        <router-link v-for="item in articles" :key="item.id" class="mate" :to="'/news/' + item.id">
          <span>{{ item.title }}</span>
          <b>{{ item.publishedAt }}</b>
        </router-link>
      </div>
      <div v-if="race.organizer || race.source || race.eventUrl || race.officialUrl || queryLinks.length" class="block">
        <h2>这场的页面</h2>
        <p v-if="race.organizer" class="src">主办 {{ race.organizer }}</p>
        <p v-if="race.source" class="src">来源 {{ race.source }}<template v-if="race.updatedAt"> · 更新于 {{ race.updatedAt }}</template></p>
        <p v-if="race.eventUrl" class="src"><a :href="race.eventUrl" target="_blank" rel="noopener">赛事网站</a></p>
        <p v-if="race.officialUrl" class="src"><a :href="race.officialUrl" target="_blank" rel="noopener">中国马拉松官网这场</a></p>
        <a v-for="link in queryLinks" :key="link.key" class="jump" :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
      </div>
      <div v-if="dayNotes.length || routeSheets.length || race.pacerSheets.length" class="block">
        <h2>比赛日</h2>
        <div v-for="item in dayNotes" :key="item.label" class="day-note">
          <h3>{{ item.label }}</h3>
          <p v-if="item.text">{{ item.text }}</p>
          <div v-if="item.label === '路线' && routeSheets.length" class="pacer-photos">
            <button v-for="sheet in routeSheets" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
              <img :src="sheetSrc(sheet.id)" alt="路线图" />
            </button>
          </div>
        </div>
        <div v-if="race.pacerSheets.length" class="pacer-photos">
          <button v-for="sheet in race.pacerSheets" :key="sheet.id" class="sheet" type="button" @click="openSheet(sheet.id)">
            <img :src="sheetSrc(sheet.id)" alt="配速员" />
          </button>
        </div>
      </div>
      <div v-if="race.liveSheet" class="block">
        <h2>直播</h2>
        <p class="src">扫组委会的二维码。</p>
        <button class="sheet" type="button" @click="openSheet(race.liveSheet.id)">
          <img :src="sheetSrc(race.liveSheet.id)" alt="直播二维码" />
        </button>
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
        <h2>成绩</h2>
        <p class="src">手记的成绩标为未核验。可以附一张证书或奖牌照片。</p>

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
          <input v-model="clock" placeholder="3:29:59" />
          <input v-model="story" maxlength="200" placeholder="这场想记的一句" />
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
    <button v-if="viewer" class="viewer" type="button" @click="viewer = ''">
      <img :src="viewer" alt="放大查看" />
    </button>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, raceSheetSrc, resultProofSrc, signupSheetSrc, upload } from "../api";
import { copyText } from "../copy";
import { dateParts, toneOf } from "../tone";
import { parseGuide } from "../guide-md";
import FollowRaceButton from '../components/FollowRaceButton.vue';
import RaceOutings from '../components/RaceOutings.vue';
import { planStages, stageFor } from '../participation';
const route = useRoute();
const router = useRouter();
const planOpen = ref(route.query.plan === "1");
const shareOpen = ref(false);
const following = ref(false), planStage = ref('interest'), planBusy = ref(false);
const companionOpen = ref(false);
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
async function saveSharing() { if (await planAction('/sharing', { clubIds: sharingDraft.value })) sharingMessage.value = sharedClubIds.value.length ? '已更新同步范围，后续参赛状态会自动同步。' : '已设为仅自己可见。'; }
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
async function choosePlan(status) {
  if (await mark(status)) message.value = "已标记为「" + status + "」";
}
const race = ref(null);
const tone = computed(() => toneOf(race.value));
const parts = computed(() => dateParts(race.value && race.value.raceDate));
const placeLine = computed(() => {
  if (!race.value) return "";
  return race.value.province === race.value.city ? race.value.city : race.value.province + " · " + race.value.city;
});
const locationLine = computed(() => {
  if (!race.value) return "";
  const parts = [];
  if (placeLine.value) parts.push(placeLine.value);
  if (race.value.district) parts.push(race.value.district);
  const spot = race.value.place;
  if (spot && spot !== race.value.city && spot !== race.value.province && spot !== race.value.district) parts.push(spot);
  return parts.join(" · ");
});
const projectLabels = computed(() => {
  if (!race.value) return [];
  const kinds = [...race.value.kindLabels];
  if (race.value.kind === "trail" && !kinds.includes("越野")) kinds.unshift("越野");
  return [...race.value.distanceLabels, ...kinds, ...race.value.groups];
});
const showFacts = computed(() => {
  if (!race.value) return false;
  return race.value.kindLabels.length || race.value.groups.length || race.value.fee || race.value.scale || race.value.startAt;
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
const viewer = ref("");
function sheetSrc(id) {
  return raceSheetSrc(id);
}
function openSheet(id) {
  viewer.value = sheetSrc(id);
}
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
    race.value = data.race;
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
      else if (data.race.distances.length) distance.value = data.race.distances[0];
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
const tab = ref("signup");
const signupLink = computed(() => ((race.value && race.value.links) || []).find((item) => item.key === "signup") || null);
const queryLinks = computed(() => ((race.value && race.value.links) || []).filter((item) => item.key !== "signup" && item.url.startsWith("https://")));
const signupQr = computed(() => (race.value && race.value.signupHost ? "/marathon/api/races/" + encodeURIComponent(race.value.id) + "/signup-qr" : ""));
const signupHint = computed(() => {
  if (!race.value || !race.value.signupHost) return "这场还没有报名链接。这里不报名，也不收款。";
  const where = race.value.signupChannel ? race.value.signupChannel + "的报名页" : race.value.signupHost + " 上的报名页";
  return "用手机扫这个码，打开" + where + "。这里不报名，也不收款。";
});
const tabs = computed(() => {
  if (!race.value) return [];
  const list = [{ id: "signup", label: "赛事信息" }];
  if (race.value.guideText || (race.value.guide && race.value.guide.length)) list.push({ id: "guide", label: "竞赛规程" });
  list.push({ id: "news", label: "赛事资讯" });
  if (ready.value || drawText.value) list.push({ id: "result", label: "我的成绩" });
  return list;
});

function pickTab(id) {
  tab.value = id;
  window.scrollTo(0, 0);
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
    message.value = "先到「我的」登录";
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
  await router.replace({ path: route.path, query: { ...route.query, clubId: clubId ? String(clubId) : undefined }, hash: '#race-outings' });
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
    tab.value = "signup";
    planOpen.value = route.query.plan === "1";
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
