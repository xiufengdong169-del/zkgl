import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/web/dist");

const forbiddenPatterns = [
  /\bDB_HOST\b/,
  /\bDB_PORT\b/,
  /\bDB_NAME\b/,
  /\bDB_USER\b/,
  /\bDB_PASSWORD\b/,
  /\bMYSQL_(?:HOST|PORT|DATABASE|USER|PASSWORD)\b/,
  /\bSecretKey\b/,
  /\bSECRET_KEY\b/,
  /\bAPI_SECRET\b/,
  /\bPRIVATE_KEY\b/,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
];

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

for (const file of files) {
  const content = await readFile(file, "utf8").catch(() => null);
  if (content == null) continue;
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(
        `Web dist verification failed: forbidden server-only marker ${pattern} found in ${file}`,
      );
    }
  }
}

console.log("Web dist security verified");
