# 精选资讯人物入口（2026-11-12）

运动员与官兔入口保持赛事页的红黑白、15px 标题、12px 辅助文字与 12px 卡片圆角，增加栏目眉题、履历说明、人物照片和明确的进入箭头。两卡等高，320px 不缩小标题。

运动员入口使用现有公开档案照片；官兔有本人照片时显示照片，暂无照片时显示已收录配速任务的真实目标时间。不会用赛事合照替代个人头像，也不以固定文案宣称当前收录人数。

精选页独立请求两组、每组最多 6 条公开档案，只取最多 3 张照片用于展示。同一页面切换栏目时复用成功的预览，预览失败不阻塞资讯正文，图片失败自动回退；切换栏目或卸载后忽略迟到结果。跑团资讯不增加预览请求。

验证：

- `node scripts/news-entry-live.cjs`：320/390px 共 8 项真实本地 API/浏览器检查，涵盖入口导航、原目录筛选、缓存、请求失败、破图及长目标时间；产生 6 张截图。
- `node scripts/content-mini-regression.cjs`：21 项通过，包括预览独立加载、缓存、地址转换、破图回退、切换和卸载隔离。
- `MINI_AUDIT_FIXTURE=scripts/news-entry-mini-fixture.cjs MINI_AUDIT_ROUTES=pages/news/news UI_UNIFIED_VISUAL=1 node design/previews/mini-ui-source-audit.cjs`：4 状态 × 320/390px，实际 Page 数据与现有照片，8 场景通过。
- `npm run test:mini`：WXML/WXSS 原生离线编译通过。`npm run build` 通过。

浏览器源码镜像与离线编译不等同微信真机验收或正式发布。线上数据未修改。
