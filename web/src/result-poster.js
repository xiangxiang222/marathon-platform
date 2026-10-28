const WIDTH = 750;
const PAD = 40;
const LIMIT = 350;

function fit(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped && ctx.measureText(clipped + "…").width > maxWidth) clipped = Array.from(clipped).slice(0, -1).join("");
  return clipped + "…";
}

export function renderResultPoster(call) {
  const groups = (call.groups || []).map((group) => ({ ...group, rows: group.rows || [] }));
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  let remaining = LIMIT;
  const visible = groups.map((group) => {
    const rows = group.rows.slice(0, remaining);
    remaining -= rows.length;
    return { ...group, rows };
  }).filter((group) => group.rows.length);
  const height = 264 + visible.reduce((sum, group) => sum + 66 + group.rows.length * 76, 0) + (total > LIMIT ? 74 : 0) + 68;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f6fa";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#ff0a30";
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(PAD, 36, WIDTH - PAD * 2, 206);
  ctx.fillStyle = "#ff0a30";
  ctx.font = '600 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(call.eyebrow || "跑团成绩接龙", PAD + 28, 82);
  ctx.fillStyle = "#1f2026";
  ctx.font = '700 36px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(fit(ctx, call.title, WIDTH - PAD * 2 - 56), PAD + 28, 136);
  ctx.fillStyle = "#8a8e99";
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(String(call.raceDate || "") + " · " + total + (call.countLabel || " 条成绩"), PAD + 28, 180);
  ctx.fillStyle = "#1f2026";
  ctx.font = '500 23px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(fit(ctx, call.summary || "暂无成绩", WIDTH - PAD * 2 - 56), PAD + 28, 218);
  let y = 264;
  visible.forEach((group) => {
    ctx.fillStyle = "#fff0f3";
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, 58);
    ctx.fillStyle = "#ff0a30";
    ctx.font = '600 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(group.label, PAD + 24, y + 38);
    y += 58;
    group.rows.forEach((row) => {
      ctx.fillStyle = "#ff0a30";
      ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(row.place).padStart(2, "0"), PAD + 22, y + 45);
      ctx.fillStyle = "#1f2026";
      ctx.font = '600 26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(fit(ctx, row.nickname + (row.staffFilled ? " · 管理员补录" : ""), 350), PAD + 82, y + 44);
      ctx.textAlign = "right";
      ctx.fillStyle = "#1f2026";
      ctx.font = '600 25px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(fit(ctx, (row.clock || row.status || "") + (row.tag ? " " + row.tag : ""), 214), WIDTH - PAD - 22, y + 44);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#eff0f4";
      ctx.beginPath();
      ctx.moveTo(PAD + 22, y + 75);
      ctx.lineTo(WIDTH - PAD - 22, y + 75);
      ctx.stroke();
      y += 76;
    });
  });
  if (total > LIMIT) {
    ctx.fillStyle = "#8a8e99";
    ctx.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("长图展示前 " + LIMIT + " 条；可导出 CSV 获取完整名单。", PAD + 18, y + 42);
    y += 74;
  }
  ctx.fillStyle = "#8a8e99";
  ctx.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("跑团赛事记录 · 以成员提交内容为准", WIDTH / 2, y + 42);
  return canvas.toDataURL("image/png");
}

export function callCsv(call) {
  const rows = [["比赛", "比赛日", "项目", "名次", "昵称", "成绩", "标签", "补录"]];
  for (const group of call.groups || []) {
    for (const row of group.rows || []) rows.push([call.title, call.raceDate, group.label, row.place, row.nickname, row.clock, row.tag || "", row.staffFilled ? "管理员补录" : ""]);
  }
  const cell = (value) => {
    let text = String(value == null ? "" : value);
    if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function clubRaceRows(item) {
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

export function clubRaceCsv(board) {
  const rows = [["比赛", "比赛日", "城市", "项目", "成员", "参赛状态", "成绩", "PB"]];
  const cell = (value) => {
    let text = String(value == null ? "" : value);
    if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  for (const item of board || []) {
    const race = item.race || {};
    const lines = clubRaceRows(item);
    if (!lines.length) rows.push([race.name, race.raceDate, race.city, (race.distanceLabels || []).join("/"), "", "", "", ""]);
    else for (const row of lines) rows.push([
      race.name,
      race.raceDate,
      race.city,
      row.distance || (race.distanceLabels || []).join("/"),
      row.nickname,
      row.status,
      row.clock,
      row.pb ? "是" : ""
    ]);
  }
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
