import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { hasPermission } from "./navigation";
import { routes } from "./routes";

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.name === "login") return auth.authenticated ? { name: "home" } : true;
  try {
    const user = await auth.ensureSession();
    const permission = to.meta.permission as string | undefined;
    if (!hasPermission(user.permissionCodes, permission))
      return { name: "home", query: { denied: to.fullPath } };
    return true;
  } catch {
    return { name: "login", query: { redirect: to.fullPath } };
  }
});
