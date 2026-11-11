# 个人成绩海报预览与验收

打开 [预览画廊](index.html)，查看真实 Canvas 高清海报与 Web 工作室、小程序源码镜像。完整设计见 [功能与数据说明](../../../docs/achievement-poster-design-20261111.md)。所有展示记录均为合成样例；小程序不是微信真机验收。

本轮只增加本人海报工作室与入口，不改服务端或比赛成绩。PB 仅使用生涯线下公路赛事最好成绩，履历支持全部/按年与逐项多选。三主题、四文案、隐私开关、1080px PNG；20 条以内一张长图，更多明确分页并保留全部记录。Web 支持 PNG 下载与支持设备上的系统文件分享，小程序支持原生预览与逐张存相册。

在干净 checkout 安装项目依赖后运行：

```sh
node --test scripts/achievement-model.test.cjs
node scripts/sync-achievement-model.cjs --check
node scripts/sync-achievement-poster.cjs --check
node scripts/achievement-poster-canvas-check.cjs
node design/previews/achievement-poster-mini-regression.cjs
node design/previews/achievement-poster-mini-preview.cjs
MINI_NATIVE_REPORT=design/previews/achievement-poster-20261111/mini/native-report.json node design/previews/mini-native-check.cjs
node design/previews/achievement-poster-20261111/web-browser-audit.cjs
node design/previews/achievement-poster-20261111/web-entry-audit.cjs
node design/previews/achievement-poster-20261111/session-isolation-audit.cjs
npm run build --prefix web
```

浏览器专项需要本机 Chrome，具体默认路径和可覆盖变量见脚本；Mini 原生离线编译沿用项目既有工具。结果：模型 17、Canvas 边界/隐私 5、Web 流程 36、Web 入口 7、Mini VM 14、独立隔离 5 项通过；Mini 20 个源码镜像与 7 张真实 Canvas PNG 通过，33 WXML/36 WXSS/51 JS/37 JSON 检查通过。无业务写请求、无生产数据修改。系统分享、微信原生 Canvas 与相册交互的实际体验仍需在用户设备确认。
