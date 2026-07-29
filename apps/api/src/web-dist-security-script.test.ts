import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

type WebDistSecurityModule = {
  collectDistFiles(dist?: string): Promise<string[]>;
  verifyContent(file: string, content: string): void;
  verifyWebDistSecurity(options?: { dist?: string }): Promise<string>;
};

async function loadWebDistSecurityModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-web-dist-security.mjs")) as WebDistSecurityModule;
}

async function withTempDist<T>(work: (dist: string) => Promise<T>) {
  const dist = await mkdtemp(join(tmpdir(), "zkgl-web-dist-"));
  try {
    return await work(dist);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
}

describe("web dist security verifier script", () => {
  it("rejects server-only environment markers in built frontend files", async () => {
    const { verifyContent } = await loadWebDistSecurityModule();

    expect(() =>
      verifyContent("dist/assets/index.js", `window.leak = "DB_${"PASSWORD"}";`),
    ).toThrow("forbidden server-only marker");
  });

  it("rejects private key blocks in built frontend files", async () => {
    const { verifyContent } = await loadWebDistSecurityModule();

    expect(() =>
      verifyContent(
        "dist/assets/index.js",
        `-----BEGIN ${"PRIVATE"} KEY-----\nsecret\n-----END ${"PRIVATE"} KEY-----`,
      ),
    ).toThrow("forbidden server-only marker");
  });

  it("passes clean nested frontend build artifacts and rejects empty dist", async () => {
    const { collectDistFiles, verifyWebDistSecurity } =
      await loadWebDistSecurityModule();

    await withTempDist(async (dist) => {
      await expect(verifyWebDistSecurity({ dist })).rejects.toThrow(
        "apps/web/dist is empty",
      );

      await mkdir(join(dist, "assets"), { recursive: true });
      await writeFile(join(dist, "index.html"), "<div id=\"app\"></div>");
      await writeFile(join(dist, "assets", "index.js"), "console.log('ok');");

      const files = await collectDistFiles(dist);
      expect(files.some((file) => file.endsWith("index.html"))).toBe(true);
      expect(files.some((file) => file.endsWith("index.js"))).toBe(true);
      await expect(verifyWebDistSecurity({ dist })).resolves.toBe(
        "Web dist security verified",
      );
    });
  });
});
