<template>
  <main class="club-page">
    <header class="topbar club-topbar">
      <router-link to="/clubs" class="club-back" aria-label="返回我的跑团"><RunnerIcon name="back" /></router-link>
      <router-link to="/clubs" class="club-switch">我的跑团 <span>切换跑团⌄</span></router-link>
      <button v-if="club && club.publicStatus !== 'restricted'" type="button" class="top-invite" :disabled="inviting" @click="copyInvite">邀请跑友</button><span v-else></span>
    </header>
    <div v-if="loading && !club" class="club-loading" role="status"><span class="loading-ring"></span><b>正在打开跑团</b><p>准备活动与团友信息</p></div>
    <section v-if="club" class="club-hero">
      <div class="club-identity">
        <span class="club-letter" aria-hidden="true">{{ club.name.slice(0, 1) }}</span>
        <div class="club-identity-copy"><p class="club-eyebrow">RUN TOGETHER · 一起跑，更远一点</p><h1>{{ club.name }}</h1><ClubVerificationBadge :club="club" /><p class="club-leader">{{ club.city || "城市待补充" }} · 团号 #{{ club.id }}</p><p class="club-leader">团长 {{ leaderName }}<span class="role-badge">{{ club.roleLabel }}</span></p></div>
      </div>
      <div class="hero-bottom">
        <button class="club-avatars" type="button" @click="go('people')" aria-label="查看跑团成员">
          <span v-for="member in members.slice(0, 4)" :key="member.id" class="club-avatar"><img v-if="member.avatar" :src="member.avatar" :alt="member.nickname" /><template v-else>{{ member.nickname.slice(0, 1) }}</template></span>
          <span class="avatar-caption">{{ members.length }} 位跑友 <i>›</i></span>
        </button>
        <router-link v-if="club.staff" class="hero-publish" :to="'/clubs/' + club.id + '/activities/new'"><RunnerIcon name="add" />发布活动</router-link>
        <button v-else class="hero-publish secondary" type="button" @click="go('act')">找一场活动 <span>→</span></button>
      </div>
    </section>
    <section v-if="club && club.publicStatus !== 'restricted' && route.query.created === '1'" class="block created-welcome"><p>你的跑团，今天开始</p><h2>先邀请第一位跑友</h2><p>{{ club.city || "城市待补充" }} · 负责人 {{ leaderName }} · 团号 #{{ club.id }}</p><button class="primary" type="button" :disabled="inviting" @click="copyInvite">邀请第一位跑友</button><router-link :to="'/clubs/' + club.id + '/activities/new'">发布第一次约跑 →</router-link><router-link :to="'/clubs/' + club.id + '/identity'">已有线下跑团？核验组织身份 ›</router-link></section>
    <nav v-if="club" class="seg primary-tabs" aria-label="跑团导航">
      <button v-for="item in mainTabs" :key="item.id" type="button" :class="{ on: activeMainTab === item.id }" :aria-current="activeMainTab === item.id ? 'page' : undefined" @click="go(item.id)">{{ item.label }}<span v-if="item.id === 'people' && club.staff && requests.length" class="tab-dot"></span></button>
    </nav>
    <div v-if="club && ['album', 'feed', 'partner'].includes(tab)" class="service-heading"><button type="button" @click="go('overview')"><RunnerIcon name="back" />返回今日</button><h2>{{ serviceTitle }}</h2></div>
    <section v-if="club && tab === 'overview'" class="overview">
      <button v-if="club.staff && requests.length" class="review-reminder" type="button" @click="go('people')"><span class="reminder-dot"></span><b>{{ requests.length }} 位跑友等你审核</b><span>去处理 ›</span></button>
      <div class="section-head"><div><p class="section-eyebrow">NEXT UP</p><h2>下一场，一起跑</h2></div><button type="button" @click="go('act')">全部活动 <span>›</span></button></div>
      <router-link v-if="nextActivity" class="next-activity" :to="'/clubs/' + club.id + '/activities/' + nextActivity.id">
        <div class="next-topline"><span class="activity-kind">团练</span><span class="activity-status" :class="{ signed: nextActivity.mine && nextActivity.mine.signed }">{{ nextActivity.mine && nextActivity.mine.signed ? '我已报名' : nextActivity.statusLabel }}</span></div>
        <h3>{{ nextActivity.title }}</h3><p class="next-time">{{ nextActivity.dateLabel }} <b>{{ nextActivity.clockLabel }}</b></p>
        <p class="next-place"><RunnerIcon name="footprints" />{{ nextActivity.place || '集合地点待定' }}<span v-if="nextActivity.plannedKm"> · {{ nextActivity.plannedKm }} 公里</span></p>
        <div class="next-footer"><span>{{ nextActivity.signupCount }} 位跑友已报名<template v-if="nextActivity.capacity"> · 上限 {{ nextActivity.capacity }} 人</template></span><b>{{ nextActivity.mine && nextActivity.mine.signed ? '查看报名' : '查看活动' }} <i>→</i></b></div>
      </router-link>
      <div v-else class="next-empty"><span class="empty-track"><RunnerIcon name="calendar" /></span><div><h3>下一次集合，值得期待</h3><p>{{ club.staff ? '发布训练，让跑友提前安排时间。' : '活动发布后，在这里查看并报名。' }}</p></div><router-link v-if="club.staff" :to="'/clubs/' + club.id + '/activities/new'">发布活动 →</router-link><button v-else type="button" @click="go('act', 'meetup')">看看约跑 →</button></div>
      <div class="quick-actions" aria-label="常用功能">
        <button type="button" @click="go('act')"><span class="quick-icon"><RunnerIcon name="calendar" /></span><b>活动报名</b></button>
        <button type="button" @click="go('race')"><span class="quick-icon"><RunnerIcon name="career" /></span><b>赛事名单</b></button>
        <button type="button" @click="go('km')"><span class="quick-icon"><RunnerIcon name="stats" /></span><b>跑量排行</b></button>
        <button type="button" @click="go('people')"><span class="quick-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></svg></span><b>跑团成员</b></button>
      </div>
      <div class="my-club-status"><button type="button" @click="openMyActivities"><span>我的待参加</span><b>{{ myUpcomingActivities.length }}<small>场团练</small></b></button><button type="button" @click="go('people', 'fees')"><span>本期会费</span><b class="status-word">{{ feeCurrent ? (feeCurrent.mine?.label || '待确认') : '暂未开设' }}<small>查看详情 ›</small></b></button></div>
      <details class="daily-card"><summary><span class="daily-icon"><RunnerIcon name="calendar" /></span><span><b>{{ checkedIn ? '今天已签到' : '今天也一起出发' }}</b><small>团练签到 · {{ todayCheckCount }} 位跑友已到</small></span><i>{{ checkedIn ? '修改' : '签到' }} ›</i></summary>
      <form class="check-form daily-form" @submit.prevent="checkIn">
        <input v-model="checkNote" maxlength="40" placeholder="可写一句，比如夜跑" />
        <button class="primary" type="submit">{{ checkedIn ? "改一句" : "签到" }}</button>
      </form>
      <button v-if="checkedIn" class="undo" type="button" @click="undoCheckin">撤销今天</button>
      <p v-if="!checkins.length" class="rank-label">今天还没有人签到。</p>
      <div v-for="day in checkins" :key="day.date">
        <p class="rank-label">{{ day.label }}</p>
        <div v-for="row in day.rows" :key="day.date + '-' + row.userId" class="mate">
          <span>{{ row.nickname }}</span>
          <b>{{ row.note }}</b>
        </div>
      </div>
      <p v-if="checkMessage" class="err">{{ checkMessage }}</p>
      </details>
      <div class="section-head"><div><p class="section-eyebrow">RACE TOGETHER</p><h2>同场的跑友</h2></div><button type="button" @click="go('race')">赛事名单 ›</button></div>
      <router-link v-if="nextRace" class="overview-row" :to="'/races/' + nextRace.race.id"><span class="race-date"><b>{{ dateParts(nextRace.race.raceDate).day }}</b><small>{{ dateParts(nextRace.race.raceDate).month }}月</small></span><span><strong>{{ nextRace.race.name }}</strong><small>{{ nextRace.marks.length }} 位团友已标记参赛 · {{ nextRace.race.raceDate }}</small></span><i>›</i></router-link>
      <div v-else class="overview-empty"><p>还没有即将开赛的团内赛事</p><router-link to="/">去赛历标记参赛 →</router-link></div>
      <div class="section-head"><h2>更多服务</h2></div>
      <div class="service-grid"><button type="button" @click="go('album')"><RunnerIcon name="media" /><span>活动相册</span><i>›</i></button><button type="button" @click="go('feed')"><RunnerIcon name="help" /><span>团内动态</span><i>›</i></button><button type="button" @click="go('people', 'fees')"><RunnerIcon name="calendar" /><span>会费名单</span><i>›</i></button><button type="button" @click="go('people', 'manage', 'gifts')"><RunnerIcon name="honors" /><span>积分礼品</span><i>›</i></button><button type="button" @click="go('partner')"><RunnerIcon name="career" /><span>合作权益</span><i>›</i></button><button type="button" @click="go('people', 'manage')"><RunnerIcon name="lock" /><span>{{ club.staff ? '跑团管理' : '跑团设置' }}</span><i>›</i></button></div>
    </section>
    <div v-if="club && tab === 'race'" class="section-head club-section-head"><h2>跑团比赛名单</h2><div><span>{{ board.length }} 场比赛</span><button class="undo" type="button" @click="exportBoardCsv">导出完整 CSV</button></div></div>
    <p v-if="club && tab === 'race' && !board.length" class="empty">还没有人标比赛。打开一场，标上想跑或已报名。</p>
    <div v-for="item in board" v-show="tab === 'race'" :key="item.race.id" class="block">
      <router-link :to="'/races/' + item.race.id" class="card">
        <div class="copy">
          <p>{{ item.race.name }}</p>
          <div class="foot"><span>{{ item.race.raceDate }}</span><span>{{ item.race.deadlineLabel }}</span></div>
        </div>
      </router-link>
      <p v-if="tallyLine(item)" class="rank-label">{{ tallyLine(item) }}</p>
      <p v-if="item.squad && item.squad.text" class="squad">{{ item.squad.text }}</p>
      <p v-if="item.alternativeNote" class="squad">{{ item.alternativeNote }}</p>
      <router-link v-for="alt in item.alternatives || []" :key="alt.id" class="mate" :to="'/races/' + alt.id">
        <span>{{ alt.name }}</span><b>{{ alt.deadlineLabel }}</b>
      </router-link>
      <details class="race-roster"><summary><span>参赛名单 <b>{{ item.marks.length }} 人</b></span><i>展开名单⌄</i></summary><pre class="share-text">{{ item.text }}</pre>
      <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate"><span>{{ mark.nickname }}</span><b>{{ mark.status }}<template v-if="mark.clock"> · {{ mark.clock }}<template v-if="mark.pb"> PB</template></template></b></div></details>
      <button class="primary" type="button" @click="copyCard(item)">复制卡片</button>
      <button class="undo" type="button" @click="exportRacePoster(item)">生成本场赛事画像</button>

    </div>
    <div v-if="tab === 'race' && ranks.length" class="block">
      <h2>团内成绩</h2>
      <p class="rank-label">每人每项只留最好的一场。</p>
      <div v-for="group in ranks" :key="group.distance">
        <p class="rank-label">{{ group.label }}</p>
        <router-link v-for="row in group.rows" :key="group.distance + row.nickname" class="mate" :to="'/races/' + row.raceId">
          <span>{{ row.place }} {{ row.nickname }}</span>
          <b>{{ row.clock }}</b>
        </router-link>
      </div>
    </div>
    <div v-if="club && tab === 'race'" class="block">
      <h2>成绩统计</h2>
      <p class="rank-label">发到群里填写。填完后全团都能看。</p>
      <router-link v-for="item in resultCalls" :key="item.id" class="mate" :to="'/clubs/' + club.id + '/calls/' + item.id">
        <span>{{ item.title }}</span>
        <b>{{ item.filled }} 人 · {{ item.closed ? "已截止" : item.deadlineLabel }}</b>
      </router-link>
      <p v-if="!resultCalls.length" class="rank-label">还没有成绩统计。</p>
      <button v-if="club.staff" class="manage-toggle" type="button" :aria-expanded="!!expanded.call" @click="expanded.call = !expanded.call"><span>{{ expanded.call ? '收起' : '发起成绩接龙' }}</span><i>{{ expanded.call ? '−' : '+' }}</i></button>
        <form v-if="club.staff && expanded.call" class="check-form" @submit.prevent="createCall">
        <input v-model="raceQuery" placeholder="从赛历搜一场，例如璧山" @input="searchRaces" />
        <button v-for="race in raceHits" :key="race.id" class="undo pick" type="button" @click="pickRace(race)">{{ race.raceDate }} {{ race.name }}</button>
        <p v-if="pickedRace" class="rank-label">已选 {{ pickedRace.name }} <button class="undo inline" type="button" @click="clearRace">改成手写</button></p>
        <input v-model="callTitle" maxlength="80" :disabled="!!pickedRace" placeholder="没有这场时，写比赛名称" />
        <input v-model="callDate" placeholder="比赛日 2026-11-15" />
        <div class="checks">
          <label v-for="opt in distanceOptions" :key="opt.id"><input v-model="callDistances" type="checkbox" :value="opt.id" /> {{ opt.label }}</label>
        </div>
        <input v-model="callOther" inputmode="decimal" placeholder="其他距离，公里，可不填" />
        <input v-model="callDeadline" placeholder="截止 2026-11-22 22:00，可空" />
        <input v-model="callNote" maxlength="100" placeholder="说明，例如填净计时" />
        <button class="primary" type="submit">发起</button>
      </form>
    </div>
    <template v-if="club && tab === 'act'">
      <div class="activity-heading"><div><h2>活动广场</h2><p>按自己的节奏，找到下一次集合</p></div><router-link v-if="club.staff" class="small-primary" :to="'/clubs/' + club.id + '/activities/new'">+ 发布活动</router-link></div>
      <div class="secondary-tabs" aria-label="活动类型"><button v-for="item in activityTabs" :key="item.id" type="button" :class="{ on: activityView === item.id }" @click="go('act', item.id)">{{ item.label }} <small>{{ item.id === 'training' ? activities.length : item.id === 'meetup' ? meetups.length : internals.length }}</small></button></div>
      <template v-if="activityView === 'training'">
      <div class="block activity-filter">
        <button type="button" class="undo mine-filter" :class="{ on: mineOnly }" :aria-pressed="mineOnly" @click="toggleMyActivities">我的待参加 <small>{{ myUpcomingActivities.length }}</small></button>
        <input v-model="actQuery" placeholder="搜活动标题" />
        <div class="checks">
          <button type="button" class="undo" :class="{ on: !actStatus }" @click="actStatus = ''">全部</button>
          <button v-for="item in statusFilters" :key="item.id" type="button" class="undo" :class="{ on: actStatus === item.id }" @click="actStatus = item.id">{{ item.label }}</button>
        </div>
        <div class="checks date-strip">
          <button type="button" class="undo" :class="{ on: !actDay }" @click="actDay = ''">全部日期</button>
          <button v-for="day in dayStrip" :key="day.date" type="button" class="undo" :class="{ on: actDay === day.date }" @click="actDay = day.date">{{ day.label }}</button>
        </div>
        <button type="button" class="undo" @click="showMonth = !showMonth">{{ showMonth ? "收起月历" : "月历" }}</button>
        <div v-if="showMonth" class="month">
          <div class="checks">
            <button type="button" class="undo" @click="shiftMonth(-1)">上个月</button>
            <span>{{ monthCursor }}</span>
            <button type="button" class="undo" @click="shiftMonth(1)">下个月</button>
          </div>
          <div class="month-grid">
            <span v-for="name in weekNames" :key="name" class="dow">{{ name }}</span>
            <button v-for="(cell, index) in monthCells" :key="index" type="button" class="day" :class="{ mark: cell && cell.marked, on: cell && actDay === cell.date }" :disabled="!cell" @click="cell && (actDay = cell.date)">{{ cell ? cell.day : "" }}</button>
          </div>
        </div>
      </div>
      <div v-for="item in shownActivities" :key="item.id" class="block act">
        <label v-if="sharing" class="rank-label"><input v-model="shareIds" type="checkbox" :value="item.id" /> 选这场</label>
        <router-link :to="'/clubs/' + club.id + '/activities/' + item.id">
          <div class="act-topline"><span>{{ item.dateLabel }} · {{ item.clockLabel }}</span><b :class="{ signed: item.mine && item.mine.signed }">{{ item.mine && item.mine.signed ? '我已报名' : item.statusLabel }}</b></div><h2>{{ item.title }}</h2>
          <p class="rank-label"><template v-if="item.place">{{ item.place }}</template><template v-if="item.plannedKm"> · {{ item.plannedKm }} 公里</template></p>
          <p class="rank-label activity-count">{{ item.signupCount }} 人报名<template v-if="item.capacity"> · 上限 {{ item.capacity }} 人</template><span>查看活动 →</span></p>
        </router-link>
        <router-link v-if="club.staff" class="copy-activity" :to="'/clubs/' + club.id + '/activities/new?copy=' + item.id">复制这场</router-link>
      </div>
      <div v-if="!shownActivities.length" class="activity-empty block"><RunnerIcon name="calendar" /><h3>{{ activities.length ? '没有符合条件的活动' : '下一场团练，等你一起' }}</h3><p>{{ activities.length ? '试试其他日期或报名状态。' : '每周训练、活动报名都放在这里。' }}</p><button v-if="activities.length" type="button" class="undo" @click="clearActivityFilters">清除筛选</button><router-link v-else-if="club.staff" class="small-primary" :to="'/clubs/' + club.id + '/activities/new'">发布第一场活动</router-link></div>
      <div class="block activities-share">
        <div class="share-toolbar"><span>把活动安排分享给跑友</span><button type="button" class="undo" @click="sharing = !sharing">{{ sharing ? "完成" : "分享" }} <i>↗</i></button></div>
        <template v-if="sharing">
          <div class="checks">
            <button type="button" class="undo" @click="selectVisible">全选</button>
            <button type="button" class="undo" @click="selectRecent(3)">最近 3 场</button>
            <button type="button" class="undo" @click="selectRecent(5)">最近 5 场</button>
            <button type="button" class="undo" @click="selectDays(3)">近 3 天</button>
            <button type="button" class="undo" @click="selectDays(7)">近 7 天</button>
          </div>
          <button type="button" class="primary" @click="copyShare">文字分享</button>
          <button type="button" class="primary" @click="pictureShare">图片分享</button>
        </template>
      </div>
      <details v-if="attendance" class="block attendance-disclosure"><summary><b>出勤榜</b><span>查看我的出勤与排行 ›</span></summary>
        <p class="rank-label">按已打卡的活动次数。只报名、没打卡不加。</p>
        <div class="checks">
          <button v-for="item in attendRanges" :key="item.id" type="button" class="undo" :class="{ on: attendRange === item.id }" @click="openAttend(item.id)">{{ item.label }}</button>
        </div>
        <p v-if="attendance.me" class="rank-label">我 {{ attendance.me.placeLabel }} · {{ attendance.me.count }} 次</p>
        <div v-for="row in attendance.rows.filter((item) => item.count > 0).slice(0, 10)" :key="row.userId" class="mate">
          <span>{{ row.place }} {{ row.nickname }}</span>
          <b>{{ row.count }} 次</b>
        </div>
        <button type="button" class="primary" @click="exportAttend">导出图片</button>
      </details>
      </template>
      <div v-if="activityView === 'meetup'" class="block">
        <h2>约跑</h2>
        <p class="rank-label">三人以上，当天打卡并上传合影才记积分。团练签到不加分。</p>
        <router-link v-for="item in meetups" :key="item.id" class="mate" :to="'/clubs/' + club.id + '/meetups/' + item.id">
          <span>{{ item.dateLabel }} {{ item.place }}</span>
          <b>{{ item.checkCount }} 人 · {{ item.statusLabel }}</b>
        </router-link>
        <p v-if="!meetups.length" class="rank-label">还没有约跑。</p>
        <button class="manage-toggle" type="button" :aria-expanded="!!expanded.meetup" @click="expanded.meetup = !expanded.meetup"><span>{{ expanded.meetup ? '收起' : '发起约跑' }}</span><i>{{ expanded.meetup ? '−' : '+' }}</i></button>
        <form v-if="expanded.meetup" class="check-form" @submit.prevent="createMeetup">
          <input v-model="meetDate" placeholder="日期 2026-10-22" />
          <input v-model="meetPlace" maxlength="40" placeholder="地点" />
          <input v-model="meetNote" maxlength="100" placeholder="说明，可不填" />
          <button class="primary" type="submit">发起约跑</button>
        </form>
        <button v-if="club.owner" class="manage-toggle" type="button" :aria-expanded="!!expanded.tiers" @click="expanded.tiers = !expanded.tiers"><span>{{ expanded.tiers ? '收起' : '约跑积分设置' }}</span><i>{{ expanded.tiers ? '−' : '+' }}</i></button>
        <form v-if="club.owner && expanded.tiers" class="check-form" @submit.prevent="saveTiers">
          <p class="rank-label">约跑积分。第一档不能少于 3 人，0 分只留记录。</p>
          <div v-for="(tier, index) in tierDraft" :key="index" class="pair">
            <label>人数<input v-model.number="tier.minPeople" type="number" min="3" max="500" /></label>
            <label>积分<input v-model.number="tier.points" type="number" min="0" max="20" /></label>
          </div>
          <button class="primary" type="submit">保存档位</button>
        </form>
      </div>
      <div v-if="activityView === 'internal'" class="block">
        <h2>队内赛</h2>
        <p class="rank-label">和每周训练分开报名。成绩不进赛历。</p>
        <router-link v-for="item in internals" :key="item.id" class="mate" :to="'/clubs/' + club.id + '/internals/' + item.id">
          <span>{{ item.title }}</span>
          <b>{{ item.signupCount }} 人 · {{ item.statusLabel }}</b>
        </router-link>
        <p v-if="!internals.length" class="rank-label">还没有队内赛。</p>
        <button v-if="club.staff" class="manage-toggle" type="button" :aria-expanded="!!expanded.internal" @click="expanded.internal = !expanded.internal"><span>{{ expanded.internal ? '收起' : '发起队内赛' }}</span><i>{{ expanded.internal ? '−' : '+' }}</i></button>
        <form v-if="club.staff && expanded.internal" class="check-form" @submit.prevent="createInternal">
          <input v-model="raceTitle" maxlength="40" placeholder="名称，例如 滨河10公里" />
          <input v-model="raceWhen" placeholder="开赛 2026-11-01 08:00" />
          <input v-model="racePlace" maxlength="40" placeholder="地点" />
          <div class="checks">
            <label v-for="opt in distanceOptions" :key="opt.id"><input v-model="raceDistance" type="radio" name="raceDistance" :value="opt.id" /> {{ opt.label }}</label>
          </div>
          <input v-model="raceOther" inputmode="decimal" placeholder="其他距离，公里。选了上面的距离就留空" />
          <input v-model="raceDeadline" placeholder="报名截止，可空，默认开赛时间" />
          <input v-model="raceNote" maxlength="500" placeholder="说明，可不填" />
          <label>完赛积分<input v-model.number="racePoints" type="number" min="0" max="20" /></label>
          <div v-for="(group, index) in raceGroups" :key="index" class="pair">
            <label>组别<input v-model="group.name" maxlength="20" placeholder="男子组" /></label>
            <label>人数上限<input v-model.number="group.capacity" type="number" min="0" max="500" /></label>
          </div>
          <button class="undo" type="button" @click="raceGroups.push({ name: '', capacity: 0 })">加一组</button>
          <button class="primary" type="submit">发起队内赛</button>
        </form>
      </div>
    </template>
    <template v-if="club && tab === 'album'">
      <router-link v-for="item in albums" :key="item.id" class="block album-card" :to="'/clubs/' + club.id + '/activities/' + item.id + '/album'">
        <img v-if="item.coverId" :src="photo(item.coverId)" alt="" />
        <div>
          <h2>{{ item.title }}</h2>
          <p class="rank-label">{{ item.dateLabel }}<template v-if="item.place"> · {{ item.place }}</template></p>
          <p class="rank-label">{{ item.photoCount }} 张照片 · {{ item.videoCount }} 个视频</p>
        </div>
      </router-link>
      <p v-if="!albums.length" class="empty">还没有活动照片。</p>
    </template>
    <template v-if="club && tab === 'feed'">
      <div class="block">
        <h2>动态</h2>
        <p class="rank-label">只有本团能看。点赞和评论不加积分。</p>
        <form class="check-form" @submit.prevent="publishPost">
          <input v-model="postBody" maxlength="200" placeholder="写给本团的一句" />
          <button class="primary" type="submit">发出</button>
        </form>
        <p v-if="postMessage" class="err">{{ postMessage }}</p>
        <p v-if="!posts.length" class="empty">还没有动态。</p>
        <article v-for="item in posts" :key="item.id">
          <p><b>{{ item.nickname }}</b> <span class="src">{{ item.at }}</span></p>
          <p>{{ item.body }}</p>
          <p>
            <button class="undo" type="button" @click="toggleLike(item)">{{ item.liked ? "取消赞" : "赞" }} {{ item.likes }}</button>
            <button v-if="item.canDelete" class="undo" type="button" @click="removePost(item)">删除</button>
          </p>
          <p v-for="comment in item.comments" :key="comment.id">
            {{ comment.nickname }}：{{ comment.body }}
            <button v-if="comment.canDelete" class="undo" type="button" @click="removeComment(item, comment)">删除</button>
          </p>
          <form class="check-form" @submit.prevent="publishComment(item)">
            <input v-model="commentDrafts[item.id]" maxlength="80" placeholder="评论" />
            <button class="primary" type="submit">评论</button>
          </form>
        </article>
      </div>
    </template>
    <MileageBoard v-if="club && tab === 'km'" :club-id="club.id" />
    <PartnerBoard v-if="club && tab === 'partner'" :club-id="club.id" />
    <div v-if="shareImage" class="viewer" @click="shareImage = ''">
      <div class="viewer-frame" @click.stop><img :src="shareImage" alt="分享图片" /><p>长按图片保存 · 点击空白处返回</p></div>
    </div>
    <template v-if="club && tab === 'people'">
      <div class="people-heading"><h2>跑友与跑团</h2><p>{{ members.length }} 位成员 · 我的积分 <b>{{ myPoints }}</b></p></div>
      <div class="secondary-tabs" aria-label="成员与管理"><button type="button" :class="{ on: peopleView === 'members' }" @click="go('people', 'members')">成员</button><button type="button" :class="{ on: peopleView === 'fees' }" @click="go('people', 'fees')">会费名单</button><button type="button" :class="{ on: peopleView === 'manage' }" @click="go('people', 'manage')">{{ club.staff ? '管理与服务' : '服务与设置' }}</button></div>
      <div v-if="club.staff && peopleView === 'members'" class="block requests-block">
        <h2>入团申请</h2>
        <p v-if="!requests.length" class="rank-label">没有待审核的申请。</p>
        <div v-for="item in requests" :key="item.id" class="mate">
          <span>{{ item.nickname }}</span>
          <b>
            <button class="primary" type="button" @click="decide(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decide(item, 'reject')">拒绝</button>
          </b>
        </div>
      </div>
      <div v-if="peopleView === 'members'" class="block member-directory">
        <div class="section-head"><h2>成员 <small>{{ visibleMembers.length }}/{{ members.length }}</small></h2><button v-if="club.publicStatus !== 'restricted'" type="button" @click="copyInvite">邀请跑友 ›</button></div>
        <input v-model="memberQuery" aria-label="搜索跑团成员" placeholder="搜索跑友昵称" />
        <div class="checks member-filters"><button v-for="item in memberFilters" :key="item.id" type="button" class="undo" :class="{ on: memberRole === item.id }" @click="memberRole = item.id">{{ item.label }}</button></div>
        <p v-if="!visibleMembers.length" class="rank-label">没有找到这位跑友，试试其他昵称。</p>
        <div v-for="member in visibleMembers" :key="member.id" class="mate member">
          <div class="who">
            <span class="member-identity">
              <img v-if="member.avatar" :src="member.avatar" :alt="member.nickname" />
              <i v-else aria-hidden="true">{{ member.nickname.slice(0, 1) }}</i>
              <span class="member-copy"><b>{{ member.nickname }}</b><small><template v-if="member.role !== 'member'">{{ member.roleLabel }} · </template>{{ member.points }} 积分</small></span>
            </span>
          </div>
          <details v-if="club.staff && !member.owner" class="member-actions"><summary>管理成员 <span>⌄</span></summary><div class="acts">
            <button v-if="club.owner && !member.owner && member.role !== 'manager'" class="undo" type="button" @click="setRole(member, 'manager')">设为跑团管理</button>
            <button v-if="club.owner && member.role === 'manager'" class="undo" type="button" @click="setRole(member, 'member')">改为成员</button>
            <button v-if="club.owner && !member.owner" class="undo" type="button" @click="setRole(member, 'owner')">交给他当团长</button>
            <button v-if="club.staff && !member.owner" class="undo danger" type="button" @click="removeMember(member)">移出</button>
          </div></details>
        </div>
      </div>
      <div v-if="peopleView === 'fees'" id="club-fees" class="block fee-panel">
        <div class="section-head"><h2>会费名单</h2><span class="fee-period-label">{{ feeShown && feeShown.open ? '本期' : feeShown ? '历史期次' : '未开设' }}</span></div>
        <div v-if="feeHistory.length > 1" class="checks fee-periods"><button v-for="item in feeHistory" :key="item.id" class="undo" :class="{ on: feeShown && feeShown.id === item.id }" :aria-pressed="!!feeShown && feeShown.id === item.id" type="button" @click="openFee(item)">{{ item.name }}</button></div>
        <h3 v-if="feeShown" class="fee-title">{{ feeShown.name }}</h3>
        <p class="rank-label">会费在微信群里交给团长。这里只记名单，以团长标的为准。</p>
        <template v-if="feeShown">
          <p class="rank-label">{{ feeShown.amount }} 元 · {{ feeShown.startsOn }} 至 {{ feeShown.endsOn }}</p>
          <p v-if="feeShown.note" class="rank-label">{{ feeShown.note }}</p>
          <p class="rank-label">我的状态：{{ feeShown.mine?.label || '未填写' }}</p>
          <p class="rank-label">{{ feeShown.open ? '当前名单只列现成员；离团记录在期次结束后归入历史。' : '历史期次保留缴费记录，离团成员已标注。' }}</p>
          <p v-if="feeShown.blockSignup" class="rank-label">未交和待确认的人不能报名活动和队内赛。</p>
          <div v-for="group in feeShown.groups" :key="group.status">
            <p class="rank-label">{{ group.label }}</p>
            <div v-for="person in group.people" :key="group.status + person.userId" class="mate member">
              <span>{{ person.nickname }}<small v-if="person.departed" class="departed-member">已离团</small></span>
              <b v-if="club.staff && feeShown.open && !person.departed" class="acts">
                <button class="undo" :class="{ on: group.status === 'paid' }" type="button" @click="markFee(person, 'paid')">已收到</button>
                <button class="undo" :class="{ on: group.status === 'unpaid' }" type="button" @click="markFee(person, 'unpaid')">未收到</button>
                <button class="undo" :class="{ on: group.status === 'waived' }" type="button" @click="markFee(person, 'waived')">免交</button>
              </b>
            </div>
            <p v-if="!group.people.length" class="rank-label">无</p>
          </div>
          <button class="primary" type="button" @click="copyFee">复制名单</button>
        </template>
        <p v-else class="rank-label">还没有会费。</p>
        <button v-if="club.owner" class="manage-toggle" type="button" :aria-expanded="!!expanded.fee" @click="expanded.fee = !expanded.fee"><span>{{ expanded.fee ? '收起' : '管理会费' }}</span><i>{{ expanded.fee ? '−' : '+' }}</i></button>
        <form v-if="club.owner && expanded.fee" class="check-form" @submit.prevent="saveFee">
          <p class="rank-label">{{ feeMode === 'new' ? "再开一期" : "这一期" }}</p>
          <input v-model="feeName" maxlength="20" placeholder="例如 2026 年度会费" />
          <input v-model.number="feeAmount" type="number" min="1" max="10000" placeholder="金额，整数元" />
          <input v-model="feeStart" placeholder="开始 2026-01-01" />
          <input v-model="feeEnd" placeholder="结束 2026-12-31" />
          <input v-model="feeNote" maxlength="200" placeholder="说明，例如收据怎么开" />
          <label class="rank-label"><input v-model="feeBlock" type="checkbox" /> 未交会费不能报名</label>
          <button class="primary" type="submit">{{ feeMode === 'new' ? "开这一期" : "保存" }}</button>
          <button v-if="feeCurrent && feeMode === 'edit'" class="undo" type="button" @click="feeMode = 'new'">再开一期</button>
          <button v-if="feeMode === 'new' && feeCurrent" class="undo" type="button" @click="feeMode = 'edit'">取消</button>
        </form>
      </div>
      <section v-if="club.owner && peopleView === 'manage'" class="block identity-manage-entry"><h2>跑团身份与公开名片</h2><p class="rank-label">补充城市与简介，或自愿核验组织管理关系。基础功能照常使用。</p><router-link :to="'/clubs/' + club.id + '/identity'">管理公开资料与组织核验 →</router-link></section>
      <div v-if="club.staff && peopleView === 'manage'" id="club-groups" class="block">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <p v-if="!groups.length" class="rank-label">还没有组别。</p>
        <button class="manage-toggle" type="button" :aria-expanded="!!expanded.group" @click="expanded.group = !expanded.group"><span>{{ expanded.group ? '收起' : '新增组别' }}</span><i>{{ expanded.group ? '−' : '+' }}</i></button>
        <form v-if="expanded.group" class="check-form" @submit.prevent="createGroup">
        <input v-model="groupName" maxlength="20" placeholder="例如 A0" />
        <input v-model="groupPace" maxlength="20" placeholder="配速，例如 530" />
        <input v-model.number="groupCap" type="number" min="0" placeholder="名额，0 表示不限" />
        <button class="primary" type="submit">加一组</button>
              </form>
      </div>
      <div v-else-if="!club.staff && peopleView === 'manage'" id="club-groups" class="block">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <p v-if="!groups.length" class="rank-label">还没有组别。</p>
      </div>
      <div v-if="peopleView === 'manage'" id="club-gifts" class="block">
        <h2>积分礼品</h2>
        <p class="rank-label">用积分换，不付款。</p>
        <div v-for="gift in gifts" :key="gift.id" class="mate">
          <span>{{ gift.name }} · {{ gift.cost }} 分 · 剩 {{ gift.stock }}</span>
          <button class="primary" type="button" :disabled="!gift.stock" @click="redeem(gift)">兑换</button>
        </div>
        <button v-if="club.staff" class="manage-toggle" type="button" :aria-expanded="!!expanded.gift" @click="expanded.gift = !expanded.gift"><span>{{ expanded.gift ? '收起' : '上架积分礼品' }}</span><i>{{ expanded.gift ? '−' : '+' }}</i></button>
        <form v-if="club.staff && expanded.gift" @submit.prevent="createGift">
          <input v-model="giftName" maxlength="20" placeholder="礼品名" />
          <input v-model.number="giftCost" type="number" min="1" placeholder="所需积分" />
          <input v-model.number="giftStock" type="number" min="1" placeholder="库存" />
          <button class="primary" type="submit">上架</button>
        </form>
        <p v-if="!gifts.length && !club.staff" class="rank-label">还没有礼品。</p>
      </div>
      <div id="club-relationship" class="block membership-settings">
        <h2>跑团关系</h2>
        <p class="rank-label">退出后将无法查看团内详情。未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；成绩、积分和已打卡记录保留。再次加入需要重新申请。</p>
        <p v-if="club.owner" class="rank-label">团长请先在成员列表中转让跑团，再退出。</p>
        <button v-else class="undo danger" type="button" :disabled="leaving" @click="leaveClub">{{ leaving ? '正在退出…' : '退出跑团' }}</button>
      </div>
    </template>
    <div v-if="message" class="club-error" role="alert"><p>{{ message }}</p><button v-if="!club" class="small-primary" type="button" @click="loadPage">重新加载</button><button v-else type="button" @click="message = ''">知道了</button></div>
    <p v-if="note" class="note feedback-toast" role="status">{{ note }}<button type="button" aria-label="关闭提示" @click="note = ''">×</button></p>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api as requestApi, mediaSrc } from "../api";
import { copyText } from "../copy";
import { textCard } from "../share-card";
import { clubRaceCsv, clubRaceRows, renderResultPoster } from "../result-poster";
import RunnerIcon from "../components/RunnerIcon.vue";
import ClubVerificationBadge from "../components/ClubVerificationBadge.vue";
import { clubIdentity } from "../club-identity";
import MileageBoard from "../components/MileageBoard.vue";
import PartnerBoard from "../components/PartnerBoard.vue";
const route = useRoute();
const router = useRouter();
let clubScope = 0;
let disposed = false;
let visibleAccount = localStorage.getItem("marathon_token");
function syncClubAccount() { const next = localStorage.getItem("marathon_token"); if (visibleAccount === next) return false; visibleAccount = next; resetClubPage(); return true; }
function onClubAccount() { if (syncClubAccount()) loadPage(); }
window.addEventListener("storage", onClubAccount); window.addEventListener("focus", onClubAccount);
// A late response from a previous club must never overwrite the club now on screen.
async function api(path, options) {
  if (syncClubAccount()) { loadPage(); throw Object.assign(new Error("账号已切换"), { clubChanged: true }); }
  const clubId = route.params.id;
  const accountToken = localStorage.getItem("marathon_token");
  const scope = clubScope;
  try {
    const data = await requestApi(path, options);
    if (syncClubAccount()) loadPage();
    if (disposed || scope !== clubScope || clubId !== route.params.id || accountToken !== localStorage.getItem("marathon_token")) throw Object.assign(new Error("跑团已切换"), { clubChanged: true });
    return data;
  } catch (err) {
    if (syncClubAccount()) loadPage();
    if (disposed || scope !== clubScope || clubId !== route.params.id || accountToken !== localStorage.getItem("marathon_token")) err.clubChanged = true;
    throw err;
  }
}
const tab = ref("overview");
const loading = ref(false);
const activityView = ref("training");
const mineOnly = ref(false);
const inviting = ref(false);
const peopleView = ref("members");
const memberQuery = ref("");
const memberRole = ref("");
const mainTabs = [{ id: "overview", label: "今日" }, { id: "act", label: "活动" }, { id: "race", label: "赛事" }, { id: "km", label: "跑量" }, { id: "people", label: "成员" }];
const activityTabs = [{ id: "training", label: "团练" }, { id: "meetup", label: "约跑" }, { id: "internal", label: "队内赛" }];
const memberFilters = [{ id: "", label: "全部" }, { id: "staff", label: "团长与管理" }, { id: "member", label: "成员" }];
const activeMainTab = computed(() => ["album", "feed", "partner"].includes(tab.value) ? "overview" : tab.value);
const serviceTitle = computed(() => ({ album: "活动相册", feed: "团内动态", partner: "合作权益" })[tab.value]);
function dateParts(date) { return { month: Number((date || "").slice(5, 7)) || "—", day: Number((date || "").slice(8, 10)) || "—" }; }
function applyNavigation() {
  const valid = [...mainTabs.map((item) => item.id), "album", "feed", "partner"];
  tab.value = valid.includes(route.query.tab) ? route.query.tab : "overview";
  activityView.value = activityTabs.some((item) => item.id === route.query.view) ? route.query.view : "training";
  peopleView.value = ["members", "fees", "manage"].includes(route.query.view) ? route.query.view : "members";
  mineOnly.value = tab.value === "act" && activityView.value === "training" && route.query.mine === "1";
}
async function go(next, view = "", section = "", onlyMine = false) {
  tab.value = next;
  if (next === "act") activityView.value = view || "training";
  if (next === "people") peopleView.value = view || "members";
  const query = { ...route.query, tab: next };
  if (view) query.view = view; else delete query.view;
  if (section) query.section = section; else delete query.section;
  if (next === "act" && (view || "training") === "training" && onlyMine) query.mine = "1"; else delete query.mine;
  await router.replace({ path: route.path, query });
  if (section) { await nextTick(); document.getElementById("club-" + section)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
}
const expanded = reactive({ call: false, activity: false, meetup: false, tiers: false, internal: false, fee: false, group: false, gift: false });
const posts = ref([]);
const postBody = ref("");
const postMessage = ref("");
const commentDrafts = reactive({});
const club = ref(null);
const leaving = ref(false);
const members = ref([]);
const groups = ref([]);
const activities = ref([]);
const gifts = ref([]);
const requests = ref([]);
const myPoints = ref(0);
const actTitle = ref("");
const actPlace = ref("");
const actWhen = ref("");
const actEnds = ref("");
const actIssue = ref("");
const actPlanned = ref("");
const actGather = ref("");
const actGatherAt = ref("");
const actRoute = ref("");
const actCancel = ref("");
const actNote = ref("");
const actPeople = ref(3);
const actKm = ref(5);
const actPoints = ref(1);
const actGroups = ref([{ name: "", kind: "pace", pace: "", capacity: 0 }]);
const actQuery = ref("");
const actStatus = ref("");
const actDay = ref("");
const showMonth = ref(false);
const monthCursor = ref(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
const sharing = ref(false);
const shareIds = ref([]);
const shareImage = ref("");
const albums = ref([]);
const attendance = ref(null);
const attendRange = ref("month");
const statusFilters = [
  { id: "open", label: "报名中" },
  { id: "live", label: "进行中" },
  { id: "ended", label: "已结束" },
  { id: "cancelled", label: "已取消" }
];
const attendRanges = [
  { id: "today", label: "今日" },
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "lastMonth", label: "上月" },
  { id: "season", label: "本季" },
  { id: "year", label: "今年" },
  { id: "all", label: "入团之后" }
];
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const groupName = ref("");
const groupPace = ref("");
const groupCap = ref("0");
const giftName = ref("");
const giftCost = ref("1");
const giftStock = ref("1");
const board = ref([]);
const ranks = ref([]);
const checkins = ref([]);
const checkedIn = ref(false);
const checkNote = ref("");
const checkMessage = ref("");
const message = ref("");
const note = ref("");
const resultCalls = ref([]);
const raceQuery = ref("");
const raceHits = ref([]);
const pickedRace = ref(null);
const callTitle = ref("");
const callDate = ref("");
const callDistances = ref([]);
const callOther = ref("");
const callDeadline = ref("");
const callNote = ref("");
const distanceOptions = [
  { id: "full", label: "全马" },
  { id: "half", label: "半马" },
  { id: "10k", label: "10公里" },
  { id: "5k", label: "5公里" }
];
const feeCurrent = ref(null);
const feeShown = ref(null);
const feeHistory = ref([]);
const feeMode = ref("edit");
const feeName = ref("");
const feeAmount = ref("");
const feeStart = ref("");
const feeEnd = ref("");
const feeNote = ref("");
const feeBlock = ref(false);
const meetups = ref([]);
const meetupTiers = ref([]);
const tierDraft = ref([]);
const meetDate = ref("");
const meetPlace = ref("");
const meetNote = ref("");
const internals = ref([]);
const raceTitle = ref("");
const raceWhen = ref("");
const racePlace = ref("");
const raceDistance = ref("10k");
const raceOther = ref("");
const raceDeadline = ref("");
const raceNote = ref("");
const racePoints = ref(0);
const raceGroups = ref([
  { name: "男子组", capacity: 0 },
  { name: "女子组", capacity: 0 }
]);
let raceTimer = 0;

const visibleMembers = computed(() => members.value.filter((member) => (!memberQuery.value.trim() || member.nickname.toLocaleLowerCase().includes(memberQuery.value.trim().toLocaleLowerCase())) && (!memberRole.value || (memberRole.value === "staff" ? member.role !== "member" : member.role === "member"))));
const todayCheckCount = computed(() => checkins.value.find((day) => day.date === beijingToday())?.rows.length || 0);
const leaderName = computed(() => (members.value.find((member) => member.owner) || {}).nickname || "");
const nextRace = computed(() => board.value
  .filter((item) => item.race.raceDate >= beijingToday())
  .slice().sort((a, b) => a.race.raceDate.localeCompare(b.race.raceDate))[0] || null);
// Server dates have no offset and always represent Beijing time, independent of the browser's timezone.
function activityInstant(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || ""));
  if (!match) return NaN;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part || 0));
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) return NaN;
  return local.getTime() - 8 * 3600000;
}
function isAwaitingActivity(item, now = Date.now()) {
  if (["ended", "cancelled"].includes(item.status)) return false;
  const start = activityInstant(item.startsAt);
  if (!Number.isFinite(start)) return false;
  const end = item.endsAt ? activityInstant(item.endsAt) : null;
  if (end !== null && (!Number.isFinite(end) || end <= start || end <= now)) return false;
  if (start >= now) return true;
  if (item.status !== "live") return false;
  if (end !== null) return true;
  // A legacy activity without an end date remains live forever on the server.
  // Only today's such activities belong in the current participation shortcuts.
  return new Date(start + 8 * 3600000).toISOString().slice(0, 10) === beijingToday();
}
const awaitingActivities = computed(() => activities.value.filter((item) => isAwaitingActivity(item)).slice().sort((a, b) => activityInstant(a.startsAt) - activityInstant(b.startsAt)));
const upcomingActivities = computed(() => awaitingActivities.value.filter((item) => activityInstant(item.startsAt) >= Date.now()));
const nextActivity = computed(() => awaitingActivities.value[0] || null);
const myUpcomingActivities = computed(() => awaitingActivities.value.filter((item) => item.mine?.signed));
function openMyActivities() {
  actQuery.value = ""; actStatus.value = ""; actDay.value = "";
  return go("act", "training", "", true);
}
function toggleMyActivities() {
  if (!mineOnly.value) return openMyActivities();
  return go("act", "training");
}
function clearActivityFilters() {
  actQuery.value = ""; actStatus.value = ""; actDay.value = "";
  return go("act", "training");
}
const upcomingActivityCount = computed(() => upcomingActivities.value.length + meetups.value
  .filter((item) => item.date >= beijingToday() && !["ended", "cancelled"].includes(item.status)).length);


function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const dayStrip = computed(() => {
  const today = beijingToday();
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return { date, label: Number(date.slice(8)) + " 周" + names[new Date(date + "T00:00:00Z").getUTCDay()] };
  });
});

const shownActivities = computed(() => {
  const query = actQuery.value.trim();
  return (mineOnly.value ? myUpcomingActivities.value : activities.value).filter((item) => {
    if (actStatus.value && item.status !== actStatus.value) return false;
    if (actDay.value && item.date !== actDay.value) return false;
    if (query && !item.title.includes(query)) return false;
    return true;
  });
});

const monthCells = computed(() => {
  const [year, month] = monthCursor.value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const pad = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const marks = new Set(activities.value.map((item) => item.date));
  const cells = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= days; day += 1) {
    const date = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    cells.push({ date, day, marked: marks.has(date) });
  }
  return cells;
});

function shiftMonth(delta) {
  const [year, month] = monthCursor.value.split("-").map(Number);
  monthCursor.value = new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

function photo(id) {
  return mediaSrc(id);
}

function selectVisible() {
  shareIds.value = shownActivities.value.map((item) => item.id);
}

function selectRecent(count) {
  shareIds.value = [...activities.value].sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)).slice(0, count).map((item) => item.id);
}

function selectDays(count) {
  const today = beijingToday();
  const from = addDays(today, 1 - count);
  const to = addDays(today, count - 1);
  shareIds.value = activities.value.filter((item) => item.date >= from && item.date <= to).map((item) => item.id);
}

async function sharePayload() {
  if (!shareIds.value.length) throw new Error("先勾选活动");
  return api("/clubs/" + route.params.id + "/activities/share", {
    method: "POST",
    body: JSON.stringify({ ids: shareIds.value })
  });
}

async function copyShare() {
  note.value = "";
  message.value = "";
  try {
    const data = await sharePayload();
    await copyText(data.text);
    note.value = "已复制，可以贴到微信群";
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function pictureShare() {
  message.value = "";
  try {
    const data = await sharePayload();
    shareImage.value = textCard(data.text.split("\n"));
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function openAttend(range) {
  attendRange.value = range;
  try {
    attendance.value = await api("/clubs/" + route.params.id + "/attendance?range=" + range);
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

function exportAttend() {
  if (!attendance.value) return;
  const lines = [(club.value ? club.value.name : "跑团") + " 出勤 · " + attendance.value.label];
  if (attendance.value.me) lines.push("我 " + attendance.value.me.placeLabel + " " + attendance.value.me.count + " 次");
  for (const row of attendance.value.rows.filter((item) => item.count > 0)) lines.push(row.place + " " + row.nickname + " " + row.count + " 次");
  shareImage.value = textCard(lines);
}

function exportBoardCsv() {
  const blob = new Blob([clubRaceCsv(board.value)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "跑团全部赛事名单.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRacePoster(item) {
  const byStatus = new Map();
  const rows = clubRaceRows(item).map((mark) => ({
    nickname: mark.nickname,
    clock: mark.clock || mark.status,
    tag: mark.pb ? "PB" : "",
    staffFilled: false,
    place: 0,
    status: mark.status
  }));
  rows.forEach((row) => {
    const label = row.status || "团友";
    if (!byStatus.has(label)) byStatus.set(label, []);
    const group = byStatus.get(label);
    row.place = group.length + 1;
    group.push(row);
  });
  shareImage.value = renderResultPoster({
    title: item.race.name,
    raceDate: item.race.raceDate,
    eyebrow: "跑团赛事画像",
    countLabel: " 条参赛记录",
    summary: tallyLine(item),
    groups: [...byStatus].map(([label, grouped]) => ({ label, rows: grouped }))
  });
}

function tallyLine(item) {
  const tally = item.tally || {};
  const parts = [];
  for (const key of ["已报名", "待抽签", "中签", "未中签", "已缴费", "已领物", "完赛", "未完赛", "弃赛", "想跑"]) {
    if (tally[key]) parts.push(tally[key] + "人" + key);
  }
  if (item.pbCount) parts.push(item.pbCount + "人 PB");
  return parts.join(" · ");
}

function applyClub(data) {
  club.value = data.club;
  members.value = data.members || [];
  groups.value = data.groups || [];
  activities.value = data.activities || [];
  gifts.value = data.gifts || [];
  requests.value = data.requests || [];
  myPoints.value = data.myPoints || 0;
  board.value = data.board || [];
  ranks.value = data.ranks || [];
  applyCheckins(data);
}

function applyCheckins(data) {
  checkins.value = data.checkins || [];
  checkedIn.value = Boolean(data.checkedIn);
  checkNote.value = data.myNote || "";
}

async function checkIn() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", {
      method: "POST",
      body: JSON.stringify({ note: checkNote.value })
    });
    applyCheckins(data);
  } catch (err) {
    if (err.clubChanged) return;
    checkMessage.value = err.message;
  }
}

async function undoCheckin() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", { method: "DELETE" });
    applyCheckins(data);
  } catch (err) {
    if (err.clubChanged) return;
    checkMessage.value = err.message;
  }
}

async function copyCard(card) {
  note.value = "";
  message.value = "";
  try {
    await copyText(card.text);
    note.value = "卡片已复制，可以贴到微信群";
  } catch (err) {
    if (err.clubChanged) return;
    message.value = "没有复制成功，可以直接选中上面的文字";
  }
}

async function copyInvite() {
  if (!club.value || club.value.publicStatus === "restricted" || inviting.value) return;
  const scope = clubScope;
  const sharedClub = club.value;
  message.value = ""; note.value = ""; inviting.value = true;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = window.location.origin + base + "/clubs/" + sharedClub.id + "/public";
  try {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: clubIdentity(sharedClub), text: clubIdentity(sharedClub) + " · 负责人 " + leaderName.value + "，查看介绍后申请加入。", url });
        return;
      } catch (err) { if (err?.name === "AbortError") return; }
    }
    if (disposed || scope !== clubScope) return;
    await copyText(url);
    if (!disposed && scope === clubScope) note.value = "跑团名片链接已复制，好友查看介绍后可申请加入";
  } catch (err) {
    if (!disposed && scope === clubScope) message.value = "分享未成功，请打开跑团公开介绍后重试";
  } finally { if (!disposed && scope === clubScope) inviting.value = false; }
}

function fillFee(period) {
  if (!period) return;
  feeName.value = period.name;
  feeAmount.value = period.amount;
  feeStart.value = period.startsOn;
  feeEnd.value = period.endsOn;
  feeNote.value = period.note;
  feeBlock.value = period.blockSignup;
}

async function publishPost() {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts", {
      method: "POST",
      body: JSON.stringify({ body: postBody.value })
    });
    postBody.value = "";
    posts.value = data.posts || [];
  } catch (err) {
    if (err.clubChanged) return;
    postMessage.value = err.message;
  }
}

async function publishComment(item) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id + "/comments", {
      method: "POST",
      body: JSON.stringify({ body: commentDrafts[item.id] || "" })
    });
    commentDrafts[item.id] = "";
    posts.value = data.posts || [];
  } catch (err) {
    if (err.clubChanged) return;
    postMessage.value = err.message;
  }
}

async function toggleLike(item) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id + "/like", {
      method: item.liked ? "DELETE" : "POST"
    });
    posts.value = data.posts || [];
  } catch (err) {
    if (err.clubChanged) return;
    postMessage.value = err.message;
  }
}

async function removePost(item) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id, { method: "DELETE" });
    posts.value = data.posts || [];
  } catch (err) {
    if (err.clubChanged) return;
    postMessage.value = err.message;
  }
}

async function removeComment(item, comment) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id + "/comments/" + comment.id, { method: "DELETE" });
    posts.value = data.posts || [];
  } catch (err) {
    if (err.clubChanged) return;
    postMessage.value = err.message;
  }
}

let loadVersion = 0;
async function reload() {
  const id = route.params.id;
  const version = ++loadVersion;
  const current = () => version === loadVersion && id === route.params.id;
  const path = "/clubs/" + id;
  const data = await api(path);
  if (!current()) return;
  applyClub(data);
  const fees = await api(path + "/fees");
  if (!current()) return;
  feeCurrent.value = fees.current;
  feeHistory.value = fees.history || [];
  if (!feeShown.value || feeShown.value.open) {
    feeShown.value = fees.current;
    if (feeMode.value === "edit") fillFee(fees.current);
  }
  const calls = await api(path + "/calls");
  if (!current()) return;
  resultCalls.value = calls.calls || [];
  const gathered = await api(path + "/meetups");
  if (!current()) return;
  meetups.value = gathered.meetups || [];
  meetupTiers.value = gathered.tiers || [];
  if (!tierDraft.value.length) tierDraft.value = (gathered.tiers || []).map((tier) => ({ minPeople: tier.minPeople, points: tier.points }));
  const races = await api(path + "/internals");
  if (!current()) return;
  internals.value = races.races || [];
  const album = await api(path + "/albums");
  if (!current()) return;
  albums.value = album.albums || [];
  const feed = await api(path + "/posts");
  if (!current()) return;
  posts.value = feed.posts || [];
  const nextAttendance = await api(path + "/attendance?range=" + attendRange.value);
  if (current()) attendance.value = nextAttendance;
}

function searchRaces() {
  clearTimeout(raceTimer);
  raceTimer = setTimeout(async () => {
    const q = raceQuery.value.trim();
    if (q.length < 1) {
      raceHits.value = [];
      return;
    }
    try {
      const data = await api("/races?q=" + encodeURIComponent(q) + "&page=1&pageSize=8");
      raceHits.value = (data.races || []).slice(0, 6);
    } catch (err) {
    if (err.clubChanged) return;
      message.value = err.message;
    }
  }, 250);
}

function pickRace(race) {
  pickedRace.value = race;
  callTitle.value = race.name;
  callDate.value = race.raceDate;
  callDistances.value = (race.distances || []).filter((item) => distanceOptions.some((opt) => opt.id === item));
  raceHits.value = [];
  raceQuery.value = "";
}

function clearRace() {
  pickedRace.value = null;
  callTitle.value = "";
  callDistances.value = [];
}

async function createCall() {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/calls", {
      method: "POST",
      body: JSON.stringify({
        raceId: pickedRace.value ? pickedRace.value.id : "",
        title: callTitle.value,
        raceDate: callDate.value,
        distances: callDistances.value,
        otherKm: callOther.value,
        deadline: callDeadline.value,
        note: callNote.value
      })
    });
    router.push("/clubs/" + route.params.id + "/calls/" + data.call.id);
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function createMeetup() {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/meetups", {
      method: "POST",
      body: JSON.stringify({ date: meetDate.value, place: meetPlace.value, note: meetNote.value })
    });
    router.push("/clubs/" + route.params.id + "/meetups/" + data.meetup.id);
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function saveTiers() {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/meetup-tiers", {
      method: "PUT",
      body: JSON.stringify({ tiers: tierDraft.value })
    });
    tierDraft.value = (data.tiers || []).map((tier) => ({ minPeople: tier.minPeople, points: tier.points }));
    note.value = "约跑积分已保存";
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function createInternal() {
  message.value = "";
  const distance = raceOther.value ? "other" : raceDistance.value;
  try {
    const data = await api("/clubs/" + route.params.id + "/internals", {
      method: "POST",
      body: JSON.stringify({
        title: raceTitle.value,
        startsAt: raceWhen.value,
        place: racePlace.value,
        distance,
        otherKm: raceOther.value,
        deadline: raceDeadline.value,
        note: raceNote.value,
        finishPoints: racePoints.value,
        groups: raceGroups.value.filter((group) => group.name && group.name.trim())
      })
    });
    router.push("/clubs/" + route.params.id + "/internals/" + data.race.id);
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function openFee(item) {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/fees/" + item.id);
    feeShown.value = data.period;
    if (data.period.open) {
      feeMode.value = "edit";
      fillFee(data.period);
    }
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function saveFee() {
  message.value = "";
  const body = {
    name: feeName.value,
    amount: Number(feeAmount.value),
    startsOn: feeStart.value,
    endsOn: feeEnd.value,
    note: feeNote.value,
    blockSignup: feeBlock.value
  };
  try {
    const creating = feeMode.value === "new" || !feeCurrent.value;
    const data = creating
      ? await api("/clubs/" + route.params.id + "/fees", { method: "POST", body: JSON.stringify(body) })
      : await api("/clubs/" + route.params.id + "/fees/" + feeCurrent.value.id, { method: "PUT", body: JSON.stringify(body) });
    feeMode.value = "edit";
    note.value = creating ? "已开这一期" : "会费已保存";
    await reload();
    feeShown.value = feeCurrent.value;
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function markFee(person, status) {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/fees/" + feeShown.value.id + "/records", {
      method: "POST",
      body: JSON.stringify({ userId: person.userId, status })
    });
    feeShown.value = data.period;
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function copyFee() {
  note.value = "";
  message.value = "";
  try {
    await copyText(feeShown.value.copyText);
    note.value = "名单已复制，可以贴到微信群";
  } catch (err) {
    if (err.clubChanged) return;
    message.value = "没有复制成功，可以直接选中名单";
  }
}

async function createActivity() {
  message.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/activities", {
      method: "POST",
      body: JSON.stringify({
        title: actTitle.value,
        place: actPlace.value,
        startsAt: actWhen.value,
        endsAt: actEnds.value,
        issue: actIssue.value,
        plannedKm: actPlanned.value,
        gatherPlace: actGather.value,
        gatherAt: actGatherAt.value,
        route: actRoute.value,
        cancelUntil: actCancel.value,
        note: actNote.value,
        minPeople: actPeople.value,
        minKm: actKm.value,
        points: actPoints.value,
        groups: actGroups.value
          .filter((group) => group.name.trim())
          .map((group) => ({ name: group.name.trim(), kind: group.kind, pace: group.pace, capacity: Number(group.capacity) || 0 }))
      })
    });
    router.push("/clubs/" + route.params.id + "/activities/" + data.activity.id);
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function createGroup() {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName.value, pace: groupPace.value, capacity: Number(groupCap.value || 0) })
    });
    groupName.value = "";
    groupPace.value = "";
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function createGift() {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/gifts", {
      method: "POST",
      body: JSON.stringify({ name: giftName.value, cost: Number(giftCost.value), stock: Number(giftStock.value) })
    });
    giftName.value = "";
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function redeem(gift) {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/gifts/" + gift.id + "/redeem", { method: "POST", body: "{}" });
    note.value = "已兑换 " + gift.name;
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function decide(item, decision) {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/requests/" + item.id, {
      method: "POST",
      body: JSON.stringify({ decision })
    });
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function setRole(member, role) {
  message.value = "";
  if (role === "owner" && !window.confirm("把团长交给 " + member.nickname + "？你自己会变成跑团管理。")) return;
  try {
    await api("/clubs/" + route.params.id + "/members/" + member.id, {
      method: "PUT",
      body: JSON.stringify({ role })
    });
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function removeMember(member) {
  message.value = "";
  if (!window.confirm("将 " + member.nickname + " 移出跑团？未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；历史成绩、积分和已打卡记录保留。")) return;
  try {
    await api("/clubs/" + route.params.id + "/members/" + member.id, { method: "DELETE" });
    await reload();
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  }
}

async function leaveClub() {
  if (leaving.value || !club.value || club.value.owner) return;
  if (!window.confirm("退出「" + club.value.name + "」？未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；个人成绩、积分和已打卡记录保留，再入团需审核。")) return;
  leaving.value = true;
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/leave", { method: "POST", body: "{}" });
    await router.replace("/clubs");
  } catch (err) {
    if (err.clubChanged) return;
    message.value = err.message;
  } finally {
    leaving.value = false;
  }
}

function resetClubPage() {
  clubScope++;
  mineOnly.value = false;
  inviting.value = false;
  club.value = null;
  leaving.value = false;
  tab.value = "overview";
  activityView.value = "training";
  peopleView.value = "members";
  memberQuery.value = "";
  memberRole.value = "";
  Object.keys(expanded).forEach((key) => { expanded[key] = false; });
  [members, groups, activities, gifts, requests, board, ranks, checkins, resultCalls, meetups, meetupTiers,
    tierDraft, internals, albums, posts, raceHits, callDistances, shareIds, feeHistory].forEach((state) => { state.value = []; });
  [actTitle, actPlace, actWhen, actEnds, actIssue, actPlanned, actGather, actGatherAt, actRoute, actCancel,
    actNote, actQuery, actStatus, actDay, groupName, groupPace, giftName, raceQuery, callTitle, callDate,
    callOther, callDeadline, callNote, feeName, feeAmount, feeStart, feeEnd, feeNote, meetDate, meetPlace,
    meetNote, raceTitle, raceWhen, racePlace, raceOther, raceDeadline, raceNote, postBody, postMessage,
    checkNote, checkMessage, message, note, shareImage].forEach((state) => { state.value = ""; });
  myPoints.value = 0;
  checkedIn.value = false;
  actPeople.value = 3;
  actKm.value = 5;
  actPoints.value = 1;
  actGroups.value = [{ name: "", kind: "pace", pace: "", capacity: 0 }];
  groupCap.value = "0";
  giftCost.value = "1";
  giftStock.value = "1";
  feeCurrent.value = null;
  feeShown.value = null;
  feeMode.value = "edit";
  feeBlock.value = false;
  pickedRace.value = null;
  raceDistance.value = "10k";
  racePoints.value = 0;
  raceGroups.value = [{ name: "男子组", capacity: 0 }, { name: "女子组", capacity: 0 }];
  sharing.value = false;
  showMonth.value = false;
  attendance.value = null;
  attendRange.value = "month";
  Object.keys(commentDrafts).forEach((key) => { delete commentDrafts[key]; });
  clearTimeout(raceTimer);
}

async function loadPage() {
  const id = route.params.id;
  loading.value = true;
  message.value = "";
  try {
    await reload();
    if (id !== route.params.id) return;
    if (route.query.section) { await nextTick(); document.getElementById("club-" + route.query.section)?.scrollIntoView({ block: "start" }); }
  } catch (err) {
    if (err.clubChanged) return;
    if (id !== route.params.id) return;
    if (err.status === 401 || err.status === 403) {
      await router.replace("/clubs/" + id + "/public");
      return;
    }
    message.value = err.message;
  } finally { if (id === route.params.id) loading.value = false; }
}
watch(() => route.params.id, () => { resetClubPage(); applyNavigation(); loadPage(); }, { immediate: true });
watch(() => route.query, applyNavigation);
onBeforeUnmount(() => { window.removeEventListener("storage", onClubAccount); window.removeEventListener("focus", onClubAccount); disposed = true; clubScope++; loadVersion++; clearTimeout(raceTimer); });
</script>

<style scoped>
.club-page { min-height: 100vh; padding-bottom: 28px; background: #f5f6f8; --club-text: #20232b; --club-muted: #777d89; }
.club-page button, .club-page .primary, .club-page .undo, .club-page .small-primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; line-height: 1.2; font-size: 14px; }
.club-page button:disabled { opacity: .48; }
.club-page svg { width: 22px; height: 22px; flex: none; }
.club-topbar { grid-template-columns: 36px 1fr auto; gap: 4px; min-height: 64px; padding: 8px 16px; background: #fff; border: 0; }
.club-topbar .club-back { display: flex; align-items: center; justify-content: flex-start; min-height: 44px; }
.club-topbar .club-switch { display: flex; align-items: center; gap: 9px; text-align: left; font-size: 15px; font-weight: 650; line-height: 1.4; }
.club-switch span { padding-left: 9px; border-left: 1px solid #e7e8ed; color: var(--club-muted); font-size: 12px; font-weight: 400; }
.club-topbar .top-invite { padding: 0 10px; color: var(--accent); font-size: 13px; font-weight: 600; }
.club-hero { position: relative; overflow: hidden; margin: 0; padding: 15px 20px 18px; background: linear-gradient(130deg, #fff 58%, #fff5f5); }
.club-hero::after { content: ''; position: absolute; right: -35px; top: -55px; width: 145px; height: 145px; border: 20px solid rgba(255,10,48,.025); border-radius: 50%; pointer-events: none; }
.club-identity { position: relative; display: flex; align-items: center; gap: 12px; z-index: 1; }
.club-letter { display: grid; place-items: center; width: 56px; height: 56px; flex: none; border-radius: 18px 18px 18px 6px; background: #fff0f2; color: var(--accent); font-size: 26px; font-weight: 750; }
.club-identity-copy { min-width: 0; flex: 1; }
.club-eyebrow { margin: 0 0 4px; color: #9c6d76; font-size: 9px; letter-spacing: 1px; line-height: 1.5; }
.club-hero h1 { margin: 0; color: var(--club-text); font-size: 22px; font-weight: 750; line-height: 1.35; letter-spacing: -.5px; overflow-wrap: anywhere; }
.club-leader { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 7px 0 0; color: var(--club-muted); font-size: 12px; line-height: 1.5; }
.role-badge { display: inline-flex; align-items: center; min-height: 21px; padding: 2px 6px; border: 1px solid #f0d4d9; border-radius: 5px; color: #a84152; font-size: 10px; line-height: 1.2; }
.hero-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 17px; }
.club-page .club-avatars { justify-content: flex-start; gap: 0; min-width: 0; min-height: 40px; }
.club-avatar { display: grid; flex: none; place-items: center; width: 28px; height: 28px; margin-right: -8px; overflow: hidden; border: 2px solid #fff; border-radius: 50%; color: #8b7782; background: #eee9ed; font-size: 10px; font-weight: 650; }
.club-avatar:nth-child(even) { background: #edf0f5; color: #76819b; }
.club-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-caption { margin-left: 15px; color: var(--club-muted); font-size: 12px; white-space: nowrap; }
.avatar-caption i { margin-left: 3px; font-style: normal; }
.hero-publish { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 40px; padding: 0 13px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 650; line-height: 1.2; white-space: nowrap; }
.hero-publish svg { width: 17px; height: 17px; }
.club-page .hero-publish.secondary { min-height: 40px; color: var(--accent); background: #fff0f3; font-size: 12px; }
.seg { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); margin: 0; padding: 0 12px; background: #fff; border-bottom: 1px solid #e9ebef; }
.club-page .seg button { position: relative; min-width: 0; min-height: 51px; padding: 0 5px; color: #656a75; font-size: 15px; font-weight: 600; }
.seg button.on { color: var(--accent); font-weight: 750; }
.seg button.on::after { content: ''; position: absolute; bottom: 0; left: calc(50% - 11px); width: 22px; height: 3px; border-radius: 4px; background: var(--accent); }
.tab-dot { position: absolute; top: 9px; right: 13px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.overview { padding: 0 16px 8px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 23px 1px 12px; }
.section-head h2 { margin: 0; color: var(--club-text); font-size: 18px; font-weight: 700; line-height: 1.35; }
.section-eyebrow { margin: 0 0 4px; color: #9c9fa8; font-size: 9px; font-weight: 600; letter-spacing: 1.8px; }
.club-page .section-head button { min-height: 38px; color: var(--club-muted); font-size: 12px; }
.section-head > button span { font-size: 19px; }
.review-reminder { width: 100%; justify-content: flex-start!important; margin-top: 14px; padding: 8px 12px; border: 1px solid #f8e2d2; border-radius: 10px; background: #fff8ee; color: #9e632b; }
.review-reminder b { font-size: 12px; font-weight: 550; }
.review-reminder > span:last-child { margin-left: auto; font-size: 11px; }
.reminder-dot { width: 6px; height: 6px; border-radius: 50%; background: #d58a3c; }
.next-activity { position: relative; display: block; overflow: hidden; padding: 17px 18px 0; border: 1px solid #f4e5e8; border-radius: 18px; background: linear-gradient(120deg,#fff 40%,#fff8f8); box-shadow: 0 5px 18px rgba(41,26,30,.025); }
.next-activity::after { content: ''; position: absolute; top: -18px; right: -58px; width: 150px; height: 150px; border: 1px solid #fae5e9; border-radius: 50%; box-shadow: 0 0 0 17px rgba(255,10,48,.018),0 0 0 34px rgba(255,10,48,.012); pointer-events: none; }
.next-topline { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px; z-index: 1; }
.activity-kind { padding: 3px 6px; border-radius: 5px; color: var(--accent); background: #fff0f2; font-size: 11px; font-weight: 650; }
.activity-status { color: #a66b36; font-size: 11px; font-weight: 500; }
.activity-status.signed, .act-topline b.signed { color: #258062; }
.next-activity h3 { position: relative; margin: 13px 0 9px; color: var(--club-text); font-size: 21px; font-weight: 750; line-height: 1.4; z-index: 1; overflow-wrap: anywhere; }
.next-time { margin: 0; color: #3f424c; font-size: 14px; }
.next-time b { margin-left: 7px; font-weight: 550; }
.next-place { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 8px 0 16px; color: var(--club-muted); font-size: 12px; }
.next-place svg { width: 14px; height: 14px; }
.next-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 -18px; padding: 13px 17px; border-top: 1px solid #f7ebed; background: #fff; }
.next-footer > span { color: var(--club-muted); font-size: 11px; line-height: 1.5; }
.next-footer > b { flex: none; color: var(--accent); font-size: 12px; font-weight: 650; }
.next-footer i { margin-left: 4px; font-style: normal; }
.next-empty { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 10px 12px; padding: 22px 18px; border: 1px solid #ebecef; border-radius: 18px; background: #fff; }
.empty-track { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; color: var(--accent); background: #fff0f3; }
.next-empty h3 { margin: 0 0 6px; color: var(--club-text); font-size: 16px; }
.next-empty p { margin: 0; color: var(--club-muted); font-size: 12px; line-height: 1.6; }
.next-empty > a, .next-empty > button { grid-column: 2; justify-self: start; min-height: 32px; color: var(--accent); font-size: 12px; font-weight: 600; }
.quick-actions { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 14px 0; padding: 14px 2px 12px; border-radius: 16px; background: #fff; }
.club-page .quick-actions button { flex-direction: column; gap: 9px; min-width: 0; padding: 0 2px; }
.quick-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; color: #eb4e65; background: #fff1f3; }
.quick-actions button:nth-child(2) .quick-icon { color: #bf8a3e; background: #fbf5eb; }
.quick-actions button:nth-child(3) .quick-icon { color: #6584ab; background: #eef3fa; }
.quick-actions button:nth-child(4) .quick-icon { color: #9274a6; background: #f4eff7; }
.quick-actions b { color: var(--club-text); font-size: 12px; font-weight: 550; line-height: 1.5; }
.my-club-status { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); padding: 15px 0; border-radius: 15px; background: #fff; }
.club-page .my-club-status button { align-items: flex-start; flex-direction: column; gap: 8px; padding: 0 17px; text-align: left; }
.my-club-status button+button { border-left: 1px solid #eceef2; }
.my-club-status span { color: var(--club-muted); font-size: 11px; }
.my-club-status b { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; color: var(--club-text); font-size: 23px; font-weight: 650; font-variant-numeric: tabular-nums; }
.my-club-status small { color: var(--club-muted); font-size: 10px; font-weight: 400; }
.my-club-status b.status-word { font-size: 15px; }
.daily-card { margin-top: 12px; padding: 0 14px; border-radius: 15px; background: #fff; }
summary { list-style: none; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
.daily-card summary { display: flex; align-items: center; gap: 10px; min-height: 75px; }
.daily-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; color: #88919c; background: #f3f5f8; }
.daily-icon svg { width: 19px; height: 19px; }
.daily-card summary > span:nth-child(2) { display: grid; gap: 5px; flex: 1; min-width: 0; }
.daily-card summary b { font-size: 13px; font-weight: 600; }
.daily-card summary small { color: var(--club-muted); font-size: 11px; }
.daily-card summary i { color: var(--accent); font-size: 12px; font-style: normal; white-space: nowrap; }
.daily-card[open] { padding-bottom: 14px; }
.check-form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.daily-form { flex-direction: row; align-items: center; gap: 8px; }
.daily-form input { width: 0; flex: 1; min-height: 44px; padding: 0 10px; border: 1px solid #e9ebef; border-radius: 9px; background: #f7f8fa; font-size: 13px; }
.daily-form .primary { min-width: 64px; padding: 0 12px; }
.overview-row { display: flex; align-items: center; gap: 12px; min-height: 90px; padding: 16px; border-radius: 15px; background: #fff; }
.overview-row > span:not(.race-date) { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 7px; }
.race-date { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; width: 42px; height: 52px; border-radius: 10px; color: var(--accent); background: #fff1f3; }
.race-date b { font-size: 23px; font-weight: 700; line-height: 1.1; }
.race-date small { margin-top: 3px; font-size: 10px; }
.overview-row strong { color: var(--club-text); font-size: 14px; font-weight: 650; line-height: 1.5; }
.overview-row > span > small { color: var(--club-muted); font-size: 10px; }
.overview-row i, .service-grid i { color: #a5a9b2; font-size: 18px; font-style: normal; }
.overview-empty { padding: 21px 16px; border-radius: 15px; background: #fff; }
.overview-empty p { margin: 0 0 9px; color: var(--club-muted); font-size: 12px; }
.overview-empty a { color: var(--accent); font-size: 12px; }
.service-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); padding: 4px 14px; border-radius: 15px; background: #fff; }
.club-page .service-grid button { justify-content: flex-start; min-height: 56px; gap: 9px; padding: 0 6px 0 0; color: #4d535f; font-size: 12px; }
.service-grid button:nth-child(even) { padding-left: 11px; }
.service-grid button:nth-child(n+3) { border-top: 1px solid #f1f2f5; }
.service-grid svg { width: 18px; height: 18px; color: #8b919c; }
.service-grid i { margin-left: auto; }
.club-section-head { flex-wrap: wrap; margin: 22px 18px 12px; }
.club-section-head > div { display: flex; align-items: center; gap: 10px; }
.club-section-head > div > span { color: var(--club-muted); font-size: 12px; }
.club-page .block { margin: 12px 16px; padding: 17px; border-radius: 16px; background: #fff; }
.block h2 { margin: 0; color: var(--club-text); font-size: 17px; font-weight: 650; line-height: 1.45; }
.block > .card { margin: 0; padding: 0; background: transparent; }
.copy p { margin: 0; color: var(--club-text); font-size: 16px; font-weight: 650; line-height: 1.5; }
.copy .foot { margin-top: 7px; color: var(--club-muted); font-size: 11px; }
.copy .foot span+span { margin-left: 12px; }
.rank-label { margin: 9px 0 0; color: var(--club-muted); font-size: 12px; line-height: 1.65; }
.squad { margin: 9px 0 0; color: #a37643; font-size: 12px; line-height: 1.6; }
.race-roster { margin-top: 12px; border-top: 1px solid #eff0f3; }
.race-roster summary { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 44px; color: #4b515e; font-size: 12px; }
.race-roster summary b { margin-left: 7px; color: #8b919c; font-size: 11px; font-weight: 400; }
.race-roster summary i { color: var(--club-muted); font-size: 11px; font-style: normal; }
.race-roster[open] summary i { font-size: 0; }
.race-roster[open] summary i::after { content: '收起名单⌃'; font-size: 11px; }
.share-text { overflow-wrap: anywhere; white-space: pre-wrap; margin: 0 0 10px; padding: 12px; border-radius: 10px; background: #f8f9fb; color: #656c79; font: inherit; font-size: 12px; line-height: 1.8; }
.club-page .primary { margin-top: 10px; border-radius: 10px; }
.club-page .block .primary { display: inline-flex; width: 100%; }
.club-page .undo { min-height: 44px; height: auto; margin-top: 6px; padding: 0 10px; color: var(--club-muted); background: transparent; border-radius: 8px; }
.club-page .undo.on { background: #fff0f3; color: var(--accent); font-weight: 650; }
.club-page .danger { color: #bd4656; }
.club-page .mate { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 0; border-top: 1px solid #f0f1f5; font-size: 14px; line-height: 1.6; }
.mate > span { min-width: 0; overflow-wrap: anywhere; }
.mate > b { flex: none; max-width: 65%; color: #6e7582; text-align: right; font-size: 12px; font-weight: 450; }
.club-page .mate .primary, .club-page .mate .undo { width: auto; margin: 0; }
.activity-heading, .people-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 23px 18px 15px; }
.activity-heading h2, .people-heading h2 { margin: 0; color: var(--club-text); font-size: 20px; font-weight: 700; }
.activity-heading p, .people-heading p { margin: 5px 0 0; color: var(--club-muted); font-size: 11px; line-height: 1.7; }
.people-heading { display: block; }
.people-heading p b { color: #424957; font-weight: 550; }
.small-primary { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 11px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
.secondary-tabs { display: flex; align-items: center; gap: 6px; margin: 0 16px 14px; padding: 4px; border: 1px solid #eceef2; border-radius: 12px; background: #eceef2; }
.club-page .secondary-tabs button { flex: 1; min-height: 38px; padding: 0 6px; color: #777e8b; font-size: 13px; white-space: nowrap; }
.secondary-tabs button.on { border-radius: 9px; background: #fff; color: #292f3a; box-shadow: 0 1px 5px rgba(31,36,44,.05); font-weight: 650; }
.secondary-tabs small { color: #a0a5af; font-size: 10px; }
.block input:not([type='checkbox']):not([type='radio']) { width: 100%; height: 44px; min-height: 44px; margin-top: 8px; padding: 0 12px; border: 1px solid #eef0f3; border-radius: 9px; background: #f7f8fa; color: var(--club-text); font-size: 13px; }
.block input:focus, .daily-form input:focus { outline: 1px solid var(--accent); }
.check-form input:not([type='checkbox']):not([type='radio']) { margin-top: 0; }
.checks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 7px; margin-top: 9px; }
.checks label { font-size: 13px; }
.club-page .checks .undo { min-height: 36px; margin-top: 0; padding: 0 9px; font-size: 12px; }
.activity-filter .checks { flex-wrap: nowrap; overflow-x: auto; margin-right: -4px; padding-bottom: 3px; scrollbar-width: none; }
.activity-filter .checks button { flex: none; white-space: nowrap; }
.activity-filter input { margin-top: 0!important; }
.date-strip { padding-top: 7px; border-top: 1px solid #f1f2f5; }
.act-topline { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; color: #7e8591; font-size: 11px; }
.act-topline b { flex: none; color: #ad783d; font-size: 11px; font-weight: 500; }
.activity-count { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding-top: 11px; border-top: 1px solid #f1f2f5; }
.activity-count span { margin-left: auto; color: var(--accent); font-size: 11px; }
.copy-activity { display: inline-flex; align-items: center; min-height: 36px; margin-top: 7px; padding: 0 9px; border: 1px solid #eceef2; border-radius: 8px; color: #8a909a; font-size: 11px; }
.activity-empty { text-align: center; padding: 28px 20px!important; }
.activity-empty > svg { width: 36px; height: 36px; padding: 7px; border-radius: 12px; box-sizing: content-box; background: #fff1f3; color: var(--accent); }
.activity-empty h3 { margin: 15px 0 7px; font-size: 15px; }
.activity-empty p { margin: 0 0 16px; color: var(--club-muted); font-size: 12px; }
.attendance-disclosure summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 26px; }
.attendance-disclosure summary b { font-size: 15px; font-weight: 600; }
.attendance-disclosure summary span { color: var(--club-muted); font-size: 11px; }
.manage-toggle { justify-content: space-between!important; width: 100%; margin-top: 14px; padding: 0 12px; border-radius: 10px; color: #a94b5b; background: #fff1f3; text-align: left; font-weight: 550; }
.manage-toggle i { font-size: 19px; font-style: normal; font-weight: 400; }
.month-grid { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 4px; margin-top: 10px; }
.dow { color: var(--club-muted); text-align: center; font-size: 12px; }
.club-page .day { min-height: 34px; border-radius: 8px; font-size: 12px; }
.day.mark { background: #fff1f3; color: var(--accent); }
.day.on { background: var(--accent); color: #fff; }
.club-page .member { display: block; }
.member-directory .section-head { margin: 0 0 9px; }
.member-directory h2 small { margin-left: 5px; color: #a0a5af; font-size: 11px; font-weight: 400; }
.member-filters { margin-bottom: 10px; }
.who { display: flex; justify-content: space-between; align-items: center; gap: 9px; }
.who > b { color: #8e95a0; font-size: 11px; font-weight: 400; white-space: nowrap; }
.member-identity { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 14px; }
.member-identity > span { min-width: 0; overflow-wrap: anywhere; }
.member-identity img, .member-identity i { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 12px; background: #f1edf1; color: #8e7b8c; font-size: 13px; font-weight: 600; font-style: normal; object-fit: cover; }
.member-actions summary { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-height: 35px; color: #969ca6; font-size: 11px; }
.member-actions[open] summary { color: var(--accent); }
.acts { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 5px 9px; margin-top: 4px; }
.club-page .acts .undo { min-height: 36px; padding: 0 8px; border-radius: 7px; background: #f7f8fa; font-size: 11px; }
.requests-block .mate { margin-top: 8px; }
.requests-block > h2::after { content: '待处理'; display: inline-block; margin-left: 8px; padding: 2px 5px; border-radius: 4px; color: #b98244; background: #fcf5eb; font-size: 10px; font-weight: 400; vertical-align: middle; }
.requests-block .mate > b { display: flex; align-items: center; gap: 5px; }
.fee-panel > .section-head { margin: 0 0 12px; }
.fee-period-label { color: #9b6e78; font-size: 11px; }
.fee-title { margin: 15px 0 10px; font-size: 17px; font-weight: 650; }
.fee-periods { margin-bottom: 15px; }
.fee-periods .undo { border: 1px solid #f0f1f4; }
.departed-member { display: inline-block; margin-left: 6px; color: #a0a5ae; font-size: 10px; }
.membership-settings { color: #7d8490; }
.membership-settings .rank-label { font-size: 11px; line-height: 1.8; }
.membership-settings h2 { color: #747c89; font-size: 14px; }
.pair { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.pair label { color: var(--club-muted); font-size: 12px; }
.block input[type='checkbox'], .block input[type='radio'] { width: 16px; height: 16px; min-height: 0; flex: none; margin: 0 4px 0 0; padding: 0; vertical-align: middle; }
.pick, .inline { width: auto; }
.album-card { display: flex; align-items: center; gap: 13px; }
.album-card img { flex: none; width: 75px; height: 75px; border-radius: 13px; object-fit: cover; }
.album-card > div { min-width: 0; }
.service-heading { display: flex; align-items: center; gap: 17px; margin: 18px 17px; }
.club-page .service-heading button { color: var(--club-muted); font-size: 12px; }
.service-heading svg { width: 14px; height: 14px; }
.service-heading h2 { margin: 0; font-size: 19px; }
article { margin-top: 22px; padding-top: 15px; border-top: 1px solid #f0f1f5; font-size: 14px; overflow-wrap: anywhere; }
.viewer { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.86); }
.viewer-frame { width: min(430px,100%); max-height: 88vh; overflow: auto; text-align: center; }
.viewer img { display: block; width: 100%; border-radius: 12px; }
.viewer p { color: #fff; font-size: 12px; }
.feedback-toast { position: fixed; left: 50%; bottom: max(24px,env(safe-area-inset-bottom)); z-index: 50; display: flex; align-items: center; gap: 12px; width: max-content; max-width: min(390px,calc(100vw - 32px)); margin: 0; padding: 4px 8px 4px 16px; transform: translateX(-50%); border-radius: 12px; background: #313640; color: #fff; box-shadow: 0 5px 25px #0002; font-size: 12px; line-height: 1.7; }
.club-page .feedback-toast button { flex: none; min-width: 32px; min-height: 38px; color: #cfd3da; font-size: 20px; }
.club-error { margin: 16px; padding: 15px; border: 1px solid #f6d8de; border-radius: 13px; background: #fff2f4; color: #b95063; font-size: 13px; }
.club-error p { margin: 0 0 8px; }
.club-error > button:not(.small-primary) { min-height: 32px; color: #b95063; font-size: 12px; }
.club-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 330px; color: #606977; font-size: 14px; }
.club-loading p { margin: 9px 0; color: #a1a7b1; font-size: 12px; }
.loading-ring { width: 25px; height: 25px; margin-bottom: 18px; border: 2px solid #efd9de; border-top-color: var(--accent); border-radius: 50%; animation: club-spin .8s linear infinite; }
@keyframes club-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading-ring { animation: none; } }
@media (max-width: 350px) { .club-topbar { padding-right: 10px; padding-left: 10px; } .club-switch span { display: none; } .club-hero { padding: 13px 16px 16px; } .club-eyebrow { font-size: 8px; letter-spacing: .3px; } .club-letter { width: 48px; height: 48px; font-size: 23px; } .club-hero h1 { font-size: 20px; } .club-avatar { width: 24px; height: 24px; margin-right: -9px; } .avatar-caption { margin-left: 13px; font-size: 10px; } .hero-bottom { gap: 7px; } .hero-publish { padding: 0 10px; font-size: 12px; } .overview { padding-right: 12px; padding-left: 12px; } .club-page .block { margin-right: 12px; margin-left: 12px; padding: 14px; } .quick-actions b { font-size: 11px; } .section-head h2 { font-size: 17px; } .next-activity h3 { font-size: 19px; } .activity-heading { margin-right: 14px; margin-left: 14px; } .activity-heading p { max-width: 160px; } .club-page .secondary-tabs button { padding: 0 4px; font-size: 12px; } .next-footer > span { max-width: 65%; } }

.club-page .activities-share { padding: 6px 15px; }
.share-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; }
.share-toolbar > span { color: #9299a4; font-size: 11px; }
.club-page .share-toolbar .undo { margin: 0; color: #737c89; font-size: 12px; }
.share-toolbar i { font-size: 16px; font-style: normal; }
.member-directory .member { position: relative; padding: 13px 0; }
.member-directory .member:has(.member-actions) .who { padding-right: 76px; }
.member-copy { display: grid; gap: 4px; }
.member-copy b { font-size: 14px; font-weight: 550; }
.member-copy small { color: #a0a6b0; font-size: 10px; line-height: 1.6; }
.member-actions summary { position: absolute; top: 17px; right: 0; min-height: 35px; }
.member-actions .acts { margin-top: 12px; padding-top: 9px; border-top: 1px dashed #eff0f4; }
.fee-panel .member { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; min-height: 68px; }
.fee-panel .member > span { flex: 1; min-width: 65px; }
.fee-panel .member > .acts { max-width: none; margin: 0; gap: 5px; }
.club-page .fee-panel .acts .undo { min-height: 38px; padding: 0 8px; font-size: 11px; }
.club-page .fee-panel .acts .undo.on { color: #b95369; background: #fff0f3; }
.created-welcome{background:linear-gradient(130deg,#fff,#fff2f6);border:1px solid #f6dfe7}.created-welcome>p{font-size:12px;color:#9c7e8d;line-height:1.9}.created-welcome>a,.identity-manage-entry>a{display:flex;align-items:center;min-height:44px;color:#a86a80;font-size:12px}.created-welcome .primary{min-height:46px;width:100%;margin:8px 0}.created-welcome h2{font-size:20px}
</style>
