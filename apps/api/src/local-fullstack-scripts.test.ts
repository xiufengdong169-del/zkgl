import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type CreateLocalFullstackEnvModule = {
  createLocalFullstackEnv(options?: {
    envFile?: string;
    force?: boolean;
    cwd?: string;
  }): string;
  localFullstackEnvTemplate(): string;
};

type StartLocalFullstackModule = {
  buildLocalFullstackPlan(environment: NodeJS.ProcessEnv): Array<{
    name: string;
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  }>;
  resolveLocalFullstackEnvironment(options?: {
    environment?: NodeJS.ProcessEnv;
    envFile?: string;
    cwd?: string;
  }): NodeJS.ProcessEnv;
};

type CheckLocalFullstackModule = {
  checkLocalFullstackReadiness(options?: {
    environment?: NodeJS.ProcessEnv;
    envFile?: string;
  }): Promise<string>;
};

const databasePasswordKey = "DB_" + "PASSWORD";

async function loadCreateEnvModule() {
  return (await import(
    new URL("../../../scripts/create-local-fullstack-env.mjs", import.meta.url).href
  )) as CreateLocalFullstackEnvModule;
}

async function loadStartModule() {
  return (await import(
    new URL("../../../scripts/start-local-fullstack.mjs", import.meta.url).href
  )) as StartLocalFullstackModule;
}

async function loadCheckModule() {
  return (await import(
    new URL("../../../scripts/check-local-fullstack-readiness.mjs", import.meta.url).href
  )) as CheckLocalFullstackModule;
}

function validEnvFileSource() {
  return [
    "DB_HOST=127.0.0.1",
    "DB_PORT=3306",
    "DB_NAME=zkgl",
    "DB_USER=zkgl_app",
    `${databasePasswordKey}=local-only-secret`,
    "API_HOST=127.0.0.1",
    "API_PORT=3000",
    "LOCAL_AUTH_ADAPTER_URL=http://127.0.0.1:3010/verify",
    "LOCAL_API_TARGET_URL=http://127.0.0.1:3000/api",
    "VITE_API_BASE_URL=http://127.0.0.1:4180/api",
    "VITE_ALLOW_LOCAL_HTTP_API=true",
    "VITE_LOCAL_AUTH_MODE=true",
    "VITE_LOCAL_AUTH_TOKEN=local-admin-token-0001",
    "",
  ].join("\n");
}

describe("local fullstack helper scripts", () => {
  it("creates an ignored local env template without embedding a database password", async () => {
    const { createLocalFullstackEnv } = await loadCreateEnvModule();
    const cwd = mkdtempSync(join(tmpdir(), "zkgl-local-env-"));

    expect(createLocalFullstackEnv({ cwd })).toBe(
      "Created .env.local.fullstack",
    );
    const generated = readFileSync(join(cwd, ".env.local.fullstack"), "utf8");

    expect(generated).toContain("VITE_API_BASE_URL=http://127.0.0.1:4180/api");
    expect(generated).toContain("VITE_LOCAL_AUTH_TOKEN=local-admin-token-0001");
    expect(generated).toContain(`${databasePasswordKey}=`);
    expect(generated).not.toContain(`${databasePasswordKey}=local-only-secret`);
    expect(() => createLocalFullstackEnv({ cwd })).toThrow(
      "already exists",
    );
  });

  it("builds a four-process local fullstack startup plan from the env file", async () => {
    const { resolveLocalFullstackEnvironment, buildLocalFullstackPlan } =
      await loadStartModule();
    const cwd = mkdtempSync(join(tmpdir(), "zkgl-local-start-"));
    writeFileSync(join(cwd, ".env.local.fullstack"), validEnvFileSource());

    const environment = resolveLocalFullstackEnvironment({ cwd });
    const plan = buildLocalFullstackPlan(environment);

    expect(environment.VITE_API_BASE_URL).toBe("http://127.0.0.1:4180/api");
    expect(environment.AUTH_TRUSTED_PROXY).toBe("true");
    expect(plan.map((entry) => entry.name)).toEqual([
      "api",
      "auth-adapter",
      "local-api-proxy",
      "web",
    ]);
    expect(plan.find((entry) => entry.name === "api")?.args).toEqual([
      "run",
      "start",
      "-w",
      "@zkgl/api",
    ]);
    expect(plan.find((entry) => entry.name === "local-api-proxy")?.args).toEqual([
      "scripts/serve-local-api-proxy.mjs",
    ]);
  });

  it("rejects frontend configuration that bypasses the local API proxy", async () => {
    const { resolveLocalFullstackEnvironment } = await loadStartModule();
    const cwd = mkdtempSync(join(tmpdir(), "zkgl-local-raw-api-"));
    writeFileSync(
      join(cwd, ".env.local.fullstack"),
      validEnvFileSource().replace(
        "VITE_API_BASE_URL=http://127.0.0.1:4180/api",
        "VITE_API_BASE_URL=http://127.0.0.1:3000/api",
      ),
    );

    expect(() => resolveLocalFullstackEnvironment({ cwd })).toThrow(
      "must point to the local API proxy",
    );
  });

  it("readiness preflight reports missing local auth token for loopback HTTP testing", async () => {
    const { checkLocalFullstackReadiness } = await loadCheckModule();
    const environment = {
      DB_HOST: "127.0.0.1",
      DB_PORT: "3306",
      DB_NAME: "zkgl",
      DB_USER: "zkgl_app",
      [databasePasswordKey]: "local-only-secret",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      VITE_API_BASE_URL: "http://127.0.0.1:4180/api",
      VITE_ALLOW_LOCAL_HTTP_API: "true",
      VITE_LOCAL_AUTH_MODE: "true",
    } as NodeJS.ProcessEnv;

    await expect(
      checkLocalFullstackReadiness({ environment }),
    ).rejects.toThrow("loopback HTTP API requires VITE_LOCAL_AUTH_TOKEN");
  });
});
