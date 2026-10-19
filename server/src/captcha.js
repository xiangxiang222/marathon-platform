const crypto = require("crypto");
const zlib = require("zlib");

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  J: ["00001", "00001", "00001", "00001", "00001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  2: ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

const WIDTH = 132;
const HEIGHT = 44;
const SCALE = 4;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const payload = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([len, payload, crc]);
}

function encodePng(pixels) {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * (WIDTH * 3 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function setRgb(pixels, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
}

function blendRgb(pixels, x, y, r, g, b, t) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  pixels[i] = mix(pixels[i], r, t);
  pixels[i + 1] = mix(pixels[i + 1], g, t);
  pixels[i + 2] = mix(pixels[i + 2], b, t);
}

function drawLine(pixels, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    blendRgb(pixels, x, y, color[0], color[1], color[2], 0.55);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawGlyph(pixels, ch, ox, oy, color) {
  const glyph = GLYPHS[ch];
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy][gx] !== "1") continue;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          if (crypto.randomInt(12) === 0) continue;
          setRgb(pixels, ox + gx * SCALE + sx, oy + gy * SCALE + sy, color[0], color[1], color[2]);
        }
      }
    }
  }
}

function randomCode(len = 4) {
  let out = "";
  for (let i = 0; i < len; i++) out += CHARS[crypto.randomInt(CHARS.length)];
  return out;
}

function renderPng(code) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 244;
    pixels[i + 1] = 239;
    pixels[i + 2] = 230;
  }
  for (let n = 0; n < 180; n++) {
    const shade = 180 + crypto.randomInt(50);
    setRgb(pixels, crypto.randomInt(WIDTH), crypto.randomInt(HEIGHT), shade, shade - 8, shade - 20);
  }
  for (let i = 0; i < 3; i++) {
    drawLine(
      pixels,
      crypto.randomInt(WIDTH),
      crypto.randomInt(HEIGHT),
      crypto.randomInt(WIDTH),
      crypto.randomInt(HEIGHT),
      [45, 106, 79]
    );
  }
  const text = String(code || "").toUpperCase();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!GLYPHS[ch]) continue;
    const ox = 10 + i * (5 * SCALE + 8);
    const oy = 6 + crypto.randomInt(5);
    const color = [27 + crypto.randomInt(18), 67 + crypto.randomInt(20), 50 + crypto.randomInt(16)];
    drawGlyph(pixels, ch, ox, oy, color);
  }
  return encodePng(pixels);
}

function createCaptcha() {
  const code = randomCode();
  const png = renderPng(code);
  return {
    code,
    png,
    image: `data:image/png;base64,${png.toString("base64")}`,
  };
}

function codesMatch(expected, input) {
  return String(input || "").trim().toUpperCase() === String(expected || "").toUpperCase();
}

module.exports = { CHARS, createCaptcha, codesMatch, renderPng, randomCode };
