const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const mini = path.join(root, "miniprogram");
const { parse } = require(path.join(root, "web/node_modules/@babel/parser"));
const postcss = require(path.join(root, "web/node_modules/postcss"));
const output = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-mini-compile-"));
const compiler = process.env.WECHAT_COMPILER_PATH || "/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec";
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? (item.name === "node_modules" ? [] : files(path.join(dir, item.name))) : [path.join(dir, item.name)]);
const all = files(mini);
const report = { kind: "Strict source syntax plus WeChat native offline compilation; this is not a device test", startedAt: new Date().toISOString(), validationContract: "Native compiler exit 0 alone is insufficient: every WXSS must pass strict PostCSS parsing; wcsc receives -pc for every input page; native tools must finish without diagnostics and create nonempty artifacts.", js: [], json: [], wxss: [], wxssFixtureChecks: [], nativeSyntaxProbe: null, nativeCoverageProbe: null, references: [], moduleReferences: [], moduleFixtureChecks: [], compile: [] };
function strictWxss(source, file) {
  try {
    const ast = postcss.parse(source, { from: file });
    let declarations = 0;
    ast.walkDecls(() => declarations++);
    return { ok: true, declarations };
  } catch (error) {
    return { ok: false, name: error.name, reason: error.reason || error.message, line: error.line || null, column: error.column || null };
  }
}
function compile(tool, input, directory, artifact, options = {}) {
  const pageCount = tool === "wcsc" && !options.legacyArguments ? input.length : null;
  const args = [...(tool === "wcsc" ? ["-js", ...(options.legacyArguments ? [] : ["-lc", "-pc", String(pageCount)])] : []), "-o", artifact, ...input];
  const result = spawnSync(path.join(compiler, tool), args, { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const diagnostics = ((result.stderr || "") + (result.stdout || "")).trim();
  let artifactBytes = 0;
  try { if (fs.statSync(artifact).isFile()) artifactBytes = fs.statSync(artifact).size; } catch (_) {}
  return { tool, files: input.length, pageFileCount: pageCount, exit: result.status, signal: result.signal || null, error: result.error?.message || "", artifactBytes,
    output: diagnostics.slice(0, 10000), ok: !result.error && !result.signal && result.status === 0 && artifactBytes > 0 && !diagnostics };
}
// Exercise the exact checker against in-memory strings. A missing semicolon
// between declarations must fail; the final semicolon before } is optional.
for (const [name, source, expected] of [
  ["minified missing declaration semicolon rejected", '.x{box-sizing:border-box background:transparent;}', false],
  ["multiline missing declaration semicolon rejected", '.x {\n align-items:center\n box-shadow:var(--card-shadow);\n}', false],
  ["rpx missing declaration semicolon rejected", '.x{padding:32rpx background:#fff;}', false],
  ["numeric missing declaration semicolon rejected", '.x{line-height:1.5 background:var(--sky-soft);}', false],
  ["unclosed rule rejected", '.x{color:#fff;', false],
  ["malformed property rejected", '.x{color red;}', false],
  ["optional last semicolon and rpx accepted", '.x{padding:12rpx;color:var(--text)}', true],
  ["custom property token sequence accepted", '.x{--payload:one background:two;color:var(--a,red)}', true],
  ["quoted colons and data URLs accepted", '.x{content:"padding:a b:c";background:url("data:image/svg+xml;x:y;")}', true],
  ["media and pseudo selector accepted", '@media(min-width:320px){view::after{content:"";width:20rpx}}', true]
]) {
  const actual = strictWxss(source, "<memory:" + name + ">");
  report.wxssFixtureChecks.push({ name, expectedSyntaxOk: expected, passed: actual.ok === expected, actual });
}
// A controlled temporary probe documents wcsc versions that silently emit bad
// declaration values while returning 0. Strict parsing remains authoritative.
const probeSource = '.probe{box-sizing:border-box background:transparent;}';
const probeDir = path.join(output, "syntax-probe");
fs.mkdirSync(probeDir);
fs.writeFileSync(path.join(probeDir, "probe.wxss"), probeSource);
const probeSyntax = strictWxss(probeSource, "<native-syntax-probe>");
const probeNative = compile("wcsc", ["probe.wxss"], probeDir, path.join(probeDir, "probe.js"));
report.nativeSyntaxProbe = { source: probeSource, strictSyntax: probeSyntax, native: probeNative, nativeSilentlyAcceptedInvalidSyntax: probeNative.ok,
  passed: !probeSyntax.ok, note: "The invalid fixture is rejected by the strict source gate regardless of native exit status; no product file was modified." };
// Without -pc wcsc treats subsequent files as import inputs and silently emits
// only the first root. Verify real coverage, not merely input argument count.
const coverageDir = path.join(output, "coverage-probe");
fs.mkdirSync(coverageDir);
fs.writeFileSync(path.join(coverageDir, "first.wxss"), '.firstcoverageprobe{color:red;}');
fs.writeFileSync(path.join(coverageDir, "second.wxss"), '.secondcoverageprobe{color:blue;}');
const legacyCoverage = compile("wcsc", ["first.wxss", "second.wxss"], coverageDir, path.join(coverageDir, "legacy.js"), { legacyArguments: true });
const currentCoverage = compile("wcsc", ["first.wxss", "second.wxss"], coverageDir, path.join(coverageDir, "current.js"));
const emitted = file => { try { const source = fs.readFileSync(path.join(coverageDir, file), "utf8"); return { first: source.includes("firstcoverageprobe"), second: source.includes("secondcoverageprobe") }; } catch (_) { return { first: false, second: false }; } };
const legacyMarkers = emitted("legacy.js"), currentMarkers = emitted("current.js");
report.nativeCoverageProbe = { legacy: { ...legacyCoverage, emitted: legacyMarkers }, configured: { ...currentCoverage, emitted: currentMarkers },
  passed: currentCoverage.ok && currentMarkers.first && currentMarkers.second, note: "Both independent source markers must occur in the generated artifact with -pc 2; temporary fixtures only." };
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
for (const file of all.filter((item) => item.endsWith(".wxss"))) {
  report.wxss.push({ file: path.relative(root, file), ...strictWxss(fs.readFileSync(file, "utf8"), file) });
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
  report.compile.push(compile(tool, input, mini, path.join(output, tool + ".js")));
}
report.passed = report.js.every((item) => item.exit === 0) && report.json.every((item) => item.ok) && report.wxss.every(item => item.ok) && report.wxssFixtureChecks.every(item => item.passed) && report.nativeSyntaxProbe.passed && report.nativeCoverageProbe.passed && !report.references.length && report.moduleReferences.every(item => item.ok) && report.moduleFixtureChecks.every(item => item.passed) && report.compile.every((item) => item.ok);
report.finishedAt = new Date().toISOString();
const reportFile = process.env.MINI_NATIVE_REPORT ? path.resolve(root, process.env.MINI_NATIVE_REPORT) : path.join(__dirname, "mini-native-check-report.json");
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, js: report.js.length, json: report.json.length, wxss: report.wxss.length, wxssErrors: report.wxss.filter(item => !item.ok), wxssFixtureChecks: report.wxssFixtureChecks, nativeSyntaxProbe: report.nativeSyntaxProbe, nativeCoverageProbe: report.nativeCoverageProbe, references: report.references, moduleReferences: report.moduleReferences.length, moduleErrors: report.moduleReferences.filter(item => !item.ok), moduleFixtureChecks: report.moduleFixtureChecks, compile: report.compile }, null, 2));
fs.rmSync(output, { recursive: true, force: true });
if (!report.passed) process.exitCode = 1;
