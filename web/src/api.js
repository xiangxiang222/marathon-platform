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

export function mediaSrc(id) {
  const token = localStorage.getItem("marathon_token") || "";
  return base + "/api/media/" + id + "?t=" + encodeURIComponent(token);
}
