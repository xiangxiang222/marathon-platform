import { computed, ref } from "vue";

const token = ref(localStorage.getItem("marathon_token") || "");
const nickname = ref(localStorage.getItem("marathon_name") || "");

export function useSession() {
  const ready = computed(() => !!token.value);

  function save(nextToken, name) {
    token.value = nextToken;
    nickname.value = name;
    localStorage.setItem("marathon_token", nextToken);
    localStorage.setItem("marathon_name", name);
  }

  return { token, nickname, ready, save };
}
