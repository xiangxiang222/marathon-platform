const WIDTH = 1080;
const STACK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEKS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const BACKGROUND = "#f5f6fa";
const CARD = "#ffffff";
const INK = "#1f2026";
const MUTED = "#8a8e99";
const LINE = "#eff0f4";
const ACCENT = "#ff0a30";
const ACCENT_SOFT = "#fff0f3";
const HEADER = 700;
const FOOTER = 248;

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

function fillRoundedRect(ctx, x, y, width, height, radius, color) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function paintHeader(ctx, facts, count, lunar) {
  fillRoundedRect(ctx, 40, 40, WIDTH - 80, HEADER - 80, 32, CARD);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACCENT;
  ctx.font = "600 28px " + STACK;
  ctx.fillText("赛历", 80, 108);
  ctx.fillStyle = MUTED;
  ctx.font = "400 26px " + STACK;
  ctx.textAlign = "right";
  ctx.fillText("当天开赛", WIDTH - 80, 108);
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "600 36px " + STACK;
  ctx.fillText(facts.month, 80, 188);
  if (lunar) {
    const monthWidth = ctx.measureText(facts.month).width;
    ctx.fillStyle = MUTED;
    ctx.font = "400 28px " + STACK;
    ctx.fillText(lunar, 96 + monthWidth, 186);
  }
  ctx.fillStyle = ACCENT;
  ctx.font = "700 248px " + STACK;
  ctx.fillText(facts.day, 72, 500);
  ctx.fillStyle = INK;
  ctx.font = "400 32px " + STACK;
  ctx.fillText(facts.weekday, 84, 590);
  const label = count + " 场";
  ctx.font = "600 30px " + STACK;
  const labelWidth = ctx.measureText(label).width;
  const chipX = WIDTH - 84 - labelWidth - 36;
  const chipY = 548;
  fillRoundedRect(ctx, chipX, chipY, labelWidth + 36, 54, 14, ACCENT_SOFT);
  ctx.fillStyle = ACCENT;
  ctx.fillText(label, chipX + 18, chipY + 37);
}

function paintBody(ctx, rows, bodyHeight) {
  fillRoundedRect(ctx, 40, HEADER, WIDTH - 80, bodyHeight, 32, CARD);
  let y = HEADER + 28;
  rows.forEach((row) => {
    ctx.fillStyle = ACCENT;
    ctx.font = "600 28px " + STACK;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(row.index + 1).padStart(2, "0"), 80, y + 42);
    ctx.fillStyle = INK;
    ctx.font = "600 42px " + STACK;
    row.name.forEach((line, index) => {
      ctx.fillText(line, 176, y + 44 + index * 58);
    });
    ctx.fillStyle = MUTED;
    ctx.font = "400 26px " + STACK;
    ctx.fillText(row.line, 176, y + 44 + row.name.length * 58 + 8);
    if (row.index < rows.length - 1) {
      const rule = y + row.height - 8;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(176, rule);
      ctx.lineTo(WIDTH - 80, rule);
      ctx.stroke();
    }
    y += row.height;
  });
}

function paintFooter(ctx, y, year) {
  fillRoundedRect(ctx, 40, y + 40, WIDTH - 80, FOOTER - 80, 32, CARD);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "600 36px " + STACK;
  ctx.fillText("赛历", WIDTH / 2, y + 112);
  ctx.fillStyle = MUTED;
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
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, height);
  paintHeader(ctx, facts, rows.length, input && input.lunar);
  paintBody(ctx, rows, bodyHeight);
  paintFooter(ctx, HEADER + bodyHeight, facts.year);
  return { width: WIDTH, height };
}

module.exports = { renderDayPoster, posterFacts, raceLine };
