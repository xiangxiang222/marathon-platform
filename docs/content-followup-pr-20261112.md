# 内容采集与人物档案跟进 PR 范围

分支 `codex/content-profiles-followup-20261112`，基线 `origin/main` 的 `d4ad37b`。该工作区只整理既有内容功能的后续实现，不运行真实采集、不安装 cron、不部署、不写生产数据。

## 功能与依赖

- 持续收集当年男女各100名中国籍成年组全马成绩，维护有记录依据的成长经历、比赛履历与完整人物文章；当前初始快照200人。
- 官兔以人为列表单位，支持关联赛事过滤；入选公示与已担任分别记录，同名跨赛事合并需要核实身份。
- 平台管理员可新建、预览、编辑、保存草稿、发布和下架运动员与官兔；人工编辑逐字段覆盖采集基线，防止覆盖未修改的新成绩，并检查版本冲突。
- 阅读页面展示整理全文，来源与核验依据保留在管理数据；网页与小程序保持兼容。
- `content.js` 安装/挂载 `content-profiles.js`，并调用 `pacer-people.js` 归并；已有 `db.js`、`index.js`、路由及小程序页面登记在基线均已具备，无额外变更。
- 新脚本仅使用已安装的 Node、SQLite 和 Playwright 依赖，无新增软件依赖或锁文件变更。采集输出采用 `CONTENT_DATA_DIR`/`server/data/content`，生产运行快照和数据库不进入本 PR。
- 9张本地头像均被初始数据引用，引用检查无缺失。未引用的第10张下载文件不收录。

## 明确排除

- A：独立赛事资讯表的最近一周8篇、对应导入器、`server/src/news.js`、旧赛事资讯页面及新闻测试。
- B：跑团目录布局、`Sport.vue`、小程序clubs目录。
- 账户体验种子数据、账户关联赛事与运动记录，以及泛UI设计、预览大批图片、本地配置、`.env`、SQLite和媒体运行目录。
- 本次运动员性别筛选布局修复：仅在本工作区将4文件恢复为男女按钮之后的行内赛季说明、旧gender-tabs规则；未带入单独season行、按钮flex修正或新增aria属性。其余完整内容功能保留。

## 本地验证

全部在此独立工作区运行，HTTP与浏览器使用临时SQLite、临时内容副本及随机本机端口，隐藏`.env`，浏览器外网请求被阻止。未运行真实采集网络或生产写入。

| 命令 | 结果 |
| --- | --- |
| `node --test --test-concurrency=1 --require ./server/test/setup-env.js server/test/content.test.js server/test/content-profiles.test.js server/test/pacer-people.test.js` | 19项通过 |
| `npm run test:content-sync` | 28项通过；固定样例/替代采集请求，包含失败快照保留 |
| `node scripts/content-mini-regression.cjs` | 19项通过 |
| `npm run build` | 通过，169模块 |
| `node scripts/profile-admin-live.cjs` | 8项真实HTTP/浏览器检查，6个320/390/1440视图，0运行错误 |
| `node scripts/content-live-acceptance.cjs` | 7项真实HTTP/浏览器检查，37个320/390/1024视图，0运行错误 |

浏览器截图与报告仅作为本地验收产物留存，不随本PR提交。小程序VM交互测试通过，未在本次整理中重新声明设备或微信正式版本发布。

## 文件清单

仅下列60个文件进入本PR（含本文）。

### 后端与管理入口

- `server/src/content-profiles.js`
- `server/src/content.js`
- `server/src/pacer-people.js`
- `server/test/content-profiles.test.js`
- `server/test/content.test.js`
- `server/test/pacer-people.test.js`
- `web/src/components/admin/ContentAdmin.vue`
- `web/src/components/admin/ProfileAdmin.vue`
- `web/src/views/Admin.vue`

### 网页与小程序阅读

- `miniprogram/pages/news/detail.js`
- `miniprogram/pages/news/detail.wxml`
- `miniprogram/pages/news/detail.wxss`
- `miniprogram/pages/news/news.js`
- `miniprogram/pages/news/news.wxml`
- `miniprogram/pages/news/news.wxss`
- `miniprogram/utils/content.js`
- `miniprogram/utils/journal.wxss`
- `web/src/content-date.js`
- `web/src/journal.css`
- `web/src/views/ContentDetail.vue`
- `web/src/views/InfoCenter.vue`

### 采集、导入与验证脚本

- `package.json`
- `scripts/athlete-biography.cjs`
- `scripts/athlete-biography.test.cjs`
- `scripts/content-date.test.cjs`
- `scripts/content-live-acceptance.cjs`
- `scripts/content-mini-regression.cjs`
- `scripts/content-news-enrichment.cjs`
- `scripts/content-news-enrichment.test.cjs`
- `scripts/content-sync.cjs`
- `scripts/content-sync.sh`
- `scripts/content-sync.test.cjs`
- `scripts/enrich-athlete-biographies.cjs`
- `scripts/import-content-starters.cjs`
- `scripts/install-content-cron.cjs`
- `scripts/profile-admin-live.cjs`

### 初始数据与必要头像

- `shared/a-class-races.json`
- `shared/athlete-editorial-biographies.json`
- `shared/content-sources.json`
- `shared/content-starter-articles.json`
- `shared/elite-athletes-history.json`
- `shared/elite-athletes.json`
- `shared/news-enrichment.json`
- `shared/official-pacers.json`
- `web/public/images/athletes/14334270.jpg`
- `web/public/images/athletes/14693572.jpg`
- `web/public/images/athletes/14694073.jpg`
- `web/public/images/athletes/14714417.jpg`
- `web/public/images/athletes/14754426.jpg`
- `web/public/images/athletes/14795227.jpg`
- `web/public/images/athletes/14821206.jpg`
- `web/public/images/athletes/14839796.jpg`
- `web/public/images/athletes/14913520.jpg`

### 说明与核验记录

- `README.md`
- `docs/content-source-check-20261111.json`
- `docs/content-sync-production-20261112.json`
- `docs/profile-admin-production-20261112.json`
- `docs/持续内容采集-20261112.md`
- `docs/运动员与官兔后台管理-20261112.md`
- `docs/content-followup-pr-20261112.md`
