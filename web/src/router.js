import { createRouter, createWebHistory } from "vue-router";
import Home from "./views/Home.vue";
import Race from "./views/Race.vue";
import Clubs from "./views/Clubs.vue";
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
    { path: "/clubs", component: Clubs },
    { path: "/clubs/:id", component: Club, meta: { hideTab: true } },
    { path: "/mine", component: Mine },
    { path: "/sport", redirect: "/clubs" },
    { path: "/look", redirect: { path: "/", query: { status: "open" } } },
    { path: "/admin", component: Admin, meta: { hideTab: true } }
  ]
});
