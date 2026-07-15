import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it, vi } from "vitest";

import type { RouteAccessAuth, RouteAccessTarget } from "./route-guard";
import { resolveRouteAccess } from "./route-guard";

const user = (permissionCodes: string[]): SessionUser => ({
  id: "u-1",
  cloudbaseUid: "cb-u-1",
  employeeId: "e-1",
  departmentId: "d-1",
  enabled: true,
  roleCodes: ["EMPLOYEE"],
  permissionCodes,
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "SELF", userId: "u-1" }],
});

const target = (
  path: string,
  permission?: string,
  name: string | undefined = "projects",
): RouteAccessTarget => ({
  name,
  fullPath: path,
  meta: permission ? { permission } : {},
});

const auth = (
  session: SessionUser | Error,
  authenticated = true,
): RouteAccessAuth => ({
  authenticated,
  ensureSession: vi.fn(async () => {
    if (session instanceof Error) throw session;
    return session;
  }),
});

describe("route access guard", () => {
  it("未登录访问业务路由时跳转登录并保留 redirect", async () => {
    await expect(
      resolveRouteAccess(target("/projects", "project.read"), auth(new Error())),
    ).resolves.toEqual({
      name: "login",
      query: { redirect: "/projects" },
    });
  });

  it("已登录用户访问登录页时跳转工作台", async () => {
    await expect(
      resolveRouteAccess(target("/login", undefined, "login"), auth(user([]))),
    ).resolves.toEqual({ name: "home" });
  });

  it("无业务权限时跳转工作台并记录 denied 路径", async () => {
    await expect(
      resolveRouteAccess(
        target("/admin", "system.admin"),
        auth(user(["project.read"])),
      ),
    ).resolves.toEqual({
      name: "home",
      query: { denied: "/admin" },
    });
  });

  it("具备业务权限时允许进入目标路由", async () => {
    await expect(
      resolveRouteAccess(
        target("/projects", "project.read"),
        auth(user(["project.read"])),
      ),
    ).resolves.toBe(true);
  });
});
