import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EXPORT_TRIGGER_NAME } from "./scheduled-export.js";
import { REMINDER_TRIGGER_NAME } from "./scheduled-reminder.js";

const deploymentDoc = readFileSync(
  new URL("../../../docs/deployment.md", import.meta.url),
  "utf8",
);

describe("deployment documentation", () => {
  it("documents exact CloudBase timer trigger names used by scheduled functions", () => {
    expect(deploymentDoc).toContain(REMINDER_TRIGGER_NAME);
    expect(deploymentDoc).toContain(EXPORT_TRIGGER_NAME);
  });

  it("uses the full verification command before deployment", () => {
    expect(deploymentDoc).toContain("npm run verify");
    expect(deploymentDoc).not.toMatch(
      /npm run typecheck\s+npm run test\s+npm run build\s+npm run build:function/,
    );
  });
});
