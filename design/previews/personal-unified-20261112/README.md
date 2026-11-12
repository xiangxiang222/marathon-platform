# 个人与运动页面统一验收 · 2026-11-12

页面操作界面统一使用赛事页红／黑／白：品牌 `#ff1838`、浅红 `#fff0f2`、页面 `#f5f5f5`、白卡片、正文 `#1a1a1a`、次要文字 `#777`、分隔线 `#eee`。移除鞋、护照、奖牌插画和多色入口背景；个人档案入口改为纵向列表。保留用户照片、证书、运动截图与海报输出作品。

| 页面／组件 | 本次调整 | 核查分支 |
| --- | --- | --- |
| Exercise／sport | 月份工具栏、总跑量、三项指标、记录／导入双操作，趋势与记录清晰分区 | 有数据、空数据、游客、目标表单、新记录、编辑记录；320／390 |
| Mine／mine | 紧凑身份卡、短下划线主标签、本人训练与成绩、纵向档案列表、分组资料设置 | 总览、我的赛事、成绩、个人资料、设置、退出、游客登录、修改资料；320／390 |
| RunnerDashboard／RunnerBars | 单色档案入口、白色成绩卡、红色有效数据柱 | PB、空成绩、本周统计、零值与非零柱 |
| Runner／runner | 各档案页统一标题、数据、筛选、列表、弹层，取消装饰图标与彩色城市卡 | Web：数据、生涯、足迹、收藏、影像、设备、帮助；mini：六个档案页和 mine 内帮助；登录、空态、错误、上传／删除等既有回归 |
| RaceHistory／history／RaceHistoryFields | 跑史导航、筛选、成长记录、回顾、导入和表单统一；修正 390px 导航外溢 | 成长、回忆、详情、导入、手动录入、编辑、识别确认、空态、游客；320／390 |
| AchievementPoster／achievement-poster／Poster | 操作区采用统一红白灰控件和字号，移除开场装饰；输出作品保留主题 | PB、履历、多页、选择、三主题、隐私、空态、错误、保存权限；Vue Canvas 和 mini VM |
| Feedback／feedback | 面板、正文、分类和表单使用一致字号、白卡片和红色动作 | 列表、空态、错误、发布表单、草稿、详情、待审核、投票、截图、领奖；320／390 |
| Legal／LegalText／PrivacyRights／legal／privacy | 文档与个人信息权利界面统一，阅读正文 16px／1.8 | 七份文档、离线、缺失文件、游客、权利表单、记录、失败；小程序隐私同意／拒绝 |
| Look／NotFound | 运动浏览与找不到页面使用同一红黑白和标题体系 | 320／390 的实际 Vue 页面 |

## 验证

- `npm run build`：通过。
- `npm run test:mini`：通过；包含 WCC／WCSC 原生编译。
- `runner-mini-regression.cjs`、`race-history-mini-regression.cjs`、`feedback-mini-regression.cjs`、`achievement-poster-mini-regression.cjs`：通过。仅更新 Runner VM 对已移除装饰图片的旧断言，功能／权限与素材完整性断言保留。
- `runner-browser-regression.cjs`：30 项通过；`feedback-web-regression.cjs`：23 项通过；`race-history-web-acceptance.cjs`：15 项通过；`achievement-poster-20261111/web-browser-audit.cjs`：36 项通过。
- `scripts/ui-full-audit.cjs`：个人组 31 个页面／分支 × 320／390，使用隔离的真实 SQLite/API。
- `personal-system-mini-fixture.cjs` + `mini-ui-source-audit.cjs`：8 个路由、65 个页面／分支 × 320／390，复用现有 Page VM 与合成展示数据。显式加入原生按钮默认宽度压力检查；设置保持单行和 44px 点按区。

报告汇总见 [verification.json](verification.json)。截图为当前源码渲染；业务演示数据均为测试数据。

## 限制

小程序截图是 WXML／WXSS 浏览器源码镜像，原生选择器、滚动区域与导航栏由浏览器近似，不是微信模拟器或真机截图。WCC／WCSC 通过不等于真机视觉验收。没有访问生产业务资料、外部设备厂商或执行部署。全站公共 header／tabbar 和全局字号由集成分支统一，本提交只改个人组页面及其私有样式。
