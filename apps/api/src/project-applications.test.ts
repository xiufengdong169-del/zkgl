import type { ProjectApplicationStatus } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import {
  assertProjectApplicationEditable,
  approveProjectApplication,
  projectApplicationInput,
  transitionProjectApplication,
  type ApprovalRepository,
  type ProjectApplicationRecord,
  type ProjectRecord,
} from "./project-applications.js";

class MemoryRepository implements ApprovalRepository {
  application: ProjectApplicationRecord = {
    id: "a1",
    applicationCode: "LA-2026-0001",
    projectName: "新建项目",
    customerId: "c1",
    projectType: "CONSULTING",
    serviceScope: "咨询服务",
    proposedManagerId: "e1",
    estimatedRevenue: 100,
    estimatedCost: 60,
    status: "APPROVAL_PENDING",
  };
  project: ProjectRecord | null = null;
  allocations = 0;

  async transaction<T>(work: () => Promise<T>) {
    return work();
  }
  async lockApplication() {
    return this.application;
  }
  async findProjectByApplication() {
    return this.project;
  }
  async allocateNumber() {
    this.allocations += 1;
    return "ZK-2026-0001";
  }
  async createProjectFromApplication(
    application: ProjectApplicationRecord,
    projectCode: string,
  ) {
    this.project = { id: "p1", projectCode, applicationId: application.id };
    return this.project;
  }
  async markApplicationApproved() {
    this.application.status = "APPROVED";
  }
  async copySuggestedMembers() {}
}

describe("project application", () => {
  it("只允许草稿、退回、驳回或撤回的原申请修改", () => {
    expect(() => assertProjectApplicationEditable("REJECTED")).not.toThrow();
    expect(() => assertProjectApplicationEditable("APPROVAL_PENDING")).toThrow(
      "当前立项申请状态不可修改",
    );
    expect(() => assertProjectApplicationEditable("APPROVED")).toThrow();
  });

  it("驳回后允许使用同一申请重新提交", () => {
    const status: ProjectApplicationStatus = transitionProjectApplication(
      "APPROVAL_PENDING",
      "REJECT",
    );
    expect(status).toBe("REJECTED");
    expect(transitionProjectApplication(status, "SUBMIT")).toBe(
      "APPROVAL_PENDING",
    );
  });

  it("审批通过只生成一个正式项目和编号", async () => {
    const repository = new MemoryRepository();
    const first = await approveProjectApplication(repository, "a1", "u1");
    const second = await approveProjectApplication(repository, "a1", "u1");
    expect(first).toEqual(second);
    expect(repository.allocations).toBe(1);
    expect(repository.application.applicationCode).toBe("LA-2026-0001");
    expect(repository.application.status).toBe("APPROVED");
  });

  it("预计利润由收入减成本计算，不接受人工利润字段", () => {
    const result = projectApplicationInput.parse({
      projectName: "新建咨询项目",
      customerId: "c1",
      projectType: "CONSULTING",
      serviceScope: "咨询服务",
      estimatedRevenue: 100,
      estimatedCost: 60,
      estimatedStartOn: "2026-07-12",
      estimatedEndOn: "2026-08-12",
      proposedManagerId: "e1",
      necessity: "客户明确需要",
      applicantId: "u1",
    });
    expect(result.estimatedRevenue - result.estimatedCost).toBe(40);
    expect("estimatedProfit" in result).toBe(false);
  });
});
