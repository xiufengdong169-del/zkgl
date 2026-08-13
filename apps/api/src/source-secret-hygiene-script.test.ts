import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type SourceSecretHygieneModule = {
  collectFiles(entry: string, root?: string): Promise<string[]>;
  extractDocxDocumentXml(entry: string, root?: string): Promise<string>;
  scannedDocxFiles: string[];
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

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

async function withTempProject<T>(work: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "zkgl-secret-hygiene-"));
  try {
    return await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("source secret hygiene verifier script", () => {
  it("scans every tracked root Word document for embedded secrets", async () => {
    const { scannedDocxFiles } = await loadSourceSecretHygieneModule();
    const trackedRootDocxFiles = execFileSync(
      "git",
      ["-C", repositoryRoot, "-c", "core.quotePath=false", "ls-files", "*.docx"],
      { encoding: "utf8" },
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .sort();

    expect(scannedDocxFiles.sort()).toEqual(trackedRootDocxFiles);
  });

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

  it("extracts Word document XML when tar prefixes entries with ./", async () => {
    const { extractDocxDocumentXml } = await loadSourceSecretHygieneModule();

    await withTempProject(async (root) => {
      await mkdir(join(root, "word"), { recursive: true });
      await writeFile(join(root, "word", "document.xml"), "<w:document>ok</w:document>");
      execFileSync("tar", ["-cf", "sample.docx", "./word/document.xml"], {
        cwd: root,
        stdio: "ignore",
      });

      await expect(extractDocxDocumentXml("sample.docx", root)).resolves.toContain(
        "<w:document>ok</w:document>",
      );
    });
  });

  it("falls back to direct content scanning for legacy non-zip docx artifacts", async () => {
    const { extractDocxDocumentXml, verifySourceSecretHygiene } =
      await loadSourceSecretHygieneModule();

    await withTempProject(async (root) => {
      await writeFile(join(root, "legacy.docx"), "legacy text without secrets");

      await expect(extractDocxDocumentXml("legacy.docx", root)).resolves.toContain(
        "legacy text without secrets",
      );
      await expect(
        verifySourceSecretHygiene({
          root,
          roots: [],
          docxFiles: ["legacy.docx"],
        }),
      ).resolves.toBe("Source secret hygiene verified");
    });
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
