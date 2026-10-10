import { createRouter, createWebHistory } from "vue-router";
import Home from "./views/Home.vue";
import Race from "./views/Race.vue";
import Sport from "./views/Sport.vue";
import Look from "./views/Look.vue";
import Club from "./views/Club.vue";
import Mine from "./views/Mine.vue";
import Admin from "./views/Admin.vue";
import Calendar from "./views/Calendar.vue";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: Home },
    { path: "/calendar", component: Calendar, meta: { hideTab: true } },
    { path: "/races/:id", component: Race, meta: { hideTab: true } },
    { path: "/sport", component: Sport },
    { path: "/look", component: Look },
    { path: "/clubs", redirect: "/sport" },
    { path: "/clubs/:id", component: Club, meta: { hideTab: true } },
    { path: "/mine", component: Mine },
    { path: "/admin", component: Admin, meta: { hideTab: true } }
  ]
});
