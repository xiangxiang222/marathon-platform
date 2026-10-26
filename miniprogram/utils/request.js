const { networkAvatar, normalizeAvatars } = require("./avatar");

function failMessage(err, baseUrl) {
  const raw = String((err && (err.errMsg || err.message)) || "");
  if (/url not in domain list/i.test(raw)) {
    return "请在开发者工具「详情 → 本地设置」勾选不校验合法域名。";
  }
  if (/timeout/i.test(raw)) return "请求超时，连不上 " + (baseUrl || "接口") + "。";
  if (/fail/i.test(raw) || !raw) return "连不上接口 " + (baseUrl || "") + "。本地调试请勾选不校验合法域名。";
  return raw;
}

function request(path, method, data) {
  const app = getApp();
  if (!app || !app.globalData) return Promise.reject(new Error("应用还没准备好"));
  const baseUrl = app.globalData.baseUrl;
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + "/marathon/api" + path,
      method: method || "GET",
      data: data || {},
      timeout: 15000,
      header: {
        "content-type": "application/json",
        Authorization: app.globalData.token ? "Bearer " + app.globalData.token : ""
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(normalizeAvatars(res.data, baseUrl));
          return;
        }
        const error = new Error((res.data && res.data.error) || "请求失败");
        error.status = res.statusCode;
        if (res.data && res.data.code) error.code = res.data.code;
        reject(error);
      },
      fail(err) {
        reject(new Error(failMessage(err, baseUrl)));
      }
    });
  });
}

function setAuth(token, nickname, avatar) {
  const app = getApp();
  const savedAvatar = networkAvatar(avatar, app.globalData.baseUrl);
  app.globalData.token = token;
  app.globalData.nickname = nickname;
  app.globalData.avatar = savedAvatar;
  wx.setStorageSync("marathon_token", token);
  wx.setStorageSync("marathon_name", nickname);
  wx.setStorageSync("marathon_avatar", savedAvatar);
}

function clearAuth() {
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = "";
    app.globalData.nickname = "";
    app.globalData.avatar = "";
  }
  wx.removeStorageSync("marathon_token");
  wx.removeStorageSync("marathon_name");
  wx.removeStorageSync("marathon_avatar");
}

function ready() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.token);
}

module.exports = { request, setAuth, clearAuth, ready };
