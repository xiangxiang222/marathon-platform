赛事完整资料采集与更新

采集器使用现有 Playwright、Tesseract 与媒体能力；macOS 优先使用 Vision 读取长图片、PDFKit 读取整份 PDF。没有新增依赖、配置或数据库表。

固定待处理范围为导出时已发布或待审核记录的去重集合，先核对年份、举办地和组别。公开页面、报名页、关联规程、展开内容和图片资料均纳入核查。登录、验证码、限流和不可访问页面记入失败记录；不无限重试，也不以搜索摘要替代完整规程。准确费用阶段及组别数字只有能可靠对应时才结构化，无法确定的值留空，原有可靠资料保留。

采集示例：

```sh
node scripts/race-detail-collect.cjs --targets /tmp/targets.json --out-dir /tmp/collections --cache /tmp/race-cache --ocr --use-cache --resume
```

目标 JSON 为数组，至少提供 `id`、`name`、`raceDate` 及 `urls`。媒体原文件、OCR 行坐标和来源留在采集审计文件中。公开正文清除导航、广告和装饰图，保留完整有用章节。图片表格需核对行列关系；首个样例应人工对照关键数字，采集器并不声称任意 OCR 已经人工校对。

准备更新计划后检查赛事身份、状态、日期、全组别、收费阶段及媒体。原有人工正文可在已核实合并后标记 `verification.reconcilesExistingGuide`；官方明确调整组别且已逐项核对时，才允许 `verification.groupsReconciledByOfficial` 替换原组别集合。普通不完整采集保留已存组别和非空事实。

```sh
node scripts/race-detail-apply.cjs --inventory /tmp/inventory.json --scope /tmp/scope.json --collections /tmp/collections --out /tmp/plan.json
node scripts/race-detail-apply.cjs --apply --db /path/app.sqlite --plan /tmp/plan.json --out /tmp/applied.json --media /path/media
```

应用器先备份 SQLite，逐行核对导出快照后更新授权字段，将图片写入现有 `race_sheets`。有并发变化的赛事跳过并记录；不新增或删除赛事、不修改表结构。再次执行时重新导出与生成计划，避免用旧快照覆盖新编辑。待审发布沿用已有审核接口；仅更新详情的脚本不会创建赛事或自动扩大处理范围。

完整章节、组别及核查数据存入现有 `guide_text` 的版本化附注，公开 API 去除内部来源和诊断记录；人工编辑正文时保留结构化组别与状态。详情接口返回完整资料，赛历及参赛计划列表只返回摘要，避免把长文写入小程序列表。取消、入口失效、报名截止与报满分开处理；只有取消或入口失效禁止显示报名二维码。

相关检查：

```sh
npm test
node --test scripts/race-detail-collect.test.cjs scripts/race-detail-apply.test.cjs scripts/race-rich-detail.test.cjs
node scripts/check-mini-package.cjs
npm run build
RACE_RICH_PILOT_JSON=/tmp/pilot-verified.json RACE_RICH_OUTPUT=/tmp/pilot-ui node scripts/race-rich-detail-browser.cjs
RACE_RICH_OUTPUT=/tmp/live-ui node scripts/race-rich-detail-live.cjs
```

浏览器检查覆盖实际图片加载、四个报名选项、费用、实际里程、章节表格、二维码预览和小屏宽度。生产检查直接访问已部署页面，不拦截接口；保存的二维码图片还需用独立扫描器解码核对入口。小程序编译和桌面移动视口检查分别记录，不能当作微信真机发布验证。
