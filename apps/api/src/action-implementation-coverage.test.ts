import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { actionDefinitions } from "./actions.js";

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
});
