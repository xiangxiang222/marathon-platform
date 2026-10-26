const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_AVATAR_BYTES = 256 * 1024;
const STORED_AVATAR = /^(\d+)-([a-f0-9]{64}\.(?:png|jpg|webp))$/;

function avatarRoot() {
  return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "avatars");
}

function avatarError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function parseAvatar(data) {
  if (typeof data !== "string" || data.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 50) {
    throw avatarError("头像图片不超过 256KB", 413);
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw avatarError("头像只支持 JPEG、PNG 或 WebP 图片");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.toString("base64") !== match[2]) throw avatarError("头像图片内容无效");
  if (buffer.length > MAX_AVATAR_BYTES) throw avatarError("头像图片不超过 256KB", 413);
  const isPng = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.toString("ascii", 12, 16) === "IHDR";
  const isJpeg = buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217;
  const isWebp = buffer.length >= 20 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(buffer.toString("ascii", 12, 16));
  const type = isPng ? "png" : isJpeg ? "jpeg" : isWebp ? "webp" : "";
  if (!type || type !== match[1]) throw avatarError("头像图片格式与内容不符，请重新选择图片");
  if (isPng && (!buffer.readUInt32BE(16) || !buffer.readUInt32BE(20) || buffer.readUInt32BE(16) > 8192 || buffer.readUInt32BE(20) > 8192)) {
    throw avatarError("头像图片尺寸无效");
  }
  return { buffer, ext: type === "jpeg" ? "jpg" : type, mime: "image/" + type };
}

function storeAvatar(userId, data) {
  const image = parseAvatar(data);
  const digest = crypto.createHash("sha256").update(image.buffer).digest("hex");
  const filename = Number(userId) + "-" + digest + "." + image.ext;
  fs.mkdirSync(avatarRoot(), { recursive: true });
  // Content-addressed names make an interrupted write independent of the previous avatar.
  fs.writeFileSync(path.join(avatarRoot(), filename), image.buffer, { flag: "wx" });
  return filename;
}

function saveAvatar(userId, data) {
  try { return storeAvatar(userId, data); }
  catch (err) {
    if (err.code !== "EEXIST") throw err;
    const image = parseAvatar(data);
    return Number(userId) + "-" + crypto.createHash("sha256").update(image.buffer).digest("hex") + "." + image.ext;
  }
}

function avatarUrlOf(userId, stored) {
  const match = STORED_AVATAR.exec(String(stored || ""));
  if (!match || Number(match[1]) !== Number(userId)) return "";
  return (process.env.BASE_PATH || "/marathon") + "/api/avatars/" + Number(userId) + "/" + match[2];
}

function removeAvatar(stored) {
  if (!STORED_AVATAR.test(String(stored || ""))) return;
  try { fs.unlinkSync(path.join(avatarRoot(), stored)); }
  catch (err) { if (err.code !== "ENOENT") throw err; }
}

function migrateLegacyAvatars(db) {
  const rows = db.prepare("SELECT id, avatar FROM users WHERE avatar LIKE 'data:image/%'").all();
  for (const row of rows) {
    let stored;
    try { stored = saveAvatar(row.id, row.avatar); }
    catch (err) {
      // Preserve malformed legacy values for recovery; never send them as image sources.
      if (err.status === 400 || err.status === 413) continue;
      throw err;
    }
    db.prepare("UPDATE users SET avatar = ? WHERE id = ? AND avatar = ?").run(stored, row.id, row.avatar);
  }
}

module.exports = { MAX_AVATAR_BYTES, avatarRoot, parseAvatar, saveAvatar, avatarUrlOf, removeAvatar, migrateLegacyAvatars };
