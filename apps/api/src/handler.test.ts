import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it, vi } from "vitest";
import { handle } from "./handler.js";

const user: SessionUser = {
  id: "1",
  cloudbaseUid: "cb-1",
  employeeId: "1",
  departmentId: "1",
  enabled: true,
  roleCodes: ["PROJECT_MEMBER"],
  permissionCodes: ["project.read"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["10"] }],
};

describe("API handler security boundary", () => {
  it("响应返回前统一移除无权查看的受限字段并关联审计对象", async () => {
    const write = vi.fn();
    const result = await handle(
      {
        action: "project.detail",
        payload: { projectId: "10" },
        auth: { uid: "cb-1" },
        requestId: "req-1",
      },
      {
        audit: { write },
        findUserByCloudbaseUid: async () => user,
        execute: async () => ({
          project: { id: "10", projectName: "A", expectedProfit: 100 },
          receivingAccount: "622200001234",
        }),
      },
    );
    expect(result).toMatchObject({
      ok: true,
      data: { project: { id: "10", projectName: "A" } },
    });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "project.detail",
        resourceId: "10",
        outcome: "SUCCESS",
      }),
    );
  });
});
