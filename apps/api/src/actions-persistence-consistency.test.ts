import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const extractActionDefinitions = (source: string) =>
  Array.from(source.matchAll(/"([^"]+)"\s*:/g), (match) => match[1])
    .filter((name): name is string => Boolean(name && name.includes(".")))
    .sort();

const extractPersistenceCases = (source: string) =>
  Array.from(source.matchAll(/case "([^"]+)"/g), (match) => match[1])
    .filter((name): name is string => Boolean(name && name.includes(".")))
    .sort();

const unique = (values: string[]) => Array.from(new Set(values));

describe("action persistence consistency", () => {
  it("所有动作定义都有持久化实现，且持久化动作均经过定义层授权校验", () => {
    expect(fileURLToPath(import.meta.url)).toContain(
      "actions-persistence-consistency.test",
    );

    const defined = unique(extractActionDefinitions(readSource("actions.ts")));
    const implemented = unique(
      extractPersistenceCases(readSource("persistence.ts")),
    );

    expect(defined.length).toBeGreaterThan(0);
    expect(implemented.length).toBeGreaterThan(0);
    expect(defined).toHaveLength(implemented.length);
    expect(defined.filter((action) => !implemented.includes(action))).toEqual(
      [],
    );
    expect(implemented.filter((action) => !defined.includes(action))).toEqual(
      [],
    );
  });
});
