<template>
  <main class="admin">
    <header v-if="!authed" class="topbar">
      <router-link to="/" aria-label="返回">‹</router-link>
      <h1></h1>
      <span></span>
    </header>
    <div v-if="!authed" class="gate">
      <div class="gate-copy">
        <p class="kicker">赛历</p>
        <h2>后台</h2>
        <p>赛事、用户、入团审核、团练公里和积分礼品。</p>
      </div>
      <form class="gate-form" @submit.prevent="enter">
        <label>
          <span>用户名</span>
          <input v-model="username" autocomplete="username" placeholder="用户名" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="密码" />
        </label>
        <button class="primary" type="submit">进入</button>
        <p v-if="message" class="err">{{ message }}</p>
      </form>
    </div>
    <template v-else>
      <p v-if="message" class="banner" :class="{ ok: saved }">{{ message }}</p>
      <div class="admin-shell">
      <nav class="admin-nav">
        <div class="brand">
          <router-link to="/" class="back">‹ 赛历</router-link>
          <strong>后台</strong>
        </div>
        <button v-for="item in deskSections" :key="item.id" type="button" :class="{ on: section === item.id }" @click="pickSection(item.id)">{{ item.label }}</button>
        <button class="out" type="button" @click="logout">退出</button>
      </nav>
      <div class="desk-canvas">
      <header class="desk-head">
        <div>
          <h2>{{ sectionLabel }}</h2>
          <p>{{ sectionLead }}</p>
        </div>
        <button v-if="section === 'races'" type="button" class="primary head-add" @click="startDraft">添加一场</button>
      </header>
      <div v-show="section === 'races'" class="desk" :class="{ editing: !!book, dragging }" :style="splitStyle">
      <div class="desk-main">
      <div class="block">
        <form class="check-form inline-form" @submit.prevent="loadCatalog">
          <input v-model="catalogQuery" placeholder="搜名称、城市" />
          <button class="primary" type="submit">筛选</button>
        </form>
        <div class="statuses">
          <button type="button" class="status" :class="{ on: catalogWhen === 'upcoming' }" @click="setCatalogWhen('upcoming')">即将开赛</button>
          <button type="button" class="status" :class="{ on: catalogWhen === 'all' }" @click="setCatalogWhen('all')">全部</button>
        </div>
        <p v-if="catalogReady" class="hint">{{ catalog.length }} 场</p>
        <div class="race-list">
          <div v-for="item in catalog" :key="item.id" class="race-row" :class="{ on: book && book.id === item.id }">
            <button type="button" class="race-open catalog-open" @click="openGuide(item.id)">
              <time>{{ item.raceDate }}</time>
              <em>{{ item.city }}</em>
              <span>{{ item.name }}</span>
            </button>
            <button type="button" class="remove" @click="removeRace(item)">删除</button>
          </div>
        </div>
        <p v-if="catalogReady && !catalog.length" class="empty">这个范围还没有场。</p>
      </div>
      </div>
      <div class="desk-official">
      <div class="block">
        <h2>官网赛历</h2>
        <p class="hint">每一届单独存。中国马拉松官网这场一直有链接。赛事自己的网站，官网给了才记下；没给就空着，也不拿往年的网站来填。每天再对一次，名称、日期、主办、赛事网站有变会标出来。报名时间仍要另写来源，已经记下的截止时间不会被盖掉。</p>
        <form class="check-form inline-form" @submit.prevent="search">
          <input v-model="q" placeholder="向官网查名称，例如璧山" />
          <button class="primary" type="submit">查官网</button>
        </form>
        <button class="undo" type="button" @click="syncAll">拉取即将开赛的场</button>
        <div class="statuses">
          <button v-for="item in filters" :key="item.value" type="button" class="status" :class="{ on: filter === item.value }" @click="setFilter(item.value)">
            {{ item.label }}
          </button>
        </div>
        <p v-if="busy" class="hint">正在向官网要赛历。</p>
        <form class="check-form" @submit.prevent="changePassword">
          <input v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" />
          <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，至少 8 位" />
          <button class="undo" type="submit">修改密码</button>
        </form>
      </div>
      <div v-for="row in rows" :key="row.officialId" class="block">
        <h2>{{ row.name }}</h2>
        <p class="hint">{{ row.raceDate }} · {{ row.province }} {{ row.city }} · {{ row.gradeLabel || "未标类别" }} · {{ row.items || "项目未写" }}</p>
        <p v-if="row.organizer" class="hint">主办 {{ row.organizer }}</p>
        <p v-if="row.scale" class="hint">规模 {{ row.scale }}</p>
        <p v-if="row.webUrl" class="hint"><a :href="row.webUrl" target="_blank" rel="noopener">今年的赛事网站</a></p>
        <p v-else class="hint">{{ row.webNote }}</p>
        <p v-if="row.priorWeb && row.priorWeb.webUrl !== row.webUrl" class="hint">
          <a :href="row.priorWeb.webUrl" target="_blank" rel="noopener">{{ row.priorWeb.raceDate.slice(0, 4) }} 届网站</a>
        </p>
        <p v-for="change in row.changes" :key="change.id" class="warn">{{ change.label }}：{{ change.oldValue || "空" }} → {{ change.newValue || "空" }}</p>
        <p v-if="row.match && !row.raceId" class="hint">赛历里已有这场：{{ row.match.name }}</p>
        <p v-if="row.diffNote" class="warn">{{ row.diffNote }}</p>
        <p class="hint"><a :href="row.detailUrl" target="_blank" rel="noopener">打开官网这场</a></p>
        <button v-if="row.status !== 'published'" class="primary" type="button" @click="publish(row)">
          {{ row.match ? "对上已有赛历" : "收入赛历" }}
        </button>
        <button v-if="row.status !== 'ignored'" class="undo" type="button" @click="ignore(row)">忽略</button>
        <button v-if="row.diffNote" class="undo" type="button" @click="apply(row)">采用官网这次的名称、日期和赛事网站</button>
        <router-link v-if="row.raceId" class="hint link" :to="'/races/' + row.raceId">打开赛历这场</router-link>
        <form v-if="row.raceId" class="check-form node-form" @submit.prevent="saveNodes(row)">
          <input v-model="row.regStart" type="date" aria-label="报名开始" />
          <input v-model="row.deadline" type="date" aria-label="报名截止" />
          <input v-model="row.drawAt" type="date" aria-label="查询中签" />
          <input v-model="row.payDeadline" type="date" aria-label="缴费截止" />
          <input v-model="row.nodeSource" class="span" placeholder="来源，例如最酷，2026-09-07" />
          <button class="primary" type="submit">保存报名节点</button>
        </form>
      </div>
      <p v-if="ready && !rows.length" class="empty">这个范围还没有场。</p>
      </div>
      <div v-if="book" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
      <aside v-if="book" class="desk-side">
      <div class="block editor">
        <h2>{{ book.id ? "编辑这场" : "添加这场" }}</h2>
        <template v-if="book">
          <p v-if="book.id" class="hint">来源 {{ book.source || "还没写" }}<template v-if="book.updatedAt"> · 更新于 {{ book.updatedAt }}</template></p>
          <p v-else class="hint">一次写完。报名时间空着，赛历上显示「报名时间未公布」。站内不报名、不付款。</p>
          <router-link v-if="book.id" class="hint link" :to="'/races/' + book.id">在赛历里打开</router-link>
          <nav class="jumps">
            <button v-for="item in sections" :key="item.id" type="button" @click="jump(item.id)">{{ item.label }}</button>
          </nav>
          <form class="check-form guide-form" @submit.prevent="saveGuide">
            <section id="edit-base" class="section">
              <h3>基本信息</h3>
              <p class="lead">名称和比赛日从日历里选。省份、城市从列表里选，名单里没有的城市可以手写。起点可以选这个城市已经用过的地点，也可以手写。</p>
              <div class="pair">
                <label class="field span"><span>赛事名称</span><input v-model="book.name" placeholder="例如 2026 沂水 10 公里" /></label>
                <label class="field"><span>比赛日</span><input v-model="book.raceDate" type="date" /></label>
                <label class="field"><span>起跑</span><input v-model="book.startAt" type="time" /></label>
                <label class="field"><span>省份</span>
                  <select v-model="book.province" @change="onProvinceChange">
                    <option value="">选择省份</option>
                    <option v-for="name in provinceOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </label>
                <label class="field"><span>城市</span>
                  <select :value="cityMode === 'write' ? '__write__' : book.city" @change="pickCity">
                    <option value="">选择城市</option>
                    <option v-for="name in cityOptions" :key="name" :value="name">{{ name }}</option>
                    <option value="__write__">手写城市</option>
                  </select>
                  <input v-if="cityMode === 'write'" v-model="book.city" placeholder="手写城市" />
                </label>
                <label class="field span"><span>地点</span>
                  <select v-if="placeOptions.length" :value="placeOptions.includes(book.place) ? book.place : ''" @change="pickPlace">
                    <option value="">选择已有地点</option>
                    <option v-for="name in placeOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                  <input v-model="book.place" placeholder="起点、会展中心或景区" />
                </label>
                <label class="field"><span>主办</span><input v-model="book.organizer" placeholder="组委会或公司" /></label>
                <label class="field"><span>类别</span>
                  <select v-model="book.grade">
                    <option v-for="item in gradeChoices" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
              </div>
            </section>
            <section id="edit-projects" class="section">
              <h3>项目</h3>
              <p class="lead">全马、半马和路跑用上面一排。越野的具体距离、超马公里数写在其他组别，用顿号分开。</p>
              <p class="pick-label">计时项目</p>
              <div class="picks">
                <button v-for="item in distanceChoices" :key="item.key" type="button" class="pick" :class="{ on: book.distances.includes(item.key) }" :aria-pressed="book.distances.includes(item.key)" @click="toggle(book.distances, item.key)">{{ item.label }}</button>
              </div>
              <p class="pick-label">类型</p>
              <div class="picks">
                <button v-for="item in kindChoices" :key="item.key" type="button" class="pick" :class="{ on: book.kinds.includes(item.key) }" :aria-pressed="book.kinds.includes(item.key)" @click="toggle(book.kinds, item.key)">{{ item.label }}</button>
              </div>
              <div class="pair">
                <label class="field span"><span>其他组别</span><input v-model="book.groups" placeholder="15公里、30公里、50公里" /></label>
                <label class="field"><span>规模</span><input v-model="book.scale" placeholder="全程 35000 人" /></label>
                <label class="field"><span>报名费</span><input v-model="book.fee" placeholder="全程 200 元，半程 150 元" /></label>
                <label class="field span"><span>咨询电话</span><input v-model="book.phone" placeholder="只写号码" /></label>
              </div>
            </section>
            <section id="edit-signup" class="section">
              <h3>报名和查询</h3>
              <p class="lead">日期空着就保持原来的，新加的场会显示报名时间未公布。改了时间要写这次的来源。链接打开赛事自己的页面。</p>
              <div class="pair">
                <label class="field"><span>开始报名</span><input v-model="book.regStart" type="date" /></label>
                <label class="field"><span>截止报名</span><input v-model="book.deadline" type="date" /></label>
                <label class="field"><span>截止叫什么</span><input v-model="book.deadlineName" placeholder="报名截止" /></label>
                <label class="field"><span>查询中签</span><input v-model="book.drawAt" type="date" /></label>
                <label class="field"><span>缴费截止</span><input v-model="book.payDeadline" type="date" /></label>
                <label class="field"><span>号码公布</span><input v-model="book.bibAt" type="date" /></label>
                <label class="field span"><span>这次的来源</span><input v-model="book.nodeSource" placeholder="规程或官网，写上看到的日期" /></label>
                <label class="field span"><span>报名</span><input v-model="book.signupUrl" placeholder="https://" /></label>
                <label class="field"><span>查询中签</span><input v-model="book.drawUrl" placeholder="https://" /></label>
                <label class="field"><span>查询号码</span><input v-model="book.bibUrl" placeholder="https://" /></label>
                <label class="field"><span>成绩和证书</span><input v-model="book.resultUrl" placeholder="https://" /></label>
              </div>
            </section>
            <section id="edit-site" class="section">
              <h3>官网</h3>
              <p class="lead">赛事自己的网站，和中国马拉松官网这场。空着保存会留下原来的链接。</p>
              <div class="pair">
                <label class="field span"><span>赛事官网</span><input v-model="book.eventUrl" placeholder="https://" /></label>
                <label class="field span"><span>中国马拉松官网这场</span><input v-model="book.officialUrl" placeholder="https://" /></label>
              </div>
            </section>
            <section id="edit-day" class="section">
              <h3>比赛日</h3>
              <p class="lead">路线写能看懂的一句，也可以传路线图，最多 4 张。领物写一句。配速可以写文字，也可以传配速表或配速员照片，最多 8 张。</p>
              <div class="pair">
                <label class="field span"><span>路线</span><textarea v-model="book.route" rows="3" placeholder="例如 永安湖环湖，起点在北门"></textarea></label>
                <div class="span">
                  <label class="file-pick">上传路线图<input type="file" accept="image/jpeg,image/png,image/webp" @change="onRouteFile" /></label>
                  <div class="sheets">
                    <div v-for="sheet in book.routeSheets" :key="sheet.id" class="sheet-row">
                      <img :src="raceSheetSrc(sheet.id)" alt="路线图" />
                      <button class="undo" type="button" @click="removeSheet(sheet.id)">删除这张</button>
                    </div>
                    <div v-for="(item, index) in routeQueue" :key="item.url" class="sheet-row">
                      <img :src="item.url" alt="待上传的路线图" />
                      <button class="undo" type="button" @click="dropQueuedRoute(index)">先不传这张</button>
                    </div>
                  </div>
                </div>
                <label class="field span"><span>领物须知</span><textarea v-model="book.pickup" rows="3" placeholder="例如 赛前一天 10:00–20:00，按号段领取"></textarea></label>
                <label class="field span"><span>配速员</span><textarea v-model="book.pacers" rows="3" placeholder="例如 全马 4 小时到 6 小时，每 15 分钟一档"></textarea></label>
              </div>
              <label class="file-pick">上传配速员照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onPacerFile" /></label>
              <div class="sheets">
                <div v-for="sheet in book.pacerSheets" :key="sheet.id" class="sheet-row">
                  <img :src="raceSheetSrc(sheet.id)" alt="配速员" />
                  <button class="undo" type="button" @click="removeSheet(sheet.id)">删除这张</button>
                </div>
                <div v-for="(item, index) in pacerQueue" :key="item.url" class="sheet-row">
                  <img :src="item.url" alt="待上传的配速员照片" />
                  <button class="undo" type="button" @click="dropQueuedPacer(index)">先不传这张</button>
                </div>
              </div>
            </section>
            <section id="edit-guide" class="section">
              <h3>竞赛规程</h3>
              <p class="lead">可以粘贴规程正文，也可以按组委会原图一页一张上传，最多 16 页。选手在赛事页里先看文字，再点开大图。奖金、关门和资格以组委会原文为准。</p>
              <label class="field"><span>规程正文</span><textarea v-model="book.guideText" rows="8" placeholder="把规程文字粘贴到这里"></textarea></label>
              <label class="file-pick">上传规程原图<input type="file" accept="image/jpeg,image/png,image/webp" @change="onGuideFile" /></label>
              <div class="sheets">
                <div v-for="sheet in book.guide" :key="sheet.id" class="sheet-row">
                  <img :src="raceSheetSrc(sheet.id)" alt="规程" />
                  <button class="undo" type="button" @click="removeSheet(sheet.id)">删除这一页</button>
                </div>
                <div v-for="(item, index) in guideQueue" :key="item.url" class="sheet-row">
                  <img :src="item.url" alt="待上传的规程" />
                  <button class="undo" type="button" @click="dropQueuedGuide(index)">先不传这一页</button>
                </div>
              </div>
            </section>
            <section id="edit-live" class="section">
              <h3>直播</h3>
              <p class="lead">有链接就贴链接。只有二维码就传图，再传一张会换掉上一张。</p>
              <label class="field"><span>直播链接</span><input v-model="book.liveUrl" placeholder="https://" /></label>
              <label class="file-pick">上传直播二维码<input type="file" accept="image/jpeg,image/png,image/webp" @change="onLiveFile" /></label>
              <div v-if="book.liveSheet" class="sheet-row live-preview">
                <img :src="raceSheetSrc(book.liveSheet.id)" alt="直播二维码" />
                <button class="undo" type="button" @click="removeSheet(book.liveSheet.id)">删除二维码</button>
              </div>
              <div v-if="liveQueue" class="sheet-row live-preview">
                <img :src="liveQueue.url" alt="待上传的直播二维码" />
                <button class="undo" type="button" @click="dropQueuedLive">先不传这张</button>
              </div>
            </section>
            <div class="editor-actions">
              <button class="primary" type="submit">{{ book.id ? "保存这场" : "加入赛历" }}</button>
              <button v-if="!book.id" class="undo" type="button" @click="closeEditor">取消</button>
            </div>
          </form>
        </template>
      </div>
      </aside>
      </div>
      <div v-if="section === 'users'" class="desk" :class="{ editing: !!person, dragging }" :style="splitStyle">
        <div class="desk-main">
          <div class="block">
            <form class="check-form inline-form" @submit.prevent="loadUsers">
              <input v-model="userQuery" placeholder="搜昵称" />
              <button class="primary" type="submit">筛选</button>
            </form>
            <p v-if="usersReady" class="hint">{{ users.length }} 人</p>
            <div class="race-list">
              <div v-for="item in users" :key="item.id" class="race-row" :class="{ on: person && person.user.id === item.id }">
                <button type="button" class="race-open" @click="openUser(item.id)">
                  <span class="who-name">{{ item.nickname }}<i v-if="item.leader">建团资格</i></span>
                  <strong>{{ item.createdAt }} · {{ item.clubs }} 个团 · {{ item.plans }} 场<span v-if="item.hasPassword"> · 可登录</span></strong>
                </button>
              </div>
            </div>
            <p v-if="usersReady && !users.length" class="empty">没有这个昵称。</p>
          </div>
        </div>
        <div v-if="person" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
        <aside v-if="person" class="desk-side">
          <div class="block person">
            <template v-if="person">
              <div class="person-head">
                <div class="person-face" aria-hidden="true">{{ person.user.nickname.slice(0, 1) }}</div>
                <div>
                  <h2>{{ person.user.nickname }}</h2>
                  <p>{{ person.user.createdAt }} 起用这个昵称</p>
                </div>
              </div>
              <section class="section">
                <div class="setting">
                  <div>
                    <h3>建团资格</h3>
                    <p class="lead">开启后，该用户可申请创建跑团。关闭后不能再申请建团，已担任团长的跑团不受影响。</p>
                  </div>
                  <button type="button" class="switch" :class="{ on: person.user.leader }" role="switch" :aria-checked="person.user.leader" aria-label="建团资格" @click="setLeader(!person.user.leader)"><i></i></button>
                </div>
              </section>
              <section class="section">
                <h3>登录密码</h3>
                <p class="lead">{{ person.user.hasPassword ? "该账号已设置登录密码。保存后将替换为新密码。" : "该账号尚未设置登录密码。设置后，可使用此昵称与密码登录。" }}</p>
                <form class="pass-form" @submit.prevent="setLoginPassword">
                  <label>
                    <span>新密码</span>
                    <input v-model="loginPass" type="password" autocomplete="new-password" placeholder="8–128 位" />
                  </label>
                  <button class="save" type="submit">保存</button>
                </form>
              </section>
              <section class="section">
                <h3>删除账号</h3>
                <p class="lead">删除后，该昵称可重新注册，相关个人记录将一并清除。若该用户仍担任跑团团长，须先完成团长移交。</p>
                <button v-if="!confirmDelete" class="danger-quiet" type="button" @click="confirmDelete = true">删除账号</button>
                <div v-else class="confirm-box">
                  <p class="lead">确认删除该账号？此操作不可恢复。</p>
                  <div class="confirm-row">
                    <button class="danger" type="button" @click="removeUser">确认删除</button>
                    <button class="undo" type="button" @click="confirmDelete = false">取消</button>
                  </div>
                </div>
              </section>
              <section class="section">
                <h3>跑团</h3>
                <article v-for="club in person.clubs" :key="club.id" class="club-card">
                  <b>{{ club.name }}</b>
                  <div class="roles" role="radiogroup" :aria-label="club.name + '里的角色'">
                    <button v-for="role in clubRoles" :key="role.id" type="button" role="radio" :aria-checked="club.role === role.id" :class="{ on: club.role === role.id }" :disabled="club.role === 'owner' && role.id !== 'owner'" @click="setClubRole(club, role.id)">
                      <span>{{ role.label }}</span>
                      <i></i>
                    </button>
                  </div>
                  <p v-if="club.role === 'owner'" class="role-note">现任团长的角色不能直接修改。请先将团长移交给本团其他成员，再进行变更。</p>
                </article>
                <p v-if="!person.clubs.length" class="hint">还没进跑团。</p>
              </section>
              <section class="section">
                <h3>标过的场</h3>
                <div v-for="item in person.plans" :key="item.name + item.raceDate" class="fact"><b>{{ item.name }}</b><span>{{ item.raceDate }} · {{ item.status }}</span></div>
                <p v-if="!person.plans.length" class="hint">还没标比赛。</p>
              </section>
              <section class="section">
                <h3>自己记的成绩</h3>
                <div v-for="item in person.results" :key="item.name + item.distance" class="fact"><b>{{ item.name }}</b><span>{{ item.distance }} {{ item.clock }}</span></div>
                <p v-if="!person.results.length" class="hint">还没记成绩。</p>
              </section>
              <section class="section">
                <h3>跑团积分</h3>
                <div v-for="item in person.points" :key="item.club" class="fact"><b>{{ item.club }}</b><span>{{ item.points }} 分</span></div>
                <p v-if="!person.points.length" class="hint">还没有积分。</p>
              </section>
            </template>
          </div>
        </aside>
      </div>
      <div v-if="section === 'runs'" class="block">
        <p v-if="runsReady" class="hint">{{ runs.length }} 条</p>
        <div class="race-list">
          <div v-for="(item, index) in runs" :key="index" class="line">
            <b>{{ item.nickname }} · {{ item.km }} 公里</b>
            <span>{{ item.at }} · {{ item.club }} · {{ item.title }}<template v-if="item.note"> · {{ item.note }}</template></span>
          </div>
        </div>
        <p v-if="runsReady && !runs.length" class="empty">还没有人报过公里。</p>
      </div>
      <div v-if="section === 'shop'">
        <div class="block">
          <h2>积分礼品</h2>
          <div v-for="item in gifts" :key="item.id" class="line"><b>{{ item.club }} · {{ item.name }}</b><span>{{ item.cost }} 分 · 剩 {{ item.stock }}</span></div>
          <p v-if="shopReady && !gifts.length" class="empty">还没有跑团放礼品。</p>
        </div>
        <div class="block">
          <h2>兑换记录</h2>
          <div v-for="(item, index) in redemptions" :key="index" class="line"><b>{{ item.nickname }} · {{ item.name }}</b><span>{{ item.at }} · {{ item.club }} · {{ item.cost }} 分</span></div>
          <p v-if="shopReady && !redemptions.length" class="empty">还没有人兑换。</p>
        </div>
      </div>
      <div v-if="section === 'joins'" class="block">
        <h2>建团</h2>
        <p class="hint">须具备建团资格才能提交。通过后，申请人成为该团团长，可以在手机上管理成员、活动和组别。</p>
        <p v-if="joinsReady" class="hint">{{ foundings.length }} 条待审核</p>
        <div v-for="item in foundings" :key="item.id" class="line">
          <b>{{ item.nickname }} · {{ item.name }}</b>
          <span>{{ item.at }}</span>
          <span class="actions">
            <button class="primary" type="button" @click="decideFounding(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decideFounding(item, 'reject')">拒绝</button>
          </span>
        </div>
        <p v-if="joinsReady && !foundings.length" class="empty">没有待审核的建团。</p>
        <h2>入团</h2>
        <p v-if="joinsReady" class="hint">{{ joins.length }} 条待审核</p>
        <div v-for="item in joins" :key="item.id" class="line">
          <b>{{ item.nickname }} · {{ item.club }}</b>
          <span>{{ item.at }}</span>
          <span class="actions">
            <button class="primary" type="button" @click="decideJoin(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decideJoin(item, 'reject')">拒绝</button>
          </span>
        </div>
        <p v-if="joinsReady && !joins.length" class="empty">没有待审核的申请。</p>
        <form v-if="role === 'club'" class="check-form" @submit.prevent="changePassword">
          <input v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" />
          <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码，至少 8 位" />
          <button class="undo" type="submit">修改密码</button>
        </form>
      </div>
      <div v-if="section === 'accounts'" class="block">
        <p class="hint">后台角色是管理员和跑团管理员。团里的团长、跑团管理、成员，到用户页改。</p>
        <div v-for="item in accounts" :key="item.username" class="line">
          <b>{{ item.username }}</b>
          <span>{{ item.roleLabel }}</span>
          <select v-if="item.username !== selfName" class="role-pick" :value="item.role" @change="setAccountRole(item, $event.target.value)">
            <option value="admin">管理员</option>
            <option value="club">跑团管理员</option>
          </select>
        </div>
        <form class="check-form" @submit.prevent="createAccount">
          <input v-model="accountName" placeholder="用户名" />
          <input v-model="accountPass" type="password" autocomplete="new-password" placeholder="密码，至少 8 位" />
          <select v-model="accountRole">
            <option value="club">跑团管理员</option>
            <option value="admin">管理员</option>
          </select>
          <button class="primary" type="submit">添加账号</button>
        </form>
      </div>
      </div>
      </div>
    </template>
  </main>
</template>

<script setup>
import { computed, ref } from "vue";
import { adminUpload, api, raceSheetSrc } from "../api";
import { regions } from "../regions";

const token = ref(sessionStorage.getItem("marathon_admin") || "");
const username = ref("");
const password = ref("");
const currentPassword = ref("");
const nextPassword = ref("");
const authed = ref(false);
const q = ref("");
const filter = ref("pending");
const rows = ref([]);
const message = ref("");
const saved = ref(false);
const busy = ref(false);
const ready = ref(false);
const catalog = ref([]);
const catalogQuery = ref("");
const catalogWhen = ref("upcoming");
const catalogReady = ref(false);
const section = ref("races");
const role = ref("admin");
const selfName = ref("");
const allSections = [
  { id: "races", label: "赛事", roles: ["admin"] },
  { id: "users", label: "用户", roles: ["admin", "club"] },
  { id: "joins", label: "入团", roles: ["admin", "club"] },
  { id: "runs", label: "跑步", roles: ["admin"] },
  { id: "shop", label: "商城", roles: ["admin"] },
  { id: "accounts", label: "账号", roles: ["admin"] }
];
const deskSections = computed(() => allSections.filter((item) => item.roles.includes(role.value || "admin")));
const users = ref([]);
const usersReady = ref(false);
const userQuery = ref("");
const person = ref(null);
const runs = ref([]);
const runsReady = ref(false);
const gifts = ref([]);
const redemptions = ref([]);
const shopReady = ref(false);
const joins = ref([]);
const foundings = ref([]);
const joinsReady = ref(false);
const accounts = ref([]);
const accountName = ref("");
const accountPass = ref("");
const accountRole = ref("club");
function savedSplit() {
  try {
    const value = Number(localStorage.getItem("marathon_admin_split"));
    return value >= 22 && value <= 70 ? value : 46;
  } catch {
    return 46;
  }
}

const split = ref(savedSplit());
const dragging = ref(false);
const splitStyle = computed(() => ({ "--split": split.value + "%" }));
const sectionLabel = computed(() => deskSections.value.find((item) => item.id === section.value)?.label || "后台");
const sectionLead = computed(() => ({
  races: "已经收进赛历的场。自动拉取还在，删掉的场不会马上加回来。",
  users: "可为用户开启或关闭建团资格、设置登录密码，或删除账号。关闭建团资格不影响其已担任的团长。昵称冲突时，删除多余账号即可。不收集手机号，也不收集身份证。",
  joins: "建团和没口令的入团都在这里审。通过建团后，申请人成为该团团长。",
  runs: "团练里自己报的公里。还没接手表，每天到没到不记在这里。",
  shop: "商城还没接，不收款、不发货。现在看的是各跑团的积分礼品。",
  accounts: "跑团管理员只审核入团，并可以改团里的角色。"
}[section.value] || ""));
const book = ref(null);
const nodeOrigin = ref("");
const guideQueue = ref([]);
const routeQueue = ref([]);
const pacerQueue = ref([]);
const liveQueue = ref(null);
const spots = ref([]);
const cityMode = ref("list");
const distanceChoices = [
  { key: "full", label: "全马" },
  { key: "half", label: "半马" },
  { key: "10k", label: "10公里" },
  { key: "5k", label: "5公里" }
];
const kindChoices = [
  { key: "trail", label: "越野" },
  { key: "ultra", label: "超马" },
  { key: "family", label: "亲子跑" },
  { key: "fun", label: "欢乐跑" }
];
const sections = [
  { id: "edit-base", label: "基本信息" },
  { id: "edit-projects", label: "项目" },
  { id: "edit-signup", label: "报名" },
  { id: "edit-site", label: "官网" },
  { id: "edit-day", label: "比赛日" },
  { id: "edit-guide", label: "规程" },
  { id: "edit-live", label: "直播" }
];
const gradeChoices = [
  { value: "", label: "不标" },
  { value: "A", label: "A 类" },
  { value: "B", label: "B 类" },
  { value: "C", label: "C 类" },
  { value: "TEN", label: "系列赛" }
];
const filters = [
  { label: "待确认", value: "pending" },
  { label: "有变化", value: "changed" },
  { label: "已收入", value: "published" },
  { label: "已忽略", value: "ignored" }
];

function admin(path, options = {}) {
  return api(path, { ...options, adminToken: token.value });
}

function fail(err) {
  saved.value = false;
  message.value = err.message;
}

async function enterDesk(data) {
  if (data) {
    role.value = data.role || "admin";
    selfName.value = data.username || "";
  } else {
    const me = await admin("/admin/session");
    role.value = me.role || "admin";
    selfName.value = me.username || "";
  }
  if (!deskSections.value.some((item) => item.id === section.value)) section.value = role.value === "club" ? "joins" : "races";
  if (section.value === "races") await Promise.all([load(), loadCatalog(), loadSpots()]);
  if (section.value === "users") await loadUsers();
  if (section.value === "joins") await loadJoins();
  if (section.value === "runs") await loadRuns();
  if (section.value === "shop") await loadShop();
  if (section.value === "accounts") await loadAccounts();
  authed.value = true;
}

async function enter() {
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    token.value = data.token;
    password.value = "";
    sessionStorage.setItem("marathon_admin", token.value);
    await enterDesk(data);
  } catch (err) {
    authed.value = false;
    fail(err);
  }
}

async function logout() {
  try {
    await admin("/admin/logout", { method: "POST", body: "{}" });
  } catch (err) {
    /* 会话失效也离开页面 */
  }
  token.value = "";
  role.value = "admin";
  selfName.value = "";
  sessionStorage.removeItem("marathon_admin");
  authed.value = false;
  message.value = "";
  saved.value = false;
}

function rememberSplit() {
  try {
    localStorage.setItem("marathon_admin_split", String(Math.round(split.value)));
  } catch {
    /* 浏览器关掉存储时，这次拖动只在当前页生效。 */
  }
}

function moveSplit(clientX, desk) {
  const bounds = desk.getBoundingClientRect();
  const left = Math.min(Math.max(clientX - bounds.left, 260), bounds.width - 340);
  split.value = (left / bounds.width) * 100;
}

function startSplit(event) {
  if (window.innerWidth < 900) return;
  event.preventDefault();
  const desk = event.currentTarget.parentElement;
  dragging.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  moveSplit(event.clientX, desk);
  function move(next) {
    moveSplit(next.clientX, desk);
  }
  function stop() {
    dragging.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    rememberSplit();
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

function nudgeSplit(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  split.value = Math.min(70, Math.max(22, split.value + (event.key === "ArrowRight" ? 2 : -2)));
  rememberSplit();
}

function pickSection(id) {
  section.value = id;
  message.value = "";
  saved.value = false;
  if (id === "users") loadUsers();
  if (id === "joins") loadJoins();
  if (id === "runs") loadRuns();
  if (id === "shop") loadShop();
  if (id === "accounts") loadAccounts();
}

async function loadUsers() {
  usersReady.value = false;
  try {
    const data = await admin("/admin/users?q=" + encodeURIComponent(userQuery.value));
    users.value = data.users;
    usersReady.value = true;
    if (person.value && !users.value.some((item) => item.id === person.value.user.id)) person.value = null;
  } catch (err) {
    fail(err);
  }
}

const loginPass = ref("");
const confirmDelete = ref(false);

async function openUser(id) {
  message.value = "";
  saved.value = false;
  loginPass.value = "";
  confirmDelete.value = false;
  try {
    person.value = await admin("/admin/users/" + id);
  } catch (err) {
    fail(err);
  }
}

async function setLoginPassword() {
  if (!person.value) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/users/" + person.value.user.id + "/password", {
      method: "PUT",
      body: JSON.stringify({ password: loginPass.value })
    });
    loginPass.value = "";
    person.value = await admin("/admin/users/" + person.value.user.id);
    await loadUsers();
    saved.value = true;
    message.value = "登录密码已更新";
  } catch (err) {
    fail(err);
  }
}

const roleNames = { owner: "团长", manager: "跑团管理", member: "成员", admin: "管理员", club: "跑团管理员" };
const clubRoles = [
  { id: "member", label: "成员" },
  { id: "manager", label: "跑团管理" },
  { id: "owner", label: "团长" }
];

async function setClubRole(club, next) {
  if (!person.value || next === club.role) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/users/" + person.value.user.id + "/clubs/" + club.id, {
      method: "PUT",
      body: JSON.stringify({ role: next })
    });
    person.value = await admin("/admin/users/" + person.value.user.id);
    saved.value = true;
    message.value = "角色已改成" + (roleNames[next] || next);
  } catch (err) {
    fail(err);
    try {
      person.value = await admin("/admin/users/" + person.value.user.id);
    } catch (again) {
      fail(again);
    }
  }
}

async function removeUser() {
  if (!person.value) return;
  const id = person.value.user.id;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/users/" + id, { method: "DELETE" });
    person.value = null;
    confirmDelete.value = false;
    await loadUsers();
    saved.value = true;
    message.value = "账号已删除";
  } catch (err) {
    fail(err);
  }
}

async function setLeader(leader) {
  if (!person.value || leader === person.value.user.leader) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/users/" + person.value.user.id + "/leader", {
      method: "PUT",
      body: JSON.stringify({ leader })
    });
    person.value = await admin("/admin/users/" + person.value.user.id);
    await loadUsers();
    saved.value = true;
    message.value = leader ? "已开启建团资格" : "已关闭建团资格";
  } catch (err) {
    fail(err);
    try {
      person.value = await admin("/admin/users/" + person.value.user.id);
    } catch (again) {
      fail(again);
    }
  }
}

async function loadJoins() {
  joinsReady.value = false;
  try {
    const [requests, applications] = await Promise.all([admin("/admin/club-requests"), admin("/admin/club-applications")]);
    joins.value = requests.requests;
    foundings.value = applications.applications;
    joinsReady.value = true;
  } catch (err) {
    fail(err);
  }
}

async function decideFounding(item, decision) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/club-applications/" + item.id, { method: "POST", body: JSON.stringify({ decision }) });
    saved.value = true;
    message.value = decision === "approve" ? "团已建好，团长可以在手机上管理" : "已拒绝";
    await loadJoins();
  } catch (err) {
    fail(err);
  }
}

async function decideJoin(item, decision) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/club-requests/" + item.id, { method: "POST", body: JSON.stringify({ decision }) });
    saved.value = true;
    message.value = decision === "approve" ? "已通过" : "已拒绝";
    await loadJoins();
  } catch (err) {
    fail(err);
  }
}

async function loadAccounts() {
  try {
    const data = await admin("/admin/accounts");
    accounts.value = data.accounts;
  } catch (err) {
    fail(err);
  }
}

async function createAccount() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/accounts", {
      method: "POST",
      body: JSON.stringify({ username: accountName.value, password: accountPass.value, role: accountRole.value })
    });
    accountName.value = "";
    accountPass.value = "";
    saved.value = true;
    message.value = "账号已添加";
    await loadAccounts();
  } catch (err) {
    fail(err);
  }
}

async function setAccountRole(item, next) {
  if (next === item.role) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/accounts/" + encodeURIComponent(item.username), {
      method: "PUT",
      body: JSON.stringify({ role: next })
    });
    saved.value = true;
    message.value = "角色已改成" + (roleNames[next] || next);
    await loadAccounts();
  } catch (err) {
    fail(err);
    await loadAccounts();
  }
}

async function loadRuns() {
  runsReady.value = false;
  try {
    const data = await admin("/admin/runs");
    runs.value = data.runs;
    runsReady.value = true;
  } catch (err) {
    fail(err);
  }
}

async function loadShop() {
  shopReady.value = false;
  try {
    const data = await admin("/admin/shop");
    gifts.value = data.gifts;
    redemptions.value = data.redemptions;
    shopReady.value = true;
  } catch (err) {
    fail(err);
  }
}

async function changePassword() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/password", {
      method: "POST",
      body: JSON.stringify({ current: currentPassword.value, next: nextPassword.value })
    });
    currentPassword.value = "";
    nextPassword.value = "";
    saved.value = true;
    message.value = "密码已修改";
  } catch (err) {
    fail(err);
  }
}

async function load() {
  const data = await admin("/admin/official?status=" + filter.value + (q.value ? "&q=" + encodeURIComponent(q.value) : ""));
  rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
  ready.value = true;
}

async function setFilter(value) {
  filter.value = value;
  message.value = "";
  saved.value = false;
  try {
    await load();
  } catch (err) {
    fail(err);
  }
}

async function search() {
  message.value = "";
  saved.value = false;
  busy.value = true;
  try {
    const data = await admin("/admin/official/sync", { method: "POST", body: JSON.stringify({ name: q.value }) });
    rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
    ready.value = true;
    saved.value = true;
    message.value = data.changed ? "官网有 " + data.changed + " 场和上次记下的不一样" : "已向官网对过，没有新的变化";
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

async function syncAll() {
  q.value = "";
  filter.value = "pending";
  await search();
}

async function publish(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/publish", { method: "POST", body: "{}" });
    await Promise.all([load(), loadCatalog()]);
  } catch (err) {
    fail(err);
  }
}

async function ignore(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/ignore", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function apply(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/apply", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function saveNodes(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + row.raceId, {
      method: "PUT",
      body: JSON.stringify({
        regStart: row.regStart,
        deadline: row.deadline,
        drawAt: row.drawAt,
        payDeadline: row.payDeadline,
        source: row.nodeSource
      })
    });
    saved.value = true;
    message.value = "报名节点已记下";
  } catch (err) {
    fail(err);
  }
}

function dayOf(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function blankBook(race) {
  return {
    id: race.id,
    name: race.name,
    raceDate: race.raceDate || "",
    province: race.province,
    city: race.city,
    place: race.place,
    distances: [...race.distances],
    kinds: [...race.kinds],
    groups: (race.groups || []).join("、"),
    startAt: race.startAt || "",
    bibAt: race.bibAt || "",
    scale: race.scale || "",
    fee: race.fee || "",
    phone: race.phone || "",
    signupUrl: (race.links.find((item) => item.key === "signup") || {}).url || "",
    drawUrl: (race.links.find((item) => item.key === "draw") || {}).url || "",
    bibUrl: (race.links.find((item) => item.key === "bib") || {}).url || "",
    resultUrl: (race.links.find((item) => item.key === "result") || {}).url || "",
    liveUrl: (race.links.find((item) => item.key === "live") || {}).url || "",
    eventUrl: race.eventUrl || "",
    officialUrl: race.officialUrl || "",
    organizer: race.organizer || "",
    grade: ["A", "B", "C", "TEN"].includes(race.grade) ? race.grade : "",
    source: race.source || "",
    updatedAt: race.updatedAt || "",
    route: race.route || "",
    pickup: race.pickup || "",
    pacers: race.pacers || "",
    guideText: race.guideText || "",
    guide: race.guide || [],
    routeSheets: race.routeSheets || [],
    pacerSheets: race.pacerSheets || [],
    liveSheet: race.liveSheet || null,
    regStart: dayOf(race.regStart),
    deadline: dayOf(race.deadline),
    drawAt: dayOf(race.drawAt),
    payDeadline: dayOf(race.payDeadline),
    deadlineName: race.known && race.deadlineName && race.deadlineName !== "报名" ? race.deadlineName : "",
    nodeSource: ""
  };
}

function nodesKey(row) {
  return [row.regStart, row.deadline, row.drawAt, row.payDeadline, row.deadlineName].join("|");
}

function emptyBook() {
  return {
    id: "",
    name: "",
    raceDate: "",
    province: "",
    city: "",
    place: "",
    distances: [],
    kinds: [],
    groups: "",
    startAt: "",
    bibAt: "",
    scale: "",
    fee: "",
    phone: "",
    signupUrl: "",
    drawUrl: "",
    bibUrl: "",
    resultUrl: "",
    liveUrl: "",
    eventUrl: "",
    officialUrl: "",
    organizer: "",
    grade: "",
    source: "",
    updatedAt: "",
    route: "",
    pickup: "",
    pacers: "",
    guideText: "",
    guide: [],
    routeSheets: [],
    pacerSheets: [],
    liveSheet: null,
    regStart: "",
    deadline: "",
    drawAt: "",
    payDeadline: "",
    deadlineName: "",
    nodeSource: ""
  };
}

function clearQueues() {
  for (const item of guideQueue.value) URL.revokeObjectURL(item.url);
  for (const item of routeQueue.value) URL.revokeObjectURL(item.url);
  for (const item of pacerQueue.value) URL.revokeObjectURL(item.url);
  if (liveQueue.value) URL.revokeObjectURL(liveQueue.value.url);
  guideQueue.value = [];
  routeQueue.value = [];
  pacerQueue.value = [];
  liveQueue.value = null;
}

const provinceOptions = computed(() => {
  const names = regions.map((item) => item.name);
  if (book.value && book.value.province && !names.includes(book.value.province)) names.push(book.value.province);
  return names;
});

const cityOptions = computed(() => {
  if (!book.value) return [];
  const row = regions.find((item) => item.name === book.value.province);
  const names = row ? [...row.cities] : [];
  if (book.value.city && cityMode.value !== "write" && !names.includes(book.value.city)) names.push(book.value.city);
  return names;
});

const placeOptions = computed(() => {
  if (!book.value || !book.value.city) return [];
  const names = spots.value
    .filter((item) => item.city === book.value.city && item.place && item.place !== item.city)
    .map((item) => item.place);
  return [...new Set(names)];
});

function applyCityMode() {
  if (!book.value) return;
  const row = regions.find((item) => item.name === book.value.province);
  const known = row ? row.cities.includes(book.value.city) : false;
  cityMode.value = book.value.city && !known ? "write" : "list";
}

function onProvinceChange() {
  const row = regions.find((item) => item.name === book.value.province);
  const names = row ? row.cities : [];
  if (book.value.city && !names.includes(book.value.city)) {
    book.value.city = "";
    cityMode.value = "list";
  }
}

function pickCity(event) {
  const value = event.target.value;
  if (value === "__write__") {
    cityMode.value = "write";
    if (cityOptions.value.includes(book.value.city)) book.value.city = "";
    return;
  }
  cityMode.value = "list";
  book.value.city = value;
}

function pickPlace(event) {
  if (event.target.value) book.value.place = event.target.value;
}

function toggle(list, key) {
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  else list.push(key);
}

function jump(id) {
  const node = document.getElementById(id);
  if (node) node.scrollIntoView({ block: "start" });
}

function startDraft() {
  clearQueues();
  book.value = emptyBook();
  cityMode.value = "list";
  nodeOrigin.value = nodesKey(book.value);
}

function closeEditor() {
  clearQueues();
  book.value = null;
}

async function loadCatalog() {
  const data = await admin(
    "/admin/races?when=" + catalogWhen.value + (catalogQuery.value ? "&q=" + encodeURIComponent(catalogQuery.value) : "")
  );
  catalog.value = data.races || [];
  catalogReady.value = true;
}

async function loadSpots() {
  const data = await admin("/admin/places");
  spots.value = data.spots || [];
}

async function setCatalogWhen(value) {
  catalogWhen.value = value;
  try {
    await loadCatalog();
  } catch (err) {
    fail(err);
  }
}

async function removeRace(item) {
  if (!window.confirm("从赛历去掉「" + item.name + "」？标过这场的记录也会去掉，之后不会自动加回来。")) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + item.id, { method: "DELETE" });
    if (book.value && book.value.id === item.id) book.value = null;
    saved.value = true;
    message.value = "已从赛历去掉";
    await loadCatalog();
  } catch (err) {
    fail(err);
  }
}

async function openGuide(id) {
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/races/" + id);
    clearQueues();
    book.value = blankBook(data.race);
    nodeOrigin.value = nodesKey(book.value);
    applyCityMode();
  } catch (err) {
    fail(err);
  }
}

function guideBody(row) {
  return {
    name: row.name,
    province: row.province,
    city: row.city,
    place: row.place,
    organizer: row.organizer,
    grade: row.grade,
    distances: row.distances,
    kinds: row.kinds,
    groups: row.groups,
    startAt: row.startAt,
    bibAt: row.bibAt,
    scale: row.scale,
    fee: row.fee,
    phone: row.phone,
    signupUrl: row.signupUrl,
    drawUrl: row.drawUrl,
    bibUrl: row.bibUrl,
    resultUrl: row.resultUrl,
    liveUrl: row.liveUrl,
    eventUrl: row.eventUrl,
    officialUrl: row.officialUrl,
    raceDate: row.raceDate,
    route: row.route,
    pickup: row.pickup,
    pacers: row.pacers,
    guideText: row.guideText
  };
}

async function saveGuide() {
  message.value = "";
  saved.value = false;
  const row = book.value;
  if (!row.name.trim()) return fail(new Error("先写赛事名称"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.raceDate.trim())) return fail(new Error("比赛日写成 2026-11-01 这样"));
  if (!row.city.trim() && !row.place.trim()) return fail(new Error("先写城市或地点"));
  if (!row.distances.length && !row.kinds.length && !row.groups.trim()) return fail(new Error("先标一个项目"));
  const nodesTouched = nodesKey(row) !== nodeOrigin.value || row.nodeSource.trim();
  if (nodesTouched && !row.nodeSource.trim()) return fail(new Error("改了报名时间，要写来源"));
  if (nodesTouched && ![row.regStart, row.deadline, row.drawAt, row.payDeadline].some((item) => item.trim())) {
    return fail(new Error("先填写要记的节点"));
  }
  const creating = !row.id;
  let id = row.id;
  try {
    if (creating) {
      const data = await admin("/admin/races", { method: "POST", body: JSON.stringify(guideBody(row)) });
      id = data.id;
      row.id = id;
      catalogQuery.value = "";
      catalogWhen.value = row.raceDate >= new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) ? "upcoming" : "all";
    } else {
      await admin("/admin/races/" + id + "/guide", { method: "PUT", body: JSON.stringify(guideBody(row)) });
    }
    if (nodesTouched) {
      await admin("/admin/races/" + id, {
        method: "PUT",
        body: JSON.stringify({
          regStart: row.regStart,
          deadline: row.deadline,
          drawAt: row.drawAt,
          payDeadline: row.payDeadline,
          deadlineName: row.deadlineName,
          source: row.nodeSource
        })
      });
    }
    for (const item of guideQueue.value) {
      await adminUpload("/admin/races/" + id + "/sheets?kind=guide", item.file, token.value);
    }
    for (const item of routeQueue.value) {
      await adminUpload("/admin/races/" + id + "/sheets?kind=route", item.file, token.value);
    }
    for (const item of pacerQueue.value) {
      await adminUpload("/admin/races/" + id + "/sheets?kind=pacer", item.file, token.value);
    }
    if (liveQueue.value) {
      await adminUpload("/admin/races/" + id + "/sheets?kind=live", liveQueue.value.file, token.value);
    }
    const opened = await api("/races/" + id);
    clearQueues();
    book.value = blankBook(opened.race);
    nodeOrigin.value = nodesKey(book.value);
    applyCityMode();
    saved.value = true;
    message.value = creating ? "已加入赛历" : nodesTouched ? "这场和报名节点都记下了" : "这场已记下";
    await Promise.all([loadCatalog(), loadSpots()]);
  } catch (err) {
    fail(err);
    if (creating && id) message.value = err.message + "。这场已经在赛历里，改完再保存一次";
  }
}

function onGuideFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !book.value) return;
  if (book.value.guide.length + guideQueue.value.length >= 16) return fail(new Error("规程最多 16 页"));
  if (book.value.id) return sendSheet(file, "guide");
  guideQueue.value = [...guideQueue.value, { file, url: URL.createObjectURL(file) }];
}

function onRouteFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !book.value) return;
  if (book.value.routeSheets.length + routeQueue.value.length >= 4) return fail(new Error("路线图最多 4 张"));
  if (book.value.id) return sendSheet(file, "route");
  routeQueue.value = [...routeQueue.value, { file, url: URL.createObjectURL(file) }];
}

function onPacerFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !book.value) return;
  if (book.value.pacerSheets.length + pacerQueue.value.length >= 8) return fail(new Error("配速员照片最多 8 张"));
  if (book.value.id) return sendSheet(file, "pacer");
  pacerQueue.value = [...pacerQueue.value, { file, url: URL.createObjectURL(file) }];
}

function onLiveFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !book.value) return;
  if (book.value.id) return sendSheet(file, "live");
  if (liveQueue.value) URL.revokeObjectURL(liveQueue.value.url);
  liveQueue.value = { file, url: URL.createObjectURL(file) };
}

function dropQueuedGuide(index) {
  const [item] = guideQueue.value.splice(index, 1);
  if (item) URL.revokeObjectURL(item.url);
}

function dropQueuedRoute(index) {
  const [item] = routeQueue.value.splice(index, 1);
  if (item) URL.revokeObjectURL(item.url);
}

function dropQueuedPacer(index) {
  const [item] = pacerQueue.value.splice(index, 1);
  if (item) URL.revokeObjectURL(item.url);
}

function dropQueuedLive() {
  if (liveQueue.value) URL.revokeObjectURL(liveQueue.value.url);
  liveQueue.value = null;
}

async function refreshSheets() {
  const data = await api("/races/" + book.value.id);
  book.value.guide = data.race.guide || [];
  book.value.routeSheets = data.race.routeSheets || [];
  book.value.pacerSheets = data.race.pacerSheets || [];
  book.value.liveSheet = data.race.liveSheet || null;
}

async function sendSheet(file, kind) {
  message.value = "";
  saved.value = false;
  try {
    await adminUpload("/admin/races/" + book.value.id + "/sheets?kind=" + kind, file, token.value);
    await refreshSheets();
    saved.value = true;
    message.value = kind === "live" ? "直播二维码已换上" : kind === "route" ? "路线图已加上" : kind === "pacer" ? "配速员照片已加上" : "规程加了一页";
  } catch (err) {
    fail(err);
  }
}

async function removeSheet(id) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + book.value.id + "/sheets/" + id, { method: "DELETE" });
    await refreshSheets();
  } catch (err) {
    fail(err);
  }
}

if (token.value) {
  enterDesk()
    .catch(() => {
      token.value = "";
      role.value = "admin";
      sessionStorage.removeItem("marathon_admin");
      authed.value = false;
    });
}
</script>

<style scoped>
.hint { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.warn { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input, .check-form textarea, .check-form select { width: 100%; border: 1px solid #e6e8ec; border-radius: 8px; padding: 8px 10px; background: #fff; font: inherit; }
.check-form input, .check-form select { height: 36px; padding: 0 10px; }
.editor h2 { margin-bottom: 4px; letter-spacing: -0.3px; }
.jumps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.jumps button { height: 28px; padding: 0 10px; border-radius: 999px; background: var(--chip); color: var(--ink); font-size: 13px; }
.section { margin-top: 12px; padding: 14px; border-radius: 14px; background: var(--bg); }
.section h3 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.2px; }
.lead, .pick-label { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.pick-label { margin-top: 12px; }
.pair { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field > span { font-size: 12px; color: var(--muted); }
.guide-form input, .guide-form textarea, .guide-form select { border: 0; border-radius: 10px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
.guide-form input[type="date"], .guide-form input[type="time"], .node-form input[type="date"] { min-height: 40px; }
.picks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.pick { height: 32px; padding: 0 12px; border-radius: 999px; background: #fff; color: var(--ink); font-size: 14px; box-shadow: inset 0 0 0 1px var(--line); }
.pick.on { background: var(--accent); color: #fff; box-shadow: none; }
.file-pick { position: relative; display: flex; align-items: center; justify-content: center; min-height: 64px; margin-top: 12px; border-radius: 12px; border: 1px dashed rgba(0, 122, 255, 0.45); background: #fff; color: var(--accent); font-weight: 600; cursor: pointer; }
.file-pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.add { margin-top: 8px; color: var(--accent); font-weight: 650; background: transparent; }
.race-list { margin-top: 8px; }
.race-row { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); }
.race-row.on { background: rgba(0, 122, 255, 0.06); }
.race-open { flex: 1; min-width: 0; text-align: left; padding: 12px 4px; background: transparent; }
.race-open strong { display: block; color: var(--muted); font-size: 12px; font-weight: 600; }
.race-open span { display: block; font-size: 16px; font-weight: 650; letter-spacing: -0.2px; }
.catalog-open { display: grid; grid-template-columns: 108px minmax(64px, 96px) minmax(0, 1fr); gap: 8px 14px; align-items: center; }
.catalog-open time, .catalog-open em { font-style: normal; color: var(--muted); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.catalog-open span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.remove { flex: none; color: var(--muted); font-size: 13px; padding: 8px 10px; background: transparent; }
.remove:hover { color: var(--red); }
.sheets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.sheet-row { margin-top: 0; }
.sheet-row img { width: 100%; border-radius: 10px; background: #fff; }
.live-preview { max-width: 180px; margin-top: 8px; }
.editor-actions { position: sticky; bottom: 0; display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; background: linear-gradient(rgba(255, 255, 255, 0), #fff 12px); }
.editor-actions .primary, .editor-actions .undo { margin-top: 0; }
.primary { margin-top: 8px; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.pass-form { display: flex; align-items: flex-end; gap: 8px; margin-top: 12px; }
.pass-form label { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 6px; }
.pass-form span { font-size: 12px; color: var(--muted); font-weight: 600; }
.pass-form input { width: 100%; height: 40px; border: 0; border-radius: 10px; padding: 0 12px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); font: inherit; }
.pass-form .save { flex: none; height: 40px; padding: 0 18px; border-radius: 10px; background: var(--accent); color: #fff; font-weight: 650; }
.danger-quiet { margin-top: 12px; height: 36px; padding: 0 14px; border-radius: 10px; background: #fff; color: var(--red); font-weight: 650; box-shadow: inset 0 0 0 1px rgba(255, 59, 48, 0.35); }
.confirm-box { margin-top: 10px; }
.danger { height: 36px; margin-top: 8px; padding: 0 14px; border-radius: 10px; background: #ff3b30; color: #fff; font-weight: 650; }
.confirm-row { display: flex; gap: 10px; align-items: center; }
.confirm-row .danger, .confirm-row .undo { margin-top: 8px; }
.statuses { margin-top: 8px; }
.link { display: inline-block; }
a { color: #007aff; }
.banner { margin: 0 16px; padding: 10px 12px; border-radius: 12px; background: #fff; color: var(--red); font-size: 14px; }
.banner.ok { color: #007aff; }
.admin-shell { min-height: 100vh; background: #f5f5f7; }
.admin-nav { display: flex; gap: 6px; align-items: center; margin: 0; padding: 12px 14px; overflow: auto; background: #1c1c1e; color: #fff; position: sticky; top: 0; z-index: 5; }
.brand { display: flex; align-items: baseline; gap: 10px; margin-right: 4px; flex: none; }
.brand strong { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
.brand .back { color: rgba(255, 255, 255, 0.55); font-size: 13px; }
.admin-nav button { flex: none; height: 32px; padding: 0 12px; border-radius: 999px; background: transparent; color: rgba(255, 255, 255, 0.72); font-weight: 600; }
.admin-nav button.on { background: #fff; color: #1c1c1e; }
.admin-nav .out { margin-left: auto; color: rgba(255, 255, 255, 0.48); font-weight: 500; }
.desk-canvas { min-width: 0; padding: 8px 4px 28px; }
.desk-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 16px 16px 0; }
.desk-head h2 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.7px; }
.desk-head p { margin: 6px 0 0; max-width: 42em; color: var(--muted); font-size: 14px; line-height: 1.45; }
.head-add { height: 40px; margin: 0; padding: 0 16px; border-radius: 12px; white-space: nowrap; }
.line { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.line b { min-width: 0; font-size: 15px; font-weight: 650; }
.line span { flex: 1 1 100%; color: var(--muted); font-size: 13px; }
.actions { display: flex; gap: 8px; flex: none; }
.role-pick { height: 32px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 8px; background: #fff; font: inherit; }
.who-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.who-name i { flex: none; height: 20px; padding: 0 7px; border-radius: 999px; background: rgba(0, 122, 255, 0.12); color: var(--accent); font-size: 11px; font-style: normal; font-weight: 650; line-height: 20px; }
.person { padding-top: 18px; }
.person-head { display: flex; align-items: center; gap: 14px; }
.person-face { width: 56px; height: 56px; flex: none; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 24px; font-weight: 700; background: linear-gradient(145deg, #64d2ff, #007aff); }
.person-head h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
.person-head p { margin: 3px 0 0; color: var(--muted); font-size: 13px; }
.setting { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.setting h3 { margin: 0; }
.setting .lead { margin: 4px 0 0; }
.switch { flex: none; width: 51px; height: 31px; padding: 2px; border-radius: 999px; background: rgba(120, 120, 128, 0.16); }
.switch i { display: block; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.06); transition: transform 0.2s ease; }
.switch.on { background: #34c759; }
.switch.on i { transform: translateX(20px); }
.club-card { margin-top: 10px; padding: 14px 14px 0; border-radius: 12px; background: #fff; }
.club-card > b { display: block; font-size: 16px; font-weight: 650; line-height: 1.35; }
.roles { margin-top: 8px; }
.roles button { display: flex; align-items: center; justify-content: space-between; width: 100%; height: 44px; padding: 0; background: transparent; border-top: 1px solid var(--line); color: var(--ink); font-size: 15px; font-weight: 500; }
.roles button.on { color: var(--accent); font-weight: 650; }
.roles i { display: block; flex: none; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(60, 60, 67, 0.28); }
.roles button:disabled { color: #c7c7cc; }
.roles button:disabled i { box-shadow: inset 0 0 0 1.5px rgba(60, 60, 67, 0.16); }
.roles button.on i { background: var(--accent); box-shadow: none; position: relative; }
.role-note { margin: 0; padding: 4px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.roles button.on i::after { content: ""; position: absolute; left: 7px; top: 4px; width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.fact { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; margin-top: 8px; padding: 12px 14px; border-radius: 12px; background: #fff; }
.fact b { font-size: 15px; font-weight: 650; line-height: 1.35; }
.fact span { color: var(--muted); font-size: 13px; }
.desk { display: flex; flex-direction: column; }
.desk-side { order: 2; }
.desk-official { order: 3; }
.splitter { display: none; order: 1; }
.gate {
  min-height: calc(100vh - 52px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
  padding: 28px 20px 48px;
}
.gate-copy h2 { margin: 8px 0 0; font-size: 40px; font-weight: 700; letter-spacing: -1.1px; line-height: 1; }
.gate-copy p { margin: 12px 0 0; color: var(--muted); font-size: 16px; line-height: 1.5; }
.kicker { margin: 0; color: var(--accent); font-size: 13px; font-weight: 650; letter-spacing: 0.12em; }
.gate-form { display: flex; flex-direction: column; gap: 14px; padding: 22px 20px; border-radius: 20px; background: #fff; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.06); }
.gate-form label span { display: block; margin-bottom: 6px; color: var(--muted); font-size: 13px; font-weight: 600; }
.gate-form input { width: 100%; height: 48px; border: 0; border-radius: 12px; background: var(--bg); padding: 0 14px; font-size: 17px; }
.gate-form .primary { height: 48px; margin-top: 4px; border-radius: 12px; font-size: 17px; font-weight: 650; }
.gate-form .err { margin: 0; }
@media (max-width: 899px) {
  .admin { scroll-padding-top: 84px; }
  .desk-canvas input, .desk-canvas button, .desk-canvas textarea, .desk-side .section { scroll-margin-top: 88px; }
  .brand strong { display: none; }
  .admin-nav { padding: 10px 12px; gap: 2px; }
  .admin-nav button { height: 32px; padding: 0 10px; font-size: 14px; }
  .catalog-open { display: block; }
  .catalog-open time, .catalog-open em { display: inline; }
  .catalog-open time::after { content: " · "; }
  .catalog-open span { white-space: normal; margin-top: 2px; }
  .inline-form { flex-direction: row; align-items: center; }
  .inline-form input { flex: 1; }
  .inline-form .primary { width: auto; margin-top: 0; padding: 0 14px; }
}
@media (min-width: 900px) {
  .gate { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 420px); align-items: center; gap: 64px; padding: 48px 64px 72px; }
  .gate-copy h2 { font-size: 64px; letter-spacing: -1.8px; }
  .admin-shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: stretch; }
  .admin-nav { flex-direction: column; align-items: stretch; gap: 4px; height: 100vh; padding: 28px 14px 18px; overflow: auto; }
  .brand { display: block; padding: 0 12px 22px; margin: 0; }
  .brand strong { display: block; margin-top: 8px; font-size: 26px; letter-spacing: -0.6px; }
  .admin-nav button { text-align: left; height: 40px; border-radius: 10px; }
  .admin-nav button.on { background: rgba(255, 255, 255, 0.14); color: #fff; }
  .admin-nav .out { margin: auto 0 0; }
  .desk-canvas { padding: 28px 36px 48px; }
  .desk-head h2 { font-size: 34px; letter-spacing: -0.9px; }
  .race-list { max-height: calc(100vh - 280px); overflow: auto; }
  .line span { flex: none; text-align: right; }
  .desk.editing { display: grid; grid-template-columns: minmax(260px, var(--split, 46%)) 14px minmax(340px, 1fr); align-items: stretch; gap: 0 0; }
  .splitter { display: flex; align-items: center; justify-content: center; min-height: 160px; cursor: col-resize; touch-action: none; }
  .splitter::before { content: ""; width: 2px; height: 72px; border-radius: 999px; background: rgba(60, 60, 67, 0.22); }
  .splitter:hover::before, .dragging .splitter::before { width: 3px; height: 100%; background: var(--accent); }
  .desk-official { grid-column: 1 / -1; }
  .desk-side { position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow: auto; }
  .inline-form { flex-direction: row; align-items: center; }
  .inline-form input { flex: 1; }
  .inline-form .primary { width: auto; margin-top: 0; padding: 0 16px; white-space: nowrap; }
  .pair { grid-template-columns: 1fr 1fr; }
  .pair .span { grid-column: 1 / -1; }
}
</style>
