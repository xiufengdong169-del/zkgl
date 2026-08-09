import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAuthAdapterServer,
  extractBearerAccessToken,
  normalizeVerifiedUid,
} from "./auth-adapter.js";
import { trustedUidHeader } from "./server-auth.js";

const servers: Array<{ close: (callback: () => void) => void }> = [];

async function listenWithVerifier(
  verifier: Parameters<typeof createAuthAdapterServer>[0],
) {
  const server = createAuthAdapterServer(verifier);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("auth adapter", () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
  });

  it("extracts only well-formed bearer access tokens", () => {
    expect(
      extractBearerAccessToken({ authorization: "Bearer abcdefghijklmnop" }),
    ).toBe("abcdefghijklmnop");
    expect(extractBearerAccessToken({ authorization: "Basic token" })).toBeNull();
    expect(extractBearerAccessToken({ authorization: "Bearer short" })).toBeNull();
    expect(
      extractBearerAccessToken({
        authorization: "Bearer abc defghijklmnop",
      }),
    ).toBeNull();
  });

  it("normalizes only safe verified CloudBase UIDs", () => {
    expect(normalizeVerifiedUid({ uid: " cloudbase:user_123 " })).toBe(
      "cloudbase:user_123",
    );
    expect(normalizeVerifiedUid("cloudbase-user-456")).toBe(
      "cloudbase-user-456",
    );
    expect(() => normalizeVerifiedUid("../bad")).toThrow("Invalid verified UID");
  });

  it("returns the trusted identity header after successful token verification", async () => {
    const baseUrl = await listenWithVerifier(async (token) => {
      expect(token).toBe("valid-access-token-123");
      return { uid: "cloudbase:user_123" };
    });

    const response = await fetch(`${baseUrl}/verify`, {
      headers: { Authorization: "Bearer valid-access-token-123" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get(trustedUidHeader)).toBe("cloudbase:user_123");
  });

  it("fails closed when authorization is missing or verification rejects", async () => {
    const baseUrl = await listenWithVerifier(async () => {
      throw new Error("token rejected");
    });

    await expect(fetch(`${baseUrl}/verify`)).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      fetch(`${baseUrl}/verify`, {
        headers: { Authorization: "Bearer invalid-access-token" },
      }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("keeps a health endpoint separate from the Nginx auth subrequest", async () => {
    const baseUrl = await listenWithVerifier(async () => "cloudbase:user_123");

    await expect(fetch(`${baseUrl}/healthz`)).resolves.toMatchObject({
      status: 200,
    });
    await expect(fetch(`${baseUrl}/missing`)).resolves.toMatchObject({
      status: 404,
    });
  });
});
