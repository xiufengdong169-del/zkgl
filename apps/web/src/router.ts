import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { routes } from "./routes";
import { resolveRouteAccess } from "./route-guard";

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => resolveRouteAccess(to, useAuthStore()));
