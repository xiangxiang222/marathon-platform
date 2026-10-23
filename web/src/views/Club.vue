<template>
  <main>
    <header class="topbar">
      <router-link to="/clubs" aria-label="返回">‹</router-link>
      <h1>跑团</h1>
      <span></span>
    </header>
    <div v-if="club" class="detail">
      <div class="hero-name">{{ club.name }}</div>
      <div class="row"><span>口令，发到微信群</span><b>{{ club.code }}</b></div>
      <div class="tags" style="margin-top:8px">
        <span v-for="member in members" :key="member.id">{{ member.nickname }}</span>
      </div>
    </div>
    <div v-if="club" class="seg">
      <button type="button" :class="{ on: tab === 'race' }" @click="tab = 'race'">比赛</button>
      <button type="button" :class="{ on: tab === 'feed' }" @click="tab = 'feed'">动态</button>
      <button type="button" :class="{ on: tab === 'act' }" @click="tab = 'act'">活动</button>
      <button type="button" :class="{ on: tab === 'album' }" @click="tab = 'album'">相册</button>
      <button type="button" :class="{ on: tab === 'km' }" @click="tab = 'km'">跑量</button>
      <button type="button" :class="{ on: tab === 'partner' }" @click="tab = 'partner'">合作</button>
      <button type="button" :class="{ on: tab === 'people' }" @click="tab = 'people'">成员</button>
    </div>
    <div v-if="club && tab === 'race'" class="block">
      <h2>团练签到</h2>
      <p class="rank-label">只记今天谁到了，不记公里。</p>
      <form class="check-form" @submit.prevent="checkIn">
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
      <form v-if="club.staff" class="check-form" @submit.prevent="createCall">
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
    <p v-if="club && tab === 'race' && !board.length && !ranks.length" class="empty">还没有人标比赛。打开一场，标上想跑或已报名。</p>
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
      <pre class="share-text">{{ item.text }}</pre>
      <button class="primary" type="button" @click="copyCard(item)">复制卡片</button>
      <div v-for="mark in item.marks" :key="mark.nickname + mark.status" class="mate">
        <span>{{ mark.nickname }}</span>
        <b>{{ mark.status }}<template v-if="mark.clock"> · {{ mark.clock }}<template v-if="mark.pb"> PB</template></template></b>
      </div>
    </div>
    <template v-if="club && tab === 'act'">
      <div class="block">
        <input v-model="actQuery" placeholder="搜活动标题" />
        <div class="checks">
          <button type="button" class="undo" :class="{ on: !actStatus }" @click="actStatus = ''">全部</button>
          <button v-for="item in statusFilters" :key="item.id" type="button" class="undo" :class="{ on: actStatus === item.id }" @click="actStatus = item.id">{{ item.label }}</button>
        </div>
        <div class="checks">
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
          <h2>{{ item.dateLabel }} {{ item.title }}</h2>
          <p class="rank-label">{{ item.clockLabel }}<template v-if="item.place"> · {{ item.place }}</template><template v-if="item.plannedKm"> · {{ item.plannedKm }} 公里</template></p>
          <p class="rank-label">{{ item.signupCount }} 人<template v-if="item.capacity"> / {{ item.capacity }}</template> · {{ item.statusLabel }}</p>
        </router-link>
      </div>
      <p v-if="!shownActivities.length" class="empty">还没有活动。每周团练的报名放在这里。</p>
      <div class="block">
        <button type="button" class="undo" @click="sharing = !sharing">{{ sharing ? "完成" : "分享" }}</button>
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
      <div v-if="attendance" class="block">
        <h2>出勤榜</h2>
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
      </div>
      <form v-if="club.staff" class="block" @submit.prevent="createActivity">
        <h2>发一场活动</h2>
        <input v-model="actTitle" maxlength="40" placeholder="例如 周日 LSD" />
        <input v-model="actIssue" maxlength="40" placeholder="期次，可不填" />
        <input v-model="actWhen" placeholder="开始 2026-10-14 05:00" />
        <input v-model="actEnds" placeholder="结束 2026-10-14 06:30，可不填" />
        <input v-model="actGatherAt" maxlength="40" placeholder="集合时间，可不填" />
        <input v-model="actGather" maxlength="40" placeholder="集合点" />
        <input v-model="actPlace" maxlength="40" placeholder="地点" />
        <input v-model="actPlanned" inputmode="decimal" placeholder="计划里程，公里，可不填" />
        <input v-model="actRoute" maxlength="200" placeholder="路线，可不填" />
        <input v-model="actCancel" placeholder="取消报名截止，可不填" />
        <input v-model="actNote" maxlength="2000" placeholder="说明，例如配速和路线" />
        <div class="pair">
          <label>成团人数<input v-model.number="actPeople" type="number" min="1" max="500" /></label>
          <label>里程公里<input v-model.number="actKm" type="number" min="0.1" max="100" step="0.1" /></label>
          <label>这场积分<input v-model.number="actPoints" type="number" min="0" max="100" /></label>
        </div>
        <p class="rank-label">满这些人数，且每人打卡不少于这个里程，才各得这场积分。人数不够，这场不计分。</p>
        <p class="rank-label">组别留空时，用成员页里的组别。写了就只属于这场。</p>
        <div v-for="(group, index) in actGroups" :key="index" class="pair">
          <label>组别<input v-model="group.name" maxlength="20" placeholder="A1" /></label>
          <label>种类
            <select v-model="group.kind">
              <option value="pace">配速组</option>
              <option value="finish">完赛组</option>
              <option value="volunteer">志愿者</option>
              <option value="other">非训练</option>
            </select>
          </label>
          <label>目标<input v-model="group.pace" maxlength="40" placeholder="配速或目标" /></label>
          <label>名额<input v-model.number="group.capacity" type="number" min="0" max="500" /></label>
        </div>
        <button class="undo" type="button" @click="actGroups.push({ name: '', kind: 'pace', pace: '', capacity: 0 })">加一组</button>
        <button class="primary" type="submit">发出去</button>
      </form>
      <div class="block">
        <h2>约跑</h2>
        <p class="rank-label">三人以上，当天打卡并上传合影才记积分。团练签到不加分。</p>
        <router-link v-for="item in meetups" :key="item.id" class="mate" :to="'/clubs/' + club.id + '/meetups/' + item.id">
          <span>{{ item.dateLabel }} {{ item.place }}</span>
          <b>{{ item.checkCount }} 人 · {{ item.statusLabel }}</b>
        </router-link>
        <p v-if="!meetups.length" class="rank-label">还没有约跑。</p>
        <form class="check-form" @submit.prevent="createMeetup">
          <input v-model="meetDate" placeholder="日期 2026-10-22" />
          <input v-model="meetPlace" maxlength="40" placeholder="地点" />
          <input v-model="meetNote" maxlength="100" placeholder="说明，可不填" />
          <button class="primary" type="submit">发起约跑</button>
        </form>
        <form v-if="club.owner" class="check-form" @submit.prevent="saveTiers">
          <p class="rank-label">约跑积分。第一档不能少于 3 人，0 分只留记录。</p>
          <div v-for="(tier, index) in tierDraft" :key="index" class="pair">
            <label>人数<input v-model.number="tier.minPeople" type="number" min="3" max="500" /></label>
            <label>积分<input v-model.number="tier.points" type="number" min="0" max="20" /></label>
          </div>
          <button class="primary" type="submit">保存档位</button>
        </form>
      </div>
      <div class="block">
        <h2>队内赛</h2>
        <p class="rank-label">和每周训练分开报名。成绩不进赛历。</p>
        <router-link v-for="item in internals" :key="item.id" class="mate" :to="'/clubs/' + club.id + '/internals/' + item.id">
          <span>{{ item.title }}</span>
          <b>{{ item.signupCount }} 人 · {{ item.statusLabel }}</b>
        </router-link>
        <p v-if="!internals.length" class="rank-label">还没有队内赛。</p>
        <form v-if="club.staff" class="check-form" @submit.prevent="createInternal">
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
      <img :src="shareImage" alt="分享图片" />
    </div>
    <template v-if="club && tab === 'people'">
      <div class="block">
        <h2>{{ feeShown ? feeShown.name : "会费" }}</h2>
        <p class="rank-label">会费在微信群里交给团长。这里只记名单，以团长标的为准。</p>
        <template v-if="feeShown">
          <p class="rank-label">{{ feeShown.amount }} 元 · {{ feeShown.startsOn }} 至 {{ feeShown.endsOn }}</p>
          <p v-if="feeShown.note" class="rank-label">{{ feeShown.note }}</p>
          <p class="rank-label">我的状态：{{ feeShown.mine.label }}</p>
          <p v-if="feeShown.blockSignup" class="rank-label">未交和待确认的人不能报名活动和队内赛。</p>
          <div v-for="group in feeShown.groups" :key="group.status">
            <p class="rank-label">{{ group.label }}</p>
            <div v-for="person in group.people" :key="group.status + person.userId" class="mate member">
              <span>{{ person.nickname }}</span>
              <b v-if="club.staff" class="acts">
                <button class="undo" type="button" @click="markFee(person, 'paid')">已收到</button>
                <button class="undo" type="button" @click="markFee(person, 'unpaid')">未收到</button>
                <button class="undo" type="button" @click="markFee(person, 'waived')">免交</button>
              </b>
            </div>
            <p v-if="!group.people.length" class="rank-label">无</p>
          </div>
          <button class="primary" type="button" @click="copyFee">复制名单</button>
        </template>
        <p v-else class="rank-label">还没有会费。</p>
        <div v-if="feeHistory.length > 1" class="checks">
          <button v-for="item in feeHistory" :key="item.id" class="undo" type="button" @click="openFee(item)">{{ item.name }}</button>
        </div>
        <form v-if="club.owner" class="check-form" @submit.prevent="saveFee">
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
      <div v-if="club.staff" class="block">
        <h2>入团申请</h2>
        <p v-if="!requests.length" class="rank-label">没有待审核的申请。没口令的人会出现在这里。</p>
        <div v-for="item in requests" :key="item.id" class="mate">
          <span>{{ item.nickname }}</span>
          <b>
            <button class="primary" type="button" @click="decide(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decide(item, 'reject')">拒绝</button>
          </b>
        </div>
      </div>
      <div class="block">
        <h2>成员</h2>
        <p class="rank-label">我的积分 {{ myPoints }}</p>
        <div v-for="member in members" :key="member.id" class="mate member">
          <div class="who">
            <span>{{ member.nickname }}<template v-if="member.role !== 'member'"> · {{ member.roleLabel }}</template></span>
            <b>{{ member.points }} 分</b>
          </div>
          <div v-if="club.staff && !member.owner" class="acts">
            <button v-if="club.owner && !member.owner && member.role !== 'manager'" class="undo" type="button" @click="setRole(member, 'manager')">设为跑团管理</button>
            <button v-if="club.owner && member.role === 'manager'" class="undo" type="button" @click="setRole(member, 'member')">改为成员</button>
            <button v-if="club.owner && !member.owner" class="undo" type="button" @click="setRole(member, 'owner')">交给他当团长</button>
            <button v-if="club.staff && !member.owner" class="undo" type="button" @click="removeMember(member)">移出</button>
          </div>
        </div>
      </div>
      <form v-if="club.staff" class="block" @submit.prevent="createGroup">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <input v-model="groupName" maxlength="20" placeholder="例如 A0" />
        <input v-model="groupPace" maxlength="20" placeholder="配速，例如 530" />
        <input v-model.number="groupCap" type="number" min="0" placeholder="名额，0 表示不限" />
        <button class="primary" type="submit">加一组</button>
      </form>
      <div v-else class="block">
        <h2>组别</h2>
        <div v-for="group in groups" :key="group.id" class="mate">
          <span>{{ group.name }}<template v-if="group.pace"> · {{ group.pace }}</template></span>
          <b>{{ group.capacity ? "限 " + group.capacity + " 人" : "不限" }}</b>
        </div>
        <p v-if="!groups.length" class="rank-label">还没有组别。</p>
      </div>
      <div class="block">
        <h2>礼品</h2>
        <p class="rank-label">用积分换，不付款。</p>
        <div v-for="gift in gifts" :key="gift.id" class="mate">
          <span>{{ gift.name }} · {{ gift.cost }} 分 · 剩 {{ gift.stock }}</span>
          <button class="primary" type="button" :disabled="!gift.stock" @click="redeem(gift)">兑换</button>
        </div>
        <form v-if="club.staff" @submit.prevent="createGift">
          <input v-model="giftName" maxlength="20" placeholder="礼品名" />
          <input v-model.number="giftCost" type="number" min="1" placeholder="所需积分" />
          <input v-model.number="giftStock" type="number" min="1" placeholder="库存" />
          <button class="primary" type="submit">上架</button>
        </form>
        <p v-if="!gifts.length && !club.staff" class="rank-label">还没有礼品。</p>
      </div>
    </template>
    <p v-if="note" class="note">{{ note }}</p>
    <p v-if="message" class="err" style="padding:0 16px">{{ message }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, mediaSrc } from "../api";
import { copyText } from "../copy";
import { textCard } from "../share-card";
import MileageBoard from "../components/MileageBoard.vue";
import PartnerBoard from "../components/PartnerBoard.vue";
const route = useRoute();
const router = useRouter();
const tab = ref("race");
const posts = ref([]);
const postBody = ref("");
const postMessage = ref("");
const commentDrafts = reactive({});
const club = ref(null);
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
  return activities.value.filter((item) => {
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
    message.value = err.message;
  }
}

async function pictureShare() {
  message.value = "";
  try {
    const data = await sharePayload();
    shareImage.value = textCard(data.text.split("\n"));
  } catch (err) {
    message.value = err.message;
  }
}

async function openAttend(range) {
  attendRange.value = range;
  try {
    attendance.value = await api("/clubs/" + route.params.id + "/attendance?range=" + range);
  } catch (err) {
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
    checkMessage.value = err.message;
  }
}

async function undoCheckin() {
  checkMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/checkins", { method: "DELETE" });
    applyCheckins(data);
  } catch (err) {
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
    message.value = "没有复制成功，可以直接选中上面的文字";
  }
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
    postMessage.value = err.message;
  }
}

async function removePost(item) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id, { method: "DELETE" });
    posts.value = data.posts || [];
  } catch (err) {
    postMessage.value = err.message;
  }
}

async function removeComment(item, comment) {
  postMessage.value = "";
  try {
    const data = await api("/clubs/" + route.params.id + "/posts/" + item.id + "/comments/" + comment.id, { method: "DELETE" });
    posts.value = data.posts || [];
  } catch (err) {
    postMessage.value = err.message;
  }
}

async function reload() {
  applyClub(await api("/clubs/" + route.params.id));
  const fees = await api("/clubs/" + route.params.id + "/fees");
  feeCurrent.value = fees.current;
  feeHistory.value = fees.history || [];
  if (!feeShown.value || feeShown.value.open) {
    feeShown.value = fees.current;
    if (feeMode.value === "edit") fillFee(fees.current);
  }
  const calls = await api("/clubs/" + route.params.id + "/calls");
  resultCalls.value = calls.calls || [];
  const gathered = await api("/clubs/" + route.params.id + "/meetups");
  meetups.value = gathered.meetups || [];
  meetupTiers.value = gathered.tiers || [];
  if (!tierDraft.value.length) tierDraft.value = (gathered.tiers || []).map((tier) => ({ minPeople: tier.minPeople, points: tier.points }));
  const races = await api("/clubs/" + route.params.id + "/internals");
  internals.value = races.races || [];
  const album = await api("/clubs/" + route.params.id + "/albums");
  albums.value = album.albums || [];
  const feed = await api("/clubs/" + route.params.id + "/posts");
  posts.value = feed.posts || [];
  attendance.value = await api("/clubs/" + route.params.id + "/attendance?range=" + attendRange.value);
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
    message.value = err.message;
  }
}

async function removeMember(member) {
  message.value = "";
  try {
    await api("/clubs/" + route.params.id + "/members/" + member.id, { method: "DELETE" });
    await reload();
  } catch (err) {
    message.value = err.message;
  }
}

onMounted(async () => {
  try {
    await reload();
  } catch (err) {
    message.value = err.message;
  }
});
</script>

<style scoped>
.block :deep(.poster) { aspect-ratio: 5 / 2; height: auto; border-radius: 8px; }
.share-text { margin: 8px 0 0; font: inherit; white-space: pre-wrap; line-height: 1.5; }
.rank-label { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.squad { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.note { font-size: 12px; color: #007aff; }
.primary { margin-top: 8px; }
.member { display: block; }
.who { display: flex; justify-content: space-between; gap: 12px; }
.acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; margin-top: 4px; }
.mate .primary, .mate .undo { width: auto; margin: 0; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.seg { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 16px; }
.seg button { flex: 1 1 22%; height: 34px; border-radius: 10px; background: #fff; color: #8e8e93; font-weight: 650; font-size: 12px; padding: 0; white-space: nowrap; }
.undo.on { color: #007aff; }
.month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 8px; }
.dow, .day { text-align: center; font-size: 12px; }
.day { height: 32px; border-radius: 8px; background: transparent; }
.day.mark { background: #e8f2ff; color: #007aff; }
.day.on { background: #007aff; color: #fff; }
.album-card { display: flex; gap: 12px; align-items: center; text-decoration: none; color: inherit; }
.album-card img { width: 72px; height: 72px; object-fit: cover; border-radius: 12px; }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.86); z-index: 40; display: grid; place-items: center; padding: 24px; }
.viewer img { max-width: min(430px, 100%); max-height: 80vh; border-radius: 12px; }
.act select, .pair select { width: 100%; height: 36px; margin-top: 4px; border: 0; border-radius: 8px; background: rgba(118, 118, 128, 0.12); }
.seg button.on { background: #007aff; color: #fff; }
.act { display: block; }
.block input { width: 100%; height: 40px; margin-top: 8px; border: 0; border-radius: 10px; padding: 0 12px; background: rgba(118, 118, 128, 0.12); }
.checks { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; }
.checks label { font-size: 14px; }
.qr { width: 180px; margin-top: 8px; border-radius: 8px; }
.pick, .inline { width: auto; margin: 4px 8px 0 0; }
.file-pick { display: inline-block; margin-top: 8px; color: #007aff; font-size: 14px; }
.file-pick input { display: none; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pair label { font-size: 12px; color: #8d949c; }
.pair input { width: 100%; }
</style>
