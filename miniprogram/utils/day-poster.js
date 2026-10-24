const WIDTH = 1080;
const STACK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEKS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const INK = "#101418";
const PAPER = "#f3efe6";
const GOLD = "#d7c4a3";
const HEADER = 640;
const FOOTER = 228;

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
  if (race && race.regStatus) bits.push(race.regStatus);
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

function paintNight(ctx, y, height) {
  const sky = ctx.createLinearGradient(0, y, 0, y + height);
  sky.addColorStop(0, "#0c1016");
  sky.addColorStop(0.58, "#17212b");
  sky.addColorStop(1, "#243140");
  ctx.fillStyle = sky;
  ctx.fillRect(0, y, WIDTH, height);
  const glow = ctx.createRadialGradient(880, y + 36, 12, 840, y + 90, 540);
  glow.addColorStop(0, "rgba(215, 196, 163, 0.38)");
  glow.addColorStop(0.42, "rgba(112, 140, 164, 0.16)");
  glow.addColorStop(1, "rgba(12, 16, 22, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, y, WIDTH, height);
  ctx.strokeStyle = "rgba(215, 196, 163, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(1060, y - 60, 390, 0.62, 2.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1060, y - 60, 444, 0.7, 2.02);
  ctx.stroke();
}

function paintHeader(ctx, facts, count, lunar) {
  paintNight(ctx, 0, HEADER);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = "500 28px " + STACK;
  ctx.fillText("赛历", 80, 108);
  ctx.fillStyle = "rgba(243, 239, 230, 0.62)";
  ctx.font = "400 26px " + STACK;
  ctx.textAlign = "right";
  ctx.fillText("当天开赛", WIDTH - 80, 108);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f3efe6";
  ctx.font = "500 36px " + STACK;
  ctx.fillText(facts.month, 80, 196);
  if (lunar) {
    const monthWidth = ctx.measureText(facts.month).width;
    ctx.fillStyle = "rgba(243, 239, 230, 0.48)";
    ctx.font = "400 28px " + STACK;
    ctx.fillText(lunar, 96 + monthWidth, 194);
  }
  ctx.fillStyle = "#f7f4ee";
  ctx.font = "300 228px " + STACK;
  ctx.fillText(facts.day, 76, 470);
  ctx.fillStyle = "rgba(243, 239, 230, 0.78)";
  ctx.font = "400 32px " + STACK;
  ctx.fillText(facts.weekday, 84, 548);
  ctx.textAlign = "right";
  ctx.fillStyle = GOLD;
  ctx.font = "500 34px " + STACK;
  ctx.fillText(count + " 场", WIDTH - 80, 546);
  ctx.textAlign = "left";
  const horizon = ctx.createLinearGradient(0, HEADER - 10, 0, HEADER);
  horizon.addColorStop(0, "rgba(215, 196, 163, 0)");
  horizon.addColorStop(1, "rgba(215, 196, 163, 0.9)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, HEADER - 10, WIDTH, 10);
}

function paintBody(ctx, rows, bodyHeight) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, HEADER, WIDTH, bodyHeight);
  let y = HEADER + 28;
  rows.forEach((row) => {
    ctx.fillStyle = "#a68456";
    ctx.font = "500 28px " + STACK;
    ctx.fillText(String(row.index + 1).padStart(2, "0"), 80, y + 42);
    ctx.fillStyle = INK;
    ctx.font = "600 42px " + STACK;
    row.name.forEach((line, index) => {
      ctx.fillText(line, 176, y + 44 + index * 58);
    });
    ctx.fillStyle = "#7d756b";
    ctx.font = "400 26px " + STACK;
    ctx.fillText(row.line, 176, y + 44 + row.name.length * 58 + 8);
    const rule = y + row.height - 8;
    ctx.strokeStyle = "rgba(16, 20, 24, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(176, rule);
    ctx.lineTo(WIDTH - 80, rule);
    ctx.stroke();
    y += row.height;
  });
}

function paintFooter(ctx, y, year) {
  paintNight(ctx, y, FOOTER);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3efe6";
  ctx.font = "500 36px " + STACK;
  ctx.fillText("赛历", WIDTH / 2, y + 104);
  ctx.fillStyle = "rgba(243, 239, 230, 0.58)";
  ctx.font = "400 24px " + STACK;
  ctx.fillText(String(year || ""), WIDTH / 2, y + 156);
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
  paintHeader(ctx, facts, rows.length, input && input.lunar);
  paintBody(ctx, rows, bodyHeight);
  paintFooter(ctx, HEADER + bodyHeight, facts.year);
  return { width: WIDTH, height };
}

module.exports = { renderDayPoster, posterFacts, raceLine };
