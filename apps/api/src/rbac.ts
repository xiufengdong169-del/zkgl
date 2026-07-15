import type { DataScope, SessionUser } from "@zkgl/shared";

import { ForbiddenError, UnauthorizedError } from "./errors.js";

export interface ResourceContext {
  ownerId?: string;
  creatorId?: string;
  participantIds?: string[];
  departmentId?: string;
  projectId?: string;
}

export function requireEnabledUser(
  user: SessionUser | null,
): asserts user is SessionUser {
  if (!user) throw new UnauthorizedError();
  if (!user.enabled) throw new ForbiddenError("内部账号已停用");
}

export function requirePermission(
  user: SessionUser,
  permissionCode: string,
): void {
  if (!user.permissionCodes.includes(permissionCode)) {
    throw new ForbiddenError(`缺少权限：${permissionCode}`);
  }
}

function scopeAllows(scope: DataScope, resource: ResourceContext): boolean {
  switch (scope.type) {
    case "ALL":
      return true;
    case "SELF":
      return resource.ownerId === scope.userId;
    case "OWNER":
      return resource.ownerId === scope.userId;
    case "CREATOR":
      return resource.creatorId === scope.userId;
    case "PARTICIPANT":
      return Boolean(resource.participantIds?.includes(scope.userId));
    case "DEPARTMENT":
      return Boolean(
        resource.departmentId && scope.departmentIds.includes(resource.departmentId),
      );
    case "PROJECT":
      return Boolean(resource.projectId && scope.projectIds.includes(resource.projectId));
  }
}

export function requireDataAccess(
  user: SessionUser,
  resource: ResourceContext,
): void {
  if (!user.dataScopes.some((scope) => scopeAllows(scope, resource))) {
    throw new ForbiddenError("数据范围不允许访问该对象");
  }
}
