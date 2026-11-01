import { onBeforeUnmount, ref, watch } from "vue";
import { api } from "./api";

// Every private response belongs to both an account and a route, including errors.
export function useClubSession(reset, routeKey = () => "clubs") {
  const token = ref(localStorage.getItem("marathon_token") || "");
  let epoch = 0, disposed = false;
  function sync() {
    const next = localStorage.getItem("marathon_token") || "";
    if (next !== token.value) { epoch++; reset(); token.value = next; }
  }
  function capture() { const stamp = { epoch, token: token.value, key: routeKey() }; sync(); return stamp; }
  function current(stamp) { sync(); return !disposed && stamp.epoch === epoch && stamp.token === token.value && stamp.key === routeKey(); }
  async function request(path, options) {
    const stamp = capture();
    if (!current(stamp)) throw Object.assign(new Error("页面或账号已切换"), { stale: true });
    try { const data = await api(path, options); if (!current(stamp)) throw Object.assign(new Error("页面或账号已切换"), { stale: true }); return data; }
    catch (error) { if (!current(stamp)) error.stale = true; throw error; }
  }
  watch(routeKey, () => { epoch++; reset(); });
  window.addEventListener("storage", sync); window.addEventListener("focus", sync);
  onBeforeUnmount(() => { disposed = true; epoch++; reset(); window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); });
  return { token, capture, current, request };
}
