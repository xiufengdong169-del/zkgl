import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

type SourceSecretHygieneModule = {
  collectFiles(entry: string, root?: string): Promise<string[]>;
  verifyContent(relativePath: string, content: string): void;
  verifySourceSecretHygiene(options?: {
    root?: string;
    roots?: string[];
    docxFiles?: string[];
    extractDocx?: (entry: string, root?: string) => Promise<string>;
  }): Promise<string>;
};

async function loadSourceSecretHygieneModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-source-secret-hygiene.mjs")) as SourceSecretHygieneModule;
}

async function withTempProject<T>(work: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "zkgl-secret-hygiene-"));
  try {
    return await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("source secret hygiene verifier script", () => {
  it("rejects forbidden secrets in regular source text", async () => {
    const { verifyContent } = await loadSourceSecretHygieneModule();

    expect(() =>
      verifyContent("apps/api/.env", `DB_${"PASSWORD"}=real-production-password`),
    ).toThrow("non-empty database or secret environment assignment");
  });

  it("rejects forbidden secrets extracted from Word requirement baselines", async () => {
    const { verifySourceSecretHygiene } = await loadSourceSecretHygieneModule();

    await expect(
      verifySourceSecretHygiene({
        roots: [],
        docxFiles: ["requirements.docx"],
        extractDocx: async () =>
          `<w:document><w:t>cloudbase${"Secret"}Key: "real-secret"</w:t></w:document>`,
      }),
    ).rejects.toThrow("requirements.docx:word/document.xml");
  });

  it("ignores generated package directories while scanning source roots", async () => {
    const { collectFiles, verifySourceSecretHygiene } =
      await loadSourceSecretHygieneModule();

    await withTempProject(async (root) => {
      await mkdir(join(root, "apps", "api"), { recursive: true });
      await mkdir(join(root, "functions", "zkgl-api"), { recursive: true });
      await writeFile(join(root, "apps", "api", "safe.ts"), "export const ok = true;");
      await writeFile(
        join(root, "functions", "zkgl-api", "generated.js"),
        `DB_${"PASSWORD"}=packaged-placeholder`,
      );

      const files = await collectFiles("apps", root);
      expect(files.some((file) => file.endsWith("safe.ts"))).toBe(true);
      expect(files.some((file) => file.includes("functions"))).toBe(false);

      await expect(
        verifySourceSecretHygiene({
          root,
          roots: ["apps", "functions"],
          docxFiles: [],
        }),
      ).resolves.toBe("Source secret hygiene verified");
    });
  });
});
