const { request, setAuth, ready } = require("../../utils/request");
const { groupsFor, statusHint, nextCallout, placeLine, showSignup } = require("../../utils/product");

function withUnpaid(card) {
  if (!card) return card;
  const names = (card.unpaid || []).map((item) => item.nickname || item);
  return { ...card, unpaidText: names.join("、"), clubId: card.club && card.club.id };
}

function clockOk(value) {
  return /^(\d{1,2}):([0-5]\d)(:[0-5]\d)?$/.test(String(value || "").trim());
}

Page({
  data: {
    phase: "loading",
    race: null,
    place: "",
    callout: null,
    statuses: [],
    statusGroups: [],
    myStatus: "",
    hint: "",
    clubs: [],
    cards: [],
    card: null,
    conflicts: [],
    alternatives: [],
    alternativeNote: "",
    drawText: "",
    drawOk: "",
    drawError: "",
    code: "",
    ready: false,
    nickname: "",
    draft: "",
    saving: false,
    message: "",
    ok: "",
    myResult: null,
    distanceOptions: [],
    distance: "",
    clock: "",
    story: "",
    resultOpen: false,
    resultMessage: "",
    resultOk: "",
    savingResult: false,
    showSignup: false,
    missingUrl: false,
    urlOk: "",
    copyOk: "",
    copyError: ""
  },
  onLoad(query) {
    this.raceId = query.id;
    const code = String(query.code || "").toUpperCase();
    this.pending = null;
    this.setData({ code, ready: ready() });
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this.open();
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    const pending = this.pending || {};
    const card = (this.data.cards && this.data.cards[0]) || this.data.card;
    const title = pending.title || (card && card.title) || (this.data.race && this.data.race.name) || "赛历";
    const code = pending.code || this.data.code;
    return {
      title,
      path: "/pages/race/race?id=" + this.raceId + (code ? "&code=" + code : "")
    };
  },
  open() {
    const code = this.data.code;
    const join = ready() && code ? request("/clubs/join", "POST", { code }).catch(() => {}) : Promise.resolve();
    return join.then(() => this.load()).catch((err) => {
      this.setData({ phase: "error", message: err.message || "这场没有打开" });
      return Promise.reject(err);
    });
  },
  retry() {
    this.load();
  },
  load(quiet) {
    if (!quiet) this.setData({ phase: "loading", message: "" });
    const jobs = [
      request("/races/" + this.raceId).then((data) => {
        const race = data.race;
        const distanceOptions = (race.distances || []).map((key, i) => ({
          key,
          label: (race.distanceLabels || [])[i] || key
        }));
        const myResult = data.myResult || null;
        const myStatus = data.myStatus || "";
        const nickname = (getApp().globalData && getApp().globalData.nickname) || "";
        const cards = (data.cards || []).map((item) => {
          const card = withUnpaid(item);
          card.onlyMe = card.marks && card.marks.length === 1 && card.marks[0].nickname === nickname;
          card.squadText = card.squad ? card.squad.text : "";
          return card;
        });
        const patch = {
          phase: "ready",
          race,
          place: placeLine(race),
          callout: nextCallout(race),
          distanceText: (race.distanceLabels || []).join(" / "),
          statuses: data.statuses || [],
          statusGroups: groupsFor(data.statuses || []),
          myStatus,
          hint: statusHint(myStatus, race),
          clubs: data.clubs || [],
          cards,
          conflicts: data.conflicts || [],
          alternatives: data.alternatives || [],
          alternativeNote: data.alternativeNote || "",
          drawText: data.drawText || "",
          ready: ready(),
          nickname,
          message: quiet ? this.data.message : "",
          myResult,
          distanceOptions,
          showSignup: showSignup(race, myStatus),
          missingUrl: !!(race.open && !race.eventUrl && (!myStatus || myStatus === "想跑")),
          resultOpen: !!(myResult || myStatus === "完赛" || myStatus === "未完赛" || race.regStatus === "已结束")
        };
        if (myResult) {
          patch.distance = myResult.distance;
          patch.clock = myResult.clock;
          patch.story = myResult.story || "";
        } else if (!this.data.distance && distanceOptions[0]) {
          patch.distance = distanceOptions[0].key;
        }
        this.setData(patch);
      })
    ];
    if (this.data.code) {
      jobs.push(
        request("/races/" + this.raceId + "/card?code=" + encodeURIComponent(this.data.code))
          .then((card) => this.setData({ card: withUnpaid(card) }))
          .catch(() => {})
      );
    }
    return Promise.all(jobs).catch((err) => {
      if (quiet && this.data.race) this.setData({ message: err.message || "这场没有打开" });
      else this.setData({ phase: "error", message: err.message || "这场没有打开" });
      return Promise.reject(err);
    });
  },
  enter() {
    const nickname = (this.data.draft || "").trim();
    if (!nickname || nickname.length > 20) {
      this.setData({ message: "昵称用 1 到 20 个字", ok: "" });
      return;
    }
    this.setData({ saving: true, message: "", ok: "" });
    request("/session", "POST", { nickname })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ ready: true, draft: "", ok: "名字已记下。" });
        return this.open();
      })
      .then(() => this.setData({ saving: false, ok: "名字已记下。" }))
      .catch((err) => this.setData({ saving: false, message: err.message }));
  },
  drop() {
    wx.showModal({
      title: "移出这场",
      content: "只移出你的安排，已记下的成绩还在。",
      success: (res) => {
        if (!res.confirm) return;
        request("/me/races/" + this.raceId, "DELETE")
          .then(() => {
            this.setData({ ok: "已移出你的安排" });
            return this.load();
          })
          .catch((err) => this.setData({ message: err.message }));
      }
    });
  },
  mark(e) {
    const status = e.currentTarget.dataset.status;
    if (!this.data.ready || this.data.saving || status === this.data.myStatus) return;
    this.setData({ saving: true, message: "", ok: "" });
    request("/me/races/" + this.raceId, "PUT", { status })
      .then(() => this.load(true))
      .then(() => this.setData({ saving: false, ok: "已记下。同团的人能看见。" }))
      .catch((err) => this.setData({ saving: false, message: err.message }));
  },
  pickDistance(e) {
    this.setData({ distance: e.currentTarget.dataset.distance });
  },
  onClock(e) {
    this.setData({ clock: e.detail.value });
  },
  onStory(e) {
    this.setData({ story: e.detail.value });
  },
  openResult() {
    this.setData({ resultOpen: true });
  },
  copyUrl() {
    const url = this.data.race && this.data.race.eventUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => this.setData({ urlOk: "报名网址已复制。到浏览器打开，报完回到这里标成已报名。", message: "" }),
      fail: () => this.setData({ message: "没有复制成功。报名网址在资料里，可以长按复制。" })
    });
  },
  copyDraw() {
    wx.setClipboardData({
      data: this.data.drawText || "",
      success: () => this.setData({ drawOk: "已复制。贴到微信群即可。", drawError: "" }),
      fail: () => this.setData({ drawError: "没有复制成功。选中下面的文字即可。", drawOk: "" })
    });
  },
  copyCard(e) {
    const clubId = e.currentTarget.dataset.clubid;
    const found = (this.data.cards || []).find((item) => String(item.clubId) === String(clubId));
    const text = (found && found.text) || (this.data.card && this.data.card.text) || "";
    wx.setClipboardData({
      data: text,
      success: () => this.setData({ copyOk: "已复制。贴到微信群即可。", copyError: "" }),
      fail: () => this.setData({ copyError: "没有复制成功。选中下面的文字即可。", copyOk: "" })
    });
  },
  saveResult() {
    const time = (this.data.clock || "").trim();
    if (!clockOk(time)) {
      this.setData({ resultMessage: "成绩写成 45:30 或 3:29:59", resultOk: "" });
      return;
    }
    this.setData({ savingResult: true, resultMessage: "", resultOk: "" });
    request("/me/races/" + this.raceId + "/result", "PUT", {
      distance: this.data.distance,
      time,
      story: (this.data.story || "").trim()
    })
      .then(() => this.load(true))
      .then(() => this.setData({ savingResult: false, resultOk: "成绩已记下，这场状态改为完赛。", resultOpen: true }))
      .catch((err) => this.setData({ savingResult: false, resultMessage: err.message }));
  }
});
