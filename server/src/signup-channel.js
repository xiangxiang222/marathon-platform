const CHANNELS = [["mararun.com", "马拉马拉"], ["zuicool.com", "最酷"], ["shuzixindong.com", "数字心动"], ["codoon.com", "咕咚"]];

function signupTarget(url) {
  const text = String(url || "").trim();
  let parsed;
  try {
    parsed = new URL(text);
  } catch (err) {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.includes(" ")) return null;
  const named = CHANNELS.find(([suffix]) => host === suffix || host.endsWith("." + suffix));
  return { url: text, host, name: named ? named[1] : "" };
}

module.exports = { signupTarget };
