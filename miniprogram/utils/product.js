const STATUS_GROUPS = [
  { label: "意向", items: ["想跑"] },
  { label: "报名", items: ["已报名", "待抽签"] },
  { label: "抽签结果", items: ["中签", "未中签"] },
  { label: "赛前", items: ["已缴费", "已领物"] },
  { label: "赛后", items: ["完赛", "未完赛", "弃赛"] }
];

const URGENT_OPEN = ["想跑", "已报名", "待抽签"];

function groupsFor(statuses) {
  const allow = {};
  (statuses || []).forEach((item) => {
    allow[item] = true;
  });
  const hasFilter = (statuses || []).length > 0;
  return STATUS_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !hasFilter || allow[item])
  })).filter((group) => group.items.length);
}

function statusHint(status, race) {
  if (!status) return "标上你这场的状态。同团的人能看见。";
  if (status === "想跑") return "你这场是想跑。报名后改成已报名。";
  if (status === "已报名") return "你这场是已报名。出签后改成中签或未中签。";
  if (status === "待抽签") return "你这场是待抽签。结果出来后改成中签或未中签。";
  if (status === "中签") {
    const nodes = (race && race.nodes) || [];
    const pay = nodes.find((node) => node.key === "pay" && !node.past);
    if (pay && pay.text) return "你这场是中签。" + pay.text + "，缴完改成已缴费。";
    return "你这场是中签。缴完费后改成已缴费。";
  }
  if (status === "未中签") return "你这场是未中签。日期相近、报名还开着的场在下面。";
  if (status === "已缴费") return "你这场是已缴费。领完物资后改成已领物。";
  if (status === "已领物") return "你这场是已领物。比完后改成完赛。";
  if (status === "完赛") return "你这场是完赛。成绩可以记在下面。";
  if (status === "未完赛") return "你这场是未完赛。";
  if (status === "弃赛") return "你这场是弃赛。同团的人能看见。";
  return "";
}

function isUrgent(plan) {
  if (!plan) return false;
  if (plan.status === "中签") return true;
  const race = plan.race || {};
  return !!(race.open && race.daysLeft <= 3 && URGENT_OPEN.indexOf(plan.status) >= 0);
}

function splitPlans(plans) {
  const urgent = [];
  const rest = [];
  (plans || []).forEach((plan) => {
    if (isUrgent(plan)) urgent.push(plan);
    else rest.push(plan);
  });
  return { urgent, rest };
}

function placeLine(race) {
  if (!race) return "";
  if (!race.province || race.province === race.city) return race.city || "";
  return race.province + " · " + race.city;
}

function nextCallout(race) {
  if (!race) return { label: "", text: "", at: "", soon: false, line: "" };
  const node = race.nextNode;
  const callout = node
    ? { label: node.label, text: node.text || "", at: node.at || "", soon: !!node.soon }
    : {
        label: race.deadlineName || "报名",
        text: race.deadlineLabel || "",
        at: "",
        soon: !!(race.open && race.daysLeft <= 3)
      };
  callout.line = [callout.text, callout.at].filter(Boolean).join(" · ");
  return callout;
}

function showSignup(race, status) {
  return !!(race && race.open && race.eventUrl && (!status || status === "想跑"));
}

module.exports = { groupsFor, statusHint, splitPlans, placeLine, nextCallout, showSignup };
