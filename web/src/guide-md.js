function runs(text) {
  const pieces = [];
  const link = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  let match;
  while ((match = link.exec(text))) {
    if (match.index > last) pieces.push(text.slice(last, match.index));
    pieces.push(match[1]);
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  const out = [];
  for (const piece of pieces) {
    const strong = /\*\*([^*]+)\*\*/g;
    let index = 0;
    let hit;
    while ((hit = strong.exec(piece))) {
      if (hit.index > index) out.push({ text: piece.slice(index, hit.index), strong: false });
      out.push({ text: hit[1], strong: true });
      index = hit.index + hit[0].length;
    }
    if (index < piece.length) out.push({ text: piece.slice(index), strong: false });
  }
  return out.filter((item) => item.text).map((item, j) => ({ j, text: item.text, strong: item.strong }));
}

function block(kind, text, mark) {
  const item = { kind, runs: runs(text) };
  if (mark) item.mark = mark;
  if (!item.runs.length) item.runs = [{ j: 0, text: text, strong: false }];
  return item;
}

function guideImageUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\/[^\s<>]+$/i.test(url) || /^\/marathon\/api\/race-sheets\/[\w-]+(?:\?[^\s<>]*)?$/.test(url) ? url : "";
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").replace(/\\\|/g, "\u0000").split("|").map(cell => cell.trim().replace(/\u0000/g, "|"));
}

export function parseGuide(source, options = {}) {
  // Collection metadata is internal. It is never part of the readable guide.
  const lines = String(source || "").replace(/<!--\s*race-details:v1\b[\s\S]*?-->/g, "").replace(/```race-details\s*[\s\S]*?```/g, "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || /^```/.test(line)) continue;
    if (options.rich && line.includes("|") && index + 1 < lines.length && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())) {
      const headers = tableCells(line);
      const rows = [];
      index += 2;
      for (; index < lines.length && lines[index].trim().includes("|"); index++) {
        rows.push(tableCells(lines[index]));
      }
      index--;
      const columns = Math.max(headers.length, ...rows.map(row => row.length));
      const cells = row => Array.from({ length: columns }, (_, j) => ({ j, runs: runs(row[j] || "") }));
      blocks.push({ kind: "table", headers: cells(headers), rows: rows.map((row, r) => ({ r, cells: cells(row) })), width: Math.max(100, columns * 120) });
      continue;
    }
    const image = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)$/.exec(line);
    if (options.rich && image) {
      const src = guideImageUrl(image[2]);
      if (src) blocks.push({ kind: "image", src, alt: image[1] || "赛事资料" });
      continue;
    }
    const heading = /^(#{1,4})\s*(.+)$/.exec(line);
    if (heading) { blocks.push(block("h" + heading[1].length, heading[2].trim())); continue; }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet) { blocks.push(block("li", bullet[1].trim(), "• ")); continue; }
    const ordered = /^(\d{1,2})[.)、]\s*(.+)$/.exec(line);
    if (ordered) { blocks.push(block("oli", ordered[2].trim(), ordered[1] + ". ")); continue; }
    blocks.push(block("p", line));
  }
  return blocks.map((item, i) => ({ ...item, i }));
}
