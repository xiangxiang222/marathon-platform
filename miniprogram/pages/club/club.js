const { request } = require("../../utils/request");

Page({
  data: {
    club: null,
    members: [],
    groups: [],
    gifts: [],
    requests: [],
    myPoints: 0,
    board: [],
    ranks: [],
    activities: [],
    albums: [],
    attendance: { rows: [], me: { placeLabel: "未上榜", count: 0 }, label: "本月" },
    mileage: { totalKm: 0, totalCount: 0, mineKm: 0 },
    partnerGrade: "",
    checkins: [],
    checkedIn: false,
    note: "",
    checkMessage: "",
    message: "",
    actTitle: "",
    actPlace: "",
    actWhen: "",
    actEnds: "",
    actIssue: "",
    actGather: "",
    actPlanned: "",
    actNote: "",
    actPeople: "3",
    actKm: "5",
    actPoints: "1",
    groupName: "",
    groupPace: "",
    groupCap: "0",
    giftName: "",
    giftCost: "1",
    giftStock: "1",
    calls: [],
    raceQuery: "",
    raceHits: [],
    callTitle: "",
    callDate: "",
    callOther: "",
    callNote: "",
    callDistanceText: "",
    feeShown: {},
    feeName: "",
    feeAmount: "",
    feeStart: "",
    feeEnd: "",
    feeNote: "",
    feeBlock: false,
    feeCreating: false,
    meetups: [],
    meetDate: "",
    meetPlace: "",
    meetNote: "",
    internals: [],
    raceTitle: "",
    raceWhen: "",
    racePlace: "",
    racePoints: "0"
  },
  onLoad(query) {
    this.clubId = query.id;
    this.pending = null;
    this.pickedRaceId = "";
    this.selectedDistances = { full: false, half: false, "10k": false, "5k": false };
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this.load();
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    const pending = this.pending || {};
    const first = (this.data.board && this.data.board[0]) || {};
    const id = pending.id || (first.race && first.race.id) || "";
    const title = pending.title || first.title || (this.data.club && this.data.club.name) || "跑团赛历";
    const code = this.data.club ? this.data.club.code : "";
    return {
      title,
      path: "/pages/race/race?id=" + id + (code ? "&code=" + code : "")
    };
  },
  load() {
    request("/clubs/" + this.clubId)
      .then((data) => {
        const board = (data.board || []).map((item) => ({
          ...item,
          key: item.race.id,
          unpaidText: (item.unpaid || []).join("、"),
          squadText: item.squad ? item.squad.text : "",
          alternatives: item.alternatives || [],
          alternativeNote: item.alternativeNote || ""
        }));
        this.setData({
          club: data.club,
          members: data.members || [],
          board,
          ranks: data.ranks || [],
          activities: data.activities || [],
          groups: data.groups || [],
          gifts: data.gifts || [],
          requests: data.requests || [],
          myPoints: data.myPoints || 0,
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkMessage: "",
          message: ""
        });
        this.loadExtra();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  loadExtra() {
    const app = getApp();
    request("/clubs/" + this.clubId + "/calls")
      .then((data) => this.setData({ calls: data.calls || [] }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/meetups")
      .then((data) => this.setData({ meetups: data.meetups || [] }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/internals")
      .then((data) => this.setData({ internals: data.races || [] }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/albums")
      .then((data) => this.setData({ albums: data.albums || [] }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/attendance?range=month")
      .then((data) => this.setData({ attendance: data }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/partner")
      .then((data) => this.setData({ partnerGrade: (data.grade && data.grade.label) || "" }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/mileage?range=month")
      .then((data) => {
        const mine = (data.rank || []).find((row) => row.mine);
        this.setData({
          mileage: { totalKm: data.totalKm || 0, totalCount: data.totalCount || 0, mineKm: mine ? mine.km : 0 }
        });
      })
      .catch(() => {});
    request("/clubs/" + this.clubId + "/fees")
      .then((data) => {
        const current = data.current;
        if (!current) {
          this.setData({ feeShown: {} });
          return;
        }
        const token = app.globalData.token || "";
        current.qrSrc = current.hasQr
          ? app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/fees/" + current.id + "/qr?t=" + encodeURIComponent(token)
          : "";
        const patch = { feeShown: current };
        if (!this.data.feeCreating && !this.data.feeName) {
          patch.feeName = current.name;
          patch.feeAmount = String(current.amount);
          patch.feeStart = current.startsOn;
          patch.feeEnd = current.endsOn;
          patch.feeNote = current.note || "";
          patch.feeBlock = !!current.blockSignup;
        }
        this.setData(patch);
      })
      .catch(() => {});
  },
  distanceText(selected) {
    const labels = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
    return Object.keys(selected).filter((id) => selected[id]).map((id) => labels[id]).join("、");
  },
  searchRaces() {
    const q = (this.data.raceQuery || "").trim();
    if (!q) {
      this.setData({ raceHits: [] });
      return;
    }
    request("/races?q=" + encodeURIComponent(q)).then((data) => {
      const hits = (data.races || []).slice(0, 6).map((race) => ({
        id: race.id,
        name: race.name,
        raceDate: race.raceDate,
        distanceText: (race.distances || []).join(",")
      }));
      this.setData({ raceHits: hits });
    }).catch((err) => this.setData({ message: err.message }));
  },
  pickRace(e) {
    const ds = e.currentTarget.dataset;
    const selected = { full: false, half: false, "10k": false, "5k": false };
    String(ds.distances || "").split(",").forEach((id) => {
      if (selected[id] != null) selected[id] = true;
    });
    this.pickedRaceId = ds.id;
    this.selectedDistances = selected;
    this.setData({
      callTitle: ds.name,
      callDate: ds.date,
      callDistanceText: this.distanceText(selected),
      raceHits: [],
      raceQuery: ""
    });
  },
  toggleDistance(e) {
    const id = e.currentTarget.dataset.id;
    this.pickedRaceId = "";
    const selected = this.selectedDistances || { full: false, half: false, "10k": false, "5k": false };
    selected[id] = !selected[id];
    this.selectedDistances = selected;
    this.setData({ callDistanceText: this.distanceText(selected) });
  },
  createMeetup() {
    request("/clubs/" + this.clubId + "/meetups", "POST", {
      date: this.data.meetDate,
      place: this.data.meetPlace,
      note: this.data.meetNote
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/meetup/meetup?club=" + this.clubId + "&id=" + data.meetup.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createInternal() {
    request("/clubs/" + this.clubId + "/internals", "POST", {
      title: this.data.raceTitle,
      startsAt: this.data.raceWhen,
      place: this.data.racePlace,
      distance: "10k",
      finishPoints: Number(this.data.racePoints || 0),
      groups: [
        { name: "男子组", capacity: 0 },
        { name: "女子组", capacity: 0 }
      ]
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/internal/internal?club=" + this.clubId + "&id=" + data.race.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createCall() {
    const distances = Object.keys(this.selectedDistances || {}).filter((id) => this.selectedDistances[id]);
    request("/clubs/" + this.clubId + "/calls", "POST", {
      raceId: this.pickedRaceId || "",
      title: this.data.callTitle,
      raceDate: this.data.callDate,
      distances,
      otherKm: this.data.callOther,
      note: this.data.callNote
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/call/call?club=" + this.clubId + "&id=" + data.call.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  saveFee() {
    const body = {
      name: this.data.feeName,
      amount: Number(this.data.feeAmount),
      startsOn: this.data.feeStart,
      endsOn: this.data.feeEnd,
      note: this.data.feeNote,
      blockSignup: !!this.data.feeBlock
    };
    const current = this.data.feeShown && this.data.feeShown.id;
    const creating = this.data.feeCreating || !current;
    const path = creating ? "/clubs/" + this.clubId + "/fees" : "/clubs/" + this.clubId + "/fees/" + current;
    request(path, creating ? "POST" : "PUT", body)
      .then(() => {
        this.setData({ message: creating ? "已开这一期" : "会费已保存", feeName: "", feeCreating: false });
        this.loadExtra();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  toggleFeeBlock() {
    this.setData({ feeBlock: !this.data.feeBlock });
  },
  newPeriod() {
    this.setData({
      feeCreating: true,
      feeName: "",
      feeAmount: "",
      feeStart: "",
      feeEnd: "",
      feeNote: "",
      feeBlock: false
    });
  },
  chooseQr() {
    const periodId = this.data.feeShown && this.data.feeShown.id;
    if (!periodId) {
      this.setData({ message: "先保存这一期" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/fees/" + periodId + "/qr",
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) {
              this.setData({ feeName: "" });
              this.loadExtra();
            } else this.setData({ message: "没有传上去" });
          },
          fail: () => this.setData({ message: "没有传上去" })
        });
      }
    });
  },
  claimFee() {
    const periodId = this.data.feeShown && this.data.feeShown.id;
    request("/clubs/" + this.clubId + "/fees/" + periodId + "/claim", "POST", {})
      .then((data) => {
        this.setData({ message: "已登记，等团长确认", feeName: "" });
        if (data.period) this.loadExtra();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  markFee(e) {
    const periodId = this.data.feeShown && this.data.feeShown.id;
    request("/clubs/" + this.clubId + "/fees/" + periodId + "/records", "POST", {
      userId: Number(e.currentTarget.dataset.id),
      status: e.currentTarget.dataset.status
    })
      .then(() => {
        this.setData({ feeName: "" });
        this.loadExtra();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  checkIn() {
    request("/clubs/" + this.clubId + "/checkins", "POST", { note: this.data.note })
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => this.setData({ checkMessage: err.message }));
  },
  undoCheckin() {
    request("/clubs/" + this.clubId + "/checkins", "DELETE")
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => this.setData({ checkMessage: err.message }));
  },
  onDraft(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  createActivity() {
    request("/clubs/" + this.clubId + "/activities", "POST", {
      title: this.data.actTitle,
      place: this.data.actPlace,
      startsAt: this.data.actWhen,
      endsAt: this.data.actEnds,
      issue: this.data.actIssue,
      gatherPlace: this.data.actGather,
      plannedKm: this.data.actPlanned,
      note: this.data.actNote,
      minPeople: Number(this.data.actPeople),
      minKm: Number(this.data.actKm),
      points: Number(this.data.actPoints)
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + data.activity.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  shareRecent() {
    const ids = (this.data.activities || []).slice().sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)).slice(0, 3).map((item) => item.id);
    if (!ids.length) {
      this.setData({ message: "还没有活动" });
      return;
    }
    request("/clubs/" + this.clubId + "/activities/share", "POST", { ids })
      .then((data) => {
        wx.setClipboardData({ data: data.text || "" });
        this.setData({ message: "最近 3 场已复制" });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createGroup() {
    request("/clubs/" + this.clubId + "/groups", "POST", {
      name: this.data.groupName,
      pace: this.data.groupPace,
      capacity: Number(this.data.groupCap || 0)
    })
      .then(() => {
        this.setData({ groupName: "", groupPace: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createGift() {
    request("/clubs/" + this.clubId + "/gifts", "POST", {
      name: this.data.giftName,
      cost: Number(this.data.giftCost),
      stock: Number(this.data.giftStock)
    })
      .then(() => {
        this.setData({ giftName: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  redeem(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    request("/clubs/" + this.clubId + "/gifts/" + id + "/redeem", "POST", {})
      .then(() => {
        this.setData({ message: "已兑换 " + name });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  decide(e) {
    const id = e.currentTarget.dataset.id;
    const decision = e.currentTarget.dataset.decision;
    request("/clubs/" + this.clubId + "/requests/" + id, "POST", { decision })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  setRole(e) {
    const id = e.currentTarget.dataset.id;
    const role = e.currentTarget.dataset.role;
    const name = e.currentTarget.dataset.name;
    const send = () => {
      request("/clubs/" + this.clubId + "/members/" + id, "PUT", { role })
        .then(() => this.load())
        .catch((err) => this.setData({ message: err.message }));
    };
    if (role !== "owner") {
      send();
      return;
    }
    wx.showModal({
      title: "把团长交给 " + name,
      content: "你自己会变成跑团管理。",
      success: (res) => {
        if (res.confirm) send();
      }
    });
  },
  removeMember(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: "移出 " + name,
      content: "移出后这个人看不到团里的赛历。",
      success: (res) => {
        if (!res.confirm) return;
        request("/clubs/" + this.clubId + "/members/" + id, "DELETE")
          .then(() => this.load())
          .catch((err) => this.setData({ message: err.message }));
      }
    });
  }
});
