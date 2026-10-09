const { request, setAuth, ready } = require("../../utils/request");

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
    code: "",
    ready: false,
    draft: "",
    message: ""
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
        this.setData({
          race,
          distanceText: (race.distanceLabels || []).join(" / "),
          statuses: data.statuses || [],
          myStatus: data.myStatus || "",
          clubs: data.clubs || [],
          cards: (data.cards || []).map(withUnpaid),
          ready: ready(),
          message: ""
        });
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
  }
});
