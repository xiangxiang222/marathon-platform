function saveCaptchaFile(dataUrl, previousPath) {
  return new Promise((resolve, reject) => {
    const raw = String(dataUrl || "").replace(/^data:image\/\w+;base64,/, "");
    if (!raw) {
      reject(new Error("验证码图片为空"));
      return;
    }
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/captcha-${Date.now()}.png`;
    const write = () => {
      fs.writeFile({
        filePath,
        data: raw,
        encoding: "base64",
        success() {
          resolve(filePath);
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || "验证码保存失败"));
        }
      });
    };
    if (!previousPath) {
      write();
      return;
    }
    fs.unlink({ filePath: previousPath, complete: write });
  });
}

module.exports = { saveCaptchaFile };
