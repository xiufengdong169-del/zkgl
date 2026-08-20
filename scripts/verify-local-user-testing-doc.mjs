import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Local user testing handoff verification failed: ${message}`);
};

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

export async function verifyLocalUserTestingDoc({ root = defaultRoot } = {}) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [handoffDoc, readme, packageJsonSource] = await Promise.all([
    readText("docs/local-user-testing.md"),
    readText("README.md"),
    readText("package.json"),
  ]);
  const packageJson = JSON.parse(packageJsonSource);

  includesAll(
    handoffDoc,
    [
      "http://127.0.0.1:4173/",
      "npm run demo:local",
      "node scripts/verify-public-demo.mjs http://127.0.0.1:4173/",
      "Stop-Process -Id (Get-Content .tmp\\local-demo-server.pid)",
      "Local demo ready:",
      "Public demo verified:",
      "不连接生产 MySQL",
      "不访问远程服务器",
      "本地 MySQL 8.0",
      "database/init/schema.sql",
      "VITE_API_BASE_URL",
      "http://127.0.0.1:3000/api",
      "VITE_ALLOW_LOCAL_HTTP_API=true",
      "npm run check:local-fullstack",
      "/healthz",
      "/readyz",
    ],
    "docs/local-user-testing.md",
  );

  includesAll(
    readme,
    [
      "docs/local-user-testing.md",
      "本地用户测试交付说明",
      "npm run demo:local",
    ],
    "README.md",
  );

  if (
    packageJson.scripts?.["verify:local-user-testing"] !==
    "node scripts/verify-local-user-testing-doc.mjs"
  ) {
    fail("package.json missing verify:local-user-testing script");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:local-user-testing")) {
    fail("package.json scripts.verify must run verify:local-user-testing");
  }
  if (
    packageJson.scripts?.["check:local-fullstack"] !==
    "node scripts/check-local-fullstack-readiness.mjs"
  ) {
    fail("package.json missing check:local-fullstack script");
  }

  return "Local user testing handoff verified";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyLocalUserTestingDoc());
}
