const WIDTH = 1080;
const STACK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEKS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const VOID = "#05070e";
const ICE = "#e7f4ff";
const CYAN = "#7ee7ff";
const HEADER = 700;
const FOOTER = 248;
const STARS = [
  [92, 58, 1.2, 0],
  [168, 96, 1, 0],
  [246, 46, 2.1, 1],
  [390, 78, 1.1, 0],
  [508, 36, 1.6, 1],
  [612, 92, 1, 0],
  [734, 54, 1.3, 0],
  [812, 128, 1, 0],
  [968, 44, 2.4, 1],
  [1004, 168, 1.2, 0],
  [360, 236, 1.1, 0],
  [430, 150, 1, 0]
];

function posterFacts(date) {
  const [year, month, day] = String(date || "").split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month: MONTHS[month - 1] || "",
    day: String(day || ""),
    weekday: WEEKS[weekday] || ""
  };
}

function raceLine(race) {
  const bits = [];
  if (race && race.city) bits.push(race.city);
  const distances = race && race.distanceLabels && race.distanceLabels.length ? race.distanceLabels : race && race.kindLabels;
  if (distances && distances.length) bits.push(distances.join(" / "));
  return bits.join("  ·  ");
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = Array.from(String(text || ""));
  if (!chars.length) return [""];
  const lines = [];
  let current = "";
  let index = 0;
  while (index < chars.length && lines.length < maxLines) {
    const next = current + chars[index];
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = "";
      continue;
    }
    current = next;
    index += 1;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (index < chars.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = Array.from(last).slice(0, -1).join("");
    lines[lines.length - 1] = (last || "") + "…";
  }
  return lines;
}

function measureRows(ctx, races) {
  return (races || []).map((race, index) => {
    ctx.font = "600 42px " + STACK;
    const name = wrapText(ctx, race.name || "", 800, 2);
    ctx.font = "400 26px " + STACK;
    const line = wrapText(ctx, raceLine(race), 800, 1)[0];
    const height = 36 + name.length * 58 + 16 + 36 + 28;
    return { index, name, line, height };
  });
}

function clipRect(ctx, y, height, paint) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, WIDTH, height);
  ctx.clip();
  paint();
  ctx.restore();
}

function star(ctx, x, y, radius, bright) {
  if (bright) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 9);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    glow.addColorStop(0.18, "rgba(170, 236, 255, 0.42)");
    glow.addColorStop(1, "rgba(170, 236, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f7fdff";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function cornerTicks(ctx, y, height, edge) {
  const inset = 40;
  const len = 26;
  const top = edge === "top" ? y + 32 : y + height - 32;
  const points = edge === "top"
    ? [[inset, top, 1, 1], [WIDTH - inset, top, -1, 1]]
    : [[inset, top, 1, -1], [WIDTH - inset, top, -1, -1]];
  ctx.strokeStyle = "rgba(126, 231, 255, 0.55)";
  ctx.lineWidth = 1.5;
  points.forEach(([x, py, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, py + dy * len);
    ctx.lineTo(x, py);
    ctx.lineTo(x + dx * len, py);
    ctx.stroke();
  });
}

function paintVoid(ctx, y, height, mode) {
  clipRect(ctx, y, height, () => {
    const sky = ctx.createLinearGradient(0, y, 0, y + height);
    sky.addColorStop(0, mode === "head" ? "#05070e" : "#071422");
    sky.addColorStop(0.62, mode === "head" ? "#0d2748" : "#08111d");
    sky.addColorStop(1, "#071422");
    ctx.fillStyle = sky;
    ctx.fillRect(0, y, WIDTH, height);
    if (mode === "head") {
      const limb = ctx.createRadialGradient(940, y + 28, 10, 860, y + 150, 620);
      limb.addColorStop(0, "rgba(214, 248, 255, 0.92)");
      limb.addColorStop(0.08, "rgba(120, 214, 255, 0.55)");
      limb.addColorStop(0.28, "rgba(46, 112, 210, 0.22)");
      limb.addColorStop(1, "rgba(5, 7, 14, 0)");
      ctx.fillStyle = limb;
      ctx.fillRect(0, y, WIDTH, height);
      ctx.strokeStyle = "rgba(186, 244, 255, 0.62)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(880, y + 168, 410, 132, -0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(126, 231, 255, 0.24)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(880, y + 168, 500, 164, -0.62, 0, Math.PI * 2);
      ctx.stroke();
      STARS.forEach(([sx, sy, radius, bright]) => star(ctx, sx, y + sy, radius, bright));
      cornerTicks(ctx, y, height, "top");
    } else {
      ctx.strokeStyle = "rgba(126, 231, 255, 0.32)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(WIDTH / 2, y + height + 36, 520, 150, 0, 0, Math.PI * 2);
      ctx.stroke();
      cornerTicks(ctx, y, height, "bottom");
    }
  });
}

function paintHeader(ctx, facts, count, lunar) {
  paintVoid(ctx, 0, HEADER, "head");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CYAN;
  ctx.font = "500 28px " + STACK;
  ctx.fillText("赛历", 80, 108);
  ctx.fillStyle = "rgba(231, 244, 255, 0.62)";
  ctx.font = "400 26px " + STACK;
  ctx.textAlign = "right";
  ctx.fillText("当天开赛", WIDTH - 80, 108);
  ctx.textAlign = "left";
  ctx.fillStyle = ICE;
  ctx.font = "500 36px " + STACK;
  ctx.fillText(facts.month, 80, 188);
  if (lunar) {
    const monthWidth = ctx.measureText(facts.month).width;
    ctx.fillStyle = "rgba(231, 244, 255, 0.46)";
    ctx.font = "400 28px " + STACK;
    ctx.fillText(lunar, 96 + monthWidth, 186);
  }
  ctx.fillStyle = "#f4fbff";
  ctx.font = "200 248px " + STACK;
  ctx.shadowColor = "rgba(126, 231, 255, 0.55)";
  ctx.shadowBlur = 28;
  ctx.fillText(facts.day, 72, 500);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(231, 244, 255, 0.78)";
  ctx.font = "400 32px " + STACK;
  ctx.fillText(facts.weekday, 84, 590);
  const label = count + " 场";
  ctx.font = "500 30px " + STACK;
  const labelWidth = ctx.measureText(label).width;
  const chipX = WIDTH - 84 - labelWidth - 36;
  const chipY = 552;
  ctx.beginPath();
  ctx.moveTo(chipX + 22, chipY);
  ctx.arcTo(chipX + labelWidth + 36, chipY, chipX + labelWidth + 36, chipY + 48, 22);
  ctx.arcTo(chipX + labelWidth + 36, chipY + 48, chipX, chipY + 48, 22);
  ctx.arcTo(chipX, chipY + 48, chipX, chipY, 22);
  ctx.arcTo(chipX, chipY, chipX + labelWidth + 36, chipY, 22);
  ctx.closePath();
  ctx.strokeStyle = "rgba(126, 231, 255, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.textAlign = "left";
  ctx.fillText(label, chipX + 18, chipY + 33);
  const beam = ctx.createLinearGradient(40, 0, WIDTH - 40, 0);
  beam.addColorStop(0, "rgba(126, 231, 255, 0)");
  beam.addColorStop(0.18, "rgba(126, 231, 255, 0.15)");
  beam.addColorStop(0.42, "rgba(232, 251, 255, 0.95)");
  beam.addColorStop(0.68, "rgba(126, 231, 255, 0.45)");
  beam.addColorStop(1, "rgba(126, 231, 255, 0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, HEADER - 3, WIDTH, 2);
}

function paintBody(ctx, rows, bodyHeight) {
  const field = ctx.createLinearGradient(0, HEADER, 0, HEADER + bodyHeight);
  field.addColorStop(0, "#071422");
  field.addColorStop(1, "#05070e");
  ctx.fillStyle = field;
  ctx.fillRect(0, HEADER, WIDTH, bodyHeight);
  let y = HEADER + 28;
  rows.forEach((row) => {
    ctx.fillStyle = CYAN;
    ctx.font = "500 28px " + STACK;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(row.index + 1).padStart(2, "0"), 80, y + 42);
    ctx.fillStyle = "#f3f8ff";
    ctx.font = "600 42px " + STACK;
    row.name.forEach((line, index) => {
      ctx.fillText(line, 176, y + 44 + index * 58);
    });
    ctx.fillStyle = "#8ea4bc";
    ctx.font = "400 26px " + STACK;
    ctx.fillText(row.line, 176, y + 44 + row.name.length * 58 + 8);
    const rule = y + row.height - 8;
    ctx.strokeStyle = "rgba(126, 231, 255, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(176, rule);
    ctx.lineTo(WIDTH - 80, rule);
    ctx.stroke();
    y += row.height;
  });
}

function paintFooter(ctx, y, year) {
  paintVoid(ctx, y, FOOTER, "foot");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ICE;
  ctx.font = "500 36px " + STACK;
  ctx.fillText("赛历", WIDTH / 2, y + 112);
  ctx.fillStyle = CYAN;
  ctx.font = "400 24px " + STACK;
  ctx.fillText(String(year || ""), WIDTH / 2, y + 164);
  ctx.textAlign = "left";
}

function renderDayPoster(canvas, input) {
  canvas.width = WIDTH;
  canvas.height = 400;
  let ctx = canvas.getContext("2d");
  const facts = posterFacts(input && input.date);
  const rows = measureRows(ctx, (input && input.races) || []);
  const listed = rows.reduce((sum, row) => sum + row.height, 0);
  const bodyHeight = Math.max(listed + 56, 300);
  const height = HEADER + bodyHeight + FOOTER;
  canvas.width = WIDTH;
  canvas.height = height;
  ctx = canvas.getContext("2d");
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, WIDTH, height);
  paintHeader(ctx, facts, rows.length, input && input.lunar);
  paintBody(ctx, rows, bodyHeight);
  paintFooter(ctx, HEADER + bodyHeight, facts.year);
  return { width: WIDTH, height };
}

module.exports = { renderDayPoster, posterFacts, raceLine };
