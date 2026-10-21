const { request } = require("../../utils/request");

Page({
  data: { race: null, groupId: 0, time: "", message: "" },
  onLoad(query) {
    this.clubId = query.club;
    this.raceId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId)
      .then((data) => {
        const race = data.race;
        const open = (race.groups || []).find((group) => !group.full) || (race.groups || [])[0];
        this.setData({
          race,
          groupId: (race.mine && race.mine.groupId) || (open && open.id) || 0,
          time: (race.mine && race.mine.clock) || this.data.time,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  pickGroup(e) {
    this.setData({ groupId: Number(e.currentTarget.dataset.id) });
  },
  onTime(e) {
    this.setData({ time: e.detail.value });
  },
  signup() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/signup", "POST", { groupId: this.data.groupId })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancel() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/signup", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  save() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/results", "POST", { time: this.data.time })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  dnf() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/results", "POST", { outcome: "dnf" })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  endRace() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/end", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancelRace() {
    request("/clubs/" + this.clubId + "/internals/" + this.raceId + "/cancel", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  }
});
