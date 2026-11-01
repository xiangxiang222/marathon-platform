const crypto = require("crypto");

// A provider is only enabled after its partner API contract has been verified.
// Credentials alone cannot enable an invented OAuth or webhook protocol.
const PROVIDERS = {
  coros: { id: "coros", name: "COROS 高驰", scopes: "", reason: "高驰自动同步尚未开放，现在可先导入运动文件。" },
  garmin: { id: "garmin", name: "Garmin 佳明", scopes: "", reason: "自动同步尚未开通，现在可导入 FIT 或 TCX 运动文件。" },
  huawei: { id: "huawei", name: "华为运动健康", scopes: "", reason: "自动同步尚未开通；若设备平台可导出 FIT / TCX，可导入文件，也可手动记录。" },
  suunto: { id: "suunto", name: "Suunto 颂拓", scopes: "", reason: "自动同步尚未开通，现在可导入 FIT 或 TCX 运动文件。" },
  apple: { id: "apple", name: "Apple 健康", scopes: "", reason: "微信小程序与网页无法直接读取 Apple 健康；需要原生应用取得 HealthKit 授权。" }
};

const nowIso = () => new Date().toISOString();
const text = (value) => String(value == null ? "" : value).trim();
const UNAVAILABLE = "高驰自动同步尚未开通：需取得官方 Partner API 资格、协议和接口文档后完成联调。可先导入 FIT / TCX 运动文件。";

function config(provider) {
  return PROVIDERS[provider] ? { enabled: false, requiresPartnerApi: true } : null;
}

function hashState(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function providerStatus(db, userId, provider) {
  const item = PROVIDERS[provider];
  if (!item) return null;
  const row = db.prepare("SELECT status, access_token, refresh_token FROM wearable_connections WHERE user_id = ? AND provider = ?").get(userId, provider);
  return { id: provider, name: item.name, status: "unavailable", reason: item.reason, scopes: "", action: "unavailable", lastSyncedAt: "", canDisconnect: !!(row && (row.status !== "revoked" || row.access_token || row.refresh_token)) };
}

function parseDate(value, now) {
  const raw = text(value);
  // Adapters must convert manufacturer timestamps to unambiguous ISO instants.
  // Date-only or timezone-less strings depend on the server timezone and are not
  // accepted. Check calendar components before Date.parse can roll them over.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute, seconds = "00", fraction = "", zone] = match;
  if (+year < 2000 || +year > 2100 || +hour > 23 || +minute > 59 || +seconds > 59) return null;
  const calendar = `${year}-${month}-${day}T${hour}:${minute}:${seconds}`;
  const local = Date.UTC(+year, +month - 1, +day, +hour, +minute, +seconds);
  if (!Number.isFinite(local) || new Date(local).toISOString().slice(0, 19) !== calendar) return null;
  if (zone !== "Z" && (+zone.slice(1, 3) > 14 || +zone.slice(4, 6) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4, 6) !== 0))) return null;
  const ms = Date.parse(calendar + (fraction ? "." + fraction : "") + zone);
  if (!Number.isFinite(ms) || ms > now) return null;
  return { value: new Date(ms + 8 * 3600000).toISOString().slice(0, 16), ms };
}

function number(value) {
  if (value == null || typeof value === "boolean" || text(value) === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// Canonical, unit-explicit input shared by file parsers and future verified API
// adapters. No guessing whether a generic "distance" means metres or kilometres.
function normalizeActivity(item, now = Date.now()) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const externalId = text(source.externalId);
  const start = parseDate(source.startedAt, now);
  const distance = Math.round(number(source.distanceKm) * 100) / 100;
  const duration = Math.round(number(source.durationSec));
  if (!externalId || externalId.length > 256 || /[\u0000-\u001f]/.test(externalId) || !start || !(distance > 0 && distance <= 999) || !(duration > 0 && duration <= 172800)) return { error: "运动记录缺少合法的外部编号、开始时间、里程或用时" };
  if (start.ms + duration * 1000 > now) return { error: "尚未结束的运动不能导入" };
  const end = source.endedAt == null ? { value: new Date(start.ms + duration * 1000 + 8 * 3600000).toISOString().slice(0, 19), ms: start.ms + duration * 1000 } : parseDate(source.endedAt, now);
  if (!end || end.ms < start.ms + duration * 1000 - 1000 || end.ms - start.ms > 7 * 86400000) return { error: "运动结束时间与用时不一致" };
  const type = text(source.type).toLowerCase();
  if (!["run", "trail"].includes(type)) return { error: "只导入明确标为跑步或越野的记录" };
  const runMode = source.runMode == null ? (type === "trail" ? "trail" : "road") : text(source.runMode);
  if (!["road", "trail", "treadmill", "indoor", "track", "virtual", "unknown"].includes(runMode)) return { error: "运动类型无效" };
  const climbKnown = source.climbM != null;
  const rawClimb = climbKnown ? number(source.climbM) : 0;
  if (!(rawClimb >= 0 && rawClimb <= 20000)) return { error: "运动爬升必须在 0 到 20000 米之间" };
  const value = { externalId, startKey: new Date(start.ms).toISOString().slice(0, 19) + "Z", runMode, climbKnown, importQuality: [1, 2].includes(source.importQuality) ? source.importQuality : 0, startedAt: start.value, endedAt: new Date(end.ms + 8 * 3600000).toISOString().slice(0, 19), distance, duration, type: runMode === "trail" ? "trail" : "run", climb: Math.round(rawClimb), city: text(source.city).slice(0, 20) };
  return { value };
}

// Tolerances only identify compatible exports, never add distance. A mismatch
// is a reviewable conflict, not a guessed merge or a second personal run.
function closeSummary(a, b) {
  const distance = Number(a.distance), duration = Number(a.duration);
  return Number.isFinite(distance) && Number.isFinite(duration) &&
    Math.abs(distance - b.distance) <= Math.max(0.1, Math.min(distance, b.distance) * 0.02) + 1e-9 &&
    Math.abs(duration - b.duration) <= Math.max(60, Math.min(duration, b.duration) * 0.02);
}

function ingestActivity(db, connection, activity) {
  const normalized = normalizeActivity(activity);
  if (normalized.error) return { status: "rejected", error: normalized.error };
  const value = normalized.value;
  return db.transaction(() => {
    // Re-read after all remote I/O, under the write transaction: an in-flight
    // import must not continue after disconnecting or deleting the account.
    const active = connection && db.prepare("SELECT c.* FROM wearable_connections c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.user_id = ? AND c.provider = ? AND c.external_account_id = ? AND c.status = 'connected'").get(connection.id, connection.user_id, connection.provider, connection.external_account_id);
    if (!active || !active.external_account_id || active.external_account_id === "unknown" || !(active.provider === "file" || PROVIDERS[active.provider])) return { status: "rejected", error: "连接已失效，请重新连接或导入" };
    if (active.provider === "file" && active.external_account_id !== "user:" + active.user_id) return { status: "rejected", error: "文件导入账号无效" };
    const existing = db.prepare("SELECT * FROM wearable_activities WHERE provider = ? AND external_account_id = ? AND external_id = ?").get(active.provider, active.external_account_id, value.externalId);
    if (existing && existing.connection_id !== active.id) return { status: "rejected", error: "此设备账号已关联其他账户" };
    const { insertExternalRun, enrichExternalRun, runMode } = require("./mileage");
    const conflict = () => ({ status: "rejected", httpStatus: 409, error: "发现开始时间相同或相近、但无法安全合并的运动。请到运动页核对已有记录；本次未新增或覆盖。" });
    const deletedConflict = () => ({ status: "rejected", httpStatus: 409, error: "该文件可能对应已删除的运动，但无法安全确认。为避免恢复已删除记录，本次未新增或覆盖；请核对导出文件的开始时间、里程和用时。" });
    let same = null;
    if (active.provider === "file" && value.importQuality > 0) {
      const instant = Date.parse(value.startKey);
      const from = new Date(instant - 60000).toISOString().slice(0, 19) + "Z";
      const to = new Date(instant + 60000).toISOString().slice(0, 19) + "Z";
      const nearby = db.prepare("SELECT * FROM wearable_activities WHERE provider = ? AND external_account_id = ? AND (start_key BETWEEN ? AND ? OR start_key = '')").all(active.provider, active.external_account_id, from, to);
      if (existing && !nearby.some((row) => row.id === existing.id)) nearby.push(existing);
      const candidates = [];
      let ambiguous = false, deletedMatch = false, deletedAmbiguous = false;
      for (const mapping of nearby) {
        let prior;
        try { prior = JSON.parse(mapping.payload_json); } catch (_) { prior = {}; }
        // Older aliases may still hold the first TCX's metrics. A surviving
        // run is authoritative; a deletion keeps its last accepted summary.
        const current = mapping.status !== "ignored" && mapping.run_id
          ? db.prepare("SELECT distance_km AS distance, duration_sec AS duration FROM runs WHERE user_id = ? AND id = ?").get(active.user_id, mapping.run_id) : null;
        const close = closeSummary(current || prior, value);
        const sameMinute = prior.startedAt === value.startedAt;
        const legacyNear = !mapping.start_key && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(prior.startedAt || "") &&
          Math.abs(Date.parse(prior.startedAt + ":00+08:00") - Date.parse(value.startedAt + ":00+08:00")) <= 60000;
        if (mapping.status === "ignored") {
          // A deletion belongs to an activity, not its whole neighbouring
          // minute. Unrelated summaries must not reserve that time window.
          // The original exact identity is still protected even if its file
          // now claims different metrics; it cannot be inserted a second time.
          if (mapping.id === existing?.id || mapping.start_key === value.startKey) {
            if (close) deletedMatch = true; else deletedAmbiguous = true;
          } else if (close) {
            if (mapping.start_key || sameMinute) deletedMatch = true;
            // Without the original seconds, keep legacy adjacent-minute
            // matches conservative and explain the deletion-specific conflict.
            else if (legacyNear) deletedAmbiguous = true;
          }
          continue;
        }
        // A known start within 60 seconds is a possible export of the same
        // session. Incompatible live summaries need review, not a second run.
        if (mapping.start_key || mapping.id === existing?.id) {
          if (!close) ambiguous = true;
          candidates.push(mapping);
        } else if (sameMinute) {
          if (close) candidates.push(mapping);
          else ambiguous = true;
        } else if (legacyNear) {
          // Older summaries lost seconds. A neighbouring-minute export may
          // be the same event. A surviving record still needs review even
          // when metrics disagree; only deleted neighbours may be skipped.
          ambiguous = true;
        }
      }
      if (deletedAmbiguous) return deletedConflict();
      // An ignored same-activity alias wins over a surviving neighbour: the
      // original removed export must still report deletion, not a live clash.
      if (deletedMatch) return { status: "ignored", runId: 0 };
      if (ambiguous) return conflict();
      if (new Set(candidates.map((row) => row.run_id)).size > 1) return conflict();
      if (candidates.length) {
        same = db.prepare("SELECT * FROM runs WHERE user_id = ? AND id = ?").get(active.user_id, candidates[0].run_id);
        if (!same) return conflict();
      }
      // Handwritten starts have minute precision, but compare their actual
      // minute origin to the file's exact instant. Flooring both timestamps
      // would admit 61–119-second gaps or miss a preceding-minute export.
      const localMinute = (key) => new Date(Date.parse(key) + 8 * 3600000).toISOString().slice(0, 16);
      const personal = db.prepare("SELECT * FROM runs WHERE user_id = ? AND source = 'manual' AND type IN ('run', 'trail') AND started_at BETWEEN ? AND ?")
        .all(active.user_id, localMinute(from), localMinute(to))
        .filter((row) => Math.abs(Date.parse(row.started_at + ":00+08:00") - instant) <= 60000);
      if (personal.length > 1 || personal.some((row) => !closeSummary({ distance: row.distance_km, duration: row.duration_sec }, value))) return conflict();
      if (personal.length) {
        if (same && same.id !== personal[0].id) return conflict();
        same = personal[0];
      }
      if (same) {
        // New aliases stay within one minute of the first precise identity.
        // Otherwise a chain of small shifts could drift arbitrarily far away.
        const anchor = db.prepare("SELECT start_key FROM wearable_activities WHERE provider = 'file' AND external_account_id = ? AND run_id = ? AND start_key != '' ORDER BY id LIMIT 1").get(active.external_account_id, same.id);
        if (!existing && anchor && Math.abs(Date.parse(anchor.start_key) - instant) > 60000) return conflict();
      }
    } else {
      if (existing) return { status: existing.status === "ignored" ? "ignored" : "duplicate", runId: existing.run_id || 0 };
      same = db.prepare("SELECT * FROM runs WHERE user_id = ? AND type = ? AND started_at = ? AND distance_km = ? AND duration_sec = ? ORDER BY id LIMIT 1").get(active.user_id, value.type, value.startedAt, value.distance, value.duration);
    }
    const enriched = same ? enrichExternalRun(db, same, value) : null;
    const run = enriched ? enriched.run : insertExternalRun(db, active.user_id, value, active.provider);
    const now = nowIso();
    const effectiveSummary = (identity) => ({
      externalId: identity.externalId, startKey: identity.startKey || "", startedAt: identity.startedAt,
      endedAt: run.ended_at, distance: run.distance_km, duration: run.duration_sec,
      type: run.type, runMode: runMode(run), climb: run.climb_m, climbKnown: !!run.climb_known,
      importQuality: run.import_quality, city: run.city
    });
    // Persist one sanitized summary only. File bytes, GPS and heart-rate
    // samples never enter the database. Stable identity also survives deletion.
    let activityId = existing?.id;
    if (existing) {
      db.prepare("UPDATE wearable_activities SET start_key = ?, payload_json = ?, updated_at = ? WHERE id = ?").run(value.importQuality ? value.startKey : "", JSON.stringify(effectiveSummary(value)), now, existing.id);
    } else {
      const info = db.prepare("INSERT INTO wearable_activities (connection_id, provider, external_account_id, external_id, start_key, run_id, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'imported', ?, ?, ?)").run(active.id, active.provider, active.external_account_id, value.externalId, value.importQuality ? value.startKey : "", run.id, JSON.stringify(effectiveSummary(value)), now, now);
      activityId = Number(info.lastInsertRowid);
    }
    if (active.provider === "file" && value.importQuality > 0) {
      // Keep every export alias in step with the final accepted run, including
      // protected runner edits. Preserve each original time/hash identity so
      // reimporting an old file and deletion tombstones continue to work.
      const aliases = db.prepare("SELECT id, external_id, start_key, payload_json FROM wearable_activities WHERE provider = 'file' AND external_account_id = ? AND run_id = ? AND status = 'imported'").all(active.external_account_id, run.id);
      const update = db.prepare("UPDATE wearable_activities SET payload_json = ?, updated_at = ? WHERE id = ?");
      for (const alias of aliases) {
        let prior;
        try { prior = JSON.parse(alias.payload_json); } catch (_) { prior = {}; }
        update.run(JSON.stringify(effectiveSummary({ externalId: alias.external_id, startKey: alias.start_key, startedAt: prior.startedAt })), now, alias.id);
      }
    }
    return { status: !same ? "imported" : enriched.updated ? "updated" : "duplicate", runId: run.id, activityId, needsConfirmation: run.run_mode === "unknown" || (run.type === "trail" && !run.climb_known) };
  }).immediate();
}

function mountWearable(app, { BASE, getDb, userFrom }) {
  function login(req, res) {
    const user = userFrom(req);
    if (!user) res.status(401).json({ error: "请先登录" });
    return user;
  }
  function unavailable(req, res) {
    const provider = text(req.params.provider);
    if (!PROVIDERS[provider]) return res.status(404).json({ error: "没有这个设备平台" });
    return res.status(503).json({ error: provider === "coros" ? UNAVAILABLE : PROVIDERS[provider].reason, code: "PARTNER_API_NOT_AVAILABLE" });
  }
  app.get(BASE + "/api/me/devices", (req, res) => {
    const user = login(req, res); if (!user) return;
    res.set("Cache-Control", "private, no-store").json({ devices: Object.keys(PROVIDERS).map((provider) => providerStatus(getDb(), user.id, provider)) });
  });
  app.get(BASE + "/api/me/devices/:provider/connect", (req, res) => {
    if (!login(req, res)) return;
    return unavailable(req, res);
  });
  app.post(BASE + "/api/me/devices/:provider/sync", (req, res) => {
    if (!login(req, res)) return;
    return unavailable(req, res);
  });
  // These routes deliberately make no outbound requests, persist no credentials
  // and accept no manufacturer-looking client payloads until the actual partner
  // protocol, signatures, account identity and token lifecycle are implemented.
  app.get(BASE + "/api/wearables/:provider/callback", unavailable);
  app.post(BASE + "/api/wearables/:provider/webhook", unavailable);
  app.delete(BASE + "/api/me/devices/:provider", (req, res) => {
    const user = login(req, res); if (!user) return;
    const provider = text(req.params.provider);
    if (!PROVIDERS[provider]) return res.status(404).json({ error: "没有这个设备平台" });
    const db = getDb();
    const result = db.transaction(() => {
      db.prepare("DELETE FROM wearable_oauth_states WHERE user_id = ? AND provider = ?").run(user.id, provider);
      return db.prepare("UPDATE wearable_connections SET access_token = '', refresh_token = '', scopes = '', expires_at = '', status = 'revoked', error = '', updated_at = ? WHERE user_id = ? AND provider = ?").run(nowIso(), user.id, provider);
    }).immediate();
    if (!result.changes) return res.status(404).json({ error: "还没有连接这个设备" });
    res.json({ ok: true, retainedRuns: true });
  });
}

module.exports = { PROVIDERS, config, providerStatus, normalizeActivity, ingestActivity, mountWearable, hashState };
