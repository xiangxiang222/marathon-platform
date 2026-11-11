# 跑团跑量、常设训练组与成员主页验收

本轮独立验收针对实际 Web 页面、新 Mini Page / Component 和后端统计函数，所有业务数据使用内存 fixture；不读取线上或本地真实业务库，不发送通知、不发布生产版本。

结果：实际 SQL/日期 9 组、Web 流程 27 组、Mini VM 14 组、Mini 源码镜像 30 场全部通过。旧模板专项 Mini 18 组、Web 24 组通过。截图与当前 JSON 报告见[验收画廊](../design/previews/club-mileage-20261111/index.html)。只提交 8 张代表图，其余场景图与镜像 HTML 留在本地并由目录 `.gitignore` 排除。

## 覆盖范围

- 实际 `boardOf/windowOf/activityTrainingGroups` 在独立内存 SQLite 上验证北京时间新年、周一至下一周一、闰年二月、区间末端排除、未来记录排除。日/月/年/累计设置为不同值，避免将旧接口累计 `totalKm` 当作当前周期总计。
- 全员、常设训练组、未分组 `groupId=0` 和空组分别验证；保留零跑量在团成员、并列名次稳定、跨团组拒绝。配速使用实际距离，跑量使用本团计入公里，两者不混淆。分组按成员当前归属汇总该周期历史已计入本团的跑量。
- Web 覆盖 320 / 390 / 1440 px，五周期及日期选择、搜索与组筛选、选中组删除后回退全员一次、旧周期迟到响应、错误重试。训练组新增/编辑/归组/删除均检查实际请求字段。
- 排行进入团内成员主页保留日期与周期；其他成员没有自我介绍编辑入口，也不请求 `/me/runner`。本人编辑介绍使用 `/me/introduction`；主页显示安全的最近运动摘要，当前周期与累计标签分开。
- 活动显式选择常设组后提交 `groups[].trainingGroupId`；可修改本次配速而不修改常设组。30 组库不会自动创建 30 个活动组，默认仅一个全员组，最多实际选择 12 个。保存模板剔除来源关联，来源组删除保留已复制的训练安排。
- Mini 使用实际 Component / Page VM 验证权限、归组 picker 的稳定 id、自然周/年跨年前进、隐藏/卸载/切团/换账号后的迟到响应、删除组选中回退、普通成员禁止修改、介绍草稿切周期保留。
- Mini 镜像展开了真实 `mileage-board` 组件的 WXML/WXSS 和运行后数据，包含 5 个路由及 15 个展示场景，分别在 320 / 390 px 验证。包含普通成员、空组、失败、长昵称、本人、组编辑 sheet 和活动选组。

## 验收发现与修复复核

初轮发现 Mini 年份前进保留旧月份、周前进按日期而非自然周期比较，成员页非累计周期标签误写累计，以及看板组卡继承按钮横向布局/浅色背景被重置。实现方已修复；当前测试、镜像和截图均来自修复后的源码。空值分支也明确保护 `board.period` 与未分组成员的 `profile.group`。

## 原生与语法

`npm run test:mini` 通过：47 份 JS、36 份 JSON、35 份 WXSS 严格解析、10 个语法 fixture、58 个相对模块引用；原生编译 32 份 WXML、35 入口 WXSS，WXSS 产物 380117 字节，双文件入口覆盖探针通过。

Mini 图片是浏览器源码镜像，不是微信开发者工具或真机截图。原生控件、组件样式隔离与微信运行时有近似；原生离线编译只补充语法/入口验证，不声称完成真机视觉测试。本轮没有重跑完整客户端套件；后端完整套件结果由实现方独立提供。

## 重跑命令

```sh
node design/previews/club-mileage-data-regression.cjs
node design/previews/club-mileage-mini-regression.cjs
node design/previews/club-mileage-browser-regression.cjs
UI_AUDIT_OUT=design/previews/club-mileage-20261111/mini UI_PALETTE_PROFILE=colorful MINI_MILEAGE_AUDIT=1 MINI_AUDIT_ROUTES=pages/club/club,pages/mileage/mileage,pages/training-groups/training-groups,pages/member-profile/member-profile,pages/activity-create/activity-create node design/previews/mini-ui-source-audit.cjs
node design/previews/activity-template-mini-regression.cjs
npm run test:mini
node design/previews/club-mileage-gallery.cjs
```

Web 模板兼容脚本由 Web 实现方独占执行，结果位于本地 `club-mileage-20261111/templates-compat/browser-report.json`，画廊汇总为 `compatibility-report.json`。Web 浏览器专项需要本地 Chrome；本地 Vite 不存在时自行启动并结束。日志：`/tmp/club-mileage-{data,browser,mini-vm,mini-mirror,native,template-mini,gallery}-20261111.log`。
