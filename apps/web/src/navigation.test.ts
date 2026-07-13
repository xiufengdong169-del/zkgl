import { describe, expect, it } from "vitest";
import { hasPermission, visibleNavigation } from "./navigation";

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
});
