# 小程序成绩海报验收

入口：我的总览与完赛记录、跑者档案的赛事生涯/荣誉收藏，以及本人团友主页的成绩栏目。其他团友不显示制作入口，handler 同时检查本人和当前账号。

工作室使用 `/me/runner?period=all&offset=0` 和 `/me`，不读取团友私有成绩。PB 按线下公路赛事生涯最好成绩，年份只筛选完赛履历。主题为杏金、薄荷、珊瑚；支持四款文案、成绩多选/全选/清空、昵称/赛事名/日期/城市开关，城市默认关闭。

使用原生 2D Canvas 输出 1080px PNG，页面展示真实生成图片，点击可大图预览。超过 20 条成绩明确分页，逐张保存当前图片，不宣称整组已保存。相册权限仅在点击保存后处理，已拒绝时提供设置入口；从设置返回后需要再次点击保存。账号变化、隐藏和卸载使旧操作失效并删除旧临时文件，绘制与导出串行，仅最后一次结果生效。没有上传海报、公开链接、伪造二维码或自动发送。

本目录图片使用合成成绩。高清 PNG 由浏览器执行真实共享 Canvas 渲染器生成；页面 PNG 使用当前 WXML/WXSS 的浏览器源码镜像，**不是微信真机或微信模拟器验证**。相册权限与 Canvas 桥接行为通过隔离原生 Page VM 验证，真实设备仍应检查系统授权提示与实际相册保存。

| 检查 | 结果 |
| --- | --- |
| 原生 Page VM | 14 场景通过；44 条成绩分 3 张、生成竞态、隐私、权限、账号与生命周期、本人入口 |
| 真实共享 Canvas | 7 张 PNG；3 主题 PB、隐私 PB、44 条履历的全部 3 张，1080px 宽 |
| WXML/WXSS 源码镜像 | 10 状态 × 320/390，共 20 个通过，无遮挡横向溢出/缺失 handler/表达式错误 |
| 原生离线编译 | 33 WXML、36 WXSS；51 JS、37 JSON；36 WXSS 严格解析通过 |

上述数量已在本轮隔离发布工作树重新运行核实，采用该工作树的发布基线与海报文件，未混入主工作区同期资讯编辑；四份报告均为本次隔离复跑结果。

复跑：

```sh
node design/previews/achievement-poster-mini-regression.cjs
node design/previews/achievement-poster-mini-preview.cjs
MINI_NATIVE_REPORT=design/previews/achievement-poster-20261111/mini/native-report.json node design/previews/mini-native-check.cjs
```

代表图：`pb-cream.png`、`pb-mint.png`、`pb-coral.png`、`results-1.png`、`results-3.png`，及 `pages-achievement-poster-achievement-poster-390.png`、`pages-achievement-poster-achievement-poster-privacy-320.png`。完整机器结果分别为 `vm-report.json`、`canvas-report.json`、`report.json` 与 `native-report.json`。
