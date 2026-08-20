import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const result = { envFile: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--env-file") {
      result.envFile = argv[index + 1] ?? "";
      index += 1;
    }
  }
  return result;
}

function parseEnvFile(filePath) {
  if (!filePath) return {};
  const absolute = resolve(root, filePath);
  if (!existsSync(absolute)) {
    throw new Error(`env file not found: ${filePath}`);
  }
  const entries = {};
  for (const line of readFileSync(absolute, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (match) entries[match[1]] = match[2];
  }
  return entries;
}

function commandExists(command) {
  const executable = process.platform === "win32" ? "where.exe" : "sh";
  const args =
    process.platform === "win32"
      ? [command]
      : ["-c", `command -v ${command}`];
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function requireValues(environment, keys, failures) {
  for (const key of keys) {
    if (!String(environment[key] ?? "").trim()) {
      failures.push(`missing required environment variable ${key}`);
    }
  }
}

function validateLocalApiUrl(environment, failures) {
  const raw = String(environment.VITE_API_BASE_URL ?? "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    failures.push("VITE_API_BASE_URL is not a valid URL");
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    failures.push("VITE_API_BASE_URL must not contain username, password, query, or fragment");
  }
  if (!url.pathname.endsWith("/api")) {
    failures.push("VITE_API_BASE_URL must end with /api");
  }
  if (url.protocol === "https:") return url;
  const isLoopbackHttp =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!isLoopbackHttp) {
    failures.push("non-HTTPS VITE_API_BASE_URL is only allowed for loopback HTTP");
    return url;
  }
  if (String(environment.VITE_ALLOW_LOCAL_HTTP_API ?? "").toLowerCase() !== "true") {
    failures.push("loopback HTTP API requires VITE_ALLOW_LOCAL_HTTP_API=true");
  }
  const rawApiOrigin = `http://${environment.API_HOST || "127.0.0.1"}:${environment.API_PORT || "3000"}`;
  if (url.origin === rawApiOrigin) {
    failures.push("loopback browser API should point to the local API proxy, not the raw API service");
  }
  return url;
}

async function checkJsonEndpoint(url, label, failures) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      failures.push(`${label} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
  } catch (error) {
    failures.push(`${label} is not reachable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function checkMysqlConnection(environment, failures, mysqlAvailable) {
  if (!mysqlAvailable) return;
  if (
    !["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].every((key) =>
      String(environment[key] ?? "").trim(),
    )
  ) {
    return;
  }
  const result = spawnSync(
    "mysql",
    [
      "-h",
      environment.DB_HOST,
      "-P",
      String(environment.DB_PORT || "3306"),
      "-u",
      environment.DB_USER,
      environment.DB_NAME,
      "-e",
      "SELECT 1;",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, MYSQL_PWD: environment.DB_PASSWORD },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    },
  );
  if (result.status !== 0) {
    failures.push(
      `mysql readiness query failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
}

function checkMysqlCommand(failures) {
  if (!commandExists("mysql")) {
    failures.push("mysql command not found; install MySQL 8.0 and add mysql/bin to PATH");
    return false;
  }
  return true;
}

export async function checkLocalFullstackReadiness({
  environment = process.env,
  envFile = "",
} = {}) {
  const merged = { ...environment, ...parseEnvFile(envFile) };
  const failures = [];

  requireValues(
    merged,
    [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_PASSWORD",
      "API_HOST",
      "API_PORT",
      "VITE_API_BASE_URL",
    ],
    failures,
  );
  const frontendApiUrl = validateLocalApiUrl(merged, failures);

  if (!existsSync(resolve(root, "database/init/schema.sql"))) {
    failures.push("database/init/schema.sql is missing");
  }
  if (!existsSync(resolve(root, "apps/api/dist/server.js"))) {
    failures.push("apps/api/dist/server.js is missing; run npm run build -w @zkgl/api");
  }

  const mysqlAvailable = checkMysqlCommand(failures);
  checkMysqlConnection(merged, failures, mysqlAvailable);

  const apiOrigin = `http://${merged.API_HOST || "127.0.0.1"}:${merged.API_PORT || "3000"}`;
  await checkJsonEndpoint(`${apiOrigin}/healthz`, "API /healthz", failures);
  await checkJsonEndpoint(`${apiOrigin}/readyz`, "API /readyz", failures);
  if (frontendApiUrl && frontendApiUrl.protocol === "http:") {
    await checkJsonEndpoint(`${frontendApiUrl.origin}/healthz`, "Local API proxy /healthz", failures);
  }

  if (failures.length) {
    throw new Error(
      [
        "Local fullstack readiness failed:",
        ...failures.map((failure) => `- ${failure}`),
        "",
        "Typical order:",
        "1. Install and start MySQL 8.0.",
        "2. Create an empty zkgl database and run database/init/schema.sql.",
        "3. Build and start API with DB_* and API_* environment variables.",
        "4. Start the local API proxy and point VITE_API_BASE_URL to http://127.0.0.1:4180/api.",
        "5. For loopback HTTP frontend testing, set VITE_ALLOW_LOCAL_HTTP_API=true.",
      ].join("\n"),
    );
  }

  return "Local fullstack readiness verified";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    console.log(await checkLocalFullstackReadiness({ envFile: args.envFile }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
