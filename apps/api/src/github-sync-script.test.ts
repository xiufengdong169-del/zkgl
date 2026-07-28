import { describe, expect, it } from "vitest";

type Run = (command: string, args: string[]) => string;
type GithubSyncModule = {
  verifyGithubSync(run?: Run): string;
};

async function loadGithubSyncModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-github-sync.mjs")) as GithubSyncModule;
}

function fakeRun(
  overrides: Partial<Record<string, string>> = {},
  calls: string[] = [],
): Run {
  const responses: Record<string, string> = {
    "git rev-parse --abbrev-ref HEAD": "main",
    "git remote get-url origin": "https://github.com/xiufengdong169-del/zkgl.git",
    "git fetch --quiet origin main": "",
    "git status --short --branch": "## main...origin/main",
    "git rev-parse main": "local-head",
    "git rev-parse origin/main": "local-head",
    ...overrides,
  };

  return (command, args) => {
    const key = [command, ...args].join(" ");
    calls.push(key);
    if (!(key in responses)) throw new Error(`unexpected command: ${key}`);
    return responses[key]!;
  };
}

describe("github sync verifier script", () => {
  it("verifies clean local main matches the configured GitHub origin", async () => {
    const { verifyGithubSync } = await loadGithubSyncModule();
    const calls: string[] = [];

    const message = verifyGithubSync(fakeRun({}, calls));

    expect(message).toContain("GitHub sync verified");
    expect(calls).toEqual([
      "git rev-parse --abbrev-ref HEAD",
      "git remote get-url origin",
      "git fetch --quiet origin main",
      "git status --short --branch",
      "git rev-parse main",
      "git rev-parse origin/main",
    ]);
  });

  it("fails closed for branch, remote, working tree and head mismatches", async () => {
    const { verifyGithubSync } = await loadGithubSyncModule();
    const cases: Array<{
      overrides: Partial<Record<string, string>>;
      message: string;
    }> = [
      {
        overrides: { "git rev-parse --abbrev-ref HEAD": "feature/x" },
        message: "Expected branch main",
      },
      {
        overrides: { "git remote get-url origin": "https://example.com/other.git" },
        message: "Expected origin",
      },
      {
        overrides: {
          "git status --short --branch": "## main...origin/main\n M README.md",
        },
        message: "Working tree is not clean",
      },
      {
        overrides: { "git rev-parse origin/main": "remote-head" },
        message: "does not match origin/main",
      },
    ];

    for (const testCase of cases) {
      expect(() => verifyGithubSync(fakeRun(testCase.overrides))).toThrow(
        testCase.message,
      );
    }
  });
});
