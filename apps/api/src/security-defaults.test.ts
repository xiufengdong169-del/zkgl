import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { actionDefinitions } from "./actions.js";

const architectureDoc = readFileSync(
  new URL("../../../docs/architecture.md", import.meta.url),
  "utf8",
);
const deploymentDoc = readFileSync(
  new URL("../../../docs/deployment.md", import.meta.url),
  "utf8",
);
const finalAcceptanceChecklist = readFileSync(
  new URL("../../../docs/final-acceptance-checklist.md", import.meta.url),
  "utf8",
);

describe("security defaults", () => {
  it("默认不暴露邮箱验证码找回密码类业务接口", () => {
    const actionNames = Object.keys(actionDefinitions);
    expect(actionNames).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/password|reset|verification|captcha|otp|code/i),
      ]),
    );
  });

  it("文档明确邮箱验证码找回密码能力默认关闭", () => {
    for (const doc of [architectureDoc, deploymentDoc, finalAcceptanceChecklist]) {
      expect(doc).toContain("邮箱验证码找回密码默认关闭");
      expect(doc).toContain("本期不暴露找回密码业务接口");
    }
  });
});
