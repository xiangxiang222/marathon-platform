function likeParams(raw, columns) {
  const text = String(raw || "").trim();
  const escaped = (value) => value.replace(/[\\%_]/g, (ch) => "\\" + ch);
  const pair = [`%${escaped(text)}%`, `%${escaped(text.replace(/\s+/g, ""))}%`];
  const sql = columns
    .map((column) => `(${column} LIKE ? ESCAPE '\\' OR REPLACE(${column}, ' ', '') LIKE ? ESCAPE '\\')`)
    .join(" OR ");
  const params = [];
  for (let i = 0; i < columns.length; i += 1) params.push(...pair);
  return { sql, params };
}

module.exports = { likeParams };
