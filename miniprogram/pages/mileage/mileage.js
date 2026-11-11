const { request } = require("../../utils/request");

Page({
  data: {
    clubId: "", toolsOpen: false, toolRanges: [{id:"today",name:"日"},{id:"week",name:"周"},{id:"month",name:"月"},{id:"year",name:"年"},{id:"all",name:"累计"}],
    board: null,
    report: null,
    range: "month",
    kind: "month",
    query: "",
    reason: "",
    rules: null,
    groupName: "",
    groupCap: "0",
    groupSort: "0",
    assignUser: "",
    assignName: "",
    assignGroup: "0",
    assignGroupName: "不分组",
    includeEmpty: false,
    message: ""
  },
  onLoad(query) {
    this.clubId = String(query.id || ""); this._alive = true; this.setData({ clubId: this.clubId, toolsOpen: query.tools === "1" });
    wx.hideShareMenu();
  },
  onShow() {
    this._alive = true;
    const account = getApp().globalData.token || "";
    if (account !== this._account) this.setData({ board: null, report: null, rules: null });
    this._account = account;
    if (this.data.toolsOpen) this.load();
  },
  onHide() { this._alive = false; this._ticket = (this._ticket || 0) + 1; },
  onUnload() { this.onHide(); },
  toggleTools() { this.setData({ toolsOpen: !this.data.toolsOpen }); if (this.data.toolsOpen) this.load(); },
  safeRequest(path, method, data) {
    const account = getApp().globalData.token || "", ticket = this._ticket;
    return request(path, method, data).then(result => {
      if (!this._alive || account !== getApp().globalData.token || ticket !== this._ticket) throw Object.assign(new Error("页面已切换"), { stale: true });
      return result;
    }).catch(err => {
      if (!this._alive || account !== getApp().globalData.token || ticket !== this._ticket) err.stale = true;
      else if (err.status === 401 || err.status === 403) this.setData({ board: null, report: null, rules: null });
      throw err;
    });
  },
  load() {
    this._ticket = (this._ticket || 0) + 1;
    const q = this.data.query ? "&q=" + encodeURIComponent(this.data.query) : "";
    this.safeRequest("/clubs/" + this.clubId + "/mileage?range=" + this.data.range + q)
      .then((data) => {
        const groups = data.manageGroups || [];
        const people = (data.people || []).map((person) => {
          const group = groups.find((item) => item.id === person.groupId);
          return { ...person, groupLabel: group ? group.name : "不分组" };
        });
        this.setData({ board: { ...data, people }, rules: data.rules || null, message: "" });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
    this.safeRequest("/clubs/" + this.clubId + "/mileage/report?kind=" + this.data.kind)
      .then((data) => this.setData({ report: data }))
      .catch(() => {});
  },
  pickRange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.load();
  },
  pickKind(e) {
    this.setData({ kind: e.currentTarget.dataset.kind });
    this.load();
  },
  onQuery(e) {
    this.setData({ query: e.detail.value });
    this.load();
  },
  onReason(e) {
    this.setData({ reason: e.detail.value });
  },
  challenge(e) {
    this.safeRequest("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/challenge", "POST", { reason: this.data.reason })
      .then(() => this.load())
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  onRule(e) {
    const rules = Object.assign({}, this.data.rules);
    rules[e.currentTarget.dataset.key] = e.detail.value;
    this.setData({ rules });
  },
  toggleRule(e) {
    const rules = Object.assign({}, this.data.rules);
    const key = e.currentTarget.dataset.key;
    rules[key] = !rules[key];
    this.setData({ rules });
  },
  onGroup(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  addGroup() {
    this.safeRequest("/clubs/" + this.clubId + "/mileage/groups", "POST", {
      name: this.data.groupName,
      capacity: Number(this.data.groupCap) || 0,
      sort: Number(this.data.groupSort) || 0
    })
      .then(() => {
        this.setData({ groupName: "" });
        this.load();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  removeGroup(e) {
    this.safeRequest("/clubs/" + this.clubId + "/mileage/groups/" + e.currentTarget.dataset.id, "DELETE")
      .then(() => this.load())
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  pickPerson(e) {
    this.setData({ assignUser: e.currentTarget.dataset.id, assignName: e.currentTarget.dataset.name });
  },
  pickAssignGroup(e) {
    this.setData({ assignGroup: e.currentTarget.dataset.id, assignGroupName: e.currentTarget.dataset.name });
  },
  assign() {
    if (!this.data.assignUser) {
      this.setData({ message: "先选成员" });
      return;
    }
    this.safeRequest("/clubs/" + this.clubId + "/mileage/members/" + this.data.assignUser, "PUT", { groupId: Number(this.data.assignGroup) })
      .then(() => this.load())
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  toggleEmpty() {
    this.setData({ includeEmpty: !this.data.includeEmpty });
  },
  exportSheet() {
    const empty = this.data.includeEmpty ? "&empty=1" : "";
    this.safeRequest("/clubs/" + this.clubId + "/mileage/export?kind=" + this.data.kind + "&json=1" + empty)
      .then((data) => {
        wx.setClipboardData({
          data: data.text || "",
          success: () => this.setData({ message: "表格已复制" }),
          fail: () => this.setData({ message: "没有复制成功" })
        });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  saveRules() {
    const rules = Object.assign({}, this.data.rules, { trailClimb: Math.round(Number(this.data.rules.trailClimb)) });
    this.safeRequest("/clubs/" + this.clubId + "/mileage/rules", "PUT", rules)
      .then((data) => this.setData({ rules: data.rules, message: data.rules.note }))
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  decide(e) {
    this.safeRequest("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/decision", "POST", {
      counted: e.currentTarget.dataset.keep === "1"
    })
      .then(() => { this.load(); const component = this.selectComponent && this.selectComponent("#mileage-board"); if (component) component.load(); })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  }
});
