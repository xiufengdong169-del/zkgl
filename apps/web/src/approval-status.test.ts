import { describe, expect, it } from "vitest";

import { canSubmitApprovalStatus } from "./approval-status";

describe("approval status helpers", () => {
  it("allows resubmitting returned, rejected and withdrawn approval businesses", () => {
    for (const status of ["DRAFT", "RETURNED", "REJECTED", "WITHDRAWN"])
      expect(canSubmitApprovalStatus(status)).toBe(true);
  });

  it("does not allow submitting already pending or completed approval businesses", () => {
    for (const status of [
      "APPROVAL_PENDING",
      "PENDING_REGISTRATION",
      "PENDING",
      "APPROVED",
      "PENDING_SIGNATURE",
      "PERFORMING",
      "CLOSED",
    ])
      expect(canSubmitApprovalStatus(status)).toBe(false);
  });
});
