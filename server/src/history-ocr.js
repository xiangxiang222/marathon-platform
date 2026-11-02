const fs = require("fs");
const path = require("path");
const os = require("os");
const { fork } = require("child_process");
const { consentError, recordAcceptance } = require("./legal");

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_PIXELS = 20000000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Inspect dimensions before decoding compressed image data. The OCR subprocess
// has a separate lifetime and never receives a path or URL supplied by a user.
function imageSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > MAX_IMAGE) throw fail("请选择不超过 8MB 的 JPG、PNG 或 WebP 图片");
  let width, height;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString("ascii", 12, 16) === "IHDR") {
    width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset++] !== 0xff) break;
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if ([0xd8, 0x01].includes(marker) || marker >= 0xd0 && marker <= 0xd7) continue;
      if (marker === 0xda || marker === 0xd9 || offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        height = buffer.readUInt16BE(offset + 3); width = buffer.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  } else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const type = buffer.toString("ascii", 12, 16);
    if (type === "VP8X" && buffer.length >= 30) {
      width = buffer.readUIntLE(24, 3) + 1; height = buffer.readUIntLE(27, 3) + 1;
    } else if (type === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) {
      width = buffer.readUInt16LE(26) & 0x3fff; height = buffer.readUInt16LE(28) & 0x3fff;
    } else if (type === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      width = 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]);
      height = 1 + (((buffer[24] & 15) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6));
    }
  }
  if (!width || !height) throw fail("图片格式无效，请重新选择 JPG、PNG 或 WebP");
  if (width < 32 || height < 32) throw fail("图片太小，请选择清晰的成绩截图或证书");
  if (width > 12000 || height > 12000 || width * height > MAX_PIXELS) throw fail("图片尺寸过大，请裁剪到成绩或证书区域后重试");
  return { width, height };
}

function redactIdentifiers(text) {
  return String(text || "").replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[证件号已隐藏]").replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号已隐藏]");
}

let active = 0;
function recognizeImage(buffer, options = {}) {
  imageSize(buffer);
  if (active >= 1) return Promise.reject(fail("正在识别其他资料，请稍后重试", 429));
  active++;
  return new Promise((resolve, reject) => {
    let child, languageDir, done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      active--;
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener("abort", abort);
      if (child) child.kill("SIGKILL");
      if (languageDir) fs.rmSync(languageDir, { recursive: true, force: true });
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(fail("识别已取消", 499));
    const timer = setTimeout(() => finish(fail("图片识别超时，请裁剪成绩区域后重试，或粘贴成绩文字")), options.timeout || 25000);
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      // Both bundled language files must share one local langPath. This
      // temporary directory contains only public model data, never images.
      languageDir = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-ocr-languages-"));
      for (const code of ["chi_sim", "eng"]) fs.copyFileSync(
        path.join(path.dirname(require.resolve("@tesseract.js-data/" + code)), "4.0.0_best_int", code + ".traineddata.gz"),
        path.join(languageDir, code + ".traineddata.gz"));
      child = fork(__filename, ["--recognize"], {
        execArgv: ["--max-old-space-size=256"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { PATH: process.env.PATH || "", LANG: "C.UTF-8" }
      });
      child.once("error", () => finish(fail("识别暂时不可用，请粘贴成绩文字或手动补充", 503)));
      child.once("exit", () => finish(fail("没有识别成功，请换一张清晰截图，或粘贴成绩文字")));
      child.on("message", (result) => {
        if (result?.error) return finish(fail("没有识别成功，请换一张清晰截图，或粘贴成绩文字"));
        // Sparse OCR separates every field with an empty paragraph. A single
        // image is one import block; keep its fields together for review.
        const text = redactIdentifiers(result?.text).slice(0, 50000).replace(/\r\n?/g, "\n").replace(/\n[ \t]*\n+/g, "\n").trim();
        if (!text) return finish(fail("未识别到文字，请裁剪成绩区域后重试，或手动补充"));
        finish(null, { text, confidence: Number.isFinite(result.confidence) ? Math.round(result.confidence) : null,
          warnings: ["识别结果可能有误，请核对赛事、日期、项目及净计时；原图仅临时解析，未保存。"], engine: "tesseract-local" });
      });
      child.send({ image: buffer.toString("base64"), languageDir }, (error) => { if (error) finish(fail("未能读取图片，请重试")); });
    } catch (_) { finish(fail("识别暂时不可用，请粘贴成绩文字或手动补充", 503)); }
  });
}

function readImage(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = Number(req.get("content-length")) > MAX_IMAGE + 65536;
    req.on("data", (chunk) => { size += chunk.length; if (size > MAX_IMAGE + 65536) over = true; if (!over) chunks.push(chunk); });
    req.on("error", () => reject(fail("图片上传中断，请重试")));
    req.on("aborted", () => reject(fail("图片上传中断，请重试")));
    req.on("end", () => over ? reject(fail("图片不超过 8MB", 413)) : resolve(Buffer.concat(chunks)));
  });
}

function mountHistoryOcr(app, { BASE, getDb, userFrom, recognize = recognizeImage }) {
  const recent = new Map();
  app.post(BASE + "/api/me/race-history/recognize", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const user = userFrom(req);
    if (!user) return res.status(401).json({ error: "请先登录" });
    const version = req.get("X-Race-History-Consent");
    const consent = version === undefined ? undefined : { version, accepted: true };
    const agreement = consentError(consent, true);
    if (agreement) return res.status(agreement.status).json({ error: agreement.status === 428 ? "请先同意本次图片临时解析" : agreement.error });
    if (!/^multipart\/form-data\s*;/i.test(req.get("content-type") || "")) return res.status(400).json({ error: "请选择图片上传" });
    const now = Date.now();
    for (const [key, value] of recent) if (value.at < now - 3600000) recent.delete(key);
    const limit = recent.get(user.id);
    if (limit && limit.count >= 60) return res.status(429).json({ error: "本小时识别资料较多，请稍后再试，或使用文字导入" });
    recent.set(user.id, { at: limit?.at || now, count: (limit?.count || 0) + 1 });
    const controller = new AbortController();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", closed);
    try {
      const body = await readImage(req);
      const bytes = oneImage(body, req.get("content-type"));
      imageSize(bytes);
      const current = userFrom(req);
      if (!current || current.id !== user.id) return res.status(401).json({ error: "登录已失效，请重新登录" });
      recordAcceptance(getDb(), user.id, consent, "race-history-ocr", "race-history-ocr");
      const result = await recognize(bytes, { signal: controller.signal });
      const after = userFrom(req);
      if (!after || after.id !== user.id) return res.status(401).json({ error: "登录已失效，请重新登录" });
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (!res.destroyed) res.status(error.status || 500).json({ error: error.status ? error.message : "识别暂时失败，请稍后重试" });
    } finally { res.removeListener("close", closed); }
  });
}

function oneImage(buffer, contentType) {
  const match = /boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType || "");
  const boundary = match && (match[1] || match[2]);
  if (!boundary || boundary.length > 200) throw fail("请选择一张图片上传");
  const marker = Buffer.from("--" + boundary), files = [];
  let from = buffer.indexOf(marker);
  while (from >= 0) {
    const next = buffer.indexOf(marker, from + marker.length);
    if (next < 0) break;
    const part = buffer.subarray(from + marker.length + 2, next - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0 && /content-disposition:[^\r\n]*\bfilename=/i.test(part.subarray(0, headerEnd).toString())) files.push(part.subarray(headerEnd + 4));
    from = next;
  }
  if (files.length !== 1 || !files[0].length) throw fail("一次请选择一张图片");
  if (files[0].length > MAX_IMAGE) throw fail("图片不超过 8MB", 413);
  return files[0];
}

if (require.main === module && process.argv.includes("--recognize")) {
  process.once("message", async (message) => {
    let worker;
    try {
      const { createWorker, PSM } = require("tesseract.js");
      worker = await createWorker("chi_sim+eng", 1, { langPath: message.languageDir, cacheMethod: "none", errorHandler: () => {} });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(Buffer.from(message.image, "base64"));
      await worker.terminate();
      process.send({ text: data.text, confidence: data.confidence }, () => process.exit(0));
    } catch (_) {
      if (worker) await worker.terminate().catch(() => {});
      process.send({ error: true }, () => process.exit(1));
    }
  });
}

module.exports = { mountHistoryOcr, recognizeImage, imageSize, redactIdentifiers, oneImage, MAX_IMAGE };
