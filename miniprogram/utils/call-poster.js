const WIDTH = 750;
const LIMIT = 350;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function fit(ctx, value, maxWidth) {
  let text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text && ctx.measureText(text + "…").width > maxWidth) text = Array.from(text).slice(0, -1).join("");
  return text + "…";
}

function renderCallPoster(canvas, call) {
  const allGroups = (call.groups || []).map((group) => ({ ...group, rows: group.rows || [] }));
  const total = allGroups.reduce((sum, group) => sum + group.rows.length, 0);
  let remaining = LIMIT;
  const groups = allGroups.map((group) => {
    const rows = group.rows.slice(0, remaining);
    remaining -= rows.length;
    return { ...group, rows };
  }).filter((group) => group.rows.length);
  const height = 330 + groups.reduce((sum, group) => sum + 64 + group.rows.length * 76, 0) + (total > LIMIT ? 72 : 0);
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f6fa";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#ff0a30";
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(32, 32, WIDTH - 64, 266);
  ctx.fillStyle = "#ff0a30";
  ctx.font = "600 24px " + FONT;
  ctx.fillText(call.eyebrow || "跑团成绩接龙", 60, 78);
  ctx.fillStyle = "#1f2026";
  ctx.font = "700 36px " + FONT;
  ctx.fillText(fit(ctx, call.title, WIDTH - 120), 60, 132);
  ctx.fillStyle = "#8a8e99";
  ctx.font = "400 24px " + FONT;
  ctx.fillText(String(call.raceDate || "") + " · " + total + (call.countLabel || " 条成绩"), 60, 176);
  ctx.fillStyle = "#1f2026";
  ctx.font = "500 23px " + FONT;
  ctx.fillText(fit(ctx, call.summary || "暂无成绩", WIDTH - 120), 60, 218);
  let y = 318;
  groups.forEach((group) => {
    ctx.fillStyle = "#fff0f3";
    ctx.fillRect(32, y, WIDTH - 64, 56);
    ctx.fillStyle = "#ff0a30";
    ctx.font = "600 24px " + FONT;
    ctx.fillText(group.label, 54, y + 37);
    y += 56;
    group.rows.forEach((row) => {
      ctx.fillStyle = "#ff0a30";
      ctx.font = "600 22px " + FONT;
      ctx.fillText(String(row.place).padStart(2, "0"), 54, y + 44);
      ctx.fillStyle = "#1f2026";
      ctx.font = "600 25px " + FONT;
      ctx.fillText(fit(ctx, row.nickname + (row.staffFilled ? " · 管理员补录" : ""), 375), 112, y + 43);
      ctx.textAlign = "right";
      ctx.font = "600 24px " + FONT;
      ctx.fillText(fit(ctx, (row.clock || row.status || "") + (row.tag ? " " + row.tag : ""), 190), WIDTH - 54, y + 43);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#eff0f4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(54, y + 74);
      ctx.lineTo(WIDTH - 54, y + 74);
      ctx.stroke();
      y += 76;
    });
  });
  if (total > LIMIT) {
    ctx.fillStyle = "#8a8e99";
    ctx.font = "400 22px " + FONT;
    ctx.fillText("长图展示前 " + LIMIT + " 条成绩", 54, y + 42);
  }
  return { width: WIDTH, height };
}

function clubRaceRows(item) {
  const lines = (item.marks || []).map((mark) => ({ ...mark, clock: mark.clock || "", distance: mark.distanceLabel || "" }));
  for (const result of item.results || []) {
    const distance = result.distanceLabel || "";
    const existing = lines.find((row) => row.userId === result.userId && row.clock === result.clock && (!row.distance || row.distance === distance));
    if (existing) {
      existing.distance = distance || existing.distance;
      existing.pb = Boolean(existing.pb || result.pb);
    } else {
      lines.push({ ...result, status: "完赛", distance });
    }
  }
  return lines;
}

module.exports = { renderCallPoster, clubRaceRows };
