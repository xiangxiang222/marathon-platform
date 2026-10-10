export function toneOf(race) {
  if (!race) return "next";
  const status = race.regStatus || "";
  if (status === "已结束" || status === "比赛结束") return "done";
  if (status === "比赛中") return "live";
  if (race.open && Number(race.daysLeft) <= 7) return "soon";
  if (status === "报名中") return "open";
  if (status === "报名时间未公布") return "wait";
  return "next";
}

export function remindTone(reason) {
  const text = reason || "";
  if (text.includes("比赛")) return "live";
  if (text.includes("截止") || text.includes("缴费") || text.includes("出签")) return "soon";
  return "next";
}

export function dateParts(iso) {
  const parts = String(iso || "").split("-");
  return { month: Number(parts[1]) || "", day: Number(parts[2]) || "" };
}
