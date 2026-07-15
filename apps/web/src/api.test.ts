import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudbaseMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("./cloudbase", () => ({
  cloudbaseAuth: {
    getAccessToken: cloudbaseMocks.getAccessToken,
  },
}));

async function loadApi(baseUrl = "https://api.example.com/zkgl") {
  vi.stubEnv("VITE_API_BASE_URL", baseUrl);
  return import("./api");
}

describe("callApi", () => {
  beforeEach(() => {
    vi.resetModules();
    cloudbaseMocks.getAccessToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("携带 CloudBase 访问令牌并提交动作请求体", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "token-1" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { id: "p-1" },
        requestId: "server-request-id",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { callApi } = await loadApi(" https://api.example.com/zkgl ");
    await expect(
      callApi("project.detail", { projectId: "p-1" }),
    ).resolves.toEqual({ id: "p-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/zkgl",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        },
      }),
    );
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      action: "project.detail",
      payload: { projectId: "p-1" },
    });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("未取得登录令牌时不发起请求", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { callApi } = await loadApi();
    await expect(callApi("session.get")).rejects.toThrow("登录状态已失效");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API 地址为空白时立即失败且不读取登录令牌", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { callApi } = await loadApi("   ");
    await expect(callApi("project.detail", { projectId: "p-1" })).rejects.toThrow(
      "缺少 VITE_API_BASE_URL",
    );
    expect(cloudbaseMocks.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("后端返回业务错误时抛出错误消息", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "token-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: false,
          error: { code: "FORBIDDEN", message: "无权执行此操作" },
          requestId: "server-request-id",
        }),
      }),
    );

    const { callApi } = await loadApi();
    await expect(callApi("project.detail", { projectId: "p-2" })).rejects.toThrow(
      "无权执行此操作",
    );
  });

  it("HTTP 错误响应不是 JSON 时返回稳定的状态错误", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "token-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("bad gateway html");
        },
      }),
    );

    const { callApi } = await loadApi();
    await expect(callApi("project.detail", { projectId: "p-2" })).rejects.toThrow(
      "请求失败：502",
    );
  });
});
