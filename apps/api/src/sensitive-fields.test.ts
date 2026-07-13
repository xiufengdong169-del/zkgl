import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";
import {
  maskBankAccount,
  protectSensitiveResult,
  resolveSensitiveFieldAccess,
} from "./sensitive-fields.js";

const user = (access: SessionUser["sensitiveFieldAccess"]): SessionUser => ({
  id: "1",
  cloudbaseUid: "cb",
  employeeId: "1",
  departmentId: "1",
  enabled: true,
  roleCodes: [],
  permissionCodes: [],
  sensitiveFieldAccess: access,
  dataScopes: [],
});

describe("sensitive field protection", () => {
  it("多角色取授权并集但显式拒绝优先", () => {
    expect(
      resolveSensitiveFieldAccess([
        { fieldCode: "profit", accessLevel: "FULL", explicitDeny: false },
        { fieldCode: "profit", accessLevel: "MASKED", explicitDeny: true },
        {
          fieldCode: "bank_account",
          accessLevel: "MASKED",
          explicitDeny: false,
        },
      ]),
    ).toEqual({ profit: "DENY", bank_account: "MASKED" });
  });

  it("银行账号由后端保留末四位脱敏", () => {
    expect(maskBankAccount("6222020202021234")).toMatch(/1234$/);
    expect(maskBankAccount("6222020202021234")).not.toContain("622202");
    expect(
      protectSensitiveResult(user({ bank_account: "MASKED" }), {
        receivingAccount: "6222020202021234",
      }),
    ).toEqual({ receivingAccount: "************1234" });
  });

  it("无授权字段从嵌套响应移除，遮罩授权的利润不返回原值", () => {
    const createdAt = new Date("2026-07-13T00:00:00Z");
    expect(
      protectSensitiveResult(
        user({ profit: "MASKED", partner_settlement: "DENY" }),
        {
          expectedProfit: 100,
          plans: [{ ratio: 0.2, code: "P1" }],
          publicName: "项目A",
          createdAt,
        },
      ),
    ).toEqual({
      expectedProfit: null,
      plans: [{ code: "P1" }],
      publicName: "项目A",
      createdAt,
    });
  });
});
