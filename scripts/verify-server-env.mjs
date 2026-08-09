import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const defaultEnvFile = process.env.ZKGL_ENV_FILE || "/etc/zkgl/zkgl-api.env";
const defaultTlsCert =
  process.env.ZKGL_TLS_CERT || "/etc/letsencrypt/live/zkgl/fullchain.pem";
const defaultTlsKey =
  process.env.ZKGL_TLS_KEY || "/etc/letsencrypt/live/zkgl/privkey.pem";

const requiredKeys = [
  "DEPLOY_TARGET_HOST",
  "DEPLOY_TARGET_OS",
  "DEPLOY_TARGET_MYSQL",
  "API_HOST",
  "API_PORT",
  "API_ALLOWED_ORIGINS",
  "AUTH_ADAPTER_HOST",
  "AUTH_ADAPTER_PORT",
  "AUTH_TOKEN_VERIFIER_MODULE",
  "AUTH_TRUSTED_PROXY",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];

const fail = (message) => {
  throw new Error(`Server environment verification failed: ${message}`);
};

export function parseEnvFile(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    values.set(match[1], match[2]);
  }
  return values;
}

export function verifyServerEnvValues(
  values,
  {
    fileExists = existsSync,
    tlsCert = defaultTlsCert,
    tlsKey = defaultTlsKey,
  } = {},
) {
  const missing = requiredKeys.filter((key) => !values.get(key)?.trim());
  if (missing.length > 0) {
    fail(`missing required values: ${missing.join(", ")}`);
  }

  const allowedOrigins = values.get("API_ALLOWED_ORIGINS") ?? "";
  if (/正式域名|example\.com/i.test(allowedOrigins)) {
    fail("API_ALLOWED_ORIGINS still contains a placeholder");
  }
  if (!/^https:\/\//i.test(allowedOrigins)) {
    fail("API_ALLOWED_ORIGINS must start with https://");
  }

  if (values.get("AUTH_TRUSTED_PROXY") !== "true") {
    fail("AUTH_TRUSTED_PROXY must be true only after trusted Nginx auth_request is configured");
  }

  const verifierModule = values.get("AUTH_TOKEN_VERIFIER_MODULE") ?? "";
  if (verifierModule.includes(".example.")) {
    fail("AUTH_TOKEN_VERIFIER_MODULE must not point to an example verifier");
  }
  if (!fileExists(verifierModule)) {
    fail(`AUTH_TOKEN_VERIFIER_MODULE does not exist: ${verifierModule}`);
  }
  if (!fileExists(tlsCert) || !fileExists(tlsKey)) {
    fail(`TLS certificate files are missing: ${tlsCert} ${tlsKey}`);
  }

  return "Server environment verified";
}

export function verifyServerEnvFile({
  envFile = defaultEnvFile,
  readFile = readFileSync,
  fileExists = existsSync,
  tlsCert = defaultTlsCert,
  tlsKey = defaultTlsKey,
} = {}) {
  if (!fileExists(envFile)) fail(`env file is missing: ${envFile}`);
  const values = parseEnvFile(readFile(envFile, "utf8"));
  return verifyServerEnvValues(values, { fileExists, tlsCert, tlsKey });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(verifyServerEnvFile({ envFile: process.argv[2] || defaultEnvFile }));
}
