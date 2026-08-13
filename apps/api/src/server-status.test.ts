import { describe, expect, it } from "vitest";

import { errorStatus } from "./server.js";

describe("standalone server API error status mapping", () => {
  it("maps unknown actions to a client error instead of a not-implemented response", () => {
    expect(errorStatus("UNKNOWN_ACTION")).toBe(400);
    expect(errorStatus("NOT_IMPLEMENTED")).toBe(400);
  });

  it("keeps authentication, authorization, conflict, and infrastructure statuses explicit", () => {
    expect(errorStatus("UNAUTHORIZED")).toBe(401);
    expect(errorStatus("FORBIDDEN")).toBe(403);
    expect(errorStatus("PROJECT_NOT_FOUND")).toBe(404);
    expect(errorStatus("EXPORT_FILE_EXPIRED")).toBe(410);
    expect(errorStatus("CONCURRENT_WRITE_CONFLICT")).toBe(409);
    expect(errorStatus("CONFIGURATION_ERROR")).toBe(500);
  });
});
