# 明亮多彩 UI 本地验收

本轮证据写入 `design/previews/colorful-ui-20261111/`，调整前基线为 `design/previews/bright-ui-20261111/`。不覆盖基线，不访问生产。

最新方向为“小象式清爽”：浅灰页面、白卡、顶部有限氛围与鲜明小图标/标签，保留珊瑚红品牌。中途较丰富的彩色版本仅保存在输出内的 `process-color-rich/`，不作为最终验收。

## 执行命令

确认页面样式落盘后，按需要串行执行，避免重复启动整套浏览器：

```sh
UI_PALETTE_PROFILE=colorful UI_AUDIT_OUT=design/previews/colorful-ui-20261111 UI_EXPECTED_ACCENT='#e1251b' node scripts/ui-system-audit.cjs mini
UI_PALETTE_PROFILE=colorful UI_AUDIT_OUT=design/previews/colorful-ui-20261111 UI_EXPECTED_ACCENT='#e1251b' node scripts/ui-system-audit.cjs web admin
```

小程序流程读取当前 `app.wxss`、组件、28 页 WXML/WXSS 和训练发布 Page，使用合成展示数据，不发送 HTTP。Web 流程创建临时 SQLite 和媒体目录，真实业务 API 仅监听 localhost；后台流程使用内存 API 拦截。所有浏览器阻止外部网络。

只重新生成已有截图的 gallery 和对比图：

```sh
node scripts/ui-colorful-gallery.cjs
```

只准备空 gallery、不启动 Chromium、不运行任何业务接口：

```sh
node scripts/ui-colorful-gallery.cjs --prepare
```

入口为 `design/previews/colorful-ui-20261111/index.html`；原生编译和 Web 构建由主任务单独执行。

## 覆盖与判断

- 既有明亮版基线：Web 66 场景 × 3 宽度 = 198 项；小程序 28 页与关键分支共 76 项；训练模板 22 项；后台 218 项，共 514 项。
- 保留宽度溢出、固定页脚边距、管理权限、分组计数、空态、断图、模板、字体下限等原检查。
- 读取当前渲染 token，包括 `--sky-soft`、`--mint-soft`、`--lilac-soft`、`--sun-soft`、`--peach-soft`，记录首屏实际浅彩色背景及渐变色家族。
- 仅 `UI_PALETTE_PROFILE=colorful` 的活动 hero 改用明亮可读判断：背景色/渐变 stop 最低相对亮度 ≥ 0.65，正文亮度 ≤ 0.3，保守对比度 ≥ 4.5。浅彩色渐变不因为比纯白暗一点而失败；旧 profile 保留 0.85 门限。
- 前后截图固定取顶部 900px；采样浅彩色像素比例用于辅助比较，包含图标和内容图片，不能作为背景精确面积或审美分数。
- 目检重点是主次层级、语义用色、白底表单、红色操作辨识度和背景色协调性。更高色彩占比不等于更好设计。

## 边界

小程序浏览器镜像近似原生选择器、输入和系统导航；不能替代微信开发工具或真机结果。DOM 背景指标不等同于完整像素对比度测试。缺失报告显示待验收，不拿旧截图充当本轮结果。

## 最终结果

最终清爽版本冻结后重新执行 Web 与 Mini，后台代码未再改变，沿用本轮已完成的后台验收：

| 范围 | 检查数 | 结果 |
| --- | ---: | --- |
| Web 66 场景 × 320 / 390 / 1440 | 198 | 全部通过 |
| Mini 28 页与权限、分组、空态等分支 × 320 / 390 | 76 | 全部通过 |
| Mini 训练发布与模板场景 | 22 | 全部通过 |
| 后台流程 | 80 | 全部通过 |
| 后台页面与状态 | 138 | 全部通过 |
| 合计 | 514 | 全部通过 |

目检发现 Web 发布训练页的窄屏红色主按钮被局部规则改成深色文字。主任务修复后，单独补验该页 320 / 390 / 1440 三个宽度，新增计算样式断言：白字 `rgb(255, 255, 255)`、品牌红底 `rgb(225, 37, 27)`，3 项全部通过。结果已合并回 198 项 Web 报告，不重复计入 514 总数；补验原始报告为 `web-primary-recheck-report.json`。

最终渲染确认页面底色 `#f5f6f8`、白色卡片、品牌红 `#e1251b`，以及五组浅彩色 token 均来自当前源码。冻结后的 169 份 UI 源码和视觉资源哈希保存在 `final-source-snapshot.json`；唯一后续变化是上述主按钮修复，已按三宽度覆盖。

本地生成的 gallery（`design/previews/colorful-ui-20261111/index.html`，不纳入源码提交）包含 377 张当前页面截图、12 组与 bright-ui 基线的对比图、报告和宽度筛选；版本内保留[8 张代表截图](../design/reviews/ui-20261111/README.md)。Mini 明确标为源代码浏览器镜像。此前关于“31 个 WXSS 全部编译通过”的表述不成立，原因与修正见下节；浏览器镜像检查也未发现缺分号。原生编译及源码静态校验不能等同于真机交互验证。

## 真机缺分号反馈与校验纠正

用户随后在微信开发工具遇到 `feedback.wxss: Missed semicolon`。独立复现确认这是真实语法错误，不能用此前浏览器截图通过或原生工具 `exit 0` 证明源码正确。

旧原生校验存在两处漏洞：

- `wcsc -js -o ... feedback.wxss` 对含非法声明的 17,915 字节源码静默返回 0，stderr/stdout 均空，仍生成 24,430 字节 JavaScript，产物中原样保留 `box-sizing:border-box background: transparent`。因此只判断退出码不够，检查非空产物也不能替代严格语法解析。
- 多文件调用没有传 `-pc`。双文件临时 fixture 证明旧参数仅输出第一个文件的独立样式标记，第二个标记缺失；加 `-pc 2` 后两个标记才都存在。旧报告的输入参数数目不代表实际编译覆盖。

主任务仅在产品 WXSS 补充分号：feedback 6 处、history 6 处、legal 3 处，共 15 处。独立比较修复前后源码确认只有 15 个分号插入，未包含其他字符变化。三个原始备份均被严格 PostCSS 解析拒绝，修复后均可解析；首错位置分别为 feedback `1:480`、history `1:99`、legal `1:78`。

`design/previews/mini-native-check.cjs` 现逐文件严格解析全部 31 个 WXSS，并包含 10 个内存语法用例：缺声明分号、缺闭合、错误属性须拒绝；末尾可省分号、自定义属性、引号内冒号及 data URL 等合法情况须接受。原生调用增加 `-lc -pc 31`，检查退出码、异常/信号、诊断输出和非空产物，另以双文件标记 fixture 验证入口覆盖。严格解析结果参与最终失败判断，不依赖 `wcsc` 自身的容错行为。

修复冻结后执行：

```sh
node design/previews/mini-native-check.cjs
```

结果全部通过：31 个 WXSS 严格解析、10 个语法用例、1 个无效源码原生容错探针、1 个双入口覆盖用例、43 个 JS、33 个 JSON、52 个相对模块引用、6 个引用用例，以及 29 个 WXML 和 `-pc 31` 的原生输出检查。WXML 产物 663,957 字节，WXSS 多入口产物 355,587 字节。语法探针仍明确记录：当前 `wcsc` 对缺分号 fixture 返回 0，但严格源检查拒绝它。

证据文件：

- [最终严格与原生报告](../design/previews/mini-native-check-report.json)
- [原始坏源码与 15 处分号修复复现报告](../design/previews/colorful-ui-20261111/wxss-false-positive-reproduction.json)
- [完整校验失败门控的隔离负例](../design/previews/colorful-ui-20261111/wxss-negative-gate-report.json)：通过虚拟只读文件接口喂入原始 feedback 坏源码，不修改产品文件或成功报告，确认最终判为失败且退出码为 1。
