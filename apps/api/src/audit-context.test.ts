import { describe, expect, it } from "vitest";
import {
  auditInputKeys,
  auditResourceType,
  deriveAuditResourceId,
} from "./audit.js";

describe("business audit context", () => {
  it("创建成功优先关联新对象 ID", () => {
    expect(
      deriveAuditResourceId({ projectId: "10" }, { id: "99", code: "X" }),
    ).toBe("99");
    expect(auditResourceType("contract.change.create")).toBe("contract.change");
  });

  it("更新或失败操作关联请求中的业务对象 ID", () => {
    expect(deriveAuditResourceId({ contractId: "20", version: 1 })).toBe("20");
    expect(deriveAuditResourceId({ businessId: "30", taskId: "40" })).toBe(
      "30",
    );
  });

  it("审计详情只保留排序后的字段名而非字段值", () => {
    const input = { password: "secret", amount: 100, projectId: "1" };
    expect(auditInputKeys(input)).toEqual(["amount", "password", "projectId"]);
    expect(JSON.stringify(auditInputKeys(input))).not.toContain("secret");
  });
});
