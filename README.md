# 赛历

跑团一起看谁报了哪场、截止前谁还没缴。报名在赛事网站完成，这里记节点、报名状态，以及团里谁还没缴。

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

## 上线

合并到 `main` 后，GitHub Actions 先跑单元测试，通过再部署。Secret `DEPLOY_SSH_KEY` 与同行者众用同一把能登录 `ubuntu@140.143.171.77` 的私钥。
