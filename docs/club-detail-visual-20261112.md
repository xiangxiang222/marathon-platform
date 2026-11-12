# 跑团详情视觉调整 · 2026-11-12

详情页改用暖白背景、白色卡片、莓红主操作和鼠尾草绿状态。一级导航为深浅分层的 segment，活动、赛事、成员、会费及服务使用同一套边距、圆角和文字层级。

- 活动保持真实状态，报名信息独立显示；复制入口缩为卡片底部次操作。
- 赛事日期和标题分层，名单可展开，复制与赛事画像保持原操作。
- 成员管理按钮显式设置 auto 宽度与不可压缩，筛选人数保持同排；名单统一圆角。
- 会费昵称整行显示，三个状态操作在下一行，选中项为浅绿。
- 服务图标使用本地线性图形。详情页样式限定在本组件和本原生页面，不修改成员个人页或全局主题。

只调整模板和样式，沿用现有数据、权限、导航和提交方法；小程序 JavaScript 未改。跑量看板由独立变更处理。

## 验证

- `npm run build`（web）：通过。
- `node design/previews/mini-native-check.cjs`：WCC、WCSC 原生编译通过。
- `node design/previews/mini-club-redesign-regression.cjs`：31 项通过。
- `MARATHON_PREVIEW_URL=http://127.0.0.1:5186/marathon CLUB_AUDIT_OUT=design/previews/club-detail-v5-web node design/previews/club-navigation-regression.cjs`：导航、筛选与旧回调隔离通过。
- 在本工作树 web 目录运行 Vite 5186 后执行 `node scripts/club-detail-visual-v5.cjs`：320/390 各 13 场景通过，无页面横向溢出及浏览器错误；包括成员筛选、名单展开、会费表单及真实活动状态。
- `MINI_AUDIT_FIXTURE=scripts/club-detail-visual-v5-fixture.cjs UI_AUDIT_OUT=design/previews/club-detail-v5-mini-tabs node design/previews/mini-ui-source-audit.cjs`：320/390 各 13 场景通过；模拟原生 button 默认宽度后，管理按钮仍为约 54×44px，筛选人数同排，赛事日期单行。

浏览器预览使用合成展示数据，不写数据库；小程序截图为当前 WXML/WXSS 的浏览器镜像，原生编译另行验证。真实 HTTP 业务链路由合并阶段联合验收。

## 精选截图

- [Web 概览 390](../design/previews/club-detail-v5-web-tabs/overview-390.png)
- [Web 活动 320](../design/previews/club-detail-v5-web-tabs/activities-320.png)
- [Web 赛事 320](../design/previews/club-detail-v5-web-tabs/races-320.png)
- [小程序成员 320](../design/previews/club-detail-v5-mini-tabs/pages-club-club-members-320.png)
- [小程序会费设置 320](../design/previews/club-detail-v5-mini-tabs/pages-club-club-service-form-320.png)

联合真实 HTTP 回归同时校准两处过期断言：轻松跑预设本来会带入标题和训练内容，仍须清空本次日期与期次；主导航原名为“概览”。旧主线单独复现同样两项失败，未修改发布活动的实现以迎合旧断言。

联合最终验收：真实临时数据库与 HTTP 的 29 项 API 和 10 项浏览器业务流程全部通过；集成新详情与跑量组件后的 30 项 Web 跑量交互通过，无运行错误或额外业务请求。展开/收起组别只核对该组件的看板请求，避免把详情页正常后台加载当作组件额外请求。
