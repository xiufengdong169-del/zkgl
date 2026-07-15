import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it, vi } from "vitest";
import { handle } from "./handler.js";
import { AppError } from "./errors.js";

const user: SessionUser = {
  id: "1",
  cloudbaseUid: "cb-1",
  employeeId: "1",
  departmentId: "1",
  enabled: true,
  roleCodes: ["PROJECT_MEMBER"],
  permissionCodes: ["project.read", "file.download"],
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

  it("AC-12 无关项目详情、导出和附件地址均拒绝并记录 DENIED", async () => {
    const write = vi.fn(),
      dependencies = {
        audit: { write },
        findUserByCloudbaseUid: async () => user,
        execute: async (action: string) => {
          if (action === "project.detail")
            throw new AppError(
              "PROJECT_NOT_FOUND",
              "项目不存在或无权访问",
              404,
            );
          throw new AppError("BUSINESS_ACCESS_DENIED", "无权下载该文件", 403);
        },
      };
    const detail = await handle(
      {
        action: "project.detail",
        payload: { projectId: "other-project" },
        auth: { uid: "cb-1" },
      },
      dependencies,
    );
    const attachment = await handle(
      {
        action: "file.download",
        payload: { fileId: "other-file", versionId: null },
        auth: { uid: "cb-1" },
      },
      dependencies,
    );
    const exported = await handle(
      {
        action: "report.project.export",
        payload: {},
        auth: { uid: "cb-1" },
      },
      dependencies,
    );
    expect(detail).toMatchObject({
      ok: false,
      error: { code: "PROJECT_NOT_FOUND" },
    });
    expect(attachment).toMatchObject({
      ok: false,
      error: { code: "BUSINESS_ACCESS_DENIED" },
    });
    expect(exported).toMatchObject({ ok: false });
    expect(write).toHaveBeenCalledTimes(3);
    for (const call of write.mock.calls)
      expect(call[0]).toEqual(expect.objectContaining({ outcome: "DENIED" }));
  });

  it("参数校验失败时返回 VALIDATION_ERROR 且不执行持久化动作", async () => {
    const write = vi.fn();
    const execute = vi.fn();

    const result = await handle(
      {
        action: "project.detail",
        payload: {},
        auth: { uid: "cb-1" },
        requestId: "req-validation",
      },
      {
        audit: { write },
        findUserByCloudbaseUid: async () => user,
        execute,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
      },
      requestId: "req-validation",
    });
    expect(result.ok ? "" : result.error.message).toContain("请求参数不合法");
    expect(execute).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.detail",
        actorUserId: user.id,
        outcome: "FAILED",
        details: expect.objectContaining({
          code: "VALIDATION_ERROR",
          inputKeys: [],
        }),
      }),
    );
  });
});
