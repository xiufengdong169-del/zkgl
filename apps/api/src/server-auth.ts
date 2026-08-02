import type { IncomingHttpHeaders } from "node:http";

import { UnauthorizedError } from "./errors.js";

export const trustedUidHeader = "x-zkgl-cloudbase-uid";

const uidPattern = /^[A-Za-z0-9:_-]{6,128}$/;

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function trustedProxyEnabled(environment: NodeJS.ProcessEnv) {
  return String(environment.AUTH_TRUSTED_PROXY || "").toLowerCase() === "true";
}

export function resolveServerCloudbaseUid(
  headers: IncomingHttpHeaders,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!trustedProxyEnabled(environment)) {
    throw new UnauthorizedError("Trusted identity proxy is not enabled");
  }
  const uid = headerValue(headers, trustedUidHeader)?.trim();
  if (!uid) throw new UnauthorizedError("Missing trusted identity header");
  if (!uidPattern.test(uid)) {
    throw new UnauthorizedError("Invalid trusted identity header");
  }
  return uid;
}
