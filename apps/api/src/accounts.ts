import { AppError } from "./errors.js";

export function assertAccountStatusChangeAllowed(input: {
  targetUserId: string;
  actorUserId: string;
  nextStatus: "ENABLED" | "DISABLED";
  targetIsAdmin: boolean;
  enabledAdminCount: number;
}) {
  if (input.nextStatus !== "DISABLED") return;
  if (input.targetUserId === input.actorUserId)
    throw new AppError(
      "SELF_DISABLE_FORBIDDEN",
      "不能停用当前登录账号",
      409,
    );
  if (input.targetIsAdmin && input.enabledAdminCount <= 1)
    throw new AppError(
      "LAST_ADMIN_REQUIRED",
      "系统至少必须保留一名启用的管理员",
      409,
    );
}
