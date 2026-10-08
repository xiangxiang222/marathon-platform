# 赛历

跑团一起看谁报了哪场、截止前谁还没缴。界面按数字心动的青色顶栏和白卡片来做。

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

## 上线

合并到 `main` 后，GitHub Actions 先跑单元测试，通过再部署。Secret `DEPLOY_SSH_KEY` 与同行者众用同一把能登录 `ubuntu@140.143.171.77` 的私钥。
