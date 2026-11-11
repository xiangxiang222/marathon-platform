# 个人成绩与生涯 PB 海报数据设计

海报基于本人 `/me/runner` 的 `asOf`、`results` 与 `/me` 的昵称生成。沿用已保存的个人成绩，不读取私人证书、奖牌、照片、设备、轨迹或授权字段，也不将用户录入成绩表述为官方认证。本功能不新增服务端接口或修改成绩。

## 共用模型

`miniprogram/utils/achievement-model.js` 是 canonical CJS；`web/src/achievement-model.js` 是相同逻辑的 ESM。执行 `node scripts/sync-achievement-model.cjs` 生成镜像，`--check` 检查漂移。模型没有网络、存储、DOM、Canvas 或微信依赖。

导出 `STYLES`、`MODES`、`QUOTES`、`resultKey`、`normalizeResults`、`buildAchievementModel`、`paginateAchievement`。三种浅色主题是纸间荣光（cream）、逐光而跑（mint）、热烈时刻（coral）；主题对象包含 `id/name/background/ink/accent/soft`。

```js
const model = buildAchievementModel(runnerPayload, {
  mode: 'pb',             // pb | results
  style: 'cream',         // cream | mint | coral
  year: '',               // results 模式可选 YYYY；PB 忽略此参数
  // selectedKeys 未传即全选，[] 明确保留空选择
  nickname: me.user.nickname,
  quote: '每一步，都在刷新自己。',
  showName: true,
  showRace: true,
  showDate: true,
  showCity: false
});
const pages = paginateAchievement(model);
```

输入使用 `/me/runner` 原始 body：`{asOf, results:[{distance, seconds, race:{id,name,raceDate,city,province,kind,meet}}]}`。日期严格校验真实 `YYYY-MM-DD`，且不得晚于 `asOf`；秒数必须是正安全整数。无效 `asOf` 回退到当前北京时间日期。同赛事同项目按 `race.id:distance` 去重，重复记录取最快有效成绩。显示时间和配速由整数秒重算，不信任输入的格式化文本。

生涯 PB 重新从所有已发生的线下（`meet === 'offline'`）公路（`kind === 'road'`）成绩选出，不信任某年最好或旧 `pb` 标记；按全马、半马、10 公里、5 公里排列，不受年份筛选影响。同秒并列在 `normalizeResults` 中均标记为 PB，PB 海报每个距离仅选一个代表：日期较新优先，日期相同按稳定 key 排序。越野和线上成绩可进入完赛履历，但不会获得公路生涯 PB。

完赛履历支持按年筛选，按日期倒序、稳定 key 排序。选择器可调用 `normalizeResults` 取得全量安全成绩；PB 选择器可调用不传 `selectedKeys` 的 PB builder 取得四项代表。没有默认截取前 12 条。传入未知 key 会被忽略，空数组不会恢复全选。

模型输出 `nickname/title/subtitle/quote/style/mode/year/rows/summary/asOf/years/eligibleRows/pbRows` 与四个隐私布尔开关。行仅含稳定身份、项目、整数秒、格式化时间/配速、标准公里数、PB 标记及可开关的赛事名称/日期/城市；不会复制输入对象或其私有扩展字段。行还带白名单 `kind`（road/trail/other）、`meet`（offline/online/空）以及 `typeLabel`（路跑/越野/线上赛/其他），让渲染器在项目旁明确区别非线下公路记录。`eligibleRows`、`pbRows` 同样只包含本次已选内容且应用隐私开关；完整可选集由独立 normalizer 提供。

关闭昵称会清空 `nickname`；关闭赛事、日期或城市会在所有行投影中清空对应字段。昵称至多 30 个 Unicode 码点、赛事名 100 个、文案 80 个，避免切断 emoji 的 UTF-16 代理对。城市默认不展示，城市数量仅为聚合数字。

`summary = {events,results,cities,km}` 只统计实际所选项目：同一赛事多项目算一场、多条成绩；城市只统计线下项目，按省市组合去重；公里按已知标准项目累加后保留两位小数，不把团内训练跑量或未选成绩加进来。`years` 仅来自所选项目。未知距离可展示原项目标签，但不会臆造公里数或 PB。

## 长图与多图

`paginateAchievement(model)` 返回完整模型数组，每页附 `page/pageCount/totalRows`，每页最多 20 行。0～20 行保留一张，由渲染器按内容自适应高度；超过 20 行明确分页，保留顺序且不漏行。各页 `summary` 表示整个已选集合，渲染时配合页码标明多图关系。空模型交给 UI 展示空态，不应将空选择偷偷补齐。

运行 `node --test scripts/achievement-model.test.cjs` 验证日期、PB、年份、并列、跨项目、隐私、emoji、完整选择、20 行分页、跨端镜像一致性。此测试仅运行纯模型，不接触生产或服务端数据。

## 工作室体验与边界

本人入口打开海报工作室，提供 PB 荣誉卡和完赛履历、三种浅色纸张、短文案、成绩勾选及昵称/赛事名/日期/城市四个展示开关。PB 默认选择全部可用的生涯最好项目；完赛履历默认选择全部合法已发生的成绩，按年筛选时保留其他年份的选择，恢复“全部年份”后仍能看到它们。当前范围的“全选/清空”只作用于当前范围，空选择停留空态且不生成图片。预览随选择更新，展示实际生成的 PNG，而非替代示意图。

PNG 使用当前设备的 Canvas 2D 生成，宽 1080 像素；PB 高 1440 像素，履历按当前页行数增长，最多 20 行一张。长赛事名会按可用宽度省略，完整名称仍在本人选择列表中。不同平台字体与 emoji 样式可能不同。海报沿用本人原有记录，不改变成绩、不上传导出图、不自动发布朋友圈，也不新增官方认证。

小程序支持查看实际 PNG 大图及逐张保存到系统相册。只有用户主动点击保存才检查/申请相册权限；拒绝后提供“去设置”，授权回来需要再次点击保存，不自动重复弹窗。隐藏或离开页面会清理当前临时 PNG，返回时按当前账号重新生成。小程序的微信原生 Canvas、预览、授权和相册交互仍需真机确认；VM 覆盖的是实际 Page 逻辑和传给原生接口的参数。

Web 支持当前页 PNG 下载、长按大图、复制按相同隐私开关生成的朋友圈配文；浏览器支持文件分享时显示系统分享按钮。多图提供批量下载与逐页保存。浏览器可能限制多文件下载、系统文件分享或剪贴板权限，此时保留逐张下载、长按图片、手工复制配文的路径；能否出现在微信/朋友圈分享列表由系统与浏览器决定。

私有请求和 PNG 生成绑定到账号、页面及当前生成版本。切换账号、离开页面或修改选项后，过期响应不能恢复旧预览；小程序丢弃迟到的临时 PNG 并删除文件，Web 撤销旧预览 URL，批量导出在账号变化后停止后续下载。关闭昵称时不绘制真实昵称或替代昵称，其他关闭字段不进入导出图与配文。本人编辑选择列表仍可显示原始赛事信息，用于识别选中的记录。

用户已经主动保存到相册、下载到设备、复制到剪贴板或交给系统分享面板的内容不会因退出账号而撤回；本功能的清理范围是工作室内预览和未完成的生成任务。图片也不包含证书、截图、私人相册、设备、地址或第三方 token。

独立专项 `design/previews/achievement-poster-20261111/session-isolation-audit.cjs` 使用实际 Mini Page VM 和隔离 Vue 浏览器环境，延迟原生 PNG / `toBlob` 回调检查换号隔离、授权设置导致隐藏/返回后的恢复，以及 44 条选择完整分为 20+20+4。所有接口都由内存 GET fixture 提供，禁止写请求及外部网络；这不是生产账号或真机验收。

## 发布候选复验

本轮海报使用独立发布分支 `codex/achievement-poster-ready-20261111`，本地隔离工作树为 `/tmp/marathon-achievement-poster-release`。2026-11-11 已在该工作树复跑纯模型 17 项及会话/PNG 隔离 5 项，全部通过；隔离检查无写接口请求、无浏览器 `pageerror`。产品改动仅包括海报模型、渲染器、双端工作室与本人入口/路由，不包含同期资讯模块或服务端变更。

从检出的仓库根目录执行：

```sh
node scripts/sync-achievement-model.cjs --check
node scripts/sync-achievement-poster.cjs --check
node --test scripts/achievement-model.test.cjs
node design/previews/achievement-poster-20261111/session-isolation-audit.cjs
```

模型测试直接报告到终端。隔离检查将覆盖写入 `design/previews/achievement-poster-20261111/session-isolation-report.json`；发布范围只读审计记录为同目录 `release-readonly-audit.json`。`design/previews/achievement-poster-20261111/` 下的 Web、Mini 及 renderer 子目录保存各自的截图与报告，避免与前一轮成员主页五页签验收目录混用。

运行前需安装根目录 Playwright 与 Web Vite/Vue 依赖；隔离检查使用本地端口 5197，默认 Chrome 路径为 macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可通过 `CHROME_BIN` 覆盖。这里的 `node_modules` 本机软链接只用于复验，不属于提交内容。Mini VM 使用已跟踪的共享验收 fixture；发布不需要新增资讯文件、资讯接口或第三方内容依赖。
