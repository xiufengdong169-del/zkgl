import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { actionDefinitions } from "./actions.js";
import { handle } from "./handler.js";

const persistenceSource = readFileSync(
  new URL("./persistence.ts", import.meta.url),
  "utf8",
);

function implementedActionCases() {
  return [
    ...persistenceSource.matchAll(/^\s*case\s+"([^"]+)":/gm),
  ].map((match) => match[1]!);
}

describe("action definition and persistence implementation coverage", () => {
  it("keeps every authorized action backed by exactly one persistence case", () => {
    const definedActions = Object.keys(actionDefinitions).sort();
    const implementedActions = implementedActionCases().sort();

    expect(implementedActions).toEqual(definedActions);
    expect(new Set(implementedActions).size).toBe(implementedActions.length);
  });

  it("does not expose a NOT_IMPLEMENTED fallback in the request handler", () => {
    const handlerSource = readFileSync(new URL("./handler.ts", import.meta.url), "utf8");

    expect(handlerSource).not.toContain("NOT_IMPLEMENTED");
    expect(handlerSource).not.toContain("操作尚未实现");
    expect(handlerSource).toContain("UNKNOWN_ACTION");
  });

  it("keeps persistence dispatch failures internal and non-reflective", () => {
    expect(persistenceSource).not.toContain("ACTION_PERSISTENCE_NOT_IMPLEMENTED");
    expect(persistenceSource).not.toContain("动作尚未接入持久化");
    expect(persistenceSource).toContain("ACTION_DISPATCH_CONFIGURATION_ERROR");
    expect(persistenceSource).toContain("动作分发表配置错误");
  });

  it("rejects actions outside the allowlist before checking arbitrary permission codes", async () => {
    const write = async () => undefined;
    const unsafeAction = "project.detail<script>";
    const result = await handle(
      {
        action: unsafeAction,
        payload: {},
        auth: { uid: "cb-unsafe" },
        requestId: "req-unknown-action",
      },
      {
        audit: { write },
        findUserByCloudbaseUid: async () => ({
          id: "1",
          cloudbaseUid: "cb-unsafe",
          employeeId: "1",
          departmentId: "1",
          enabled: true,
          roleCodes: ["PROJECT_MEMBER"],
          permissionCodes: [unsafeAction],
          sensitiveFieldAccess: {},
          dataScopes: [],
        }),
        execute: async () => ({ ok: true }),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ACTION", message: "未知操作" },
      requestId: "req-unknown-action",
    });
    expect(result.ok ? "" : result.error.message).not.toContain(unsafeAction);
  });
});
