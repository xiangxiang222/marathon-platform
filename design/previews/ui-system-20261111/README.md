# 全站界面验收 · 20261111

[视觉与控件规范](../../控件与页面规范.md) 记录两端完整的颜色、字号、控件与页面规则。

打开 [完整预览画廊](index.html) 查看所有路由、后台分区、窄屏与关键分支。Mini 的 [320px 全 28 页联系表](mini/contact-320.png) 和 [390px 联系表](mini/contact-390.png) 只截取各页顶部；画廊同时提供完整 PNG 与 HTML。

发布边界：线上本次仅修复训练模板 API。本轮 Web 和微信小程序 UI 改造仍在本地代码，未整体发布。此轮没有执行 `deploy.sh` 或将其他未提交业务变更部署到线上。

## 范围与证据

| 范围 | 覆盖 | 报告 |
| --- | --- | --- |
| Web | 所有消费者路由、法律文件、跑者档案子页、跑团各标签、团长/管理员/成员/游客；320、390、1440px | [Web 报告](web-report.json) |
| 后台主流程 | 总览、内容审核、赛事库、官网同步、资讯、跑者、跑团、申请、运动、礼品、合作物资、账号权限；管理员及跑团管理员；320、390、1024、1440px | [后台流程报告](admin-browser-report.json) |
| 后台状态 | 反馈、组织身份核验、个人信息权利、登录、移动导航、编辑、空态、服务错误与保存中状态 | [后台状态报告](admin-ui-full-audit-report.json) |
| Mini 页面 | 注册的全部 28 页，各 320、390px；另含活动管理编辑、普通成员、真实分组/零分组、空训练计划、错误重试、长团名及列表空态 | [Mini 页面报告](mini-report.json) |
| Mini 模板 | 有模板、草稿、分组、命名弹窗、新建模板、预览、普通成员、加载错误、空模板库、长名字、保存失败；均在 320、390px | [Mini 模板报告](mini-training-report.json) |

最终结果为 Web 198、后台流程 80、后台状态 138、Mini 页面 76、Mini 模板 22，共 514 项检查/场景通过；后台共生成 195 张截图。机器结果见 [总报告](summary.json)。全量脚本检查页面宽度、可见图片、运行异常及 Web 控制台错误。Web 辅助 caption 可为 11px，按钮与表单标签至少 12px；正文和标题的具体层级仍需结合截图目检。11px 辅助文字记录在 `captionText`，不代表所有正文都可用该字号。

Activity 与 Signup 另检查固定底栏左右 padding 至少 8px，主按钮左右均内缩至少 8px，覆盖窄屏和 Activity 权限/分组分支。内部越界日志保留可横向滚动的 Web 日期/分类栏，以及由父容器裁切的 Mini 跑道装饰；它们没有造成页面横向溢出。

Web 验收创建一次性 SQLite、本机 API 和合成注册资料，结束后清理；后台每个 API 请求由内存资料响应；Mini 读取当前 WXML/WXSS 与合成资料，阻断 HTTP 请求。所有截图均不包含生产业务数据。

## 模板接口故障

小程序默认 `USE_LOCAL_API=false`，请求 `https://togetherbetter.cn`。修复前模板 GET 返回 HTML 404，正文为 `Cannot GET /marathon/api/clubs/1/activity-templates`；SSH 只读检查发现线上缺少模板模块及挂载、初始化。PM2 的运行目录为 `/var/www/marathon`。

root 比对确认仅 5 个运行文件涉及模板修复，在 `/home/ubuntu/marathon-data-backups/template-api-20261110T162712Z` 备份原文件与一致 SQLite 后选择性同步，并重启 PM2。root 验证本机及公开未登录 GET 均返回 401 JSON，已有团长账号只读 GET 本人跑团模板返回 200；`users`、`clubs`、`activities`、`club_members` 计数与备份一致。验证中没有创建活动、用户或跑团，凭证未写入报告。

小程序请求工具已区分 HTML 404、登录/权限失败和 5xx，同时保留服务端 JSON `error`、`code`、`status`。root 新增的 [请求工具回归脚本](../mini-request-regression.cjs) 使用 9 个合成响应验证，不访问生产。完整事实记录见 [API 诊断报告](api-diagnosis.json)。

活动分组另经源码只读确认：发布请求中的非空 `groups` 在创建活动的同一事务写入 `activity_groups`，详情优先使用该快照；没有快照时沿用旧版 `club_groups` 回退。Mini 发布包含启用的组别及默认“全员组”。新界面的分组角标显示组数，与报名人数分开。

## 重跑

在仓库根目录执行，默认输出本目录：

```sh
node scripts/ui-system-audit.cjs
```

可只运行某端，或指定独立输出目录：

```sh
node scripts/ui-system-audit.cjs web admin
UI_AUDIT_OUT=design/previews/ui-system-next node scripts/ui-system-audit.cjs mini
node scripts/ui-audit-gallery.cjs
```

底层 Web、两套后台及两套 Mini 预览脚本都支持 `UI_AUDIT_OUT` 和 `UI_AUDIT_REPORT`。总入口为后台启动独立本机 Vite，无需依赖其他开发服务器；Web 使用自己的本机服务和隔离数据库。

## 验证边界

Mini 浏览器镜像不是微信模拟器或真机截图；原生输入、时间选择器、开关、滚动区域和自定义页头由浏览器近似呈现。不能据此证明微信授权、上传、分享、第三方设备或生产部署正常，仍需原生编译与真机验证。完整 PNG 中固定底栏停留在初始视口位置，这是浏览器整页截图的表现；请用首屏截图判断底栏布局。

页面清单与状态覆盖不会穷尽所有交互。父任务另已运行后端 `npm test`，273 项通过，见 [后端测试日志](backend-test.log)；23 套前端逻辑回归通过，见 [client 报告](client-regression-report.json)；小程序原生编译记录见 [native 日志](mini-native.log)。请求工具及前端逻辑回归属于独立证据，不以截图替代。Web 代理专项报告也已归档：[focused 覆盖清单](specialized/web-ui-focus-report.json)、[模板流程](specialized/web-template-browser-report.json)、[跑团导航](specialized/club-navigation-report.json)；其中的临时截图不替代本目录真实隔离 API 全量预览。
