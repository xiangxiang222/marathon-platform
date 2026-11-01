const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const mini = path.join(root, "miniprogram");
const { parse } = require(path.join(root, "web/node_modules/@babel/parser"));
const output = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-mini-compile-"));
const compiler = process.env.WECHAT_COMPILER_PATH || "/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec";
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? (item.name === "node_modules" ? [] : files(path.join(dir, item.name))) : [path.join(dir, item.name)]);
const all = files(mini);
const report = { kind: "WeChat native offline compilation; this is not a device test", js: [], json: [], references: [], moduleReferences: [], moduleFixtureChecks: [], compile: [] };
function insideMini(file) {
  const relative = path.relative(mini, file);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
function moduleReferences(file, source) {
  const references = [], pending = [parse(source, { sourceType: "unambiguous" })];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" && node.arguments[0]?.type === "StringLiteral") {
      const name = node.arguments[0].value;
      if (/^\.\.?\//.test(name)) {
        const base = path.resolve(path.dirname(file), name);
        const target = path.extname(base) ? base : base + ".js";
        let errorCode = "", error = "";
        if (!insideMini(target)) { errorCode = "outside-package"; error = "相对依赖不能越出小程序目录"; }
        // JSON is configuration/data, not a registered JavaScript module in WeChat.
        else if (path.extname(target) !== ".js") { errorCode = "invalid-module"; error = "小程序 require 只能引用 JS 模块，不能使用 Node 的 JSON 等扩展加载"; }
        else if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { errorCode = "missing-module"; error = "找不到小程序 JS 模块"; }
        else if (!insideMini(fs.realpathSync(target))) { errorCode = "outside-package"; error = "依赖链接不能指向小程序目录之外"; }
        references.push({ file: path.relative(root, file), request: name, line: node.loc.start.line, target: path.relative(root, target), ok: !errorCode, ...(errorCode ? { errorCode, error } : {}) });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    }
  }
  return references;
}
// Exercise the checker in memory: no production source or configuration is edited.
const fixtureFile = path.join(mini, "pages/legal/legal.js");
for (const [name, source, expected] of [
  ["existing extensionless JS module", 'require("../../utils/request")', [""]],
  ["existing explicit JS module", 'require("../../utils/request.js")', [""]],
  ["JSON fallback hidden by catch is rejected", 'try { require("../../utils/legal-documents.json"); } catch (_) {}', ["invalid-module"]],
  ["relative path cannot leave the package", 'require("../../../outside")', ["outside-package"]],
  ["missing JS dependency is rejected", 'require("./__missing_module__")', ["missing-module"]],
  ["document strings and comments are not dependencies", 'module.exports = { text: "require(\'./missing\')" }; // require("./also-missing")', []]
]) {
  const actual = moduleReferences(fixtureFile, source).map(item => item.errorCode || "");
  report.moduleFixtureChecks.push({ name, passed: JSON.stringify(actual) === JSON.stringify(expected), ...(JSON.stringify(actual) !== JSON.stringify(expected) ? { expected, actual } : {}) });
}
for (const file of all.filter((item) => item.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  report.js.push({ file: path.relative(root, file), exit: result.status, error: result.stderr.trim() });
  try { report.moduleReferences.push(...moduleReferences(file, fs.readFileSync(file, "utf8"))); }
  catch (error) { report.moduleReferences.push({ file: path.relative(root, file), ok: false, errorCode: "parse-error", error: error.message }); }
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
report.passed = report.js.every((item) => item.exit === 0) && report.json.every((item) => item.ok) && !report.references.length && report.moduleReferences.every(item => item.ok) && report.moduleFixtureChecks.every(item => item.passed) && report.compile.every((item) => item.exit === 0);
fs.writeFileSync(path.join(__dirname, "mini-native-check-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, js: report.js.length, json: report.json.length, references: report.references, moduleReferences: report.moduleReferences.length, moduleErrors: report.moduleReferences.filter(item => !item.ok), moduleFixtureChecks: report.moduleFixtureChecks, compile: report.compile }, null, 2));
fs.rmSync(output, { recursive: true, force: true });
if (!report.passed) process.exitCode = 1;
