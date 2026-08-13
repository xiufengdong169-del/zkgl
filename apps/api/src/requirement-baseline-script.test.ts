import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

type RequirementBaselineModule = {
  currentMarkdownBaseline: string;
  currentWordBaseline: string;
  extractAcceptanceCaseCodes(source: string): string[];
  extractDocxDocumentXml(relativePath: string, root?: string): Promise<string>;
  extractDocxVisibleText(documentXml: string): string;
  verifyRequirementBaseline(options?: {
    root?: string;
    readText?: (relativePath: string, root?: string) => Promise<string>;
    extractDocx?: (relativePath: string, root?: string) => Promise<string>;
  }): Promise<string>;
};

async function loadRequirementBaselineModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-requirement-baseline.mjs")) as RequirementBaselineModule;
}

const acceptanceCodes = Array.from(
  { length: 15 },
  (_, index) => `AC-${String(index + 1).padStart(2, "0")}`,
);

const markdownBaseline = [
  "完整的新建系统",
  "无历史数据迁移",
  "prj_*",
  "con_*",
  "腾讯云轻量应用服务器生产环境",
  "腾讯云轻量应用服务器技术路线",
  "193.112.79.220",
  "Ubuntu 24.04",
  "服务器本机 MySQL 8.0",
  "Nginx",
  "systemd",
  "CloudBase 仅作为身份认证与 UID 来源",
  ...acceptanceCodes,
].join("\n");

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const wordBaselineXml = [
  "腾讯云轻量服务器版",
  "腾讯云轻量应用服务器",
  "193.112.79.220",
  "MySQL 8.0",
  "无历史数据迁移",
  "初始化建表脚本",
  "prj_*",
  "con_*",
].join("\n");

function readTextFor(relativePath: string) {
  if (relativePath === "需求评审修订基线_V2.2.md") return markdownBaseline;
  if (relativePath === "README.md") {
    return [
      "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
      "众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx",
      "历史 Word 版原件，仅供追溯旧部署口径",
    ].join("\n");
  }
  if (relativePath === "docs/final-acceptance-checklist.md") {
    return [
      "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
      "仅作为历史原件追溯",
    ].join("\n");
  }
  if (relativePath === "docs/acceptance-traceability.md") {
    return acceptanceCodes.join("\n");
  }
  throw new Error(`unexpected text read: ${relativePath}`);
}

describe("requirement baseline verifier script", () => {
  it("extracts unique AC case codes in source order", async () => {
    const { extractAcceptanceCaseCodes } = await loadRequirementBaselineModule();

    expect(extractAcceptanceCaseCodes("AC-01 AC-02 AC-01 AC-15")).toEqual([
      "AC-01",
      "AC-02",
      "AC-15",
    ]);
  });

  it("extracts visible text from split Word text runs and XML entities", async () => {
    const { extractDocxVisibleText } = await loadRequirementBaselineModule();

    expect(
      extractDocxVisibleText(
        "<w:document><w:t>Tencent </w:t><w:t>Cloud</w:t><w:t> &amp; MySQL</w:t></w:document>",
      ),
    ).toBe("Tencent Cloud & MySQL");
    expect(extractDocxVisibleText("plain fallback text")).toBe(
      "plain fallback text",
    );
  });

  it("extracts Word document XML when archive entries are prefixed with ./", async () => {
    const { extractDocxDocumentXml } = await loadRequirementBaselineModule();
    const root = await mkdtemp(join(tmpdir(), "zkgl-docx-"));
    tempDirs.push(root);
    await mkdir(join(root, "word"));
    await writeFile(
      join(root, "word", "document.xml"),
      "<w:document>ok</w:document>",
      "utf8",
    );
    execFileSync("tar", ["-cf", "sample.docx", "./word/document.xml"], {
      cwd: root,
      stdio: "ignore",
    });

    const xml = await extractDocxDocumentXml("sample.docx", root);

    expect(xml).toContain("<w:document>ok</w:document>");
  });

  it("verifies the current Markdown and Word requirement baselines are aligned", async () => {
    const { verifyRequirementBaseline } = await loadRequirementBaselineModule();

    await expect(
      verifyRequirementBaseline({
        readText: async (relativePath) => readTextFor(relativePath),
        extractDocx: async () => wordBaselineXml,
      }),
    ).resolves.toBe("Requirement baseline verified");
  });

  it("rejects Word baselines that still carry the old CloudBase deployment wording", async () => {
    const { currentWordBaseline, verifyRequirementBaseline } =
      await loadRequirementBaselineModule();

    await expect(
      verifyRequirementBaseline({
        readText: async (relativePath) => readTextFor(relativePath),
        extractDocx: async () =>
          `${wordBaselineXml}\nCloudBase 部署版\ncloudbase-d7gc2b32cd4196059`,
      }),
    ).rejects.toThrow(`${currentWordBaseline} still contains CloudBase 部署版`);
  });

  it("rejects traceability documents that omit V2.2 AC cases", async () => {
    const { verifyRequirementBaseline } = await loadRequirementBaselineModule();

    await expect(
      verifyRequirementBaseline({
        readText: async (relativePath) =>
          relativePath === "docs/acceptance-traceability.md"
            ? "AC-01\nAC-02"
            : readTextFor(relativePath),
        extractDocx: async () => wordBaselineXml,
      }),
    ).rejects.toThrow("docs/acceptance-traceability.md does not cover AC-01 through AC-15");
  });

  it("rejects Markdown baselines that still use the old CloudBase performance resource wording", async () => {
    const { currentMarkdownBaseline, verifyRequirementBaseline } =
      await loadRequirementBaselineModule();

    await expect(
      verifyRequirementBaseline({
        readText: async (relativePath) =>
          relativePath === currentMarkdownBaseline
            ? `${markdownBaseline}\n生产级 CloudBase 资源`
            : readTextFor(relativePath),
        extractDocx: async () => wordBaselineXml,
      }),
    ).rejects.toThrow(`${currentMarkdownBaseline} still contains 生产级 CloudBase 资源`);
  });

  it("rejects Markdown baselines that still describe CloudBase as the primary deployment architecture", async () => {
    const { currentMarkdownBaseline, verifyRequirementBaseline } =
      await loadRequirementBaselineModule();

    await expect(
      verifyRequirementBaseline({
        readText: async (relativePath) =>
          relativePath === currentMarkdownBaseline
            ? `${markdownBaseline}\nCloudBase MySQL\nCloudBase 技术路线`
            : readTextFor(relativePath),
        extractDocx: async () => wordBaselineXml,
      }),
    ).rejects.toThrow(`${currentMarkdownBaseline} still contains CloudBase MySQL`);
  });
});
