const RANGES = [{ id: "day", name: "日" }, { id: "week", name: "周" }, { id: "month", name: "月" }, { id: "year", name: "年" }, { id: "all", name: "累计" }];
const COLORS = ["mint", "blue", "apricot", "violet", "rose", "lime"];
function today() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function number(value) { return String(Math.round((Number(value) || 0) * 100) / 100); }
function shiftDate(date, range, direction) {
  const d = new Date(date + "T00:00:00Z");
  if (range === "year") { d.setUTCMonth(0, 1); d.setUTCFullYear(d.getUTCFullYear() + direction); }
  else if (range === "month") { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + direction); }
  else d.setUTCDate(d.getUTCDate() + (range === "week" ? 7 : 1) * direction);
  return d.toISOString().slice(0, 10);
}
function periodKey(date, range) {
  if (range === "year") return date.slice(0, 4);
  if (range === "month") return date.slice(0, 7);
  if (range === "week") { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1)); return d.toISOString().slice(0, 10); }
  return date;
}
function canAdvance(date, range) { return range !== "all" && periodKey(shiftDate(date, range, 1), range) <= periodKey(today(), range); }
function decorate(board) {
  const maximum = Math.max(0, ...(board.rank || []).map(r => Number(r.km) || 0));
  const rank = (board.rank || []).map((r, index) => ({ ...r, initial: String(r.nickname || "跑").slice(0, 1), kmLabel: number(r.km), color: COLORS[index % COLORS.length], progress: maximum ? Math.round(Number(r.km) / maximum * 100) : 0 }));
  const groups = (board.groups || []).filter(g => Number(g.id) > 0).map((g, index) => ({ ...g, mark: String(g.name || "组").slice(0, 1), kmLabel: number(g.km), color: COLORS[index % COLORS.length] }));
  return { ...board, rank, groups, kmLabel: number(board.summary && board.summary.km), average: number(board.summary && board.summary.members ? board.summary.km / board.summary.members : 0) };
}
module.exports = { RANGES, COLORS, today, number, shiftDate, periodKey, canAdvance, decorate };
