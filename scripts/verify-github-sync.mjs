import { execFileSync } from "node:child_process";

const expectedRemote = "https://github.com/xiufengdong169-del/zkgl.git";

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`Expected branch main, got ${branch}`);

const remoteUrl = run("git", ["remote", "get-url", "origin"]);
const normalizedRemote = remoteUrl.endsWith(".git") ? remoteUrl : `${remoteUrl}.git`;
if (normalizedRemote !== expectedRemote)
  fail(`Expected origin ${expectedRemote}, got ${remoteUrl}`);

run("git", ["fetch", "--quiet", "origin", "main"]);

const status = run("git", ["status", "--short", "--branch"]);
const statusLines = status.split(/\r?\n/).filter(Boolean);
if (statusLines[0] !== "## main...origin/main")
  fail(`Expected main to track origin/main without ahead/behind, got: ${statusLines[0]}`);
if (statusLines.length > 1)
  fail(`Working tree is not clean:\n${statusLines.slice(1).join("\n")}`);

const localHead = run("git", ["rev-parse", "main"]);
const remoteHead = run("git", ["rev-parse", "origin/main"]);
if (localHead !== remoteHead)
  fail(`main ${localHead} does not match origin/main ${remoteHead}`);

console.log(`GitHub sync verified: main ${localHead} matches origin/main`);
