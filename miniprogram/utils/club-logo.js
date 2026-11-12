const { prepareAvatar } = require("./avatar");
const logoData = { logo: "", logoPreview: "", logoChanged: false, logoPreparing: false, logoError: "", logoFailed: false };
const logoMethods = {
  invalidateLogo() { this._logoSequence = (this._logoSequence || 0) + 1; },
  chooseLogo() {
    if (!this.editable() || this.data.logoPreparing) return;
    const token = this._account, sequence = this._logoSequence = (this._logoSequence || 0) + 1;
    const current = () => this.scopeCurrent(token) && sequence === this._logoSequence;
    this.setData({ logoPreparing: true, logoError: "" });
    return new Promise((resolve) => {
      wx.chooseMedia({
        count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"],
        success: (result) => resolve((result.tempFiles || [])[0]?.tempFilePath || ""),
        fail: (error) => {
          if (current() && !/cancel/i.test(error.errMsg || "")) this.setData({ logoError: "无法选择图片，请重试。" });
          resolve("");
        }
      });
    }).then((filePath) => {
      if (!filePath || !current()) return;
      return prepareAvatar(filePath).then((logo) => {
        if (!current()) return;
        this._createRequestId = "";
        this.setData({ logo, logoPreview: filePath, logoChanged: true, logoFailed: false, logoError: "" });
      });
    }).catch((error) => {
      if (current()) this.setData({ logoError: String(error.message || "无法读取图片，请重试。").replace(/头像/g, "跑团标志") });
    }).finally(() => { if (current()) this.setData({ logoPreparing: false }); });
  },
  removeLogo() {
    if (!this.editable()) return;
    this.invalidateLogo(); this._createRequestId = "";
    this.setData({ logo: "", logoPreview: "", logoChanged: true, logoPreparing: false, logoError: "", logoFailed: false });
  },
  logoPreviewError(e) {
    if (this.scopeCurrent(this._account) && e.currentTarget.dataset.src === this.data.logoPreview) this.setData({ logoFailed: true });
  }
};
module.exports = { logoData, logoMethods };
