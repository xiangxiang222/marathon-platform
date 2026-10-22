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

function parseGuide(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) continue;
    const heading = /^(#{1,4})\s*(.+)$/.exec(line);
    if (heading) {
      blocks.push(block("h" + heading[1].length, heading[2].trim()));
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet) {
      blocks.push(block("li", bullet[1].trim(), "• "));
      continue;
    }
    const ordered = /^(\d{1,2})[.)、]\s*(.+)$/.exec(line);
    if (ordered) {
      blocks.push(block("oli", ordered[2].trim(), ordered[1] + ". "));
      continue;
    }
    blocks.push(block("p", line));
  }
  return blocks.map((item, i) => ({ ...item, i }));
}

module.exports = { parseGuide };
