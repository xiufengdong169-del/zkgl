import { describe, expect, it } from "vitest";
import {
  hasPermission,
  navigationItems,
  visibleNavigation,
} from "./navigation";
import { routes } from "./routes";

describe("permission navigation", () => {
  it("普通业务用户只看到其有权模块", () => {
    const paths = visibleNavigation(["project.read", "file.read"]).map(
      (item) => item.to,
    );
    expect(paths).toContain("/");
    expect(paths).toContain("/projects");
    expect(paths).toContain("/files");
    expect(paths).not.toContain("/admin");
    expect(paths).not.toContain("/finance");
  });

  it("系统管理路由必须具有 system.admin 权限", () => {
    expect(hasPermission([], "system.admin")).toBe(false);
    expect(hasPermission(["system.admin"], "system.admin")).toBe(true);
  });

  it("导航菜单与业务路由保持路径和权限一致", () => {
    const navigableRoutes = routes
      .filter((route) => route.name !== "login")
      .map((route) => ({
        path: route.path,
        permission: route.meta?.permission as string | undefined,
      }));
    const navigationByPath = new Map(
      navigationItems.map((item) => [item.to, item.permission]),
    );

    expect(navigationItems.map((item) => item.to).sort()).toEqual(
      navigableRoutes.map((route) => route.path).sort(),
    );
    for (const route of navigableRoutes) {
      expect(navigationByPath.get(route.path)).toBe(route.permission);
    }
  });
});
