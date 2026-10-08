const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("marathon_token");
  if (token) headers.Authorization = "Bearer " + token;
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
