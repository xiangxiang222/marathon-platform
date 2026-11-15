# 改版预览与验证

## 2026-11-05 本轮全量改版

[完整验收报告](../../docs/跑团全量测试与全页面UI改版报告.md)为当前结果入口，下面其他日期的记录保留作为历史，不代表本轮测试数量。

- 网页：`ui-refresh/` 保存本轮真实本地 API 页面截图；[机器结果](ui-full-audit-report.json)。
- 后台：[全页面 UI 结果](admin-ui-full-audit-report.json)，`admin-ui-*.png` 为补充检查截图。
- 小程序：[28页源码镜像索引](mini-ui-20261105/index.html)，是浏览器布局镜像，未代表微信真机截图。
- 业务：[36个账号、6个跑团的批量结果](club-full-acceptance-report.json)。测试数据已清理，可用根目录测试命令重建验收。


## 共创建议与实物奖励（2026-10-30）

网页和小程序「我的 → 共创建议」支持功能 / UI / 问题反馈，后台审核后公示投票，持续展示采纳、开发、上线进度。领奖收件信息和物流仅本人及平台管理员可见；站内未读提醒可直达自己的建议。奖品由运营确认与寄送，没有自动采购或微信主动推送。

- 页面预览：[建议板](feedback-live-board-390.png)、[公开详情](feedback-live-detail-public-390.png)、[后台建议列表](feedback-live-admin-list-1440.png)、[后台小屏详情](feedback-live-admin-detail-320.png)。以上内容来自临时测试账号及测试建议。
- [真实联调报告](feedback-live-report.json)：三个账号通过真实接口注册，12 组场景通过，16 张截图；包括网页提交截图、后台审核、投票、真实密码登录后回原建议、未读提醒直达、采纳领奖、修改地址后的过期发货拦截、登记物流及签收。测试临时数据库和媒体在结束时清理，不读取 `.env`。
- [网页故障回归](feedback-web-report.json)：23 项；[小程序逻辑回归](feedback-mini-regression-report.json)：16 组。包括按账号保存草稿、部分截图失败、请求重试、登录过期和跨账号延迟响应隔离。
- 本轮 `npm run test:all` 通过：服务端 **175 / 175**（其中共创专项 21 项），客户端 **18 个脚本**、微信原生编译（35 JS / 29 JSON / 25 WXML / 27 WXSS）、真实共创联调及 Web 构建。

接口、页面约定与验收重点见 [共创建议接口与验收](../../docs/共创建议接口与验收.md)。微信原生上传、好友转发和朋友圈尚未做真机验收；上线前需由运营落实实际奖品，并在微信后台同步本功能的隐私指引。

## 跑团布局重构（前轮记录）

两端跑团重排为「今日 / 活动 / 赛事 / 跑量 / 成员」，优先下一场集合、常用报名、参赛名单、多团切换和个人状态。组织者表单与长分享文案按需展开。设计与测试口径见 [方案](../跑团体验重构方案.md)、[验收用例](../跑团重构验收用例.md)。

- 真实服务截图：[团首页](club-live-owner-390-1.png)、[多跑团列表](club-live-a-390-list.png)、[活动报名](club-live-a-390-1-activities-1.png)、[小屏成员管理](club-live-owner-320-1-tab-people-view-manage.png)。测试账号和记录均来自隔离临时数据库。
- [真实验收报告](club-live-acceptance-report.json)：5 个真实注册账号、2 个跑团，29 组接口场景、10 条浏览器点击旅程、15 组角色/视口布局及 180 次页面访问通过。布局访问不能等同于完成所有按钮交互。
- [网页导航专项](club-navigation-regression-report.json)：3 种宽度共 12 项；[小程序跑团逻辑](mini-club-redesign-report.json)：24 项；[小程序详情与恢复](mini-detail-recovery-report.json)：19 项。网页导航使用内存 API，Page VM 模拟小程序原生 UI，不是微信真机结果。
- 根目录 `npm test` 服务端 154 项通过（含后续导入匹配修复）；`npm run test:client` 当前为 16 个脚本，全部通过；`npm run test:mini` 和 `npm run build` 通过。`npm run test:clubs` 可复现跑团专项，真实测试数据库与媒体结束后清理。

微信原生分享、朋友圈、相册权限、设备通知和真机字号/安全区仍需微信实际环境验证。以下为较早轮次记录，数量与截图以本节及相应最新报告为准。

## 个人中心改版记录（较早轮次）

2026-10-29 新增跑者个人中心，同步 Web 与小程序：运动数据、赛事生涯、城市护照、荣誉与影像私藏。最终服务端 106/106、客户端整套 14 个脚本、小程序原生离线编译与 Web 生产构建通过。跑团公开名片、游客分享与赛事首页减负的回归同时通过；邀请地址规范化复用已加载的名片，减少一次请求与闪屏，并覆盖不同跑团名片切换。报告索引见 [本轮结果与产品缺口](../本轮验收与产品缺口.md)。

本轮按 [产品与 UI 改版方案](../产品与UI改版方案.md) 实现，四个主导航统一为「赛事 / 跑团 / 运动 / 我的」。代码同时修改了 Web 与微信小程序；这里保存本地运行的验证结果。最新客户端验收日期为 2026-10-29，能力边界见 [本轮验收与产品缺口](../本轮验收与产品缺口.md)。

## 跑者个人中心

- [我的总览](runner-mine-390.png)、[运动数据](runner-stats-390.png)、[赛事生涯](runner-career-390.png)、[城市护照](runner-footprints-390.png)、[荣誉收藏](runner-honors-390.png)、[赛事影像](runner-media-390.png)、[设备与来源](runner-devices-390.png)。截图为内存测试数据，不含真实用户记录。
- [设计方案](../跑者个人中心设计方案.md)、[验收用例与边界](../跑者个人中心验收用例.md)。
- Web 专项 [脚本](runner-browser-regression.cjs) / [报告](runner-browser-report.json)：18 组、25 张截图；320 / 390 / 1440px。小程序专项 [脚本](runner-mini-regression.cjs) / [报告](runner-mini-report.json)：12 组。两者已纳入统一客户端回归。已覆盖私人收藏脱离成绩保留、历史周文案、配速缺省/方向、同城多场与履历比赛公里。
- 设备尚未接厂商授权，当前记录来源为手动录入；城市护照是赛事城市档案，当前不提供地图。微信真机与真实视频播放、生产上传存储仍需对应环境验收。

## 跑团分享与首页布局补充

- 首页默认状态：[390px](home-declutter-default-390.png)、[320px](home-declutter-default-320.png)。顶部一排主分类与四个快捷入口，赛事形式下移到列表区域。
- 跑团公开名片：[390px](club-intro-share-guest-390.png)、[320px 长团名](club-intro-share-guest-320.png)；[微信菜单分享指引](club-intro-share-wechat-390.png)、[横屏指引](club-intro-share-wechat-landscape-568x320.png)、[浏览器备用面板](club-intro-share-options-390.png)、[等待审核](club-intro-share-pending-390.png)。以上为使用内存接口的网页截图。
- [分享专项脚本](club-intro-share-regression.cjs)及[报告](club-intro-share-report.json)：游客分享、公开链接规范化、取消/失败恢复、审核与登录回跳、小屏和横屏、页面离开后的异步响应。已纳入一键客户端回归。系统分享由浏览器 API mock 验证，小程序通过 Page VM 与原生离线编译验证；真实微信好友与朋友圈发送仍需真机验收。

## 最新验收与可重复执行入口

| 范围 | 本轮结果 | 报告 |
| --- | --- | --- |
| 服务端完整回归 | 通过，106/106 | 根目录 `npm test`；用例在 `server/test/`，使用隔离测试数据；含会费历史快照迁移 |
| 退出清理独立测试 | 通过，含于服务端套件 | [helper 内存测试](../../server/test/member-cleanup.test.js)；分钟/日期边界、用户与跑团隔离、含会费快照的事务回滚；名额重新占用与后续积分结算见 [退出验收用例](../跑团退出验收用例.md) |
| 后台浏览器 | 通过 | [报告](admin-browser-report.json)、[脚本](admin-browser-regression.cjs) |
| 活动浏览器 | 通过 | [报告](activity-browser-report.json)、[脚本](activity-browser-regression.cjs) |
| 产品浏览器 | 通过 | [报告](product-browser-report.json)、[脚本](product-browser-regression.cjs) |
| 跑团公开名片与分享 | 通过，含浏览器与小程序 VM | [报告](club-intro-share-report.json)、[脚本](club-intro-share-regression.cjs) |
| 退团浏览器 | 通过 | [报告](membership-browser-report.json)、[脚本](membership-browser-regression.cjs) |
| 相册与约跑恢复浏览器 | 通过 | [报告](detail-recovery-browser-regression.json)、[脚本](detail-recovery-browser-regression.cjs) |
| 小程序详情恢复 VM | 通过 | [报告](mini-detail-recovery-report.json)、[脚本](mini-detail-recovery-regression.cjs) |
| 小程序退团与打卡 VM | 通过 | [退团报告](mini-membership-report.json)、[打卡报告](mini-checkin-report.json) |
| 小程序活动创建 VM | 通过 | [报告](mini-activity-check-report.json) |
| Web 生产构建 / 小程序原生离线编译 | 通过 | 根目录 `npm run build` / [原生报告](mini-native-check-report.json) |

根目录先安装依赖，`npm run test:client` 运行客户端回归，`npm run test:mini` 运行微信原生离线编译，`npm run test:all` 顺序执行服务端、客户端、小程序编译和网页构建。浏览器回归使用项目中的 `playwright-core`，Chrome 路径可通过 `CHROME_PATH` 指定。部分专项默认访问 `http://127.0.0.1:5174/marathon`，可通过 `MARATHON_PREVIEW_URL` 改地址；一键运行器负责本地预览准备。

浏览器用内存接口拦截读写，VM 只运行页面逻辑，原生离线编译只检查源文件。它们都不代表微信真机、生产采集源、订阅消息或设备厂商接口已验收。失败响应恢复用例会主动返回 401/403/503，属于预期测试输入。以下早期截图和专项报告保留为历史证据；与当前界面有差别时，以本节报告和当前代码为准。

## 首次改版四页视觉快照（历史）

| 客户端 | 390px | 320px |
| --- | --- | --- |
| Web 实际页面 | [四页总览](web-overview-390.png) | [小屏总览](web-overview-320.png) |
| 小程序源码镜像 | [四页总览](mini-overview-390.png) | [小屏总览](mini-overview-320.png) |

Web 图来自本地浏览器正在运行的页面。赛事首页使用本地公开赛事接口的真实数据；登录状态的跑团、账号、运动记录使用浏览器内存示例数据，方便完整检查布局。交互验证中的写请求均由浏览器拦截，未写入实际数据库。

**小程序图片是 WXML / WXSS / Page 脚本的浏览器渲染镜像，不是微信开发者工具或真机截图。** 预览工具单独模拟系统状态栏、胶囊及底栏，代码本身读取微信系统 API。微信原生控件及字体细节仍需在开发者工具和真机核对。见 [镜像说明](mini-preview-notes.md)。

## 首次改版关键页面（历史）

- [赛事详情与个人参赛计划](web-race-390.png)
- [跑团概览](web-club-overview-390.png)、[团内赛事](web-club-races-390.png)、[训练](web-club-training-390.png)、[成员与审核](web-club-members-390.png)
- [邀请公开介绍](web-club-intro-guest-390.png)、[申请等待审核](web-club-intro-pending-390.png)
- [个人完赛记录](web-mine-results-390.png)、[个人资料展开](web-mine-profile-390.png)、[游客登录入口](web-mine-guest-390.png)

各主页面都有 320px 与 390px 单页截图。`mini-*-fixture-*.html` 是源码渲染后的静态快照；其中按钮不代表可操作的在线业务。

## 首次改版验证记录（历史）

- Web 生产构建通过。
- 赛事首页：两种宽度的搜索、类型与方式切换、地点与状态筛选、四个快捷入口、详情跳转、截止提醒切换通过；无页面脚本错误、控制台警告或失败响应。
- 个人与运动：三分区切换、资料按需展开、目标设置、保存跑步、标记参赛、游客登录后恢复参赛标记通过。写入仅使用内存 mock。见 [Web 验证报告](web-review-report.json)。
- 跑团：公开介绍、登录后恢复申请、五分区、管理表单折叠与字段、审核及详情路由切换均由浏览器验证。见 [跑团验证报告](web-club-review-report.json)。
- 当时的小程序：30 个 JS、26 个 JSON、22 个 WXML、23 个 WXSS 通过语法 / 微信原生离线编译检查，包含共享自定义标题组件及活动发布页。当前文件数量及编译结果以 [最新原生报告](mini-native-check-report.json) 为准。
- 小程序：两种宽度四页及展开表单无横向溢出、胶囊重叠或图片加载错误。见 [镜像报告](mini-source-mirror-report.json)；参赛标记与登录回跳见 [流程检查](mini-race-plan-check.json)。

本轮实现信息顺序、视觉规范及现有功能的交互重排。跑表自动同步、附近推送、站内报名等未接入能力没有在界面中伪装为可用。

## 后续 Review 修复

上述大图保留首次视觉验收的页面状态。当前赛事页已移除没有数据来源的海外入口，使用“全部赛事 / 路跑 / 越野赛”和“全部形式 / 线上赛 / 线下赛”两个独立筛选维度；游客可搜索公开跑团。微信首次使用提供账号选择，头像使用文件短地址，小程序提供官方隐私授权与指引入口。当前处理见 [Review 说明](../Review问题修复说明.md)；[账号与头像客户端回归](review-auth-client-report.json) 是早前专项历史记录。

Web 成绩接龙与全团赛事可导出完整 CSV，小程序可复制完整成绩榜/全团赛事表格；两端支持单场赛事画像和成绩长图。该能力不包含通用自定义字段接龙或 `.xlsx`。普通成员可主动退团，团长须先转让。主动退出、团内管理员移出和后台移出共用事务清理：未来团练、未出成绩的未来队内赛、明日及之后未打卡约跑报名取消，当前分钟已开场报名、当天约跑和历史签到/成绩/积分保留。会费开放期只显示现成员；离团时快照未交或保留状态，关闭期为当时成员补齐未交并固化离团标记，历史只展示快照/明确记录，关闭期不能再编辑。期次开始后加入的人不进入旧期，重新加入显示当前开放期状态但不改历史缴费与离团快照。上线前已关闭的期次仅按迁移时可见的成员关系回填离团标记，不追补无法推断的更早退出后又重入历史。签到入口在开场后显示；活动取消后不能新增签到，已有签到后不能改期到未来，无当前报名关系的保留签到标注为历史记录。旧异常提前签到已有积分在后续结算中仍保留，新提交的未来团练签到会被拒绝。本轮测试与真机验收边界见[本轮结果与产品缺口](../本轮验收与产品缺口.md)。

## 后台运营工作台

后台已按赛事运营流程重新规划为运营总览、赛事库、内容审核、官网同步、赛事资讯、跑者与跑团管理等工作区。整体采用红、白、浅灰和紧凑数据层级；总览数字来自服务端聚合，不显示虚构经营指标。完整页面地图与交互规则见[后台改版方案](../后台运营工作台改版方案.md)。

- 桌面总览：[1440px](admin-overview-1440.png)、[1024px](admin-overview-1024.png)
- 手机总览与审核：[390px总览](admin-overview-390.png)、[390px审核](admin-review-390.png)、[390px赛事编辑](admin-final-editor-390.png)、[320px赛事编辑](admin-final-editor-320.png)
- 编辑流程：[赛事编辑](admin-catalog-editor-1440.png)、[审核编辑](admin-review-editor-1440.png)、[官网同步](admin-official-1440.png)
- [浏览器回归报告](admin-browser-report.json)：57 项检查、48 张截图；覆盖 1440/1024/390px 管理员页面、1440/390px 跑团管理员、九个赛事编辑分区、审核保存/通过/打回、建团/入团分区审批、待办直达和账号密码修改。 [可重复执行的脚本](admin-browser-regression.cjs) 使用 [内存 API 数据](admin-api-fixture.cjs)，所有读写请求均被拦截，没有提交到运营数据库。 [总览尺寸与图标检查](admin-overview-final-report.json) 及 [320/390px编辑器检查](admin-mobile-editor-report.json) 记录其他视口结果。

后台脚本可独立执行 `node design/previews/admin-browser-regression.cjs`，默认访问 `http://127.0.0.1:5174/marathon`，可用 `MARATHON_PREVIEW_URL` 指定运行地址；需先启动可访问的网页服务。

## 跑团训练活动

活动详情分为活动概览、配速分组和训练安排；报名要求成员主动选择未满组别，发布活动按“基本信息 / 分组安排 / 预览发布”三步完成。日期时间说明为北京时间，副本会清空活动与报名日期；小程序草稿按账号和跑团隔离。

| 页面 | 320px | 390px |
| --- | --- | --- |
| 活动概览 | [截图](web-activity-overview-320.png) | [截图](web-activity-overview-390.png) |
| 配速分组 | [截图](web-activity-groups-320.png) | [截图](web-activity-groups-390.png) |
| 主动选择与确认报名 | [截图](web-activity-signup-320.png) | [截图](web-activity-signup-390.png) |
| 基本信息 | [截图](web-activity-create-step1-320.png) | [截图](web-activity-create-step1-390.png) |
| 分组与安排 | [截图](web-activity-create-step2-320.png) | [截图](web-activity-create-step2-390.png) |
| 发布前预览 | [截图](web-activity-create-step3-320.png) | [截图](web-activity-create-step3-390.png) |

[浏览器回归](activity-browser-regression.cjs) 在 Chrome 中检查 320/390px 页面溢出、截止状态、头像失败兜底、组别选择、模拟报名成功和发布请求；写请求由内存 API mock 拦截，没有访问业务数据库。见 [浏览器报告](activity-browser-report.json)。训练模板仅设置类型与标题提示，复制清空期次和时间，服务端再次校验截止与名额。小程序活动创建页通过 [Page VM 行为回归](mini-activity-check-report.json) 与 [微信原生离线编译报告](mini-native-check-report.json)；其页面预览镜像不在本轮截图中。
