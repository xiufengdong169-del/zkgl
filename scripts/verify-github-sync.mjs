import { execFileSync } from "node:child_process";
import { get } from "node:https";
import { pathToFileURL } from "node:url";

export const expectedRemote = "https://github.com/xiufengdong169-del/zkgl.git";
const repositoryPath = "xiufengdong169-del/zkgl";

function defaultRun(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "zkgl-github-sync-verifier",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode >= 400) {
            reject(
              new Error(
                `GitHub API request failed ${response.statusCode}: ${body}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

export async function fetchRemoteMainViaApi() {
  const ref = await getJson(
    `https://api.github.com/repos/${repositoryPath}/git/ref/heads/main`,
  );
  const sha = ref?.object?.sha;
  if (typeof sha !== "string" || !sha) {
    throw new Error("GitHub API response missing main commit sha");
  }
  const commit = await getJson(
    `https://api.github.com/repos/${repositoryPath}/git/commits/${sha}`,
  );
  const tree = commit?.tree?.sha;
  if (typeof tree !== "string" || !tree) {
    throw new Error("GitHub API response missing main tree sha");
  }
  return { sha, tree };
}

export async function verifyGithubSync(
  run = defaultRun,
  fetchRemoteMain = fetchRemoteMainViaApi,
) {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") throw new Error(`Expected branch main, got ${branch}`);

  const remoteUrl = run("git", ["remote", "get-url", "origin"]);
  const normalizedRemote = remoteUrl.endsWith(".git")
    ? remoteUrl
    : `${remoteUrl}.git`;
  if (normalizedRemote !== expectedRemote)
    throw new Error(`Expected origin ${expectedRemote}, got ${remoteUrl}`);

  try {
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
  } catch (error) {
    const porcelain = run("git", ["status", "--porcelain"]);
    if (porcelain) throw new Error(`Working tree is not clean:\n${porcelain}`);

    const localHead = run("git", ["rev-parse", "main"]);
    const localTree = run("git", ["show", "-s", "--format=%T", "main"]);
    const remote = await fetchRemoteMain();
    if (localTree !== remote.tree) {
      throw new Error(
        `main ${localHead} tree ${localTree} does not match remote main ${remote.sha} tree ${remote.tree}`,
        { cause: error },
      );
    }

    return `GitHub sync verified via API fallback: local main tree ${localTree} matches remote main ${remote.sha}`;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await verifyGithubSync());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
