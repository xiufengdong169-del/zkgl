import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const expectedRemote = "https://github.com/xiufengdong169-del/zkgl.git";

function defaultRun(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function verifyGithubSync(run = defaultRun) {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") throw new Error(`Expected branch main, got ${branch}`);

  const remoteUrl = run("git", ["remote", "get-url", "origin"]);
  const normalizedRemote = remoteUrl.endsWith(".git")
    ? remoteUrl
    : `${remoteUrl}.git`;
  if (normalizedRemote !== expectedRemote)
    throw new Error(`Expected origin ${expectedRemote}, got ${remoteUrl}`);

  run("git", ["fetch", "--quiet", "origin", "main"]);

  const status = run("git", ["status", "--short", "--branch"]);
  const statusLines = status.split(/\r?\n/).filter(Boolean);
  if (statusLines[0] !== "## main...origin/main")
    throw new Error(
      `Expected main to track origin/main without ahead/behind, got: ${statusLines[0]}`,
    );
  if (statusLines.length > 1)
    throw new Error(
      `Working tree is not clean:\n${statusLines.slice(1).join("\n")}`,
    );

  const localHead = run("git", ["rev-parse", "main"]);
  const remoteHead = run("git", ["rev-parse", "origin/main"]);
  if (localHead !== remoteHead)
    throw new Error(`main ${localHead} does not match origin/main ${remoteHead}`);

  return `GitHub sync verified: main ${localHead} matches origin/main`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(verifyGithubSync());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
