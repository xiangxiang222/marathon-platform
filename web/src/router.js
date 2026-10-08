import { createRouter, createWebHistory } from "vue-router";
import Home from "./views/Home.vue";
import Race from "./views/Race.vue";
import Clubs from "./views/Clubs.vue";
import Club from "./views/Club.vue";
import Mine from "./views/Mine.vue";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: Home },
    { path: "/races/:id", component: Race },
    { path: "/clubs", component: Clubs },
    { path: "/clubs/:id", component: Club },
    { path: "/mine", component: Mine }
  ]
});
