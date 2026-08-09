import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { trustedUidHeader } from "./server-auth.js";

export type AccessTokenVerification = {
  uid: string;
};

export type AccessTokenVerifier = (
  accessToken: string,
) => Promise<AccessTokenVerification | string>;

const bearerPattern = /^Bearer\s+(.+)$/i;
const tokenPattern = /^[A-Za-z0-9._~+/=-]{16,8192}$/;
const uidPattern = /^[A-Za-z0-9:_-]{6,128}$/;

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function extractBearerAccessToken(headers: IncomingHttpHeaders) {
  const authorization = headerValue(headers, "authorization")?.trim();
  const match = authorization?.match(bearerPattern);
  if (!match) return null;
  const token = match[1]?.trim() ?? "";
  if (!tokenPattern.test(token)) return null;
  return token;
}

export function normalizeVerifiedUid(result: AccessTokenVerification | string) {
  const uid = typeof result === "string" ? result : result.uid;
  const normalized = uid.trim();
  if (!uidPattern.test(normalized)) {
    throw new Error("Invalid verified UID");
  }
  return normalized;
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function writeAuthSuccess(response: ServerResponse, uid: string) {
  response.statusCode = 204;
  response.setHeader(trustedUidHeader, uid);
  response.end();
}

function writeAuthFailure(response: ServerResponse) {
  response.statusCode = 401;
  response.end();
}

export function createAuthAdapterServer(verifyAccessToken: AccessTokenVerifier) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (request.url !== "/verify") {
      writeJson(response, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      });
      return;
    }

    const token = extractBearerAccessToken(request.headers);
    if (!token) {
      writeAuthFailure(response);
      return;
    }

    try {
      const uid = normalizeVerifiedUid(await verifyAccessToken(token));
      writeAuthSuccess(response, uid);
    } catch {
      writeAuthFailure(response);
    }
  });
}
