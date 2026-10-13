const { request, setAuth, ready } = require("../../utils/request");
const { baseUrl } = require("../../config");

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
    drawError: "",
    code: "",
    ready: false,
    draft: "",
    message: "",
    myResult: null,
    distanceOptions: [],
    distance: "",
    clock: "",
    story: "",
    resultMessage: "",
    guide: [],
    routeSheets: [],
    pacerSheets: [],
    liveSheet: null,
    kindText: "",
    groupText: ""
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
        const myResult = data.myResult || null;
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
          drawError: "",
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
          groupText: (race.groups || []).join("、")
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
        request("/races/" + this.raceId + "/card?code=" + encodeURIComponent(this.data.code)).then((card) => {
          this.setData({ card: withUnpaid(card) });
        })
      );
    }
    return Promise.all(jobs).catch((err) => this.setData({ message: err.message }));
  },
  copyLink(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.url || "" });
  },
  previewGuide(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.guide.map((item) => item.src).concat(this.data.routeSheets.map((item) => item.src), this.data.pacerSheets.map((item) => item.src));
    if (this.data.liveSheet) urls.push(this.data.liveSheet.src);
    wx.previewImage({ current, urls });
  },
  enter() {
    const nickname = (this.data.draft || "").trim();
    request("/session", "POST", { nickname })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ ready: true, draft: "" });
        return this.open();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  mark(e) {
    const status = e.currentTarget.dataset.status;
    request("/me/races/" + this.raceId, "PUT", { status })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
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
  copyDraw() {
    wx.setClipboardData({
      data: this.data.drawText || "",
      fail: () => this.setData({ drawError: "没有复制成功，可以直接选中上面的文字" })
    });
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
