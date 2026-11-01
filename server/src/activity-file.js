const crypto = require("crypto");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { XMLParser, XMLValidator } = require("fast-xml-parser");

const MAX_FILE = 5 * 1024 * 1024;
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

function timestamp(raw) {
  const text = raw instanceof Date ? raw.toISOString() : String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) fail("文件开始时间缺少时区或格式不正确");
  // Date.parse silently rolls February 30 into March; validate the original
  // calendar fields separately before applying its timezone offset.
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/).slice(1).map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (year < 2000 || year > 2100 || calendar.toISOString().slice(0, 19) !== text.slice(0, 19)) fail("文件中的运动日期无效");
  const ms = Date.parse(text);
  const zone = text.match(/(Z|[+-]\d{2}:\d{2})$/)[1];
  if (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4, 6) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4, 6) !== 0))) fail("文件中的运动时区无效");
  if (!Number.isFinite(ms)) fail("文件中的运动时间无效");
  return { ms, iso: new Date(ms).toISOString() };
}

function summary(values) {
  const start = timestamp(values.startedAt);
  const durationSec = Math.round(Number(values.durationSec));
  const meters = Number(values.meters);
  const elapsed = Number(values.elapsedSec == null ? durationSec : values.elapsedSec);
  if (!(durationSec >= 1 && durationSec <= 48 * 3600) || !(meters >= 10 && meters <= 999000) || !(elapsed + 1 >= durationSec && elapsed <= 7 * 86400)) fail("文件里程或运动用时无效，请导出一场完整的跑步记录");
  const end = values.endedAt ? timestamp(values.endedAt).ms : start.ms + elapsed * 1000;
  if (end < start.ms || end + 1000 < start.ms + durationSec * 1000 || end > Date.now() || start.ms > Date.now()) fail("运动尚未结束或开始、结束时间不一致");
  const distanceKm = Math.round(meters / 10) / 100;
  const climbM = values.climbM == null ? null : Number(values.climbM);
  if (climbM != null && (!Number.isFinite(climbM) || climbM < 0 || climbM > 20000)) fail("文件爬升数据无效");
  const type = values.type;
  if (!["run", "trail"].includes(type)) fail("目前只支持跑步与越野活动，骑行、多项运动和路线文件不能导入");
  // File formats can round distance/timer differently. Keep an identity based
  // on the original start second; ingestion still checks conflicting summaries.
  const externalId = crypto.createHash("sha256").update("run-v2|" + start.iso.slice(0, 19)).digest("hex");
  return { externalId, startedAt: start.iso, endedAt: new Date(end).toISOString(), distanceKm, durationSec, type, runMode: values.runMode || "unknown", climbM: climbM == null ? null : Math.round(climbM), importQuality: values.importQuality, city: "" };
}

async function parseFit(buffer) {
  const { Decoder, Stream } = await import("@garmin/fitsdk");
  const decoder = new Decoder(Stream.fromBuffer(buffer));
  if (!decoder.isFIT() || !decoder.checkIntegrity()) fail("FIT 文件不完整或校验失败，请重新从设备平台导出");
  const { messages, errors } = decoder.read({ includeUnknownData: false, mergeHeartRates: false, decodeMemoGlobs: false });
  if (errors.length) fail("FIT 文件无法解析，请重新导出完整活动");
  if (messages.fileIdMesgs?.[0]?.type !== "activity") fail("这不是运动活动文件，请导出已完成活动，而不是路线或训练计划");
  const sessions = messages.sessionMesgs || [];
  if (sessions.length !== 1) fail("一次请导入一场跑步，多项目或多场活动文件暂不支持");
  const session = sessions[0];
  const sport = session.sport;
  if (sport !== "running") fail("目前只支持跑步与越野活动");
  // FIT's street is running; road is a cycling subtype. A generic run or an
  // ultra does not establish its surface, so the runner must confirm that.
  const runMode = ({ street: "road", trail: "trail", treadmill: "treadmill", indoorRunning: "indoor", track: "track", virtualActivity: "virtual" })[session.subSport] || "unknown";
  return summary({ startedAt: session.startTime, endedAt: session.timestamp, meters: session.totalDistance, durationSec: session.totalTimerTime, elapsedSec: session.totalElapsedTime, climbM: session.totalAscent, type: runMode === "trail" ? "trail" : "run", runMode, importQuality: 2 });
}

function parseTcx(buffer) {
  const xml = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail("TCX 不支持外部实体或文档类型声明");
  if (XMLValidator.validate(xml) !== true) fail("TCX 文件格式损坏，请重新导出");
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false, parseTagValue: false, parseAttributeValue: false, trimValues: true });
  const root = parser.parse(xml)?.TrainingCenterDatabase;
  const activities = list(root?.Activities?.Activity);
  if (activities.length !== 1) fail("一次请导入一场已完成活动，路线和多场活动文件暂不支持");
  const activity = activities[0];
  if (activity["@_Sport"] !== "Running") fail("目前只支持跑步活动，请选择跑步的 FIT 或 TCX 文件");
  const laps = list(activity.Lap);
  if (!laps.length || laps.length > 5000) fail("TCX 缺少有效的运动分段");
  const start = timestamp(activity.Id || laps[0]["@_StartTime"]);
  let meters = 0, durationSec = 0, previousLapStart = start.ms, end = start.ms;
  for (const lap of laps) {
    if (lap.DistanceMeters == null || lap.TotalTimeSeconds == null) fail("TCX 分段缺少距离或用时");
    const distance = Number(lap.DistanceMeters), duration = Number(lap.TotalTimeSeconds);
    if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) fail("TCX 分段距离或用时无效");
    meters += distance; durationSec += duration;
    const lapStart = lap["@_StartTime"] ? timestamp(lap["@_StartTime"]).ms : end;
    if (lapStart < start.ms || lapStart < previousLapStart) fail("TCX 分段开始时间顺序无效");
    previousLapStart = lapStart;
    // The total is timer time; pauses between laps still count towards elapsed
    // time. A TCX without trackpoints must include the LAST lap's duration.
    end = Math.max(end, lapStart + duration * 1000);
    for (const track of list(lap.Track)) for (const point of list(track.Trackpoint)) if (point.Time) {
      const pointTime = timestamp(point.Time).ms;
      if (pointTime < lapStart) fail("TCX 轨迹时间早于分段开始时间");
      end = Math.max(end, pointTime);
    }
  }
  // TCX does not standardize a total-ascent summary. Do not guess climb or
  // infer trail type from filenames; the runner can adjust the type afterwards.
  end = Math.max(end, start.ms + durationSec * 1000);
  return summary({ startedAt: start.iso, endedAt: new Date(end).toISOString(), meters, durationSec, elapsedSec: (end - start.ms) / 1000, climbM: null, type: "run", runMode: "unknown", importQuality: 1 });
}

async function decode(buffer) {
  if (!buffer.length || buffer.length > MAX_FILE) fail("活动文件不超过 5MB");
  if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === ".FIT") return { activity: await parseFit(buffer), format: "FIT" };
  if (/^\s*(?:\uFEFF)?\s*</.test(buffer.toString("utf8", 0, 150))) return { activity: parseTcx(buffer), format: "TCX" };
  fail("请选择从设备平台导出的 FIT 或 TCX 活动文件，不支持图片、ZIP 和 GPX 路线");
}

let active = 0;
function parseActivityFile(buffer) {
  if (active >= 2) return Promise.reject(Object.assign(new Error("正在解析其他活动，请稍后重试"), { status: 429 }));
  active++;
  return new Promise((resolve, reject) => {
    let done = false;
    let worker;
    try { worker = new Worker(__filename, { workerData: Buffer.from(buffer), resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 } }); }
    catch (_) { active--; reject(Object.assign(new Error("暂时无法解析活动文件，请稍后重试"), { status: 503 })); return; }
    const finish = (error, result) => {
      if (done) return;
      done = true; active--; clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error("文件解析超时，请尝试重新导出单场活动"), { status: 400 })), 12000);
    worker.on("message", (message) => message.error ? finish(Object.assign(new Error(message.error), { status: 400 })) : finish(null, message));
    worker.on("error", () => finish(Object.assign(new Error("无法解析活动文件，请重新导出"), { status: 400 })));
    worker.on("exit", (code) => { if (!done) finish(Object.assign(new Error("无法解析活动文件，请重新导出"), { status: 400 })); });
  });
}

function readUpload(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = Number(req.get("content-length")) > MAX_FILE + 65536;
    req.on("data", (chunk) => { size += chunk.length; if (size > MAX_FILE + 65536) over = true; if (!over) chunks.push(chunk); });
    req.on("error", reject); req.on("aborted", () => reject(Object.assign(new Error("上传已中断，请重试"), { status: 400 })));
    req.on("end", () => over ? reject(Object.assign(new Error("活动文件不超过 5MB"), { status: 413 })) : resolve(Buffer.concat(chunks)));
  });
}

function singleFile(buffer, contentType) {
  const match = /boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType || "");
  const boundary = match && (match[1] || match[2]);
  if (!boundary || boundary.length > 200) fail("请选择一个活动文件上传");
  const marker = Buffer.from("--" + boundary), parts = [];
  let from = buffer.indexOf(marker);
  while (from >= 0) {
    const next = buffer.indexOf(marker, from + marker.length);
    if (next < 0) break;
    const part = buffer.subarray(from + marker.length + 2, next - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0 && /content-disposition:[^\r\n]*\bfilename=/i.test(part.subarray(0, headerEnd).toString())) parts.push(part.subarray(headerEnd + 4));
    from = next;
  }
  if (parts.length !== 1 || !parts[0].length) fail("一次请选择一个 FIT 或 TCX 活动文件");
  if (parts[0].length > MAX_FILE) throw Object.assign(new Error("活动文件不超过 5MB"), { status: 413 });
  return parts[0];
}

function mountActivityFiles(app, { BASE, getDb, userFrom }) {
  app.post(BASE + "/api/me/devices/import", async (req, res) => {
    const user = userFrom(req);
    if (!user) return res.status(401).json({ error: "请先登录" });
    res.set("Cache-Control", "private, no-store");
    if (!/^multipart\/form-data\s*;/i.test(req.get("content-type") || "")) return res.status(400).json({ error: "请选择 FIT 或 TCX 文件上传" });
    try {
      const bytes = singleFile(await readUpload(req), req.get("content-type"));
      const { activity, format } = await parseActivityFile(bytes);
      const db = getDb();
      const { ingestActivity } = require("./wearable");
      // The parse happens in an isolated worker, before the short write
      // transaction. Raw FIT/TCX, GPS and heart-rate samples are not retained.
      const result = db.transaction(() => {
        const currentUser = userFrom(req);
        if (!currentUser || currentUser.id !== user.id) throw Object.assign(new Error("登录已失效，请重新登录"), { status: 401 });
        const now = new Date().toISOString();
        db.prepare("INSERT OR IGNORE INTO wearable_connections (user_id, provider, external_account_id, status, created_at, updated_at) VALUES (?, 'file', ?, 'connected', ?, ?)").run(user.id, "user:" + user.id, now, now);
        const connection = db.prepare("SELECT * FROM wearable_connections WHERE user_id = ? AND provider = 'file'").get(user.id);
        const answer = ingestActivity(db, connection, activity);
        if (answer.status === "rejected") throw Object.assign(new Error(answer.error), { status: answer.httpStatus || 400 });
        db.prepare("UPDATE wearable_connections SET last_sync_at = ?, updated_at = ? WHERE id = ?").run(now, now, connection.id);
        return answer;
      }).immediate();
      const note = result.status === "ignored" ? "这条运动曾被你删除，重复导入不会恢复" : result.status === "duplicate" ? "这条运动已有记录，无需重复导入" : result.status === "updated" ? "已补全同一场运动，个人数据和跑团 PK 判定已更新" : "已导入运动记录，跑团 PK 按手填规则判断";
      res.json({ imported: result.status === "imported" ? 1 : 0, updated: result.status === "updated" ? 1 : 0, duplicates: result.status === "duplicate" || result.status === "ignored" ? 1 : 0, rejected: 0, source: "file", runId: result.runId || 0, format, needsConfirmation: !!result.needsConfirmation, note: note + (result.needsConfirmation ? "；运动类型或越野爬升待确认，请到运动页补充后再判断 PK" : "") });
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "导入失败，请稍后重试" }); }
  });
}

if (!isMainThread) decode(Buffer.from(workerData)).then((result) => parentPort.postMessage(result), (error) => parentPort.postMessage({ error: error.message || "文件无法解析" }));

module.exports = { parseActivityFile, singleFile, mountActivityFiles, timestamp, MAX_FILE };
