"use strict";

const statusNode = document.getElementById("status");
const buttons = [...document.querySelectorAll("button")];
let busy = false;

function userMessage(message) {
  return Object.assign(new Error(message), { userFacing: true });
}

function allowedPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.origin === "https://www.runchina.org.cn" &&
      url.pathname === "/" && url.hash.split("?")[0] === "#/data-score/public-score/list";
  } catch { return false; }
}

function downloadJson(value, filename) {
  const text = JSON.stringify(value, null, 2);
  if (text.length > 160000) throw userMessage("当前页资料超过导入上限，请减少每页显示数量后重试。");
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function run(mode) {
  if (busy) return;
  busy = true;
  buttons.forEach(button => { button.disabled = true; });
  statusNode.classList.remove("error");
  statusNode.textContent = "正在读取当前页…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !allowedPage(tab.url)) throw userMessage("请先打开中国马拉松大众成绩查询页，再点击助手。");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["reader.js"] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [mode],
      func: function (requestedMode) {
        const url = new URL(location.href);
        if (url.origin !== "https://www.runchina.org.cn" ||
          url.pathname !== "/" || url.hash.split("?")[0] !== "#/data-score/public-score/list") {
          return { error: "页面已变化，请回到中国马拉松大众成绩查询页。" };
        }
        try {
          const reader = globalThis.RunchinaScoreReader;
          if (!reader || reader.isBlocked(document)) return { error: "官网当前提示安全拦截，请停止读取并按官网说明处理。" };
          return { data: requestedMode === "structure" ? reader.inspectStructure(document) : reader.readVisibleScores(document) };
        } catch (error) {
          return { error: error.message || "当前页面暂时无法读取。" };
        }
      }
    });
    const result = results?.[0]?.result;
    if (!result || result.error) throw userMessage(result?.error || "未能读取当前页，请确认官网已完成加载。");
    if (mode === "structure") {
      downloadJson({ format: "runchina-page-structure", version: 1, capturedAt: new Date().toISOString(), ...result.data }, "runchina-page-structure.json");
      statusNode.textContent = "结构报告已导出，不含成绩行或身份信息。";
    } else {
      const entries = result.data.entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw userMessage("未找到可导出的成绩；请完成官网查询，或减少每页显示数量。");
      downloadJson({
        format: "race-history", version: 1,
        source: { domain: "www.runchina.org.cn", capturedAt: new Date().toISOString(), method: "visible-page-user-export", parserVersion: "0.1.0", scope: "current-page", verified: false },
        entries
      }, "runchina-current-page-scores.json");
      statusNode.textContent = "已导出当前页 " + entries.length + " 条。请在我的跑史中导入 JSON，核对日期、项目、状态及计时口径后保存。";
    }
  } catch (error) {
    statusNode.classList.add("error");
    // Browser errors can include the full tab URL. Only our own user-facing
    // errors are displayed; extension/platform failures use a fixed message.
    statusNode.textContent = error.userFacing ? error.message : "未能读取页面。请确认官网已加载，或导出结构报告核对布局。";
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.getElementById("export-scores").addEventListener("click", () => run("scores"));
document.getElementById("export-structure").addEventListener("click", () => run("structure"));
