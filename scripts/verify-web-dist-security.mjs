import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const defaultDist = resolve(root, "apps/web/dist");

export const forbiddenPatterns = [
  /\bDEPLOY_TARGET_HOST\b/,
  /\bDEPLOY_TARGET_REGION\b/,
  /\bDEPLOY_TARGET_OS\b/,
  /\bDEPLOY_TARGET_MYSQL\b/,
  /\bAPI_HOST\b/,
  /\bAPI_PORT\b/,
  /\bAPI_ALLOWED_ORIGINS\b/,
  /\bAUTH_TRUSTED_PROXY\b/,
  /\bDB_HOST\b/,
  /\bDB_PORT\b/,
  /\bDB_NAME\b/,
  /\bDB_USER\b/,
  /\bDB_PASSWORD\b/,
  /\bCLOUDBASE_ENV_ID\b/,
  /\bMYSQL_(?:HOST|PORT|DATABASE|USER|PASSWORD)\b/,
  /\bSecretKey\b/,
  /\bSECRET_KEY\b/,
  /\bAPI_SECRET\b/,
  /\bPRIVATE_KEY\b/,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
];

export async function collectDistFiles(dist = defaultDist) {
  if (!existsSync(dist)) {
    throw new Error("Web dist verification failed: apps/web/dist is missing");
  }

  const files = [];
  for await (const file of glob("**/*", { cwd: dist, withFileTypes: true })) {
    if (file.isFile()) files.push(resolve(file.parentPath, file.name));
  }

  if (!files.length) {
    throw new Error("Web dist verification failed: apps/web/dist is empty");
  }

  return files;
}

export function verifyContent(file, content) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(
        `Web dist verification failed: forbidden server-only marker ${pattern} found in ${file}`,
      );
    }
  }
}

export async function verifyWebDistSecurity({ dist = defaultDist } = {}) {
  const files = await collectDistFiles(dist);

  for (const file of files) {
    const content = await readFile(file, "utf8").catch(() => null);
    if (content == null) continue;
    verifyContent(file, content);
  }

  return "Web dist security verified";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyWebDistSecurity());
}
