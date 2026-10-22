const { request, ready } = require("../../utils/request");
const { baseUrl } = require("../../config");
const { parseGuide } = require("../../utils/guide-md");

function raceTabs(race, extra) {
  const tabs = [{ id: "signup", label: "报名" }];
  if ((extra.guide && extra.guide.length) || (race && race.guideText)) tabs.push({ id: "guide", label: "竞赛规程" });
  tabs.push({ id: "news", label: "资讯" });
  if (extra.ready || extra.drawText) tabs.push({ id: "result", label: "成绩" });
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

Page({
  data: {
    race: null,
    distanceText: "",
    statuses: [],
    myStatus: "",
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
      { id: "signup", label: "报名" },
      { id: "news", label: "资讯" }
    ],
    tab: "signup",
    guideBlocks: [],
    signupUrl: "",
    signupQr: "",
    signupHint: "",
    queryLinks: []
  },
  onLoad(query) {
    this.raceId = query.id;
    const code = String(query.code || "").toUpperCase();
    this.pending = null;
    this.setData({ code, ready: ready(), tab: "signup" });
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this.open();
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
    join.then(() => this.load()).catch((err) => this.setData({ message: err.message }));
  },
  load() {
    const jobs = [
      request("/races/" + this.raceId).then((data) => {
        const race = data.race;
        const distanceOptions = (race.distances || []).map((key, i) => ({
          key,
          label: (race.distanceLabels || [])[i] || key
        }));
        const myResults = data.myResults || [];
        const myResult = myResults.find((item) => item.distance === this.data.distance) || myResults[0] || null;
        const patch = {
          race,
          distanceText: (race.distanceLabels || []).join(" / "),
          statuses: data.statuses || [],
          myStatus: data.myStatus || "",
          clubs: (data.clubs || []).map((club) => {
            const card = (data.cards || []).find((item) => item.club && item.club.id === club.id);
            return { ...club, squadText: card && card.squad ? card.squad.text : "" };
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
      })
    ];
    if (this.data.code) {
      jobs.push(
        request("/races/" + this.raceId + "/card?code=" + encodeURIComponent(this.data.code)).then((card) => {
          this.setData({ card: withUnpaid(card) });
        })
      );
    }
    return Promise.all(jobs).catch((err) => this.setData({ message: err.message }));
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
    request("/me/races/" + this.raceId, "PUT", { status: "已报名" })
      .then(() => this.load())
      .then(() => this.setData({ askSignup: false, message: "已标成已报名" }))
      .catch((err) => this.setData({ message: err.message }));
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
    request("/me/races/" + this.raceId, "PUT", { status })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
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
    ctx.setFillStyle("#007aff");
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
