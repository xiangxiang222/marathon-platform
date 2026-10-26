const MAX_AVATAR_BYTES = 256 * 1024;

function avatarUrl(value, baseUrl) {
  const source = typeof value === "string" ? value : "";
  if (/^\/marathon\/api\/avatars\/[^/?#]+\/[^/?#]+$/.test(source)) {
    return String(baseUrl || "").replace(/\/$/, "") + source;
  }
  return source;
}

function networkAvatar(value, baseUrl) {
  const source = avatarUrl(value, baseUrl);
  return /^https?:\/\//i.test(source) ? source : "";
}

function normalizeAvatars(value, baseUrl) {
  if (Array.isArray(value)) return value.map((item) => normalizeAvatars(item, baseUrl));
  if (!value || typeof value !== "object") return value;
  const normalized = {};
  for (const key of Object.keys(value)) {
    normalized[key] = key === "avatar" && typeof value[key] === "string"
      ? avatarUrl(value[key], baseUrl)
      : normalizeAvatars(value[key], baseUrl);
  }
  return normalized;
}

function imageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && [82, 73, 70, 70].every((value, index) => bytes[index] === value) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)) return "image/webp";
  return "";
}

function readAvatar(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(result) {
        const bytes = new Uint8Array(result.data);
        const mime = imageMime(bytes);
        if (!mime) return reject(new Error("请使用 JPG、PNG 或 WebP 格式的头像"));
        if (bytes.byteLength > MAX_AVATAR_BYTES) return reject(new Error("头像超过 256KB，请换一张较小的图片"));
        resolve("data:" + mime + ";base64," + wx.arrayBufferToBase64(result.data));
      },
      fail: () => reject(new Error("无法读取这张头像，请重新选择"))
    });
  });
}

function prepareAvatar(filePath) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 55,
      success: (result) => resolve(result.tempFilePath || filePath),
      fail: () => resolve(filePath)
    });
  }).then(readAvatar);
}

module.exports = { avatarUrl, networkAvatar, normalizeAvatars, prepareAvatar };
