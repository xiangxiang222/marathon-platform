const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("marathon_token");
  if (options.adminToken) headers.Authorization = "Bearer " + options.adminToken;
  else if (token) headers.Authorization = "Bearer " + token;
  return fetch(base + "/api" + path, { ...options, headers }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || "请求失败");
      error.status = res.status;
      throw error;
    }
    return data;
  });
}

export function savedName() {
  return localStorage.getItem("marathon_name") || "";
}

export function upload(path, file) {
  const headers = {};
  const token = localStorage.getItem("marathon_token");
  if (token) headers.Authorization = "Bearer " + token;
  const body = new FormData();
  body.append("file", file);
  return fetch(base + "/api" + path, { method: "POST", headers, body }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  });
}

export function raceSheetSrc(id) {
  return base + "/api/race-sheets/" + id;
}

export function adminUpload(path, file, adminToken) {
  const headers = {};
  if (adminToken) headers.Authorization = "Bearer " + adminToken;
  const body = new FormData();
  body.append("file", file);
  return fetch(base + "/api" + path, { method: "POST", headers, body }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  });
}

export function mediaSrc(id) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/media/" + id + "?t=" + encodeURIComponent(token);
}

export function meetupPhotoSrc(clubId, meetupId, photoId) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/clubs/" + clubId + "/meetups/" + meetupId + "/photos/" + photoId + "?t=" + encodeURIComponent(token);
}

export function signupSheetSrc(raceId) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/me/races/" + raceId + "/sheet?t=" + encodeURIComponent(token);
}

export function resultProofSrc(raceId, distance) {
  const token = localStorage.getItem("marathon_token") || "";
  const picked = distance ? "&distance=" + encodeURIComponent(distance) : "";
  return base + "/api/me/races/" + raceId + "/result/proof?t=" + encodeURIComponent(token) + picked;
}

export function callSheetSrc(rowId) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/call-sheets/" + rowId + "?t=" + encodeURIComponent(token);
}

export function runShotSrc(id) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/runs/" + id + "/shot?t=" + encodeURIComponent(token);
}

export async function download(path, filename) {
  const headers = {};
  const token = localStorage.getItem("marathon_token");
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(base + "/api" + path, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "请求失败");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
