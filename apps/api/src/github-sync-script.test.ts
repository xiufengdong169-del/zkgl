import { describe, expect, it } from "vitest";

type Run = (command: string, args: string[]) => string;
type GithubSyncModule = {
  verifyGithubSync(
    run?: Run,
    fetchRemoteMain?: () => Promise<{ sha: string; tree: string }>,
  ): Promise<string>;
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

    const message = await verifyGithubSync(fakeRun({}, calls));

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

  it("Git fetch 不可用但本地树与远端 main 树一致时使用 GitHub API 兜底校验", async () => {
    const { verifyGithubSync } = await loadGithubSyncModule();
    const calls: string[] = [];
    const run: Run = (command, args) => {
      const key = [command, ...args].join(" ");
      calls.push(key);
      if (key === "git fetch --quiet origin main")
        throw new Error("Failed to connect to github.com port 443");
      const responses: Record<string, string> = {
        "git rev-parse --abbrev-ref HEAD": "main",
        "git remote get-url origin": "https://github.com/xiufengdong169-del/zkgl.git",
        "git status --porcelain": "",
        "git rev-parse main": "local-head",
        "git show -s --format=%T main": "tree-1",
      };
      if (!(key in responses)) throw new Error(`unexpected command: ${key}`);
      return responses[key]!;
    };

    const message = await verifyGithubSync(run, async () => ({
      sha: "remote-head",
      tree: "tree-1",
    }));

    expect(message).toContain("GitHub sync verified via API fallback");
    expect(calls).toContain("git fetch --quiet origin main");
    expect(calls).toContain("git status --porcelain");
    expect(calls).toContain("git show -s --format=%T main");
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
          "git status --porcelain": " M README.md",
        },
        message: "Working tree is not clean",
      },
      {
        overrides: {
          "git rev-parse origin/main": "remote-head",
          "git status --porcelain": "",
          "git show -s --format=%T main": "local-tree",
        },
        message: "does not match remote main",
      },
    ];

    for (const testCase of cases) {
      await expect(
        verifyGithubSync(fakeRun(testCase.overrides), async () => ({
          sha: "remote-head",
          tree: "remote-tree",
        })),
      ).rejects.toThrow(testCase.message);
    }
  });
});
