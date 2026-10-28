<template>
  <main class="admin">
    <div v-if="!authed" class="login-page">
      <header class="login-brand"><span class="login-logo"><AdminIcon name="races" /></span><router-link to="/">赛历<span>赛事与跑团运营中心</span></router-link></header>
      <div class="gate">
        <section class="gate-copy"><p class="kicker">为热爱奔跑的人，做好每一站</p><h1>下一场出发，<br />从可靠的信息开始。</h1><p>汇集赛事，连接跑团。让报名节点、竞赛规程与参赛记录井然有序。</p><div class="login-features"><span><AdminIcon name="races" />赛事内容运营</span><span><AdminIcon name="clubs" />跑团服务管理</span><span><AdminIcon name="check" />来源与审核</span></div><div class="login-track" aria-hidden="true"><i></i><i></i><i></i><span>START</span></div></section>
        <form class="gate-form" @submit.prevent="enter"><span class="login-eyebrow">运营工作台</span><h2>欢迎回来</h2><p class="login-caption">使用你的后台账号登录</p><label><span>账号</span><input v-model="username" autocomplete="username" placeholder="请输入后台用户名" required /></label><label><span>密码</span><input v-model="password" type="password" autocomplete="current-password" placeholder="请输入登录密码" required /></label><button class="primary" type="submit" :disabled="loginBusy">{{ loginBusy ? '正在登录…' : '登录工作台' }}<AdminIcon name="arrow" /></button><p v-if="message" class="err" role="alert">{{ message }}</p><p class="login-help">账号由平台管理员开通，按角色分配运营权限。</p><router-link class="login-back" to="/">返回赛事前台 <AdminIcon name="arrow" /></router-link></form>
      </div><footer class="login-footer">赛历 · 让每一次出发都有准备</footer>
    </div>
    <AdminShell v-else :sections="deskSections" :active="section" :operator="selfName" :role-label="role === 'club' ? '跑团管理员' : '平台管理员'" :page-title="sectionLabel" :page-lead="sectionLead" @navigate="pickSection" @logout="logout" @refresh="refreshSection">
      <template #header-actions>
        <button v-if="section === 'races'" type="button" class="primary head-add" @click="startDraft"><AdminIcon name="plus" />新建赛事</button>
        <button v-if="section === 'news'" type="button" class="primary head-add" @click="startNews"><AdminIcon name="plus" />发布资讯</button>
        <button v-if="section === 'users'" type="button" class="primary head-add" @click="startUser"><AdminIcon name="plus" />添加跑者</button>
      </template>
      <p v-if="message" class="banner" :class="{ ok: saved }" role="status">{{ message }}</p>
      <AdminDashboard v-if="section === 'overview'" :data="overview" :role="role" :loading="overviewLoading" :error="overviewError" @action="handleOverviewAction" @retry="loadOverview" />
      <div v-if="section === 'races'" class="workspace-tabs" role="tablist" aria-label="赛事工作区"><button v-for="item in raceWorkspaces" :key="item.id" type="button" role="tab" :aria-selected="raceWorkspace === item.id" :class="{ on: raceWorkspace === item.id }" @click="pickRaceWorkspace(item.id)"><AdminIcon :name="item.icon" />{{ item.label }}<span v-if="item.id === 'review' && pendingCount">{{ pendingCount }}</span></button></div>
      <div v-if="section === 'races'" class="desk race-desk" :class="{ editing: deskOpen, dragging }" :style="splitStyle">
      <div v-show="raceWorkspace !== 'official'" class="desk-main">
      <div class="block">
        <div class="panel-heading"><div><h3>{{ raceWorkspace === 'review' ? '赛事内容审核' : '已发布赛事' }}</h3><p>{{ raceWorkspace === 'review' ? '核对赛事来源与报名节点，审核后再进入前台。' : '维护跑者看到的每一场比赛，优先核准临近开赛的信息。' }}</p></div><span class="panel-count">{{ raceWorkspace === 'review' ? botTotal : catalogTotal }} 场</span></div>
        <template v-if="raceTab === 'published'">
          <form class="check-form inline-form" @submit.prevent="submitCatalog">
            <input v-model="catalogQuery" placeholder="搜索赛事名称 / 城市" @input="queueCatalog" />
            <button class="primary" type="submit">筛选</button>
          </form>
          <div v-if="!catalogQuery.trim()" class="statuses">
            <button type="button" class="status" :class="{ on: catalogWhen === 'upcoming' }" @click="setCatalogWhen('upcoming')">即将开赛</button>
            <button type="button" class="status" :class="{ on: catalogWhen === 'all' }" @click="setCatalogWhen('all')">全部</button>
          </div>
          <p v-if="catalogReady" class="hint">{{ catalogTotal }} 场</p>
          <div class="list-columns"><span>赛事 / 地点与项目</span><span>比赛日期</span><span>报名状态</span><span>操作</span></div>
          <div class="race-list">
            <div v-for="item in catalog" :key="item.id" class="race-row catalog-row" :class="{ on: book && book.id === item.id }">
              <button type="button" class="race-open catalog-open" @click="openGuide(item.id)">
                <span class="catalog-identity">{{ item.name }}<small>{{ item.city }}<template v-if="item.distanceLabels?.length"> · {{ item.distanceLabels.join(' / ') }}</template></small></span>
                <time>{{ item.raceDate }}</time>
                <em class="table-state">{{ item.regStatus || '已发布' }}</em>
                <span class="row-open-label">编辑 <AdminIcon name="arrow" /></span>
              </button>
              <button type="button" class="remove" :aria-label="'删除 ' + item.name" @click="removeRace(item)">删除</button>
            </div>
          </div>
          <p v-if="catalogReady && !catalog.length" class="empty">{{ catalogQuery.trim() ? "没有找到这场赛事" : "这个范围还没有场。" }}</p>
          <Pager :page="catalogPage" :pages="catalogPages" @update:page="turnCatalog" />
        </template>
        <template v-else>
          <div class="statuses">
            <button type="button" class="status" :class="{ on: botStatus === 'pending' }" @click="setBotStatus('pending')">待审</button>
            <button type="button" class="status" :class="{ on: botStatus === 'returned' }" @click="setBotStatus('returned')">已打回</button>
          </div>
          <p v-if="botReady" class="hint">{{ botTotal }} 场</p>
          <div class="list-columns review-columns"><span>待核对赛事</span><span>比赛日期</span><span>地点</span><span>操作</span></div>
          <div class="race-list">
            <div v-for="item in botRows" :key="item.id" class="race-row review-row" :class="{ on: book && book.submissionId === item.id }">
              <button type="button" class="race-open catalog-open" @click="openReview(item)">
                <span class="catalog-identity">{{ item.name }}<small>{{ item.status === 'returned' ? '已打回 · 等待补充' : '待核实 · 未发布到前台' }}</small></span>
                <time>{{ item.raceDate }}</time>
                <em>{{ item.city }}</em>
              </button>
              <button class="row-review" type="button" @click.stop="openReview(item)">{{ item.status === 'pending' ? '审核' : '查看' }} <AdminIcon name="arrow" /></button>
            </div>
          </div>
          <p v-if="botReady && !botRows.length" class="empty">{{ botStatus === "pending" ? "还没有待审的比赛" : "还没有打回的比赛" }}</p>
          <Pager :page="botPage" :pages="botPages" @update:page="turnBot" />
        </template>
      </div>
      </div>
      <div v-show="raceWorkspace === 'official'" class="desk-official">
      <div class="block">
        <div class="panel-heading"><div><h3>官网赛事同步</h3><p>核对中国马拉松官网的新赛事与资料变更，再决定是否收入赛历。</p></div><span class="source-label">中国马拉松官网</span></div>
        <details class="source-explainer"><summary>同步范围与数据保护规则</summary><p>每一届独立存储，赛事网站只采用当届官方提供的地址。同步会标记名称、日期、主办与网站的变化；已记录的报名截止时间保留，报名节点仍需填写可核对的来源。</p></details>
        <form class="check-form inline-form" @submit.prevent="search">
          <input v-model="q" placeholder="搜名称或城市，例如璧山" @input="queueOfficial" />
          <button class="primary" type="submit">查官网</button>
        </form>
        <button v-if="!q.trim()" class="undo" type="button" @click="syncAll">拉取即将开赛的场</button>
        <div v-if="!q.trim()" class="statuses">
          <button v-for="item in filters" :key="item.value" type="button" class="status" :class="{ on: filter === item.value }" @click="setFilter(item.value)">
            {{ item.label }}
          </button>
        </div>
        <p v-if="busy" class="hint">正在向官网要赛历。</p>
      </div>
      <template v-for="row in rows" :key="row.officialId">
      <div v-if="officialFocus !== row.officialId" class="race-row">
        <button type="button" class="race-open" @click="officialFocus = row.officialId">
          <time>{{ row.raceDate }}</time>
          <em>{{ row.city }}</em>
          <span>{{ row.name }}<small>{{ row.gradeLabel || '待核实' }}<template v-if="row.diffNote"> · 资料有变化</template></small></span>
        <AdminIcon name="arrow" />
        </button>
      </div>
      <div v-else class="block">
        <button type="button" class="text-btn" @click="officialFocus = ''">收起详情</button>
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
      </template>
      <p v-if="ready" class="hint">{{ officialTotal }} 场</p>
      <p v-if="ready && !rows.length" class="empty">{{ q.trim() ? "没有找到这场赛事" : "这个范围还没有场。" }}</p>
      <Pager :page="officialPage" :pages="officialPages" @update:page="turnOfficial" />
      </div>
      <div v-if="book" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
      <aside v-if="book" class="desk-side">
      <div class="block editor">
        <template v-if="book">
          <div class="edit-bar">
            <header class="edit-head">
              <div class="edit-id">
                <p class="edit-kicker">{{ book.submissionId ? (book.status === "returned" ? "已打回" : "待审") : book.id ? "编辑赛事" : "新建赛事" }}</p>
                <h2>{{ book.name.trim() || "未填写名称" }}</h2>
                <p v-if="editMeta.length" class="edit-meta"><span v-for="part in editMeta" :key="part">{{ part }}</span></p>
              </div>
              <div class="edit-tools">
                <button v-if="book.id || book.submissionId" class="text-btn" type="button" @click="closeEditor">收起</button>
                <router-link v-if="book.id || book.raceId" class="text-btn" :to="'/races/' + (book.id || book.raceId)">查看赛历</router-link>
                <button v-if="!book.id && !book.submissionId" class="text-btn" type="button" @click="closeEditor">取消</button>
                <button v-if="book.submissionId && book.status === 'pending'" class="save" type="button" @click="publishBot(book)">通过</button>
                <button class="save" type="submit" form="race-editor">保存</button>
              </div>
            </header>
            <nav class="edit-nav" role="tablist" aria-label="赛事资料">
              <button v-for="item in sections" :key="item.id" type="button" role="tab" :aria-selected="editTab === item.id" :class="{ on: editTab === item.id }" @click="editTab = item.id">{{ item.label }}</button>
            </nav>
          </div>
          <p v-if="book.submissionId && book.note" class="warn">打回原因：{{ book.note }}</p>
          <form v-if="book.submissionId && book.status === 'pending'" class="check-form return-form" @submit.prevent="returnBot(book)">
            <input v-model="book.returnNote" maxlength="200" placeholder="打回原因" />
            <button class="undo" type="submit">打回</button>
          </form>
          <form id="race-editor" class="check-form guide-form" @submit.prevent="saveGuide">
            <section v-show="editTab === 'base'" class="section">
              <h3>基本信息</h3>
              <div class="pair">
                <label class="field span"><span>赛事名称</span><input v-model="book.name" placeholder="例如 2026 普洱墨江半程马拉松" /></label>
                <label class="field"><span>比赛日期</span><input v-model="book.raceDate" type="date" /></label>
                <label class="field"><span>起跑时间</span><input v-model="book.startAt" type="time" /></label>
                <label class="field"><span>省份</span>
                  <select v-model="book.province" @change="onProvinceChange">
                    <option value="">选择省份</option>
                    <option v-for="name in provinceOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </label>
                <label class="field"><span>城市</span>
                  <select v-model="book.city" @change="onCityChange">
                    <option value="">选择城市</option>
                    <option v-for="name in cityOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </label>
                <label class="field"><span>区县</span>
                  <select v-model="book.district">
                    <option value="">选择区县</option>
                    <option v-for="name in districtOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </label>
                <label class="field span"><span>举办地点</span><input v-model="book.place" list="place-options" placeholder="起点、场馆或景区" /><datalist id="place-options"><option v-for="name in placeOptions" :key="name" :value="name" /></datalist></label>
                <label class="field"><span>主办单位</span><input v-model="book.organizer" placeholder="组委会或主办机构" /></label>
                <label class="field"><span>认证类别</span>
                  <select v-model="book.grade">
                    <option v-for="item in gradeChoices" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
              </div>
            </section>
            <section v-show="editTab === 'projects'" class="section">
              <h3>项目</h3>
              <p class="pick-label">计时项目</p>
              <div class="picks">
                <button v-for="item in distanceChoices" :key="item.key" type="button" class="pick" :class="{ on: book.distances.includes(item.key) }" :aria-pressed="book.distances.includes(item.key)" @click="toggle(book.distances, item.key)">{{ item.label }}</button>
              </div>
              <p class="pick-label">赛事类型</p>
              <div class="picks">
                <button v-for="item in kindChoices" :key="item.key" type="button" class="pick" :class="{ on: book.kinds.includes(item.key) }" :aria-pressed="book.kinds.includes(item.key)" @click="toggle(book.kinds, item.key)">{{ item.label }}</button>
              </div>
              <p class="note">越野和超马可以不选计时项目，把 30 公里、50 公里写在其他组别。</p>
              <p class="pick-label">举办</p>
              <div class="picks">
                <button type="button" class="pick" :class="{ on: book.meet !== 'online' }" :aria-pressed="book.meet !== 'online'" @click="book.meet = 'offline'">线下</button>
                <button type="button" class="pick" :class="{ on: book.meet === 'online' }" :aria-pressed="book.meet === 'online'" @click="book.meet = 'online'">线上</button>
              </div>
              <div class="pair">
                <label class="field span"><span>其他组别</span><input v-model="book.groups" placeholder="15公里、30公里、50公里" /><small>多项以顿号分隔，最多 8 项。</small></label>
                <label class="field"><span>规模</span><input v-model="book.scale" placeholder="例如全程 35000 人" /></label>
                <label class="field"><span>报名费用</span><input v-model="book.fee" placeholder="例如全程 200 元，半程 150 元" /></label>
                <label class="field span"><span>咨询电话</span><input v-model="book.phone" placeholder="仅填写号码" /></label>
              </div>
            </section>
            <section v-show="editTab === 'signup'" class="section">
              <h3>报名与查询</h3>
              <p v-if="book.submissionId" class="note">改的是这场待审。保存后仍停在待审，点通过才写入赛历。日期和链接留空时，通过不会盖掉赛历里已经记下的。</p>
              <p v-else class="note">日期留空则保持原值。新建赛事未填写时，赛历显示「报名时间未公布」。修改日期须填写本次来源。</p>
              <h4 class="group-title">时间节点</h4>
              <div class="pair">
                <label class="field"><span>报名开始</span><input v-model="book.regStart" type="date" /></label>
                <label class="field"><span>报名截止</span><input v-model="book.deadline" type="date" /></label>
                <label class="field"><span>截止说明</span><input v-model="book.deadlineName" placeholder="报名截止" /></label>
                <label class="field"><span>中签公布</span><input v-model="book.drawAt" type="date" /></label>
                <label class="field"><span>缴费截止</span><input v-model="book.payDeadline" type="date" /></label>
                <label class="field"><span>号码公布</span><input v-model="book.bibAt" type="date" /></label>
                <label class="field span"><span>本次来源</span><input v-model="book.nodeSource" placeholder="规程或官网，并注明所见日期" /></label>
              </div>
              <h4 class="group-title">查询入口</h4>
              <div class="pair">
                <label class="field span"><span>报名入口</span><input v-model="book.signupUrl" inputmode="url" placeholder="https://" /></label>
                <label class="field"><span>中签查询</span><input v-model="book.drawUrl" inputmode="url" placeholder="https://" /></label>
                <label class="field"><span>号码查询</span><input v-model="book.bibUrl" inputmode="url" placeholder="https://" /></label>
                <label class="field span"><span>成绩与证书</span><input v-model="book.resultUrl" inputmode="url" placeholder="https://" /></label>
              </div>
              <h4 class="group-title">历年中签</h4>
              <p class="note">按公布的报名人数和名额填写，并写上来源。页面用这两个数算比例。没有录入就不显示。</p>
              <p v-if="!book.id && !book.submissionId" class="note">先保存这场比赛，再记历年中签。</p>
              <template v-else>
                <div v-for="item in draws" :key="item.id" class="line">
                  <b>{{ item.label }} · 报名 {{ item.applicants }} · 名额 {{ item.quota }} · {{ item.rateText }}</b>
                  <span>{{ item.source }}</span>
                  <button class="undo" type="button" @click="removeDraw(item)">删除</button>
                </div>
                <div class="check-form">
                  <input v-model="drawLabel" maxlength="20" placeholder="届次，例如 2025" />
                  <input v-model.number="drawApplicants" type="number" min="1" placeholder="报名人数" />
                  <input v-model.number="drawQuota" type="number" min="1" placeholder="名额" />
                  <input v-model="drawSource" maxlength="80" placeholder="来源" />
                  <button class="primary" type="button" @click="createDraw">记下这一届</button>
                </div>
              </template>
            </section>
            <section v-show="editTab === 'site'" class="section">
              <h3>官网</h3>
              <p class="note">留空则保留已有链接。</p>
              <div class="pair">
                <label class="field span"><span>赛事官网</span><input v-model="book.eventUrl" inputmode="url" placeholder="https://" /></label>
                <label class="field span"><span>中国马拉松官网</span><input v-model="book.officialUrl" inputmode="url" placeholder="https://" /></label>
              </div>
            </section>
            <section v-show="editTab === 'day'" class="section">
              <h3>比赛日安排</h3>
              <p v-if="book.submissionId" class="note">路线图和配速表在通过后再传。</p>
              <div class="pair">
                <label class="field span"><span>路线说明</span><textarea v-model="book.route" rows="3" placeholder="例如永安湖环湖，起点在北门"></textarea></label>
              </div>
              <div v-if="!book.submissionId" class="media">
                <div class="media-head"><span>路线图</span><b>{{ book.routeSheets.length + routeQueue.length }}/4</b></div>
                <div v-if="book.routeSheets.length || routeQueue.length" class="sheets">
                  <div v-for="sheet in book.routeSheets" :key="sheet.id" class="sheet-row">
                    <img :src="raceSheetSrc(sheet.id)" alt="路线图" />
                    <button class="undo" type="button" @click="removeSheet(sheet.id)">移除</button>
                  </div>
                  <div v-for="(item, index) in routeQueue" :key="item.url" class="sheet-row">
                    <img :src="item.url" alt="待上传的路线图" />
                    <button class="undo" type="button" @click="dropQueuedRoute(index)">取消</button>
                  </div>
                </div>
                <label v-if="book.routeSheets.length + routeQueue.length < 4" class="file-pick">添加路线图<input type="file" accept="image/jpeg,image/png,image/webp" @change="onRouteFile" /></label>
              </div>
              <div class="pair">
                <label class="field span"><span>领物须知</span><textarea v-model="book.pickup" rows="3" placeholder="例如赛前一天 10:00–20:00，按号段领取"></textarea></label>
                <label class="field span"><span>配速安排</span><textarea v-model="book.pacers" rows="3" placeholder="例如全马 4 小时至 6 小时，每 15 分钟一档"></textarea></label>
              </div>
              <div v-if="!book.submissionId" class="media">
                <div class="media-head"><span>配速资料</span><b>{{ book.pacerSheets.length + pacerQueue.length }}/8</b></div>
                <div v-if="book.pacerSheets.length || pacerQueue.length" class="sheets">
                  <div v-for="sheet in book.pacerSheets" :key="sheet.id" class="sheet-row">
                    <img :src="raceSheetSrc(sheet.id)" alt="配速资料" />
                    <button class="undo" type="button" @click="removeSheet(sheet.id)">移除</button>
                  </div>
                  <div v-for="(item, index) in pacerQueue" :key="item.url" class="sheet-row">
                    <img :src="item.url" alt="待上传的配速资料" />
                    <button class="undo" type="button" @click="dropQueuedPacer(index)">取消</button>
                  </div>
                </div>
                <label v-if="book.pacerSheets.length + pacerQueue.length < 8" class="file-pick">添加配速表或照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="onPacerFile" /></label>
              </div>
            </section>
            <section v-show="editTab === 'guide'" class="section">
              <h3>竞赛规程</h3>
              <p v-if="book.submissionId" class="note">规程原页在通过后再传。正文可以现在改。</p>
              <p class="note">选手先阅读正文，再查看原页。奖金、关门时间与参赛资格以组委会原文为准。</p>
              <label class="field"><span>规程正文</span><textarea v-model="book.guideText" rows="8" placeholder="可用 Markdown。# 一级标题，## 二级，### 三级，#### 四级"></textarea></label>
              <div v-if="!book.submissionId" class="media">
                <div class="media-head"><span>规程原页</span><b>{{ book.guide.length + guideQueue.length }}/16</b></div>
                <div v-if="book.guide.length || guideQueue.length" class="sheets">
                  <div v-for="sheet in book.guide" :key="sheet.id" class="sheet-row">
                    <img :src="raceSheetSrc(sheet.id)" alt="规程原页" />
                    <button class="undo" type="button" @click="removeSheet(sheet.id)">移除</button>
                  </div>
                  <div v-for="(item, index) in guideQueue" :key="item.url" class="sheet-row">
                    <img :src="item.url" alt="待上传的规程原页" />
                    <button class="undo" type="button" @click="dropQueuedGuide(index)">取消</button>
                  </div>
                </div>
                <label v-if="book.guide.length + guideQueue.length < 16" class="file-pick">添加原页<input type="file" accept="image/jpeg,image/png,image/webp" @change="onGuideFile" /></label>
              </div>
            </section>
            <section v-show="editTab === 'live'" class="section">
              <h3>直播</h3>
              <p v-if="book.submissionId" class="note">直播二维码在通过后再传。直播地址可以现在改。</p>
              <p class="note">再次上传将替换当前二维码。</p>
              <label class="field"><span>直播地址</span><input v-model="book.liveUrl" inputmode="url" placeholder="https://" /></label>
              <div v-if="!book.submissionId" class="media">
                <div class="media-head"><span>直播二维码</span><b>{{ book.liveSheet || liveQueue ? 1 : 0 }}/1</b></div>
                <div v-if="book.liveSheet" class="sheet-row live-preview">
                  <img :src="raceSheetSrc(book.liveSheet.id)" alt="直播二维码" />
                  <button class="undo" type="button" @click="removeSheet(book.liveSheet.id)">移除</button>
                </div>
                <div v-if="liveQueue" class="sheet-row live-preview">
                  <img :src="liveQueue.url" alt="待上传的直播二维码" />
                  <button class="undo" type="button" @click="dropQueuedLive">取消</button>
                </div>
                <label class="file-pick">{{ book.liveSheet || liveQueue ? "替换二维码" : "添加二维码" }}<input type="file" accept="image/jpeg,image/png,image/webp" @change="onLiveFile" /></label>
              </div>
            </section>
            <section v-show="editTab === 'prize'" class="section">
              <h3>奖项</h3>
              <p class="note">按规程填写，并写上来源。没有往届名次成绩时，页面不估算概率。</p>
              <p v-if="!book.id && !book.submissionId" class="note">先保存这场比赛，再添加奖项。</p>
              <template v-else>
                <div v-for="item in prizes" :key="item.id" class="line">
                  <b>{{ item.distanceLabel }} · {{ item.title }}</b>
                  <span>{{ item.amountText }} · {{ item.source }}</span>
                  <button class="undo" type="button" @click="removePrize(item)">删除</button>
                </div>
                <div class="check-form">
                  <select v-model="prizeDistance">
                    <option value="full">全马</option>
                    <option value="half">半马</option>
                    <option value="10k">10公里</option>
                    <option value="5k">5公里</option>
                  </select>
                  <select v-model="prizeKind">
                    <option value="place">名次</option>
                    <option value="age">年龄组</option>
                    <option value="local">本地籍</option>
                    <option value="break">破时</option>
                    <option value="club">跑团</option>
                  </select>
                  <select v-model="prizeGender">
                    <option value="">性别不限</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                  <input v-model.number="prizeAgeMin" type="number" min="0" placeholder="年龄起，0 表示不限" />
                  <input v-model.number="prizeAgeMax" type="number" min="0" placeholder="年龄止，0 表示不限" />
                  <select v-model="prizeProvince">
                    <option value="">省份，仅本地籍</option>
                    <option v-for="item in regions" :key="item.name" :value="item.name">{{ item.name }}</option>
                  </select>
                  <input v-model.number="prizePlace" type="number" min="0" placeholder="前几名，破时填 0" />
                  <input v-model="prizeBreak" placeholder="破时成绩 3:00:00" />
                  <input v-model.number="prizeAmount" type="number" min="0" placeholder="税前金额，0 表示非现金" />
                  <input v-model.number="prizeTax" type="number" min="0" placeholder="税率，例如 20" />
                  <label class="check-line"><input v-model="prizeStack" type="checkbox" /> 可与其他奖叠加</label>
                  <input v-model="prizeSource" maxlength="80" placeholder="奖项来源" />
                  <input v-model="prizeCutoff" placeholder="往届第 N 名 3:40:00，可空" />
                  <input v-model="prizeCutoffSource" maxlength="80" placeholder="往届成绩来源" />
                  <input v-model="prizeNote" maxlength="40" placeholder="说明" />
                  <button class="primary" type="button" @click="createPrize">添加奖项</button>
                </div>
              </template>
            </section>
            <section v-show="editTab === 'news'" class="section">
              <h3>资讯</h3>
              <p class="note">一条资讯只绑这场。写下标题、发布时间和来源，正文用 Markdown 贴进来。</p>
              <p v-if="!raceNewsId" class="note">这场还没进赛历，保存或通过后再挂资讯。</p>
              <template v-else>
                <div v-for="item in raceNews" :key="'race-news-' + item.id" class="line" :class="{ on: raceNewsDraft.id === item.id }">
                  <button type="button" class="text-btn" @click="editRaceNews(item)">{{ item.title }}</button>
                  <span>{{ item.publishedAt }} · {{ item.source }}</span>
                  <button class="undo" type="button" @click="removeRaceNews(item)">删除</button>
                </div>
                <p v-if="!raceNews.length" class="note">这场还没有已发布的资讯。</p>
                <p v-if="raceNewsWaiting.length" class="note">还有上传的资讯停在待审，通过后才出现在上面。</p>
                <div v-for="item in raceNewsWaiting" :key="'race-news-wait-' + item.id" class="line">
                  <b>{{ item.title }}</b>
                  <span>{{ item.status === "returned" ? "已打回" : "待审" }} · {{ item.publishedAt }} · {{ item.source }}</span>
                </div>
                <div class="check-form">
                  <label class="field"><span>标题</span><input v-model="raceNewsDraft.title" maxlength="80" @keydown.enter.prevent /></label>
                  <label class="field"><span>发布时间</span><input v-model="raceNewsDraft.publishedAt" type="date" @keydown.enter.prevent /></label>
                  <label class="field"><span>来源</span><input v-model="raceNewsDraft.source" maxlength="40" placeholder="例如 组委会" @keydown.enter.prevent /></label>
                  <label class="field"><span>正文</span><textarea v-model="raceNewsDraft.body" maxlength="20000" rows="12" placeholder="可用 Markdown。# 一级标题，## 二级，### 三级，#### 四级"></textarea></label>
                  <button class="primary" type="button" @click="saveRaceNews">{{ raceNewsDraft.id ? "保存这条" : "挂上这条" }}</button>
                  <button v-if="raceNewsDraft.id" class="undo" type="button" @click="raceNewsDraft = blankRaceNews()">取消</button>
                </div>
              </template>
            </section>
          </form>
        </template>
      </div>
      </aside>
      </div>
      <div v-if="section === 'news'" class="desk news-desk" :class="{ editing: !!(newsItem || newsReview), dragging }" :style="splitStyle">
        <div class="desk-main">
          <div class="block">
            <div class="statuses">
              <button type="button" class="status" :class="{ on: newsTab === 'published' }" @click="showNewsPublished">已发布</button>
              <button type="button" class="status" :class="{ on: newsTab === 'review' }" @click="showNewsReview">待审 {{ newsPendingCount }}</button>
            </div>
            <template v-if="newsTab === 'published'">
              <form class="check-form inline-form" @submit.prevent="submitNews">
                <input v-model="newsQuery" placeholder="搜标题或赛事" @input="queueNews" />
                <button class="primary" type="submit">筛选</button>
              </form>
              <p v-if="newsReady" class="hint">{{ newsTotal }} 条</p>
              <div class="race-list">
                <div v-for="item in newsRows" :key="item.id" class="race-row" :class="{ on: newsItem && newsItem.id === item.id }">
                  <button type="button" class="race-open catalog-open news-open" @click="openNews(item)">
                    <time>{{ item.publishedAt }}</time>
                    <em>{{ item.city }}</em>
                    <span>{{ item.title }}<strong>{{ item.raceName }}</strong></span>
                  </button>
                </div>
              </div>
              <p v-if="newsReady && !newsRows.length" class="empty">{{ newsQuery.trim() ? "没有找到这条资讯" : "还没有发布的资讯" }}</p>
              <Pager :page="newsPage" :pages="newsPages" @update:page="turnNews" />
            </template>
            <template v-else>
              <div class="statuses">
                <button type="button" class="status" :class="{ on: newsStatus === 'pending' }" @click="setNewsStatus('pending')">待审</button>
                <button type="button" class="status" :class="{ on: newsStatus === 'returned' }" @click="setNewsStatus('returned')">已打回</button>
              </div>
              <p v-if="newsReady" class="hint">{{ newsTotal }} 条</p>
              <div class="race-list">
                <div v-for="item in newsRows" :key="item.id" class="race-row" :class="{ on: newsReview && newsReview.id === item.id }">
                  <button type="button" class="race-open catalog-open news-open" @click="openNewsReview(item)">
                    <time>{{ item.publishedAt }}</time>
                    <em>{{ item.city }}</em>
                    <span>{{ item.title }}<strong>{{ item.raceName }}</strong></span>
                  </button>
                  <button v-if="item.status === 'pending'" class="primary row-pass" type="button" @click.stop="publishNews(item)">通过</button>
                </div>
              </div>
              <p v-if="newsReady && !newsRows.length" class="empty">{{ newsStatus === "pending" ? "还没有待审的资讯" : "还没有打回的资讯" }}</p>
              <Pager :page="newsPage" :pages="newsPages" @update:page="turnNews" />
            </template>
          </div>
        </div>
        <div v-if="newsItem || newsReview" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
        <aside v-if="newsReview" class="desk-side">
          <div class="block editor">
            <div class="edit-bar">
              <header class="edit-head">
                <div class="edit-id">
                  <p class="edit-kicker">{{ newsReview.status === "returned" ? "已打回" : "待审" }}</p>
                  <h2>{{ newsReview.title }}</h2>
                  <p class="edit-meta">
                    <span>{{ newsReview.publishedAt }}</span>
                    <span>{{ newsReview.city }}</span>
                  </p>
                </div>
                <div class="edit-tools">
                  <button class="text-btn" type="button" @click="newsReview = null">收起</button>
                  <button v-if="newsReview.status === 'pending'" class="save" type="button" @click="publishNews(newsReview)">通过</button>
                </div>
              </header>
            </div>
            <p v-if="newsReview.note" class="warn">打回原因：{{ newsReview.note }}</p>
            <p v-for="(line, index) in newsReview.lines" :key="'news-line-' + index" class="hint">{{ line }}</p>
            <pre v-if="newsReview.body" class="md-raw">{{ newsReview.body }}</pre>
            <form v-if="newsReview.status === 'pending'" class="check-form" @submit.prevent="returnNews(newsReview)">
              <input v-model="newsReview.returnNote" maxlength="200" placeholder="打回原因" />
              <button class="undo" type="submit">打回</button>
            </form>
          </div>
        </aside>
        <aside v-else-if="newsItem" class="desk-side">
          <div class="block editor">
            <div class="edit-bar">
              <header class="edit-head">
                <div class="edit-id">
                  <p class="edit-kicker">{{ newsItem.id ? "编辑资讯" : "发布资讯" }}</p>
                  <h2>{{ newsItem.title.trim() || "未填写标题" }}</h2>
                  <p v-if="newsItem.raceName" class="edit-meta"><span>{{ newsItem.raceName }}</span></p>
                </div>
                <div class="edit-tools">
                  <button class="text-btn" type="button" @click="closeNews">收起</button>
                  <button class="save" type="submit" form="news-editor">{{ newsItem.id ? "保存" : "发布" }}</button>
                </div>
              </header>
            </div>
            <form id="news-editor" class="check-form guide-form" @submit.prevent="saveNews">
              <label class="field"><span>赛事</span><input v-model="newsRaceQuery" placeholder="搜名称或城市" @input="queueNewsRaces" /></label>
              <div v-if="newsRaceHits.length" class="race-list">
                <button v-for="race in newsRaceHits" :key="race.id" type="button" class="race-open" @click="pickNewsRace(race)">
                  <span>{{ race.name }}</span>
                  <strong>{{ race.raceDate }} · {{ race.city }}</strong>
                </button>
              </div>
              <p v-if="newsItem.raceId" class="hint">已选 {{ newsItem.raceName }}</p>
              <label class="field"><span>标题</span><input v-model="newsItem.title" maxlength="80" /></label>
              <label class="field"><span>发布时间</span><input v-model="newsItem.publishedAt" type="date" /></label>
              <label class="field"><span>来源</span><input v-model="newsItem.source" maxlength="40" placeholder="例如 组委会" /></label>
              <label class="field"><span>正文</span><textarea v-model="newsItem.body" maxlength="20000" rows="12" placeholder="可用 Markdown。# 一级标题，## 二级，### 三级，#### 四级"></textarea></label>
              <button v-if="newsItem.id && !newsDelete" class="undo" type="button" @click="newsDelete = true">删除</button>
              <p v-if="newsDelete" class="warn">确认删掉这条资讯？</p>
              <button v-if="newsDelete" class="undo" type="button" @click="removeNews">确认删除</button>
            </form>
          </div>
        </aside>
      </div>
      <div v-if="section === 'users'" class="desk users-desk" :class="{ editing: !!(person || adding), dragging }" :style="splitStyle">
        <div class="desk-main">
          <div class="block">
            <div class="panel-heading"><div><h3>跑者档案</h3><p>按昵称找到跑者，查看赛事计划、成绩与团内身份。</p></div><span class="panel-count">{{ userTotal }} 人</span></div>
            <form class="check-form inline-form" @submit.prevent="submitUsers">
              <input v-model="userQuery" placeholder="搜昵称" @input="queueUsers" />
              <button class="primary" type="submit">筛选</button>
            </form>
            <p v-if="usersReady" class="hint">{{ userTotal }} 人</p>
            <div class="race-list">
              <div v-for="item in users" :key="item.id" class="race-row user-row" :class="{ on: person && person.user.id === item.id }">
                <button type="button" class="race-open" @click="openUser(item.id, 'view')">
                  <span class="who-name">{{ item.nickname }}<i v-if="item.leader">建团资格</i></span>
                  <strong>{{ item.createdAt }} · {{ item.clubs }} 个团 · {{ item.plans }} 场<span v-if="item.hasPassword"> · 可登录</span></strong>
                </button>
                <div v-if="pendingDelete === item.id" class="row-confirm">
                  <p>确认删除该账号？此操作不可恢复。若该用户仍担任跑团团长，须先完成团长移交。</p>
                  <button class="danger" type="button" @click="removeUser(item)">确认删除</button>
                  <button class="undo" type="button" @click="pendingDelete = 0">取消</button>
                </div>
                <div v-else class="row-actions">
                  <button class="row-edit" type="button" :aria-label="'编辑 ' + item.nickname" @click="openUser(item.id, 'edit')">编辑</button>
                  <button class="remove" type="button" :aria-label="'删除 ' + item.nickname" @click="pendingDelete = item.id">删除</button>
                </div>
              </div>
            </div>
            <p v-if="usersReady && !users.length" class="empty">没有符合条件的用户。</p>
            <Pager :page="userPage" :pages="userPages" @update:page="turnUsers" />
          </div>
        </div>
        <div v-if="person || adding" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
        <aside v-if="adding || person" class="desk-side">
          <div v-if="adding" class="block person">
            <p class="edit-kicker">添加用户</p>
            <h2>新账号</h2>
            <p class="lead">填写昵称和登录密码。创建后，该用户可使用此昵称与密码登录。不收集手机号，也不收集身份证。</p>
            <form class="user-form" @submit.prevent="createPerson">
              <label class="field"><span>昵称</span><input v-model="newName" maxlength="20" autocomplete="off" placeholder="1–20 个字" /></label>
              <label class="field">
                <span>登录密码</span>
                <input v-model="newPass" type="password" autocomplete="new-password" />
                <small>8 到 128 位</small>
              </label>
              <div class="form-actions">
                <button class="save" type="submit">创建</button>
                <button class="text-btn" type="button" @click="cancelUser">取消</button>
              </div>
            </form>
          </div>
          <div v-else class="block person">
            <template v-if="person">
              <div class="person-head">
                <div class="person-face" aria-hidden="true">{{ person.user.nickname.slice(0, 1) }}</div>
                <div class="person-id">
                  <p class="edit-kicker">{{ personMode === "edit" ? "编辑账号" : "用户详情" }}</p>
                  <h2>{{ person.user.nickname }}</h2>
                  <p>{{ person.user.createdAt }} 起用这个昵称</p>
                </div>
                <button v-if="personMode === 'view'" class="text-btn" type="button" @click="personMode = 'edit'">编辑</button>
                <button v-else class="text-btn" type="button" @click="personMode = 'view'">查看详情</button>
              </div>
              <template v-if="personMode === 'edit'">
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
                      <input v-model="loginPass" type="password" autocomplete="new-password" />
                    </label>
                    <button class="save" type="submit">保存</button>
                    <small>8 到 128 位</small>
                  </form>
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
                  <p v-if="!person.clubs.length" class="hint">尚未加入跑团。</p>
                </section>
              </template>
              <template v-else>
                <section class="section">
                  <h3>账号</h3>
                  <div class="fact"><b>建团资格</b><span>{{ person.user.leader ? "已开启" : "未开启" }}</span></div>
                  <div class="fact"><b>登录</b><span>{{ person.user.hasPassword ? "已设置密码" : "尚未设置密码" }}</span></div>
                </section>
                <section class="section">
                  <h3>跑团</h3>
                  <div v-for="club in person.clubs" :key="club.id" class="fact"><b>{{ club.name }}</b><span>{{ roleNames[club.role] || club.role }}</span></div>
                  <p v-if="!person.clubs.length" class="hint">尚未加入跑团。</p>
                </section>
              </template>
              <section class="section">
                <h3>参赛状态</h3>
                <p class="lead">可按状态、赛事名称或城市筛选。</p>
                <div v-if="person.plans.length" class="plan-filters">
                  <label>
                    <span>状态</span>
                    <select v-model="planStatus">
                      <option value="">全部</option>
                      <option v-for="item in planStatusOptions" :key="item.status" :value="item.status">{{ item.status }}（{{ item.count }}）</option>
                    </select>
                  </label>
                  <label>
                    <span>赛事</span>
                    <input v-model="planQuery" placeholder="名称或城市" />
                  </label>
                </div>
                <p v-if="shownPlans.length" class="hint">{{ shownPlans.length }} 条</p>
                <div v-for="item in shownPlans" :key="item.name + item.raceDate + item.status" class="fact"><b>{{ item.name }}</b><span>{{ item.raceDate }}<template v-if="item.city"> · {{ item.city }}</template> · {{ item.status }}</span></div>
                <p v-if="!person.plans.length" class="hint">该用户尚未标记参赛状态。</p>
                <p v-else-if="!shownPlans.length" class="hint">没有符合条件的记录。</p>
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
      <div v-if="section === 'clubs'" class="desk clubs-desk" :class="{ editing: !!club, dragging }" :style="splitStyle">
        <div class="desk-main">
          <div class="block">
            <div class="panel-heading"><div><h3>跑团名录</h3><p>管理成员与团长，申请审核和成员管理分别处理。</p></div><span class="panel-count">{{ clubTotal }} 个</span></div>
            <form class="check-form inline-form" @submit.prevent="submitClubs">
              <input v-model="clubQuery" placeholder="搜跑团或昵称" @input="queueClubs" />
              <button class="primary" type="submit">筛选</button>
            </form>
            <p v-if="clubsReady" class="hint">{{ clubTotal }} 个团</p>
            <div class="race-list">
              <div v-for="item in clubs" :key="item.id" class="race-row user-row" :class="{ on: club && club.club.id === item.id }">
                <button type="button" class="race-open" @click="openClub(item.id)">
                  <span class="who-name">{{ item.name }}</span>
                  <strong>{{ item.createdAt }} · 团长 {{ item.owner }} · {{ item.members }} 人</strong>
                </button>
                <div v-if="pendingClub === item.id" class="row-confirm">
                  <p>确认删除该跑团？成员账号会保留。该团的活动、积分和礼品会一并删除，此操作不可恢复。</p>
                  <button class="danger" type="button" @click="removeClub(item)">确认删除</button>
                  <button class="undo" type="button" @click="pendingClub = 0">取消</button>
                </div>
                <div v-else class="row-actions">
                  <button class="remove" type="button" :aria-label="'删除 ' + item.name" @click="pendingClub = item.id">删除</button>
                </div>
              </div>
            </div>
            <p v-if="clubsReady && !clubs.length" class="empty">没有符合条件的跑团。</p>
            <Pager :page="clubPage" :pages="clubPages" @update:page="turnClubs" />
          </div>
        </div>
        <div v-if="club" class="splitter" role="separator" aria-orientation="vertical" aria-label="拖动调整左右宽度" :aria-valuenow="Math.round(split)" aria-valuemin="22" aria-valuemax="70" tabindex="0" @pointerdown="startSplit" @keydown="nudgeSplit"></div>
        <aside v-if="club" class="desk-side">
          <div class="block person">
            <div class="person-head">
              <div class="person-face" aria-hidden="true">{{ club.club.name.slice(0, 1) }}</div>
              <div class="person-id">
                <p class="edit-kicker">跑团</p>
                <h2>{{ club.club.name }}</h2>
                <p>{{ club.club.createdAt }} 创建 · {{ club.club.members }} 人</p>
              </div>
            </div>
            <section class="section">
              <h3>团长与口令</h3>
              <div class="fact"><b>团长</b><span>{{ club.club.owner }}</span></div>
              <div class="fact"><b>口令</b><span>{{ club.club.code }}</span></div>
              <p class="lead">口令用于打开跑团介绍，申请加入后须由团长或跑团管理审核。指定其他成员为团长后，原团长改为跑团管理，新团长具备建团资格。</p>
            </section>
            <section class="section">
              <h3>成员</h3>
              <article v-for="member in club.members" :key="member.id" class="member-row">
                <div class="member-head">
                  <b>{{ member.nickname }}</b>
                  <span>{{ member.joinedAt }}</span>
                  <button v-if="member.role !== 'owner' && pendingMember !== member.id" class="remove" type="button" :aria-label="'移出 ' + member.nickname" @click="pendingMember = member.id">移出</button>
                </div>
                <div v-if="pendingMember === member.id" class="row-confirm">
                  <p>确认移出该成员？未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；历史成绩、积分和已打卡记录保留，不删除账号。</p>
                  <button class="danger" type="button" @click="removeClubMember(member)">确认移出</button>
                  <button class="undo" type="button" @click="pendingMember = 0">取消</button>
                </div>
                <div v-else class="roles" role="radiogroup" :aria-label="member.nickname + '的角色'">
                  <button v-for="item in clubRoles" :key="item.id" type="button" role="radio" :aria-checked="member.role === item.id" :class="{ on: member.role === item.id }" :disabled="member.role === 'owner' && item.id !== 'owner'" @click="setClubMemberRole(member, item.id)">
                    <span>{{ item.label }}</span>
                    <i></i>
                  </button>
                </div>
                <p v-if="member.role === 'owner'" class="role-note">现任团长的角色不能直接修改。请先将团长移交给本团其他成员，再进行变更。</p>
              </article>
              <p v-if="!club.members.length" class="hint">还没有成员。</p>
              <form class="user-form" @submit.prevent="addClubMember">
                <label class="field"><span>添加成员</span><input v-model="memberName" maxlength="20" autocomplete="off" placeholder="已有用户的昵称" /></label>
                <div class="form-actions">
                  <button class="save" type="submit">添加</button>
                </div>
              </form>
              <p class="lead">按昵称加入，加入后为成员。昵称须唯一对应一个账号。</p>
            </section>
          </div>
        </aside>
      </div>
      <div v-if="section === 'runs'" class="block">
        <p v-if="runsReady" class="hint">{{ runTotal }} 条</p>
        <div class="race-list">
          <div v-for="(item, index) in runs" :key="index" class="line">
            <b>{{ item.nickname }} · {{ item.km }} 公里</b>
            <span>{{ item.at }} · {{ item.club }} · {{ item.title }}<template v-if="item.note"> · {{ item.note }}</template></span>
          </div>
        </div>
        <p v-if="runsReady && !runs.length" class="empty">还没有人报过公里。</p>
        <Pager :page="runPage" :pages="runPages" @update:page="turnRuns" />
      </div>
      <div v-if="section === 'partner'" class="partner-workspace">
        <section class="block"><div class="panel-heading"><div><h3>品牌物资</h3><p>团内领取条件、库存与开放状态</p></div></div>
        <p class="hint">用户不付钱。认证跑团按额度领，核心跑团额度乘二。</p>
        <div v-for="item in partner.supplies" :key="item.id" class="line">
          <b>{{ item.brand }} · {{ item.name }}</b>
          <span>{{ item.month }} · 总量 {{ item.total }} · 额度 {{ item.quota }} · 已领 {{ item.claimed }} · 签到 {{ item.needChecks }} · 跑量 {{ item.needKm }} · {{ item.open ? "开放" : "结束" }}</span>
          <span class="actions">
            <button class="undo" type="button" @click="toggleSupply(item)">{{ item.open ? "结束" : "开放" }}</button>
            <button class="undo" type="button" @click="removeSupply(item)">删除</button>
          </span>
        </div>
        <Pager :page="supplyPage" :pages="supplyPages" @update:page="turnSupply" />
        <details class="admin-disclosure"><summary><AdminIcon name="plus" />投放新物资</summary><form class="check-form" @submit.prevent="createSupply">
          <input v-model="supplyBrand" maxlength="20" placeholder="品牌" />
          <input v-model="supplyName" maxlength="40" placeholder="物资名" />
          <input v-model.number="supplyTotal" type="number" min="1" placeholder="总量" />
          <input v-model.number="supplyQuota" type="number" min="1" placeholder="每团额度" />
          <input v-model="supplyMonth" placeholder="月份 2026-10" />
          <input v-model.number="supplyChecks" type="number" min="0" placeholder="签到天数，0 表示不卡" />
          <input v-model.number="supplyKm" type="number" min="0" step="0.1" placeholder="计入跑量，0 表示不卡" />
          <input v-model="supplyNote" maxlength="100" placeholder="说明" />
          <button class="primary" type="submit">投放</button>
        </form></details>
        </section><section class="block"><div class="panel-heading"><div><h3>月度联赛</h3><p>组织跑团挑战，记录冠名与奖品</p></div></div>
        <div v-for="item in partner.leagues" :key="item.id" class="line">
          <b>{{ item.month }} · {{ item.title }}</b>
          <span>{{ item.sponsor }} · {{ item.prize }} · {{ item.clubs }} 个团</span>
        </div>
        <Pager :page="leaguePage" :pages="leaguePages" @update:page="turnLeague" />
        <details class="admin-disclosure"><summary><AdminIcon name="plus" />创建月度联赛</summary><form class="check-form" @submit.prevent="createLeague">
          <input v-model="leagueMonth" placeholder="月份 2026-10" />
          <input v-model="leagueTitle" maxlength="40" placeholder="联赛名称" />
          <input v-model="leagueSponsor" maxlength="40" placeholder="冠名，可不填" />
          <input v-model="leaguePrize" maxlength="80" placeholder="奖品，可不填" />
          <button class="primary" type="submit">开这一月</button>
        </form></details>
        </section><section class="block"><div class="panel-heading"><div><h3>合作账目</h3><p>线下结算记录与处理状态</p></div></div>
        <p class="hint">金额是线下账。这里不付款，也不代收会费。</p>
        <div v-for="item in partner.splits" :key="item.id" class="line">
          <b>{{ item.club }} · {{ item.kindLabel }}</b>
          <span>{{ item.month }} · {{ item.yuan }} 元 · {{ item.settledLabel }}</span>
          <span class="actions">
            <button class="undo" type="button" @click="settleSplit(item)">{{ item.settled ? "改回未结" : "标成已结" }}</button>
            <button class="undo" type="button" @click="removeSplit(item)">删除</button>
          </span>
        </div>
        <Pager :page="splitPage" :pages="splitPages" @update:page="turnSplit" />
        <details class="admin-disclosure"><summary><AdminIcon name="plus" />记录合作账目</summary><form class="check-form" @submit.prevent="createSplit">
          <input v-model.number="splitClub" type="number" min="1" placeholder="跑团编号" />
          <input v-model="splitMonth" placeholder="月份 2026-10" />
          <select v-model="splitKind">
            <option value="fee">服务费</option>
            <option value="commission">分佣</option>
            <option value="title">冠名</option>
          </select>
          <input v-model.number="splitYuan" type="number" min="1" placeholder="整数元" />
          <input v-model="splitNote" maxlength="80" placeholder="备注" />
          <button class="primary" type="submit">记一笔</button>
        </form></details>
        </section>
      </div>
      <div v-if="section === 'shop'" class="shop-workspace">
        <div class="block">
          <h2>积分礼品</h2>
          <p v-if="shopReady" class="hint">{{ giftTotal }} 件</p>
          <div v-for="item in gifts" :key="item.id" class="line"><b>{{ item.club }} · {{ item.name }}</b><span>{{ item.cost }} 分 · 剩 {{ item.stock }}</span></div>
          <p v-if="shopReady && !gifts.length" class="empty">还没有跑团放礼品。</p>
          <Pager :page="giftPage" :pages="giftPages" @update:page="turnGifts" />
        </div>
        <div class="block">
          <h2>兑换记录</h2>
          <p v-if="shopReady" class="hint">{{ redemptionTotal }} 条</p>
          <div v-for="(item, index) in redemptions" :key="index" class="line"><b>{{ item.nickname }} · {{ item.name }}</b><span>{{ item.at }} · {{ item.club }} · {{ item.cost }} 分</span></div>
          <p v-if="shopReady && !redemptions.length" class="empty">还没有人兑换。</p>
          <Pager :page="redemptionPage" :pages="redemptionPages" @update:page="turnRedemptions" />
        </div>
      </div>
      <div v-if="section === 'joins'" class="approval-workspace">
        <div class="approval-tabs" role="tablist" aria-label="申请类型">
          <button type="button" role="tab" :aria-selected="joinTab === 'foundings'" :class="{ on: joinTab === 'foundings' }" @click="joinTab = 'foundings'">建团申请 <span>{{ foundingTotal }}</span></button>
          <button type="button" role="tab" :aria-selected="joinTab === 'joins'" :class="{ on: joinTab === 'joins' }" @click="joinTab = 'joins'">入团申请 <span>{{ joinTotal }}</span></button>
        </div>
        <section v-if="joinTab === 'foundings'" id="founding-requests" class="block"><div class="panel-heading"><div><h3>建团申请</h3><p>确认团名与申请人，审核后开通跑团</p></div><span class="panel-count">{{ foundingTotal }} 条</span></div>
        <p class="hint">须具备建团资格才能提交。通过后，申请人成为该团团长，可以在手机上管理成员、活动和组别。</p>
        <p v-if="joinsReady" class="hint">{{ foundingTotal }} 条待审核</p>
        <div v-for="item in foundings" :key="item.id" class="line">
          <b>{{ item.nickname }} · {{ item.name }}</b>
          <span>{{ item.at }}</span>
          <span class="actions">
            <button class="primary" type="button" @click="decideFounding(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decideFounding(item, 'reject')">拒绝</button>
          </span>
        </div>
        <p v-if="joinsReady && !foundings.length" class="empty">没有待审核的建团。</p>
        <Pager :page="foundingPage" :pages="foundingPages" @update:page="turnFoundings" />
        </section><section v-if="joinTab === 'joins'" id="member-requests" class="block"><div class="panel-heading"><div><h3>入团申请</h3><p>口令不绕过审核，确认后加入跑团</p></div><span class="panel-count">{{ joinTotal }} 条</span></div>
        <p v-if="joinsReady" class="hint">{{ joinTotal }} 条待审核</p>
        <div v-for="item in joins" :key="item.id" class="line">
          <b>{{ item.nickname }} · {{ item.club }}</b>
          <span>{{ item.at }}</span>
          <span class="actions">
            <button class="primary" type="button" @click="decideJoin(item, 'approve')">通过</button>
            <button class="undo" type="button" @click="decideJoin(item, 'reject')">拒绝</button>
          </span>
        </div>
        <p v-if="joinsReady && !joins.length" class="empty">没有待审核的申请。</p>
        <Pager :page="joinPage" :pages="joinPages" @update:page="turnJoins" />
        </section>
      </div>
      <div v-if="section === 'accounts' && role === 'club'" class="block accounts-panel"><div class="panel-heading"><div><h3>账号安全</h3><p>修改当前跑团管理员账号的登录密码。</p></div></div>
        <form class="check-form" @submit.prevent="changePassword">
          <input v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" required />
          <label class="field"><input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码" required /><small>8 到 128 位</small></label>
          <button class="undo" type="submit">修改密码</button>
        </form>
      </div>
      <div v-if="section === 'accounts' && role === 'admin'" class="block accounts-panel"><div class="panel-heading"><div><h3>运营账号</h3><p>按岗位分配权限，账号角色与跑团内角色分别管理。</p></div></div>
        <p class="hint">后台角色是管理员和跑团管理员。团里的团长、跑团管理和成员，到跑团页改。</p>
        <div v-for="item in accounts" :key="item.username" class="line">
          <b>{{ item.username }}</b>
          <span>{{ item.roleLabel }}</span>
          <select v-if="item.username !== selfName" class="role-pick" :value="item.role" @change="setAccountRole(item, $event.target.value)">
            <option value="admin">管理员</option>
            <option value="club">跑团管理员</option>
          </select>
        </div>
        <details class="admin-disclosure"><summary><AdminIcon name="plus" />开通运营账号</summary><form class="check-form" @submit.prevent="createAccount">
          <input v-model="accountName" placeholder="用户名" />
          <label class="field">
            <input v-model="accountPass" type="password" autocomplete="new-password" placeholder="密码" />
            <small>8 到 128 位</small>
          </label>
          <select v-model="accountRole">
            <option value="club">跑团管理员</option>
            <option value="admin">管理员</option>
          </select>
          <button class="primary" type="submit">添加账号</button>
        </form></details>
        <h2>修改密码</h2>
        <form class="check-form" @submit.prevent="changePassword">
          <input v-model="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" />
          <label class="field">
            <input v-model="nextPassword" type="password" autocomplete="new-password" placeholder="新密码" />
            <small>8 到 128 位</small>
          </label>
          <button class="undo" type="submit">修改密码</button>
        </form>
      </div>
    </AdminShell>
  </main>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
import { adminUpload, api, raceSheetSrc } from "../api";
import Pager from "../components/Pager.vue";
import AdminShell from "../components/admin/AdminShell.vue";
import AdminDashboard from "../components/admin/AdminDashboard.vue";
import AdminIcon from "../components/admin/AdminIcon.vue";
import { countiesOf, settleRegion } from "../areas";
import { regions } from "../regions";

const token = ref(sessionStorage.getItem("marathon_admin") || "");
const username = ref("");
const password = ref("");
const currentPassword = ref("");
const nextPassword = ref("");
const authed = ref(false);
const q = ref("");
const officialFocus = ref("");
const filter = ref("pending");
const rows = ref([]);
const officialPage = ref(1);
const officialPages = ref(1);
const officialTotal = ref(0);
const botRows = ref([]);
const botStatus = ref("pending");
const botReady = ref(false);
const botPage = ref(1);
const botPages = ref(1);
const botTotal = ref(0);
const pendingCount = ref(0);
const raceTab = ref("published");
const newsTab = ref("published");
const newsRows = ref([]);
const newsPendingCount = ref(0);
const newsStatus = ref("pending");
const newsReview = ref(null);
const newsItem = ref(null);
const newsQuery = ref("");
const newsReady = ref(false);
const newsPage = ref(1);
const newsPages = ref(1);
const newsTotal = ref(0);
const newsRaceQuery = ref("");
const newsRaceHits = ref([]);
const newsDelete = ref(false);
const message = ref("");
const saved = ref(false);
const busy = ref(false);
const ready = ref(false);
const catalog = ref([]);
const catalogQuery = ref("");
const catalogWhen = ref("upcoming");
const catalogReady = ref(false);
const catalogPage = ref(1);
const catalogPages = ref(1);
const catalogTotal = ref(0);
const section = ref("overview");
const loginBusy = ref(false);
const overview = ref(null);
const overviewLoading = ref(false);
const overviewError = ref("");
const raceWorkspace = ref("catalog");
const raceWorkspaces = [{id:"catalog",label:"赛事库",icon:"races"},{id:"review",label:"内容审核",icon:"check"},{id:"official",label:"官网同步",icon:"sync"}];
const role = ref("admin");
const selfName = ref("");
const allSections = [
  { id: "overview", label: "运营总览", group: "工作台", icon: "overview", roles: ["admin", "club"] },
  { id: "races", label: "赛事管理", group: "内容运营", icon: "races", roles: ["admin"] },
  { id: "news", label: "赛事资讯", group: "内容运营", icon: "news", roles: ["admin"] },
  { id: "users", label: "跑者管理", group: "跑团与跑者", icon: "users", roles: ["admin", "club"] },
  { id: "clubs", label: "跑团管理", group: "跑团与跑者", icon: "clubs", roles: ["admin", "club"] },
  { id: "joins", label: "申请审核", group: "跑团与跑者", icon: "joins", roles: ["admin", "club"] },
  { id: "runs", label: "运动记录", group: "跑团与跑者", icon: "runs", roles: ["admin"] },
  { id: "shop", label: "积分礼品", group: "权益与合作", icon: "shop", roles: ["admin"] },
  { id: "partner", label: "合作与物资", group: "权益与合作", icon: "partner", roles: ["admin"] },
  { id: "accounts", label: "账号与权限", group: "平台管理", icon: "accounts", roles: ["admin", "club"] }
];
const deskSections = computed(() => allSections.filter((item) => item.roles.includes(role.value || "admin")).map(item => ({...item,badge:item.id === "races" ? overview.value?.counts?.pendingRaces : item.id === "news" ? overview.value?.counts?.pendingNews : item.id === "joins" ? Number(overview.value?.counts?.pendingFoundings || 0)+Number(overview.value?.counts?.pendingJoins || 0) : 0})));
const users = ref([]);
const usersReady = ref(false);
const userPage = ref(1);
const userPages = ref(1);
const userTotal = ref(0);
const userQuery = ref("");
const person = ref(null);
const personMode = ref("view");
const pendingDelete = ref(0);
const adding = ref(false);
const newName = ref("");
const newPass = ref("");
const clubs = ref([]);
const clubsReady = ref(false);
const clubPage = ref(1);
const clubPages = ref(1);
const clubTotal = ref(0);
const clubQuery = ref("");
const club = ref(null);
const memberName = ref("");
const pendingMember = ref(0);
const pendingClub = ref(0);
const runs = ref([]);
const runsReady = ref(false);
const runPage = ref(1);
const runPages = ref(1);
const runTotal = ref(0);
const gifts = ref([]);
const giftPage = ref(1);
const giftPages = ref(1);
const giftTotal = ref(0);
const redemptions = ref([]);
const redemptionPage = ref(1);
const redemptionPages = ref(1);
const redemptionTotal = ref(0);
const shopReady = ref(false);
const supplyPage = ref(1);
const supplyPages = ref(1);
const leaguePage = ref(1);
const leaguePages = ref(1);
const splitPage = ref(1);
const splitPages = ref(1);
const partner = ref({ supplies: [], leagues: [], splits: [] });
const supplyBrand = ref("");
const supplyName = ref("");
const supplyTotal = ref(1);
const supplyQuota = ref(1);
const supplyMonth = ref("");
const supplyChecks = ref(0);
const supplyKm = ref(0);
const supplyNote = ref("");
const leagueMonth = ref("");
const leagueTitle = ref("");
const leagueSponsor = ref("");
const leaguePrize = ref("");
const splitClub = ref("");
const splitMonth = ref("");
const splitKind = ref("commission");
const splitYuan = ref("");
const splitNote = ref("");
const prizes = ref([]);
const draws = ref([]);
const raceNews = ref([]);
const raceNewsWaiting = ref([]);
const raceNewsDraft = ref(blankRaceNews());
const raceNewsId = computed(() => (book.value && (book.value.id || book.value.raceId)) || "");
const drawLabel = ref("");
const drawApplicants = ref("");
const drawQuota = ref("");
const drawSource = ref("");
const prizeDistance = ref("full");
const prizeKind = ref("age");
const prizeGender = ref("");
const prizeAgeMin = ref(0);
const prizeAgeMax = ref(0);
const prizeProvince = ref("");
const prizePlace = ref(8);
const prizeBreak = ref("");
const prizeAmount = ref(0);
const prizeTax = ref(0);
const prizeStack = ref(false);
const prizeSource = ref("");
const prizeCutoff = ref("");
const prizeCutoffSource = ref("");
const prizeNote = ref("");
const joins = ref([]);
const foundings = ref([]);
const foundingPage = ref(1);
const foundingPages = ref(1);
const foundingTotal = ref(0);
const joinPage = ref(1);
const joinPages = ref(1);
const joinTotal = ref(0);
const joinTab = ref("foundings");
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
const deskOpen = computed(() => !!book.value);
const sectionLabel = computed(() => deskSections.value.find((item) => item.id === section.value)?.label || "后台");
const sectionLead = computed(() => ({
  overview: "把待办、近期赛事与信息质量放在一处，先处理影响跑者决策的事。",
  races: "从采集核实到正式发布，维护每一场比赛的时间、项目、规程与来源。",
  news: "发布与审核赛事资讯，确保每条内容关联准确的赛事。",
  users: "查看跑者的参赛计划、成绩与跑团，按需管理账号和建团资格。",
  clubs: "管理跑团成员、角色与团长移交，成员账号和跑团分开维护。",
  joins: "集中处理建团与入团申请。口令定位跑团，申请仍需审核。",
  runs: "查看跑者手动记录的运动数据及跑团归属。跑表自动同步尚未接入。",
  shop: "查看跑团积分礼品与兑换记录，支持团内激励。",
  partner: "管理物资、月度联赛与线下合作账目。",
  accounts: role.value === "club" ? "维护当前跑团管理员账号的登录安全。" : "分配后台角色和操作权限，管理运营账号。"
}[section.value] || ""));
const book = ref(null);
const editTab = ref("base");
const nodeOrigin = ref("");
const guideQueue = ref([]);
const routeQueue = ref([]);
const pacerQueue = ref([]);
const liveQueue = ref(null);
const spots = ref([]);
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
  { id: "base", label: "基本信息" },
  { id: "projects", label: "项目" },
  { id: "signup", label: "报名" },
  { id: "site", label: "官网" },
  { id: "day", label: "比赛日" },
  { id: "guide", label: "规程" },
  { id: "live", label: "直播" },
  { id: "prize", label: "奖项" },
  { id: "news", label: "资讯" }
];
const gradeChoices = [
  { value: "", label: "未标注" },
  { value: "A", label: "A 类" },
  { value: "B", label: "B 类" },
  { value: "C", label: "C 类" },
  { value: "TEN", label: "系列赛" }
];
const editMeta = computed(() => {
  const row = book.value;
  if (!row) return "";
  const grade = gradeChoices.find((item) => item.value === row.grade);
  return [row.raceDate, [row.province, row.city, row.district].filter(Boolean).join(" "), grade && grade.value ? grade.label : "", row.source ? "来源 " + row.source : "", row.updatedAt ? "更新于 " + row.updatedAt : ""].filter(Boolean);
});
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
  if (!deskSections.value.some((item) => item.id === section.value)) section.value = "overview";
  if (section.value === "overview") await loadOverview();
  if (section.value === "races") await Promise.all([loadCatalog(), loadSpots(), loadBotReviews()]);
  if (section.value === "news") await loadNews();
  if (section.value === "users") await loadUsers();
  if (section.value === "clubs") await loadClubs();
  if (section.value === "joins") await loadJoins();
  if (section.value === "runs") await loadRuns();
  if (section.value === "shop") await loadShop();
  if (section.value === "partner") await loadPartner();
  if (section.value === "accounts" && role.value === "admin") await loadAccounts();
  authed.value = true;
}

async function enter() {
  if (loginBusy.value) return;
  loginBusy.value = true;
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
  } finally { loginBusy.value = false; }
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
  overview.value = null;
  section.value = "overview";
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

async function loadOverview() {
  overviewLoading.value = true;
  overviewError.value = "";
  try {
    overview.value = await admin("/admin/overview");
    if (role.value === "admin") { pendingCount.value = overview.value.counts.pendingRaces; newsPendingCount.value = overview.value.counts.pendingNews; }
  } catch (err) {
    if (err.status === 401) throw err;
    overviewError.value = err.message;
  } finally { overviewLoading.value = false; }
}
async function refreshSection() {
  try {
    if (section.value === "overview") return await loadOverview();
    if (section.value === "races") return await Promise.all([raceWorkspace.value === "official" ? load() : raceWorkspace.value === "review" ? loadBotReviews() : loadCatalog(), loadSpots()]);
    const jobs = {news:loadNews,users:loadUsers,clubs:loadClubs,joins:loadJoins,runs:loadRuns,shop:loadShop,partner:loadPartner};
    if (role.value === "admin") jobs.accounts = loadAccounts;
    if (jobs[section.value]) await jobs[section.value]();
  } catch (err) { fail(err); }
}
async function pickSection(id) {
  if (!deskSections.value.some(item => item.id === id)) return;
  section.value = id;
  message.value = "";
  saved.value = false;
  await refreshSection();
}
async function pickRaceWorkspace(id) {
  if (!raceWorkspaces.some(item => item.id === id)) return;
  if (id !== raceWorkspace.value) closeEditor();
  raceWorkspace.value = id;
  if (id === "catalog") showPublished();
  if (id === "review") showReview();
  await refreshSection();
}
async function handleOverviewAction(target) {
  if (!target || !deskSections.value.some(item=>item.id === target.section)) return;
  if (target.section === "races") {
    closeEditor();
    raceWorkspace.value = target.raceId ? "catalog" : target.tab === "review" ? "review" : target.tab === "official" ? "official" : "catalog";
    if (raceWorkspace.value === "catalog") raceTab.value = "published";
    if (raceWorkspace.value === "review") {
      raceTab.value = "review";
      botStatus.value = target.filter === "returned" ? "returned" : "pending";
      botPage.value = 1;
    }
  }
  if (target.section === "joins" && ["foundings", "joins"].includes(target.tab)) joinTab.value = target.tab;
  await pickSection(target.section);
  if (target.section === "news" && target.tab === "review") await showNewsReview();
  if (target.action === "create") {
    if (target.section === "races") startDraft();
    if (target.section === "news") startNews();
    if (target.section === "users") startUser();
  }
  if (target.raceId && target.section === "races") { await pickRaceWorkspace("catalog"); await openGuide(target.raceId); }
}

let userTimer = 0;
let userSeq = 0;
function queueUsers() {
  if (userQuery.value.trim()) {
    person.value = null;
    adding.value = false;
  }
  userPage.value = 1;
  clearTimeout(userTimer);
  userTimer = setTimeout(() => {
    loadUsers();
  }, 200);
}
function submitUsers() {
  clearTimeout(userTimer);
  userPage.value = 1;
  return loadUsers();
}
function turnUsers(page) {
  userPage.value = page;
  return loadUsers();
}
async function loadUsers() {
  const seq = ++userSeq;
  try {
    const data = await admin("/admin/users?q=" + encodeURIComponent(userQuery.value) + "&page=" + userPage.value);
    if (seq !== userSeq) return;
    users.value = data.users;
    userTotal.value = data.total || 0;
    userPages.value = data.pages || 1;
    userPage.value = data.page || 1;
    usersReady.value = true;
    if (person.value && !users.value.some((item) => item.id === person.value.user.id)) person.value = null;
  } catch (err) {
    if (seq === userSeq) fail(err);
  }
}

let clubTimer = 0;
let clubSeq = 0;
function queueClubs() {
  if (clubQuery.value.trim()) club.value = null;
  clubPage.value = 1;
  clearTimeout(clubTimer);
  clubTimer = setTimeout(() => {
    loadClubs();
  }, 200);
}
function submitClubs() {
  clearTimeout(clubTimer);
  clubPage.value = 1;
  return loadClubs();
}
function turnClubs(page) {
  clubPage.value = page;
  return loadClubs();
}
async function loadClubs() {
  const seq = ++clubSeq;
  try {
    const data = await admin("/admin/clubs?q=" + encodeURIComponent(clubQuery.value) + "&page=" + clubPage.value);
    if (seq !== clubSeq) return;
    clubs.value = data.clubs;
    clubTotal.value = data.total || 0;
    clubPages.value = data.pages || 1;
    clubPage.value = data.page || 1;
    clubsReady.value = true;
    if (club.value && !clubs.value.some((item) => item.id === club.value.club.id)) club.value = null;
  } catch (err) {
    if (seq === clubSeq) fail(err);
  }
}

async function removeClub(item) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/clubs/" + item.id, { method: "DELETE" });
    if (club.value && club.value.club.id === item.id) club.value = null;
    pendingClub.value = 0;
    pendingMember.value = 0;
    await loadClubs();
    saved.value = true;
    message.value = "跑团已删除";
  } catch (err) {
    fail(err);
  }
}

async function openClub(id) {
  message.value = "";
  saved.value = false;
  pendingMember.value = 0;
  if (club.value && club.value.club.id === id) return;
  memberName.value = "";
  try {
    club.value = await admin("/admin/clubs/" + id);
  } catch (err) {
    fail(err);
  }
}

async function addClubMember() {
  if (!club.value) return;
  const nickname = memberName.value.trim();
  message.value = "";
  saved.value = false;
  if (!nickname || nickname.length > 20) {
    fail(new Error("昵称须为 1 到 20 个字"));
    return;
  }
  const id = club.value.club.id;
  try {
    await admin("/admin/clubs/" + id + "/members", { method: "POST", body: JSON.stringify({ nickname }) });
    memberName.value = "";
    club.value = await admin("/admin/clubs/" + id);
    await loadClubs();
    saved.value = true;
    message.value = "已加入跑团";
  } catch (err) {
    fail(err);
  }
}

async function removeClubMember(member) {
  if (!club.value || !member) return;
  message.value = "";
  saved.value = false;
  const id = club.value.club.id;
  try {
    const result = await admin("/admin/clubs/" + id + "/members/" + member.id, { method: "DELETE" });
    pendingMember.value = 0;
    club.value = await admin("/admin/clubs/" + id);
    await loadClubs();
    saved.value = true;
    const removed = result.removedSignups || {};
    message.value = "已移出跑团，取消未来报名 " + (removed.activities || 0) + " 场训练、" + (removed.meetups || 0) + " 场约跑、" + (removed.internalRaces || 0) + " 场队内赛";
  } catch (err) {
    fail(err);
  }
}

async function setClubMemberRole(member, next) {
  if (!club.value || next === member.role) return;
  message.value = "";
  saved.value = false;
  const id = club.value.club.id;
  try {
    await admin("/admin/clubs/" + id + "/members/" + member.id, {
      method: "PUT",
      body: JSON.stringify({ role: next })
    });
    club.value = await admin("/admin/clubs/" + id);
    await loadClubs();
    saved.value = true;
    message.value = next === "owner" ? "团长已移交" : "角色已更新";
  } catch (err) {
    fail(err);
    try {
      club.value = await admin("/admin/clubs/" + id);
    } catch (again) {
      fail(again);
    }
  }
}

const loginPass = ref("");
const planStatus = ref("");
const planQuery = ref("");
const planStatusOrder = ["想跑", "已报名", "待抽签", "中签", "未中签", "已缴费", "已领物", "完赛", "未完赛", "弃赛"];
const planStatusOptions = computed(() => {
  const counts = {};
  for (const item of person.value?.plans || []) counts[item.status] = (counts[item.status] || 0) + 1;
  const known = planStatusOrder.filter((status) => counts[status]);
  const extra = Object.keys(counts).filter((status) => !planStatusOrder.includes(status));
  return [...known, ...extra].map((status) => ({ status, count: counts[status] }));
});
function containsText(text, query) {
  const raw = String(text || "");
  if (raw.includes(query)) return true;
  const fold = (value) => value.replace(/\s+/g, "");
  return fold(raw).includes(fold(query));
}

const shownPlans = computed(() => {
  const query = planQuery.value.trim();
  return (person.value?.plans || []).filter((item) => {
    if (planStatus.value && item.status !== planStatus.value) return false;
    if (!query) return true;
    return containsText(item.name, query) || containsText(item.city, query);
  });
});

function startUser() {
  message.value = "";
  saved.value = false;
  person.value = null;
  pendingDelete.value = 0;
  newName.value = "";
  newPass.value = "";
  adding.value = true;
}

function cancelUser() {
  adding.value = false;
  newName.value = "";
  newPass.value = "";
}

async function createPerson() {
  const nickname = newName.value.trim();
  const password = newPass.value;
  message.value = "";
  saved.value = false;
  if (!nickname || nickname.length > 20) {
    fail(new Error("昵称须为 1 到 20 个字"));
    return;
  }
  if (password.length < 8 || password.length > 128) {
    fail(new Error("密码须为 8 到 128 位"));
    return;
  }
  try {
    const created = await admin("/admin/users", { method: "POST", body: JSON.stringify({ nickname, password }) });
    adding.value = false;
    newName.value = "";
    newPass.value = "";
    await loadUsers();
    await openUser(created.id, "view");
    saved.value = true;
    message.value = "账号已创建";
  } catch (err) {
    fail(err);
  }
}

async function openUser(id, mode) {
  message.value = "";
  saved.value = false;
  adding.value = false;
  personMode.value = mode === "edit" ? "edit" : "view";
  pendingDelete.value = 0;
  if (person.value && person.value.user.id === id) return;
  loginPass.value = "";
  planStatus.value = "";
  planQuery.value = "";
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

async function removeUser(item) {
  if (!item) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/users/" + item.id, { method: "DELETE" });
    if (person.value && person.value.user.id === item.id) person.value = null;
    pendingDelete.value = 0;
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
    const [requests, applications] = await Promise.all([
      admin("/admin/club-requests?page=" + joinPage.value),
      admin("/admin/club-applications?page=" + foundingPage.value)
    ]);
    joins.value = requests.requests;
    joinTotal.value = requests.total || 0;
    joinPages.value = requests.pages || 1;
    joinPage.value = requests.page || 1;
    foundings.value = applications.applications;
    foundingTotal.value = applications.total || 0;
    foundingPages.value = applications.pages || 1;
    foundingPage.value = applications.page || 1;
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

function turnRuns(page) {
  runPage.value = page;
  return loadRuns();
}
function turnFoundings(page) {
  foundingPage.value = page;
  return loadJoins();
}
function turnJoins(page) {
  joinPage.value = page;
  return loadJoins();
}
async function loadRuns() {
  runsReady.value = false;
  try {
    const data = await admin("/admin/runs?page=" + runPage.value);
    runs.value = data.runs;
    runTotal.value = data.total || 0;
    runPages.value = data.pages || 1;
    runPage.value = data.page || 1;
    runsReady.value = true;
  } catch (err) {
    fail(err);
  }
}

function turnSupply(page) {
  supplyPage.value = page;
  return loadPartner();
}
function turnLeague(page) {
  leaguePage.value = page;
  return loadPartner();
}
function turnSplit(page) {
  splitPage.value = page;
  return loadPartner();
}
async function loadPartner() {
  try {
    const data = await admin(
      "/admin/partner?supplyPage=" + supplyPage.value + "&leaguePage=" + leaguePage.value + "&splitPage=" + splitPage.value
    );
    partner.value = data;
    supplyPage.value = data.supplyPage || 1;
    supplyPages.value = data.supplyPages || 1;
    leaguePage.value = data.leaguePage || 1;
    leaguePages.value = data.leaguePages || 1;
    splitPage.value = data.splitPage || 1;
    splitPages.value = data.splitPages || 1;
  } catch (err) {
    fail(err);
  }
}

async function createSupply() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/supplies", {
      method: "POST",
      body: JSON.stringify({
        brand: supplyBrand.value,
        name: supplyName.value,
        total: supplyTotal.value,
        quota: supplyQuota.value,
        month: supplyMonth.value,
        needChecks: supplyChecks.value,
        needKm: supplyKm.value,
        note: supplyNote.value
      })
    });
    supplyBrand.value = "";
    supplyName.value = "";
    supplyNote.value = "";
    saved.value = true;
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function toggleSupply(item) {
  message.value = "";
  try {
    await admin("/admin/supplies/" + item.id, { method: "PUT", body: JSON.stringify({ open: !item.open }) });
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function removeSupply(item) {
  message.value = "";
  try {
    await admin("/admin/supplies/" + item.id, { method: "DELETE" });
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function createLeague() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/leagues", {
      method: "POST",
      body: JSON.stringify({
        month: leagueMonth.value,
        title: leagueTitle.value,
        sponsor: leagueSponsor.value,
        prize: leaguePrize.value
      })
    });
    leagueTitle.value = "";
    leagueSponsor.value = "";
    leaguePrize.value = "";
    saved.value = true;
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function createSplit() {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/splits", {
      method: "POST",
      body: JSON.stringify({
        clubId: splitClub.value,
        month: splitMonth.value,
        kind: splitKind.value,
        yuan: splitYuan.value,
        note: splitNote.value
      })
    });
    splitNote.value = "";
    saved.value = true;
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function settleSplit(item) {
  message.value = "";
  try {
    await admin("/admin/splits/" + item.id, { method: "PUT", body: JSON.stringify({ settled: !item.settled }) });
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

async function removeSplit(item) {
  message.value = "";
  try {
    await admin("/admin/splits/" + item.id, { method: "DELETE" });
    await loadPartner();
  } catch (err) {
    fail(err);
  }
}

function turnGifts(page) {
  giftPage.value = page;
  return loadShop();
}
function turnRedemptions(page) {
  redemptionPage.value = page;
  return loadShop();
}
async function loadShop() {
  shopReady.value = false;
  try {
    const data = await admin("/admin/shop?giftPage=" + giftPage.value + "&redemptionPage=" + redemptionPage.value);
    gifts.value = data.gifts;
    giftTotal.value = data.giftTotal || 0;
    giftPages.value = data.giftPages || 1;
    giftPage.value = data.giftPage || 1;
    redemptions.value = data.redemptions;
    redemptionTotal.value = data.redemptionTotal || 0;
    redemptionPages.value = data.redemptionPages || 1;
    redemptionPage.value = data.redemptionPage || 1;
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

let officialTimer = 0;
let officialSeq = 0;
function queueOfficial() {
  officialPage.value = 1;
  clearTimeout(officialTimer);
  officialTimer = setTimeout(() => {
    load().catch(fail);
  }, 200);
}
function turnOfficial(page) {
  officialPage.value = page;
  return load().catch(fail);
}
async function load() {
  const seq = ++officialSeq;
  const query = q.value.trim();
  const data = await admin(
    "/admin/official?status=" + (query ? "all" : filter.value) + (query ? "&q=" + encodeURIComponent(query) : "") + "&page=" + officialPage.value
  );
  if (seq !== officialSeq) return;
  rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
  officialTotal.value = data.total || 0;
  officialPages.value = data.pages || 1;
  officialPage.value = data.page || 1;
  if (!rows.value.some((row) => row.officialId === officialFocus.value)) officialFocus.value = "";
  ready.value = true;
}

async function setFilter(value) {
  filter.value = value;
  officialPage.value = 1;
  message.value = "";
  saved.value = false;
  try {
    await load();
  } catch (err) {
    fail(err);
  }
}

async function search() {
  clearTimeout(officialTimer);
  const seq = ++officialSeq;
  message.value = "";
  saved.value = false;
  busy.value = true;
  try {
    const data = await admin("/admin/official/sync", { method: "POST", body: JSON.stringify({ name: q.value }) });
    if (seq !== officialSeq) return;
    saved.value = true;
    message.value = data.changed ? "官网有 " + data.changed + " 场和上次记下的不一样" : "已向官网对过，没有新的变化";
    officialPage.value = 1;
    await load();
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

function showPublished() {
  raceWorkspace.value = "catalog";
  raceTab.value = "published";
  if (book.value && book.value.submissionId) closeEditor();
}

function showReview() {
  raceWorkspace.value = "review";
  raceTab.value = "review";
  if (book.value && !book.value.submissionId) closeEditor();
}

async function openReview(item) {
  if (book.value && book.value.submissionId === item.id) {
    closeEditor();
    return;
  }
  message.value = "";
  saved.value = false;
  try {
    const row = await admin("/admin/bot-races/" + item.id);
    clearQueues();
    editTab.value = "base";
    book.value = bookFromSubmission(row);
    prizes.value = (row.prizes || []).map((prize) => prizeView(prize));
    draws.value = (row.draws || []).map((draw) => drawView(draw));
    settlePlace();
    nodeOrigin.value = nodesKey(book.value);
    await loadRaceNews(row.raceId);
  } catch (err) {
    fail(err);
  }
}

function turnBot(page) {
  botPage.value = page;
  return loadBotReviews();
}
async function loadBotReviews() {
  const data = await admin("/admin/bot-races?status=" + botStatus.value + "&page=" + botPage.value);
  botRows.value = (data.rows || []).map((row) => ({ ...row, returnNote: "" }));
  botTotal.value = data.total || 0;
  botPages.value = data.pages || 1;
  botPage.value = data.page || 1;
  pendingCount.value = data.pendingCount || 0;
  botReady.value = true;
  if (book.value && book.value.submissionId && !botRows.value.some((row) => row.id === book.value.submissionId)) closeEditor();
}

function todayText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function closeNews() {
  newsItem.value = null;
  newsReview.value = null;
  newsRaceHits.value = [];
  newsDelete.value = false;
}

function startNews() {
  newsReview.value = null;
  newsDelete.value = false;
  newsTab.value = "published";
  newsRaceHits.value = [];
  newsRaceQuery.value = "";
  newsItem.value = { id: 0, raceId: "", raceName: "", city: "", title: "", body: "", source: "", publishedAt: todayText() };
}

function showNewsPublished() {
  newsTab.value = "published";
  newsReview.value = null;
  newsRows.value = [];
  newsPage.value = 1;
  newsReady.value = false;
  loadNews().catch(fail);
}

function showNewsReview() {
  newsTab.value = "review";
  newsPage.value = 1;
  newsItem.value = null;
  newsRaceHits.value = [];
  newsDelete.value = false;
  newsRows.value = [];
  newsReady.value = false;
  loadNews().catch(fail);
}

function openNews(item) {
  newsReview.value = null;
  newsDelete.value = false;
  if (newsItem.value && newsItem.value.id === item.id) {
    newsItem.value = null;
    return;
  }
  newsItem.value = { ...item };
  newsRaceQuery.value = item.raceName;
  newsRaceHits.value = [];
}

function openNewsReview(item) {
  newsItem.value = null;
  newsRaceHits.value = [];
  if (newsReview.value && newsReview.value.id === item.id) {
    newsReview.value = null;
    return;
  }
  newsReview.value = { ...item, returnNote: "" };
}

let newsTimer = 0;
function queueNews() {
  newsPage.value = 1;
  clearTimeout(newsTimer);
  newsTimer = setTimeout(() => {
    loadNews().catch(fail);
  }, 200);
}
function turnNews(page) {
  newsPage.value = page;
  return loadNews().catch(fail);
}
function submitNews() {
  clearTimeout(newsTimer);
  newsPage.value = 1;
  return loadNews().catch(fail);
}

async function loadNews() {
  const status = newsTab.value === "review" ? newsStatus.value : "published";
  const data = await admin("/admin/news?status=" + status + "&q=" + encodeURIComponent(newsQuery.value) + "&page=" + newsPage.value);
  newsRows.value = data.rows || [];
  newsTotal.value = data.total || 0;
  newsPages.value = data.pages || 1;
  newsPage.value = data.page || 1;
  newsPendingCount.value = data.pendingCount || 0;
  newsReady.value = true;
  if (newsReview.value) {
    const next = newsRows.value.find((row) => row.id === newsReview.value.id);
    newsReview.value = next ? { ...next, returnNote: newsReview.value.returnNote || "" } : null;
  }
  if (newsItem.value && newsItem.value.id && !newsQuery.value.trim() && newsTab.value === "published") {
    if (!newsRows.value.some((row) => row.id === newsItem.value.id)) newsItem.value = null;
  }
}

async function setNewsStatus(status) {
  newsStatus.value = status;
  newsReview.value = null;
  newsRows.value = [];
  newsPage.value = 1;
  newsReady.value = false;
  try {
    await loadNews();
  } catch (err) {
    fail(err);
  }
}

let newsRaceTimer = 0;
let newsRaceSeq = 0;
function queueNewsRaces() {
  if (newsItem.value) newsItem.value.raceId = "";
  clearTimeout(newsRaceTimer);
  const text = newsRaceQuery.value.trim();
  if (!text) {
    newsRaceHits.value = [];
    return;
  }
  newsRaceTimer = setTimeout(async () => {
    const seq = ++newsRaceSeq;
    try {
      const data = await admin("/admin/races?when=all&q=" + encodeURIComponent(text) + "&page=1&pageSize=8");
      if (seq !== newsRaceSeq) return;
      newsRaceHits.value = data.races || [];
    } catch (err) {
      fail(err);
    }
  }, 200);
}

function pickNewsRace(race) {
  if (!newsItem.value) return;
  newsItem.value.raceId = race.id;
  newsItem.value.raceName = race.name;
  newsItem.value.city = race.city;
  newsRaceQuery.value = race.name;
  newsRaceHits.value = [];
}

async function saveNews() {
  message.value = "";
  saved.value = false;
  if (!newsItem.value || !newsItem.value.raceId) {
    fail(new Error("先选一场比赛"));
    return;
  }
  const body = {
    raceId: newsItem.value.raceId,
    title: newsItem.value.title,
    body: newsItem.value.body,
    source: newsItem.value.source,
    publishedAt: newsItem.value.publishedAt
  };
  try {
    const path = newsItem.value.id ? "/admin/news/" + newsItem.value.id : "/admin/news";
    const data = await admin(path, { method: newsItem.value.id ? "PUT" : "POST", body: JSON.stringify(body) });
    newsItem.value = { ...data.news };
    newsRaceQuery.value = data.news.raceName;
    newsDelete.value = false;
    saved.value = true;
    message.value = "已发布";
    await loadNews();
  } catch (err) {
    fail(err);
  }
}

async function removeNews() {
  if (!newsItem.value || !newsItem.value.id) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/news/" + newsItem.value.id, { method: "DELETE" });
    newsItem.value = null;
    newsDelete.value = false;
    saved.value = true;
    message.value = "已删除";
    await loadNews();
  } catch (err) {
    fail(err);
  }
}

async function publishNews(item) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/news-submissions/" + item.id + "/publish", { method: "POST", body: "{}" });
    saved.value = true;
    message.value = "已发布";
    await loadNews();
  } catch (err) {
    fail(err);
  }
}

async function returnNews(item) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/news-submissions/" + item.id + "/return", { method: "POST", body: JSON.stringify({ note: item.returnNote }) });
    saved.value = true;
    message.value = "已打回";
    await loadNews();
  } catch (err) {
    fail(err);
  }
}

async function setBotStatus(status) {
  botStatus.value = status;
  botPage.value = 1;
  try {
    await loadBotReviews();
  } catch (err) {
    fail(err);
  }
}

function submissionKey(item) {
  return item && (item.submissionId || item.id);
}

async function publishBot(item) {
  const id = submissionKey(item);
  message.value = "";
  saved.value = false;
  try {
    if (book.value && book.value.submissionId === id) {
      const ok = await saveSubmission(true);
      if (!ok) return;
    }
    await admin("/admin/bot-races/" + id + "/publish", { method: "POST", body: "{}" });
    if (book.value && book.value.submissionId === id) closeEditor();
    saved.value = true;
    message.value = "已发布";
    await Promise.all([loadBotReviews(), load(), loadCatalog()]);
  } catch (err) {
    fail(err);
  }
}

async function returnBot(item) {
  const id = submissionKey(item);
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/bot-races/" + id + "/return", { method: "POST", body: JSON.stringify({ note: item.returnNote }) });
    saved.value = true;
    message.value = "已打回";
    await loadBotReviews();
  } catch (err) {
    fail(err);
  }
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
    district: race.district || "",
    place: race.place,
    distances: [...race.distances],
    kinds: [...race.kinds],
    meet: race.meet === "online" ? "online" : "offline",
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

function bookFromSubmission(row) {
  const next = emptyBook();
  next.submissionId = row.id;
  next.status = row.status;
  next.note = row.note || "";
  next.returnNote = "";
  next.raceId = row.raceId || "";
  next.prizesSet = Boolean(row.prizesSet);
  next.drawsSet = Boolean(row.drawsSet);
  next.name = row.name || "";
  next.raceDate = row.raceDate || "";
  next.province = row.province || "";
  next.city = row.city || "";
  next.district = row.district || "";
  next.place = row.place || "";
  next.distances = Array.isArray(row.distances) ? [...row.distances] : [];
  next.kinds = Array.isArray(row.kinds) ? [...row.kinds] : [];
  next.meet = row.meet === "online" ? "online" : "offline";
  next.groups = Array.isArray(row.groups) ? row.groups.join("、") : "";
  next.startAt = row.startAt || "";
  next.bibAt = row.bibAt || "";
  next.scale = row.scale || "";
  next.fee = row.fee || "";
  next.phone = row.phone || "";
  next.signupUrl = row.signupUrl || "";
  next.drawUrl = row.drawUrl || "";
  next.bibUrl = row.bibUrl || "";
  next.resultUrl = row.resultUrl || "";
  next.liveUrl = row.liveUrl || "";
  next.eventUrl = row.eventUrl || "";
  next.officialUrl = row.officialUrl || "";
  next.organizer = row.organizer || "";
  next.grade = ["A", "B", "C", "TEN"].includes(row.grade) ? row.grade : "";
  next.source = row.source || "";
  next.updatedAt = row.updatedAt ? String(row.updatedAt).slice(0, 10) : "";
  next.route = row.route || "";
  next.pickup = row.pickup || "";
  next.pacers = row.pacers || "";
  next.guideText = row.guideText || "";
  next.regStart = row.regStart || "";
  next.deadline = row.deadline || "";
  next.drawAt = row.drawAt || "";
  next.payDeadline = row.payDeadline || "";
  next.deadlineName = row.deadlineName || "";
  next.nodeSource = row.nodeSource || "";
  return next;
}

let localExtraId = 1;

function prizeView(rule) {
  const labels = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
  const kinds = { place: "名次", age: "年龄组", local: "本地籍", break: "破时", club: "跑团" };
  const kind = kinds[rule.kind] || rule.kind || "";
  let title = kind;
  if (rule.gender) title += " · " + rule.gender;
  if (rule.kind === "break" && rule.breakClock) title += " · " + rule.breakClock;
  else if (rule.placeN) title += " · 前 " + rule.placeN;
  const amountText = rule.amount ? "税前 " + rule.amount + " 元" : "非现金";
  return {
    ...rule,
    id: "prize-" + localExtraId++,
    stack: Boolean(rule.stack),
    distanceLabel: labels[rule.distance] || rule.distance,
    title,
    amountText
  };
}

function drawView(rule) {
  const applicants = Number(rule.applicants);
  const quota = Number(rule.quota);
  const rate = applicants ? Math.round((quota / applicants) * 1000) / 10 : null;
  return {
    ...rule,
    id: "draw-" + localExtraId++,
    rateText: rate == null ? "还没公布" : "约 " + rate + "%"
  };
}

function prizeInput(item) {
  return {
    distance: item.distance,
    kind: item.kind,
    gender: item.gender || "",
    ageMin: item.ageMin || 0,
    ageMax: item.ageMax || 0,
    province: item.province || "",
    placeN: item.placeN || 0,
    breakClock: item.breakClock || "",
    amount: item.amount || 0,
    tax: item.tax || 0,
    stack: Boolean(item.stack),
    source: item.source || "",
    cutoffClock: item.cutoffClock || "",
    cutoffSource: item.cutoffSource || "",
    note: item.note || ""
  };
}

function emptyBook() {
  return {
    id: "",
    name: "",
    raceDate: "",
    province: "",
    city: "",
    district: "",
    place: "",
    distances: [],
    kinds: [],
    meet: "offline",
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
  if (book.value.city && !names.includes(book.value.city)) names.push(book.value.city);
  return names;
});

const districtOptions = computed(() => {
  if (!book.value) return [];
  const names = [...countiesOf(book.value.province, book.value.city)];
  if (book.value.district && !names.includes(book.value.district)) names.push(book.value.district);
  return names;
});

const placeOptions = computed(() => {
  if (!book.value || !book.value.city) return [];
  const names = spots.value
    .filter((item) => item.city === book.value.city && item.place && item.place !== item.city)
    .map((item) => item.place);
  return [...new Set(names)];
});

function settlePlace() {
  if (!book.value) return;
  const next = settleRegion(book.value.province, book.value.city, book.value.district);
  book.value.province = next.province;
  book.value.city = next.city;
  book.value.district = next.district;
}

function onProvinceChange() {
  const row = regions.find((item) => item.name === book.value.province);
  const names = row ? row.cities : [];
  if (book.value.city && !names.includes(book.value.city)) book.value.city = "";
  onCityChange();
}

function onCityChange() {
  const names = countiesOf(book.value.province, book.value.city);
  if (book.value.district && !names.includes(book.value.district)) book.value.district = "";
}

function toggle(list, key) {
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  else list.push(key);
}

function startDraft() {
  raceWorkspace.value = "catalog";
  raceTab.value = "published";
  raceTab.value = "published";
  clearQueues();
  editTab.value = "base";
  book.value = emptyBook();
  prizes.value = [];
  draws.value = [];
  raceNews.value = [];
  raceNewsWaiting.value = [];
  raceNewsDraft.value = blankRaceNews();
  nodeOrigin.value = nodesKey(book.value);
}

function blankRaceNews() {
  return { id: 0, title: "", body: "", source: "", publishedAt: todayText() };
}

async function loadRaceNews(id) {
  raceNewsDraft.value = blankRaceNews();
  if (!id) {
    raceNews.value = [];
    raceNewsWaiting.value = [];
    return;
  }
  const data = await admin("/admin/races/" + id + "/news");
  raceNews.value = data.news || [];
  raceNewsWaiting.value = data.waiting || [];
}

function editRaceNews(item) {
  raceNewsDraft.value = {
    id: item.id,
    title: item.title,
    body: item.body,
    source: item.source,
    publishedAt: item.publishedAt
  };
}

async function saveRaceNews() {
  const raceId = raceNewsId.value;
  const draft = raceNewsDraft.value;
  if (!raceId) return fail(new Error("这场还没进赛历，保存或通过后再挂资讯"));
  if (!draft.title.trim()) return fail(new Error("标题要写"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.publishedAt || ""))) return fail(new Error("发布时间要写"));
  if (!draft.source.trim()) return fail(new Error("来源要写"));
  if (!draft.body.trim()) return fail(new Error("正文要写"));
  message.value = "";
  saved.value = false;
  const body = {
    raceId,
    title: draft.title.trim(),
    body: draft.body.trim(),
    source: draft.source.trim(),
    publishedAt: draft.publishedAt
  };
  try {
    const path = draft.id ? "/admin/news/" + draft.id : "/admin/news";
    await admin(path, { method: draft.id ? "PUT" : "POST", body: JSON.stringify(body) });
    saved.value = true;
    message.value = "已挂在这场上";
    await loadRaceNews(raceId);
  } catch (err) {
    fail(err);
  }
}

async function removeRaceNews(item) {
  if (!window.confirm("从这场去掉「" + item.title + "」？")) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/news/" + item.id, { method: "DELETE" });
    saved.value = true;
    message.value = "已从这场去掉";
    await loadRaceNews(raceNewsId.value);
  } catch (err) {
    fail(err);
  }
}

function closeEditor() {
  clearQueues();
  book.value = null;
  prizes.value = [];
  draws.value = [];
  raceNews.value = [];
  raceNewsWaiting.value = [];
  raceNewsDraft.value = blankRaceNews();
}

async function loadDraws(id) {
  if (!id) {
    draws.value = [];
    return;
  }
  const data = await admin("/admin/races/" + id + "/draws");
  draws.value = data.rates || [];
}

function clockSeconds(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0;
  const hms = raw.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  const ms = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  let sec = null;
  if (hms) sec = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  else if (ms) sec = Number(ms[1]) * 60 + Number(ms[2]);
  if (sec == null || sec <= 0 || sec > 12 * 3600) return null;
  return sec;
}

function prizeError(body) {
  if (!["full", "half", "10k", "5k"].includes(body.distance)) return "项目选全马、半马、10 公里或 5 公里";
  if (!["place", "age", "local", "break", "club"].includes(body.kind)) return "类型选名次、年龄组、本地籍、破时或跑团";
  if (body.gender && body.gender !== "男" && body.gender !== "女") return "性别选男、女，或留空";
  const ageMin = Number(body.ageMin || 0);
  const ageMax = Number(body.ageMax || 0);
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMax > 120 || (ageMin === 0) !== (ageMax === 0) || (ageMin && ageMin > ageMax)) {
    return "年龄写成 18 到 65 这种";
  }
  if (body.kind === "local") {
    if (!regions.some((item) => item.name === body.province)) return "省份不在名单里";
  } else if (body.province) return "只有本地籍填写省份";
  const placeN = Number(body.placeN || 0);
  if (!Number.isInteger(placeN) || placeN < 0 || placeN > 100) return "名次写成 1 到 100";
  const breakSec = clockSeconds(body.breakClock);
  if (breakSec == null) return "成绩写成 3:30:00";
  if (body.kind === "break") {
    if (!breakSec) return "成绩写成 3:30:00";
    if (placeN) return "破时不填名次";
  } else if (!placeN) return "名次写成 1 到 100";
  else if (breakSec) return "只有破时填写成绩线";
  const amount = Number(body.amount || 0);
  const tax = Number(body.tax || 0);
  if (!Number.isInteger(amount) || amount < 0 || amount > 999999) return "金额写成 0 到 999999 的整数元，0 表示非现金";
  if (!Number.isInteger(tax) || tax < 0 || tax > 50) return "税率写成 0 到 50";
  const source = String(body.source || "").trim();
  if ([...source].length < 1 || [...source].length > 80) return "来源写成 1 到 80 个字";
  const cutoff = clockSeconds(body.cutoffClock);
  if (cutoff == null) return "成绩写成 3:30:00";
  const cutoffSource = String(body.cutoffSource || "").trim();
  if (cutoff && ([...cutoffSource].length < 1 || [...cutoffSource].length > 80)) return "往届成绩要写来源";
  if (!cutoff && cutoffSource) return "没有往届成绩就不用写来源";
  if ([...String(body.note || "")].length > 40) return "说明最多 40 个字";
  return "";
}

function drawError(body) {
  const label = String(body.label || "").trim();
  if ([...label].length < 1 || [...label].length > 20) return "届次写成 1 到 20 个字";
  const applicants = Number(body.applicants);
  const quota = Number(body.quota);
  if (!Number.isInteger(applicants) || applicants < 1 || applicants > 9999999) return "报名人数写成 1 到 9999999 的整数";
  if (!Number.isInteger(quota) || quota < 1 || quota > 9999999) return "名额写成 1 到 9999999 的整数";
  if (quota > applicants) return "名额不能多于报名人数";
  const source = String(body.source || "").trim();
  if ([...source].length < 1 || [...source].length > 80) return "来源写成 1 到 80 个字";
  if (draws.value.some((item) => item.label === label)) return "这一届已经记过";
  return "";
}

function draftPrize() {
  return {
    distance: prizeDistance.value,
    kind: prizeKind.value,
    gender: prizeGender.value,
    ageMin: prizeAgeMin.value || 0,
    ageMax: prizeAgeMax.value || 0,
    province: prizeKind.value === "local" ? prizeProvince.value : "",
    placeN: prizePlace.value || 0,
    breakClock: String(prizeBreak.value || "").trim(),
    amount: prizeAmount.value || 0,
    tax: prizeTax.value || 0,
    stack: prizeStack.value,
    source: String(prizeSource.value || "").trim(),
    cutoffClock: String(prizeCutoff.value || "").trim(),
    cutoffSource: String(prizeCutoffSource.value || "").trim(),
    note: String(prizeNote.value || "").trim()
  };
}

async function createDraw() {
  if (!book.value) return;
  if (book.value.submissionId) {
    const rule = {
      label: String(drawLabel.value || "").trim(),
      applicants: drawApplicants.value,
      quota: drawQuota.value,
      source: String(drawSource.value || "").trim()
    };
    const error = drawError(rule);
    if (error) return fail(new Error(error));
    draws.value = draws.value.concat([drawView(rule)]);
    book.value.drawsSet = true;
    drawLabel.value = "";
    drawApplicants.value = "";
    drawQuota.value = "";
    drawSource.value = "";
    saved.value = false;
    message.value = "";
    return;
  }
  if (!book.value.id) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + book.value.id + "/draws", {
      method: "POST",
      body: JSON.stringify({
        label: drawLabel.value,
        applicants: drawApplicants.value,
        quota: drawQuota.value,
        source: drawSource.value
      })
    });
    drawLabel.value = "";
    drawApplicants.value = "";
    drawQuota.value = "";
    drawSource.value = "";
    saved.value = true;
    await loadDraws(book.value.id);
  } catch (err) {
    fail(err);
  }
}

async function removeDraw(item) {
  if (book.value && book.value.submissionId) {
    draws.value = draws.value.filter((row) => row.id !== item.id);
    book.value.drawsSet = true;
    return;
  }
  message.value = "";
  try {
    await admin("/admin/races/" + book.value.id + "/draws/" + item.id, { method: "DELETE" });
    await loadDraws(book.value.id);
  } catch (err) {
    fail(err);
  }
}

async function loadPrizes(id) {
  if (!id) {
    prizes.value = [];
    return;
  }
  const data = await admin("/admin/races/" + id + "/prizes");
  prizes.value = data.prizes;
}

async function createPrize() {
  if (!book.value) return;
  if (book.value.submissionId) {
    const rule = draftPrize();
    const error = prizeError(rule);
    if (error) return fail(new Error(error));
    prizes.value = prizes.value.concat([prizeView(rule)]);
    book.value.prizesSet = true;
    prizeSource.value = "";
    prizeNote.value = "";
    saved.value = false;
    message.value = "";
    return;
  }
  if (!book.value.id) return;
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + book.value.id + "/prizes", {
      method: "POST",
      body: JSON.stringify({
        distance: prizeDistance.value,
        kind: prizeKind.value,
        gender: prizeGender.value,
        ageMin: prizeAgeMin.value || 0,
        ageMax: prizeAgeMax.value || 0,
        province: prizeKind.value === "local" ? prizeProvince.value : "",
        placeN: prizePlace.value || 0,
        breakClock: prizeBreak.value,
        amount: prizeAmount.value || 0,
        tax: prizeTax.value || 0,
        stack: prizeStack.value,
        source: prizeSource.value,
        cutoffClock: prizeCutoff.value,
        cutoffSource: prizeCutoffSource.value,
        note: prizeNote.value
      })
    });
    prizeSource.value = "";
    prizeNote.value = "";
    saved.value = true;
    await loadPrizes(book.value.id);
  } catch (err) {
    fail(err);
  }
}

async function removePrize(item) {
  if (book.value && book.value.submissionId) {
    prizes.value = prizes.value.filter((row) => row.id !== item.id);
    book.value.prizesSet = true;
    return;
  }
  message.value = "";
  try {
    await admin("/admin/races/" + book.value.id + "/prizes/" + item.id, { method: "DELETE" });
    await loadPrizes(book.value.id);
  } catch (err) {
    fail(err);
  }
}

let catalogTimer = 0;
let catalogSeq = 0;
function queueCatalog() {
  if (catalogQuery.value.trim()) closeEditor();
  catalogPage.value = 1;
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(() => {
    loadCatalog().catch(fail);
  }, 200);
}
function submitCatalog() {
  clearTimeout(catalogTimer);
  catalogPage.value = 1;
  return loadCatalog();
}
function turnCatalog(page) {
  catalogPage.value = page;
  return loadCatalog().catch(fail);
}
async function loadCatalog() {
  const seq = ++catalogSeq;
  const query = catalogQuery.value.trim();
  const data = await admin(
    "/admin/races?when=" + (query ? "all" : catalogWhen.value) + (query ? "&q=" + encodeURIComponent(query) : "") + "&page=" + catalogPage.value
  );
  if (seq !== catalogSeq) return;
  catalog.value = data.races || [];
  catalogTotal.value = data.total || 0;
  catalogPages.value = data.pages || 1;
  catalogPage.value = data.page || 1;
  catalogReady.value = true;
}

async function loadSpots() {
  const data = await admin("/admin/places");
  spots.value = data.spots || [];
}

async function setCatalogWhen(value) {
  catalogWhen.value = value;
  catalogPage.value = 1;
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
  if (book.value && book.value.id === id && !book.value.submissionId) {
    closeEditor();
    return;
  }
  message.value = "";
  saved.value = false;
  try {
    const data = await api("/races/" + id);
    clearQueues();
    editTab.value = "base";
    book.value = blankBook(data.race);
    await loadPrizes(data.race.id);
    await loadDraws(data.race.id);
    await loadRaceNews(data.race.id);
    nodeOrigin.value = nodesKey(book.value);
    settlePlace();
  } catch (err) {
    fail(err);
  }
}

function guideBody(row) {
  return {
    name: row.name,
    province: row.province,
    city: row.city,
    district: row.district,
    place: row.place,
    organizer: row.organizer,
    grade: row.grade,
    distances: row.distances,
    kinds: row.kinds,
    meet: row.meet === "online" ? "online" : "offline",
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

function submissionBody(row) {
  const prizesSet = Boolean(row.prizesSet) || prizes.value.length > 0;
  const drawsSet = Boolean(row.drawsSet) || draws.value.length > 0;
  return {
    ...guideBody(row),
    regStart: row.regStart,
    deadline: row.deadline,
    drawAt: row.drawAt,
    payDeadline: row.payDeadline,
    deadlineName: row.deadlineName,
    nodeSource: row.nodeSource,
    prizesSet,
    drawsSet,
    prizes: prizesSet ? prizes.value.map(prizeInput) : undefined,
    draws: drawsSet
      ? draws.value.map((item) => ({
          label: item.label,
          applicants: item.applicants,
          quota: item.quota,
          source: item.source
        }))
      : undefined
  };
}

async function saveSubmission(quiet) {
  const row = book.value;
  if (!row || !row.submissionId) return false;
  message.value = "";
  saved.value = false;
  if (!row.name.trim()) {
    fail(new Error("请填写赛事名称"));
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.raceDate || "").trim())) {
    fail(new Error("比赛日期须为 2026-11-01 这种格式"));
    return false;
  }
  if (!String(row.province || "").trim() || !String(row.city || "").trim()) {
    fail(new Error("请填写省份和城市"));
    return false;
  }
  if (!row.distances.length && !row.kinds.length && !String(row.groups || "").trim()) {
    fail(new Error("请至少选择一个项目"));
    return false;
  }
  const dated = [row.regStart, row.deadline, row.drawAt, row.payDeadline, row.bibAt].some((item) => String(item || "").trim());
  if (dated && !String(row.nodeSource || "").trim()) {
    fail(new Error("报名时间要写来源"));
    return false;
  }
  try {
    await admin("/admin/bot-races/" + row.submissionId, { method: "PUT", body: JSON.stringify(submissionBody(row)) });
    saved.value = true;
    if (!quiet) message.value = "已改在待审里";
    nodeOrigin.value = nodesKey(row);
    await loadBotReviews();
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

async function saveGuide() {
  if (book.value && book.value.submissionId) return saveSubmission();
  message.value = "";
  saved.value = false;
  const row = book.value;
  if (!row.name.trim()) return fail(new Error("请填写赛事名称"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.raceDate.trim())) return fail(new Error("比赛日期须为 2026-11-01 这种格式"));
  if (!row.city.trim() && !row.place.trim()) return fail(new Error("请填写城市或举办地点"));
  if (!row.distances.length && !row.kinds.length && !row.groups.trim()) return fail(new Error("请至少选择一个项目"));
  const nodesTouched = nodesKey(row) !== nodeOrigin.value || row.nodeSource.trim();
  if (nodesTouched && !row.nodeSource.trim()) return fail(new Error("修改报名时间须填写本次来源"));
  if (nodesTouched && ![row.regStart, row.deadline, row.drawAt, row.payDeadline].some((item) => item.trim())) {
    return fail(new Error("请填写需要记录的报名时间"));
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
    await loadPrizes(opened.race.id);
    await loadDraws(opened.race.id);
    await loadRaceNews(opened.race.id);
    nodeOrigin.value = nodesKey(book.value);
    settlePlace();
    saved.value = true;
    message.value = creating ? "已加入赛历" : nodesTouched ? "赛事资料与报名时间已保存" : "赛事资料已保存";
    await Promise.all([loadCatalog(), loadSpots()]);
  } catch (err) {
    fail(err);
    if (creating && id) message.value = err.message + "。该赛事已写入赛历，请修改后再次保存";
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
  if (book.value.pacerSheets.length + pacerQueue.value.length >= 8) return fail(new Error("配速资料最多 8 张"));
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
    message.value = kind === "live" ? "直播二维码已更新" : kind === "route" ? "路线图已添加" : kind === "pacer" ? "配速资料已添加" : "规程原页已添加";
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

<style scoped src="../styles/admin.css"></style>
