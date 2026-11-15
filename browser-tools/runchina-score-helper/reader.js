(function (root, factory) {
  "use strict";
  const reader = factory();
  if (typeof module === "object" && module.exports) module.exports = reader;
  root.RunchinaScoreReader = reader;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ENTRIES = 100;
  const MAX_JSON = 160000;
  const REVIEW = "待确认";
  const ALIASES = {
    name: ["赛事", "赛事名称", "比赛", "比赛名称", "race name", "racename", "event name", "eventname"],
    raceDate: ["日期", "比赛日期", "赛事日期", "比赛时间", "赛事时间", "race date", "racedate", "event date"],
    distance: ["项目", "比赛项目", "参赛项目", "赛事项目", "完赛项目", "项目名称", "比赛距离", "参赛距离", "完赛距离", "距离", "distance"],
    netTime: ["净计时", "净成绩", "净时间", "净计时成绩", "net time", "nettime", "chip time"],
    gunTime: ["枪声成绩", "枪声计时", "枪声时间", "枪声计时成绩", "gun time", "guntime"],
    unknownTime: ["成绩", "用时", "完赛成绩", "完赛时间", "time", "finish time"],
    bib: ["号码布", "号码布号", "参赛号", "参赛号码", "比赛号码", "号码", "bib", "bib number"],
    city: ["城市", "举办城市", "city"],
    province: ["省份", "举办省份", "province"],
    status: ["状态", "完赛状态", "参赛状态", "status"],
    kind: ["赛事类型", "比赛类型", "kind"],
    meet: ["参赛形式", "赛事形式", "比赛形式", "meet"]
  };
  const clean = (value) => String(value == null ? "" : value).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const headerKey = (value) => clean(value).toLowerCase().replace(/[\s:：]/g, "");
  const HEADER_FIELDS = new Map();
  for (const [field, aliases] of Object.entries(ALIASES)) for (const alias of aliases) HEADER_FIELDS.set(headerKey(alias), field);

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isSensitive(value) {
    const text = clean(value).replace(/[\s\u200b-\u200f\uFEFF-]/g, "");
    // Include common spacing and hyphen formatting. Never echo the matched text.
    return /\d{17}[\dXx]|\d{15}|\d{11}/.test(text);
  }

  function descriptors(headers) {
    if (!Array.isArray(headers) || !headers.length) throw failure("NO_HEADERS", "没有找到明确的表头，请使用官网已显示的成绩表格。");
    const used = new Set();
    return headers.map((header, index) => {
      const field = HEADER_FIELDS.get(headerKey(header)) || null;
      if (field && used.has(field)) throw failure("DUPLICATE_COLUMN", "成绩表中存在重复含义的列，无法确定字段对应关系。");
      if (field) used.add(field);
      return { field, index };
    });
  }

  function isScoreLayout(columns) {
    return columns.some((item) => item.field === "name") && columns.some((item) => ["raceDate", "distance", "netTime", "gunTime", "unknownTime"].includes(item.field));
  }

  function dateValue(value) {
    const match = /^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/.exec(value);
    if (!match) return "";
    const day = match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
    const parsed = new Date(day + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day && day >= "1900-01-01" ? day : "";
  }

  function distanceValue(value) {
    const compact = value.replace(/\s+/g, "").toLowerCase();
    const exact = {
      full: "full", "全马": "full", "全程": "full", "马拉松": "full", "全程马拉松": "full", "marathon": "full", "fullmarathon": "full", "42.195公里": "full", "42.195千米": "full", "42.195km": "full", "42195米": "full", "42195m": "full",
      half: "half", "半马": "half", "半程": "half", "半程马拉松": "half", "halfmarathon": "half", "21.0975公里": "half", "21.0975千米": "half", "21.0975km": "half", "21097.5米": "half", "21097.5m": "half",
      "10k": "10k", "10km": "10k", "10公里": "10k", "十公里": "10k", "10000米": "10k", "10000m": "10k",
      "5k": "5k", "5km": "5k", "5公里": "5k", "五公里": "5k", "5000米": "5k", "5000m": "5k",
      other: "other", "其他": "other", "其他项目": "other"
    };
    return Object.prototype.hasOwnProperty.call(exact, compact) ? exact[compact] : "";
  }

  function timeValue(value) {
    const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
    if (!match) return "";
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return seconds > 0 && seconds <= 72 * 3600 ? match[1].padStart(2, "0") + ":" + match[2] + ":" + match[3] : "";
  }

  function seconds(value) {
    if (!value) return null;
    const parts = value.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function knownValue(dictionary, value) {
    const key = (value || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : REVIEW;
  }

  function ensureSize(result) {
    // The importer has a character limit, including its JSON envelope.
    const payload = { format: "race-history", version: 1, entries: result.entries };
    if (JSON.stringify(payload).length > MAX_JSON || JSON.stringify(result).length > MAX_JSON) throw failure("EXPORT_TOO_LARGE", "本次内容超过导入大小限制，请减少当前页记录。");
    return result;
  }

  function normalizeTable(input) {
    if (!input || !Array.isArray(input.rows)) throw failure("INVALID_TABLE", "成绩表结构不完整，无法读取。");
    const columns = descriptors(input.headers);
    if (!isScoreLayout(columns)) throw failure("NO_SCORE_TABLE", "没有找到具有明确赛事和成绩字段的表格。");
    if (input.rows.length > MAX_ENTRIES) throw failure("TOO_MANY_ROWS", "每次最多读取 100 条，请在官网减少每页数量。");
    const entries = [], issues = [], seen = new Set();
    for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
      const row = input.rows[rowIndex];
      if (!Array.isArray(row) || row.length !== columns.length) throw failure("COLUMN_MISMATCH", "成绩行与表头的列数不一致，已停止读取。");
      const values = {};
      for (const { field, index } of columns) {
        if (!field) continue;
        const value = clean(row[index]);
        if (isSensitive(value)) throw failure("SENSITIVE_CELL", "成绩字段中疑似包含证件号或手机号，已停止导出，请先核对页面。");
        values[field] = value;
      }
      if (!Object.values(values).some(Boolean)) continue;
      const rowNumber = rowIndex + 1;
      const addIssue = (message) => issues.push("第 " + rowNumber + " 行：" + message);
      for (const field of ["netTime", "gunTime", "unknownTime"]) {
        if (values[field] && !timeValue(values[field])) throw failure("UNRECOGNIZED_TIME", "成绩表中存在无法明确识别的用时，已停止导出，请先核对页面。");
      }
      if (values.unknownTime && (values.netTime || values.gunTime)) throw failure("AMBIGUOUS_TIME", "成绩表同时提供普通成绩与净计时或枪声时间，无法确定普通成绩口径，已停止导出。");
      const entry = {
        name: values.name || "", raceDate: dateValue(values.raceDate || ""),
        distance: distanceValue(values.distance || ""), distanceText: values.distance || "",
        netTime: timeValue(values.netTime || ""), gunTime: timeValue(values.gunTime || ""), unknownTime: timeValue(values.unknownTime || ""),
        bib: values.bib || "", city: values.city || "", province: values.province || "",
        status: knownValue({ "完赛": "finished", "已完赛": "finished", "finished": "finished", "未完赛": "dnf", "弃赛": "dnf", "dnf": "dnf", "未出发": "dns", "未起跑": "dns", "未参赛": "dns", "dns": "dns" }, values.status),
        kind: knownValue({ "路跑": "road", "公路跑": "road", "road": "road", "越野": "trail", "越野跑": "trail", "trail": "trail", "其他": "other", "other": "other" }, values.kind),
        meet: knownValue({ "线下": "offline", "线下赛": "offline", "offline": "offline", "线上": "online", "线上赛": "online", "虚拟跑": "online", "online": "online" }, values.meet)
      };
      entry.timing = entry.netTime ? "net" : entry.gunTime ? "gun" : "unknown";
      if (!entry.name) addIssue("缺少赛事名称，需要本人补充。");
      if (!entry.raceDate) addIssue("没有有效的完整比赛日期，需要本人确认。");
      if (!entry.distance) addIssue("项目未能明确对应现有分类，需要本人选择。");
      for (const field of ["status", "kind", "meet"]) if (entry[field] === REVIEW) addIssue(({ status: "参赛状态", kind: "赛事类型", meet: "参赛形式" })[field] + "需要本人确认。");
      if (entry.netTime && entry.gunTime && seconds(entry.netTime) > seconds(entry.gunTime)) addIssue("净计时长于枪声时间，保留原列结果，请本人核对。");
      if (["dnf", "dns"].includes(entry.status) && (entry.netTime || entry.gunTime || entry.unknownTime)) addIssue("未完赛或未起跑状态与完赛用时冲突，保留原列结果，请本人核对。");
      const signature = JSON.stringify(entry);
      if (!seen.has(signature)) { entries.push(entry); seen.add(signature); }
    }
    if (!entries.length) throw failure("NO_SCORE_ROWS", "没有找到可读取的可见成绩行；这不代表本人没有参赛记录。");
    return ensureSize({ entries, tableCount: 1, issues });
  }

  function visible(element) {
    if (!element || element.nodeType !== 1) return false;
    const view = element.ownerDocument && element.ownerDocument.defaultView;
    if (!view) return false;
    for (let cursor = element; cursor && cursor.nodeType === 1; cursor = cursor.parentElement) {
      if (cursor.hidden || cursor.getAttribute("aria-hidden") === "true") return false;
      const style = view.getComputedStyle(cursor);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  }

  function cellText(cell) {
    // Read only the caller-selected white-listed cell. Values of controls and
    // hidden text are never traversed, even when placed inside such a cell.
    const parts = [];
    function visit(node) {
      if (node.nodeType === 3) { parts.push(node.nodeValue || ""); return; }
      if (node.nodeType !== 1 || !visible(node) || /^(?:INPUT|TEXTAREA|SELECT|OPTION|BUTTON|SCRIPT|STYLE|TEMPLATE|NOSCRIPT|TABLE)$/.test(node.tagName)) return;
      for (const child of node.childNodes) visit(child);
    }
    for (const child of cell.childNodes) visit(child);
    return clean(parts.join(" "));
  }

  function directRows(table) {
    return Array.from(table.rows || []).filter((row) => row.closest("table") === table && visible(row));
  }

  function isMirror(table) {
    return !!table.closest(".el-table__fixed, .el-table__fixed-right");
  }

  function headerOf(table) {
    const rows = directRows(table);
    let heads = rows.filter((row) => row.parentElement && row.parentElement.tagName === "THEAD");
    if (!heads.length && rows[0] && Array.from(rows[0].cells).length && Array.from(rows[0].cells).every((cell) => cell.tagName === "TH")) heads = [rows[0]];
    const cells = heads.flatMap((row) => Array.from(row.cells));
    return {
      rows: heads, cells,
      headers: cells.map((cell) => visible(cell) ? cellText(cell) : ""),
      complex: heads.length > 1 || cells.some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1)
    };
  }

  function allLayouts(document) {
    const tables = Array.from(document.querySelectorAll("table")).filter(visible);
    const consumed = new Set(), layouts = [];
    const roots = new Set(tables.map((table) => table.closest(".el-table")).filter(Boolean));
    for (const container of roots) {
      const own = tables.filter((table) => table.closest(".el-table") === container);
      const main = own.filter((table) => !isMirror(table));
      const headers = main.filter((table) => !!table.closest(".el-table__header-wrapper"));
      const bodies = main.filter((table) => !!table.closest(".el-table__body-wrapper"));
      if (!headers.length && !bodies.length) continue;
      own.forEach((table) => consumed.add(table));
      if (headers.length !== 1 || bodies.length !== 1) {
        layouts.push({ error: failure("EL_TABLE_ASSOCIATION", "同一成绩组件的表头与表体无法唯一对应，已停止读取。"), header: { headers: [], rows: [], complex: false }, bodyRows: [] });
        continue;
      }
      const header = headerOf(headers[0]);
      layouts.push({ header, bodyRows: directRows(bodies[0]).filter((row) => row.parentElement.tagName !== "THEAD" && row.parentElement.tagName !== "TFOOT"), elTable: true });
    }
    for (const table of tables) {
      if (consumed.has(table) || isMirror(table)) continue;
      const header = headerOf(table), headRows = new Set(header.rows);
      layouts.push({ header, bodyRows: directRows(table).filter((row) => !headRows.has(row) && row.parentElement.tagName !== "TFOOT"), elTable: false });
    }
    return { tables, layouts };
  }

  function isBlocked(document) {
    const title = clean(document && document.title || "");
    if (/请求已被拦截|access\s+restricted/i.test(title)) return true;
    const status = document && document.querySelector("#statusCode");
    return !!status && clean(status.textContent) === "567";
  }

  function readVisibleScores(document) {
    if (isBlocked(document)) throw failure("SITE_BLOCKED", "官网显示访问拦截，工具已停止；不会自动重试。");
    const { tables, layouts } = allLayouts(document);
    if (!tables.length) throw failure("NO_VISIBLE_TABLE", "没有找到可见成绩表格，请先由本人完成官网查询。");
    const results = [];
    for (const layout of layouts) {
      if (layout.error) throw layout.error;
      const mapped = layout.header.headers.map((value) => ({ field: HEADER_FIELDS.get(headerKey(value)) || null }));
      if (!isScoreLayout(mapped)) continue;
      if (layout.header.complex) throw failure("COMPLEX_HEADERS", "成绩表使用合并或多层表头，当前原型不能安全读取。");
      const columns = descriptors(layout.header.headers);
      if (layout.bodyRows.length > MAX_ENTRIES) throw failure("TOO_MANY_ROWS", "每次最多读取 100 条，请在官网减少每页数量。");
      const rows = layout.bodyRows.map((row) => {
        const cells = Array.from(row.cells);
        if (cells.length !== columns.length || cells.some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1)) throw failure("COLUMN_MISMATCH", "成绩行与表头的列数不一致或存在合并，已停止读取。");
        if (layout.elTable) for (let index = 0; index < cells.length; index++) {
          const columnClass = (cell) => Array.from(cell.classList).find((name) => /^el-table_\d+_column_\d+(?:_column_\d+)?$/.test(name));
          const headClass = columnClass(layout.header.cells[index]), bodyClass = columnClass(cells[index]);
          if ((headClass || bodyClass) && headClass !== bodyClass) throw failure("EL_TABLE_ASSOCIATION", "成绩组件的列对应关系不一致，已停止读取。");
        }
        return columns.map(({ field, index }) => field && visible(cells[index]) ? cellText(cells[index]) : "");
      });
      results.push(normalizeTable({ headers: layout.header.headers, rows }));
    }
    if (!results.length) throw failure("NO_SCORE_TABLE", "没有找到具有明确赛事和成绩字段的表格。");
    const signatures = new Set(results.map((result) => JSON.stringify(result.entries)));
    if (signatures.size !== 1) throw failure("AMBIGUOUS_TABLE", "页面存在内容不同的成绩表，当前原型无法确定应读取哪张。");
    return ensureSize({ entries: results[0].entries, tableCount: tables.length, issues: results[0].issues });
  }

  function scriptMetadata(document) {
    const hosts = new Set();
    for (const script of document.querySelectorAll("script[src]")) {
      try {
        const source = new URL(script.getAttribute("src"), document.baseURI || "https://invalid.local/");
        if (["http:", "https:"].includes(source.protocol) && source.hostname && source.hostname !== "invalid.local" && !isSensitive(source.hostname)) hosts.add(source.hostname.toLowerCase());
      } catch (_) { /* An unparseable public resource provides no useful clue. */ }
    }
    const providers = new Set();
    for (const host of hosts) {
      const under = (domain) => host === domain || host.endsWith("." + domain);
      if (["geetest.com", "geetest.net", "geevisit.com"].some(under)) providers.add("极验");
      if (["captcha.gtimg.com", "turing.captcha.qcloud.com", "captcha.myqcloud.com", "captcha.qq.com"].some(under)) providers.add("腾讯验证码");
      if (["dun.163.com", "dun.163yun.com", "captcha.163.com", "yidun.com"].some(under)) providers.add("网易易盾");
      if (["dx-captcha.com", "dingxiang-inc.com"].some(under)) providers.add("顶象");
      if (host === "challenges.cloudflare.com") providers.add("Cloudflare Turnstile");
    }
    return { scriptHostnames: Array.from(hosts).sort(), captchaHints: Array.from(providers).sort().map((provider) => ({ provider, evidence: "public-script-host" })) };
  }

  function inspectStructure(document) {
    const { tables, layouts } = allLayouts(document);
    const knownTypes = new Set(["text", "password", "number", "tel", "email", "search", "url", "date", "datetime-local", "month", "week", "time", "checkbox", "radio", "file", "hidden", "submit", "reset", "button", "image", "color", "range"]);
    const inputTypeCounts = {};
    for (const input of document.querySelectorAll("input")) {
      const rawType = (input.getAttribute("type") || "text").toLowerCase();
      const type = knownTypes.has(rawType) ? rawType : "other";
      inputTypeCounts[type] = (inputTypeCounts[type] || 0) + 1;
    }
    return {
      blocked: isBlocked(document), tableCount: tables.length,
      tables: layouts.map((layout) => ({
        rowCount: layout.bodyRows.length,
        recognizedHeaders: [...new Set(layout.header.headers.map((value) => HEADER_FIELDS.get(headerKey(value))).filter(Boolean))],
        unknownHeaderCount: layout.header.headers.filter((value) => !HEADER_FIELDS.has(headerKey(value))).length,
        complexHeaders: !!layout.header.complex,
        ambiguousAssociation: !!layout.error
      })),
      inputTypeCounts, ...scriptMetadata(document)
    };
  }

  return { readVisibleScores, inspectStructure, normalizeTable, isBlocked };
});
