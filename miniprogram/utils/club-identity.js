function publicClub(club) {
  return { ...club, initial: String(club.name || "团").slice(0, 1), cityLabel: club.city || "城市待补充", memberCount: club.memberCount != null ? club.memberCount : club.members != null ? club.members : null };
}
function shareTitle(club) {
  return [club.name || "跑团", club.city || "城市待补充", club.leader ? "负责人 " + club.leader : "", club.id ? "#" + club.id : "跑团名片"].filter(Boolean).join(" · ");
}
function showVerification(club) {
  if (!club || !club.verified) return;
  wx.showModal({
    title: "组织管理关系已核验",
    content: ["核验对象：" + (club.organization || club.name), "活动范围：" + (club.verificationScope || club.city || "以核验记录为准"), "核验时间：" + String(club.verifiedAt || "").slice(0, 10), "本页面由该组织的授权负责人管理。核验不授予名称独占权，也不代表对活动安全、赛事成绩或商业服务的背书。"].join("\n"),
    showCancel: false, confirmText: "我知道了"
  });
}
module.exports = { publicClub, shareTitle, showVerification };
