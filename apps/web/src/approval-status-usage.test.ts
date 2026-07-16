/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const viewDirectory = fileURLToPath(new URL("./views/", import.meta.url));

const fullApprovalSubmitStatusArray =
  /\[\s*["']DRAFT["']\s*,\s*["']RETURNED["']\s*,\s*["']REJECTED["']\s*,\s*["']WITHDRAWN["']\s*\]/;
const leadOnlySubmitStatusArray =
  /\[\s*["']DRAFT["']\s*,\s*["']RETURNED["']\s*\]/;

function readViewSources() {
  return readdirSync(viewDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".vue"))
    .map((entry) => ({
      name: entry.name,
      source: readFileSync(join(viewDirectory, entry.name), "utf8"),
    }));
}

describe("approval submit status usage", () => {
  it("keeps reusable approval submit status checks centralized outside views", () => {
    const hardcodedViewNames = readViewSources()
      .filter(({ source }) => fullApprovalSubmitStatusArray.test(source))
      .map(({ name }) => name);

    expect(hardcodedViewNames).toEqual([]);
  });

  it("keeps the lead-only submit status exception isolated to the lead view", () => {
    const leadOnlyViewNames = readViewSources()
      .filter(({ source }) => leadOnlySubmitStatusArray.test(source))
      .map(({ name }) => name);

    expect(leadOnlyViewNames).toEqual(["LeadsView.vue"]);
  });
});
