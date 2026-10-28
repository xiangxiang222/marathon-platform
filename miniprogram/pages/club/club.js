const { request } = require("../../utils/request");
const { renderCallPoster, clubRaceRows } = require("../../utils/call-poster");

Page({
  data: {
    activeTab: "overview",
    expanded: { call: false, training: false, meetup: false, internal: false, gift: false, group: false, fee: false },
    club: null,
    clubInitial: "团",
    leaderName: "",
    membersMore: "",
    members: [],
    groups: [],
    gifts: [],
    requests: [],
    myPoints: 0,
    board: [],
    nextRace: null,
    nextActivity: null,
    upcomingActivityCount: 0,
    ranks: [],
    activities: [],
    albums: [],
    attendance: { rows: [], me: { placeLabel: "未上榜", count: 0 }, label: "本月" },
    mileage: { totalKm: 0, totalCount: 0, mineKm: 0 },
    partnerGrade: "",
    posterPath: "",
    leaving: false,
    checkins: [],
    checkedIn: false,
    note: "",
    checkMessage: "",
    message: "",
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
    feeCurrent: {},
    feeShown: {},
    feeHistory: [],
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
    racePoints: "0",
    raceDistance: "10k",
    raceDistanceLabel: "10公里",
    raceOther: "",
    raceDeadline: "",
    raceNote: "",
    raceGroups: [
      { id: 1, name: "男子组", capacity: "0" },
      { id: 2, name: "女子组", capacity: "0" }
    ]
  },
  onLoad(query) {
    this.clubId = query.id;
    this.pending = null;
    this.setData({ activeTab: query.tab || "overview" });
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
    const name = (this.data.club && this.data.club.name) || "跑团";
    return {
      title: name + " · 跑团介绍",
      path: "/pages/club-intro/club-intro?id=" + this.clubId
    };
  },
  changeSection(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },
  exportBoard() {
    const lines = ["跑团赛事汇总", "比赛\t日期\t城市\t项目\t成员\t状态\t成绩"];
    (this.data.board || []).forEach((item) => {
      const race = item.race || {};
      const project = (race.distanceLabels || []).join("/");
      const rows = clubRaceRows(item);
      if (!rows.length) {
        lines.push([race.name, race.raceDate, race.city, project, "", "", ""].join("\t"));
        return;
      }
      const cell = (value) => {
        const text = String(value == null ? "" : value).replace(/[\t\r\n]/g, " ");
        return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
      };
      rows.forEach((mark) => lines.push([
        race.name, race.raceDate, race.city, mark.distance || project, mark.nickname, mark.status,
        [mark.clock, mark.pb ? "PB" : ""].filter(Boolean).join(" ")
      ].map(cell).join("\t")));
    });
    wx.setClipboardData({ data: lines.join("\n"), success: () => this.setData({ message: "赛事表格已复制，可粘贴到表格软件" }) });
  },
  exportRacePoster(e) {
    const item = (this.data.board || [])[Number(e.currentTarget.dataset.index)];
    if (!item) return;
    const groups = clubRaceRows(item).reduce((out, mark) => {
      const label = mark.status || "团友";
      let group = out.find((entry) => entry.label === label);
      if (!group) {
        group = { label, rows: [] };
        out.push(group);
      }
      group.rows.push({ place: group.rows.length + 1, nickname: mark.nickname, clock: mark.clock, status: mark.status, tag: mark.pb ? "PB" : "" });
      return out;
    }, []);
    this.createSelectorQuery().select("#club-poster").fields({ node: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        this.setData({ message: "赛事画像没有生成" });
        return;
      }
      const size = renderCallPoster(canvas, { title: item.race.name, raceDate: item.race.raceDate, eyebrow: "跑团赛事画像", countLabel: " 条参赛记录", summary: item.summary, groups });
      wx.canvasToTempFilePath({
        canvas,
        destWidth: size.width,
        destHeight: size.height,
        fileType: "png",
        success: (file) => this.setData({ posterPath: file.tempFilePath, message: "" }),
        fail: () => this.setData({ message: "赛事画像没有生成" })
      });
    });
  },
  closePoster() { this.setData({ posterPath: "" }); },
  noop() {},
  toggleForm(e) {
    const form = e.currentTarget.dataset.form;
    if (!Object.prototype.hasOwnProperty.call(this.data.expanded, form)) return;
    this.setData({ expanded: { ...this.data.expanded, [form]: !this.data.expanded[form] } });
  },
  load() {
    request("/clubs/" + this.clubId)
      .then((data) => {
        const members = (data.members || []).map((member) => ({
          ...member,
          avatarInitial: String(member.nickname || "跑").slice(0, 1)
        }));
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
          clubInitial: String(data.club.name || "团").slice(0, 1),
          members,
          membersMore: members.length > 6 ? "+" + (members.length - 6) : "",
          leaderName: (members.find((member) => member.owner) || {}).nickname || "",
          board,
          nextRace: board.filter((item) => item.race.raceDate >= new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10))
            .sort((a, b) => a.race.raceDate.localeCompare(b.race.raceDate))[0] || null,
          nextActivity: this.upcomingActivities(data.activities || [])[0] || null,
          upcomingActivityCount: this.upcomingActivities(data.activities || []).length,
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
  upcomingActivities(activities) {
    const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16);
    return activities.filter((item) => !["ended", "cancelled"].includes(item.status) && item.startsAt >= now)
      .slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  loadExtra() {
    request("/clubs/" + this.clubId + "/calls")
      .then((data) => this.setData({ calls: data.calls || [] }))
      .catch(() => {});
    request("/clubs/" + this.clubId + "/meetups")
      .then((data) => {
        const meetups = data.meetups || [];
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        this.setData({ meetups, upcomingActivityCount: this.upcomingActivities(this.data.activities).length
          + meetups.filter((item) => item.date >= today && !["ended", "cancelled"].includes(item.status)).length });
      })
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
        const history = data.history || [];
        const shown = this.data.feeShown || {};
        if (shown.id && !shown.open) {
          this.setData({ feeCurrent: current || {}, feeHistory: history });
          return;
        }
        if (!current) {
          this.setData({ feeCurrent: {}, feeShown: {}, feeHistory: history });
          return;
        }
        const patch = { feeCurrent: current, feeShown: current, feeHistory: history };
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
  openFee(e) {
    const periodId = Number(e.currentTarget.dataset.id);
    if (!periodId) return;
    request("/clubs/" + this.clubId + "/fees/" + periodId)
      .then((data) => {
        const period = data.period;
        const patch = { feeCurrent: period.open ? period : this.data.feeCurrent, feeShown: period, message: "" };
        if (period.open && !this.data.feeCreating) {
          patch.feeName = period.name;
          patch.feeAmount = String(period.amount);
          patch.feeStart = period.startsOn;
          patch.feeEnd = period.endsOn;
          patch.feeNote = period.note || "";
          patch.feeBlock = !!period.blockSignup;
        }
        this.setData(patch);
      })
      .catch((err) => this.setData({ message: err.message }));
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
    request("/races?q=" + encodeURIComponent(q) + "&page=1&pageSize=8").then((data) => {
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
  pickRaceDistance(e) {
    this.setData({ raceDistance: e.currentTarget.dataset.id, raceDistanceLabel: e.currentTarget.dataset.label, raceOther: "" });
  },
  onRaceGroup(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({ ["raceGroups[" + index + "]." + key]: e.detail.value });
  },
  addRaceGroup() {
    const groups = this.data.raceGroups.concat([{ id: Date.now(), name: "", capacity: "0" }]);
    this.setData({ raceGroups: groups });
  },
  createInternal() {
    const groups = this.data.raceGroups
      .filter((group) => group.name && String(group.name).trim())
      .map((group) => ({ name: String(group.name).trim(), capacity: Number(group.capacity) || 0 }));
    const distance = this.data.raceOther ? "other" : this.data.raceDistance;
    request("/clubs/" + this.clubId + "/internals", "POST", {
      title: this.data.raceTitle,
      startsAt: this.data.raceWhen,
      place: this.data.racePlace,
      distance,
      otherKm: this.data.raceOther,
      deadline: this.data.raceDeadline,
      note: this.data.raceNote,
      finishPoints: Number(this.data.racePoints || 0),
      groups
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
    const current = this.data.feeCurrent && this.data.feeCurrent.id;
    const creating = this.data.feeCreating || !current;
    const path = creating ? "/clubs/" + this.clubId + "/fees" : "/clubs/" + this.clubId + "/fees/" + current;
    request(path, creating ? "POST" : "PUT", body)
      .then((data) => {
        this.setData({ message: creating ? "已开这一期" : "会费已保存", feeName: "", feeCreating: false, feeShown: data.period || this.data.feeShown, feeCurrent: data.period || this.data.feeCurrent });
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
      feeShown: this.data.feeCurrent || {},
      feeName: "",
      feeAmount: "",
      feeStart: "",
      feeEnd: "",
      feeNote: "",
      feeBlock: false
    });
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
      content: "未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；成绩、积分和已打卡记录保留。",
      success: (res) => {
        if (!res.confirm) return;
        request("/clubs/" + this.clubId + "/members/" + id, "DELETE")
          .then(() => this.load())
          .catch((err) => this.setData({ message: err.message }));
      }
    });
  },
  leaveClub() {
    if (this.data.leaving || !this.data.club || this.data.club.owner) return;
    wx.showModal({
      title: "退出" + this.data.club.name,
      content: "未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；个人赛事、成绩、积分和已打卡记录保留，再入团需要审核。",
      confirmText: "退出跑团",
      confirmColor: "#c73540",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ leaving: true, message: "" });
        request("/clubs/" + this.clubId + "/leave", "POST", {})
          .then(() => wx.switchTab({ url: "/pages/clubs/clubs" }))
          .catch((err) => this.setData({ message: err.message }))
          .finally(() => this.setData({ leaving: false }));
      }
    });
  }
});
