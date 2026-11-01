export const identityStatuses = { pending: "待核验", supplement: "待补充", approved: "已核验", verified: "已核验", rejected: "未通过", revoked: "已撤销", review: "复核中", restricted: "已限制公开展示", restored: "已恢复", renamed: "已调整名称", dismissed: "已结案" };
export const reportTypes = { impersonation: "组织身份被冒用", confusion: "同名容易混淆", management: "管理授权有争议" };
export const reportStatuses = { pending: "待处理", supplement: "待补充", restricted: "已限制公开展示", restored: "已恢复", renamed: "已调整名称", dismissed: "已结案" };
export function clubIdentity(club) { return `${club.name} · ${club.city || "城市待补充"} · #${club.id}`; }
export function safeSource(value) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
export function identityDate(value) { if (!value) return "—"; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"; }
