# 首页与目录的赛事地标

首页由三张纵向文字卡改成并排的三张地标卡：北马用天安门，上马用东方明珠，厦马用双子塔与演武大桥。图标采用统一灰色线面与少量品牌红，名称、认证、年份与档案届数保留原生文字；三场均直接可见，无需横滑。

首页标题18px、赛事名称15px、认证与年份至少12px，卡片整块可进入对应档案。双认证同年时共享年份，异年时分别标注；届数来自接口的年份数组。目录沿用同一组图标，展示完整认证机构、等级、年份及简介，搜索筛选和详情回链保留。

Web矢量源位于 `web/public/images/race-landmarks/`，小程序使用同源240×192透明PNG，运行 `node scripts/sync-race-landmarks.cjs` 可重新导出。图标表示城市地标，不作为比赛线路或赛事官方标志。

预览：

- [Web 390px首页模块](../design/previews/race-landmarks-20261114/web-home-module-390.png)
- [Web 320px首页模块](../design/previews/race-landmarks-20261114/web-home-module-320.png)
- [Web 390px目录](../design/previews/race-landmarks-20261114/web-directory-390.png)
- [小程序390px源码镜像](../design/previews/race-landmarks-20261114/mini-home-module-390.png)

验证：真实API与Vue在320/390/1440px共21项检查、69个视图；首页覆盖3卡同排、图片与详情跳转、搜索隐藏和接口失败后重试。小程序年度档案5项回归、原生WCC/WCSC编译、Web构建及包体积检查通过。小程序源码镜像用于布局检查，不等同微信真机或正式客户端发布。
