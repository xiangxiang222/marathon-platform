const CHANNELS = [["mararun.com", "马拉马拉"]];

function signupTarget(url) {
  const text = String(url || "").trim();
  let parsed;
  try {
    parsed = new URL(text);
  } catch (err) {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.includes(" ")) return null;
  const named = CHANNELS.find(([suffix]) => host === suffix || host.endsWith("." + suffix));
  return { url: text, host, name: named ? named[1] : "" };
}

module.exports = { signupTarget };
