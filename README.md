# 赛历

跑团一起看谁报了哪场、截止前谁还没缴，也在团里报每周的训练。满人数并且每人打卡够里程才记分，积分可以换礼品。后台可以给已收入的赛事补规程原图和报名、查询链接，自动拉到的截止日期不会被盖掉。界面以红、白、浅灰为主，日期卡使用中性色，报名和截止状态通过文字标签呈现。

公司主体与同行者众相同：北京华创科技有限公司。代码仓库在同一 GitHub 账号下，部署在同一台腾讯云，目录、端口、进程都分开，不碰 `/var/www/beiyexing`。

线上：<https://togetherbetter.cn/marathon/>

## 本地

需要 Node.js 20。

```bash
npm install
npm run install:all
npm test
npm run dev
```

浏览器打开 <http://127.0.0.1:5174/marathon/> 。接口在 `3790`。

微信原生小程序放在 `miniprogram/`，用微信开发者工具打开该目录，打同一套接口。本地联调时在 `miniprogram/config.js` 把 `USE_LOCAL_API` 改为 `true`，并关闭「校验合法域名」。AppID 单独申请，不要用同行者众的。密钥只放服务器上的 `.env`。

微信登录需要在服务器 `.env` 配置 `WECHAT_MINIPROGRAM_APP_ID` 和 `WECHAT_MINIPROGRAM_APP_SECRET`。旧昵称密码账号可以登录后绑定微信；分享入团需团长或跑团管理审核。跑团分区和微信接入约束见 [跑团产品设计与微信接入规范](跑团产品设计与微信接入规范.md)。

## 上线

合并到 `main` 后，GitHub Actions 先跑单元测试，通过再部署。Secret `DEPLOY_SSH_KEY` 与同行者众用同一把能登录 `ubuntu@140.143.171.77` 的私钥。

本轮信息架构和交互见 [产品与 UI 改版方案](design/产品与UI改版方案.md)，两端配色、字体、图标和组件规范见 [视觉规范](design/视觉规范.md)。预览和校验说明见 [改版预览](design/previews/README.md)。

本次外部 Review 的核实、修复与账号恢复边界见 [Review 问题修复说明](design/Review问题修复说明.md)。头像文件随 `MARATHON_MEDIA/avatars` 一并持久化和备份，数据库保存文件名，启动时兼容迁移有效旧头像。
