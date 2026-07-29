import { describe, expect, it } from "vitest";

import { resolveLoginRedirectTarget } from "./login-redirect";

describe("login redirect target", () => {
  it("keeps authenticated users on the originally requested internal route", () => {
    expect(resolveLoginRedirectTarget("/projects?tab=active#detail")).toBe(
      "/projects?tab=active#detail",
    );
  });

  it("falls back to the workspace home for external or invalid redirects", () => {
    for (const redirect of [
      undefined,
      "",
      "https://evil.example/projects",
      "//evil.example/projects",
      "javascript:alert(1)",
      ["https://evil.example"],
    ]) {
      expect(resolveLoginRedirectTarget(redirect)).toBe("/");
    }
  });
});
