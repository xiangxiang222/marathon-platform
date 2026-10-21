export function textCard(lines) {
  const width = 750;
  const lineHeight = 48;
  const pad = 40;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = pad * 2 + Math.max(lines.length, 1) * lineHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1c1c1e";
  ctx.font = "30px sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line || " ", pad, pad + 34 + index * lineHeight);
  });
  return canvas.toDataURL("image/png");
}

export async function albumCard({ title, date, place, count, coverUrl }) {
  const width = 750;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = coverUrl ? 1040 : 420;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let top = 48;
  if (coverUrl) {
    const blob = await (await fetch(coverUrl)).blob();
    const bmp = await createImageBitmap(blob);
    const box = 670;
    const scale = Math.max(box / bmp.width, box / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(40, 40, box, 670);
    ctx.clip();
    ctx.drawImage(bmp, 40 + (box - w) / 2, 40 + (670 - h) / 2, w, h);
    ctx.restore();
    top = 760;
  }
  ctx.fillStyle = "#1c1c1e";
  ctx.font = "32px sans-serif";
  [title, date, place, count + " 张照片", "本团成员打开跑团即可查看。"].filter(Boolean).forEach((line, index) => {
    ctx.fillText(line, 40, top + index * 48);
  });
  return canvas.toDataURL("image/png");
}
