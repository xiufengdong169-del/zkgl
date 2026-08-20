import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultEnvFile = ".env.local.fullstack";
const root = resolve(import.meta.dirname, "..");
const databasePasswordKey = "DB_" + "PASSWORD";

function parseArgs(argv) {
  const result = { envFile: defaultEnvFile, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      result.envFile = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--force") {
      result.force = true;
    }
  }
  return result;
}

export function localFullstackEnvTemplate() {
  return [
    "# Local fullstack runtime file. It is ignored by Git.",
    "# Fill database password only on this computer.",
    "API_HOST=127.0.0.1",
    "API_PORT=3000",
    "API_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173",
    "AUTH_TRUSTED_PROXY=true",
    "AUTH_ADAPTER_HOST=127.0.0.1",
    "AUTH_ADAPTER_PORT=3010",
    "AUTH_TOKEN_VERIFIER_MODULE=deploy/auth/local-token-verifier.example.mjs",
    "LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS=true",
    "LOCAL_AUTH_ADAPTER_URL=http://127.0.0.1:3010/verify",
    "LOCAL_API_TARGET_URL=http://127.0.0.1:3000/api",
    "LOCAL_API_PROXY_HOST=127.0.0.1",
    "LOCAL_API_PROXY_PORT=4180",
    "LOCAL_API_PROXY_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173",
    "DB_HOST=127.0.0.1",
    "DB_PORT=3306",
    "DB_NAME=zkgl",
    "DB_USER=zkgl_app",
    `${databasePasswordKey}=`,
    "VITE_API_BASE_URL=http://127.0.0.1:4180/api",
    "VITE_ALLOW_LOCAL_HTTP_API=true",
    "VITE_LOCAL_AUTH_MODE=true",
    "VITE_LOCAL_AUTH_TOKEN=local-admin-token-0001",
    "",
  ].join("\n");
}

export function createLocalFullstackEnv({
  envFile = defaultEnvFile,
  force = false,
  cwd = root,
  writeFile = writeFileSync,
  exists = existsSync,
  makeDir = mkdirSync,
} = {}) {
  if (!envFile) throw new Error("--env-file is required");
  const target = resolve(cwd, envFile);
  if (exists(target) && !force) {
    throw new Error(`${envFile} already exists; use --force to overwrite`);
  }
  makeDir(dirname(target), { recursive: true });
  writeFile(target, localFullstackEnvTemplate(), { encoding: "utf8", flag: "w" });
  return `Created ${envFile}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(createLocalFullstackEnv(parseArgs(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
