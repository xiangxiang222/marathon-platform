const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const previewUrl = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const tasks = ["activity-browser-regression.cjs", "product-browser-regression.cjs", "membership-browser-regression.cjs", "detail-recovery-browser-regression.cjs", "navigation-browser-regression.cjs", "admin-browser-regression.cjs", "product-helper-regression.cjs", "mini-membership-regression.cjs", "mini-detail-recovery-regression.cjs", "mini-checkin-regression.cjs", "web-result-export-regression.mjs"];
const report = { startedAt: new Date().toISOString(), kind: "Local mocked client regression suite; no business database writes", results: [] };
let vite;
function available() {
  return new Promise((resolve) => {
    const client = previewUrl.startsWith("https:") ? require("node:https") : require("node:http");
    const request = client.get(previewUrl.replace(/\/$/, "") + "/", { timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
async function main() {
  if (!await available()) {
    if (process.env.MARATHON_PREVIEW_URL) throw new Error("MARATHON_PREVIEW_URL is not reachable");
    vite = spawn(process.execPath, [path.join(root, "web/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5174", "--strictPort"], { cwd: path.join(root, "web"), stdio: "ignore" });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await available()) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready) throw new Error("Local Vite preview could not start on port 5174");
  }
  for (const task of tasks) {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, task)], { cwd: root, env: { ...process.env, MARATHON_PREVIEW_URL: previewUrl } });
      let output = "";
      child.stdout.on("data", (data) => { output += data; });
      child.stderr.on("data", (data) => { output += data; });
      child.on("error", (error) => resolve({ task, passed: false, error: error.message }));
      child.on("close", (exitCode) => resolve({ task, passed: exitCode === 0, exitCode, output: output.slice(-12000) }));
    });
    report.results.push(result);
    console.log((result.passed ? "PASS " : "FAIL ") + task);
    if (!result.passed) console.error(result.output || result.error);
  }
  report.passed = report.results.every((result) => result.passed);
  if (!report.passed) process.exitCode = 1;
}
main().catch((error) => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => {
  if (vite) vite.kill("SIGTERM");
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, "client-regression-report.json"), JSON.stringify(report, null, 2));
});
