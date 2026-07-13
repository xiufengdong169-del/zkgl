import { describe, expect, it } from "vitest";

import { assertAccountStatusChangeAllowed } from "./accounts.js";

describe("account lifecycle", () => {
  it("禁止管理员停用自己", () => {
    expect(() =>
      assertAccountStatusChangeAllowed({
        targetUserId: "1",
        actorUserId: "1",
        nextStatus: "DISABLED",
        targetIsAdmin: true,
        enabledAdminCount: 2,
      }),
    ).toThrow("不能停用当前登录账号");
  });

  it("禁止停用最后一个启用的管理员", () => {
    expect(() =>
      assertAccountStatusChangeAllowed({
        targetUserId: "2",
        actorUserId: "1",
        nextStatus: "DISABLED",
        targetIsAdmin: true,
        enabledAdminCount: 1,
      }),
    ).toThrow("系统至少必须保留一名启用的管理员");
  });

  it("允许停用普通账号并允许重新启用账号", () => {
    expect(() =>
      assertAccountStatusChangeAllowed({
        targetUserId: "2",
        actorUserId: "1",
        nextStatus: "DISABLED",
        targetIsAdmin: false,
        enabledAdminCount: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertAccountStatusChangeAllowed({
        targetUserId: "1",
        actorUserId: "1",
        nextStatus: "ENABLED",
        targetIsAdmin: true,
        enabledAdminCount: 0,
      }),
    ).not.toThrow();
  });
});
