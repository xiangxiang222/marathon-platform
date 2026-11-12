import { createRouter, createWebHistory } from "vue-router";
import Home from "./views/Home.vue";
const Race = () => import("./views/Race.vue");
const Sport = () => import("./views/Sport.vue");
const Exercise = () => import("./views/Exercise.vue");
const Look = () => import("./views/Look.vue");
const Club = () => import("./views/Club.vue");
const ClubIntro = () => import("./views/ClubIntro.vue");
const Activity = () => import("./views/Activity.vue");
const ActivityCreate = () => import("./views/ActivityCreate.vue");
const Signup = () => import("./views/Signup.vue");
const Album = () => import("./views/Album.vue");
const Call = () => import("./views/Call.vue");
const Meetup = () => import("./views/Meetup.vue");
const Internal = () => import("./views/Internal.vue");
const Mine = () => import("./views/Mine.vue");
const Runner = () => import("./views/Runner.vue");
const Feedback = () => import("./views/Feedback.vue");
const Admin = () => import("./views/Admin.vue");
const Calendar = () => import("./views/Calendar.vue");
const Radar = () => import("./views/Radar.vue");
const News = () => import("./views/News.vue");

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: Home },
    { path: "/calendar", component: Calendar, meta: { hideTab: true } },
    { path: "/radar", component: Radar, meta: { hideTab: true } },
    { path: "/news", component: () => import("./views/InfoCenter.vue"), meta: { hideTab: true } },
    { path: "/news/articles/:id", component: () => import("./views/ContentDetail.vue"), meta: { hideTab: true } },
    { path: "/news/profiles/:id", component: () => import("./views/ContentDetail.vue"), meta: { hideTab: true } },
    { path: "/news/:id", component: News, meta: { hideTab: true } },
    { path: "/races/:id", component: Race, meta: { hideTab: true } },
    { path: "/sport", component: Exercise },
    { path: "/look", component: Look },
    { path: "/clubs", component: Sport },
    { path: "/clubs/new", component: () => import("./views/ClubCreate.vue"), meta: { hideTab: true, wide: true } },
    { path: "/clubs/reports", component: () => import("./views/ClubReport.vue"), meta: { hideTab: true } },
    { path: "/clubs/:id/identity", component: () => import("./views/ClubIdentity.vue"), meta: { hideTab: true } },
    { path: "/clubs/:id/report", component: () => import("./views/ClubReport.vue"), meta: { hideTab: true } },
    { path: "/clubs/invite/:code", component: ClubIntro, meta: { hideTab: true, viewKey: "club-intro" } },
    { path: "/clubs/:id/public", component: ClubIntro, meta: { hideTab: true, viewKey: "club-intro" } },
    { path: "/clubs/:id", component: Club, meta: { hideTab: true } },
    { path: "/clubs/:id/news", component: () => import("./views/InfoCenter.vue"), meta: { hideTab: true } },
    { path: "/clubs/:id/news/manage", component: () => import("./views/ClubNewsEditor.vue"), meta: { hideTab: true } },
    { path: "/clubs/:id/members/:uid", component: () => import("./views/ClubMember.vue"), meta: { hideTab: true } },
    { path: "/clubs/:id/activities/new", component: ActivityCreate, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid", component: Activity, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid/signup", component: Signup, meta: { hideTab: true } },
    { path: "/clubs/:id/activities/:aid/album", component: Album, meta: { hideTab: true } },
    { path: "/clubs/:id/calls/:cid", component: Call, meta: { hideTab: true } },
    { path: "/clubs/:id/meetups/:mid", component: Meetup, meta: { hideTab: true } },
    { path: "/clubs/:id/internals/:rid", component: Internal, meta: { hideTab: true } },
    { path: "/mine", component: Mine },
    { path: "/legal/:document?", component: () => import("./views/Legal.vue"), meta: { hideTab: true, wide: true } },
    { path: "/runner", component: Runner, meta: { hideTab: true } },
    { path: "/achievement-poster", component: () => import("./views/AchievementPoster.vue"), meta: { hideTab: true, wide: true } },
    { path: "/history", component: () => import("./views/RaceHistory.vue"), meta: { hideTab: true } },
    { path: "/feedback", component: Feedback, meta: { hideTab: true } },
    { path: "/feedback/:id", component: Feedback, meta: { hideTab: true } },
    { path: "/admin", component: Admin, meta: { hideTab: true, wide: true } },
    { path: "/:pathMatch(.*)*", component: () => import("./views/NotFound.vue"), meta: { hideTab: true } }
  ]
});
