# 小程序包体积约束

开发者工具在真机调试时提示源码包超过 2MB。本次整理保留仓库中的原始彩色图和 SVG，利用 `miniprogram/project.config.json` 的 `packOptions.ignore` 排除未被运行时引用的源图、旧版线性 SVG 和旧的 club 图标；赛事首页的三处入口改为复用对应的 quick PNG，避免同一张图片打包两次。

所有 36 张 PNG 做了无损压缩，逐张用 RGBA 像素比对，未改变分辨率或视觉像素。压缩前后节省 238,513 字节。运行时源码检查覆盖 56 个 JS、43 个 WXSS、36 个 WXML 和 40 个 JSON 文件，确认图片引用存在且没有引用被排除的资源。

开发者工具预览实际结果：**1,352,338 字节（约 1.3MB）**，低于 2MB 上限。预览命令使用项目配置中的真实 AppID，结果记录在 `/tmp/marathon-mini-package-preview-20261112/out/info.json`。

之后新增图片或页面时，先运行 `npm run test:mini-package`；它会检查资源引用、排除规则和 1.5MiB 原始运行时预算，并在 CI 中自动执行。`npm run test:mini` 继续负责 WCC/WCSC 原生编译检查。
