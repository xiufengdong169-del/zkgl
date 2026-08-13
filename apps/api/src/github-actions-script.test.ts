import { describe, expect, it } from "vitest";

type Run = (command: string, args: string[]) => string;
type GithubActionsModule = {
  expectedCheckName: string;
  verifyGithubActions(options?: {
    run?: Run;
    fetchCheckRuns?: (sha: string) => Promise<Array<Record<string, unknown>>>;
    fetchAnnotations?: (
      checkRun: Record<string, unknown>,
    ) => Promise<Array<Record<string, unknown>>>;
  }): Promise<string>;
};

async function loadGithubActionsModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-github-actions.mjs")) as GithubActionsModule;
}

function fakeRun(overrides: Partial<Record<string, string>> = {}): Run {
  const responses: Record<string, string> = {
    "git rev-parse --abbrev-ref HEAD": "main",
    "git rev-parse main": "head-sha",
    ...overrides,
  };
  return (command, args) => {
    const key = [command, ...args].join(" ");
    if (!(key in responses)) throw new Error(`unexpected command: ${key}`);
    return responses[key]!;
  };
}

describe("github actions verifier script", () => {
  it("accepts a successful latest acceptance check for local main", async () => {
    const { verifyGithubActions } = await loadGithubActionsModule();

    await expect(
      verifyGithubActions({
        run: fakeRun(),
        fetchCheckRuns: async (sha) => [
          {
            name: "Acceptance verification",
            status: "completed",
            conclusion: "success",
            started_at: "2026-08-14T01:00:00Z",
            html_url: `https://github.test/actions/${sha}`,
          },
        ],
      }),
    ).resolves.toBe(
      "GitHub Actions verified: Acceptance verification succeeded for head-sha",
    );
  });

  it("fails with annotations when the acceptance check fails", async () => {
    const { verifyGithubActions } = await loadGithubActionsModule();

    await expect(
      verifyGithubActions({
        run: fakeRun(),
        fetchCheckRuns: async () => [
          {
            name: "Acceptance verification",
            status: "completed",
            conclusion: "failure",
            html_url: "https://github.test/actions/failing",
            annotations_url: "https://api.github.test/annotations",
          },
        ],
        fetchAnnotations: async () => [
          {
            path: "apps/api/src/local-demo-script.test.ts",
            start_line: 99,
            title: "local demo verifier script",
            message: "expected portable path",
          },
        ],
      }),
    ).rejects.toThrow(
      "apps/api/src/local-demo-script.test.ts:99 local demo verifier script: expected portable path",
    );
  });

  it("fails closed while GitHub Actions is still running or absent", async () => {
    const { verifyGithubActions } = await loadGithubActionsModule();

    await expect(
      verifyGithubActions({
        run: fakeRun(),
        fetchCheckRuns: async () => [
          { status: "in_progress", conclusion: null, html_url: "https://github.test/run" },
        ],
      }),
    ).rejects.toThrow("is in_progress");

    await expect(
      verifyGithubActions({
        run: fakeRun(),
        fetchCheckRuns: async () => [],
      }),
    ).rejects.toThrow("No Acceptance verification GitHub Actions check run found");
  });

  it("requires the local main branch", async () => {
    const { verifyGithubActions } = await loadGithubActionsModule();

    await expect(
      verifyGithubActions({
        run: fakeRun({ "git rev-parse --abbrev-ref HEAD": "feature/demo" }),
        fetchCheckRuns: async () => [],
      }),
    ).rejects.toThrow("Expected branch main");
  });
});
