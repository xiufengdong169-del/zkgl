import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudbaseMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("./cloudbase", () => ({
  cloudbaseAuth: {
    getAccessToken: cloudbaseMocks.getAccessToken,
  },
}));

async function loadApi(baseUrl = "https://api.example.com/api") {
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

    const { callApi } = await loadApi(" https://api.example.com/api ");
    await expect(
      callApi("project.detail", { projectId: "p-1" }),
    ).resolves.toEqual({ id: "p-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api",
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

  it("演示模式下使用本地样例数据且不请求真实后端", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.stubEnv("VITE_API_BASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { callApi } = await import("./api");
    await expect(callApi("session.get")).resolves.toMatchObject({
      id: "demo-admin",
      enabled: true,
    });
    await expect(callApi("report.dashboard")).resolves.toMatchObject({
      projectCount: 3,
    });

    expect(cloudbaseMocks.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("拒绝非 HTTPS 或非法 API 地址且不读取登录令牌", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const baseUrl of [
      "http://api.example.com/zkgl",
      "javascript:alert(1)",
      "not a url",
    ]) {
      vi.resetModules();
      cloudbaseMocks.getAccessToken.mockReset();

      const { callApi } = await loadApi(baseUrl);
      await expect(callApi("project.detail", { projectId: "p-1" })).rejects.toThrow();
      expect(cloudbaseMocks.getAccessToken).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("生产 API 地址必须指向干净的 /api 入口", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const [baseUrl, message] of [
      ["https://api.example.com", "API 地址必须以 /api 结尾"],
      ["https://api.example.com/api?token=secret", "API 地址不得包含查询参数或片段"],
      ["https://api.example.com/api#fragment", "API 地址不得包含查询参数或片段"],
      ["https://user:pass@api.example.com/api", "API 地址不得包含账号或密码"],
    ] as const) {
      vi.resetModules();
      cloudbaseMocks.getAccessToken.mockReset();

      const { callApi } = await loadApi(baseUrl);
      await expect(callApi("project.detail", { projectId: "p-1" })).rejects.toThrow(
        message,
      );
      expect(cloudbaseMocks.getAccessToken).not.toHaveBeenCalled();
    }
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
  it("后端错误响应缺少标准 error.message 时返回稳定状态错误", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "token-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          requestId: "server-request-id",
        }),
      }),
    );

    const { callApi } = await loadApi();
    await expect(callApi("project.detail", { projectId: "p-2" })).rejects.toThrow(
      "请求失败：503",
    );
  });

  it("网络异常时不暴露浏览器内部英文错误", async () => {
    cloudbaseMocks.getAccessToken.mockResolvedValue({ accessToken: "token-1" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { callApi } = await loadApi();
    await expect(callApi("project.detail", { projectId: "p-2" })).rejects.toThrow(
      "网络请求失败，请检查网络后重试",
    );
  });
});

describe("openTrustedDownloadUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("只用 noopener/noreferrer 打开 HTTPS 下载地址", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { openTrustedDownloadUrl } = await loadApi();

    openTrustedDownloadUrl("https://download.example.com/file.pdf?token=1");

    expect(open).toHaveBeenCalledWith(
      "https://download.example.com/file.pdf?token=1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("拒绝非 HTTPS 或非法下载地址", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { openTrustedDownloadUrl } = await loadApi();

    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://download.example.com/file.pdf",
      "not a url",
    ]) {
      expect(() => openTrustedDownloadUrl(url)).toThrow();
    }

    expect(open).not.toHaveBeenCalled();
  });
});

describe("demoCallApi sample data", () => {
  it("returns non-empty sample lists for the visual demo module pages", async () => {
    const { demoCallApi } = await import("./demo");

    for (const action of [
      "project.application.list",
      "bid.application.list",
      "file.list",
      "report.receivables",
    ]) {
      const result = await demoCallApi<{ items: unknown[] }>(action, {});
      expect(result.items.length, `${action} should not render an empty demo table`).toBeGreaterThan(0);
    }
  });

  it("returns structured sample data for finance, settlement, and delivery dashboards", async () => {
    const { demoCallApi } = await import("./demo");

    await expect(demoCallApi("finance.summary")).resolves.toMatchObject({
      invoicedAmount: "960000.00",
      receivedAmount: "780000.00",
      paidAmount: "80000.00",
    });
    await expect(demoCallApi("delivery.records")).resolves.toMatchObject({
      stages: [expect.objectContaining({ projectName: "广州智慧园区全过程咨询" })],
      risks: [expect.objectContaining({ status: "OPEN" })],
    });
    await expect(demoCallApi("finance.operations")).resolves.toMatchObject({
      payments: [expect.objectContaining({ code: "FK-2026-001" })],
      plans: [expect.objectContaining({ code: "HZ-2026-001" })],
      settlements: [expect.objectContaining({ code: "JS-2026-001" })],
      deposits: [expect.objectContaining({ code: "BZJ-2026-001" })],
    });
  });

  it("returns project detail and report samples that keep demo pages from crashing", async () => {
    const { demoCallApi } = await import("./demo");

    await expect(demoCallApi("project.detail", { projectId: "p-001" })).resolves.toMatchObject({
      money: expect.objectContaining({ contractAmount: "3200000.00" }),
      approvalRecords: [expect.objectContaining({ instanceCode: "SP-2026-001" })],
      auditLogs: [expect.objectContaining({ outcome: "SUCCESS" })],
    });
    await expect(demoCallApi("report.analytics")).resolves.toMatchObject({
      profits: [expect.objectContaining({ projectCode: "ZK-2026-001" })],
      collection: { contractAmount: 3200000, receivedAmount: 780000 },
    });
  });

  it("uses V2.2 empty-database number prefixes in visual demo samples", async () => {
    const { demoCallApi } = await import("./demo");

    const projects = await demoCallApi<{ items: Array<{ code: string }> }>("project.list");
    const applications = await demoCallApi<{ items: Array<{ code: string }> }>(
      "project.application.list",
    );
    const counterparties = await demoCallApi<{ items: Array<{ code: string }> }>(
      "crm.counterparty.list",
    );
    const leads = await demoCallApi<{ items: Array<{ code: string }> }>("lead.list");
    const exportTasks = await demoCallApi<{ items: Array<{ taskCode: string }> }>(
      "report.exportTasks",
    );

    expect(projects.items[0]).toMatchObject({ code: "ZK-2026-001" });
    expect(applications.items[0]).toMatchObject({ code: "LA-2026-001" });
    expect(counterparties.items[0]).toMatchObject({ code: "DW-2026-001" });
    expect(leads.items[0]).toMatchObject({ code: "XS-2026-001" });
    expect(exportTasks.items[0]).toMatchObject({ taskCode: "DC-2026-001" });
    await expect(demoCallApi<{ taskCode: string }>("report.project.export")).resolves.toMatchObject({
      taskCode: "DC-DEMO",
    });
  });
});
