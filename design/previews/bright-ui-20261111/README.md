# 红白浅灰配色验收 · 20261111

[视觉与控件规范](../../控件与页面规范.md) · [完整画廊](index.html) · [机器总报告](summary.json)

本轮恢复原版红、白、浅灰色板，并做少量视觉细调，保留已有页面布局与业务流程；不把配色回调描述为全页布局重构。主色为 `#e1251b`，背景 `#f5f5f5`，卡片 `#ffffff`，正文 `#262626`，次级文字 `#737373`，边框 `#ebebed`。Web 与 Mini 报告的 `palette` 来自页面实际渲染的 CSS 变量，`expectedAccent` 记录本次验收主色。

本报告全部来自本地隔离环境，未访问、修改或部署生产系统。Web 使用一次性 SQLite 与本机真实 API；后台所有请求由内存资料响应；Mini 使用当前 WXML/WXSS 和合成展示资料并阻断 HTTP 请求。界面中的账号、跑团、赛事与运动记录均为测试资料。

## 结果与范围

最终结果为 Web 198、后台主流程 80、后台状态 138、Mini 页面 76、Mini 模板 22，共 514 项检查/场景通过；8 组前后对照已生成。详见 [总报告](summary.json)。Web 与后台没有脚本或控制台错误，Mini 没有表达式、事件绑定、图片或页面横向溢出问题。全量范围如下：

| 范围 | 覆盖 | 报告 |
| --- | --- | --- |
| Web | 66 个路由与角色场景，各 320、390、1440px；真实隔离 API、图片、控制台、脚本错误、文字下限与横向溢出 | [Web](web-report.json) |
| 后台 | 全部分区与权限流程，320、390、1024、1440px；编辑、空态、错误、登录和移动导航 | [主流程](admin-browser-report.json)、[状态](admin-ui-full-audit-report.json) |
| Mini | 全部 28 页，各 320、390px，另含管理/非管理、分组/空分组、错误、空态、长标题 | [页面](mini-report.json) |
| Mini 模板 | 模板库、草稿、分组、命名弹窗、新建、预览、普通成员、加载失败、空库、长团名与保存失败 | [模板](mini-training-report.json) |

Activity 的 Web 与 Mini hero 均记录实际背景、渐变、文字颜色与明度，要求背景明度至少 0.85、暗色正文最高明度 0.3，防止大块暗色背景回归。页面同时记录 `darkNeutralControls` 供截图检查，本轮 Web、后台与 Mini 页面未发现大块暗灰控件。Activity 与 Signup 保留固定底栏左右 padding 至少 8px、主按钮距屏幕左右边缘至少 8px 的断言。原生安全区声明继续使用有效基础 padding 与独立的 `constant()` / `env()` 底部声明。

Web 辅助 caption 可为 11px，按钮和表单标签至少 12px；11px 不代表正文也可用该字号。控件可读性与具体字级仍结合截图目检。横向滚动栏和被父容器裁切的装饰可出现在内部越界日志中，页面自身必须没有横向溢出。

## 前后对照

[对照来源清单](comparison-report.json) 保留每张图的前后来源。上轮截图来自 [ui-system-20261111](../ui-system-20261111/index.html)，当前截图保存在本目录；对照覆盖 Web 首页、Activity、发布页，Mini 赛历首页、跑团首页、Activity、发布页，以及后台总览。组合 PNG 左为上轮偏暗色板，右为当前红白浅灰；移动端取顶部 900px，桌面后台等比缩小。

完整页面见画廊中的 PNG / HTML；[Mini 320px 联系表](mini/contact-320.png) 和 [390px 联系表](mini/contact-390.png) 仅截取每页顶部。固定底栏在整页截图中停留于初始视口位置，请结合首屏查看其边距。

## 重跑

在仓库根目录执行，默认主色为 `#e1251b`、默认输出为本目录：

```sh
UI_EXPECTED_ACCENT='#e1251b' node scripts/ui-system-audit.cjs
```

可单独运行某端，或指定独立输出路径：

```sh
node scripts/ui-system-audit.cjs web admin
node scripts/ui-system-audit.cjs mini
UI_AUDIT_OUT=design/previews/bright-ui-next UI_EXPECTED_ACCENT='#e1251b' node scripts/ui-system-audit.cjs
node scripts/ui-palette-comparison.cjs
node scripts/ui-audit-gallery.cjs
```

底层脚本支持 `UI_AUDIT_OUT` / `UI_AUDIT_REPORT`；色板断言支持 `UI_EXPECTED_ACCENT`。`UI_AUDIT_BEFORE` 可指定对照基线目录。单端重跑会保留其余端的已有结果；请顺序重跑同一输出目录。

## 验证边界

Mini 为浏览器源码镜像，不是微信模拟器或真机截图。原生输入、选择器、开关、滚动区域及自定义页头为近似表现，不能据此证明微信授权、分享、上传、第三方设备或生产部署正常。页面场景不穷尽所有交互；本轮没有修改后端业务，也没有重复执行后端全量测试。上一轮后端与客户端回归证据保留在 [前轮报告](../ui-system-20261111/README.md)，不冒充本轮运行结果。
