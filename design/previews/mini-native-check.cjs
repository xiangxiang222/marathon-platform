const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const mini = path.join(root, "miniprogram");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-mini-compile-"));
const compiler = process.env.WECHAT_COMPILER_PATH || "/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec";
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? (item.name === "node_modules" ? [] : files(path.join(dir, item.name))) : [path.join(dir, item.name)]);
const all = files(mini);
const report = { kind: "WeChat native offline compilation; this is not a device test", js: [], json: [], references: [], compile: [] };
for (const file of all.filter((item) => item.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  report.js.push({ file: path.relative(root, file), exit: result.status, error: result.stderr.trim() });
}
for (const file of all.filter((item) => item.endsWith(".json"))) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    report.json.push({ file: path.relative(root, file), ok: true });
    for (const [name, location] of Object.entries(data.usingComponents || {})) {
      const base = location.startsWith("/") ? path.join(mini, location) : path.resolve(path.dirname(file), location);
      for (const ext of [".js", ".json", ".wxml", ".wxss"]) if (!fs.existsSync(base + ext)) report.references.push({ file: path.relative(root, file), name, missing: base + ext });
    }
  } catch (error) {
    report.json.push({ file: path.relative(root, file), ok: false, error: error.message });
  }
}
const app = JSON.parse(fs.readFileSync(path.join(mini, "app.json"), "utf8"));
for (const page of app.pages) for (const ext of [".js", ".json", ".wxml", ".wxss"]) if (!fs.existsSync(path.join(mini, page + ext))) report.references.push({ missing: page + ext });
for (const [tool, ext] of [["wcc", ".wxml"], ["wcsc", ".wxss"]]) {
  const input = all.filter((file) => file.endsWith(ext)).map((file) => path.relative(mini, file));
  const args = [...(tool === "wcsc" ? ["-js"] : []), "-o", path.join(output, tool + ".js"), ...input];
  const result = spawnSync(path.join(compiler, tool), args, { cwd: mini, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  report.compile.push({ tool, files: input.length, exit: result.status, error: result.error && result.error.message, output: ((result.stderr || "") + (result.stdout || "")).slice(0, 10000) });
}
report.passed = report.js.every((item) => item.exit === 0) && report.json.every((item) => item.ok) && !report.references.length && report.compile.every((item) => item.exit === 0);
fs.writeFileSync(path.join(__dirname, "mini-native-check-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, js: report.js.length, json: report.json.length, references: report.references, compile: report.compile }, null, 2));
fs.rmSync(output, { recursive: true, force: true });
if (!report.passed) process.exitCode = 1;
