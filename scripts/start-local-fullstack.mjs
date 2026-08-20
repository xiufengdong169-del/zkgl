import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const defaultEnvFile = ".env.local.fullstack";
const databasePasswordKey = "DB_" + "PASSWORD";

function parseArgs(argv) {
  const result = { envFile: defaultEnvFile, skipBuild: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      result.envFile = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--skip-build") {
      result.skipBuild = true;
    }
  }
  return result;
}

export function parseEnvFile(filePath, { cwd = root } = {}) {
  if (!filePath) return {};
  const absolute = resolve(cwd, filePath);
  if (!existsSync(absolute)) {
    throw new Error(`env file not found: ${filePath}; run npm run create:local-fullstack-env first`);
  }
  const values = {};
  for (const line of readFileSync(absolute, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function requireValues(environment, keys) {
  const missing = keys.filter((key) => !String(environment[key] ?? "").trim());
  if (missing.length) {
    throw new Error(`local fullstack environment missing required values: ${missing.join(", ")}`);
  }
}

function requireLoopbackUrl(raw, label) {
  const url = new URL(String(raw || ""));
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${label} must be a loopback HTTP URL`);
  }
  return url;
}

export function resolveLocalFullstackEnvironment({
  environment = process.env,
  envFile = defaultEnvFile,
  cwd = root,
} = {}) {
  const env = {
    ...environment,
    ...parseEnvFile(envFile, { cwd }),
  };
  const defaults = {
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    AUTH_TRUSTED_PROXY: "true",
    AUTH_ADAPTER_HOST: "127.0.0.1",
    AUTH_ADAPTER_PORT: "3010",
    AUTH_TOKEN_VERIFIER_MODULE: "deploy/auth/local-token-verifier.example.mjs",
    LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS: "true",
    LOCAL_AUTH_ADAPTER_URL: "http://127.0.0.1:3010/verify",
    LOCAL_API_TARGET_URL: "http://127.0.0.1:3000/api",
    LOCAL_API_PROXY_HOST: "127.0.0.1",
    LOCAL_API_PROXY_PORT: "4180",
    VITE_API_BASE_URL: "http://127.0.0.1:4180/api",
    VITE_ALLOW_LOCAL_HTTP_API: "true",
    VITE_LOCAL_AUTH_MODE: "true",
  };
  const merged = { ...defaults, ...env };
  requireValues(merged, [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    databasePasswordKey,
    "API_HOST",
    "API_PORT",
    "VITE_API_BASE_URL",
    "VITE_LOCAL_AUTH_TOKEN",
  ]);
  const frontendUrl = requireLoopbackUrl(merged.VITE_API_BASE_URL, "VITE_API_BASE_URL");
  requireLoopbackUrl(merged.LOCAL_AUTH_ADAPTER_URL, "LOCAL_AUTH_ADAPTER_URL");
  requireLoopbackUrl(merged.LOCAL_API_TARGET_URL, "LOCAL_API_TARGET_URL");
  if (!frontendUrl.pathname.endsWith("/api")) {
    throw new Error("VITE_API_BASE_URL must end with /api");
  }
  if (frontendUrl.origin === `http://${merged.API_HOST}:${merged.API_PORT}`) {
    throw new Error("VITE_API_BASE_URL must point to the local API proxy, not the raw API service");
  }
  return merged;
}

export function buildLocalFullstackPlan(environment) {
  return [
    {
      name: "api",
      command: "npm",
      args: ["run", "start", "-w", "@zkgl/api"],
      env: {
        ...environment,
        AUTH_TRUSTED_PROXY: "true",
      },
    },
    {
      name: "auth-adapter",
      command: "node",
      args: ["apps/api/dist/auth-adapter-cli.js"],
      env: environment,
    },
    {
      name: "local-api-proxy",
      command: "node",
      args: ["scripts/serve-local-api-proxy.mjs"],
      env: environment,
    },
    {
      name: "web",
      command: "npm",
      args: ["run", "dev", "-w", "@zkgl/web", "--", "--host", "127.0.0.1"],
      env: environment,
    },
  ];
}

function runBuild() {
  const result = spawnSync("npm", ["run", "build", "-w", "@zkgl/api"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error("API build failed");
  }
}

function startProcess(entry) {
  console.log(`Starting ${entry.name}: ${entry.command} ${entry.args.join(" ")}`);
  return spawn(entry.command, entry.args, {
    cwd: root,
    env: { ...process.env, ...entry.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const environment = resolveLocalFullstackEnvironment({ envFile: args.envFile });
  if (!args.skipBuild) runBuild();
  const children = buildLocalFullstackPlan(environment).map(startProcess);
  const stop = () => {
    for (const child of children) child.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(`${child.pid} exited with code ${code}${signal ? ` signal ${signal}` : ""}`);
      }
    });
  }
}
