// 一个工程两块屏：/console/* 跑在教师电脑上，/display 投到 HDMI 大屏，两个窗口同时开。

import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth.js";

const routes = [
  { path: "/", redirect: "/console/live" },

  // 教师电脑端 · 登录 / 注册
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/auth/LoginView.vue"),
    meta: { guest: true },
  },
  {
    path: "/register",
    name: "register",
    component: () => import("@/views/auth/RegisterView.vue"),
    meta: { guest: true },
  },

  // 教师操作台，四个业务页共用外壳
  {
    path: "/console",
    component: () => import("@/views/console/ConsoleLayout.vue"),
    children: [
      { path: "", redirect: "/console/live" },
      { path: "live", name: "live", component: () => import("@/views/console/LiveView.vue") },
      { path: "roster", name: "roster", component: () => import("@/views/console/RosterView.vue") },
      { path: "enroll", name: "enroll", component: () => import("@/views/console/EnrollView.vue") },
      { path: "record", name: "record", component: () => import("@/views/console/RecordView.vue") },
      // WS 事件监视器，联调用；导航入口由 VITE_SHOW_WS_DEBUG 控制，路由本身始终可直达
      { path: "debug", name: "debug", component: () => import("@/views/console/DebugView.vue") },
    ],
  },

  // 课堂大屏，纯展示无交互
  {
    path: "/display",
    name: "display",
    component: () => import("@/views/display/DisplayView.vue"),
    meta: { public: true },
  },

  { path: "/:pathMatch(.*)*", redirect: "/console/live" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const auth = useAuthStore();

  // 云端由本机 nginx 反代，恒可达；只有教师主动选了离线进入才不拦登录
  // （edge 的 /local 接口本来就不校验身份）
  const needSignIn = !auth.offline;

  if (!auth.signedIn && needSignIn) {
    await auth.restore();
  }

  if (to.meta.guest) {
    return auth.signedIn ? "/console/live" : true;
  }

  if (!auth.signedIn && needSignIn) {
    return { path: "/login", query: { next: to.fullPath } };
  }

  return true;
});

// 两个窗口同时开着，标题要能一眼分清哪个是大屏
const TITLES = {
  display: "课堂大屏",
  login: "登录",
  register: "注册",
  live: "上课",
  roster: "名单",
  enroll: "现场注册",
  record: "录制",
  debug: "调试",
};

router.afterEach((to) => {
  const name = TITLES[to.name] || "";
  document.title = name ? `${name} · HOOPSHAKE` : "HOOPSHAKE 场边系统";
});

export default router;
