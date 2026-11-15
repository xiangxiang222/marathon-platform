const { request, ready } = require("../../utils/request");
const { baseUrl } = require("../../config");
const { parseGuide } = require("../../utils/guide-md");

function raceTabs(race, extra) {
  const tabs = [{ id: "signup", label: "赛事信息" }];
  if ((extra.guide && extra.guide.length) || (race && race.guideText)) tabs.push({ id: "guide", label: "竞赛规程" });
  tabs.push({ id: "news", label: "赛事资讯" });
  if (extra.ready || extra.drawText) tabs.push({ id: "result", label: "我的成绩" });
  return tabs;
}

function signupHint(race) {
  if (!race || !race.signupHost) return "这场还没有报名链接。这里不报名，也不收款。";
  const where = race.signupChannel ? race.signupChannel + "的报名页" : race.signupHost + " 上的报名页";
  return "长按识别二维码，打开" + where + "。这里不报名，也不收款。";
}

function withUnpaid(card) {
  if (!card) return card;
  const names = (card.unpaid || []).map((item) => item.nickname || item);
  return { ...card, unpaidText: names.join("、"), clubId: card.club && card.club.id };
}

const PLAN_STAGES = [
  { id: "wish", label: "有意向", statuses: ["想跑"] },
  { id: "signup", label: "已报名", statuses: ["已报名", "待抽签", "中签", "未中签"] },
  { id: "confirmed", label: "确认参赛", statuses: ["确认参赛", "已缴费", "已领物"] },
  { id: "finished", label: "已完赛", statuses: ["完赛", "未完赛", "弃赛"] }
];
function stageFor(status) { return PLAN_STAGES.find(item => item.statuses.includes(status)) || PLAN_STAGES[0]; }
function tokenNow() { return (getApp().globalData || {}).token || ""; }

Page({
  data: {
    race: null,
    distanceText: "",
    meetText: "线下",
    statuses: [],
    myStatus: "",
    following: false,
    followBusy: false,
    planBusy: false,
    planStages: PLAN_STAGES,
    planStage: "wish",
    stageStatuses: ["想跑"],
    sharedClubIds: [],
    sharingDraft: [],
    companionNote: "",
    companionOpen: false,
    planOpen: false,
    shareOpen: false,
    shareChoices: [],
    selectedShareKey: "",
    selectedShare: null,
    clubs: [],
    cards: [],
    card: null,
    conflicts: [],
    alternatives: [],
    alternativeNote: "",
    drawText: "",
    drawRates: [],
    drawError: "",
    code: "",
    ready: false,
    message: "",
    myResult: null,
    myResults: [],
    distanceOptions: [],
    distance: "",
    clock: "",
    story: "",
    resultMessage: "",
    proofSrc: "",
    askSignup: false,
    hasSheet: false,
    sheetSrc: "",
    drawLines: [],
    drawNote: "",
    guide: [],
    routeSheets: [],
    pacerSheets: [],
    liveSheet: null,
    kindText: "",
    groupText: "",
    tabs: [
      { id: "signup", label: "赛事信息" },
      { id: "news", label: "赛事资讯" }
    ],
    tab: "signup",
    guideBlocks: [],
    signupUrl: "",
    signupQr: "",
    signupHint: "",
    queryLinks: [],
    articles: []
  },
  onLoad(query) {
    this._disposed = false;
    this._epoch = (this._epoch || 0) + 1;
    this._resumeFollow = query.follow === "1";
    this.raceId = query.id;
    const code = String(query.code || "").toUpperCase();
    this.pending = null;
    this.inviteRedirect = !!code;
    this.setData({ code: "", ready: ready(), tab: "signup", planOpen: query.plan === "1" });
    if (code) {
      wx.redirectTo({ url: "/pages/club-intro/club-intro?code=" + encodeURIComponent(code) });
      return;
    }
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this._hidden = false;
    const token = tokenNow();
    if (this._token !== token) {
      this._token = token;
      this._epoch = (this._epoch || 0) + 1;
      this.setData({ following: false, myStatus: "", sharedClubIds: [], sharingDraft: [], companionNote: "", sharingDirty: false, companionDirty: false, clubs: [], cards: [], myResults: [], myResult: null, hasSheet: false, sheetSrc: "", proofSrc: "", shareChoices: [], selectedShare: null });
    }
    this.setData({ followBusy: false, planBusy: false });
    this.open();
  },
  onHide() { this._hidden = true; this._epoch = (this._epoch || 0) + 1; this._loadSeq = (this._loadSeq || 0) + 1; },
  onUnload() { this._disposed = true; this._loadSeq = (this._loadSeq || 0) + 1; },
  current(scope) { return !this._disposed && !this._hidden && scope.epoch === (this._epoch || 0) && scope.id === this.raceId && scope.token === tokenNow(); },
  pickPlanStage(e) {
    const stage = PLAN_STAGES.find(item => item.id === e.currentTarget.dataset.id);
    if (stage) this.setData({ planStage: stage.id, stageStatuses: stage.statuses.filter(status => this.data.statuses.includes(status)) });
  },
  toggleFollow() {
    if (!ready()) {
      wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&follow=1");
      wx.switchTab({ url: "/pages/mine/mine" });
      return;
    }
    if (this.data.followBusy) return;
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 }, following = !this.data.following;
    this.setData({ followBusy: true, message: "" });
    return request("/me/races/" + scope.id + "/follow", "PUT", { following }).then(() => {
      if (this.current(scope)) this.setData({ following, message: following ? "已关注，可在「我的赛事」查看" : "已取消关注，参赛记录仍保留" });
    }).catch(err => { if (this.current(scope)) this.setData({ message: err.message }); })
      .finally(() => { if (this.current(scope)) this.setData({ followBusy: false }); });
  },
  pickSharedClubs(e) {
    if (this.data.planBusy) return;
    const sharedClubIds = (e.detail.value || []).map(Number);
    this.setData({ sharingDraft: sharedClubIds, sharingDirty: true, clubs: this.data.clubs.map(club => ({ ...club, selected: sharedClubIds.includes(club.id) })) });
  },
  saveSharing() {
    if (!this.data.myStatus) { this.setData({ message: "先记录参赛状态，再同步到跑团" }); return; }
    return this.updatePlan("/sharing", { clubIds: this.data.sharingDraft }, "已更新同步跑团，个人记录仍保留");
  },
  onCompanionNote(e) { this.setData({ companionNote: e.detail.value, companionDirty: true }); },
  saveCompanionNote() {
    return this.updatePlan("/companionship", { note: this.data.companionNote.trim() }, "已保存同行备注，仅向选中的跑团展示");
  },
  removePlan() {
    if (this.data.planBusy || this._confirmingRemoval || !this.data.myStatus || !ready()) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this._confirmingRemoval = true;
    return new Promise(resolve => wx.showModal({
      title: "移除参赛计划？",
      content: "关注的比赛和已记录的成绩会保留，跑团不再同步这条计划。",
      confirmText: "移除计划",
      success: result => {
        this._confirmingRemoval = false;
        if (result.confirm && this.current(scope)) resolve(this.updatePlan("", {}, "已移除参赛计划，关注和成绩仍保留", "DELETE"));
        else resolve();
      },
      fail: () => { this._confirmingRemoval = false; resolve(); }
    }));
  },
  updatePlan(suffix, body, message, method = "PUT") {
    if (this.data.planBusy || !ready()) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this.setData({ planBusy: true, message: "" });
    return request("/me/races/" + scope.id + suffix, method, body)
      .then(() => {
        if (!this.current(scope)) return;
        if (suffix === "/sharing") this.setData({ sharingDirty: false });
        if (suffix === "/companionship") this.setData({ companionDirty: false });
        if (method === "DELETE") this.setData({ sharingDirty: false, companionDirty: false });
        return this.load();
      })
      .then(result => { if (this.current(scope) && result !== false) this.setData({ message }); })
      .catch(err => { if (this.current(scope)) this.setData({ message: err.message }); })
      .finally(() => { if (this.current(scope)) this.setData({ planBusy: false }); });
  },
  togglePlan() {
    this.setData({ planOpen: !this.data.planOpen });
  },
  toggleCompanion() { this.setData({ companionOpen: !this.data.companionOpen }); },
  toggleShare() {
    this.setData({ shareOpen: !this.data.shareOpen });
  },
  syncShareChoices(cards, legacyCard) {
    const shareChoices = (cards && cards.length ? cards : legacyCard ? [legacyCard] : []).filter(item => item && item.club).map(item => ({ ...item, selectionKey: String(item.club.id || item.club.code) }));
    const selectedShare = shareChoices.find(item => item.selectionKey === this.data.selectedShareKey) || shareChoices[0] || null;
    this.pending = null;
    this.setData({ shareChoices, selectedShare, selectedShareKey: selectedShare ? selectedShare.selectionKey : "" });
  },
  selectShare(event) {
    const key = String(event.currentTarget.dataset.key || "");
    const selectedShare = this.data.shareChoices.find(item => item.selectionKey === key);
    if (!selectedShare) return;
    this.pending = null;
    this.setData({ selectedShareKey: key, selectedShare });
  },
  loginForPlan() {
    wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&plan=1");
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    const pending = this.pending || {};
    const cards = this.data.cards || [];
    const cardForCode = pending.code
      ? cards.find((item) => item.club && item.club.code === pending.code) ||
        (this.data.card && this.data.card.club && this.data.card.club.code === pending.code ? this.data.card : null)
      : null;
    const card = cardForCode || cards[0] || this.data.card;
    const title = pending.title || (card && card.title) || (this.data.race && this.data.race.name) || "赛历";
    const code = pending.code || this.data.code;
    const club = (cardForCode && cardForCode.club) || null;
    if (code && club) {
      return {
        title: club.name + " · 邀你加入",
        path: "/pages/club-intro/club-intro?id=" + club.id
      };
    }
    return {
      title,
      path: "/pages/race/race?id=" + this.raceId + (code ? "&code=" + code : "")
    };
  },
  open() {
    if (this.inviteRedirect) return;
    this.load().catch((err) => this.setData({ message: err.message }));
  },
  load() {
    if (this._disposed || this._hidden) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 }, seq = this._loadSeq = (this._loadSeq || 0) + 1;
    const current = () => this.current(scope) && seq === this._loadSeq;
    const jobs = [
      request("/races/" + this.raceId).then((data) => {
        if (!current()) return;
        const race = data.race;
        const sharedClubIds = data.sharedClubIds || [];
        const memberIds = (data.clubs || []).map(club => club.id);
        const sharingDraft = this.data.sharingDirty ? this.data.sharingDraft.filter(id => memberIds.includes(id)) : sharedClubIds;
        const stage = stageFor(data.myStatus);
        const statuses = data.statuses || PLAN_STAGES.reduce((all, item) => all.concat(item.statuses), []);
        const distanceOptions = (race.distances || []).map((key, i) => ({
          key,
          label: (race.distanceLabels || [])[i] || key
        }));
        const myResults = data.myResults || [];
        const myResult = myResults.find((item) => item.distance === this.data.distance) || myResults[0] || null;
        const patch = {
          race,
          distanceText: [...(race.distanceLabels || []), ...(race.kind === "trail" && !(race.kindLabels || []).includes("越野") ? ["越野"] : []), ...(race.kindLabels || []), ...(race.groups || [])].join(" / "),
          meetText: race.meet === "online" ? "线上" : "线下",
          statuses,
          myStatus: data.myStatus || "",
          following: !!data.following,
          sharedClubIds,
          sharingDraft,
          companionNote: this.data.companionDirty ? this.data.companionNote : data.companionNote || "",
          planStage: stage.id,
          stageStatuses: stage.statuses.filter(status => statuses.includes(status)),
          clubs: (data.clubs || []).map((club) => {
            const card = (data.cards || []).find((item) => item.club && item.club.id === club.id);
            return { ...club, selected: sharingDraft.includes(club.id), synced: sharedClubIds.includes(club.id), squadText: card && card.squad ? card.squad.text : "" };
          }),
          cards: (data.cards || []).map(withUnpaid),
          conflicts: data.conflicts || [],
          alternatives: data.alternatives || [],
          alternativeNote: data.alternativeNote || "",
          drawText: data.drawText || "",
          drawLines: String(data.drawText || "").split("\n").filter(Boolean),
          drawRates: data.drawRates || [],
          drawError: "",
          drawNote: "",
          proofSrc: myResult && myResult.hasProof
            ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof?t=" + encodeURIComponent((getApp().globalData && getApp().globalData.token) || "") + "&distance=" + encodeURIComponent(myResult.distance)
            : "",
          hasSheet: Boolean(data.hasSheet),
          sheetSrc: data.hasSheet
            ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/sheet?t=" + encodeURIComponent((getApp().globalData && getApp().globalData.token) || "")
            : "",
          myResults,
          ready: ready(),
          message: "",
          myResult,
          distanceOptions,
          resultMessage: "",
          guide: (race.guide || []).map((item) => ({ id: item.id, src: baseUrl + "/marathon/api/race-sheets/" + item.id })),
          routeSheets: (race.routeSheets || []).map((item) => ({ id: item.id, src: baseUrl + "/marathon/api/race-sheets/" + item.id })),
          pacerSheets: (race.pacerSheets || []).map((item) => ({ id: item.id, src: baseUrl + "/marathon/api/race-sheets/" + item.id })),
          liveSheet: race.liveSheet ? { id: race.liveSheet.id, src: baseUrl + "/marathon/api/race-sheets/" + race.liveSheet.id } : null,
          kindText: (race.kindLabels || []).join(" / "),
          groupText: (race.groups || []).join("、"),
          guideBlocks: parseGuide(race.guideText),
          signupUrl: ((race.links || []).find((item) => item.key === "signup") || {}).url || "",
          signupQr: (race.links || []).some((item) => item.key === "signup") && race.signupHost
            ? baseUrl + "/marathon/api/races/" + this.raceId + "/signup-qr"
            : "",
          signupHint: signupHint(race),
          queryLinks: (race.links || []).filter((item) => item.key !== "signup" && String(item.url || "").startsWith("https://"))
        };
        const tabs = raceTabs(race, patch);
        patch.tabs = tabs;
        patch.tab = tabs.some((item) => item.id === this.data.tab) ? this.data.tab : "signup";
        if (myResult) {
          patch.distance = myResult.distance;
          patch.clock = myResult.clock;
          patch.story = myResult.story || "";
        } else if (!this.data.distance && distanceOptions[0]) {
          patch.distance = distanceOptions[0].key;
        }
        this.setData(patch);
        this.syncShareChoices(patch.cards, this.data.card);
        if (this._resumeFollow && ready()) { this._resumeFollow = false; if (!patch.following) this.toggleFollow(); }
      }),
      request("/races/" + this.raceId + "/news").then((data) => {
        if (current()) this.setData({ articles: data.news || [] });
      })
    ];
    if (this.data.code) {
      jobs.push(
        request("/races/" + this.raceId + "/card?code=" + encodeURIComponent(this.data.code)).then((card) => {
          if (!current()) return;
          this.setData({ card: withUnpaid(card) });
          this.syncShareChoices(this.data.cards, this.data.card);
        })
      );
    }
    return Promise.all(jobs).then(() => true).catch((err) => { if (current()) this.setData({ message: err.message }); return false; });
  },
  pickTab(e) {
    const tab = e.currentTarget.dataset.id;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  copyLink(e) {
    const key = e.currentTarget.dataset.key || "";
    wx.setClipboardData({
      data: e.currentTarget.dataset.url || "",
      success: () => {
        if (key === "signup") this.setData({ askSignup: true });
      }
    });
  },
  dismissAsk() {
    this.setData({ askSignup: false });
  },
  confirmSigned() {
    if (!this.data.ready) {
      this.setData({ message: "先到「我的」登录" });
      return;
    }
    if (this.data.myStatus && this.data.myStatus !== "想跑") {
      this.setData({ askSignup: false, message: "这场已经标成「" + this.data.myStatus + "」" });
      return;
    }
    this.setData({ askSignup: false });
    return this.updatePlan("", { status: "已报名" }, "已记录为已报名，实际报名结果以官方为准");
  },
  chooseSheet() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/me/races/" + this.raceId + "/sheet",
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) this.load().then(() => this.setData({ message: "报名截图已上传" }));
            else {
              let message = "没有传上去";
              try {
                message = JSON.parse(upload.data).error || message;
              } catch (err) {}
              this.setData({ message });
            }
          },
          fail: () => this.setData({ message: "没有传上去" })
        });
      }
    });
  },
  removeSheet() {
    request("/me/races/" + this.raceId + "/sheet", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  removeResult() {
    if (!this.data.myResult) return;
    wx.showModal({
      title: "去掉这项成绩",
      content: "同一场的其他项目还留着。",
      success: (res) => {
        if (!res.confirm) return;
        request("/me/races/" + this.raceId + "/result?distance=" + encodeURIComponent(this.data.distance), "DELETE")
          .then(() => {
            this.setData({ distance: "" });
            return this.load();
          })
          .catch((err) => this.setData({ resultMessage: err.message }));
      }
    });
  },
  previewGuide(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.guide.map((item) => item.src).concat(this.data.routeSheets.map((item) => item.src), this.data.pacerSheets.map((item) => item.src));
    if (this.data.liveSheet) urls.push(this.data.liveSheet.src);
    wx.previewImage({ current, urls });
  },
  mark(e) {
    const status = e.currentTarget.dataset.status;
    if (!this.data.statuses.includes(status)) return;
    return this.updatePlan("", { status }, "已标记为「" + status + "」");
  },
  pickDistance(e) {
    const distance = e.currentTarget.dataset.distance;
    const found = (this.data.myResults || []).find((item) => item.distance === distance) || null;
    const token = (getApp().globalData && getApp().globalData.token) || "";
    this.setData({
      distance,
      myResult: found,
      clock: found ? found.clock : "",
      story: found ? found.story || "" : "",
      proofSrc: found && found.hasProof
        ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof?t=" + encodeURIComponent(token) + "&distance=" + encodeURIComponent(distance)
        : ""
    });
  },
  onClock(e) {
    this.setData({ clock: e.detail.value });
  },
  onStory(e) {
    this.setData({ story: e.detail.value });
  },
  copyDraw() {
    wx.setClipboardData({
      data: this.data.drawText || "",
      fail: () => this.setData({ drawError: "没有复制成功，可以直接选中上面的文字" })
    });
  },
  savePoster() {
    const lines = this.data.drawLines || [];
    const ctx = wx.createCanvasContext("poster", this);
    ctx.setFillStyle("#e1251b");
    ctx.fillRect(0, 0, 750, 1000);
    ctx.setFillStyle("#ffffff");
    ctx.setFontSize(48);
    lines.forEach((line, index) => ctx.fillText(line, 60, 220 + index * 80));
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: "poster",
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => this.setData({ drawNote: "图片已保存", drawError: "" }),
            fail: () => this.setData({ drawError: "没有保存成功，可以复制上面的文字" })
          });
        },
        fail: () => this.setData({ drawError: "没有保存成功，可以复制上面的文字" })
      }, this);
    });
  },
  chooseProof(e) {
    if (!this.data.myResult) {
      this.setData({ resultMessage: "先记下成绩，再上传照片" });
      return;
    }
    const kind = e.currentTarget.dataset.kind;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof/" + kind + "?distance=" + encodeURIComponent(this.data.distance),
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) this.load();
            else {
              let message = "没有传上去";
              try {
                message = JSON.parse(upload.data).error || message;
              } catch (err) {}
              this.setData({ resultMessage: message });
            }
          },
          fail: () => this.setData({ resultMessage: "没有传上去" })
        });
      }
    });
  },
  removeProof() {
    request("/me/races/" + this.raceId + "/result/proof?distance=" + encodeURIComponent(this.data.distance), "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ resultMessage: err.message }));
  },
  saveResult() {
    request("/me/races/" + this.raceId + "/result", "PUT", {
      distance: this.data.distance,
      time: (this.data.clock || "").trim(),
      story: (this.data.story || "").trim()
    })
      .then(() => this.load())
      .catch((err) => this.setData({ resultMessage: err.message }));
  }
});
