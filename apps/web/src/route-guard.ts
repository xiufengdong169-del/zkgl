import type { SessionUser } from "@zkgl/shared";

import { hasPermission } from "./navigation";

export interface RouteAccessTarget {
  name?: unknown;
  fullPath: string;
  meta: unknown;
}

export interface RouteAccessAuth {
  authenticated: boolean;
  ensureSession(): Promise<SessionUser>;
}

export async function resolveRouteAccess(
  to: RouteAccessTarget,
  auth: RouteAccessAuth,
) {
  if (to.name === "login") return auth.authenticated ? { name: "home" } : true;
  try {
    const user = await auth.ensureSession();
    const permission =
      to.meta &&
      typeof to.meta === "object" &&
      "permission" in to.meta &&
      typeof to.meta.permission === "string"
        ? to.meta.permission
        : undefined;
    if (!hasPermission(user.permissionCodes, permission))
      return { name: "home", query: { denied: to.fullPath } };
    return true;
  } catch {
    return { name: "login", query: { redirect: to.fullPath } };
  }
}
