import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

let activeServer: Server | undefined;

async function listenWithDatabaseQuery(databaseQuery: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock("./database.js", () => ({
    findSessionUserByCloudbaseUid: vi.fn(),
    getPool: () => ({ query: databaseQuery }),
    MySqlAuditWriter: class {},
  }));

  const { createZkglServer } = await import("./server.js");
  activeServer = createZkglServer();
  await new Promise<void>((resolve) =>
    activeServer!.listen(0, "127.0.0.1", resolve),
  );
  const address = activeServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Unexpected server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (activeServer) {
    await new Promise<void>((resolve, reject) =>
      activeServer!.close((error) => (error ? reject(error) : resolve())),
    );
    activeServer = undefined;
  }
  vi.doUnmock("./database.js");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("standalone server readiness", () => {
  it("reports ready when the MySQL pool accepts a simple query", async () => {
    const databaseQuery = vi.fn().mockResolvedValue([[], []]);
    const baseUrl = await listenWithDatabaseQuery(databaseQuery);

    const response = await fetch(`${baseUrl}/readyz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: { database: "ok" },
    });
    expect(databaseQuery).toHaveBeenCalledWith("SELECT 1");
  }, 15_000);

  it("returns 503 when the database readiness query fails", async () => {
    const databaseQuery = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3306"));
    const baseUrl = await listenWithDatabaseQuery(databaseQuery);

    const response = await fetch(`${baseUrl}/readyz`);
    const body = (await response.json()) as {
      error: { message: string };
    };

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      checks: { database: "unavailable" },
      error: { code: "DATABASE_UNAVAILABLE" },
    });
    expect(body.error.message).toContain("ECONNREFUSED");
  }, 15_000);
});
