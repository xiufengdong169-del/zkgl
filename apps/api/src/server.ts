import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import tcb from "@cloudbase/node-sdk";

import { findSessionUserByCloudbaseUid, getPool, MySqlAuditWriter } from "./database.js";
import { handle } from "./handler.js";
import { MySqlActionExecutor } from "./persistence.js";
import { resolveServerCloudbaseUid } from "./server-auth.js";

const defaultPort = 3000;
const maxBodyBytes = 1024 * 1024;

function allowedOrigins() {
  return new Set(
    String(process.env.API_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function setCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  const origins = allowedOrigins();
  if (origin && origins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Request-Id",
  );
  response.setHeader("Access-Control-Max-Age", "600");
}

function jsonResponse(
  response: ServerResponse,
  status: number,
  body: unknown,
) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function requestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("REQUEST_BODY_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function errorStatus(code?: string) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN" || code?.endsWith("_FORBIDDEN")) return 403;
  if (code?.endsWith("_NOT_FOUND")) return 404;
  if (code === "EXPORT_FILE_EXPIRED") return 410;
  if (
    code === "CONCURRENT_WRITE_CONFLICT" ||
    code?.endsWith("_INVALID") ||
    code?.endsWith("_NOT_PENDING")
  )
    return 409;
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "NOT_IMPLEMENTED") return 501;
  if (code === "CONFIGURATION_ERROR" || code === "INTERNAL_ERROR") return 500;
  return 400;
}

async function serveApi(request: IncomingMessage, response: ServerResponse) {
  let uid: string;
  try {
    uid = resolveServerCloudbaseUid(request.headers, process.env);
  } catch (error) {
    jsonResponse(response, 401, {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          error instanceof Error ? error.message : "Identity verification failed",
      },
      requestId: request.headers["x-request-id"] || null,
    });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    const rawBody = await requestBody(request);
    parsed = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch (error) {
    const code =
      error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE"
        ? "REQUEST_BODY_TOO_LARGE"
        : "INVALID_JSON";
    jsonResponse(response, code === "REQUEST_BODY_TOO_LARGE" ? 413 : 400, {
      ok: false,
      error: { code, message: "Invalid request body" },
      requestId: request.headers["x-request-id"] || null,
    });
    return;
  }

  const pool = getPool();
  const storage = tcb.init({
    env: process.env.CLOUDBASE_ENV_ID || tcb.SYMBOL_CURRENT_ENV,
  });
  const executor = new MySqlActionExecutor(pool, async (fileId, maxAge) => {
    const result = await storage.getTempFileURL({
      fileList: [{ fileID: fileId, maxAge }],
    });
    const url = result.fileList?.[0]?.tempFileURL;
    if (!url) throw new Error("Unable to create temporary file URL");
    return url;
  });

  const result = await handle(
    {
      action: parsed.action,
      payload: parsed.payload,
      requestId:
        typeof parsed.requestId === "string"
          ? parsed.requestId
          : String(request.headers["x-request-id"] || ""),
      auth: { uid },
    },
    {
      audit: new MySqlAuditWriter(pool),
      findUserByCloudbaseUid: (cloudbaseUid) =>
        findSessionUserByCloudbaseUid(pool, cloudbaseUid),
      execute: (action, input, user, requestId) =>
        executor.execute(action, input, user, requestId),
    },
  );
  jsonResponse(response, result.ok ? 200 : errorStatus(result.error.code), result);
}

async function serveReadyz(response: ServerResponse) {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    jsonResponse(response, 200, {
      ok: true,
      checks: { database: "ok" },
    });
  } catch (error) {
    jsonResponse(response, 503, {
      ok: false,
      checks: { database: "unavailable" },
      error: {
        code: "DATABASE_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "Database readiness check failed",
      },
    });
  }
}

export function createZkglServer() {
  return createServer(async (request, response) => {
    setCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === "GET" && request.url === "/healthz") {
      jsonResponse(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      await serveReadyz(response);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api") {
      jsonResponse(response, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      });
      return;
    }
    await serveApi(request, response);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.API_PORT || defaultPort);
  const host = process.env.API_HOST || "127.0.0.1";
  createZkglServer().listen(port, host, () => {
    console.log(`zkgl api listening on http://${host}:${port}`);
  });
}
