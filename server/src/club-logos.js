const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { parseAvatar } = require("./avatars");

const STORED_LOGO = /^(\d+)-([a-f0-9]{64}\.(?:png|jpg|webp))$/;
function logoRoot() {
  return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "club-logos");
}
function logoUrlOf(clubId, stored) {
  const match = STORED_LOGO.exec(String(stored || ""));
  return match && Number(match[1]) === Number(clubId)
    ? (process.env.BASE_PATH || "/marathon") + "/api/club-logos/" + Number(clubId) + "/" + match[2] : "";
}
function prepareLogo(value, current, clubId) {
  if (value === undefined) return null;
  if (value === "") return { stored: "" };
  if (typeof value !== "string") throw Object.assign(new Error("跑团 Logo 格式不正确"), { status: 400 });
  if (current && value === logoUrlOf(clubId, current)) return null;
  try {
    const image = parseAvatar(value);
    return { ...image, digest: crypto.createHash("sha256").update(image.buffer).digest("hex") };
  } catch (err) {
    if (err.status) err.message = err.message.replace(/头像/g, "跑团 Logo");
    throw err;
  }
}
function storeLogo(clubId, image) {
  if (Object.hasOwn(image, "stored")) return image.stored;
  const stored = Number(clubId) + "-" + image.digest + "." + image.ext;
  fs.mkdirSync(logoRoot(), { recursive: true });
  try { fs.writeFileSync(path.join(logoRoot(), stored), image.buffer, { flag: "wx" }); }
  catch (err) { if (err.code !== "EEXIST") throw err; }
  return stored;
}
function removeLogo(stored) {
  if (!STORED_LOGO.test(String(stored || ""))) return;
  try { fs.unlinkSync(path.join(logoRoot(), stored)); }
  catch (err) { if (err.code !== "ENOENT") throw err; }
}
module.exports = { logoRoot, logoUrlOf, prepareLogo, storeLogo, removeLogo };
