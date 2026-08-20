import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const trustedUidHeader = "x-zkgl-cloudbase-uid";
const maxBodyBytes = 1024 * 1024;
const defaultHost = "127.0.0.1";
const defaultPort = 4180;

function envValue(environment, key, fallback = "") {
  return String(environment[key] ?? fallback).trim();
}

function allowedOrigins(environment) {
  const configured = envValue(environment, "LOCAL_API_PROXY_ALLOWED_ORIGINS");
  const defaults = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ];
  return new Set(
    (configured ? configured.split(",") : defaults)
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function setCorsHeaders(request, response, environment) {
  const origin = request.headers.origin;
  const origins = allowedOrigins(environment);
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

function writeJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function requestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
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

function safeTargetUrl(environment, key, fallback) {
  const url = new URL(envValue(environment, key, fallback));
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${key} must be a loopback HTTP URL`);
  }
  return url;
}

async function verifyAuthorization(authorization, environment) {
  const authAdapterUrl = safeTargetUrl(
    environment,
    "LOCAL_AUTH_ADAPTER_URL",
    `http://${envValue(environment, "AUTH_ADAPTER_HOST", "127.0.0.1")}:${envValue(environment, "AUTH_ADAPTER_PORT", "3010")}/verify`,
  );
  const response = await fetch(authAdapterUrl, {
    method: "GET",
    headers: { Authorization: authorization || "" },
  });
  if (response.status !== 204) return null;
  return response.headers.get(trustedUidHeader);
}

async function forwardApiRequest({ body, request, uid, environment }) {
  const apiUrl = safeTargetUrl(
    environment,
    "LOCAL_API_TARGET_URL",
    `http://${envValue(environment, "API_HOST", "127.0.0.1")}:${envValue(environment, "API_PORT", "3000")}/api`,
  );
  return fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": request.headers["content-type"] || "application/json",
      "X-Request-Id": request.headers["x-request-id"] || "",
      [trustedUidHeader]: uid,
    },
    body,
  });
}

async function handleProxyApi(request, response, environment) {
  let body;
  try {
    body = await requestBody(request);
  } catch {
    writeJson(response, 413, {
      ok: false,
      error: { code: "REQUEST_BODY_TOO_LARGE", message: "Request body too large" },
    });
    return;
  }

  let uid;
  try {
    uid = await verifyAuthorization(request.headers.authorization, environment);
  } catch {
    writeJson(response, 502, {
      ok: false,
      error: { code: "AUTH_ADAPTER_UNAVAILABLE", message: "Local auth adapter is unavailable" },
    });
    return;
  }
  if (!uid) {
    writeJson(response, 401, {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Local identity verification failed" },
    });
    return;
  }

  let upstream;
  try {
    upstream = await forwardApiRequest({ body, request, uid, environment });
  } catch {
    writeJson(response, 502, {
      ok: false,
      error: { code: "API_UNAVAILABLE", message: "Local API is unavailable" },
    });
    return;
  }

  response.statusCode = upstream.status;
  const contentType = upstream.headers.get("content-type");
  if (contentType) response.setHeader("Content-Type", contentType);
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

export function createLocalApiProxyServer({
  environment = process.env,
} = {}) {
  return createServer(async (request, response) => {
    setCorsHeaders(request, response, environment);
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (request.method !== "POST" || request.url !== "/api") {
      writeJson(response, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      });
      return;
    }
    await handleProxyApi(request, response, environment);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = envValue(process.env, "LOCAL_API_PROXY_HOST", defaultHost);
  const port = Number(envValue(process.env, "LOCAL_API_PROXY_PORT", String(defaultPort)));
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("LOCAL_API_PROXY_HOST must stay on loopback");
  }
  createLocalApiProxyServer().listen(port, host, () => {
    console.log(`zkgl local api proxy listening on http://${host}:${port}`);
  });
}
