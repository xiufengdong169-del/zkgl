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
});
