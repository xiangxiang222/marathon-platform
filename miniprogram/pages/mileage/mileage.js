const { request } = require("../../utils/request");

Page({
  data: {
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
    this.clubId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    const q = this.data.query ? "&q=" + encodeURIComponent(this.data.query) : "";
    request("/clubs/" + this.clubId + "/mileage?range=" + this.data.range + q)
      .then((data) => {
        const groups = data.manageGroups || [];
        const people = (data.people || []).map((person) => {
          const group = groups.find((item) => item.id === person.groupId);
          return { ...person, groupLabel: group ? group.name : "不分组" };
        });
        this.setData({ board: { ...data, people }, rules: data.rules || null, message: "" });
      })
      .catch((err) => this.setData({ message: err.message }));
    request("/clubs/" + this.clubId + "/mileage/report?kind=" + this.data.kind)
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
    request("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/challenge", "POST", { reason: this.data.reason })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
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
    request("/clubs/" + this.clubId + "/mileage/groups", "POST", {
      name: this.data.groupName,
      capacity: Number(this.data.groupCap) || 0,
      sort: Number(this.data.groupSort) || 0
    })
      .then(() => {
        this.setData({ groupName: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  removeGroup(e) {
    request("/clubs/" + this.clubId + "/mileage/groups/" + e.currentTarget.dataset.id, "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
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
    request("/clubs/" + this.clubId + "/mileage/members/" + this.data.assignUser, "PUT", { groupId: Number(this.data.assignGroup) })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  toggleEmpty() {
    this.setData({ includeEmpty: !this.data.includeEmpty });
  },
  exportSheet() {
    const empty = this.data.includeEmpty ? "&empty=1" : "";
    request("/clubs/" + this.clubId + "/mileage/export?kind=" + this.data.kind + "&json=1" + empty)
      .then((data) => {
        wx.setClipboardData({
          data: data.text || "",
          success: () => this.setData({ message: "表格已复制" }),
          fail: () => this.setData({ message: "没有复制成功" })
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  saveRules() {
    const rules = Object.assign({}, this.data.rules, { trailClimb: Math.round(Number(this.data.rules.trailClimb)) });
    request("/clubs/" + this.clubId + "/mileage/rules", "PUT", rules)
      .then((data) => this.setData({ rules: data.rules, message: data.rules.note }))
      .catch((err) => this.setData({ message: err.message }));
  },
  decide(e) {
    request("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/decision", "POST", {
      counted: e.currentTarget.dataset.keep === "1"
    })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
