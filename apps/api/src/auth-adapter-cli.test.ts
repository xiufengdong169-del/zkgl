import { describe, expect, it } from "vitest";

import { loadAccessTokenVerifier } from "./auth-adapter-cli.js";

describe("auth adapter CLI verifier loading", () => {
  it("requires an explicit verifier module", async () => {
    await expect(loadAccessTokenVerifier({} as NodeJS.ProcessEnv)).rejects.toThrow(
      "AUTH_TOKEN_VERIFIER_MODULE is required",
    );
  });

  it("loads a verifier module exporting verifyAccessToken", async () => {
    const moduleSource = encodeURIComponent(`
      export async function verifyAccessToken(token) {
        return { uid: "cloudbase:" + token };
      }
    `);
    const verifier = await loadAccessTokenVerifier({
      AUTH_TOKEN_VERIFIER_MODULE: `data:text/javascript,${moduleSource}`,
    } as NodeJS.ProcessEnv);

    await expect(verifier("user_123456")).resolves.toEqual({
      uid: "cloudbase:user_123456",
    });
  });

  it("rejects modules that do not export a verifier function", async () => {
    const moduleSource = encodeURIComponent("export const noop = true");

    await expect(
      loadAccessTokenVerifier({
        AUTH_TOKEN_VERIFIER_MODULE: `data:text/javascript,${moduleSource}`,
      } as NodeJS.ProcessEnv),
    ).rejects.toThrow("Verifier module must export verifyAccessToken");
  });

  it("keeps the local example token verifier disabled unless explicitly enabled", async () => {
    const verifierModuleUrl = new URL(
      "../../../deploy/auth/local-token-verifier.example.mjs",
      import.meta.url,
    ).href;
    const verifierModule = (await import(verifierModuleUrl)) as {
      verifyAccessToken(token: string): Promise<{ uid: string }>;
    };
    const previousFlag = process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS;
    const previousMap = process.env.LOCAL_AUTH_TOKEN_MAP_JSON;
    try {
      delete process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS;
      delete process.env.LOCAL_AUTH_TOKEN_MAP_JSON;
      await expect(
        verifierModule.verifyAccessToken("local-admin-token-0001"),
      ).rejects.toThrow("LOCAL_AUTH_TOKEN_MAP_JSON is required");

      process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS = "true";
      await expect(
        verifierModule.verifyAccessToken("local-admin-token-0001"),
      ).resolves.toEqual({ uid: "cb-admin-001" });
      await expect(
        verifierModule.verifyAccessToken("local-username:dongxiufeng"),
      ).resolves.toEqual({ uid: "local-username:dongxiufeng" });
    } finally {
      if (previousFlag === undefined) delete process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS;
      else process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS = previousFlag;
      if (previousMap === undefined) delete process.env.LOCAL_AUTH_TOKEN_MAP_JSON;
      else process.env.LOCAL_AUTH_TOKEN_MAP_JSON = previousMap;
    }
  });
});
