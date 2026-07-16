export const resubmittableApprovalStatuses = [
  "DRAFT",
  "RETURNED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export function canSubmitApprovalStatus(status: string | null | undefined) {
  return resubmittableApprovalStatuses.includes(
    status as (typeof resubmittableApprovalStatuses)[number],
  );
}
