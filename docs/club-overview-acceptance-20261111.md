# 跑团概览与全部成员入口验收

本轮范围是实际 Web `Club.vue` 和 Mini `pages/club/club.*`。测试脚本不修改业务数据，API 全部在内存拦截；小程序逻辑使用实际 Page 脚本的 VM，视觉使用实际 WXML/WXSS 的浏览器镜像。

- Web：30 组通过，覆盖 320 / 390 / 1440 px。
- Mini Page VM：31 组通过，包括原有权限、跨账号/跑团过期响应与分享回归。
- Mini 视觉：7 场景 × 320 / 390 px，共 14 场通过。
- `npm run test:mini`：全部通过，31 份 WXSS 严格解析、10 个语法内存 fixture、29 份 WXML 原生编译、31 入口 WXSS 原生编译；产物 351967 字节。双文件覆盖探针通过。

入口：[截图与报告](../design/previews/club-overview-20261111/index.html)。Web 和 Mini 各 4 张代表图，JSON 报告可从入口打开。全量场景截图留在本地输出目录，由该目录的 `.gitignore` 排除；提交版本只保留这 8 张代表图。

## 行为覆盖

顶部头像与人数从概览、成员、会费和管理页面打开后，搜索为空、角色为全部、成员区为完整目录，旧服务区、关系展开、`section` 和 `mine` 状态清除。测试使用 6 位合成成员，包含带 A/C/E 字母的蓝、薄荷、桃色本地合成 SVG 头像及首字回退，以及长昵称。训练显示正常标题，技术边界通过 fixture 注释和 id 区分。

一级标签为“概览”。固定北京时间 2026-10-30 08:00（Web 浏览器时区特意设为纽约）验证活动：有效进行中标“正在进行”，未来场次才标“下一场团练”；已结束、取消、多年前未结束、昨日无结束时间、结束时间已过、过去但仍报名中、非法日期和非法结束时间均不进入概览首卡。旧无结束时间但当天进行中的活动保留兼容。无可展示活动使用空态。

“我的待参加”继续包含有效进行中与未来已报名活动；未报名场次不计入，列表 URL 筛选刷新仍保留。分享取消不报错、真实复制回退及旧团会费响应不能覆盖新团也继续通过。

视觉覆盖长团名、头像与回退头像行、全部成员长昵称、未来活动、进行中和空态；无横向溢出、缺失 handler、表达式错误或坏图。

## 重跑

```sh
node design/previews/club-navigation-regression.cjs
CLUB_AUDIT_OUT=design/previews/club-overview-20261111 node design/previews/mini-club-redesign-regression.cjs
UI_AUDIT_OUT=design/previews/club-overview-20261111/mini UI_PALETTE_PROFILE=colorful MINI_AUDIT_ROUTES=pages/club/club node design/previews/mini-ui-source-audit.cjs
npm run test:mini
```

首条命令需要本地 Chrome；如果本地 Vite 未启动，脚本自行启动并在完成后关闭。全部 API 响应为隔离内存 fixture，没有线上访问或写入。日志留在 `/tmp/club-overview-{browser,mini-vm,mini-mirror,native}-20261111.log`。

Mini 截图是源代码镜像，原生控件、页面头部和部分浏览器行为为近似；本轮没有声称微信开发者工具或真机视觉验收。原生离线编译与严格解析补充了源码语法验证。本地验收未运行完整 `test:client`，也不包含生产发布验证；合并与发布状态以对应 PR 的 CI 流水线为准。
