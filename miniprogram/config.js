/** 默认走线上。本地联调 API 时把 USE_LOCAL_API 改成 true。真机再把 LOCAL_PHONE_URL 换成电脑的局域网地址。 */
const USE_LOCAL_API = false;
const DEVTOOLS_URL = "http://127.0.0.1:3790";
const LOCAL_PHONE_URL = "http://127.0.0.1:3790";
const PROD_URL = "https://togetherbetter.cn";

function getBaseUrl() {
  if (!USE_LOCAL_API) return PROD_URL;
  try {
    if (wx.getSystemInfoSync().platform === "devtools") return DEVTOOLS_URL;
  } catch (e) {
    /* ignore */
  }
  return LOCAL_PHONE_URL;
}

module.exports = {
  baseUrl: getBaseUrl(),
  devtoolsUrl: DEVTOOLS_URL,
  phoneUrl: LOCAL_PHONE_URL,
  prodUrl: PROD_URL
};
