import { describe, expect, it } from "vitest";

import { assertAffectedRows } from "./database.js";

describe("database integration helpers", () => {
  it("乐观更新必须且只能影响一行", () => {
    expect(() => assertAffectedRows(1, "冲突")).not.toThrow();
    expect(() => assertAffectedRows(0, "冲突")).toThrow("冲突");
  });
});
