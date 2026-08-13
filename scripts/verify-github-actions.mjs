import { execFileSync } from "node:child_process";
import { get } from "node:https";
import { pathToFileURL } from "node:url";

export const repositoryPath = "xiufengdong169-del/zkgl";
export const expectedCheckName = "Acceptance verification";

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
          "User-Agent": "zkgl-github-actions-verifier",
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
                `GitHub Actions API request failed ${response.statusCode}: ${body}`,
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

export async function fetchCheckRunsForSha(sha) {
  const url = `https://api.github.com/repos/${repositoryPath}/commits/${sha}/check-runs?check_name=${encodeURIComponent(expectedCheckName)}`;
  const response = await getJson(url);
  return Array.isArray(response?.check_runs) ? response.check_runs : [];
}

export async function fetchCheckRunAnnotations(checkRun) {
  if (!checkRun?.annotations_url) return [];
  const annotations = await getJson(checkRun.annotations_url);
  return Array.isArray(annotations) ? annotations : [];
}

function formatAnnotation(annotation) {
  const location = [
    annotation.path,
    annotation.start_line ? `:${annotation.start_line}` : "",
  ].join("");
  const title = annotation.title ? `${annotation.title}: ` : "";
  return `${location} ${title}${annotation.message}`.trim();
}

export async function verifyGithubActions({
  run = defaultRun,
  fetchCheckRuns = fetchCheckRunsForSha,
  fetchAnnotations = fetchCheckRunAnnotations,
} = {}) {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") throw new Error(`Expected branch main, got ${branch}`);

  const sha = run("git", ["rev-parse", "main"]);
  const checkRuns = await fetchCheckRuns(sha);
  if (!checkRuns.length) {
    throw new Error(`No ${expectedCheckName} GitHub Actions check run found for ${sha}`);
  }

  const checkRun = checkRuns
    .slice()
    .sort((left, right) =>
      String(right.started_at ?? "").localeCompare(String(left.started_at ?? "")),
    )[0];

  if (checkRun.status !== "completed") {
    throw new Error(
      `${expectedCheckName} for ${sha} is ${checkRun.status}; wait for ${checkRun.html_url ?? "GitHub Actions"} to finish`,
    );
  }

  if (checkRun.conclusion !== "success") {
    let annotationText = "";
    try {
      const annotations = await fetchAnnotations(checkRun);
      annotationText = annotations.length
        ? `\nAnnotations:\n${annotations.map(formatAnnotation).join("\n")}`
        : "";
    } catch (error) {
      annotationText = `\nUnable to fetch annotations: ${error instanceof Error ? error.message : String(error)}`;
    }
    throw new Error(
      `${expectedCheckName} for ${sha} concluded ${checkRun.conclusion}: ${checkRun.html_url ?? "no URL"}${annotationText}`,
    );
  }

  return `GitHub Actions verified: ${expectedCheckName} succeeded for ${sha}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await verifyGithubActions());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
