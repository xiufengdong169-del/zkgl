import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(import.meta.dirname, "..");

export const currentMarkdownBaseline = "需求评审修订基线_V2.2.md";
export const currentWordBaseline =
  "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx";
export const legacyCloudBaseWordBaseline =
  "众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx";

const expectedAcceptanceCodes = Array.from(
  { length: 15 },
  (_, index) => `AC-${String(index + 1).padStart(2, "0")}`,
);

const fail = (message) => {
  throw new Error(`Requirement baseline verification failed: ${message}`);
};

export async function readTextFile(relativePath, root = defaultRoot) {
  return readFile(resolve(root, relativePath), "utf8");
}

export async function extractDocxDocumentXml(relativePath, root = defaultRoot) {
  try {
    const { stdout } = await execFileAsync(
      "tar",
      ["-xOf", resolve(root, relativePath), "word/document.xml"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    throw new Error(`Unable to inspect ${relativePath}:word/document.xml`, {
      cause: error,
    });
  }
}

export function extractAcceptanceCaseCodes(source) {
  return [...new Set([...source.matchAll(/\bAC-\d{2}\b/g)].map((match) => match[0]))];
}

function assertContains(source, fragment, label) {
  if (!source.includes(fragment)) fail(`${label} missing ${fragment}`);
}

function assertNotContains(source, fragment, label) {
  if (source.includes(fragment)) fail(`${label} still contains ${fragment}`);
}

export async function verifyRequirementBaseline({
  root = defaultRoot,
  readText = readTextFile,
  extractDocx = extractDocxDocumentXml,
} = {}) {
  const [
    markdownBaseline,
    wordBaselineXml,
    readme,
    finalChecklist,
    acceptanceTraceability,
  ] = await Promise.all([
    readText(currentMarkdownBaseline, root),
    extractDocx(currentWordBaseline, root),
    readText("README.md", root),
    readText("docs/final-acceptance-checklist.md", root),
    readText("docs/acceptance-traceability.md", root),
  ]);

  for (const fragment of [
    "完整的新建系统",
    "无历史数据迁移",
    "prj_*",
    "con_*",
    "AC-01",
    "AC-15",
  ]) {
    assertContains(markdownBaseline, fragment, currentMarkdownBaseline);
  }

  for (const fragment of [
    "腾讯云轻量服务器版",
    "腾讯云轻量应用服务器",
    "193.112.79.220",
    "MySQL 8.0",
    "无历史数据迁移",
    "初始化建表脚本",
    "prj_*",
    "con_*",
  ]) {
    assertContains(wordBaselineXml, fragment, currentWordBaseline);
  }

  for (const fragment of [
    "CloudBase 部署版",
    "cloudbase-d7gc2b32cd4196059",
    "CloudBase 技术路线",
  ]) {
    assertNotContains(wordBaselineXml, fragment, currentWordBaseline);
  }

  assertContains(readme, currentWordBaseline, "README.md");
  assertContains(readme, legacyCloudBaseWordBaseline, "README.md");
  assertContains(readme, "历史 Word 版原件，仅供追溯旧部署口径", "README.md");
  assertContains(finalChecklist, currentWordBaseline, "final acceptance checklist");
  assertContains(finalChecklist, "仅作为历史原件追溯", "final acceptance checklist");

  const markdownCodes = extractAcceptanceCaseCodes(markdownBaseline);
  const traceabilityCodes = extractAcceptanceCaseCodes(acceptanceTraceability);
  if (expectedAcceptanceCodes.some((code) => !markdownCodes.includes(code))) {
    fail(`${currentMarkdownBaseline} does not cover AC-01 through AC-15`);
  }
  if (expectedAcceptanceCodes.some((code) => !traceabilityCodes.includes(code))) {
    fail("docs/acceptance-traceability.md does not cover AC-01 through AC-15");
  }

  return "Requirement baseline verified";
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  console.log(await verifyRequirementBaseline());
}
