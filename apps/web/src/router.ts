import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { routes } from "./routes";
import { resolveRouteAccess } from "./route-guard";

const fileDemoMode =
  String(import.meta.env.VITE_FILE_DEMO_MODE || "").toLowerCase() === "true";

export const router = createRouter({
  history: fileDemoMode ? createWebHashHistory() : createWebHistory(),
  routes,
});

router.beforeEach((to) => resolveRouteAccess(to, useAuthStore()));
