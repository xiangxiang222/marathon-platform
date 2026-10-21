import { createRouter, createWebHistory } from "vue-router";
import Home from "./views/Home.vue";
import Race from "./views/Race.vue";
import Sport from "./views/Sport.vue";
import Exercise from "./views/Exercise.vue";
import Look from "./views/Look.vue";
import Club from "./views/Club.vue";
import Activity from "./views/Activity.vue";
import Signup from "./views/Signup.vue";
import Album from "./views/Album.vue";
import Call from "./views/Call.vue";
import Meetup from "./views/Meetup.vue";
import Internal from "./views/Internal.vue";
import Mine from "./views/Mine.vue";
import Admin from "./views/Admin.vue";
import Calendar from "./views/Calendar.vue";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: Home },
    { path: "/calendar", component: Calendar, meta: { hideTab: true } },
    { path: "/races/:id", component: Race, meta: { hideTab: true } },
    { path: "/sport", component: Exercise },
    { path: "/look", component: Look },
    { path: "/clubs", component: Sport },
    { path: "/clubs/:id", component: Club, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid", component: Activity, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid/signup", component: Signup, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid/album", component: Album, meta: { hideTab: true } },
    { path: "/clubs/:id/calls/:cid", component: Call, meta: { hideTab: true } },
    { path: "/clubs/:id/meetups/:mid", component: Meetup, meta: { hideTab: true } },
    { path: "/clubs/:id/internals/:rid", component: Internal, meta: { hideTab: true } },
    { path: "/mine", component: Mine },
    { path: "/admin", component: Admin, meta: { hideTab: true, wide: true } }
  ]
});
