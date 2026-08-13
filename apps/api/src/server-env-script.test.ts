import { describe, expect, it } from "vitest";

type ServerEnvModule = {
  parseEnvFile(source: string): Map<string, string>;
  verifyServerEnvValues(
    values: Map<string, string>,
    options?: {
      fileExists?: (path: string) => boolean;
      tlsCert?: string;
      tlsKey?: string;
    },
  ): string;
  verifyServerEnvFileSecurity(
    envFile?: string,
    options?: {
      statFile?: (path: string) => { mode: number; uid: number; gid: number };
      readGroupFile?: (path: string, encoding: BufferEncoding) => string;
    },
  ): string;
};

async function loadServerEnvModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-server-env.mjs")) as ServerEnvModule;
}

function validValues() {
  return new Map([
    ["DEPLOY_TARGET_HOST", "193.112.79.220"],
    ["DEPLOY_TARGET_OS", "Ubuntu 24.04"],
    ["DEPLOY_TARGET_MYSQL", "8.0"],
    ["API_HOST", "127.0.0.1"],
    ["API_PORT", "3000"],
    ["API_ALLOWED_ORIGINS", "https://zkgl.example.cn"],
    ["AUTH_ADAPTER_HOST", "127.0.0.1"],
    ["AUTH_ADAPTER_PORT", "3010"],
    ["AUTH_TOKEN_VERIFIER_MODULE", "/etc/zkgl/cloudbase-token-verifier.mjs"],
    ["AUTH_TRUSTED_PROXY", "true"],
    ["DB_HOST", "127.0.0.1"],
    ["DB_PORT", "3306"],
    ["DB_NAME", "zkgl"],
    ["DB_USER", "zkgl_app"],
    ["DB_PASSWORD", "server-only-password"],
  ]);
}

const existingFiles = new Set([
  "/etc/zkgl/cloudbase-token-verifier.mjs",
  "/etc/letsencrypt/live/zkgl/fullchain.pem",
  "/etc/letsencrypt/live/zkgl/privkey.pem",
]);

describe("server environment verifier script", () => {
  it("accepts a production-ready server env file", async () => {
    const { parseEnvFile, verifyServerEnvValues } = await loadServerEnvModule();
    const values = parseEnvFile(
      "API_HOST=127.0.0.1\n# comment\nAPI_PORT=3000\n",
    );

    expect(values.get("API_HOST")).toBe("127.0.0.1");
    expect(values.get("API_PORT")).toBe("3000");
    expect(
      verifyServerEnvValues(validValues(), {
        fileExists: (path) => existingFiles.has(path),
      }),
    ).toBe("Server environment verified");
  });

  it("rejects missing required values and placeholder origins", async () => {
    const { verifyServerEnvValues } = await loadServerEnvModule();
    const missing = validValues();
    missing.set("DB_USER", "");

    expect(() =>
      verifyServerEnvValues(missing, {
        fileExists: (path) => existingFiles.has(path),
      }),
    ).toThrow("missing required values: DB_USER");

    const placeholderOrigin = validValues();
    placeholderOrigin.set("API_ALLOWED_ORIGINS", "https://正式域名");
    expect(() =>
      verifyServerEnvValues(placeholderOrigin, {
        fileExists: (path) => existingFiles.has(path),
      }),
    ).toThrow("API_ALLOWED_ORIGINS still contains a placeholder");
  });

  it("rejects unsafe auth verifier and TLS configuration", async () => {
    const { verifyServerEnvValues } = await loadServerEnvModule();
    const untrustedProxy = validValues();
    untrustedProxy.set("AUTH_TRUSTED_PROXY", "false");
    expect(() =>
      verifyServerEnvValues(untrustedProxy, {
        fileExists: (path) => existingFiles.has(path),
      }),
    ).toThrow("AUTH_TRUSTED_PROXY must be true");

    const exampleVerifier = validValues();
    exampleVerifier.set(
      "AUTH_TOKEN_VERIFIER_MODULE",
      "/opt/zkgl/current/deploy/auth/cloudbase-token-verifier.example.mjs",
    );
    expect(() =>
      verifyServerEnvValues(exampleVerifier, {
        fileExists: () => true,
      }),
    ).toThrow("must not point to an example verifier");

    expect(() =>
      verifyServerEnvValues(validValues(), {
        fileExists: (path) => path === "/etc/zkgl/cloudbase-token-verifier.mjs",
      }),
    ).toThrow("TLS certificate files are missing");
  });

  it("rejects an env file that is readable outside the zkgl service group", async () => {
    const { verifyServerEnvFileSecurity } = await loadServerEnvModule();
    const readGroupFile = () => "root:x:0:\nzkgl:x:998:\n";

    expect(
      verifyServerEnvFileSecurity("/etc/zkgl/zkgl-api.env", {
        statFile: () => ({ mode: 0o100640, uid: 0, gid: 998 }),
        readGroupFile,
      }),
    ).toBe("Server environment file permissions verified");

    expect(() =>
      verifyServerEnvFileSecurity("/etc/zkgl/zkgl-api.env", {
        statFile: () => ({ mode: 0o100644, uid: 0, gid: 998 }),
        readGroupFile,
      }),
    ).toThrow("env file permissions must be 0640");

    expect(() =>
      verifyServerEnvFileSecurity("/etc/zkgl/zkgl-api.env", {
        statFile: () => ({ mode: 0o100640, uid: 0, gid: 0 }),
        readGroupFile,
      }),
    ).toThrow("env file group must be zkgl");
  });
});
