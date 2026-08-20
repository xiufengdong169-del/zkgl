import { createServer, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

type LocalProxyModule = {
  createLocalApiProxyServer(options?: {
    environment?: NodeJS.ProcessEnv;
  }): ReturnType<typeof createServer>;
};

const servers: Array<ReturnType<typeof createServer>> = [];

async function listen(server: ReturnType<typeof createServer>) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadProxyModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/serve-local-api-proxy.mjs")) as LocalProxyModule;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
  vi.restoreAllMocks();
});

describe("local API proxy script", () => {
  it("verifies the browser bearer token and forwards only the trusted UID to the API", async () => {
    const authRequests: string[] = [];
    const apiRequests: Array<{
      authorization: string | undefined;
      trustedUid: string | undefined;
      body: string;
    }> = [];
    const authAdapterUrl = await listen(
      createServer((request, response) => {
        authRequests.push(String(request.headers.authorization ?? ""));
        response.statusCode = 204;
        response.setHeader("X-ZKGL-CloudBase-UID", "cb-admin-001");
        response.end();
      }),
    );
    const apiUrl = await listen(
      createServer(async (request, response) => {
        apiRequests.push({
          authorization: request.headers.authorization,
          trustedUid: request.headers["x-zkgl-cloudbase-uid"] as string,
          body: await readBody(request),
        });
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ ok: true, data: { id: "session-1" } }));
      }),
    );
    const { createLocalApiProxyServer } = await loadProxyModule();
    const proxyUrl = await listen(
      createLocalApiProxyServer({
        environment: {
          LOCAL_AUTH_ADAPTER_URL: `${authAdapterUrl}/verify`,
          LOCAL_API_TARGET_URL: `${apiUrl}/api`,
        } as NodeJS.ProcessEnv,
      }),
    );

    const response = await fetch(`${proxyUrl}/api`, {
      method: "POST",
      headers: {
        Authorization: "Bearer local-admin-token-0001",
        "Content-Type": "application/json",
        "X-ZKGL-CloudBase-UID": "forged-user",
      },
      body: JSON.stringify({ action: "session.get" }),
    });

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "session-1" },
    });
    expect(authRequests).toEqual(["Bearer local-admin-token-0001"]);
    expect(apiRequests).toEqual([
      {
        authorization: undefined,
        trustedUid: "cb-admin-001",
        body: JSON.stringify({ action: "session.get" }),
      },
    ]);
  });

  it("fails closed when local identity verification fails", async () => {
    const authAdapterUrl = await listen(
      createServer((_request, response) => {
        response.statusCode = 401;
        response.end();
      }),
    );
    const api = vi.fn();
    const apiUrl = await listen(createServer(api));
    const { createLocalApiProxyServer } = await loadProxyModule();
    const proxyUrl = await listen(
      createLocalApiProxyServer({
        environment: {
          LOCAL_AUTH_ADAPTER_URL: `${authAdapterUrl}/verify`,
          LOCAL_API_TARGET_URL: `${apiUrl}/api`,
        } as NodeJS.ProcessEnv,
      }),
    );

    const response = await fetch(`${proxyUrl}/api`, {
      method: "POST",
      headers: { Authorization: "Bearer local-admin-token-0001" },
      body: JSON.stringify({ action: "session.get" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects non-loopback upstream targets", async () => {
    const { createLocalApiProxyServer } = await loadProxyModule();
    const proxyUrl = await listen(
      createLocalApiProxyServer({
        environment: {
          LOCAL_AUTH_ADAPTER_URL: "https://auth.example.com/verify",
          LOCAL_API_TARGET_URL: "http://127.0.0.1:3000/api",
        } as NodeJS.ProcessEnv,
      }),
    );

    const response = await fetch(`${proxyUrl}/api`, {
      method: "POST",
      headers: { Authorization: "Bearer local-admin-token-0001" },
      body: JSON.stringify({ action: "session.get" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_ADAPTER_UNAVAILABLE" },
    });
  });
});
