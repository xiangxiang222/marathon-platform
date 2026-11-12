# 跑团界面统一为赛事页风格

覆盖 Web 跑团目录、跑团详情全部栏目、跑量看板、常设训练组、团友主页、合作权益与动态；小程序覆盖 clubs、club、member-profile、training-groups、mileage、partner、feed 及共享跑量组件。

统一采用赛事红 `#ff1838`、浅红 `#fff0f2`、页面灰 `#f5f5f5` 与白卡。移除绿色数据板、暖白背景、彩色默认头像和自创标记。详情采用白色身份区、红短线主导航、轻量次导航；服务入口改双列，跑量采用白底深色数字，动态采用独立帖子与紧凑输入行。保持目录默认四团与展开、训练组默认四组与展开、稳定 ID 筛选、成员管理、权限与账户隔离逻辑。

标题 24px，区块标题 18px，行标题 15px，正文 14px，辅助字最小 12px，字重最高 600。卡片 10–12px 圆角，页面左右 16px，触控目标 44px；小程序原生按钮显式定义宽度。

验证：

- Web 详情 26 场景、跑量 30 项、团友主页 20 项、动态/合作 8 场景；真实 API 跑团目录 9 项，含普通用户建团、搜索、展开、账户切换。
- 小程序源码镜像共 118 场景，包含 320px / 390px、原生 button 默认宽度模型、团友五栏目、训练组编辑、动态评论、合作有无内容、空态和异常。
- 小程序跑量 VM 15 项与跑团 VM 31 项；全注册页面 WXML/WXSS 原生编译通过，Web build 通过。
- 逐栏目检查截图，修复紧凑导航触控高度、建团入口宽度与合作领取按钮挤压正文。

精选截图与逐场景结果在 [club-unified-20261112](../design/previews/club-unified-20261112/report.json)。镜像截图用于检查当前 WXML/WXSS 布局，不能等同微信模拟器或真机结果；图片与账户为独立验收数据。

复验命令（Vite 自行启动，例端口 5192）：

```sh
CLUB_VISUAL_URL=http://127.0.0.1:5192/marathon node scripts/club-detail-visual-v5.cjs
CLUB_VISUAL_URL=http://127.0.0.1:5192/marathon node scripts/club-unified-visual-web.cjs
MARATHON_PREVIEW_URL=http://127.0.0.1:5192/marathon node design/previews/club-mileage-browser-regression.cjs
MEMBER_PROFILE_URL=http://127.0.0.1:5192/marathon node design/previews/member-profile-web-regression.cjs
node scripts/club-directory-v5-live.cjs
MINI_AUDIT_FIXTURE=scripts/club-unified-visual-fixture.cjs node design/previews/mini-ui-source-audit.cjs
npm run test:mini
node design/previews/mini-club-redesign-regression.cjs
node design/previews/club-mileage-mini-regression.cjs
npm run build
```
