import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve, relative } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const scannedRoots = [
  ".env.example",
  "需求评审修订基线_V2.2.md",
  "apps",
  "packages",
  "scripts",
  "database",
  "docs",
  ".github",
  "cloudbaserc.json",
  "package.json",
  "package-lock.json",
  "README.md",
];
const scannedDocxFiles = [
  "众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx",
];
const ignoredPathFragments = [
  "node_modules",
  "apps\\web\\dist",
  "apps/web/dist",
  "functions",
  "scripts\\verify-source-secret-hygiene.mjs",
  "scripts/verify-source-secret-hygiene.mjs",
];
const textFilePattern =
  /\.(?:cjs|css|html|js|json|md|mjs|sql|ts|tsx|vue|yaml|yml)$/i;
const forbiddenPatterns = [
  {
    name: "non-empty database or secret environment assignment",
    pattern:
      /\b(?:DB_PASSWORD|MYSQL_PASSWORD|SECRET_KEY|API_SECRET|PRIVATE_KEY)\s*=\s*["']?[^\s"']+/i,
  },
  {
    name: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "credentialed MySQL connection URL",
    pattern: /mysql:\/\/[^:\s]+:[^@\s]+@/i,
  },
  {
    name: "CloudBase secret assignment",
    pattern: /\bcloudbase[_-]?(?:secret|secretkey)\b\s*[:=]\s*["'][^"']+["']/i,
  },
  {
    name: "AWS access key id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
];

async function collectFiles(entry) {
  const absolute = resolve(root, entry);
  const relativePath = relative(root, absolute);
  if (
    ignoredPathFragments.some((fragment) =>
      relativePath.includes(fragment),
    )
  ) {
    return [];
  }

  const children = await readdir(absolute, { withFileTypes: true }).catch(
    async () => null,
  );
  if (children == null) return textFilePattern.test(absolute) ? [absolute] : [];

  const files = [];
  for (const child of children) {
    files.push(...(await collectFiles(resolve(relativePath, child.name))));
  }
  return files;
}

async function extractDocxDocumentXml(entry) {
  const absolute = resolve(root, entry);
  try {
    const { stdout } = await execFileAsync(
      "tar",
      ["-xOf", absolute, "word/document.xml"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    throw new Error(
      `Source secret hygiene failed: unable to inspect ${entry} word/document.xml`,
      { cause: error },
    );
  }
}

function verifyContent(relativePath, content) {
  for (const { name, pattern } of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(
        `Source secret hygiene failed: ${name} found in ${relativePath}`,
      );
    }
  }
}

const files = [];
for (const entry of scannedRoots) files.push(...(await collectFiles(entry)));

for (const file of files) {
  const relativePath = relative(root, file);
  const content = await readFile(file, "utf8").catch(() => null);
  if (content == null) continue;
  verifyContent(relativePath, content);
}

for (const entry of scannedDocxFiles) {
  verifyContent(`${entry}:word/document.xml`, await extractDocxDocumentXml(entry));
}

console.log("Source secret hygiene verified");
