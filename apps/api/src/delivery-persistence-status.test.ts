import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_MEMBER"],
  permissionCodes: ["project.progress.create", "project.deliverable.confirm"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["p1"] }],
};

function progressInput(stageId = "s1") {
  return {
    projectId: "p1",
    stageId,
    recordedOn: "2026-07-17",
    completedWork: "完成阶段核心工作",
    currentProgress: 100,
    nextPlan: "提交阶段确认",
    deviationDescription: null,
    coordinationNeeded: null,
  };
}

function deliveryConnection(stageStatus: string) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [[{ id: "p1" }], []];
      if (sql.includes("FROM prj_stage WHERE id=? AND project_id=?"))
        return [[{ id: "s1", status: stageStatus }], []];
      if (sql.startsWith("INSERT INTO prj_progress")) return [{ insertId: 8 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

async function run(stageStatus: string) {
  const connection = deliveryConnection(stageStatus);
  const executor = new MySqlActionExecutor({
    getConnection: async () => connection,
  } as never);
  const result = await executor.execute(
    "project.progress.create",
    progressInput(),
    user,
  );
  return { result, calls: connection.calls };
}

describe("delivery persistence stage status guards", () => {
  it("rejects progress recording for locked terminal or confirmation stages", async () => {
    for (const status of [
      "PENDING_CONFIRMATION",
      "SUSPENDED",
      "COMPLETED",
      "CANCELLED",
    ]) {
      const connection = deliveryConnection(status);
      const executor = new MySqlActionExecutor({
        getConnection: async () => connection,
      } as never);

      await expect(
        executor.execute("project.progress.create", progressInput(), user),
      ).rejects.toMatchObject({ code: "STAGE_PROGRESS_NOT_ALLOWED" });

      expect(
        connection.calls.some((call) =>
          call.sql.startsWith("INSERT INTO prj_progress"),
        ),
      ).toBe(false);
      expect(
        connection.calls.some((call) =>
          call.sql.startsWith("UPDATE prj_stage SET completion_percentage="),
        ),
      ).toBe(false);
      expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
    }
  });

  it("records progress for active stages and submits 100 percent stages for confirmation", async () => {
    const { result, calls } = await run("IN_PROGRESS");

    expect(result).toEqual({ id: "8" });
    expect(
      calls.some((call) => call.sql.startsWith("INSERT INTO prj_progress")),
    ).toBe(true);
    const stageUpdate = calls.find((call) =>
      call.sql.startsWith("UPDATE prj_stage SET completion_percentage="),
    );
    expect(stageUpdate?.params).toEqual([100, 100, "u1", "s1"]);
    expect(calls.map((call) => call.sql)).toContain("COMMIT");
  });
});

function deliverableConnection(options: { deleted?: boolean } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM prj_deliverable WHERE id=?")) {
        if (options.deleted && sql.includes("is_deleted=0")) return [[], []];
        return [[{ id: "d1", projectId: "p1", status: "SUBMITTED" }], []];
      }
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [[{ id: "p1" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("delivery persistence deliverable guards", () => {
  it("does not confirm soft-deleted deliverables", async () => {
    const connection = deliverableConnection({ deleted: true });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "project.deliverable.confirm",
        { deliverableId: "d1", confirmationResult: "ACCEPTED" },
        user,
      ),
    ).rejects.toMatchObject({ code: "DELIVERABLE_NOT_CONFIRMABLE" });

    const select = connection.calls.find((call) =>
      call.sql.includes("FROM prj_deliverable WHERE id=?"),
    );
    expect(select?.sql).toContain("is_deleted=0");
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE prj_deliverable SET confirmation_result="),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("confirms submitted active deliverables", async () => {
    const connection = deliverableConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "project.deliverable.confirm",
        { deliverableId: "d1", confirmationResult: "ACCEPTED" },
        user,
      ),
    ).resolves.toEqual({ id: "d1", status: "CONFIRMED" });

    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE prj_deliverable SET confirmation_result="),
    );
    expect(update?.params).toEqual(["ACCEPTED", "CONFIRMED", "d1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
