# 活动与跑团服务页面统一设计验收

本组基于 `7445258`，覆盖下表全部 Vue 与小程序页面。统一采用赛事页的红、黑、白：主色 `#ff1838`、选中浅红 `#fff0f2`、页面底 `#f5f5f5`、白卡、正文 `#1a1a1a`、辅助文字 `#777`、分隔线 `#eee`。所有改动在本地隔离工作区完成，没有访问或写入生产数据。

字号按页面标题 24、区块标题 18、行标题 15、正文 14、辅助信息 12 px，预览阅读正文 16 px / 1.8 行高。卡片圆角 12、控件圆角 8，页面外边距及卡片内边距 16，主要操作 44 px。辅助操作改成文字或轻边框，去掉装饰轨道、糖果色和不承担业务含义的大图形。

| 页面 | Vue 文件 | 小程序页面 | 本轮布局与控件处理 | 验证 |
| --- | --- | --- | --- | --- |
| 活动详情 | Activity.vue | activity | 标题先于里程，状态与辅助信息区分；活动说明、分组、名单、组织者工具分层；固定报名栏归入页面作用域 | 320/390，管理员/成员、分组/无分组、空计划/异常；真实 API 五角色 |
| 发布训练及模板 | ActivityCreate.vue | activity-create | 三步进度、模板选择和本次安排分区；模板纵向完整显示、常设组可见网格；底栏主次按钮及模板保存弹层统一 | 三步、草稿、模板新建/编辑、保存失败、无权限、长名称、常设组共 12 场景 × 双宽 |
| 报名 | Signup.vue | signup | 事件摘要、组别单选和补充信息分层；选中浅红、紧凑固定提交栏 | 双宽；报名写操作及不可报名状态回归 |
| 相册 | Album.vue | album | 照片/视频主标签、排序与审核工具降级为次操作；媒体网格与上传主操作统一 | 双宽；空/异常、管理、查看大图；真实 HTTP 上传与审核 |
| 成绩接龙 | Call.vue | call | 信息摘要、录入、成绩名单与管理面板分区，分享/导出采用文字操作 | 双宽镜像及真实 API；团长/管理/成员/团外/游客 |
| 约跑 | Meetup.vue | meetup | 约跑信息、我的参与、名单与合影保持同一白卡信息层级 | 双宽镜像及真实 API，多角色 |
| 队内赛 | Internal.vue | internal | 比赛摘要、组别选择、成绩和管理工具统一；清晰保留状态与权限 | 双宽镜像及真实 API，多角色 |
| 公开名片与分享 | ClubIntro.vue | club-intro | 去装饰轨道，紧凑组织身份、负责人及成员信息；服务图标单色，分享弹层与主操作一致 | 双宽；游客、已加入、待审核、受限状态及分享/回跳回归 |
| 创建跑团 | ClubCreate.vue | 创建表单位于 clubs，由跑团主页面组负责 | 功能标题与字段优先，预览卡简化，移除营销式大标题和装饰 | 双宽视觉 + 真实创建/同名辨认流程 |
| 身份核验 | ClubIdentity.vue | club-identity | 公开资料、核验进度、私密申请三层表单；清晰的字段与保存/提交操作 | 双宽；真实申请/补充/换号与迟到响应隔离 |
| 名称与身份反馈 | ClubReport.vue | club-report | 反馈类型、材料、联系方式和工单进度一致排版 | 双宽；真实私密提交、补充、受限与复核流程 |
| 跑团资讯编辑 | ClubNewsEditor.vue | news/editor | 编辑字段、发布操作、阅读预览和已存内容分区；正文阅读规格一致 | Web 7 场景与 mini 8 场景 × 双宽 |

样式通过本组独有 `web/src/service-ui.css` 与 `miniprogram/utils/service-ui.wxss` 限定在服务页面，不修改全局字体、导航、共享 `club-detail` 或其他组负责的页面；未更改业务 JS、接口、权限判断、报名/上传/发布流程或账号隔离。

## 验证结果

- `activity-browser-regression.cjs`：34 检查、8 次隔离写操作、16 张截图，全部通过。仅同步调整标题定位器为“基本信息”。
- `activity-template-browser-regression.cjs`：24 检查通过；`activity-template-mini-regression.cjs`：18 检查通过。
- `activity-template-mini-mirror.cjs`：12 场景 × 320/390，共 24 通过。增加常设组完整可见、底栏位于页面作用域及主按钮品牌色断言。
- `unified-service-web-audit.cjs`：17 场景 × 320/390，共 34 通过；可见文字不小于 12、控件不小于 44、无破图或横向溢出。
- `mini-ui-source-audit.cjs` 限定本组 10 页：16 场景 × 双宽，共 32 通过；另使用 `unified-service-editor-fixture.cjs`，资讯编辑 8 场景 × 双宽，共 16 通过。
- `club-live-acceptance.cjs --details-only`：临时数据库中 29 HTTP 检查通过，5 角色 × 320/390/1440 的 15 个布局组、36 次详情访问通过。
- `club-open-creation-live.cjs`：9 项真实 HTTP 与浏览器创建/核验/私密反馈/切换账号流程通过。
- `club-intro-share-regression.cjs`：18 项公开分享、申请回跳和权限检查通过。
- `npm run test:mini` 与 `npm run build` 通过。

结果与代表截图位于 [unified-services-20261112](../design/previews/unified-services-20261112/report.json)。小程序截图是当前 WXML/WXSS 与实际 Page 方法/合成数据的浏览器源码镜像，原生控件由浏览器近似，**不作为微信模拟器或真机验证**。Web 视觉场景采用隔离合成接口；权限和数据写入由独立临时数据库 HTTP 流程验证。

## 复验命令

```sh
MARATHON_PREVIEW_URL=http://127.0.0.1:5196/marathon node design/previews/unified-service-web-audit.cjs
UI_AUDIT_OUT=/tmp/unified-activities-create-mini node design/previews/activity-template-mini-mirror.cjs
MINI_AUDIT_FIXTURE=design/previews/unified-service-editor-fixture.cjs UI_AUDIT_OUT=/tmp/unified-services-editor-mini node design/previews/mini-ui-source-audit.cjs
MINI_AUDIT_ROUTES=pages/activity/activity,pages/signup/signup,pages/album/album,pages/call/call,pages/meetup/meetup,pages/internal/internal,pages/club-intro/club-intro,pages/club-identity/club-identity,pages/club-report/club-report,pages/news/editor UI_AUDIT_OUT=/tmp/unified-activities-mini node design/previews/mini-ui-source-audit.cjs
MARATHON_LIVE_PREVIEW_PORT=5197 node design/previews/club-live-acceptance.cjs --details-only
node design/previews/club-open-creation-live.cjs
npm run test:mini
npm run build
```
